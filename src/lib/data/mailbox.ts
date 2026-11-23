import { db } from "@/lib/db";
import { notFound, UserError } from "@/lib/data/errors";
import { recordError } from "@/lib/data/system";
import { SECURITY, sendSmtp, smtpReason, verifySmtp, type SmtpConfig } from "@/lib/smtp";
import { BULK_LIMIT, DEFAULT_RECEIPT_BODY, DEFAULT_RECEIPT_SUBJECT, renderReceipt } from "@/lib/messages";
import { statusPath } from "@/lib/applicant-status";

/**
 * The person's own mailbox, and the only way mail leaves this server.
 *
 * What it will not do matters more than what it does:
 *
 * - IT SENDS FROM THE PERSON'S OWN ADDRESS, over their own SMTP, never as the
 *   instance. An applicant replies to a person they can see.
 * - IT ONLY WRITES TO AN APPLICANT ON FILE. The address is read off the
 *   Candidate row; no argument anywhere takes an address.
 * - ONE MESSAGE GOES OUT BY ITSELF: the application receipt, which states that
 *   an application arrived and promises nothing. Everything else is a draft
 *   that goes out only through sendMessage, which a tool reaches only after
 *   the person has seen the draft and said send, and the description says so.
 * - THERE IS A CEILING: DAILY_LIMIT sends a day per workspace, receipts
 *   included, so a loop in an assistant can't empty a list of applicants into
 *   someone's outbox.
 *
 * The password is stored as the person typed it (the server needs it to sign
 * in) and is never returned by any read, tool or page.
 */

export const DAILY_LIMIT = 150;

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function view(m: Awaited<ReturnType<typeof db.mailbox.findUnique>>, sentLast24h: number) {
  const base = { dailyLimit: DAILY_LIMIT, sentLast24h, defaultReceipt: { subject: DEFAULT_RECEIPT_SUBJECT, body: DEFAULT_RECEIPT_BODY } };
  if (!m) return { connected: false as const, ...base };
  return {
    connected: true as const,
    host: m.host,
    port: m.port,
    security: m.security,
    username: m.username,
    fromEmail: m.fromEmail,
    fromName: m.fromName,
    verifiedAt: m.verifiedAt,
    receipt: { on: m.receiptOn, subject: m.receiptSubject, body: m.receiptBody },
    ...base,
  };
}

async function sentLast24h(userId: string) {
  return db.message.count({ where: { userId, sentVia: "mailbox", sentAt: { gte: new Date(Date.now() - 86400_000) } } });
}

/** The mailbox's settings without its password, plus how many sends are left today. */
export async function getMailbox(userId: string) {
  const [m, sent] = await Promise.all([db.mailbox.findUnique({ where: { userId } }), sentLast24h(userId)]);
  return view(m, sent);
}

/**
 * Connect or change the mailbox. Signs in to the server first and saves
 * nothing if that fails, so a saved mailbox is one that worked. Leave the
 * password empty to keep the saved one.
 */
