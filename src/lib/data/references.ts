import { db } from "@/lib/db";
import { UserError } from "@/lib/data/errors";
import { requireApplication } from "@/lib/data/applications";
import { secret } from "@/lib/ids";
import { readReferenceAnswers, REFERENCE_QUESTIONS } from "@/lib/references";

/**
 * Reference checks. The person asks for one; the referee answers four fixed
 * questions on a personal link (/ref/<token>). Nothing is sent from here: the
 * link and a suggested note come back for the person to send. The public side
 * lives in public.ts. userId first; requireApplication excludes archived rows.
 */

export function referencePath(token: string) {
  return `/ref/${encodeURIComponent(token)}`;
}

export async function requestReference(userId: string, applicationId: string, input: { name: string; email?: string; relation?: string }) {
  const a = await requireApplication(userId, applicationId);
  const name = input.name.trim();
  if (!name) throw new UserError("Who is the referee? Give their name.");
  const email = (input.email ?? "").trim().toLowerCase();
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new UserError("That email address doesn't look right.");
  const count = await db.reference.count({ where: { userId, applicationId: a.id } });
  if (count >= 6) throw new UserError("This applicant already has six reference requests. That's plenty.");
  return db.reference.create({
    data: { userId, applicationId: a.id, name, email, relation: (input.relation ?? "").trim(), token: secret("ref") },
  });
}

export async function listReferences(userId: string, applicationId: string) {
  const a = await requireApplication(userId, applicationId);
  const rows = await db.reference.findMany({ where: { userId, applicationId: a.id }, orderBy: { createdAt: "asc" } });
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    email: r.email,
    relation: r.relation,
    path: referencePath(r.token),
    requestedAt: r.createdAt,
    submittedAt: r.submittedAt,
    answers: readReferenceAnswers(r.answers),
  }));
}

export async function deleteReference(userId: string, referenceId: string) {
  const r = await db.reference.findFirst({ where: { id: referenceId, userId, application: { archivedAt: null, job: { archivedAt: null } } } });
  if (!r) throw new UserError("That reference request doesn't exist.");
  await db.reference.delete({ where: { id: r.id } });
}

/** A note the person can send the referee, written from what is on file. */
export function referenceNote(input: { referee: string; candidate: string; job: string; company: string; from: string; url: string }) {
  const first = input.referee.split(/\s+/)[0];
  return {
    subject: `A quick reference for ${input.candidate}`,
    body:
      `Hi ${first},\n\n${input.candidate} is applying for ${input.job}${input.company ? ` at ${input.company}` : ""} and gave your name as a reference. ` +
      `Would you answer four short questions about working with them? It takes about five minutes:\n\n${input.url}\n\n` +
      `What you write goes only to the people hiring for this role.\n\nThank you,\n${input.from}`,
  };
}
