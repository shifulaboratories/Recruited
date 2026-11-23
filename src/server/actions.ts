"use server";

import type { JobStatus, ListingStatus, Stage, Tier } from "@prisma/client";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { baseUrl, createSession, destroySession, requireSeat } from "@/lib/auth";
import { headers } from "next/headers";
import * as jobs from "@/lib/data/jobs";
import * as listings from "@/lib/data/listings";
import * as applications from "@/lib/data/applications";
import * as connections from "@/lib/data/connections";
import * as messages from "@/lib/data/messages";
import * as mailbox from "@/lib/data/mailbox";
import * as privacy from "@/lib/data/privacy";
import * as imports from "@/lib/data/imports";
import * as interviews from "@/lib/data/interviews";
import * as probes from "@/lib/data/probes";
import * as references from "@/lib/data/references";
import * as share from "@/lib/data/share";
import * as closeout from "@/lib/data/closeout";
import * as sample from "@/lib/data/sample";
import * as users from "@/lib/data/users";
import * as settings from "@/lib/data/settings";
import * as team from "@/lib/data/team";
import { updateAccount, userByLogin } from "@/lib/data/users";
import { overLimit } from "@/lib/data/ratelimit";
import { UserError } from "@/lib/data/errors";
import { toolAllowed } from "@/lib/team";

/**
 * Server actions for the UI. None takes a userId: the caller is resolved from
 * the session cookie, and every rule lives in src/lib/data, shared with the
 * MCP tools.
 */

export type ActionState = { error?: string; ok?: string } | undefined;

/**
 * The signed-in person's seat, after checking it may do this: owner-only,
 * owners and recruiters only, or reaching the given application, interview or
 * job. A refusal is a UserError; the screens hide what a role can't do, so one
 * only reaches someone who went around them.
 */
async function seated(check: { owner?: true; full?: true; tool?: string; applicationId?: string; interviewId?: string; jobId?: string } = {}) {
  const s = await requireSeat();
  if (check.owner) team.requireOwner(s.seat);
  if (check.full) team.requireFull(s.seat);
  // The same line the role's tools draw: what an assistant can't do for them, the screen can't either.
  if (check.tool && !toolAllowed(s.seat.role, check.tool)) throw new UserError("You don't have access to that in this workspace.");
  await team.reach(s.seat, { applicationId: check.applicationId, interviewId: check.interviewId, jobId: check.jobId });
  return s;
}

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
  const { userId } = await seated({ owner: true });
  const off = form.get("off") === "1";
  const r = await attempt(async () => {
    await settings.setTurnstile(userId, off ? { siteKey: "", secretKey: "" } : { siteKey: String(form.get("siteKey") ?? ""), secretKey: String(form.get("secretKey") ?? "") });
  }, off ? "Turned off." : "Turned on. Open an apply page to see the check.");
  revalidatePath("/settings");
  return r;
}

export async function logout() {
  await destroySession();
  redirect("/login");
}

export async function createJob(_: ActionState, form: FormData): Promise<ActionState> {
  const { userId } = await seated({ full: true });
  let id = "";
  const r = await attempt(async () => {
    const j = await jobs.createJob(userId, { title: String(form.get("title") ?? ""), description: String(form.get("description") ?? "") });
    id = j.id;
  });
  if (r?.error) return r;
  redirect(`/jobs/${id}`);
}

export async function setJobStatus(jobId: string, status: JobStatus) {
  const { userId } = await seated({ full: true });
  await jobs.updateJob(userId, jobId, { status });
  revalidatePath(`/jobs/${jobId}`);
}

export async function setListingStatus(listingId: string, status: ListingStatus) {
  const { userId } = await seated({ full: true });
  const l = await listings.updateListing(userId, listingId, { status });
  revalidatePath(`/jobs/${l.jobId}`);
}

