import { createHash, randomBytes } from "node:crypto";
import type { TeamRole, User } from "@prisma/client";
import { db } from "@/lib/db";
import { notFound, UserError } from "@/lib/data/errors";
import { hashPassword } from "@/lib/data/users";
import { MEMBER_ROLES, ROLE_LABEL, seesEverything } from "@/lib/team";

/**
 * Teams. A workspace is its owner's account: every content row carries the
 * owner's id as userId, and every data function takes it first, as before. A
 * teammate is a separate account with a Membership pointing at that workspace.
 *
 * Signing in or connecting resolves the PERSON (their session or their own MCP
 * token); seatFor turns them into a Seat: the workspace's id, which every data
 * call receives, plus the role that limits which calls are made. seatFor and
 * the invite functions are instance-level, like users.ts: the token or the
 * session is the credential. The rest takes the workspace's userId first.
 *
 * Narrow roles are checked twice: the tool or action has to be one the role
 * gets (toolAllowed in src/lib/team.ts), and every id it touches has to be one
 * the role reaches (reach, below). Lists are filtered by the same seat.
 */

export type Seat = {
  /** The workspace: the owner's account id. The first argument of every data call. */
  userId: string;
  /** Who is signed in or connected. Their own account, sessions and connections. */
  personId: string;
  role: TeamRole;
  /** A hiring manager's jobs. Undefined means every job. */
  jobIds: string[] | undefined;
  /** An interviewer's own id, to find the interviews they're on. Undefined for every other role. */
  panelId: string | undefined;
};

/** The seat a signed-in or connected person sits in. Instance-level: the caller resolved them from a credential. */
export async function seatFor(person: Pick<User, "id">): Promise<Seat> {
  const m = await db.membership.findUnique({ where: { userId: person.id } });
  if (!m) return { userId: person.id, personId: person.id, role: "OWNER", jobIds: undefined, panelId: undefined };
  return {
    userId: m.workspaceId,
    personId: person.id,
    role: m.role,
    jobIds: m.role === "HIRING_MANAGER" ? m.jobIds : undefined,
    panelId: m.role === "INTERVIEWER" ? person.id : undefined,
  };
}

function denied(seat: Seat, what: string): never {
  throw new UserError(`As ${ROLE_LABEL[seat.role].toLowerCase()} you don't have access to that ${what}. The workspace's owner decides what you see.`);
}

export function requireOwner(seat: Seat) {
  if (seat.role !== "OWNER") throw new UserError("Only the workspace's owner can do that.");
}

export function requireFull(seat: Seat) {
  if (!seesEverything(seat.role)) throw new UserError(`As ${ROLE_LABEL[seat.role].toLowerCase()} you can't do that here. Ask the workspace's owner or a recruiter.`);
}

/**
 * Throw unless this seat reaches every id given. Owners and recruiters reach
 * everything in their workspace (the data call itself still checks the id is
 * in the workspace). A hiring manager reaches their jobs and what hangs off
 * them; an interviewer reaches the interviews they're on and those applicants.
 */
export async function reach(seat: Seat, ids: { jobId?: string; applicationId?: string; interviewId?: string; uploadId?: string }) {
  if (seesEverything(seat.role)) return;
  const { userId } = seat;
  if (ids.uploadId) {
    const u = await db.upload.findFirst({ where: { id: ids.uploadId, userId }, select: { answer: { select: { submission: { select: { applicationId: true } } } } } });
    if (!u) notFound("file");
    await reach(seat, { applicationId: u.answer.submission.applicationId });
  }
  if (seat.jobIds) {
    const jobs = seat.jobIds;
    if (ids.jobId && !jobs.includes(ids.jobId)) denied(seat, "job");
    if (ids.applicationId) {
      const a = await db.application.findFirst({ where: { id: ids.applicationId, userId }, select: { jobId: true } });
      if (!a) notFound("application");
      if (!jobs.includes(a.jobId)) denied(seat, "applicant");
    }
    if (ids.interviewId) {
      const i = await db.interview.findFirst({ where: { id: ids.interviewId, userId }, select: { application: { select: { jobId: true } } } });
      if (!i) notFound("interview");
      if (!jobs.includes(i.application.jobId)) denied(seat, "interview");
    }
    return;
  }
  if (seat.panelId) {
    const mine = { userId, memberIds: { has: seat.panelId } };
    if (ids.jobId && !(await db.interview.count({ where: { ...mine, application: { jobId: ids.jobId } } }))) denied(seat, "job");
    if (ids.applicationId && !(await db.interview.count({ where: { ...mine, applicationId: ids.applicationId } }))) denied(seat, "applicant");
    if (ids.interviewId && !(await db.interview.count({ where: { ...mine, id: ids.interviewId } }))) denied(seat, "interview");
    return;
  }
  denied(seat, "record");
}

