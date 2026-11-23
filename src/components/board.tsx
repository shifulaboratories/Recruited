"use client";

import Link from "next/link";
import { useOptimistic, useTransition } from "react";
import type { Stage } from "@prisma/client";
import { moveStage } from "@/server/actions";
import { Avatar } from "@/components/ui";
import { ProvenanceBar, STAGE_LABEL, STAGE_TONE, TierChip, tierTone } from "@/components/provenance";
import type { ProvenanceRollup } from "@/lib/data/applications";
import type { Step } from "@/lib/steps";

export type BoardCard = {
  id: string;
  candidate: string;
  source: string;
  stage: Stage;
  /** The job's step it's on: a step id, or the stage name for a stage's usual column. */
  stepId: string;
  tier: string | null;
  proposal: boolean;
  rank: number | null;
  qualified: boolean | null;
  provenance: ProvenanceRollup;
};

/**
 * The pipeline for one job, a column per step: the job's own steps, or the
 * usual stage where it has none. Drag a card to move it; the
 * move is the same server action the applicant page's stage control uses, so
 * there is one rule for it. Cards arrive in tier order (decided, then proposed
 * by rank), which is the order you'd call people in.
 */
export function Board({ cards, steps }: { cards: BoardCard[]; steps: Step[] }) {
  const [pending, start] = useTransition();
  const [view, move] = useOptimistic(cards, (state, m: { id: string; step: Step }) =>
    state.map((c) => (c.id === m.id ? { ...c, stage: m.step.stage, stepId: m.step.id } : c)),
  );

  function drop(e: React.DragEvent, step: Step) {
    e.preventDefault();
    e.currentTarget.removeAttribute("data-over");
    const id = e.dataTransfer.getData("text/plain");
    const card = view.find((c) => c.id === id);
    if (!card || card.stepId === step.id) return;
    start(async () => {
      move({ id, step });
      await moveStage(id, step.stage, step.id);
    });
  }

  return (
    <div className="-mx-4 sm:mx-0 overflow-x-auto pb-2" aria-busy={pending}>
      <div className="grid grid-flow-col auto-cols-[minmax(210px,1fr)] gap-3 px-4 sm:px-0 min-w-max xl:min-w-0">
        {steps.map((s, si) => {
          const col = view.filter((c) => c.stepId === s.id);
          return (
            <section
              key={s.id}
              aria-label={s.label}
              className="rise rounded-xl bg-rt-subtle/70 p-2 flex flex-col gap-2 min-h-40 transition-shadow data-[over]:shadow-[inset_0_0_0_2px_var(--rt-primary)]"
              style={{ ["--i" as string]: si }}
              onDragOver={(e) => {
                e.preventDefault();
                e.currentTarget.setAttribute("data-over", "");
              }}
              onDragLeave={(e) => e.currentTarget.removeAttribute("data-over")}
              onDrop={(e) => drop(e, s)}
            >
              <header className="flex items-center gap-2 px-1.5 pt-1 pb-0.5" style={{ ["--tone" as string]: STAGE_TONE[s.stage] }}>
                <span className="dot" />
                <span className="text-[12.5px] font-semibold truncate" title={s.id === s.stage ? undefined : `In ${STAGE_LABEL[s.stage]}`}>
                  {s.label}
                </span>
                <span className="font-mono text-[10.5px] text-rt-faint tabular">{col.length}</span>
              </header>
              {col.map((c, ci) => (
                <Link
                  key={c.id}
                  href={`/applications/${c.id}`}
                  draggable
                  onDragStart={(e) => e.dataTransfer.setData("text/plain", c.id)}
                  className="card card-link rise p-3 flex flex-col gap-2.5 cursor-grab active:cursor-grabbing"
                  style={{ ["--i" as string]: si + ci }}
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <Avatar name={c.candidate} tone={tierTone(c.tier)} size={28} />
                    <div className="min-w-0 flex-1">
                      <div className="font-medium text-[13px] truncate">{c.candidate}</div>
                      <div className="text-[11.5px] text-rt-faint truncate">{c.source}</div>
                    </div>
                    <TierChip tier={c.tier} proposal={c.proposal} bare />
                  </div>
                  <ProvenanceBar r={c.provenance} compact />
                  {c.qualified === false && <span className="text-[11.5px] text-rt-faint">Misses a must-have</span>}
                </Link>
              ))}
              {col.length === 0 && <p className="text-[12px] text-rt-faint px-1.5 py-3 text-center">Drop someone here</p>}
            </section>
          );
        })}
      </div>
    </div>
  );
}