/** Move to a stage, or to one of the job's own steps by id (the board and the applicant page pass the step). */
export async function moveStage(applicationId: string, stage: Stage | undefined, step?: string) {
  const { userId } = await seated({ tool: "move_stage", applicationId });
  const a = await applications.moveStage(userId, applicationId, stage, step);
  revalidatePath(`/applications/${applicationId}`);
  revalidatePath(`/jobs/${a.jobId}`);
}

/** Replace a job's own stages from the job page's editor. */
export async function setJobStepsAction(jobId: string, steps: { id?: string; label: string; stage: string }[]): Promise<ActionState> {
  const { userId } = await seated({ full: true, jobId });
  return attempt(async () => {
    await jobs.setJobSteps(userId, jobId, steps);
    revalidatePath(`/jobs/${jobId}`);
  }, "Saved.");
}

/** The Applicants page's bar: move everyone ticked. A hiring manager may, for applicants on their jobs. */
export async function bulkMoveAction(ids: string[], stage: Stage): Promise<ActionState> {
  const { userId, seat } = await seated({ tool: "move_stage" });
  for (const applicationId of ids) await team.reach(seat, { applicationId });
  const r = await attempt(async () => {
    const moved = await applications.moveMany(userId, ids, stage);
    for (const jobId of new Set(moved.map((m) => m.jobId))) revalidatePath(`/jobs/${jobId}`);
  }, `Moved ${ids.length}.`);
  revalidatePath("/applications");
  return r;
}

export type BulkDraftState = { error?: string; drafted?: { messageId: string; name: string }[]; skipped?: string[] } | undefined;

/** One message to everyone ticked, saved as a draft each. Sends nothing. */
export async function bulkDraftAction(ids: string[], input: { kind: string; subject: string; body: string }): Promise<BulkDraftState> {
  const { userId } = await seated({ full: true });
  try {
    const r = await messages.draftMany(userId, { applicationIds: ids, ...input, dryRun: false, writtenBy: "app", baseUrl: await baseUrl() });
    if (r.dryRun) return undefined;
    for (const id of ids) revalidatePath(`/applications/${id}`);
    return { drafted: r.applicants.map((a) => ({ messageId: a.messageId, name: a.name })), skipped: r.skipped.map((x) => x.name) };
  } catch (e) {
    if (e instanceof UserError) return { error: e.message };
    throw e;
  }
}

/** Send the drafts just saved, after the person pressed Send on them. */
export async function bulkSendAction(messageIds: string[]): Promise<ActionState> {
  const { userId } = await seated({ full: true });
  try {
    const r = await mailbox.sendMany(userId, messageIds);
    revalidatePath("/applications");
    return r.failed ? { error: `Sent ${r.sent}. ${r.failed} didn't go: ${r.results.find((x) => !x.sent)?.error ?? ""}` } : { ok: `Sent ${r.sent}.` };
  } catch (e) {
    if (e instanceof UserError) return { error: e.message };
    throw e;
  }
}

export async function addNote(_: ActionState, form: FormData): Promise<ActionState> {
  const id = String(form.get("applicationId") ?? "");
  const r = await attempt(async () => {
    const { userId } = await seated({ applicationId: id });
    await applications.addNote(userId, id, String(form.get("body") ?? ""), "app");
  });
  revalidatePath(`/applications/${id}`);
  return r;
}

export async function saveAccount(_: ActionState, form: FormData): Promise<ActionState> {
  const { person, seat, userId } = await requireSeat();
  // Each settings card posts only its own fields; a field that isn't in the form is left alone.
  const opt = (k: string) => (form.has(k) ? String(form.get(k) ?? "") : undefined);
  const company = ["companyName", "companyAbout", "companyWebsite", "careersSlug", "retentionMonths", "privacyEmail"].some((k) => form.has(k));
  return attempt(async () => {
    // Your own account: name, email, password.
    await updateAccount(person.id, { name: opt("name"), email: opt("email"), password: opt("password") || undefined });
    if (company) {
      // The workspace's company profile and privacy settings: the owner's.
      team.requireOwner(seat);
      await updateAccount(userId, {
        companyName: opt("companyName"),
        companyAbout: opt("companyAbout"),
        companyWebsite: opt("companyWebsite"),
        careersSlug: opt("careersSlug"),
      });
      if (form.has("retentionMonths") || form.has("privacyEmail"))
        await privacy.setRetention(userId, {
          months: form.has("retentionMonths") ? Number(form.get("retentionMonths")) : undefined,
          privacyEmail: opt("privacyEmail"),
        });
    }
    revalidatePath("/settings");
  }, "Saved.");
}

