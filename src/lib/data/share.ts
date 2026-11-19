import { db } from "@/lib/db";
import { requireApplication } from "@/lib/data/applications";
import { slug } from "@/lib/ids";

/**
 * A read-only link to one applicant (/s/<slug>), for a co-founder or a hiring
 * manager without an account. Turning it off clears the slug, so an old link
 * stops working for good; turning it on again makes a new one. The public read
 * lives in public.ts and leaves out email, phone and notes.
 */

export function sharePath(shareSlug: string) {
  return `/s/${shareSlug}`;
}

export async function shareApplicant(userId: string, applicationId: string, shared: boolean) {
  const a = await requireApplication(userId, applicationId);
  if (!shared) {
    await db.application.update({ where: { id: a.id }, data: { shareSlug: null, sharedAt: null } });
    return { shared: false, path: null };
  }
  if (a.shareSlug) return { shared: true, path: sharePath(a.shareSlug) };
  const s = slug(14);
  await db.application.update({ where: { id: a.id }, data: { shareSlug: s, sharedAt: new Date() } });
  return { shared: true, path: sharePath(s) };
}
