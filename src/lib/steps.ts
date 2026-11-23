import type { Stage } from "@prisma/client";

/**
 * A job's own stages. Pure: the database side is in src/lib/data/jobs.ts and
 * applications.ts.
 *
 * Every application still sits in one of six fixed stages, and everything that
 * means something (the applicant's status page, closing out, the brief, the
 * reports) reads that. A job can name its own steps on top: "Phone screen" and
 * "Trial task" both in SCREEN, say. A stage with no step of its own shows under
 * its usual name, so every job always has somewhere for every stage, and an
 * applicant whose step was removed falls back to the first step of their stage.
 */

export type Step = { id: string; label: string; stage: Stage };

export const STAGE_ORDER: Stage[] = ["NEW", "SCREEN", "INTERVIEW", "OFFER", "HIRED", "REJECTED"];

export const DEFAULT_STEP_LABEL: Record<Stage, string> = {
  NEW: "New",
  SCREEN: "Screening",
  INTERVIEW: "Interview",
  OFFER: "Offer",
  HIRED: "Hired",
  REJECTED: "Not this time",
};

export const MAX_STEPS = 15;
export const MAX_LABEL = 40;

const isStage = (s: unknown): s is Stage => typeof s === "string" && (STAGE_ORDER as string[]).includes(s);

/** The steps saved on a job, ignoring anything malformed. */
export function readSteps(json: unknown): Step[] {
  if (!Array.isArray(json)) return [];
  return json.filter(
    (s): s is Step => !!s && typeof s === "object" && typeof s.id === "string" && typeof s.label === "string" && isStage(s.stage),
  );
}

/** A custom step's id: a lowercase slug, so it can never equal a default step's id (the stage name). */
function slug(label: string) {
  return (
    label
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 40) || "step"
  );
}

/**
 * Check steps someone wants to save. Keeps an id that's given (so applicants
 * on a renamed step stay on it) and makes one from the label otherwise.
 * Returns the steps in stage order, keeping the order given within a stage.
 */
export function checkSteps(input: { id?: string; label: string; stage: string }[]): { steps: Step[] } | { error: string } {
  if (!Array.isArray(input)) return { error: "stages is a list of { label, stage }." };
  if (input.length > MAX_STEPS) return { error: `A job has at most ${MAX_STEPS} stages of its own.` };
  const seen = new Set<string>();
  const ids = new Set<string>();
  const steps: Step[] = [];
  for (const s of input) {
    const label = String(s?.label ?? "").trim().replace(/\s+/g, " ");
    if (!label) return { error: "Every stage needs a name." };
    if (label.length > MAX_LABEL) return { error: `"${label.slice(0, 20)}…" is too long; keep a stage's name under ${MAX_LABEL} characters.` };
    if (!isStage(s.stage)) return { error: `"${label}" needs a stage kind: one of ${STAGE_ORDER.join(", ")}.` };
    const key = label.toLowerCase();
    if (seen.has(key)) return { error: `There are two stages called "${label}".` };
    seen.add(key);
    let id = typeof s.id === "string" && /^[a-z0-9-]{1,40}$/.test(s.id) ? s.id : slug(label);
    for (let n = 2; ids.has(id); n++) id = `${slug(label)}-${n}`;
    ids.add(id);
    steps.push({ id, label, stage: s.stage });
  }
  return { steps: STAGE_ORDER.flatMap((st) => steps.filter((s) => s.stage === st)) };
}

/** Every step a job shows: its own, plus each stage it gave no step of its own under the usual name. */
export function effectiveSteps(custom: Step[]): Step[] {
  return STAGE_ORDER.flatMap((stage) => {
    const own = custom.filter((s) => s.stage === stage);
    return own.length ? own : [{ id: stage, label: DEFAULT_STEP_LABEL[stage], stage }];
  });
}

/** The step an application is on: its saved step if that's still in its stage, else the first step of its stage. */
export function stepOf(app: { stage: Stage; step: string | null }, steps: Step[]): Step {
  return steps.find((s) => s.id === app.step && s.stage === app.stage) ?? steps.find((s) => s.stage === app.stage)!;
}

/** Find a step by its id, its name (any case) or a stage name, which means that stage's first step. */
export function findStep(steps: Step[], ref: string): Step | undefined {
  const r = ref.trim();
  const lower = r.toLowerCase();
  return steps.find((s) => s.id === r) ?? steps.find((s) => s.label.toLowerCase() === lower) ?? steps.find((s) => s.stage === r.toUpperCase());
}

/** What to save on the application for a step: null for a stage's default step. */
export function stepToSave(step: Step) {
  return step.id === step.stage ? null : step.id;
}
