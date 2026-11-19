/** Pure: picks the leading listing for listing_report. Loaded by tools/rules.test.mjs. */

/**
 * Which listing is doing best, and how sure that is. Judged on A-tier
 * applicants (cost per A-tier where both have spend), then qualified, never
 * raw volume. Below five applicants on the leader, it says it's too early.
 */
export function bestListing(rows: { listingId: string; board: string; variant: string; applicants: number; qualified: number; tiers: { A: number }; costPerATier: number | null }[]) {
  const scored = rows.filter((r) => r.applicants > 0);
  if (scored.length < 2) return null;
  const allPaid = scored.every((r) => r.costPerATier !== null);
  const sorted = [...scored].sort((a, b) =>
    allPaid ? a.costPerATier! - b.costPerATier! : b.tiers.A - a.tiers.A || b.qualified / b.applicants - a.qualified / a.applicants,
  );
  const top = sorted[0];
  if (!top.tiers.A && !top.qualified) return null;
  const by = allPaid ? "cost per A-tier applicant" : top.tiers.A ? "A-tier applicants" : "share who met the must-haves";
  return {
    listingId: top.listingId,
    label: `${top.board} ${top.variant}`,
    by,
    confident: top.applicants >= 5 && sorted[1].applicants >= 5,
    note: top.applicants >= 5 && sorted[1].applicants >= 5 ? "" : "Fewer than five applicants on one side; treat this as a lean, not a result.",
  };
}