// ---------------------------------------------------------------------------
// The team
// ---------------------------------------------------------------------------

/** The owner, every teammate and every open invite. Never a password or a token. */
export async function listTeam(userId: string) {
  const [owner, members, invites, jobs] = await Promise.all([
    db.user.findUnique({ where: { id: userId }, select: { id: true, name: true, email: true } }),
    db.membership.findMany({ where: { workspaceId: userId }, orderBy: { createdAt: "asc" }, include: { user: { select: { name: true, email: true } } } }),
    db.invite.findMany({ where: { workspaceId: userId, acceptedAt: null, expiresAt: { gt: new Date() } }, orderBy: { createdAt: "asc" } }),
    db.job.findMany({ where: { userId, archivedAt: null }, select: { id: true, title: true } }),
  ]);
  if (!owner) notFound("workspace");
  const titles = new Map(jobs.map((j) => [j.id, j.title]));
  const jobsOf = (ids: string[]) => ids.filter((id) => titles.has(id)).map((id) => ({ id, title: titles.get(id)! }));
  return {
    members: [
      { id: owner.id, name: owner.name, email: owner.email, role: "OWNER" as TeamRole, jobs: [] as { id: string; title: string }[] },
      ...members.map((m) => ({ id: m.userId, name: m.user.name, email: m.user.email, role: m.role, jobs: m.role === "HIRING_MANAGER" ? jobsOf(m.jobIds) : [] })),
    ],
    invites: invites.map((i) => ({ id: i.id, email: i.email, name: i.name, role: i.role, jobs: jobsOf(i.jobIds), expiresAt: i.expiresAt })),
  };
}

function checkRole(role: string): (typeof MEMBER_ROLES)[number] {
  if (!(MEMBER_ROLES as readonly string[]).includes(role)) throw new UserError(`role is one of ${MEMBER_ROLES.join(", ")}. There is one owner.`);
  return role as (typeof MEMBER_ROLES)[number];
}

async function checkJobs(userId: string, role: TeamRole, jobIds: string[] | undefined) {
  if (role !== "HIRING_MANAGER") return [];
  const ids = Array.from(new Set((jobIds ?? []).filter(Boolean)));
  if (!ids.length) throw new UserError("A hiring manager sees only the jobs you give them; name at least one (job ids from list_jobs).");
  const found = await db.job.count({ where: { userId, id: { in: ids }, archivedAt: null } });
  if (found !== ids.length) notFound("job");
  return ids;
}

const INVITE_DAYS = 7;
const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");

export function invitePath(token: string) {
  return `/join/${token}`;
}

/**
 * A one-time link to join this workspace with a role. Sends nothing: the
 * person passes the link on. Inviting the same address again replaces the
 * earlier link.
 */
