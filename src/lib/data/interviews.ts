import type { InterviewStatus, OfferStatus, Prisma, Recommendation } from "@prisma/client";
import { db } from "@/lib/db";
import { notFound, UserError } from "@/lib/data/errors";
import { requireApplication } from "@/lib/data/applications";
import { secret } from "@/lib/ids";
import { jobScope } from "@/lib/team";
import {
  INTERVIEW_FORMATS,
  OFFER_STATUSES,
  PAY_PERIODS,
  RatingsSchema,
  RECOMMENDATIONS,
  formatOfferPay,
  offerChanges,
  panelView,
  readRatings,
} from "@/lib/scorecards";

/**
 * Interviews, scorecards and offers. All three hang off an application, which
 * carries archivedAt, so every read here either starts from requireApplication
 * or spells the archived filter by hand. userId first everywhere.
 *
 * Nothing here moves an applicant's stage: scheduling an interview or writing
 * an offer is a record, and the person moves the stage when they mean to.
 */

const LIVE = { archivedAt: null, job: { archivedAt: null } } as const;

function when(value: string | null | undefined, what: string): Date | null | undefined {
  if (value === undefined) return undefined;
  if (value === null || value === "") return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) throw new UserError(`${what} isn't a date. Use ISO 8601, e.g. 2026-11-20T14:00:00+08:00.`);
  return d;
}

function oneOf<T extends string>(value: string | undefined, allowed: readonly T[], what: string): T | undefined {
  if (value === undefined) return undefined;
  if (!(allowed as readonly string[]).includes(value)) throw new UserError(`${what} is one of ${allowed.join(", ")}.`);
  return value as T;
}

// ---------------------------------------------------------------------------
// Interviews
// ---------------------------------------------------------------------------

export type InterviewInput = {
  title?: string;
  format?: string;
  scheduledAt?: string | null;
  durationMin?: number | null;
  interviewers?: string;
  location?: string;
  status?: string;
  /** Teammates on the panel, by account id (list_team). Replaces the list when given. */
  memberIds?: string[];
};

/** Every id must be this workspace's owner or one of its teammates. */
async function panelIds(userId: string, ids: string[] | undefined) {
  if (ids === undefined) return {};
  const unique = Array.from(new Set(ids.map((x) => x.trim()).filter(Boolean)));
  const known = new Set([userId, ...(await db.membership.findMany({ where: { workspaceId: userId }, select: { userId: true } })).map((m) => m.userId)]);
  const stranger = unique.find((id) => !known.has(id));
  if (stranger) throw new UserError(`${stranger} isn't on this workspace's team. Ids come from list_team.`);
  return { memberIds: unique };
}

function interviewData(input: InterviewInput) {
  if (input.durationMin != null && (!Number.isInteger(input.durationMin) || input.durationMin < 5 || input.durationMin > 600))
    throw new UserError("duration is in minutes, between 5 and 600.");
  return {
    ...(input.title !== undefined ? { title: input.title.trim() } : {}),
    ...(input.format !== undefined ? { format: oneOf(input.format, INTERVIEW_FORMATS, "format") } : {}),
    ...(input.scheduledAt !== undefined ? { scheduledAt: when(input.scheduledAt, "scheduled_at") } : {}),
    ...(input.durationMin !== undefined ? { durationMin: input.durationMin } : {}),
    ...(input.interviewers !== undefined ? { interviewers: input.interviewers.trim() } : {}),
    ...(input.location !== undefined ? { location: input.location.trim() } : {}),
    ...(input.status !== undefined ? { status: oneOf(input.status, ["SCHEDULED", "DONE", "CANCELLED", "NO_SHOW"] as InterviewStatus[], "status") } : {}),
  };
}

/** Add the next round for an application. */
export async function addInterview(userId: string, applicationId: string, input: InterviewInput) {
  const a = await requireApplication(userId, applicationId);
  if (!input.title?.trim()) throw new UserError("Say what the interview is, e.g. 'screening call' or 'final with the founder'.");
  const last = await db.interview.findFirst({ where: { userId, applicationId: a.id }, orderBy: { round: "desc" }, select: { round: true } });
  const panel = await panelIds(userId, input.memberIds);
  return db.interview.create({
    data: { userId, applicationId: a.id, round: (last?.round ?? 0) + 1, title: input.title.trim(), ...interviewData(input), ...panel },
  });
}

async function requireInterview(userId: string, interviewId: string) {
  const i = await db.interview.findFirst({ where: { id: interviewId, userId, application: LIVE } });
  if (!i) notFound("interview");
  return i;
}

/** Change what was given; leave the rest. */
export async function updateInterview(userId: string, interviewId: string, input: InterviewInput) {
  const i = await requireInterview(userId, interviewId);
  if (input.title !== undefined && !input.title.trim()) throw new UserError("An interview needs a title.");
  const panel = await panelIds(userId, input.memberIds);
  return db.interview.update({ where: { id: i.id }, data: { ...interviewData(input), ...panel } });
}

