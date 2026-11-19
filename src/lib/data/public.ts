import { db } from "@/lib/db";
import { UserError } from "@/lib/data/errors";
import { upsertCandidate } from "@/lib/data/applications";
import { failedKnockouts, FILE_TYPES, readQuestions, validateAnswer, WRITTEN_TYPES, type FormQuestion } from "@/lib/forms";
import { classifyOrigin, readTelemetry, styleSignals } from "@/lib/provenance";
import { secret } from "@/lib/ids";
import { checkReferenceAnswers, REFERENCE_QUESTIONS } from "@/lib/references";
import { accepts, acceptLabel, cleanFilename, isVideo, MAX_FILE_BYTES, MAX_TOTAL_BYTES, MAX_VIDEO_BYTES, sniffMime } from "@/lib/files";

/**
 * The unauthenticated paths into a workspace: the apply page
 * (/apply/<listing slug>), a screening form (/f/<form slug>?t=<token>), a
 * reference check (/ref/<token>), a booking page (/book/<token>) and a shared
 * applicant (/s/<slug>).
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
    include: {
      job: { include: { forms: { where: { kind: "APPLICATION" } } } },
      user: { select: { companyName: true, companyAbout: true, companyWebsite: true } },
    },
  });
  if (!l || l.job.archivedAt) return null;
  const open = (l.status === "LIVE" || l.status === "DRAFT") && l.job.status !== "CLOSED";
  const form = l.job.forms[0];
  return {
    open,
    preview: l.status === "DRAFT",
    /** Only a LIVE careers listing is meant for search engines; every other apply link is unlisted. */
    indexable: open && l.board === "careers" && l.status === "LIVE",
    postedAt: l.postedAt ?? l.createdAt,
    company: l.user.companyName,
    companyAbout: l.user.companyAbout,
    companyWebsite: l.user.companyWebsite,
    afterApply: l.job.afterApply,
    board: l.board,
    title: l.title,
    body: l.body,
    job: {
      title: l.job.title,
      location: l.job.location,
      workplace: l.job.workplace,
      employmentType: l.job.employmentType,
      team: l.job.team,
      salaryMin: l.job.salaryMin,
      salaryMax: l.job.salaryMax,
      salaryCurrency: l.job.salaryCurrency,
      salaryPeriod: l.job.salaryPeriod,
    },
    questions: form ? readQuestions(form.questions) : [],
  };
}

export function careersPath(careersSlug: string) {
  return `/careers/${careersSlug}`;
}

/**
 * A company's careers page: every open, unarchived job that has a LIVE
 * listing on the careers board, linked to that listing's apply page. Public,
 * by the slug the owner chose. It shows the company's own lines and the jobs'
 * public facts, nothing else.
 */
export async function publicCareers(careersSlug: string) {
  const u = await db.user.findUnique({
    where: { careersSlug },
    select: { id: true, companyName: true, companyAbout: true, companyWebsite: true },
  });
  if (!u) return null;
  const jobs = await db.job.findMany({
    where: { userId: u.id, archivedAt: null, status: "OPEN", listings: { some: { board: "careers", status: "LIVE" } } },
    orderBy: { createdAt: "desc" },
    include: { listings: { where: { board: "careers", status: "LIVE" }, orderBy: { variant: "asc" }, take: 1, select: { slug: true, title: true } } },
  });
  return {
    company: u.companyName,
    companyAbout: u.companyAbout,
    companyWebsite: u.companyWebsite,
    jobs: jobs.map((j) => ({
      title: j.listings[0]!.title,
      team: j.team,
      location: j.location,
      workplace: j.workplace,
      employmentType: j.employmentType,
      salaryMin: j.salaryMin,
      salaryMax: j.salaryMax,
      salaryCurrency: j.salaryCurrency,
      salaryPeriod: j.salaryPeriod,
      applyPath: `/apply/${j.listings[0]!.slug}`,
    })),
  };
}

