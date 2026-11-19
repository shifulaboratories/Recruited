import { db } from "@/lib/db";
import { UserError } from "@/lib/data/errors";
import { spamCheckStatus } from "@/lib/data/settings";

/**
 * The instance's own health: whether the database answers, which migration it
 * is on, and the errors the server caught. Instance-level, not content: the
 * counts are totals, the errors are where and what failed, and nothing here
 * reads a job, a candidate or an answer. Owner only.
 */

const KEEP = 1000;

/**
 * Keep a caught server error for the owner to read later. Never throws: a
 * failure to log must not turn into a second failure for the person waiting.
 */
export async function recordError(where: string, error: unknown) {
  console.error(`[${where}]`, error);
  try {
    const message = (error instanceof Error ? `${error.name}: ${error.message}` : String(error)).slice(0, 500);
    await db.errorEvent.create({ data: { where: where.slice(0, 80), message } });
    if (Math.random() < 0.05) {
      const cutoff = await db.errorEvent.findFirst({ orderBy: { createdAt: "desc" }, skip: KEEP, select: { createdAt: true } });
      if (cutoff) await db.errorEvent.deleteMany({ where: { createdAt: { lte: cutoff.createdAt } } });
    }
  } catch {
    // The console line above is the fallback.
  }
}

export async function instanceHealth(userId: string) {
  const me = await db.user.findUnique({ where: { id: userId }, select: { role: true } });
  if (me?.role !== "OWNER") throw new UserError("Only the instance's owner can read its health.");
  const started = Date.now();
  await db.$queryRaw`SELECT 1`;
  const dbMs = Date.now() - started;
  const migrations = await db.$queryRaw<{ migration_name: string; finished_at: Date | null }[]>`
    SELECT migration_name, finished_at FROM "_prisma_migrations" ORDER BY started_at DESC LIMIT 1`;
  const week = new Date(Date.now() - 7 * 86400_000);
  const [users, jobs, applications, errorsThisWeek, recentErrors, spam] = await Promise.all([
    db.user.count(),
    db.job.count({ where: { archivedAt: null } }),
    db.application.count({ where: { archivedAt: null, job: { archivedAt: null } } }),
    db.errorEvent.count({ where: { createdAt: { gte: week } } }),
    db.errorEvent.findMany({ orderBy: { createdAt: "desc" }, take: 20, select: { where: true, message: true, createdAt: true } }),
    spamCheckStatus(),
  ]);
  return {
    database: { ok: true, roundTripMs: dbMs, latestMigration: migrations[0]?.migration_name ?? null, migrationFinished: !!migrations[0]?.finished_at },
    totals: { accounts: users, jobs, applications },
    spamCheck: spam.on ? "on" : "off",
    errors: { lastSevenDays: errorsThisWeek, recent: recentErrors },
  };
}