export function bookingPath(token: string) {
  return `/book/${encodeURIComponent(token)}`;
}

/**
 * Offer the applicant times to pick from instead of fixing one: they open a
 * booking link (/book/<token>), see the times in their own time zone, and the
 * one they pick becomes scheduledAt. Offering again replaces the times and
 * clears any time already picked. Pass an empty list to withdraw the offer.
 */
export async function offerTimes(userId: string, interviewId: string, times: string[]) {
  const i = await requireInterview(userId, interviewId);
  if (!times.length) {
    return db.interview.update({ where: { id: i.id }, data: { slots: [], bookToken: null } });
  }
  if (times.length > 12) throw new UserError("Offer at most twelve times.");
  const now = Date.now();
  const slots = Array.from(new Set(times.map((t) => when(t, "offer_times")!.getTime())))
    .sort((a, b) => a - b)
    .map((t) => new Date(t));
  if (slots.some((d) => d.getTime() < now)) throw new UserError("One of those times has already passed.");
  return db.interview.update({
    where: { id: i.id },
    data: { slots, bookToken: i.bookToken ?? secret("bk"), scheduledAt: null, status: "SCHEDULED" },
  });
}

export async function deleteInterview(userId: string, interviewId: string) {
  const i = await requireInterview(userId, interviewId);
  await db.interview.delete({ where: { id: i.id } });
  return i;
}

/** Interviews in a window across every live job, earliest first, for "what's on this week". */
export async function listInterviews(
  userId: string,
  input: { from?: string; to?: string; jobId?: string; status?: string; jobIds?: string[]; memberId?: string },
) {
  const from = when(input.from, "from") ?? undefined;
  const to = when(input.to, "to") ?? undefined;
  const status = oneOf(input.status, ["SCHEDULED", "DONE", "CANCELLED", "NO_SHOW"] as InterviewStatus[], "status");
  const rows = await db.interview.findMany({
    where: {
      userId,
      application: { ...LIVE, ...jobScope(input.jobId, input.jobIds) },
      ...(input.memberId ? { memberIds: { has: input.memberId } } : {}),
      ...(status ? { status } : {}),
      ...(from || to ? { scheduledAt: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } } : {}),
    },
    orderBy: [{ scheduledAt: "asc" }, { createdAt: "asc" }],
    take: 200,
    include: {
      application: { select: { id: true, stage: true, candidate: { select: { name: true } }, job: { select: { id: true, title: true } } } },
      scorecards: { select: { recommendation: true } },
    },
  });
  return rows.map(({ application, scorecards, ...i }) => ({
    ...i,
    applicationId: application.id,
    candidate: application.candidate.name,
    job: application.job,
    stage: application.stage,
    panel: panelView(scorecards),
  }));
}

// ---------------------------------------------------------------------------
// Scorecards
// ---------------------------------------------------------------------------

export async function addScorecard(
  userId: string,
  interviewId: string,
  input: { interviewer: string; recommendation: string; ratings?: unknown; summary?: string; writtenBy: "app" | "mcp" | "link" },
) {
  const i = await requireInterview(userId, interviewId);
  const interviewer = input.interviewer.trim();
  if (!interviewer) throw new UserError("Say whose scorecard this is.");
  const recommendation = oneOf(input.recommendation, RECOMMENDATIONS, "recommendation") as Recommendation;
  const ratings = RatingsSchema.safeParse(input.ratings ?? []);
  if (!ratings.success) throw new UserError("ratings are a list of { criterion, score 1 to 4, note }.");
  const card = await db.scorecard.create({
    data: { userId, interviewId: i.id, interviewer, recommendation, ratings: ratings.data as Prisma.InputJsonValue, summary: (input.summary ?? "").trim(), writtenBy: input.writtenBy },
  });
  // A scorecard means the conversation happened.
  if (i.status === "SCHEDULED") await db.interview.update({ where: { id: i.id }, data: { status: "DONE" } });
  return card;
}

/** Where an interviewer fills in their scorecard without an account. */
export function scorecardPath(token: string) {
  return `/score/${encodeURIComponent(token)}`;
}

/**
 * A one-use link for one interviewer to fill in their own scorecard. Asking
 * again for the same interviewer on the same interview returns the same
 * unused link rather than minting a second.
 */
export async function scorecardLink(userId: string, interviewId: string, interviewer: string) {
  const i = await requireInterview(userId, interviewId);
  const name = interviewer.trim().slice(0, 120);
  if (!name) throw new UserError("Say whose scorecard the link is for.");
  const open = await db.scorecardLink.findFirst({ where: { userId, interviewId: i.id, interviewer: name, scorecardId: null } });
  const link = open ?? (await db.scorecardLink.create({ data: { userId, interviewId: i.id, interviewer: name, token: secret("sc") } }));
  return { interviewer: link.interviewer, path: scorecardPath(link.token) };
}

