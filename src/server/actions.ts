"use server";

import type { JobStatus, ListingStatus, Stage, Tier } from "@prisma/client";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { baseUrl, createSession, destroySession, requireUser } from "@/lib/auth";
import { headers } from "next/headers";
import * as jobs from "@/lib/data/jobs";
import * as listings from "@/lib/data/listings";
import * as applications from "@/lib/data/applications";
import * as connections from "@/lib/data/connections";
import * as messages from "@/lib/data/messages";
import * as mailbox from "@/lib/data/mailbox";
import * as imports from "@/lib/data/imports";
import * as interviews from "@/lib/data/interviews";
import * as probes from "@/lib/data/probes";
import * as references from "@/lib/data/references";
import * as share from "@/lib/data/share";
import * as closeout from "@/lib/data/closeout";
import * as sample from "@/lib/data/sample";
import * as users from "@/lib/data/users";
import * as settings from "@/lib/data/settings";
import { updateAccount, userByLogin } from "@/lib/data/users";
import { overLimit } from "@/lib/data/ratelimit";
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

/**
 * "Forgot your password?" This server sends no mail, so the link goes to the
 * server log, where whoever runs the instance reads it. The answer is the
 * same whether or not the address has an account.
 */
export async function forgotPassword(_: ActionState, form: FormData): Promise<ActionState> {
  const h = await headers();
  const request = new Request("http://local/reset", { headers: h });
  const email = String(form.get("email") ?? "").slice(0, 320);
  if (!(await overLimit(request, "reset", "forgot"))) {
    const r = email.trim() ? await users.resetLinkForEmail(email) : null;
    if (r) console.log(`\n  Password reset for ${r.email}, valid for ${r.minutes} minutes:\n    ${await baseUrl()}${users.resetPath(r.token)}\n`);
  }
  return {
    ok: "If that address has an account, a reset link is now in the server's log. Or ask Claude: it can give you one while it's connected.",
  };
}

export async function resetPassword(_: ActionState, form: FormData): Promise<ActionState> {
  const password = String(form.get("password") ?? "");
  if (password !== String(form.get("confirm") ?? "")) return { error: "The two passwords don't match." };
  let userId = "";
  const r = await attempt(async () => {
    userId = (await users.resetPassword(String(form.get("token") ?? ""), password)).userId;
  });
  if (r?.error) return r;
  await createSession(userId);
  redirect("/jobs");
}

