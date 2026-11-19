import type { Stage } from "@prisma/client";
import { db } from "@/lib/db";
import { UserError } from "@/lib/data/errors";
import { requireJob } from "@/lib/data/jobs";

/**
 * Closing the loop: when a role is filled or closed, everyone still waiting
 * hears back. This saves one REJECTION draft per applicant who hasn't been
 * sent or drafted one, filled from a template, and optionally moves them to
 * REJECTED and closes the job and its listings. It sends nothing: the drafts
 * wait on each applicant's page, or go out through the person's mail tool.
 * HIRED and OFFER are never touched. userId first.
 */

export const CLOSEOUT_STAGES: Stage[] = ["NEW", "SCREEN", "INTERVIEW", "REJECTED"];

export const DEFAULT_CLOSEOUT = {
  subject: "Your application for {job}",
  body:
    "Hi {first_name},\n\nThank you for applying for {job}{at_company}. We've now filled the role, so we won't be taking your application further.\n\n" +
    "We read every application, and we appreciate the time you put into yours. We'd be glad to hear from you for future roles.\n\nAll the best,\n{from}",
};

function fill(t: string, v: Record<string, string>) {
  return t.replace(/\{(first_name|name|job|company|at_company|from)\}/g, (_, k: string) => v[k] ?? "");
}

export async function closeOutJob(
  userId: string,
  jobId: string,
  input: { subject?: string; body?: string; dryRun?: boolean; moveToRejected?: boolean; closeJob?: boolean; writtenBy?: "app" | "mcp" },
) {
  const job = await requireJob(userId, jobId);
  const user = await db.user.findUniqueOrThrow({ where: { id: userId }, select: { name: true, companyName: true } });
  const subject = (input.subject ?? "").trim() || DEFAULT_CLOSEOUT.subject;
  const body = (input.body ?? "").trim() || DEFAULT_CLOSEOUT.body;
  if (body.length > 5000) throw new UserError("Keep the message under 5000 characters.");
  const apps = await db.application.findMany({
    where: { userId, jobId: job.id, archivedAt: null, stage: { in: CLOSEOUT_STAGES }, messages: { none: { kind: "REJECTION" } } },
    orderBy: { createdAt: "asc" },
    select: { id: true, stage: true, candidate: { select: { name: true, email: true } } },
  });
  const vars = (name: string) => ({
    first_name: name.split(/\s+/)[0] ?? name,
    name,
    job: job.title,
    company: user.companyName,
    at_company: user.companyName ? ` at ${user.companyName}` : "",
    from: user.name || user.companyName || "",
  });
  const preview = apps[0] ? { to: apps[0].candidate.name, subject: fill(subject, vars(apps[0].candidate.name)), body: fill(body, vars(apps[0].candidate.name)) } : null;
  const skipped = await db.application.count({
    where: { userId, jobId: job.id, archivedAt: null, OR: [{ stage: { in: ["OFFER", "HIRED"] } }, { messages: { some: { kind: "REJECTION" } } }] },
  });
  const who = apps.map((a) => ({ applicationId: a.id, name: a.candidate.name, stage: a.stage }));
  if (input.dryRun) return { dryRun: true, wouldDraft: who.length, applicants: who, skipped, preview };

  await db.$transaction([
    ...apps.map((a) =>
      db.message.create({
        data: {
          userId,
          applicationId: a.id,
          kind: "REJECTION",
          status: "DRAFT",
          subject: fill(subject, vars(a.candidate.name)),
          body: fill(body, vars(a.candidate.name)),
          writtenBy: input.writtenBy ?? "mcp",
        },
      }),
    ),
    ...(input.moveToRejected ? [db.application.updateMany({ where: { userId, id: { in: apps.map((a) => a.id) } }, data: { stage: "REJECTED" } })] : []),
    ...(input.closeJob
      ? [
          db.job.update({ where: { id: job.id }, data: { status: "CLOSED" } }),
          db.listing.updateMany({ where: { userId, jobId: job.id, status: { in: ["LIVE", "PAUSED", "DRAFT"] } }, data: { status: "CLOSED" } }),
        ]
      : []),
  ]);
  return { dryRun: false, drafted: who.length, applicants: who, skipped, movedToRejected: !!input.moveToRejected, jobClosed: !!input.closeJob, preview };
}
