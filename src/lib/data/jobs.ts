import type { JobStatus, Prisma, Stage } from "@prisma/client";
import { db } from "@/lib/db";
import { notFound, UserError } from "@/lib/data/errors";

/**
 * Jobs: the roles a workspace is hiring for. userId is the first positional
 * argument of every function here and every query filters on it.
 *
 * Jobs carry archivedAt. Every read below excludes archived rows; if you add a
 * read, filter it too.
 */

export const WORKPLACES = ["remote", "hybrid", "onsite"] as const;
export const EMPLOYMENT_TYPES = ["full_time", "part_time", "contract", "internship", "temporary"] as const;
export const SALARY_PERIODS = ["hour", "month", "year"] as const;
export const JOB_STATUSES: JobStatus[] = ["DRAFT", "OPEN", "CLOSED"];

export type JobInput = {
  title?: string;
  team?: string;
  location?: string;
  workplace?: string;
  employmentType?: string;
  salaryMin?: number | null;
  salaryMax?: number | null;
  salaryCurrency?: string;
  salaryPeriod?: string;
  description?: string;
  rubric?: string;
  afterApply?: string;
  status?: JobStatus;
};

function check(input: JobInput) {
  if (input.workplace && !(WORKPLACES as readonly string[]).includes(input.workplace))
    throw new UserError(`workplace is one of ${WORKPLACES.join(", ")}.`);
  if (input.employmentType && !(EMPLOYMENT_TYPES as readonly string[]).includes(input.employmentType))
    throw new UserError(`employmentType is one of ${EMPLOYMENT_TYPES.join(", ")}.`);
  if (input.salaryPeriod && !(SALARY_PERIODS as readonly string[]).includes(input.salaryPeriod))
    throw new UserError(`salaryPeriod is one of ${SALARY_PERIODS.join(", ")}.`);
  if (input.salaryMin != null && input.salaryMax != null && input.salaryMin > input.salaryMax)
    throw new UserError("salaryMin is larger than salaryMax.");
  if (input.title !== undefined && !input.title.trim()) throw new UserError("A job needs a title.");
  if (input.afterApply && input.afterApply.split("\n").filter((l) => l.trim()).length > 6) throw new UserError("Keep what happens next to six steps or fewer, one per line.");
}

export async function createJob(userId: string, input: JobInput & { title: string }) {
  check(input);
  return db.job.create({
    data: {
      userId,
      title: input.title.trim(),
      team: input.team ?? "",
      location: input.location ?? "",
      workplace: input.workplace ?? "remote",
      employmentType: input.employmentType ?? "full_time",
      salaryMin: input.salaryMin ?? null,
      salaryMax: input.salaryMax ?? null,
      salaryCurrency: (input.salaryCurrency ?? "USD").toUpperCase(),
      salaryPeriod: input.salaryPeriod ?? "year",
      description: input.description ?? "",
      rubric: input.rubric ?? "",
      afterApply: input.afterApply ?? "",
      status: input.status ?? "DRAFT",
      closedAt: input.status === "CLOSED" ? new Date() : null,
    },
  });
}

/** Changes only the fields given. */
export async function updateJob(userId: string, jobId: string, input: JobInput) {
  check(input);
  const job = await requireJob(userId, jobId);
  const data: Prisma.JobUpdateInput = {};
  for (const [k, v] of Object.entries(input)) if (v !== undefined) (data as Record<string, unknown>)[k] = v;
  // The retention clock (privacy.ts) starts when a job closes, and stops if it reopens.
  if (input.status === "CLOSED" && job.status !== "CLOSED") data.closedAt = new Date();
  if (input.status && input.status !== "CLOSED") data.closedAt = null;
  if (typeof data.salaryCurrency === "string") data.salaryCurrency = data.salaryCurrency.toUpperCase();
  return db.job.update({ where: { id: jobId }, data });
}

export async function requireJob(userId: string, jobId: string) {
  const job = await db.job.findFirst({ where: { id: jobId, userId, archivedAt: null } });
  if (!job) notFound("job");
  return job;
}

export async function archiveJob(userId: string, jobId: string) {
  const job = await requireJob(userId, jobId);
  return db.job.update({ where: { id: jobId }, data: { archivedAt: new Date(), status: "CLOSED", closedAt: job.closedAt ?? new Date() } });
}

const STAGES: Stage[] = ["NEW", "SCREEN", "INTERVIEW", "OFFER", "HIRED", "REJECTED"];

function stageCounts(rows: { stage: Stage }[]) {
  const counts = Object.fromEntries(STAGES.map((s) => [s, 0])) as Record<Stage, number>;
  for (const r of rows) counts[r.stage]++;
  return counts;
}

export async function listJobs(userId: string, opts: { status?: JobStatus } = {}) {
  const jobs = await db.job.findMany({
    where: { userId, archivedAt: null, ...(opts.status ? { status: opts.status } : {}) },
    orderBy: [{ status: "asc" }, { updatedAt: "desc" }],
    include: {
      listings: { select: { id: true, board: true, variant: true, status: true } },
      applications: { where: { archivedAt: null }, select: { stage: true } },
    },
  });
  return jobs.map(({ applications, ...j }) => ({ ...j, applicants: applications.length, stages: stageCounts(applications) }));
}

export async function getJob(userId: string, jobId: string) {
  const job = await db.job.findFirst({
    where: { id: jobId, userId, archivedAt: null },
    include: {
      listings: { orderBy: [{ board: "asc" }, { variant: "asc" }] },
      forms: { orderBy: { createdAt: "asc" } },
      applications: { where: { archivedAt: null }, select: { stage: true } },
    },
  });
  if (!job) notFound("job");
  const { applications, ...rest } = job;
  return { ...rest, applicants: applications.length, stages: stageCounts(applications) };
}

export function formatPay(j: { salaryMin: number | null; salaryMax: number | null; salaryCurrency: string; salaryPeriod: string }) {
  if (j.salaryMin == null && j.salaryMax == null) return "";
  const n = (v: number) => v.toLocaleString("en-US");
  const range = j.salaryMin != null && j.salaryMax != null ? `${n(j.salaryMin)}–${n(j.salaryMax)}` : n((j.salaryMin ?? j.salaryMax)!);
  return `${j.salaryCurrency} ${range} per ${j.salaryPeriod}`;
}