export async function inviteTeammate(userId: string, input: { email: string; name?: string; role: string; jobIds?: string[] }) {
  const email = input.email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new UserError("That email address doesn't look right.");
  const role = checkRole(input.role);
  const jobIds = await checkJobs(userId, role, input.jobIds);
  if (await db.user.findUnique({ where: { email }, select: { id: true } }))
    throw new UserError("That address already has an account on this instance. A teammate needs an address of their own here.");
  await db.invite.deleteMany({ where: { workspaceId: userId, email, acceptedAt: null } });
  const token = randomBytes(32).toString("base64url");
  const invite = await db.invite.create({
    data: { workspaceId: userId, email, name: (input.name ?? "").trim().slice(0, 120), role, jobIds, tokenHash: hashToken(token), expiresAt: new Date(Date.now() + INVITE_DAYS * 86400_000) },
  });
  return { id: invite.id, email, role, path: invitePath(token), days: INVITE_DAYS };
}

export async function revokeInvite(userId: string, inviteId: string) {
  const r = await db.invite.deleteMany({ where: { id: inviteId, workspaceId: userId, acceptedAt: null } });
  if (!r.count) notFound("invite");
}

/** Change a teammate's role or jobs, or remove them, which deletes their account and signs them out. */
export async function updateTeammate(userId: string, memberId: string, input: { role?: string; jobIds?: string[]; remove?: boolean }) {
  if (memberId === userId) throw new UserError("That's the owner. The owner's role doesn't change and the owner can't be removed.");
  const m = await db.membership.findFirst({ where: { workspaceId: userId, userId: memberId } });
  if (!m) notFound("teammate");
  if (input.remove) {
    await db.user.delete({ where: { id: m.userId } });
    return { removed: true as const };
  }
  const role = input.role !== undefined ? checkRole(input.role) : m.role;
  const jobIds = role === "HIRING_MANAGER" && input.jobIds === undefined && m.role === "HIRING_MANAGER" ? m.jobIds : await checkJobs(userId, role, input.jobIds);
  const saved = await db.membership.update({ where: { id: m.id }, data: { role, jobIds } });
  return { removed: false as const, id: saved.userId, role: saved.role, jobIds: saved.jobIds };
}

// ---------------------------------------------------------------------------
// Accepting an invite: instance-level, the token is the credential.
// ---------------------------------------------------------------------------

/** What the join page shows: whose workspace, which role, and the address. Null when the link can't be used. */
export async function inviteByToken(token: string) {
  const i = await db.invite.findUnique({
    where: { tokenHash: hashToken(token) },
    include: { workspace: { select: { name: true, companyName: true } } },
  });
  if (!i || i.acceptedAt || i.expiresAt < new Date()) return null;
  return { email: i.email, name: i.name, role: i.role, company: i.workspace.companyName || i.workspace.name || "this workspace" };
}

/**
 * Create the teammate's account from an invite. The invite is spent in the
 * same conditional write that checks it, so two submits can't both use it.
 */
export async function acceptInvite(token: string, input: { name: string; password: string }) {
  const name = input.name.trim().slice(0, 120);
  if (!name) throw new UserError("Say your name; it's how your teammates see you.");
  if (input.password.length < 10) throw new UserError("Use at least 10 characters for the password.");
  const tokenHash = hashToken(token);
  return db.$transaction(async (tx) => {
    const spent = await tx.invite.updateMany({ where: { tokenHash, acceptedAt: null, expiresAt: { gt: new Date() } }, data: { acceptedAt: new Date() } });
    if (spent.count !== 1) throw new UserError("This invite has expired or was already used. Ask for a new one.");
    const i = await tx.invite.findUniqueOrThrow({ where: { tokenHash } });
    if (await tx.user.findUnique({ where: { email: i.email }, select: { id: true } })) throw new UserError("That address already has an account here. Sign in instead.");
    const user = await tx.user.create({ data: { email: i.email, name, passwordHash: hashPassword(input.password), role: "MEMBER" } });
    await tx.membership.create({ data: { workspaceId: i.workspaceId, userId: user.id, role: i.role, jobIds: i.jobIds } });
    return { userId: user.id };
  });
}

/** reach as a yes or no, for a page deciding between showing a record and a 404. */
export async function reaches(seat: Seat, ids: Parameters<typeof reach>[1]) {
  try {
    await reach(seat, ids);
    return true;
  } catch (e) {
    if (e instanceof UserError) return false;
    throw e;
  }
}