export async function setSpamCheck(_: ActionState, form: FormData): Promise<ActionState> {
  const user = await requireUser();
  const off = form.get("off") === "1";
  const r = await attempt(async () => {
    await settings.setTurnstile(user.id, off ? { siteKey: "", secretKey: "" } : { siteKey: String(form.get("siteKey") ?? ""), secretKey: String(form.get("secretKey") ?? "") });
  }, off ? "Turned off." : "Turned on. Open an apply page to see the check.");
  revalidatePath("/settings");
  return r;
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
  // Each settings card posts only its own fields; a field that isn't in the form is left alone.
  const opt = (k: string) => (form.has(k) ? String(form.get(k) ?? "") : undefined);
  return attempt(
    () =>
      updateAccount(user.id, {
        name: opt("name"),
        companyName: opt("companyName"),
        companyAbout: opt("companyAbout"),
        companyWebsite: opt("companyWebsite"),
        careersSlug: opt("careersSlug"),
        email: opt("email"),
        password: opt("password") || undefined,
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

/** The Send button on a draft. The click is the person's yes. */
export async function sendMessageAction(_: ActionState, form: FormData): Promise<ActionState> {
  const user = await requireUser();
  const id = String(form.get("messageId") ?? "");
  const r = await attempt(() => mailbox.sendMessage(user.id, id).then(() => {}), "Sent.");
  revalidatePath(`/applications/${String(form.get("applicationId") ?? "")}`);
  return r;
}

export async function connectMailboxAction(_: ActionState, form: FormData): Promise<ActionState> {
  const user = await requireUser();
  const r = await attempt(
    () =>
      mailbox
        .connectMailbox(user.id, {
          host: String(form.get("host") ?? ""),
          port: Number(form.get("port")) || undefined,
          security: String(form.get("security") ?? "starttls"),
          username: String(form.get("username") ?? ""),
          password: String(form.get("password") ?? "") || undefined,
          fromEmail: String(form.get("fromEmail") ?? ""),
          fromName: String(form.get("fromName") ?? ""),
        })
        .then(() => {}),
    "Signed in and saved. Receipts go out from this address now.",
  );
  revalidatePath("/settings");
  return r;
}

export async function disconnectMailboxAction() {
  const user = await requireUser();
  await mailbox.disconnectMailbox(user.id);
  revalidatePath("/settings");
}

export async function saveReceiptAction(_: ActionState, form: FormData): Promise<ActionState> {
  const user = await requireUser();
  const r = await attempt(
    () =>
      mailbox
        .setReceipt(user.id, { on: form.get("on") === "on", subject: String(form.get("subject") ?? ""), body: String(form.get("body") ?? "") })
        .then(() => {}),
    "Saved.",
  );
  revalidatePath("/settings");
  return r;
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

export async function toggleProbe(applicationId: string, index: number, asked: boolean) {
  const user = await requireUser();
  await probes.markProbe(user.id, applicationId, index, { asked });
  revalidatePath(`/applications/${applicationId}`);
}

export async function requestReferenceAction(_: ActionState, form: FormData): Promise<ActionState> {
  const user = await requireUser();
  const id = String(form.get("applicationId") ?? "");
  const r = await attempt(
    () =>
      references
        .requestReference(user.id, id, { name: String(form.get("name") ?? ""), email: String(form.get("email") ?? ""), relation: String(form.get("relation") ?? "") })
        .then(() => {}),
    "Link ready. Copy it below and send it to them.",
  );
  revalidatePath(`/applications/${id}`);
  return r;
}

export async function deleteReferenceAction(applicationId: string, referenceId: string) {
  const user = await requireUser();
  await references.deleteReference(user.id, referenceId);
  revalidatePath(`/applications/${applicationId}`);
}

export async function shareApplicantAction(applicationId: string, shared: boolean) {
  const user = await requireUser();
  await share.shareApplicant(user.id, applicationId, shared);
  revalidatePath(`/applications/${applicationId}`);
}

export async function offerTimesAction(_: ActionState, form: FormData): Promise<ActionState> {
  const user = await requireUser();
  const id = String(form.get("applicationId") ?? "");
  const times = form.getAll("slot").map(String).filter(Boolean);
  const r = await attempt(async () => {
    if (!times.length) throw new UserError("Pick at least one time.");
    await interviews.offerTimes(user.id, String(form.get("interviewId") ?? ""), times);
  }, "Times offered. Send them the booking link.");
  revalidatePath(`/applications/${id}`);
  return r;
}

export async function closeOutAction(_: ActionState, form: FormData): Promise<ActionState> {
  const user = await requireUser();
  const jobId = String(form.get("jobId") ?? "");
  let drafted = 0;
  const r = await attempt(async () => {
    const out = await closeout.closeOutJob(user.id, jobId, {
      subject: String(form.get("subject") ?? ""),
      body: String(form.get("body") ?? ""),
      moveToRejected: form.get("moveToRejected") === "on",
      closeJob: form.get("closeJob") === "on",
      writtenBy: "app",
    });
    drafted = out.drafted ?? 0;
  });
  revalidatePath(`/jobs/${jobId}`);
  return r ?? { ok: drafted ? `${drafted} draft${drafted === 1 ? "" : "s"} saved. Each is waiting on the applicant's page to send.` : "Everyone has already heard back." };
}

export async function loadSampleAction() {
  const user = await requireUser();
  const r = await attempt(() => sample.loadSampleWorkspace(user.id).then(() => {}));
  if (r?.error) return;
  revalidatePath("/jobs");
  revalidatePath("/settings");
}

export async function wipeSampleAction() {
  const user = await requireUser();
  await sample.wipeSampleWorkspace(user.id);
  revalidatePath("/jobs");
  revalidatePath("/settings");
  revalidatePath("/applications");
}
