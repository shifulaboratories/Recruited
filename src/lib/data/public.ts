import { db } from "@/lib/db";
import { UserError } from "@/lib/data/errors";
import { upsertCandidate } from "@/lib/data/applications";
import { failedKnockouts, readQuestions, validateAnswer, WRITTEN_TYPES, type FormQuestion } from "@/lib/forms";
import { classifyOrigin, readTelemetry, styleSignals } from "@/lib/provenance";
import { secret } from "@/lib/ids";
import { accepts, acceptLabel, cleanFilename, MAX_FILE_BYTES, MAX_TOTAL_BYTES, sniffMime } from "@/lib/files";

/**
 * The two unauthenticated paths into a workspace: the apply page
 * (/apply/<listing slug>) and a screening form (/f/<form slug>?t=<token>).
 *
 * Neither takes a userId, because the person on the other end has no account.
 * The owner is resolved from the row the unguessable slug names, never from
 * anything the browser sends, and these functions return only what the page
 * shows: the job's public description and the questions. Nothing here reads
 * another applicant, a note or an answer. Treat additions with that care.
 */

export type PublicPayload = {
  name?: string;
  email?: string;
  answers: Record<string, string>;
  telemetry: Record<string, unknown>;
  recorded: boolean;
  durationMs: number;
  /** Files for "file" questions, by question id. */
  files?: Record<string, { filename: string; bytes: Uint8Array }>;
};

export async function publicListing(listingSlug: string) {
  const l = await db.listing.findUnique({
    where: { slug: listingSlug },
    include: { job: { include: { forms: { where: { kind: "APPLICATION" } } } }, user: { select: { companyName: true } } },
  });
  if (!l || l.job.archivedAt) return null;
  const open = (l.status === "LIVE" || l.status === "DRAFT") && l.job.status !== "CLOSED";
  const form = l.job.forms[0];
  return {
    open,
    preview: l.status === "DRAFT",
    company: l.user.companyName,
    title: l.title,
    body: l.body,
    job: {
      title: l.job.title,
      location: l.job.location,
      workplace: l.job.workplace,
      employmentType: l.job.employmentType,
      salaryMin: l.job.salaryMin,
      salaryMax: l.job.salaryMax,
      salaryCurrency: l.job.salaryCurrency,
      salaryPeriod: l.job.salaryPeriod,
    },
    questions: form ? readQuestions(form.questions) : [],
  };
}

function buildAnswers(questions: FormQuestion[], p: PublicPayload) {
  const errors: Record<string, string> = {};
  const files: Record<string, { filename: string; mimeType: string; size: number; data: Uint8Array<ArrayBuffer> }> = {};
  let total = 0;
  for (const q of questions) {
    if (q.type !== "file") continue;
    const f = p.files?.[q.id];
    if (!f || !f.bytes.length) continue;
    const mime = sniffMime(f.bytes);
    if (f.bytes.length > MAX_FILE_BYTES) errors[q.id] = "That file is over 10 MB. Try a smaller one or a screenshot.";
    else if (!mime || !accepts(q.accept, mime)) errors[q.id] = `Attach ${acceptLabel(q.accept)}.`;
    else {
      total += f.bytes.length;
      files[q.id] = { filename: cleanFilename(f.filename), mimeType: mime, size: f.bytes.length, data: new Uint8Array(f.bytes) };
    }
  }
  if (total > MAX_TOTAL_BYTES) errors._form = "Together the files are over 25 MB. Attach smaller ones.";
  // A file question's answer is the attached file's name.
  const answers = { ...p.answers };
  for (const q of questions) if (q.type === "file") answers[q.id] = files[q.id]?.filename ?? "";
  for (const q of questions) {
    if (errors[q.id]) continue;
    const e = validateAnswer(q, answers[q.id] ?? "");
    if (e) errors[q.id] = q.type === "file" && e === "This one is required." ? `Attach ${acceptLabel(q.accept)}.` : e;
  }
  const rows = questions.map((q) => {
    const value = (answers[q.id] ?? "").trim();
    const written = WRITTEN_TYPES.includes(q.type);
    const t = readTelemetry(p.telemetry?.[q.id]);
    const o = written ? classifyOrigin(t, value, p.recorded) : null;
    const style = written ? styleSignals(value) : { score: 0, signals: [] };
    return {
      questionId: q.id,
      label: q.label,
      value,
      origin: o?.origin ?? ("UNKNOWN" as const),
      pastedShare: o?.pastedShare ?? 0,
      telemetry: written ? { ...t, typingCps: o!.typingCps, flags: o!.flags, summary: o!.summary } : {},
      styleScore: style.score,
      styleSignals: style.signals,
      file: files[q.id],
    };
  });
  const answersById = Object.fromEntries(rows.map((r) => [r.questionId, r.value]));
  return { errors, rows, failed: failedKnockouts(questions, answersById) };
}

