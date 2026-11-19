import type { MessageStatus } from "@prisma/client";
import { db } from "@/lib/db";
import { notFound, UserError } from "@/lib/data/errors";
import { requireApplication, screeningPath } from "@/lib/data/applications";
import { readQuestions } from "@/lib/forms";
import { KIND_GUIDANCE, MESSAGE_KINDS, mailtoLink, type MessageKindName } from "@/lib/messages";
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