function buildAnswers(questions: FormQuestion[], p: PublicPayload) {
  const errors: Record<string, string> = {};
  const files: Record<string, { filename: string; mimeType: string; size: number; data: Uint8Array<ArrayBuffer> }> = {};
  let total = 0;
  for (const q of questions) {
    if (!FILE_TYPES.includes(q.type)) continue;
    const f = p.files?.[q.id];
    if (!f || !f.bytes.length) continue;
    const mime = sniffMime(f.bytes);
    const video = q.type === "video";
    if (f.bytes.length > (video ? MAX_VIDEO_BYTES : MAX_FILE_BYTES))
      errors[q.id] = video ? "That video is over 40 MB. Record a shorter one." : "That file is over 10 MB. Try a smaller one or a screenshot.";
    else if (!mime || (video ? !isVideo(mime) : !accepts(q.accept, mime))) errors[q.id] = video ? "Record a video here, or attach a WebM or MP4." : `Attach ${acceptLabel(q.accept)}.`;
    else {
      total += f.bytes.length;
      files[q.id] = { filename: cleanFilename(f.filename), mimeType: mime, size: f.bytes.length, data: new Uint8Array(f.bytes) };
    }
  }
  if (total > MAX_TOTAL_BYTES) errors._form = "Together the files are over 60 MB. Attach smaller ones.";
  // A file question's answer is the attached file's name.
  const answers = { ...p.answers };
  for (const q of questions) if (FILE_TYPES.includes(q.type)) answers[q.id] = files[q.id]?.filename ?? "";
  for (const q of questions) {
    if (errors[q.id]) continue;
    const e = validateAnswer(q, answers[q.id] ?? "");
    if (e) errors[q.id] = q.type === "video" && e === "This one is required." ? "Record a short video to answer this one." : q.type === "file" && e === "This one is required." ? `Attach ${acceptLabel(q.accept)}.` : e;
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
    return { applicationId: app.id, userId };
  });
}

