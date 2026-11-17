"use client";

import { useState, useTransition } from "react";
import { importApplicantsAction, type ImportResult } from "@/server/actions";

const OUTCOME: Record<string, string> = {
  would_add: "Will be added",
  added: "Added",
  already_applied: "Already applied",
  skipped: "Skipped",
};

/** Paste or choose a board's applicant export, preview it, then add everyone. */
export function ImportApplicants({ jobId, listings }: { jobId: string; listings: { id: string; label: string }[] }) {
  const [csv, setCsv] = useState("");
  const [listingId, setListingId] = useState("");
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState("");
  const [pending, start] = useTransition();

  const run = (dryRun: boolean) =>
    start(async () => {
      setError("");
      const r = await importApplicantsAction({ jobId, csv, listingId, dryRun });
      if (r.error) {
        setError(r.error);
        setResult(null);
      } else setResult(r.result ?? null);
      if (!dryRun && r.result) setCsv("");
    });

  const s = result?.summary as Record<string, number> | undefined;
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <input
          type="file"
          accept=".csv,.tsv,text/csv,text/tab-separated-values"
          className="text-xs"
          onChange={async (e) => {
            const f = e.target.files?.[0];
            if (f) {
              setCsv(await f.text());
              setResult(null);
            }
          }}
        />
        <select className="field max-w-xs" value={listingId} onChange={(e) => setListingId(e.target.value)} aria-label="Listing">
          <option value="">Not from one of these listings</option>
          {listings.map((l) => (
            <option key={l.id} value={l.id}>
              {l.label}
            </option>
          ))}
        </select>
      </div>
      <textarea
        className="field min-h-28 font-mono text-xs"
        placeholder="Or paste the export here, header row first."
        value={csv}
        onChange={(e) => {
          setCsv(e.target.value);
          setResult(null);
        }}
      />
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" className="btn" disabled={pending || !csv.trim()} onClick={() => run(true)}>
          {pending && !result ? "Reading…" : "Preview"}
        </button>
        {result?.dryRun && (s?.wouldAdd ?? 0) > 0 && (
          <button type="button" className="btn btn-primary" disabled={pending} onClick={() => run(false)}>
            {pending ? "Adding…" : `Add ${s?.wouldAdd} applicant${s?.wouldAdd === 1 ? "" : "s"}`}
          </button>
        )}
        {error && <span className="text-rt-destructive">{error}</span>}
      </div>
      {result && s && (
        <div className="space-y-2">
          <p className="text-rt-muted">
            {result.dryRun ? `${s.wouldAdd} to add` : `Added ${s.added}`}, {s.alreadyApplied} already applied, {s.skipped} skipped.{" "}
            {result.dryRun && "Nothing is saved until you add them."}
          </p>
          <p className="text-xs text-rt-faint">
            Columns used:{" "}
            {Object.entries(result.columns)
              .map(([k, v]) => `${k.replace("_", " ")} from "${Array.isArray(v) ? v.join('", "') : v}"`)
              .join("; ")}
            .{result.keptAsNote.length > 0 && ` Kept as a note: ${result.keptAsNote.join(", ")}.`}
          </p>
          <div className="card overflow-x-auto">
            <table className="w-full text-sm">
              <tbody>
                {result.rows.slice(0, 200).map((r) => (
                  <tr key={r.line} className="border-b border-rt-border last:border-0">
                    <td className="px-3 py-1.5 text-xs text-rt-faint w-12">{r.line}</td>
                    <td className="px-3 py-1.5">{r.name || <span className="text-rt-faint">no name</span>}</td>
                    <td className="px-3 py-1.5 text-rt-muted">{r.email}</td>
                    <td className="px-3 py-1.5 text-xs">
                      <span className={r.outcome === "skipped" ? "text-rt-muted" : ""}>{OUTCOME[r.outcome]}</span>
                      {r.reason && <span className="text-rt-faint">: {r.reason}</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {result.rows.length > 200 && <p className="px-3 py-2 text-xs text-rt-faint">And {result.rows.length - 200} more rows.</p>}
          </div>
        </div>
      )}
    </div>
  );
}
