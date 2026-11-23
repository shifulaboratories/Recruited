import type { MessageStatus } from "@prisma/client";
import { db } from "@/lib/db";
import { notFound, UserError } from "@/lib/data/errors";
import { requireApplication, screeningPath } from "@/lib/data/applications";
import { readQuestions } from "@/lib/forms";
import { BULK_KINDS, BULK_LIMIT, KIND_GUIDANCE, MESSAGE_KINDS, mailtoLink, renderReceipt, unknownPlaceholders, type MessageKindName } from "@/lib/messages";
import { formatOfferPay } from "@/lib/scorecards";
import { bookingPath } from "@/lib/data/interviews";
import { statusPath } from "@/lib/applicant-status";

/**
 * Messages to applicants: drafts, and a record of what was sent. Sending from
 * the person's mailbox lives in mailbox.ts. userId first everywhere; reads go through
 * requireApplication, which excludes archived applications and jobs.
 */

/** The kinds a person or an assistant writes. RECEIPT is written only by the receipt itself. */
function checkKind(kind: string): MessageKindName {
  if (!(MESSAGE_KINDS as readonly string[]).includes(kind)) throw new UserError(`kind is one of ${MESSAGE_KINDS.join(", ")}.`);
  return kind as MessageKindName;
}

/**
 * Everything needed to write one message to one applicant: who they are, the
 * role, where they stand, their personal screening links, what they've been
 * sent before, and how this kind of message should be written.
 */
export async function prepMessage(userId: string, applicationId: string, kind: string, baseUrl: string) {
  const k = checkKind(kind);
  const a = await requireApplication(userId, applicationId);
  const full = await db.application.findFirst({
    where: { id: a.id, userId },
    include: {
      candidate: { select: { name: true, email: true } },
      job: { select: { title: true, forms: { where: { kind: "SCREENING" }, select: { id: true, name: true, slug: true, questions: true } } } },
      user: { select: { name: true, companyName: true, email: true } },
      submissions: { select: { formId: true } },
      messages: { orderBy: { createdAt: "asc" }, select: { kind: true, status: true, subject: true, sentAt: true, createdAt: true } },
      interviews: {
        where: { status: "SCHEDULED" },
        orderBy: { round: "asc" },
        select: { id: true, round: true, title: true, format: true, scheduledAt: true, durationMin: true, interviewers: true, location: true, slots: true, bookToken: true },
      },
      offers: { orderBy: { version: "desc" }, take: 1 },
    },
  });
  if (!full) notFound("application");
  const done = new Set(full.submissions.map((s) => s.formId));
  return {
    to: { name: full.candidate.name, firstName: full.candidate.name.split(/\s+/)[0], email: full.candidate.email },
    from: { name: full.user.name, company: full.user.companyName },
    job: full.job.title,
    stage: full.stage,
    tier: full.tier ?? full.proposedTier,
    screeningForms: full.job.forms.map((f) => {
      const qs = readQuestions(f.questions);
      return {
        formId: f.id,
        name: f.name,
        link: `${baseUrl}${screeningPath(full.screenToken, f.slug)}`,
        alreadyFilledIn: done.has(f.id),
        questions: qs.length,
        asksForFiles: qs.filter((q) => q.type === "file" || q.type === "video").map((q) => q.label),
      };
    }),
    /** Their own status page. Personal: it goes to this applicant only. */
    statusPage: `${baseUrl}${statusPath(full.screenToken)}`,
    previous: full.messages,
    /** Scheduled interviews: the only times and people an interview invite may name. */
    interviews: full.interviews.map(({ bookToken, slots, ...i }) => ({
      ...i,
      /** Times offered for them to pick, when no time is fixed: send bookingLink and let them choose; don't list the times as fixed. */
      offeredTimes: i.scheduledAt ? [] : slots,
      bookingLink: bookToken && slots.length && !i.scheduledAt ? `${baseUrl}${bookingPath(bookToken)}` : null,
    })),
    /** The latest offer version: the only terms an offer message may state. Null when none is recorded. */
    offer: full.offers[0]
      ? (({ userId: _u, applicationId: _a, ...o }) => ({ ...o, pay: formatOfferPay(o) }))(full.offers[0])
      : null,
    kind: k,
    guidance: KIND_GUIDANCE[k],
  };
}

export async function saveMessage(
  userId: string,
  input: { applicationId: string; kind: string; subject?: string; body: string; status?: MessageStatus; writtenBy: "app" | "mcp" },
) {
  const a = await requireApplication(userId, input.applicationId);
  if (!input.body.trim()) throw new UserError("The message is empty.");
  const status = input.status ?? "DRAFT";
  return db.message.create({
    data: {
      userId,
      applicationId: a.id,
      kind: checkKind(input.kind),
      status,
      subject: (input.subject ?? "").trim(),
      body: input.body.trim(),
      writtenBy: input.writtenBy,
      sentAt: status === "SENT" ? new Date() : null,
    },
  });
}

/**
 * One message to several applicants: a draft each, with {first_name}, {job},
 * {company}, {sender} and {status_link} filled in per person. Saves nothing on
 * a dry run, which returns the first one filled in and who it would go to.
 * Skips anyone who already has an unsent draft of the same kind, so running it
 * twice doesn't double up. Sends nothing: sending is send_message's, after a yes.
 */
