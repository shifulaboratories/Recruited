/**
 * The privacy notice every apply form shows, from the workspace's own
 * settings. Pure. It says who gets the application, how long it's kept and
 * where to write, and nothing it can't keep: the retention rule it states is
 * the one src/lib/data/privacy.ts enforces.
 */

export const MAX_RETENTION_MONTHS = 120;

export function retentionSentence(months: number): string {
  if (months <= 0) return "They keep it until they delete it.";
  const span = months % 12 === 0 ? `${months / 12} year${months === 12 ? "" : "s"}` : `${months} month${months === 1 ? "" : "s"}`;
  return `They keep it for ${span} after this role closes, then it's deleted, unless they hire you.`;
}

export function privacyNotice(i: { company: string; retentionMonths: number; contactEmail: string }): string {
  const who = i.company.trim() || "the company hiring";
  const ask = i.contactEmail
    ? `To get a copy of what they hold about you, or to have it deleted sooner, email ${i.contactEmail}.`
    : `To get a copy of what they hold about you, or to have it deleted sooner, reply to any email they send you.`;
  return `Your application goes to ${who} and no one else. ${retentionSentence(i.retentionMonths)} ${ask}`;
}
