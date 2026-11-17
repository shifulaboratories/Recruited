import type { Origin, Prisma, Stage } from "@prisma/client";
import { db } from "@/lib/db";
import { notFound, UserError } from "@/lib/data/errors";
import { requireJob } from "@/lib/data/jobs";
import { secret } from "@/lib/ids";
import { styleLabel } from "@/lib/provenance";

/**
 * Candidates, applications, stages and notes. userId first everywhere.
 * Applications carry archivedAt; every read excludes archived rows.
 */

export const STAGES: Stage[] = ["NEW", "SCREEN", "INTERVIEW", "OFFER", "HIRED", "REJECTED"];

export function screeningPath(screenToken: string, formSlug: string) {
  return `/f/${formSlug}?t=${encodeURIComponent(screenToken)}`;
}

/** Find a candidate by email in this workspace, or create them. */
export async function upsertCandidate(
  userId: string,
  input: { name: string; email: string; phone?: string; links?: string[] },
) {
  const email = input.email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new UserError("That email address doesn't look right.");
  const name = input.name.trim();
  if (!name) throw new UserError("A candidate needs a name.");
  const existing = await db.candidate.findUnique({ where: { userId_email: { userId, email } } });
  if (existing) {
    const links = Array.from(new Set([...existing.links, ...(input.links ?? [])]));
    return db.candidate.update({
      where: { id: existing.id },
      data: { name, links, ...(input.phone ? { phone: input.phone } : {}) },
    });
  }
  return db.candidate.create({ data: { userId, name, email, phone: input.phone ?? "", links: input.links ?? [] } });
}

/**
 * Add an applicant by hand: someone who applied inside a board (Upwork,
 * LinkedIn Easy Apply, an OLJ message), a referral, or someone you sourced.
 * Applying through an apply link does this automatically.
 */
export async function addApplicant(
  userId: string,
  input: { jobId: string; name: string; email: string; phone?: string; links?: string[]; source?: string; listingId?: string; note?: string },
) {
  const job = await requireJob(userId, input.jobId);
  if (input.listingId) {
    const l = await db.listing.findFirst({ where: { id: input.listingId, userId, jobId: job.id } });
    if (!l) throw new UserError("That listing isn't one of this job's.");
  }
  const candidate = await upsertCandidate(userId, input);
  const already = await db.application.findUnique({ where: { jobId_candidateId: { jobId: job.id, candidateId: candidate.id } } });
  if (already && !already.archivedAt) throw new UserError(`${candidate.name} has already applied to this job (application ${already.id}).`);
  const app = already
    ? await db.application.update({ where: { id: already.id }, data: { archivedAt: null, stage: "NEW", source: input.source ?? "" } })
    : await db.application.create({
        data: {
          userId,
          jobId: job.id,
          candidateId: candidate.id,
          listingId: input.listingId ?? null,
          source: input.source ?? "",
          screenToken: secret("scr"),
        },
      });
  if (input.note?.trim()) await db.note.create({ data: { userId, applicationId: app.id, body: input.note.trim(), writtenBy: "mcp" } });
  return { ...app, candidate };
}

export async function requireApplication(userId: string, applicationId: string) {
  const a = await db.application.findFirst({ where: { id: applicationId, userId, archivedAt: null, job: { archivedAt: null } } });
  if (!a) notFound("application");
  return a;
}

export async function moveStage(userId: string, applicationId: string, stage: Stage) {
  if (!STAGES.includes(stage)) throw new UserError(`stage is one of ${STAGES.join(", ")}.`);
  const a = await requireApplication(userId, applicationId);
  return db.application.update({ where: { id: a.id }, data: { stage } });
}

export async function addNote(userId: string, applicationId: string, body: string, writtenBy: "app" | "mcp") {
  const a = await requireApplication(userId, applicationId);
  if (!body.trim()) throw new UserError("The note is empty.");
  return db.note.create({ data: { userId, applicationId: a.id, body: body.trim(), writtenBy } });
}

export async function archiveApplication(userId: string, applicationId: string) {
  const a = await requireApplication(userId, applicationId);
  return db.application.update({ where: { id: a.id }, data: { archivedAt: new Date() } });
}

/** A per-application roll-up of how its written answers arrived. */
export type ProvenanceRollup = {
  written: number;
  typed: number;
  pasted: number;
  mixed: number;
  injected: number;
  unknown: number;
  likelyAi: number;
};