export async function publicScreening(formSlug: string, token: string) {
  const f = await db.form.findUnique({ where: { slug: formSlug }, include: { job: true, user: { select: { companyName: true, companyWebsite: true } } } });
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
    afterApply: f.job.afterApply,
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

// ---------------------------------------------------------------------------
// Reference checks: /ref/<token>. The token names one Reference row; the page
// shows only the applicant's first name, the job and the company.
// ---------------------------------------------------------------------------

export async function publicReference(token: string) {
  const r = await db.reference.findUnique({
    where: { token },
    include: {
      application: { select: { archivedAt: true, candidate: { select: { name: true } }, job: { select: { title: true, archivedAt: true } } } },
      user: { select: { companyName: true } },
    },
  });
  if (!r || r.application.archivedAt || r.application.job.archivedAt) return null;
  return {
    referee: r.name.split(/\s+/)[0],
    candidate: r.application.candidate.name,
    job: r.application.job.title,
    company: r.user.companyName,
    done: !!r.submittedAt,
    questions: REFERENCE_QUESTIONS.map((q) => ({ id: q.id, label: q.label, required: q.id !== "growth" })),
  };
}

export async function submitReference(token: string, answers: Record<string, string>) {
  const r = await db.reference.findUnique({ where: { token }, include: { application: { select: { archivedAt: true } } } });
  if (!r || r.application.archivedAt) throw new UserError("This link isn't valid any more.");
  if (r.submittedAt) throw new UserError("You've already answered. Thank you.");
  const checked = checkReferenceAnswers(answers);
  if (Object.keys(checked.errors).length) throw new FormErrors(checked.errors);
  await db.reference.update({ where: { id: r.id }, data: { answers: checked.answers, submittedAt: new Date() } });
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Self-booking: /book/<token>. The token names one Interview; the page shows
// the times on offer, what the conversation is and with whom.
// ---------------------------------------------------------------------------

export async function publicBooking(token: string) {
  const i = await db.interview.findUnique({
    where: { bookToken: token },
    include: {
      application: { select: { archivedAt: true, candidate: { select: { name: true } }, job: { select: { title: true, archivedAt: true } } } },
      user: { select: { companyName: true } },
    },
  });
  if (!i || i.application.archivedAt || i.application.job.archivedAt || i.status !== "SCHEDULED") return null;
  const now = Date.now();
  return {
    firstName: i.application.candidate.name.split(/\s+/)[0],
    job: i.application.job.title,
    company: i.user.companyName,
    title: i.title,
    format: i.format,
    durationMin: i.durationMin,
    interviewers: i.interviewers,
    booked: i.scheduledAt,
    slots: i.slots.filter((s) => s.getTime() > now).map((s) => s.toISOString()),
  };
}

export async function bookSlot(token: string, slot: string) {
  const i = await db.interview.findUnique({ where: { bookToken: token }, include: { application: { select: { archivedAt: true } } } });
  if (!i || i.application.archivedAt || i.status !== "SCHEDULED") throw new UserError("This booking link isn't valid any more.");
  if (i.scheduledAt) throw new UserError("You've already picked a time. If you need to change it, reply to the email you got this link in.");
  const t = new Date(slot).getTime();
  const pick = i.slots.find((s) => s.getTime() === t);
  if (!pick) throw new UserError("That time isn't on offer any more. Pick another.");
  if (pick.getTime() < Date.now()) throw new UserError("That time has passed. Pick another.");
  // Clearing the slots in the same write means a second pick, even a racing one, finds none.
  const r = await db.interview.updateMany({ where: { id: i.id, scheduledAt: null }, data: { scheduledAt: pick, slots: [] } });
  if (!r.count) throw new UserError("You've already picked a time.");
  return { scheduledAt: pick.toISOString() };
}

// ---------------------------------------------------------------------------
// A shared applicant: /s/<slug>. Read-only, for someone without an account.
// No email, phone, notes, messages or files: the answers, how they arrived,
// the tier and the scorecards.
// ---------------------------------------------------------------------------

export async function publicShared(shareSlug: string) {
  const a = await db.application.findUnique({
    where: { shareSlug },
    include: {
      candidate: { select: { name: true, links: true } },
      job: { select: { title: true, archivedAt: true, rubric: true } },
      user: { select: { companyName: true } },
      listing: { select: { board: true } },
      submissions: {
        orderBy: { createdAt: "asc" },
        include: { form: { select: { name: true, kind: true } }, answers: { select: { questionId: true, label: true, value: true, origin: true, pastedShare: true, telemetry: true, styleScore: true } } },
      },
      interviews: { orderBy: { round: "asc" }, include: { scorecards: { select: { interviewer: true, recommendation: true, summary: true } } } },
    },
  });
  if (!a || a.archivedAt || a.job.archivedAt) return null;
  return {
    name: a.candidate.name,
    links: a.candidate.links,
    job: a.job.title,
    company: a.user.companyName,
    stage: a.stage,
    tier: a.tier ?? a.proposedTier,
    tierIsProposal: !a.tier && !!a.proposedTier,
    tierReason: a.tier ? a.tierReason : a.proposedReason,
    qualified: a.qualified,
    source: a.listing?.board ?? a.source,
    appliedAt: a.createdAt,
    submissions: a.submissions.map((s) => ({
      form: s.form.name,
      at: s.createdAt,
      answers: s.answers.map((x) => ({
        question: x.label,
        answer: x.value,
        written: !!x.telemetry && typeof x.telemetry === "object" && Object.keys(x.telemetry as object).length > 0,
        origin: x.origin,
        pastedShare: x.pastedShare,
        summary: (x.telemetry as { summary?: string })?.summary ?? "",
        likelyAi: x.styleScore >= 0.5,
      })),
    })),
    interviews: a.interviews.map((i) => ({ title: i.title, at: i.scheduledAt, status: i.status, scorecards: i.scorecards })),
  };
}
