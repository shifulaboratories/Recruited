import { db } from "@/lib/db";
import { UserError } from "@/lib/data/errors";
import { recordError } from "@/lib/data/system";
import { MAX_RETENTION_MONTHS } from "@/lib/privacy";

/**
 * An applicant's data rights: a copy of everything held about them, deletion
 * on request, and deletion when the workspace's retention period runs out.
 *
 * These are the reads that deliberately INCLUDE archived rows. Everywhere else
 * archived means gone; here it doesn't, because a data request covers
 * everything still in the database, and archiving keeps rows there. Each
 * query still filters on userId.
 */

async function findCandidate(userId: string, by: { applicationId?: string; email?: string }) {
  if (by.applicationId) {
    const a = await db.application.findFirst({ where: { id: by.applicationId, userId }, select: { candidateId: true } });
    if (!a) throw new UserError("No application with that id in this workspace.");
    return a.candidateId;
  }
  const email = by.email?.trim().toLowerCase();
  if (!email) throw new UserError("Give the application's id or the applicant's email address.");
  const c = await db.candidate.findFirst({ where: { userId, email: { equals: email, mode: "insensitive" } }, select: { id: true } });
  if (!c) throw new UserError("Nobody with that email address applied to this workspace.");
  return c.id;
}

/**
 * Everything this workspace holds about one person, archived applications
 * included: contact details, every application with its answers (and how each
 * answer arrived), files listed by name, messages, notes, interviews with
 * scorecards, offers and references. Shaped to hand over for a data request.
 */
export async function exportApplicantData(userId: string, by: { applicationId?: string; email?: string }) {
  const candidateId = await findCandidate(userId, by);
  const c = await db.candidate.findFirst({
    where: { id: candidateId, userId },
    include: {
      applications: {
        orderBy: { createdAt: "asc" },
        include: {
          job: { select: { title: true } },
          listing: { select: { board: true } },
          submissions: {
            include: {
              form: { select: { name: true, kind: true } },
              answers: { include: { uploads: { select: { filename: true, mimeType: true, size: true } } } },
            },
          },
          messages: { select: { kind: true, status: true, subject: true, body: true, sentAt: true, createdAt: true } },
          notes: { select: { body: true, createdAt: true } },
          interviews: { include: { scorecards: { select: { interviewer: true, recommendation: true, ratings: true, summary: true, createdAt: true } } } },
          offers: true,
          // The referee's own contact details are theirs, not the applicant's, so they stay out.
          references: { select: { name: true, relation: true, answers: true, submittedAt: true } },
        },
      },
      user: { select: { companyName: true } },
    },
  });
  if (!c) throw new UserError("Nobody with that email address applied to this workspace.");
  return {
    about: `Everything ${c.user.companyName || "this workspace"} holds about ${c.name}, as of ${new Date().toISOString().slice(0, 10)}.`,
    person: { name: c.name, email: c.email, phone: c.phone, links: c.links, firstSeen: c.createdAt },
    applications: c.applications.map((a) => ({
      job: a.job.title,
      appliedAt: a.createdAt,
      cameFrom: a.listing?.board ?? a.source,
      stage: a.stage,
      tier: a.tier,
      archived: !!a.archivedAt,
      forms: a.submissions.map((s) => ({
        form: s.form.name,
        sentAt: s.createdAt,
        answers: s.answers.map((x) => ({
          question: x.label,
          answer: x.value,
          howItArrived: x.origin,
          files: x.uploads.map((u) => ({ name: u.filename, type: u.mimeType, bytes: u.size })),
        })),
      })),
      messages: a.messages,
      notes: a.notes,
      interviews: a.interviews.map(({ id: _i, userId: _u, applicationId: _a, bookToken: _b, ...i }) => i),
      offers: a.offers.map(({ id: _i, userId: _u, applicationId: _a, ...o }) => o),
      references: a.references,
    })),
  };
}