/** Written answers are the ones that carry telemetry; choice and number answers carry {}. */
function isWritten(a: { telemetry: unknown }) {
  return !!a.telemetry && typeof a.telemetry === "object" && Object.keys(a.telemetry).length > 0;
}

function rollup(answers: { origin: Origin; styleScore: number; value: string; telemetry: unknown }[]): ProvenanceRollup {
  const r: ProvenanceRollup = { written: 0, typed: 0, pasted: 0, mixed: 0, injected: 0, unknown: 0, likelyAi: 0 };
  for (const a of answers) {
    if (!isWritten(a) || !a.value.trim()) continue;
    r.written++;
    r[a.origin.toLowerCase() as "typed" | "pasted" | "mixed" | "injected" | "unknown"]++;
    if (a.styleScore >= 0.5) r.likelyAi++;
  }
  return r;
}

export async function listApplications(
  userId: string,
  opts: { jobId?: string; stage?: Stage; listingId?: string; qualified?: boolean; limit?: number } = {},
) {
  const where: Prisma.ApplicationWhereInput = {
    userId,
    archivedAt: null,
    job: { archivedAt: null },
    ...(opts.jobId ? { jobId: opts.jobId } : {}),
    ...(opts.stage ? { stage: opts.stage } : {}),
    ...(opts.listingId ? { listingId: opts.listingId } : {}),
    ...(opts.qualified !== undefined ? { qualified: opts.qualified } : {}),
  };
  const total = await db.application.count({ where });
  const rows = await db.application.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: Math.min(opts.limit ?? 100, 500),
    include: {
      candidate: { select: { name: true, email: true } },
      job: { select: { title: true } },
      listing: { select: { board: true, variant: true } },
      submissions: { select: { answers: { select: { origin: true, styleScore: true, value: true, telemetry: true } } } },
    },
  });
  return {
    total,
    applications: rows.map((a) => ({
      id: a.id,
      jobId: a.jobId,
      job: a.job.title,
      candidate: a.candidate.name,
      email: a.candidate.email,
      stage: a.stage,
      qualified: a.qualified,
      source: a.listing ? `${a.listing.board} ${a.listing.variant}` : a.source || "added by hand",
      appliedAt: a.createdAt,
      provenance: rollup(a.submissions.flatMap((s) => s.answers)),
    })),
  };
}

/**
 * One application whole: the candidate, where they came from, every form they
 * filled in with every answer and how it arrived, knockouts missed, and notes.
 */
export async function getApplication(userId: string, applicationId: string) {
  const a = await db.application.findFirst({
    where: { id: applicationId, userId, archivedAt: null, job: { archivedAt: null } },
    include: {
      candidate: true,
      job: { select: { id: true, title: true } },
      listing: { select: { id: true, board: true, variant: true, title: true } },
      notes: { orderBy: { createdAt: "asc" } },
      submissions: {
        orderBy: { createdAt: "asc" },
        include: { form: { select: { id: true, name: true, kind: true } }, answers: true },
      },
    },
  });
  if (!a) notFound("application");
  const answers = a.submissions.flatMap((s) => s.answers);
  return {
    id: a.id,
    stage: a.stage,
    qualified: a.qualified,
    appliedAt: a.createdAt,
    job: a.job,
    listing: a.listing,
    source: a.source,
    candidate: { id: a.candidate.id, name: a.candidate.name, email: a.candidate.email, phone: a.candidate.phone, links: a.candidate.links },
    screenToken: a.screenToken,
    provenance: rollup(answers),
    submissions: a.submissions.map((s) => ({
      id: s.id,
      form: s.form,
      submittedAt: s.createdAt,
      durationMs: s.durationMs,
      recorded: s.recorded,
      failedKnockouts: s.failed,
      answers: s.answers.map((x) => ({
        questionId: x.questionId,
        question: x.label,
        answer: x.value,
        origin: x.origin,
        pastedShare: x.pastedShare,
        summary: (x.telemetry as { summary?: string })?.summary ?? "",
        style: { score: x.styleScore, label: styleLabel(x.styleScore), signals: x.styleSignals },
      })),
    })),
    notes: a.notes.map((n) => ({ id: n.id, body: n.body, writtenBy: n.writtenBy, at: n.createdAt })),
  };
}
