import type { ProvenanceRollup } from "@/lib/data/applications";

/**
 * How answers arrived, drawn the way the brand kit says: typed is plain ink,
 * pasted is amber, likely-AI is violet, shown as a highlight or a stacked bar
 * with the numbers written out. Never red, never a bare score.
 */

const ORIGIN_LABEL: Record<string, string> = {
  TYPED: "Typed",
  PASTED: "Pasted",
  MIXED: "Partly pasted",
  INJECTED: "Filled in without typing",
  UNKNOWN: "Not recorded",
};

export function OriginBadge({ origin }: { origin: string }) {
  const tone =
    origin === "TYPED"
      ? "text-rt-typed border-rt-border"
      : origin === "UNKNOWN"
        ? "text-rt-faint border-rt-border"
        : "text-rt-pasted border-rt-pasted/40 hl-pasted";
  return <span className={`inline-block rounded border px-1.5 py-0.5 text-xs font-medium ${tone}`}>{ORIGIN_LABEL[origin] ?? origin}</span>;
}

export function StyleBadge({ score, label }: { score: number; label: string }) {
  if (score < 0.2) return null;
  return (
    <span className={`inline-block rounded border border-rt-ai/40 px-1.5 py-0.5 text-xs font-medium text-rt-ai ${score >= 0.5 ? "hl-ai" : ""}`}>
      {label}
    </span>
  );
}

export function ProvenanceBar({ r }: { r: ProvenanceRollup }) {
  if (!r.written) return <span className="text-rt-faint text-xs">No written answers</span>;
  const typed = r.typed;
  const pasted = r.pasted + r.mixed + r.injected;
  const pct = (x: number) => Math.round((x / r.written) * 100);
  return (
    <div className="min-w-[140px]">
      <div className="flex h-1.5 rounded overflow-hidden bg-rt-subtle">
        <div style={{ width: `${pct(typed)}%`, background: "var(--rt-typed)" }} />
        <div style={{ width: `${pct(pasted)}%`, background: "var(--rt-pasted)" }} />
      </div>
      <div className="text-xs text-rt-muted mt-1 tabular">
        {pct(typed)}% typed · {pct(pasted)}% pasted or filled in
        {r.likelyAi > 0 && <span className="text-rt-ai"> · {r.likelyAi} likely AI</span>}
      </div>
    </div>
  );
}

export function StageChip({ stage }: { stage: string }) {
  return <span className="font-mono text-[11px] uppercase tracking-wide text-rt-muted">{stage.toLowerCase()}</span>;
}

export function QualifiedChip({ qualified }: { qualified: boolean | null }) {
  if (qualified === null) return null;
  return qualified ? (
    <span className="text-xs text-rt-success">Meets must-haves</span>
  ) : (
    <span className="text-xs text-rt-muted">Misses a must-have</span>
  );
}

/**
 * A tier chip. Tier is data, so the colour carries meaning: A green, B the
 * accent blue, C grey (brand/BRAND.md). A proposal the person hasn't decided
 * on is drawn dashed and says so.
 */
export function TierChip({ tier, proposal = false, rank }: { tier: string | null; proposal?: boolean; rank?: number | null }) {
  if (!tier) return <span className="text-xs text-rt-faint">Unranked</span>;
  const color = tier === "A" ? "var(--rt-tier-a)" : tier === "B" ? "var(--rt-tier-b)" : "var(--rt-tier-c)";
  return (
    <span className="inline-flex items-center gap-1.5 text-xs" title={proposal ? "Proposed by Claude, not decided yet" : "Decided"}>
      <span
        className="inline-grid place-items-center w-5 h-5 rounded font-mono font-medium"
        style={
          proposal
            ? { border: `1px dashed ${color}`, color }
            : { background: `color-mix(in oklch, ${color} 18%, transparent)`, color, border: `1px solid ${color}` }
        }
      >
        {tier}
      </span>
      {proposal && <span className="text-rt-faint">proposed{rank ? ` · #${rank}` : ""}</span>}
    </span>
  );
}