export async function deleteScorecard(userId: string, scorecardId: string) {
  const c = await db.scorecard.findFirst({ where: { id: scorecardId, userId, interview: { application: LIVE } }, include: { interview: { select: { applicationId: true } } } });
  if (!c) notFound("scorecard");
  await db.scorecard.delete({ where: { id: c.id } });
  return c;
}

// ---------------------------------------------------------------------------
// Offers
// ---------------------------------------------------------------------------

export type OfferInput = {
  title?: string;
  payAmount?: number | null;
  payCurrency?: string;
  payPeriod?: string;
  startDate?: string | null;
  hours?: string;
  terms?: string;
  respondBy?: string | null;
  status?: string;
};

/**
 * Write a new version of the offer. Terms not given carry over from the
 * version before, so "raise it to 45k" is one field. The first version takes
 * its currency and period from the job's advertised pay.
 */
export async function recordOffer(userId: string, applicationId: string, input: OfferInput) {
  const a = await requireApplication(userId, applicationId);
  const job = await db.job.findFirst({ where: { id: a.jobId, userId }, select: { title: true, salaryCurrency: true, salaryPeriod: true } });
  const prev = await db.offer.findFirst({ where: { userId, applicationId: a.id }, orderBy: { version: "desc" } });
  if (input.payAmount != null && (!Number.isInteger(input.payAmount) || input.payAmount <= 0)) throw new UserError("pay is a whole positive number.");
  const status = oneOf(input.status, OFFER_STATUSES, "status") as OfferStatus | undefined;
  const pick = <K extends keyof NonNullable<typeof prev>>(k: K, given: unknown, fallback: unknown) =>
    given !== undefined ? given : prev ? prev[k] : fallback;
  const data = {
    title: String(pick("title", input.title?.trim(), job?.title ?? "")),
    payAmount: pick("payAmount", input.payAmount, null) as number | null,
    payCurrency: String(pick("payCurrency", input.payCurrency?.trim().toUpperCase(), job?.salaryCurrency ?? "USD")),
    payPeriod: oneOf(String(pick("payPeriod", input.payPeriod, job?.salaryPeriod ?? "month")), PAY_PERIODS, "pay_period")!,
    startDate: pick("startDate", when(input.startDate, "start_date"), null) as Date | null,
    hours: String(pick("hours", input.hours?.trim(), "")),
    terms: String(pick("terms", input.terms?.trim(), "")),
    respondBy: pick("respondBy", when(input.respondBy, "respond_by"), null) as Date | null,
  };
  const changed = offerChanges(prev, data);
  if (prev && changed.length === 0) throw new UserError("Nothing changed from the last version. To change only its status, pass offer_id and status.");
  const offer = await db.offer.create({
    data: {
      userId,
      applicationId: a.id,
      version: (prev?.version ?? 0) + 1,
      ...data,
      status: status ?? "DRAFT",
      statusAt: status && status !== "DRAFT" ? new Date() : null,
    },
  });
  return { ...offer, pay: formatOfferPay(offer), changedFromPrevious: changed };
}

export async function setOfferStatus(userId: string, offerId: string, status: string) {
  const o = await db.offer.findFirst({ where: { id: offerId, userId, application: LIVE } });
  if (!o) notFound("offer");
  const s = oneOf(status, OFFER_STATUSES, "status") as OfferStatus;
  return db.offer.update({ where: { id: o.id }, data: { status: s, statusAt: s === "DRAFT" ? null : new Date() } });
}

// ---------------------------------------------------------------------------
// For one application
// ---------------------------------------------------------------------------

export async function interviewsAndOffers(userId: string, applicationId: string) {
  const a = await requireApplication(userId, applicationId);
  const [interviews, offers] = await Promise.all([
    db.interview.findMany({ where: { userId, applicationId: a.id }, orderBy: { round: "asc" }, include: { scorecards: { orderBy: { createdAt: "asc" } } } }),
    db.offer.findMany({ where: { userId, applicationId: a.id }, orderBy: { version: "asc" } }),
  ]);
  const cards = interviews.flatMap((i) => i.scorecards);
  return {
    interviews: interviews.map(({ scorecards, userId: _u, applicationId: _a, bookToken, ...i }) => ({
      ...i,
      /** The applicant's link to pick one of `slots`, while times are on offer. */
      bookingPath: bookToken && i.slots.length && !i.scheduledAt ? bookingPath(bookToken) : null,
      scorecards: scorecards.map((c) => ({
        id: c.id,
        interviewer: c.interviewer,
        recommendation: c.recommendation,
        ratings: readRatings(c.ratings),
        summary: c.summary,
        writtenBy: c.writtenBy,
        at: c.createdAt,
      })),
    })),
    panel: panelView(cards),
    offers: offers.map(({ userId: _u, applicationId: _a, ...o }, i) => ({
      ...o,
      pay: formatOfferPay(o),
      changedFromPrevious: offerChanges(i ? offers[i - 1] : null, o),
    })),
  };
}
