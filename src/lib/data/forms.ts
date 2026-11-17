import type { FormKind } from "@prisma/client";
import { db } from "@/lib/db";
import { notFound, UserError } from "@/lib/data/errors";
import { requireJob } from "@/lib/data/jobs";
import { QuestionsSchema, readQuestions, type FormQuestion } from "@/lib/forms";
import { slug } from "@/lib/ids";

/**
 * Forms: the application form a job's apply page shows, and screening forms
 * sent to an applicant afterwards. Questions are replaced whole on save, which
 * is safe because every answer stores the label it was asked under.
 */

function parse(questions: unknown): FormQuestion[] {
  const r = QuestionsSchema.safeParse(questions);
  if (!r.success) {
    const msg = r.error.issues.map((i) => `${i.path.join(".") || "questions"}: ${i.message}`).join("; ");
    throw new UserError(`The questions don't fit the form format: ${msg}`);
  }
  return r.data;
}

/**
 * The job's application form, created on first save and replaced after that.
 * A job has at most one.
 */
export async function setApplicationForm(userId: string, jobId: string, questions: unknown, name = "") {
  const job = await requireJob(userId, jobId);
  const qs = parse(questions);
  const existing = await db.form.findFirst({ where: { userId, jobId: job.id, kind: "APPLICATION" } });
  if (existing) return db.form.update({ where: { id: existing.id }, data: { questions: qs, ...(name ? { name } : {}) } });
  return db.form.create({ data: { userId, jobId: job.id, kind: "APPLICATION", name: name || "Application", questions: qs, slug: slug() } });
}

export async function createScreeningForm(userId: string, jobId: string, name: string, questions: unknown) {
  const job = await requireJob(userId, jobId);
  const qs = parse(questions);
  if (!qs.length) throw new UserError("A screening form needs at least one question.");
  return db.form.create({ data: { userId, jobId: job.id, kind: "SCREENING", name: name || "Screening", questions: qs, slug: slug() } });
}

export async function requireForm(userId: string, formId: string) {
  const f = await db.form.findFirst({ where: { id: formId, userId, job: { archivedAt: null } } });
  if (!f) notFound("form");
  return f;
}

/** Replace a form's questions (and optionally its name). Read it first: what you send is all it will ask. */
export async function replaceFormQuestions(userId: string, formId: string, questions: unknown, name?: string) {
  const f = await requireForm(userId, formId);
  const qs = parse(questions);
  if (f.kind === "SCREENING" && !qs.length) throw new UserError("A screening form needs at least one question.");
  return db.form.update({ where: { id: f.id }, data: { questions: qs, ...(name ? { name } : {}) } });
}

export async function getForm(userId: string, formId: string) {
  const f = await requireForm(userId, formId);
  return { ...f, questions: readQuestions(f.questions) };
}

export async function listForms(userId: string, jobId: string, kind?: FormKind) {
  const job = await requireJob(userId, jobId);
  const forms = await db.form.findMany({ where: { userId, jobId: job.id, ...(kind ? { kind } : {}) }, orderBy: { createdAt: "asc" } });
  return forms.map((f) => ({ ...f, questions: readQuestions(f.questions) }));
}