export async function draftMany(
  userId: string,
  input: { applicationIds: string[]; kind: string; subject?: string; body: string; dryRun?: boolean; writtenBy: "app" | "mcp"; baseUrl: string },
) {
  const kind = checkKind(input.kind);
  if (!(BULK_KINDS as readonly string[]).includes(kind)) throw new UserError("An offer states one person's terms, so it's written one at a time: prep_message, then save_message.");
  const ids = Array.from(new Set(input.applicationIds.filter(Boolean)));
  if (!ids.length) throw new UserError("Name at least one application.");
  if (ids.length > BULK_LIMIT) throw new UserError(`Write to at most ${BULK_LIMIT} applicants at a time.`);
  const subject = (input.subject ?? "").trim();
  const body = input.body.trim();
  if (!body) throw new UserError("The message is empty.");
  if (body.length > 5000) throw new UserError("Keep the message under 5000 characters.");
  const unknown = unknownPlaceholders(`${subject}\n${body}`);
  if (unknown.length)
    throw new UserError(
      `${unknown.map((k) => `{${k}}`).join(", ")} can't be filled in for each person; only {first_name}, {job}, {company}, {sender}, {status_link} and {screening_link} can. Write the rest out, or message them one at a time.`,
    );
  const wantsScreening = /\{screening_link\}/.test(`${subject}\n${body}`);
  const apps = await db.application.findMany({
    where: { id: { in: ids }, userId, archivedAt: null, job: { archivedAt: null } },
    select: {
      id: true,
      screenToken: true,
      candidate: { select: { name: true, email: true } },
      job: { select: { title: true, forms: { where: { kind: "SCREENING" }, select: { slug: true } } } },
      messages: { where: { kind, status: "DRAFT" }, select: { id: true } },
    },
  });
  if (apps.length !== ids.length) notFound("application");
  apps.sort((x, y) => ids.indexOf(x.id) - ids.indexOf(y.id));
  if (wantsScreening)
    for (const a of apps)
      if (a.job.forms.length !== 1)
        throw new UserError(
          a.job.forms.length
            ? `${a.job.title} has ${a.job.forms.length} screening forms, so {screening_link} can't tell which. Message those applicants one at a time with prep_message.`
            : `${a.job.title} has no screening form, so there's no {screening_link} to send. Make one with create_form first.`,
        );
  const owner = await db.user.findUniqueOrThrow({ where: { id: userId }, select: { name: true, companyName: true, mailbox: { select: { fromName: true } } } });
  const company = owner.companyName || "our company";
  const fill = (a: (typeof apps)[number], t: string) =>
    renderReceipt(wantsScreening ? t.replaceAll("{screening_link}", `${input.baseUrl}${screeningPath(a.screenToken, a.job.forms[0].slug)}`) : t, {
      first_name: a.candidate.name.trim().split(/\s+/)[0] || "there",
      job: a.job.title,
      company,
      sender: owner.mailbox?.fromName || owner.name || company,
      status_link: `${input.baseUrl}${statusPath(a.screenToken)}`,
    });
  const skipped = apps.filter((a) => a.messages.length).map((a) => ({ applicationId: a.id, name: a.candidate.name, why: "already has an unsent draft of this kind" }));
  const todo = apps.filter((a) => !a.messages.length);
  const preview = todo[0] ? { to: todo[0].candidate.name, subject: fill(todo[0], subject), body: fill(todo[0], body) } : null;
  const who = todo.map((a) => ({ applicationId: a.id, name: a.candidate.name, email: a.candidate.email }));
  if (input.dryRun) return { dryRun: true as const, wouldDraft: who.length, applicants: who, skipped, preview };
  const saved = await db.$transaction(
    todo.map((a) =>
      db.message.create({
        data: { userId, applicationId: a.id, kind, status: "DRAFT", subject: fill(a, subject), body: fill(a, body), writtenBy: input.writtenBy },
        select: { id: true, applicationId: true },
      }),
    ),
  );
  const byApp = new Map(saved.map((m) => [m.applicationId, m.id]));
  return { dryRun: false as const, drafted: saved.length, applicants: who.map((w) => ({ ...w, messageId: byApp.get(w.applicationId)! })), skipped, preview };
}

async function requireMessage(userId: string, messageId: string) {
  const m = await db.message.findFirst({
    where: { id: messageId, userId, application: { archivedAt: null, job: { archivedAt: null } } },
  });
  if (!m) notFound("message");
  return m;
}

/** Change a draft's words, or mark it sent. A sent message can't be edited: it is the record. */
export async function updateMessage(userId: string, messageId: string, input: { subject?: string; body?: string; status?: MessageStatus }) {
  const m = await requireMessage(userId, messageId);
  if (m.status === "SENT" && (input.subject !== undefined || input.body !== undefined))
    throw new UserError("That message was already sent, so it stays as it was. Save a new one instead.");
  if (m.status === "SENT" && input.status === "DRAFT") throw new UserError("That message was already sent; it can't go back to being a draft.");
  if (input.body !== undefined && !input.body.trim()) throw new UserError("The message is empty.");
  return db.message.update({
    where: { id: m.id },
    data: {
      ...(input.subject !== undefined ? { subject: input.subject.trim() } : {}),
      ...(input.body !== undefined ? { body: input.body.trim() } : {}),
      ...(input.status ? { status: input.status, sentAt: input.status === "SENT" ? (m.sentAt ?? new Date()) : null } : {}),
    },
  });
}

/** Drafts can be thrown away; sent messages are the record and stay. */
export async function deleteDraft(userId: string, messageId: string) {
  const m = await requireMessage(userId, messageId);
  if (m.status === "SENT") throw new UserError("Sent messages stay in the record.");
  await db.message.delete({ where: { id: m.id } });
}

export async function listMessages(userId: string, applicationId: string) {
  const a = await requireApplication(userId, applicationId);
  const rows = await db.message.findMany({
    where: { userId, applicationId: a.id },
    orderBy: { createdAt: "asc" },
    include: { application: { select: { candidate: { select: { email: true } } } } },
  });
  return rows.map(({ application, ...m }) => ({ ...m, mailto: mailtoLink(application.candidate.email, m.subject, m.body) }));
}
