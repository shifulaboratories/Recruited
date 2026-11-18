import { db } from "@/lib/db";
import { UserError } from "@/lib/data/errors";
import { requireApplication } from "@/lib/data/applications";
import { ProbesSchema, readProbes } from "@/lib/probes";

/**
 * Follow-up questions for one applicant, kept on the application. Saving
 * replaces the list; marking one asked changes only that one. userId first;
 * requireApplication excludes archived rows.
 */

export async function saveProbes(userId: string, applicationId: string, probes: unknown) {
  const a = await requireApplication(userId, applicationId);
  const r = ProbesSchema.safeParse(probes);
  if (!r.success) throw new UserError(`The questions don't fit: ${r.error.issues.map((i) => `${i.path.join(".") || "probes"}: ${i.message}`).join("; ")}`);
  await db.application.update({ where: { id: a.id }, data: { probes: r.data } });
  return r.data;
}

export async function markProbe(userId: string, applicationId: string, index: number, input: { asked?: boolean; note?: string }) {
  const a = await requireApplication(userId, applicationId);
  const probes = readProbes(a.probes);
  if (!Number.isInteger(index) || index < 0 || index >= probes.length) throw new UserError(`There's no question ${index + 1}; this applicant has ${probes.length}.`);
  const p = probes[index];
  if (input.asked !== undefined) p.asked = input.asked;
  if (input.note !== undefined) p.note = input.note.trim().slice(0, 2000);
  await db.application.update({ where: { id: a.id }, data: { probes } });
  return probes;
}
