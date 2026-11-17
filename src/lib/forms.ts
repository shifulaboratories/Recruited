/**
 * The question format shared by the database (Form.questions), the public form
 * pages and the MCP tools. A contract in the same way Hired's resume schema is:
 * every field but id, label and type has a default, so a half-written form
 * still renders, and changing what a field means breaks old forms.
 *
 * Pure module (zod only) so tools/rules.test.mjs can load it.
 */
import { z } from "zod";

export const QUESTION_TYPES = [
  "short_text",
  "long_text",
  "email",
  "phone",
  "url",
  "number",
  "yes_no",
  "single_choice",
  "multi_choice",
  "file",
] as const;
export type QuestionType = (typeof QUESTION_TYPES)[number];

/** The types whose answers are typed by a person, and so get provenance tracking. */
export const WRITTEN_TYPES: QuestionType[] = ["short_text", "long_text"];

export const KnockoutSchema = z
  .object({
    /** For yes_no and single_choice: the answer(s) that pass. */
    accept: z.array(z.string()).optional(),
    /** For number: the smallest and largest value that pass. */
    min: z.number().optional(),
    max: z.number().optional(),
  })
  .strict();

export const QuestionSchema = z
  .object({
    id: z
      .string()
      .min(1)
      .max(60)
      .regex(/^[a-z0-9_]+$/, "ids are lowercase letters, digits and underscores"),
    label: z.string().min(1).max(500),
    type: z.enum(QUESTION_TYPES),
    required: z.boolean().default(false),
    help: z.string().max(500).default(""),
    options: z.array(z.string().min(1).max(200)).max(30).default([]),
    /** A screening rule. An answer outside it marks the application as not meeting a must-have. */
    knockout: KnockoutSchema.optional(),
    /** For long_text: a soft limit shown to the applicant. */
    maxWords: z.number().int().positive().optional(),
    /** For file: what may be attached. One file per question, up to 10 MB. */
    accept: z.enum(["image", "pdf", "image_or_pdf"]).default("image_or_pdf"),
  })
  .strict();

export type FormQuestion = z.infer<typeof QuestionSchema>;

export const QuestionsSchema = z
  .array(QuestionSchema)
  .max(40)
  .superRefine((qs, ctx) => {
    const seen = new Set<string>();
    qs.forEach((q, i) => {
      if (seen.has(q.id)) ctx.addIssue({ code: "custom", path: [i, "id"], message: `duplicate id "${q.id}"` });
      seen.add(q.id);
      if (["name", "email"].includes(q.id))
        ctx.addIssue({ code: "custom", path: [i, "id"], message: `"${q.id}" is asked on every form already; drop it` });
      if ((q.type === "single_choice" || q.type === "multi_choice") && q.options.length < 2)
        ctx.addIssue({ code: "custom", path: [i, "options"], message: "a choice question needs at least two options" });
      if (q.knockout?.accept && q.type === "single_choice") {
        const bad = q.knockout.accept.filter((a) => !q.options.includes(a));
        if (bad.length) ctx.addIssue({ code: "custom", path: [i, "knockout"], message: `knockout accepts ${bad.join(", ")}, which is not an option` });
      }
    });
  });

/** Read stored JSON leniently: anything malformed is dropped rather than breaking the page. */
export function readQuestions(json: unknown): FormQuestion[] {
  if (!Array.isArray(json)) return [];
  const out: FormQuestion[] = [];
  for (const q of json) {
    const parsed = QuestionSchema.safeParse(q);
    if (parsed.success) out.push(parsed.data);
  }
  return out;
}

export type KnockoutResult = { questionId: string; label: string; answer: string; expected: string };

/** Which must-haves an answer set misses. Empty means every knockout passed. */
export function failedKnockouts(questions: FormQuestion[], answers: Record<string, string>): KnockoutResult[] {
  const failed: KnockoutResult[] = [];
  for (const q of questions) {
    const k = q.knockout;
    if (!k) continue;
    const a = (answers[q.id] ?? "").trim();
    if (k.accept) {
      const given = q.type === "multi_choice" ? a.split("\n").filter(Boolean) : [a];
      if (!given.some((g) => k.accept!.includes(g)))
        failed.push({ questionId: q.id, label: q.label, answer: a, expected: k.accept.join(" or ") });
    }
    if (k.min !== undefined || k.max !== undefined) {
      const n = Number(a.replace(/[, ]/g, ""));
      const ok = a !== "" && Number.isFinite(n) && (k.min === undefined || n >= k.min) && (k.max === undefined || n <= k.max);
      if (!ok)
        failed.push({
          questionId: q.id,
          label: q.label,
          answer: a,
          expected: k.min !== undefined && k.max !== undefined ? `${k.min} to ${k.max}` : k.min !== undefined ? `at least ${k.min}` : `at most ${k.max}`,
        });
    }
  }
  return failed;
}

/** Check one answer against its question's type. Returns an error to show, or null. */
export function validateAnswer(q: FormQuestion, value: string): string | null {
  const v = value.trim();
  if (!v) return q.required ? "This one is required." : null;
  switch (q.type) {
    case "email":
      return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) ? null : "That doesn't look like an email address.";
    case "url":
      return /^https?:\/\/\S+$/i.test(v) ? null : "Paste a full link starting with http.";
    case "number":
      return Number.isFinite(Number(v.replace(/[, ]/g, ""))) ? null : "Enter a number.";
    case "yes_no":
      return v === "Yes" || v === "No" ? null : "Choose yes or no.";
    case "single_choice":
      return q.options.includes(v) ? null : "Choose one of the options.";
    case "file":
      return null;
    case "multi_choice":
      return v.split("\n").every((x) => q.options.includes(x)) ? null : "Choose from the options.";
    default:
      return v.length > 20000 ? "That's longer than this form accepts." : null;
  }
}
