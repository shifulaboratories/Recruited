"use server";

import type { JobStatus, ListingStatus, Stage, Tier } from "@prisma/client";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createSession, destroySession, requireUser } from "@/lib/auth";
import * as jobs from "@/lib/data/jobs";
import * as listings from "@/lib/data/listings";
import * as applications from "@/lib/data/applications";
import * as connections from "@/lib/data/connections";
import * as messages from "@/lib/data/messages";
import * as imports from "@/lib/data/imports";
import * as interviews from "@/lib/data/interviews";
import { updateAccount, userByLogin } from "@/lib/data/users";
import { UserError } from "@/lib/data/errors";

/**
 * Server actions for the UI. None takes a userId: the caller is resolved from
 * the session cookie, and every rule lives in src/lib/data, shared with the
 * MCP tools.
 */

export type ActionState = { error?: string; ok?: string } | undefined;

async function attempt(fn: () => Promise<void>, okMessage?: string): Promise<ActionState> {
  try {
    await fn();
    return okMessage ? { ok: okMessage } : undefined;
  } catch (e) {
    if (e instanceof UserError) return { error: e.message };
    throw e;
  }
}

export async function login(_: ActionState, form: FormData): Promise<ActionState> {
  const user = await userByLogin(String(form.get("email") ?? ""), String(form.get("password") ?? ""));
  if (!user) return { error: "That email and password don't match an account." };
  await createSession(user.id);
  redirect("/jobs");
}

export async function logout() {
  await destroySession();
  redirect("/login");
}

export async function createJob(_: ActionState, form: FormData): Promise<ActionState> {
  const user = await requireUser();
  let id = "";
  const r = await attempt(async () => {
    const j = await jobs.createJob(user.id, { title: String(form.get("title") ?? ""), description: String(form.get("description") ?? "") });
    id = j.id;
  });
  if (r?.error) return r;
  redirect(`/jobs/${id}`);
}

export async function setJobStatus(jobId: string, status: JobStatus) {
  const user = await requireUser();
  await jobs.updateJob(user.id, jobId, { status });
  revalidatePath(`/jobs/${jobId}`);
}

export async function setListingStatus(listingId: string, status: ListingStatus) {
  const user = await requireUser();
  const l = await listings.updateListing(user.id, listingId, { status });
  revalidatePath(`/jobs/${l.jobId}`);
}

export async function moveStage(applicationId: string, stage: Stage) {
  const user = await requireUser();
  const a = await applications.moveStage(user.id, applicationId, stage);
  revalidatePath(`/applications/${applicationId}`);
  revalidatePath(`/jobs/${a.jobId}`);
}

export async function addNote(_: ActionState, form: FormData): Promise<ActionState> {
  const user = await requireUser();
  const id = String(form.get("applicationId") ?? "");
  const r = await attempt(() => applications.addNote(user.id, id, String(form.get("body") ?? ""), "app").then(() => {}));
  revalidatePath(`/applications/${id}`);
  return r;
}

export async function saveAccount(_: ActionState, form: FormData): Promise<ActionState> {
  const user = await requireUser();
  return attempt(
    () =>
      updateAccount(user.id, {
        name: String(form.get("name") ?? ""),
        companyName: String(form.get("companyName") ?? ""),
        email: String(form.get("email") ?? ""),
        password: String(form.get("password") ?? "") || undefined,
      }).then(() => revalidatePath("/settings")),
    "Saved.",
  );
}

export async function rotateConnection(connectionId: string) {
  const user = await requireUser();
  await connections.rotateConnection(user.id, connectionId);
  revalidatePath("/settings");
}

export async function setTier(applicationId: string, tier: Tier | null) {
  const user = await requireUser();
  const a = await applications.setTier(user.id, applicationId, tier, "", "app");
  revalidatePath(`/applications/${applicationId}`);
  revalidatePath(`/jobs/${a.jobId}`);
}

export async function acceptProposal(applicationId: string) {
  const user = await requireUser();
  const a = await applications.acceptProposal(user.id, applicationId);
  revalidatePath(`/applications/${applicationId}`);
  revalidatePath(`/jobs/${a.jobId}`);
}

