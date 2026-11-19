/**
 * The reference check: three fixed questions a referee answers on a link.
 * Fixed on purpose, so every referee is asked the same thing and answers can
 * be compared. Pure.
 */

export const REFERENCE_QUESTIONS = [
  { id: "context", label: "How do you know them, and for how long did you work together?" },
  { id: "strengths", label: "What were they best at? An example helps." },
  { id: "growth", label: "What would help them do their best work in a new role?" },
  { id: "again", label: "Would you work with them again? Why or why not?" },
] as const;

export type ReferenceAnswer = { id: string; question: string; answer: string };

export function readReferenceAnswers(raw: unknown): ReferenceAnswer[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((a): a is Record<string, unknown> => !!a && typeof a === "object")
    .map((a) => ({ id: String(a.id ?? ""), question: String(a.question ?? ""), answer: String(a.answer ?? "") }));
}

/** Validate a referee's answers: the first three are required, each up to 3000 characters. */
export function checkReferenceAnswers(answers: Record<string, string>) {
  const errors: Record<string, string> = {};
  const out: ReferenceAnswer[] = [];
  for (const q of REFERENCE_QUESTIONS) {
    const v = (answers[q.id] ?? "").trim();
    if (!v && q.id !== "growth") errors[q.id] = "This one is required.";
    else if (v.length > 3000) errors[q.id] = "Keep it under 3000 characters.";
    out.push({ id: q.id, question: q.label, answer: v });
  }
  return { errors, answers: out };
}