export async function rotateConnection(connectionId: string) {
  const { person } = await requireSeat();
  await connections.rotateConnection(person.id, connectionId);
  revalidatePath("/settings");
}

export async function setTier(applicationId: string, tier: Tier | null) {
  const { userId } = await seated({ applicationId });
  const a = await applications.setTier(userId, applicationId, tier, "", "app");
  revalidatePath(`/applications/${applicationId}`);
  revalidatePath(`/jobs/${a.jobId}`);
}

export async function acceptProposal(applicationId: string) {
  const { userId } = await seated({ applicationId });
  const a = await applications.acceptProposal(userId, applicationId);
  revalidatePath(`/applications/${applicationId}`);
  revalidatePath(`/jobs/${a.jobId}`);
}

export async function saveMessageDraft(_: ActionState, form: FormData): Promise<ActionState> {
  const { userId } = await seated({ full: true });
  const id = String(form.get("applicationId") ?? "");
  const r = await attempt(
    () =>
      messages
        .saveMessage(userId, {
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
  const { userId } = await seated({ full: true });
  const m = await messages.updateMessage(userId, messageId, { status: "SENT" });
  revalidatePath(`/applications/${m.applicationId}`);
}

/** The Send button on a draft. The click is the person's yes. */
export async function sendMessageAction(_: ActionState, form: FormData): Promise<ActionState> {
  const { userId } = await seated({ full: true });
  const id = String(form.get("messageId") ?? "");
  const r = await attempt(() => mailbox.sendMessage(userId, id).then(() => {}), "Sent.");
  revalidatePath(`/applications/${String(form.get("applicationId") ?? "")}`);
  return r;
}

export async function connectMailboxAction(_: ActionState, form: FormData): Promise<ActionState> {
  const { userId } = await seated({ owner: true });
  const siteUrl = await baseUrl();
  const r = await attempt(
    () =>
      mailbox
        .connectMailbox(userId, {
          host: String(form.get("host") ?? ""),
          port: Number(form.get("port")) || undefined,
          security: String(form.get("security") ?? "starttls"),
          username: String(form.get("username") ?? ""),
          password: String(form.get("password") ?? "") || undefined,
          fromEmail: String(form.get("fromEmail") ?? ""),
          fromName: String(form.get("fromName") ?? ""),
          siteUrl,
        })
        .then(() => {}),
    "Signed in and saved. Receipts go out from this address now.",
  );
  revalidatePath("/settings");
  return r;
}

/** Delete everything about one applicant. The typed name is the confirmation. */
export async function deleteApplicantAction(_: ActionState, form: FormData): Promise<ActionState> {
  const { userId } = await seated({ owner: true });
  const id = String(form.get("applicationId") ?? "");
  const r = await attempt(async () => {
    const preview = await privacy.deleteApplicantData(userId, { applicationId: id }, true);
    if (!preview.wouldDelete || String(form.get("confirm") ?? "").trim().toLowerCase() !== preview.wouldDelete.name.trim().toLowerCase())
      throw new UserError("Type their name exactly as shown to confirm.");
    await privacy.deleteApplicantData(userId, { applicationId: id }, false);
  });
  if (r?.error) return r;
  redirect("/applications");
}

export async function disconnectMailboxAction() {
  const { userId } = await seated({ owner: true });
  await mailbox.disconnectMailbox(userId);
  revalidatePath("/settings");
}

export async function saveReceiptAction(_: ActionState, form: FormData): Promise<ActionState> {
  const { userId } = await seated({ owner: true });
  const siteUrl = await baseUrl();
  const r = await attempt(
    () =>
      mailbox
        .setReceipt(userId, { on: form.get("on") === "on", subject: String(form.get("subject") ?? ""), body: String(form.get("body") ?? ""), siteUrl })
        .then(() => {}),
    "Saved.",
  );
  revalidatePath("/settings");
  return r;
}

export async function deleteMessageDraft(applicationId: string, messageId: string) {
  const { userId } = await seated({ full: true });
  await messages.deleteDraft(userId, messageId);
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
  const { userId } = await seated({ full: true });
  try {
    const result = await imports.importApplicants(userId, {
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
  const id = String(form.get("applicationId") ?? "");
  const { userId } = await seated({ applicationId: id });
  const r = await attempt(
    () =>
      interviews
        .addInterview(userId, id, {
          title: field(form, "title"),
          format: field(form, "format"),
          scheduledAt: field(form, "scheduledAt"),
          durationMin: field(form, "durationMin") ? Number(field(form, "durationMin")) : undefined,
          interviewers: field(form, "interviewers"),
          location: field(form, "location"),
          memberIds: form.has("memberId") ? form.getAll("memberId").map(String) : undefined,
        })
        .then(() => {}),
  );
  revalidatePath(`/applications/${id}`);
  return r;
}

export async function setInterviewStatus(applicationId: string, interviewId: string, status: string) {
  const { userId } = await seated({ interviewId });
  await interviews.updateInterview(userId, interviewId, { status });
  revalidatePath(`/applications/${applicationId}`);
}

/** Make an interviewer's scorecard link; the message carries the link to copy. */
export async function scorecardLinkAction(_: ActionState, form: FormData): Promise<ActionState> {
  try {
    const interviewId = String(form.get("interviewId") ?? "");
    const { userId } = await seated({ interviewId });
    const l = await interviews.scorecardLink(userId, interviewId, String(form.get("interviewer") ?? ""));
    return { ok: `${await baseUrl()}${l.path}` };
  } catch (e) {
    if (e instanceof UserError) return { error: e.message };
    throw e;
  }
}

export async function addScorecardAction(_: ActionState, form: FormData): Promise<ActionState> {
  const appId = String(form.get("applicationId") ?? "");
  const interviewId = String(form.get("interviewId") ?? "");
  const { userId, seat, person } = await seated({ interviewId });
  const r = await attempt(
    () =>
      interviews
        .addScorecard(userId, interviewId, {
          interviewer: seat.panelId ? person.name || person.email : String(form.get("interviewer") ?? ""),
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
  const { userId } = await seated({ full: true });
  const id = String(form.get("applicationId") ?? "");
  const r = await attempt(
    () =>
      interviews
        .recordOffer(userId, id, {
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
  const { userId } = await seated({ full: true });
  await interviews.setOfferStatus(userId, offerId, status);
  revalidatePath(`/applications/${applicationId}`);
}

export async function toggleProbe(applicationId: string, index: number, asked: boolean) {
  const { userId } = await seated({ applicationId });
  await probes.markProbe(userId, applicationId, index, { asked });
  revalidatePath(`/applications/${applicationId}`);
}

export async function requestReferenceAction(_: ActionState, form: FormData): Promise<ActionState> {
  const { userId } = await seated({ full: true });
  const id = String(form.get("applicationId") ?? "");
  const r = await attempt(
    () =>
      references
        .requestReference(userId, id, { name: String(form.get("name") ?? ""), email: String(form.get("email") ?? ""), relation: String(form.get("relation") ?? "") })
        .then(() => {}),
    "Link ready. Copy it below and send it to them.",
  );
  revalidatePath(`/applications/${id}`);
  return r;
}

export async function deleteReferenceAction(applicationId: string, referenceId: string) {
  const { userId } = await seated({ full: true });
  await references.deleteReference(userId, referenceId);
  revalidatePath(`/applications/${applicationId}`);
}

export async function shareApplicantAction(applicationId: string, shared: boolean) {
  const { userId } = await seated({ full: true });
  await share.shareApplicant(userId, applicationId, shared);
  revalidatePath(`/applications/${applicationId}`);
}

export async function offerTimesAction(_: ActionState, form: FormData): Promise<ActionState> {
  const id = String(form.get("applicationId") ?? "");
  const times = form.getAll("slot").map(String).filter(Boolean);
  const r = await attempt(async () => {
    if (!times.length) throw new UserError("Pick at least one time.");
    const interviewId = String(form.get("interviewId") ?? "");
    const { userId } = await seated({ interviewId });
    await interviews.offerTimes(userId, interviewId, times);
  }, "Times offered. Send them the booking link.");
  revalidatePath(`/applications/${id}`);
  return r;
}

export async function closeOutAction(_: ActionState, form: FormData): Promise<ActionState> {
  const { userId } = await seated({ full: true });
  const jobId = String(form.get("jobId") ?? "");
  let drafted = 0;
  const r = await attempt(async () => {
    const out = await closeout.closeOutJob(userId, jobId, {
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
  const { userId } = await seated({ owner: true });
  const r = await attempt(() => sample.loadSampleWorkspace(userId).then(() => {}));
  if (r?.error) return;
  revalidatePath("/jobs");
  revalidatePath("/settings");
}

export async function wipeSampleAction() {
  const { userId } = await seated({ owner: true });
  await sample.wipeSampleWorkspace(userId);
  revalidatePath("/jobs");
  revalidatePath("/settings");
  revalidatePath("/applications");
}

// ---------------------------------------------------------------------------
// The team
// ---------------------------------------------------------------------------

/** Make an invite link; the message carries the link to copy. Owner only. */
export async function inviteTeammateAction(_: ActionState, form: FormData): Promise<ActionState> {
  try {
    const { userId } = await seated({ owner: true });
    const i = await team.inviteTeammate(userId, {
      email: String(form.get("email") ?? ""),
      name: String(form.get("name") ?? ""),
      role: String(form.get("role") ?? ""),
      jobIds: form.getAll("jobId").map(String),
    });
    revalidatePath("/settings");
    return { ok: `${await baseUrl()}${i.path}` };
  } catch (e) {
    if (e instanceof UserError) return { error: e.message };
    throw e;
  }
}

export async function updateTeammateAction(_: ActionState, form: FormData): Promise<ActionState> {
  const r = await attempt(async () => {
    const { userId } = await seated({ owner: true });
    const role = String(form.get("role") ?? "");
    await team.updateTeammate(userId, String(form.get("memberId") ?? ""), { role, jobIds: role === "HIRING_MANAGER" ? form.getAll("jobId").map(String) : undefined });
  }, "Saved.");
  revalidatePath("/settings");
  return r;
}

export async function removeTeammateAction(memberId: string) {
  const { userId } = await seated({ owner: true });
  await team.updateTeammate(userId, memberId, { remove: true });
  revalidatePath("/settings");
}

export async function revokeInviteAction(inviteId: string) {
  const { userId } = await seated({ owner: true });
  await team.revokeInvite(userId, inviteId);
  revalidatePath("/settings");
}

/** The join page's form: make the teammate's account and sign them in. */
export async function acceptInviteAction(_: ActionState, form: FormData): Promise<ActionState> {
  const password = String(form.get("password") ?? "");
  if (password !== String(form.get("confirm") ?? "")) return { error: "The two passwords don't match." };
  let userId = "";
  const r = await attempt(async () => {
    userId = (await team.acceptInvite(String(form.get("token") ?? ""), { name: String(form.get("name") ?? ""), password })).userId;
  });
  if (r?.error) return r;
  await createSession(userId);
  redirect("/jobs");
}

/** An interviewer's "Write your scorecard": their own one-time scorecard page for this interview. */
export async function openMyScorecard(interviewId: string) {
  const { userId, person } = await seated({ interviewId });
  const l = await interviews.scorecardLink(userId, interviewId, person.name || person.email);
  redirect(l.path);
}
