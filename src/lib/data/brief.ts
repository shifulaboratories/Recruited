import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { retentionDue } from "@/lib/data/privacy";
import { UserError } from "@/lib/data/errors";
import { readProbes } from "@/lib/probes";

/**
 * The daily brief: everything that needs the person today, in one read.
 * Counts and short lists only; the assistant opens get_application for
 * detail. userId first; every query starts from a live application.
 */

const LIVE = { archivedAt: null, job: { archivedAt: null } } as const;
/** Live and still in play: someone turned down or hired has no pending interview to chase. */
const OPEN: Prisma.ApplicationWhereInput = { ...LIVE, stage: { notIn: ["REJECTED", "HIRED"] } };
const DAY = 24 * 60 * 60 * 1000;

export async function dailyBrief(userId: string, opts: { since?: string; now?: Date } = {}) {
  const now = opts.now ?? new Date();
  let since = new Date(now.getTime() - DAY);
  if (opts.since) {
    since = new Date(opts.since);
    if (Number.isNaN(since.getTime())) throw new UserError("since isn't a date. Use ISO 8601, e.g. 2026-11-17T09:00:00+08:00.");
  }
  const soon = new Date(now.getTime() + 2 * DAY);
  const who = { candidate: { select: { name: true } }, job: { select: { id: true, title: true } } } as const;

  const arrivedCount = await db.application.count({ where: { userId, ...LIVE, createdAt: { gte: since } } });
  const [arrived, proposals, screening, upcoming, awaitingPick, needScorecard, drafts, references, offers, withProbes] = await Promise.all([
    db.application.findMany({
      where: { userId, ...LIVE, createdAt: { gte: since } },
      orderBy: { createdAt: "desc" },
      take: 25,
      select: { id: true, qualified: true, createdAt: true, ...who },
    }),
    db.application.findMany({
      where: { userId, ...LIVE, tier: null, proposedTier: { not: null }, stage: { notIn: ["HIRED", "REJECTED"] } },
      orderBy: [{ jobId: "asc" }, { proposedRank: { sort: "asc", nulls: "last" } }],
      take: 25,
      select: { id: true, proposedTier: true, proposedRank: true, ...who },
    }),
    db.application.findMany({
      where: { userId, ...LIVE, stage: "SCREEN", submissions: { none: { form: { kind: "SCREENING" } } } },
      take: 25,
      select: { id: true, ...who, messages: { where: { kind: "SCREENING_INVITE", status: "SENT" }, orderBy: { sentAt: "desc" }, take: 1, select: { sentAt: true } } },
    }),
    db.interview.findMany({
      where: { userId, application: OPEN, status: "SCHEDULED", scheduledAt: { gte: now, lte: soon } },
      orderBy: { scheduledAt: "asc" },
      select: { id: true, title: true, scheduledAt: true, location: true, application: { select: { id: true, ...who } } },
    }),
    db.interview.findMany({
      where: { userId, application: OPEN, status: "SCHEDULED", scheduledAt: null, NOT: { slots: { isEmpty: true } } },
      select: { id: true, title: true, slots: true, application: { select: { id: true, ...who } } },
    }),
    db.interview.findMany({
      where: {
        userId,
        application: LIVE,
        scorecards: { none: {} },
        OR: [{ status: "DONE" }, { status: "SCHEDULED", scheduledAt: { lt: now } }],
      },
      take: 25,
      select: { id: true, title: true, scheduledAt: true, application: { select: { id: true, ...who } } },
    }),
    db.message.findMany({
      where: { userId, application: LIVE, status: "DRAFT" },
      orderBy: { createdAt: "asc" },
      take: 50,
      select: { id: true, kind: true, subject: true, sendError: true, createdAt: true, application: { select: { id: true, ...who } } },
    }),
    db.reference.findMany({
      where: { userId, application: LIVE, submittedAt: { gte: since } },
      select: { id: true, name: true, submittedAt: true, application: { select: { id: true, ...who } } },
    }),
    db.offer.findMany({
      where: { userId, application: LIVE, status: "EXTENDED" },
      select: { id: true, version: true, respondBy: true, application: { select: { id: true, ...who } } },
    }),
    db.interview.findMany({
      where: { userId, application: OPEN, status: "SCHEDULED", scheduledAt: { gte: now, lte: soon } },
      select: { application: { select: { id: true, probes: true } } },
    }),
  ]);

  const app = (a: { id: string; candidate: { name: string }; job: { id: string; title: string } }) => ({ applicationId: a.id, candidate: a.candidate.name, job: a.job.title });
  const probesFor = new Map(withProbes.map((i) => [i.application.id, readProbes(i.application.probes).filter((p) => !p.asked).length]));

  const brief = {
    now,
    since,
    newApplicants: { count: arrivedCount, items: arrived.map((a) => ({ ...app(a), qualified: a.qualified, at: a.createdAt })) },
    proposalsToDecide: { count: proposals.length, items: proposals.map((a) => ({ ...app(a), proposedTier: a.proposedTier, rank: a.proposedRank })) },
    screeningNotAnswered: { count: screening.length, items: screening.map((a) => ({ ...app(a), inviteSentAt: a.messages[0]?.sentAt ?? null })) },
    interviewsNext48h: {
      count: upcoming.length,
      items: upcoming.map((i) => ({ interviewId: i.id, title: i.title, at: i.scheduledAt, location: i.location, ...app(i.application), openProbes: probesFor.get(i.application.id) ?? 0 })),
    },
    waitingForApplicantToPickATime: { count: awaitingPick.length, items: awaitingPick.map((i) => ({ interviewId: i.id, title: i.title, slots: i.slots.length, ...app(i.application) })) },
    scorecardsMissing: { count: needScorecard.length, items: needScorecard.map((i) => ({ interviewId: i.id, title: i.title, at: i.scheduledAt, ...app(i.application) })) },
    unsentDrafts: { count: drafts.length, items: drafts.map((m) => ({ messageId: m.id, kind: m.kind, subject: m.subject, ...(m.sendError ? { didntSend: m.sendError } : {}), ...app(m.application) })) },
    referencesAnswered: { count: references.length, items: references.map((r) => ({ referee: r.name, at: r.submittedAt, ...app(r.application) })) },
    offersOut: { count: offers.length, items: offers.map((o) => ({ offerId: o.id, version: o.version, respondBy: o.respondBy, ...app(o.application) })) },
  };
  const quiet = [brief.newApplicants, brief.proposalsToDecide, brief.screeningNotAnswered, brief.interviewsNext48h, brief.waitingForApplicantToPickATime, brief.scorecardsMissing, brief.unsentDrafts, brief.referencesAnswered, brief.offersOut].every((x) => x.count === 0);
  const retention = await retentionDue(userId, 30);
  return {
    ...brief,
    /** Applications the retention period deletes in the next 30 days. Shown only when there are some. */
    ...(retention.dueSoon ? { deletedWithin30Days: { count: retention.dueSoon, retentionMonths: retention.months } } : {}),
    nothingNeedsYou: quiet,
  };
}
