import { db } from "@/lib/db";
import { UserError } from "@/lib/data/errors";
import { requireJob } from "@/lib/data/jobs";
import { addApplicant } from "@/lib/data/applications";
import { guessBoard, IMPORT_FIELDS, mapColumns, MAX_IMPORT_ROWS, parseCsv, rowsToApplicants, type ImportField } from "@/lib/csv";

/**
 * Add everyone in a board's applicant export to one job at once. A dry run
 * (the default) reports what would happen and saves nothing; the real run
 * adds each new person through addApplicant, so the rules for one applicant
 * are the rules for a thousand. userId first, as everywhere.
 */

export type ImportInput = {
  jobId: string;
  csv: string;
  listingId?: string;
  source?: string;
  columns?: Partial<Record<ImportField, string>>;
  dryRun: boolean;
  writtenBy: "app" | "mcp";
};

export async function importApplicants(userId: string, input: ImportInput) {
  const job = await requireJob(userId, input.jobId);
  let listing: { id: string; board: string; variant: string } | null = null;
  if (input.listingId) {
    listing = await db.listing.findFirst({ where: { id: input.listingId, userId, jobId: job.id }, select: { id: true, board: true, variant: true } });
    if (!listing) throw new UserError("That listing isn't one of this job's.");
  }
  const rows = parseCsv(input.csv);
  if (rows.length < 2) throw new UserError("The file needs a header row and at least one applicant.");
  if (rows.length - 1 > MAX_IMPORT_ROWS) throw new UserError(`That's ${rows.length - 1} rows; import at most ${MAX_IMPORT_ROWS} at a time.`);
  const headers = rows[0].map((h) => h.trim());
  rows[0] = headers;
  const map = mapColumns(headers, input.columns);
  if (!map.email) throw new UserError(`No email column found. The columns are: ${headers.join(", ")}. Say which one holds the email.`);
  if (!map.name && !map.first_name) throw new UserError(`No name column found. The columns are: ${headers.join(", ")}. Say which one holds the name.`);

  const board = guessBoard(headers);
  const source = (input.source ?? "").trim() || (listing ? "" : board ? `${board} export` : "csv import");
  const parsed = rowsToApplicants(rows, map);

  const emails = parsed.filter((r) => !r.problem).map((r) => r.email);
  const existing = await db.application.findMany({
    where: { userId, jobId: job.id, archivedAt: null, candidate: { email: { in: emails } } },
    select: { id: true, candidate: { select: { email: true } } },
  });
  const already = new Map(existing.map((a) => [a.candidate.email, a.id]));

  const results = [] as { line: number; name: string; email: string; outcome: "added" | "would_add" | "already_applied" | "skipped"; reason?: string; applicationId?: string }[];
  for (const r of parsed) {
    const base = { line: r.line, name: r.name, email: r.email };
    if (r.problem) {
      results.push({ ...base, outcome: "skipped", reason: r.problem });
      continue;
    }
    const had = already.get(r.email);
    if (had) {
      results.push({ ...base, outcome: "already_applied", applicationId: had });
      continue;
    }
    if (input.dryRun) {
      results.push({ ...base, outcome: "would_add" });
      continue;
    }
    try {
      const a = await addApplicant(userId, {
        jobId: job.id,
        name: r.name,
        email: r.email,
        phone: r.phone || undefined,
        links: r.links,
        listingId: listing?.id,
        source,
        note: r.extra.length ? `From the ${board || "imported"} export:\n${r.extra.join("\n")}` : undefined,
        writtenBy: input.writtenBy,
      });
      results.push({ ...base, outcome: "added", applicationId: a.id });
    } catch (e) {
      if (!(e instanceof UserError)) throw e;
      results.push({ ...base, outcome: "skipped", reason: e.message });
    }
  }

  const count = (o: string) => results.filter((x) => x.outcome === o).length;
  return {
    dryRun: input.dryRun,
    job: { id: job.id, title: job.title },
    listing,
    source,
    boardGuess: board || null,
    columns: Object.fromEntries(IMPORT_FIELDS.filter((f) => map[f]).map((f) => [f, map[f]!.length === 1 ? map[f]![0] : map[f]])),
    keptAsNote: headers.filter((h) => !Object.values(map).flat().includes(h)),
    summary: { rows: results.length, [input.dryRun ? "wouldAdd" : "added"]: count(input.dryRun ? "would_add" : "added"), alreadyApplied: count("already_applied"), skipped: count("skipped") },
    rows: results,
  };
}
