"use client";

import { useState, useTransition } from "react";
import { setJobStepsAction, type ActionState } from "@/server/actions";
import { DEFAULT_STEP_LABEL, MAX_LABEL, MAX_STEPS, STAGE_ORDER, type Step } from "@/lib/steps";
import { STAGE_LABEL } from "@/components/provenance";

type Row = { key: string; id?: string; label: string; stage: string };

/**
 * A job's own stages, edited as a list. Each row is a name and the fixed stage
 * it sits in. Saving replaces the list, the same as update_job's stages; a
 * stage left without a row keeps its usual name.
 */
export function StepEditor({ jobId, steps, custom }: { jobId: string; steps: Step[]; custom: boolean }) {
  let n = 0;
  const [rows, setRows] = useState<Row[]>(() => steps.map((s) => ({ key: `r${n++}`, id: custom && s.id !== s.stage ? s.id : undefined, label: s.label, stage: s.stage })));
  const [state, setState] = useState<ActionState>();
  const [pending, start] = useTransition();

  const set = (i: number, patch: Partial<Row>) => setRows((r) => r.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  const swap = (i: number, j: number) =>
    setRows((r) => {
      if (j < 0 || j >= r.length) return r;
      const c = r.slice();
      [c[i], c[j]] = [c[j], c[i]];
      return c;
    });

  function save(rowsToSave: Row[]) {
    // A row that only repeats a stage's usual name adds nothing; dropping it keeps the job on the default.
    const own = rowsToSave.filter((r) => r.id || r.label.trim() !== DEFAULT_STEP_LABEL[r.stage as Step["stage"]]);
    start(async () => setState(await setJobStepsAction(jobId, own.map(({ id, label, stage }) => ({ id, label, stage })))));
  }

  return (
    <div className="space-y-3">
      <p className="text-[12.5px] text-rt-muted">
        Name the steps this role goes through. Each sits in one of the six usual stages, which is what the applicant&apos;s status page and the reports go by. A stage you
        don&apos;t give a step keeps its usual name.
      </p>
      <ol className="space-y-1.5">
        {rows.map((r, i) => (
          <li key={r.key} className="flex flex-wrap items-center gap-2">
            <input
              className="field flex-1 min-w-40"
              aria-label="Step name"
              value={r.label}
              maxLength={MAX_LABEL}
              onChange={(e) => set(i, { label: e.target.value })}
            />
            <select className="field w-auto" aria-label="Stage it sits in" value={r.stage} onChange={(e) => set(i, { stage: e.target.value })}>
              {STAGE_ORDER.map((s) => (
                <option key={s} value={s}>
                  {STAGE_LABEL[s]}
                </option>
              ))}
            </select>
            <button type="button" className="btn btn-quiet text-xs" aria-label="Move up" onClick={() => swap(i, i - 1)} disabled={i === 0}>
              ↑
            </button>
            <button type="button" className="btn btn-quiet text-xs" aria-label="Move down" onClick={() => swap(i, i + 1)} disabled={i === rows.length - 1}>
              ↓
            </button>
            <button type="button" className="btn btn-quiet text-xs" onClick={() => setRows((x) => x.filter((_, j) => j !== i))}>
              Remove
            </button>
          </li>
        ))}
      </ol>
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          className="btn text-xs"
          disabled={rows.length >= MAX_STEPS}
          onClick={() => setRows((x) => [...x, { key: `r${Date.now()}`, label: "", stage: "SCREEN" }])}
        >
          Add a step
        </button>
        <button type="button" className="btn btn-primary text-xs" disabled={pending} onClick={() => save(rows)}>
          {pending ? "Saving…" : "Save stages"}
        </button>
        {custom && (
          <button type="button" className="btn btn-quiet text-xs" disabled={pending} onClick={() => save([])}>
            Go back to the usual six
          </button>
        )}
        {state?.error && <span className="text-[12.5px] text-rt-destructive">{state.error}</span>}
        {state?.ok && !pending && <span className="text-[12.5px] text-rt-muted">{state.ok}</span>}
      </div>
    </div>
  );
}
