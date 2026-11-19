import { db } from "@/lib/db";
import { UserError } from "@/lib/data/errors";

/**
 * Instance settings. Instance-level, not content: a setting configures the
 * server, so these take the caller's userId only to check they own the
 * instance, never to scope a read. A secret is written here and never read
 * back out to a person or a tool.
 */

const TURNSTILE_SITE = "turnstile.siteKey";
const TURNSTILE_SECRET = "turnstile.secretKey";

async function requireOwner(userId: string) {
  const u = await db.user.findUnique({ where: { id: userId }, select: { role: true } });
  if (u?.role !== "OWNER") throw new UserError("Only the instance's owner can change this setting.");
}

/** The Turnstile keys, or null when the spam check is off. Server-side only: it holds the secret. */
export async function turnstileKeys(): Promise<{ siteKey: string; secretKey: string } | null> {
  const rows = await db.setting.findMany({ where: { key: { in: [TURNSTILE_SITE, TURNSTILE_SECRET] } } });
  const siteKey = rows.find((r) => r.key === TURNSTILE_SITE)?.value ?? "";
  const secretKey = rows.find((r) => r.key === TURNSTILE_SECRET)?.value ?? "";
  return siteKey && secretKey ? { siteKey, secretKey } : null;
}

/** What a public page needs to show the widget: the site key, which is public by design. */
export async function turnstileSiteKey() {
  return (await turnstileKeys())?.siteKey ?? null;
}

/** Whether the check is on, without the secret. */
export async function spamCheckStatus() {
  const keys = await turnstileKeys();
  return { on: !!keys, siteKey: keys?.siteKey ?? null };
}

/**
 * Turn Cloudflare Turnstile on with both keys, or off with two empty strings.
 * Owner only. Returns the status, never the secret.
 */
export async function setTurnstile(userId: string, input: { siteKey: string; secretKey: string }) {
  await requireOwner(userId);
  const siteKey = input.siteKey.trim();
  const secretKey = input.secretKey.trim();
  if (!siteKey && !secretKey) {
    await db.setting.deleteMany({ where: { key: { in: [TURNSTILE_SITE, TURNSTILE_SECRET] } } });
    return spamCheckStatus();
  }
  if (!siteKey || !secretKey) throw new UserError("Turnstile needs both keys: the site key and the secret key, from the same widget in Cloudflare.");
  if (!/^[\w-]{10,100}$/.test(siteKey) || !/^[\w-]{10,100}$/.test(secretKey))
    throw new UserError("Those don't look like Turnstile keys. Copy them from Cloudflare, Turnstile, your widget's settings.");
  await db.$transaction([
    db.setting.upsert({ where: { key: TURNSTILE_SITE }, create: { key: TURNSTILE_SITE, value: siteKey }, update: { value: siteKey } }),
    db.setting.upsert({ where: { key: TURNSTILE_SECRET }, create: { key: TURNSTILE_SECRET, value: secretKey }, update: { value: secretKey } }),
  ]);
  return spamCheckStatus();
}