export async function connectMailbox(
  userId: string,
  input: { host: string; port?: number; security?: string; username: string; password?: string; fromEmail: string; fromName?: string; siteUrl?: string },
) {
  const existing = await db.mailbox.findUnique({ where: { userId } });
  const host = input.host.trim().toLowerCase();
  if (!host || /\s|\//.test(host)) throw new UserError("host is the mail server's name, such as smtp.gmail.com.");
  const security = (input.security ?? existing?.security ?? "starttls").trim();
  if (!(SECURITY as readonly string[]).includes(security)) throw new UserError(`security is one of ${SECURITY.join(", ")}.`);
  const port = input.port ?? (security === "tls" ? 465 : 587);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new UserError("port is a whole number, usually 587 or 465.");
  const username = input.username.trim();
  const password = input.password ? input.password : (existing?.password ?? "");
  if (!username || !password) throw new UserError("Both the username and the password are needed. For Gmail and Microsoft 365 that's your address and an app password.");
  const fromEmail = input.fromEmail.trim().toLowerCase();
  if (!EMAIL.test(fromEmail)) throw new UserError("fromEmail is the address applicants will see and reply to.");
  const fromName = (input.fromName ?? existing?.fromName ?? "").trim().slice(0, 120);

  const config: SmtpConfig = { host, port, security, username, password };
  try {
    await verifySmtp(config);
  } catch (e) {
    throw new UserError(`Nothing was saved: the mail server at ${host}:${port} said ${smtpReason(e)}.`);
  }
  const data = { host, port, security, username, password, fromEmail, fromName, verifiedAt: new Date(), ...siteUrlData(input.siteUrl) };
  const m = await db.mailbox.upsert({ where: { userId }, create: { userId, ...data }, update: data });
  return view(m, await sentLast24h(userId));
}

/**
 * The address links in mail point at, recorded whenever the signed-in person
 * saves mailbox settings. An applicant's request never sets it: its Host
 * header is theirs to forge, and a receipt is mail from the person's account.
 */
function siteUrlData(siteUrl: string | undefined) {
  if (!siteUrl) return {};
  try {
    const u = new URL(siteUrl);
    return /^https?:$/.test(u.protocol) ? { siteUrl: u.origin } : {};
  } catch {
    return {};
  }
}

export async function disconnectMailbox(userId: string) {
  await db.mailbox.deleteMany({ where: { userId } });
  return view(null, await sentLast24h(userId));
}

/** Turn the receipt on or off, or change its words. Empty words go back to the built-in ones. */
export async function setReceipt(userId: string, input: { on?: boolean; subject?: string; body?: string; siteUrl?: string }) {
  const m = await db.mailbox.findUnique({ where: { userId } });
  if (!m) throw new UserError("Connect a mailbox first; the receipt goes out from it.");
  const subject = input.subject?.trim().slice(0, 200);
  const body = input.body?.trim().slice(0, 4000);
  const saved = await db.mailbox.update({
    where: { userId },
    data: {
      ...(input.on !== undefined ? { receiptOn: input.on } : {}),
      ...(subject !== undefined ? { receiptSubject: subject } : {}),
      ...(body !== undefined ? { receiptBody: body } : {}),
      ...siteUrlData(input.siteUrl),
    },
  });
  return view(saved, await sentLast24h(userId));
}

async function deliver(userId: string, mailbox: NonNullable<Awaited<ReturnType<typeof db.mailbox.findUnique>>>, messageId: string) {
  const m = await db.message.findFirst({
    where: { id: messageId, userId },
    include: { application: { select: { candidate: { select: { name: true, email: true } } } } },
  });
  if (!m) notFound("message");
  const to = m.application.candidate;
  try {
    await sendSmtp(mailbox, {
      fromEmail: mailbox.fromEmail,
      fromName: mailbox.fromName,
      to: to.email,
      toName: to.name,
      subject: m.subject || "(no subject)",
      text: m.body,
    });
  } catch (e) {
    const reason = smtpReason(e);
    await db.message.update({ where: { id: m.id }, data: { sendError: reason } });
    throw new UserError(`Not sent: your mail server said ${reason}. The draft is still there.`);
  }
  return db.message.update({ where: { id: m.id }, data: { status: "SENT", sentVia: "mailbox", sentAt: new Date(), sendError: "" } });
}

/**
 * Send one draft from the person's mailbox. Call only after they have seen
 * this draft and said send: this is the step that can't be taken back.
 */
export async function sendMessage(userId: string, messageId: string) {
  const m = await db.message.findFirst({ where: { id: messageId, userId, application: { archivedAt: null, job: { archivedAt: null } } } });
  if (!m) notFound("message");
  if (m.status === "SENT") throw new UserError("That message was already sent.");
  if (!m.body.trim()) throw new UserError("The message is empty.");
  const mailbox = await db.mailbox.findUnique({ where: { userId } });
  if (!mailbox) throw new UserError("No mailbox is connected, so nothing can be sent from here. Connect one in Settings, or send from your own email and mark the message sent.");
  if ((await sentLast24h(userId)) >= DAILY_LIMIT) throw new UserError(`That's ${DAILY_LIMIT} sent in the last 24 hours, the most this workspace sends in a day. The draft is kept; send it later.`);
  return deliver(userId, mailbox, m.id);
}

/**
 * Send several drafts the person approved as a batch. Checks the daily limit
 * for the whole batch first, then sends one at a time; one that fails (already
 * sent, or the server refused it) is reported and the rest still go.
 */
export async function sendMany(userId: string, messageIds: string[]) {
  const ids = Array.from(new Set(messageIds.filter(Boolean)));
  if (!ids.length) throw new UserError("Name at least one draft.");
  if (ids.length > BULK_LIMIT) throw new UserError(`Send at most ${BULK_LIMIT} at a time.`);
  const found = await db.message.count({ where: { id: { in: ids }, userId, application: { archivedAt: null, job: { archivedAt: null } } } });
  if (found !== ids.length) notFound("message");
  const mailbox = await db.mailbox.findUnique({ where: { userId } });
  if (!mailbox) throw new UserError("No mailbox is connected, so nothing can be sent from here. Connect one in Settings, or send from your own email and mark the messages sent.");
  const left = DAILY_LIMIT - (await sentLast24h(userId));
  if (ids.length > left) throw new UserError(`That's ${ids.length} to send and ${Math.max(left, 0)} left of today's ${DAILY_LIMIT}. Nothing was sent; send fewer, or the rest tomorrow.`);
  const results: { id: string; sent: boolean; error?: string }[] = [];
  for (const id of ids) {
    try {
      const m = await db.message.findFirst({ where: { id, userId }, select: { status: true, body: true } });
      if (m?.status === "SENT") throw new UserError("Already sent.");
      if (!m?.body.trim()) throw new UserError("The message is empty.");
      await deliver(userId, mailbox, id);
      results.push({ id, sent: true });
    } catch (e) {
      if (!(e instanceof UserError)) throw e;
      results.push({ id, sent: false, error: e.message });
    }
  }
  return { sent: results.filter((r) => r.sent).length, failed: results.filter((r) => !r.sent).length, results };
}

/**
 * The application receipt, after someone applies through an apply link. Never
 * throws: a mail problem must not reach the applicant, who already applied. A
 * receipt that couldn't go stays as a draft with the reason, where the daily
 * brief and the applicant's page show it.
 */
export async function sendReceipt(userId: string, applicationId: string) {
  try {
    const mailbox = await db.mailbox.findUnique({ where: { userId } });
    if (!mailbox?.receiptOn) return null;
    const a = await db.application.findFirst({
      where: { id: applicationId, userId, archivedAt: null, job: { archivedAt: null } },
      include: { candidate: { select: { name: true } }, job: { select: { title: true } }, user: { select: { name: true, companyName: true } } },
    });
    if (!a) return null;
    if (await db.message.findFirst({ where: { userId, applicationId: a.id, kind: "RECEIPT" }, select: { id: true } })) return null;
    const company = a.user.companyName || "our company";
    const vars = {
      first_name: a.candidate.name.trim().split(/\s+/)[0] || "there",
      job: a.job.title,
      company,
      sender: mailbox.fromName || a.user.name || company,
      status_link: mailbox.siteUrl ? `${mailbox.siteUrl}${statusPath(a.screenToken)}` : "",
    };
    const message = await db.message.create({
      data: {
        userId,
        applicationId: a.id,
        kind: "RECEIPT",
        subject: renderReceipt(mailbox.receiptSubject || DEFAULT_RECEIPT_SUBJECT, vars),
        body: renderReceipt(mailbox.receiptBody || DEFAULT_RECEIPT_BODY, vars),
        writtenBy: "app",
      },
    });
    if ((await sentLast24h(userId)) >= DAILY_LIMIT) {
      await db.message.update({ where: { id: message.id }, data: { sendError: `Held: ${DAILY_LIMIT} already sent in the last 24 hours.` } });
      return message;
    }
    try {
      return await deliver(userId, mailbox, message.id);
    } catch {
      return db.message.findUnique({ where: { id: message.id } });
    }
  } catch (e) {
    await recordError("receipt", e);
    return null;
  }
}
