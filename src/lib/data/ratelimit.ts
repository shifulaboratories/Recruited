import { createHash } from "node:crypto";
import { db } from "@/lib/db";

/**
 * Per-address limits on the public POST routes (apply, screening, reference,
 * booking) and on asking for a password reset. Instance-level, so no userId:
 * it holds no content and nothing in it is anyone's workspace. The address is
 * hashed with the route before it is stored, so the table can't be read back
 * into a list of who applied.
 *
 * Counted in Postgres, not memory, so the limit holds across restarts and
 * replicas, the same reason the MCP transport keeps no state.
 *
 * The limits are loose on purpose. Applicants on mobile networks in the
 * Philippines and elsewhere share one public address behind carrier NAT, so a
 * tight limit would turn real people away; this stops floods, not people.
 * The duplicate-email check in submitApplication does the fine-grained work.
 */

export type Route = "apply" | "screen" | "ref" | "book" | "reset" | "score";

/** Posts allowed per hashed address per hour: one limit per form, and one across all of them. */
export const LIMITS = { perTarget: 20, perAddress: 60 } as const;

const HOUR = 60 * 60 * 1000;

/**
 * The caller's address as the nearest proxy saw it, or "" when there's none.
 * X-Real-IP first (Railway's edge sets it and overwrites what the caller
 * sent), then the LAST X-Forwarded-For entry, which the nearest proxy appended.
 * The first entry is whatever the caller claimed, so a bot could rotate it to
 * walk past the limit.
 */
export function clientAddress(request: Request) {
  const real = request.headers.get("x-real-ip")?.trim();
  if (real) return real;
  const forwarded = request.headers.get("x-forwarded-for");
  return forwarded ? forwarded.split(",").pop()!.trim() : "";
}

function hash(...parts: string[]) {
  return createHash("sha256").update(parts.join("\u0000")).digest("hex").slice(0, 40);
}

async function bump(key: string, window: Date) {
  const rows = await db.$queryRaw<{ count: number }[]>`
    INSERT INTO "RateHit" ("key", "window", "count") VALUES (${key}, ${window}, 1)
    ON CONFLICT ("key", "window") DO UPDATE SET "count" = "RateHit"."count" + 1
    RETURNING "count"`;
  return Number(rows[0]?.count ?? 0);
}

/**
 * Count one post and say whether it's over the limit. `target` is the slug or
 * token the post names. Never throws: if the count can't be written, the post
 * goes through, because a hiccup here shouldn't lose an application.
 */
export async function overLimit(request: Request, route: Route, target: string): Promise<boolean> {
  const address = clientAddress(request);
  if (!address) return false;
  const now = Date.now();
  const window = new Date(now - (now % HOUR));
  try {
    const [one, all] = await Promise.all([bump(hash(address, route, target), window), bump(hash(address, "*"), window)]);
    if (Math.random() < 0.02) await db.rateHit.deleteMany({ where: { window: { lt: new Date(now - 24 * HOUR) } } });
    return one > LIMITS.perTarget || all > LIMITS.perAddress;
  } catch (e) {
    console.error("[ratelimit] count failed", e);
    return false;
  }
}

export const TOO_MANY = "Too many forms have been sent from your network in the last hour. Try again in an hour.";