export async function saveMessageDraft(_: ActionState, form: FormData): Promise<ActionState> {
  const user = await requireUser();
  const id = String(form.get("applicationId") ?? "");
  const r = await attempt(
    () =>
      messages
        .saveMessage(user.id, {
          applicationId: id,
          kind: String(form.get("kind") ?? "OTHER"),
          subject: String(form.get("subject") ?? ""),
          body: String(form.get("body") ?? ""),
          writtenBy: "app",
        })
        .then(() => {}),
    "Saved as a draft.",
  );
  revalidatePath(`/applications/${id}`);
  return r;
}

export async function markMessageSent(messageId: string) {
  const user = await requireUser();
  const m = await messages.updateMessage(user.id, messageId, { status: "SENT" });
  revalidatePath(`/applications/${m.applicationId}`);
}

export async function deleteMessageDraft(applicationId: string, messageId: string) {
  const user = await requireUser();
  await messages.deleteDraft(user.id, messageId);
  revalidatePath(`/applications/${applicationId}`);
}

export type ImportResult = Awaited<ReturnType<typeof imports.importApplicants>>;

/** Preview (dryRun) or run an import from the job page. Returns the same report the tool does. */
export async function importApplicantsAction(input: {
  jobId: string;
  csv: string;
  listingId?: string;
  dryRun: boolean;
}): Promise<{ error?: string; result?: ImportResult }> {
  const user = await requireUser();
  try {
    const result = await imports.importApplicants(user.id, {
      jobId: input.jobId,
      csv: input.csv,
      listingId: input.listingId || undefined,
      dryRun: input.dryRun,
      writtenBy: "app",
    });
    if (!input.dryRun) revalidatePath(`/jobs/${input.jobId}`);
    return { result };
  } catch (e) {
    if (e instanceof UserError) return { error: e.message };
    throw e;
  }
}

const field = (form: FormData, k: string) => {
  const v = form.get(k);
  return typeof v === "string" && v.trim() !== "" ? v : undefined;
};

export async function addInterviewAction(_: ActionState, form: FormData): Promise<ActionState> {
  const user = await requireUser();
  const id = String(form.get("applicationId") ?? "");
  const r = await attempt(
    () =>
      interviews
        .addInterview(user.id, id, {
          title: field(form, "title"),
          format: field(form, "format"),
          scheduledAt: field(form, "scheduledAt"),
          durationMin: field(form, "durationMin") ? Number(field(form, "durationMin")) : undefined,
          interviewers: field(form, "interviewers"),
          location: field(form, "location"),
        })
        .then(() => {}),
  );
  revalidatePath(`/applications/${id}`);
  return r;
}

export async function setInterviewStatus(applicationId: string, interviewId: string, status: string) {
  const user = await requireUser();
  await interviews.updateInterview(user.id, interviewId, { status });
  revalidatePath(`/applications/${applicationId}`);
}

export async function addScorecardAction(_: ActionState, form: FormData): Promise<ActionState> {
  const user = await requireUser();
  const appId = String(form.get("applicationId") ?? "");
  const r = await attempt(
    () =>
      interviews
        .addScorecard(user.id, String(form.get("interviewId") ?? ""), {
          interviewer: String(form.get("interviewer") ?? ""),
          recommendation: String(form.get("recommendation") ?? ""),
          summary: field(form, "summary"),
          writtenBy: "app",
        })
        .then(() => {}),
  );
  revalidatePath(`/applications/${appId}`);
  return r;
}

export async function recordOfferAction(_: ActionState, form: FormData): Promise<ActionState> {
  const user = await requireUser();
  const id = String(form.get("applicationId") ?? "");
  const r = await attempt(
    () =>
      interviews
        .recordOffer(user.id, id, {
          title: field(form, "title"),
          payAmount: field(form, "payAmount") ? Number(String(field(form, "payAmount")).replace(/[^0-9]/g, "")) : undefined,
          payCurrency: field(form, "payCurrency"),
          payPeriod: field(form, "payPeriod"),
          startDate: field(form, "startDate"),
          hours: field(form, "hours"),
          terms: field(form, "terms"),
          respondBy: field(form, "respondBy"),
        })
        .then(() => {}),
    "Saved as a new version.",
  );
  revalidatePath(`/applications/${id}`);
  return r;
}

export async function setOfferStatusAction(applicationId: string, offerId: string, status: string) {
  const user = await requireUser();
  await interviews.setOfferStatus(user.id, offerId, status);
  revalidatePath(`/applications/${applicationId}`);
}
