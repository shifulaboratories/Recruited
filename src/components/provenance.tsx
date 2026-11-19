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
  const tone = origin === "TYPED" ? "var(--rt-typed)" : origin === "UNKNOWN" ? "var(--rt-faint)" : "var(--rt-pasted)";
  return (
    <span className="chip" style={{ ["--tone" as string]: tone }}>
      <span className="dot" />
      {ORIGIN_LABEL[origin] ?? origin}
    </span>
  );
}

export function StyleBadge({ score, label }: { score: number; label: string }) {
  if (score < 0.2) return null;
  return (
    <span className="chip" style={{ ["--tone" as string]: "var(--rt-ai)" }}>
      <span className="dot" />
      {label}
    </span>
  );
}

/** One answer's arrival as a bar: typed share in ink, pasted share in amber. */
export function ArrivalBar({ pastedShare, ai = false }: { pastedShare: number; ai?: boolean }) {
  const pasted = Math.round(Math.min(1, Math.max(0, pastedShare)) * 100);
  return (
    <div className="flex h-1 rounded-full overflow-hidden bg-rt-subtle">
      <div className="draw" style={{ width: `${100 - pasted}%`, background: ai ? "var(--rt-ai)" : "color-mix(in oklch, var(--rt-typed) 55%, transparent)" }} />
      <div className="draw" style={{ width: `${pasted}%`, background: "var(--rt-pasted)", ["--i" as string]: 1 }} />
    </div>
  );
}

export function ProvenanceBar({ r, compact = false }: { r: ProvenanceRollup; compact?: boolean }) {
  if (!r.written) return <span className="text-rt-faint text-xs">No written answers</span>;
  const typed = r.typed;
  const pasted = r.pasted + r.mixed + r.injected;
  const pct = (x: number) => Math.round((x / r.written) * 100);
  return (
    <div className={compact ? "w-full" : "min-w-[150px]"}>
      <div className="flex h-1.5 gap-px rounded-full overflow-hidden bg-rt-subtle">
        <div className="draw" style={{ width: `${pct(typed)}%`, background: "color-mix(in oklch, var(--rt-typed) 55%, transparent)" }} />
        <div className="draw" style={{ width: `${pct(pasted)}%`, background: "var(--rt-pasted)", ["--i" as string]: 1 }} />
      </div>
      <div className="text-[11.5px] text-rt-muted mt-1 tabular">
        {compact ? (
          <>
            {pct(typed)}% typed
            {pasted > 0 && <span className="text-rt-pasted"> · {pct(pasted)}% pasted</span>}
          </>
        ) : (
          <>
            {pct(typed)}% typed · {pct(pasted)}% pasted or filled in
          </>
        )}
        {r.likelyAi > 0 && <span className="text-rt-ai"> · {r.likelyAi} likely AI</span>}
      </div>
    </div>
  );
}

export const STAGE_LABEL: Record<string, string> = {
  NEW: "New",
  SCREEN: "Screening",
  INTERVIEW: "Interview",
  OFFER: "Offer",
  HIRED: "Hired",
  REJECTED: "Not this time",
  DRAFT: "Draft",
  LIVE: "Live",
  PAUSED: "Paused",
  CLOSED: "Closed",
  OPEN: "Open",
};

/** Stage hue turns as an applicant advances, so "further along" reads without the label. */
export const STAGE_TONE: Record<string, string> = {
  NEW: "var(--rt-faint)",
  SCREEN: "oklch(0.55 0.13 235)",
  INTERVIEW: "oklch(0.53 0.16 285)",
  OFFER: "oklch(0.6 0.14 62)",
  HIRED: "var(--rt-success)",
  REJECTED: "var(--rt-faint)",
  LIVE: "var(--rt-success)",
  OPEN: "var(--rt-success)",
  DRAFT: "var(--rt-faint)",
  PAUSED: "var(--rt-warning)",
  CLOSED: "var(--rt-faint)",
};

export function StageChip({ stage }: { stage: string }) {
  return (
    <span className="chip" style={{ ["--tone" as string]: STAGE_TONE[stage] ?? "var(--rt-muted)" }}>
      <span className="dot" />
      {STAGE_LABEL[stage] ?? stage.toLowerCase()}
    </span>
  );
}

export function QualifiedChip({ qualified }: { qualified: boolean | null }) {
  if (qualified === null) return null;
  return qualified ? (
    <span className="chip" style={{ ["--tone" as string]: "var(--rt-success)" }}>
      Meets must-haves
    </span>
  ) : (
    <span className="chip">Misses a must-have</span>
  );
}

export function tierTone(tier: string | null | undefined) {
  return tier === "A" ? "var(--rt-tier-a)" : tier === "B" ? "var(--rt-tier-b)" : tier === "C" ? "var(--rt-tier-c)" : undefined;
}

/**
 * A tier chip. Tier is data, so the colour carries meaning: A green, B the
 * accent blue, C grey (brand/BRAND.md). A proposal the person hasn't decided
 * on is drawn dashed and says so.
 */
export function TierChip({ tier, proposal = false, rank, bare = false }: { tier: string | null; proposal?: boolean; rank?: number | null; bare?: boolean }) {
  if (!tier) return bare ? <span className="inline-grid place-items-center w-6 h-6 rounded-md text-xs text-rt-faint inset">–</span> : <span className="text-xs text-rt-faint">Unranked</span>;
  const color = tierTone(tier)!;
  return (
    <span className="inline-flex items-center gap-1.5 text-xs" title={proposal ? "Proposed by Claude, not decided yet" : "Decided"}>
      <span
        className="inline-grid place-items-center w-6 h-6 rounded-md font-semibold text-[12px]"
        style={
          proposal
            ? { boxShadow: `inset 0 0 0 1px ${color}`, color, backgroundImage: `repeating-linear-gradient(135deg, color-mix(in oklch, ${color} 12%, transparent) 0 3px, transparent 3px 6px)` }
            : { background: color, color: "var(--rt-surface)" }
        }
      >
        {tier}
      </span>
      {!bare && proposal && <span className="text-rt-faint">proposed{rank ? ` · #${rank}` : ""}</span>}
    </span>
  );
}