/**
 * Delete everything held about one person: the candidate, every application
 * (archived ones too), answers, files, messages, notes, interviews, offers and
 * references. Permanent. dryRun says what would go and deletes nothing.
 */
export async function deleteApplicantData(userId: string, by: { applicationId?: string; email?: string }, dryRun: boolean) {
  const candidateId = await findCandidate(userId, by);
  const c = await db.candidate.findFirst({
    where: { id: candidateId, userId },
    select: { name: true, email: true, applications: { select: { job: { select: { title: true } }, stage: true, _count: { select: { submissions: true, messages: true, interviews: true } } } } },
  });
  if (!c) throw new UserError("Nobody with that email address applied to this workspace.");
  const summary = {
    name: c.name,
    email: c.email,
    applications: c.applications.map((a) => ({ job: a.job.title, stage: a.stage, forms: a._count.submissions, messages: a._count.messages, interviews: a._count.interviews })),
  };
  if (dryRun) return { dryRun: true, wouldDelete: summary };
  await db.candidate.deleteMany({ where: { id: candidateId, userId } });
  return { dryRun: false, deleted: summary };
}

export async function setRetention(userId: string, input: { months?: number; privacyEmail?: string }) {
  const data: { retentionMonths?: number; privacyEmail?: string } = {};
  if (input.months !== undefined) {
    if (!Number.isInteger(input.months) || input.months < 0 || input.months > MAX_RETENTION_MONTHS)
      throw new UserError(`retention_months is a whole number from 0 (keep until deleted) to ${MAX_RETENTION_MONTHS}.`);
    data.retentionMonths = input.months;
  }
  if (input.privacyEmail !== undefined) {
    const e = input.privacyEmail.trim().toLowerCase();
    if (e && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) throw new UserError("privacy_email should be an email address applicants can write to.");
    data.privacyEmail = e;
  }
  return db.user.update({ where: { id: userId }, data, select: { retentionMonths: true, privacyEmail: true } });
}

function cutoff(months: number, now: Date) {
  const d = new Date(now);
  d.setMonth(d.getMonth() - months);
  return d;
}

/** Applications in this workspace that retention will delete within `withinDays`. Hires are kept. */
export async function retentionDue(userId: string, withinDays = 30) {
  const u = await db.user.findUnique({ where: { id: userId }, select: { retentionMonths: true } });
  if (!u || u.retentionMonths <= 0) return { months: u?.retentionMonths ?? 0, dueSoon: 0 };
  const by = cutoff(u.retentionMonths, new Date(Date.now() + withinDays * 86400_000));
  const dueSoon = await db.application.count({ where: { userId, stage: { not: "HIRED" }, job: { closedAt: { lte: by } } } });
  return { months: u.retentionMonths, dueSoon };
}

/**
 * Delete what each workspace's retention period says is due: applications,
 * archived or not, whose job closed more than retentionMonths ago, except
 * hires; then anyone left with no application at all. Instance-level: it
 * walks every workspace, each by its own userId and its own setting.
 * Never throws.
 */
export async function retentionSweep(now = new Date()) {
  let applications = 0;
  let people = 0;
  try {
    const users = await db.user.findMany({ where: { retentionMonths: { gt: 0 } }, select: { id: true, retentionMonths: true } });
    for (const u of users) {
      const due = await db.application.findMany({
        where: { userId: u.id, stage: { not: "HIRED" }, job: { closedAt: { lte: cutoff(u.retentionMonths, now) } } },
        select: { id: true, candidateId: true },
      });
      if (!due.length) continue;
      const gone = await db.application.deleteMany({ where: { userId: u.id, id: { in: due.map((d) => d.id) } } });
      applications += gone.count;
      const left = await db.candidate.deleteMany({ where: { userId: u.id, id: { in: [...new Set(due.map((d) => d.candidateId))] }, applications: { none: {} } } });
      people += left.count;
    }
  } catch (e) {
    await recordError("retention", e);
  }
  return { applications, people };
}
