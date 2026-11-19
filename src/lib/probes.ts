import { z } from "zod";

/**
 * Follow-up questions for one applicant: what to ask on the call, aimed at
 * the answers that most need a second look (pasted, likely written with AI,
 * or simply thin). Pure; stored as Application.probes.
 *
 * A probe is a question for a conversation, never a verdict. `why` says what
 * prompted it in words the person can check; it is never shown to the
 * applicant.
 */

export const ProbeSchema = z.object({
  about: z.string().trim().max(300).default(""),
  question: z.string().trim().min(8, "Write the question in full.").max(600),
  why: z.string().trim().max(600).default(""),
  asked: z.boolean().default(false),
  note: z.string().trim().max(2000).default(""),
});

export const ProbesSchema = z.array(ProbeSchema).max(12, "Keep it to twelve questions or fewer.");

export type Probe = z.infer<typeof ProbeSchema>;

/** Read stored probes, dropping anything that no longer fits. */
export function readProbes(raw: unknown): Probe[] {
  if (!Array.isArray(raw)) return [];
  const out: Probe[] = [];
  for (const p of raw) {
    const r = ProbeSchema.safeParse(p);
    if (r.success) out.push(r.data);
  }
  return out;
}