function answerCreate(r: ReturnType<typeof buildAnswers>["rows"][number], userId: string) {
  const { file, ...answer } = r;
  return { ...answer, userId, ...(file ? { uploads: { create: { ...file, userId } } } : {}) };
}

export class FormErrors extends UserError {
  constructor(public fields: Record<string, string>) {
    super("Some answers need another look.");
  }
}

export async function submitApplication(listingSlug: string, p: PublicPayload) {
  const l = await db.listing.findUnique({
    where: { slug: listingSlug },
    include: { job: { include: { forms: { where: { kind: "APPLICATION" } } } } },
  });
  if (!l || l.job.archivedAt) throw new UserError("This listing doesn't exist.");
  if (!((l.status === "LIVE" || l.status === "DRAFT") && l.job.status !== "CLOSED")) throw new UserError("This listing has closed.");
  const userId = l.userId;
  const form = l.job.forms[0] ?? null;
  const questions = form ? readQuestions(form.questions) : [];

  const fieldErrors: Record<string, string> = {};
  if (!p.name?.trim()) fieldErrors.name = "Your name is required.";
  if (!p.email?.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(p.email.trim())) fieldErrors.email = "Enter an email address we can reach you at.";
  const built = buildAnswers(questions, p);
  Object.assign(fieldErrors, built.errors);
  if (Object.keys(fieldErrors).length) throw new FormErrors(fieldErrors);

  const candidate = await upsertCandidate(userId, { name: p.name!, email: p.email! });
  const existing = await db.application.findUnique({ where: { jobId_candidateId: { jobId: l.jobId, candidateId: candidate.id } } });
  if (existing && !existing.archivedAt) throw new UserError("You've already applied for this role with that email address. We have your application.");

  const hasKnockouts = questions.some((q) => q.knockout);
  return db.$transaction(async (tx) => {
    const app = existing
      ? await tx.application.update({ where: { id: existing.id }, data: { archivedAt: null, stage: "NEW", listingId: l.id, qualified: hasKnockouts ? built.failed.length === 0 : null } })
      : await tx.application.create({
          data: {
            userId,
            jobId: l.jobId,
            candidateId: candidate.id,
            listingId: l.id,
            source: l.board,
            screenToken: secret("scr"),
            qualified: hasKnockouts ? built.failed.length === 0 : null,
          },
        });
    if (form) {
      await tx.submission.create({
        data: {
          userId,
          formId: form.id,
          applicationId: app.id,
          candidateId: candidate.id,
          durationMs: Math.max(0, Math.min(Math.round(p.durationMs || 0), 1e9)),
          recorded: !!p.recorded,
          failed: built.failed,
          answers: { create: built.rows.map((r) => answerCreate(r, userId)) },
        },
      });
    }
    return { applicationId: app.id };
  });
}

export async function publicScreening(formSlug: string, token: string) {
  const f = await db.form.findUnique({ where: { slug: formSlug }, include: { job: true, user: { select: { companyName: true } } } });
  if (!f || f.kind !== "SCREENING" || f.job.archivedAt) return null;
  const app = await db.application.findFirst({
    where: { screenToken: token, jobId: f.jobId, archivedAt: null },
    include: { candidate: { select: { name: true } }, submissions: { where: { formId: f.id }, select: { id: true } } },
  });
  if (!app) return null;
  return {
    company: f.user.companyName,
    jobTitle: f.job.title,
    formName: f.name,
    firstName: app.candidate.name.split(/\s+/)[0],
    done: app.submissions.length > 0,
    questions: readQuestions(f.questions),
  };
}

export async function submitScreening(formSlug: string, token: string, p: PublicPayload) {
  const f = await db.form.findUnique({ where: { slug: formSlug }, include: { job: true } });
  if (!f || f.kind !== "SCREENING" || f.job.archivedAt) throw new UserError("This form doesn't exist.");
  const app = await db.application.findFirst({ where: { screenToken: token, jobId: f.jobId, archivedAt: null } });
  if (!app) throw new UserError("This link isn't valid any more.");
  const done = await db.submission.findFirst({ where: { formId: f.id, applicationId: app.id } });
  if (done) throw new UserError("You've already sent this form. Thank you.");
  const questions = readQuestions(f.questions);
  const built = buildAnswers(questions, p);
  if (Object.keys(built.errors).length) throw new FormErrors(built.errors);
  const hasKnockouts = questions.some((q) => q.knockout);
  await db.$transaction(async (tx) => {
    await tx.submission.create({
      data: {
        userId: f.userId,
        formId: f.id,
        applicationId: app.id,
        candidateId: app.candidateId,
        durationMs: Math.max(0, Math.min(Math.round(p.durationMs || 0), 1e9)),
        recorded: !!p.recorded,
        failed: built.failed,
        answers: { create: built.rows.map((r) => answerCreate(r, f.userId)) },
      },
    });
    if (hasKnockouts) {
      const qualified = built.failed.length === 0 && app.qualified !== false;
      await tx.application.update({ where: { id: app.id }, data: { qualified } });
    }
  });
  return { ok: true };
}
