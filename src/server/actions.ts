"use server";

import type { JobStatus, ListingStatus, Stage } from "@prisma/client";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createSession, destroySession, requireUser } from "@/lib/auth";
import * as jobs from "@/lib/data/jobs";
import * as listings from "@/lib/data/listings";
import * as applications from "@/lib/data/applications";
import * as connections from "@/lib/data/connections";
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
  await applications.moveStage(user.id, applicationId, stage);
  revalidatePath(`/applications/${applicationId}`);
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
