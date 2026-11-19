import { createHash, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { db } from "@/lib/db";
import { UserError } from "@/lib/data/errors";

/**
 * Accounts. Instance-level, not content: nothing here reads a job, a candidate
 * or an answer, which is why these functions do not take a userId first.
 */

export function hashPassword(password: string) {
  const salt = randomBytes(16);
  const hash = scryptSync(password, salt, 64);
  return `scrypt$${salt.toString("hex")}$${hash.toString("hex")}`;
}

export function verifyPassword(password: string, stored: string) {
  const [kind, saltHex, hashHex] = stored.split("$");
  if (kind !== "scrypt" || !saltHex || !hashHex) return false;
  const expected = Buffer.from(hashHex, "hex");
  const got = scryptSync(password, Buffer.from(saltHex, "hex"), expected.length);
  return timingSafeEqual(expected, got);
}

export async function userByLogin(email: string, password: string) {
  const user = await db.user.findUnique({ where: { email: email.trim().toLowerCase() } });
  if (!user || !verifyPassword(password, user.passwordHash)) return null;
  return user;
}

/**
 * The owner account, made on first boot when the instance has nobody. The
 * password is printed once to the server log; change it from Settings.
 * DATABASE_URL stays the only thing a self-hoster has to set.
 */
export async function ensureOwner(): Promise<{ email: string; password: string } | null> {
  if ((await db.user.count()) > 0) return null;
  const password = randomBytes(12).toString("base64url");
  const email = "owner@localhost";
  await db.user.create({ data: { email, name: "Owner", passwordHash: hashPassword(password), role: "OWNER" } });
  return { email, password };
}

export async function updateAccount(
  userId: string,
  input: { name?: string; email?: string; companyName?: string; companyAbout?: string; companyWebsite?: string; careersSlug?: string; password?: string },
) {
  const data: Record<string, string | null> = {};
  if (input.careersSlug !== undefined) {
    const c = input.careersSlug.trim().toLowerCase();
    if (c && !/^[a-z0-9](?:[a-z0-9-]{0,38}[a-z0-9])?$/.test(c))
      throw new UserError("The careers address takes lowercase letters, numbers and dashes, up to 40, like acme or acme-labs.");
    if (c && (await db.user.findFirst({ where: { careersSlug: c, NOT: { id: userId } } }))) throw new UserError("Another workspace on this instance uses that careers address.");
    data.careersSlug = c || null;
  }
  if (input.name !== undefined) data.name = input.name.trim();
  if (input.companyName !== undefined) data.companyName = input.companyName.trim();
  if (input.companyAbout !== undefined) {
    if (input.companyAbout.length > 2000) throw new UserError("Keep the company description under 2000 characters.");
    data.companyAbout = input.companyAbout.trim();
  }
  if (input.companyWebsite !== undefined) {
    const w = input.companyWebsite.trim();
    if (w && !/^https?:\/\/[^\s.]+\.[^\s]+$/i.test(w)) throw new UserError("The website should be a full address, starting with https://.");
    data.companyWebsite = w;
  }
  if (input.email !== undefined) {
    const email = input.email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new UserError("That email address doesn't look right.");
    const taken = await db.user.findFirst({ where: { email, NOT: { id: userId } } });
    if (taken) throw new UserError("Another account uses that email.");
    data.email = email;
  }
  if (input.password) {
    if (input.password.length < 10) throw new UserError("Use at least 10 characters for the password.");
    data.passwordHash = hashPassword(input.password);
  }
  return db.user.update({ where: { id: userId }, data });
}

// ---------------------------------------------------------------------------
// Password reset. A link carries a random token; only its SHA-256 is stored.
// It works once, for an hour, and using it signs the account out everywhere.
// This server sends no mail, so a link reaches its owner one of two ways: the
// connected assistant asks for one (resetLinkFor, behind the MCP token), or
// the sign-in page's "Forgot your password?" prints it to the server log,
// where whoever runs the instance can read it.
// ---------------------------------------------------------------------------

const RESET_MINUTES = 60;
const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");

export function resetPath(token: string) {
  return `/reset/${token}`;
}

async function mintReset(userId: string) {
  const token = randomBytes(32).toString("base64url");
  await db.passwordReset.create({ data: { userId, tokenHash: hashToken(token), expiresAt: new Date(Date.now() + RESET_MINUTES * 60_000) } });
  return { token, minutes: RESET_MINUTES };
}

/** A reset link for the signed-in or connected person's own account. */
export async function resetLinkFor(userId: string) {
  return mintReset(userId);
}

/** A reset link for whoever owns this email, or null. The caller must not say which. */
export async function resetLinkForEmail(email: string) {
  const user = await db.user.findUnique({ where: { email: email.trim().toLowerCase() } });
  if (!user) return null;
  return { ...(await mintReset(user.id)), email: user.email };
}

/** Whether a reset link can still be used, for the page that shows the form. */
export async function resetIsUsable(token: string) {
  const r = await db.passwordReset.findUnique({ where: { tokenHash: hashToken(token) } });
  return !!r && !r.usedAt && r.expiresAt > new Date();
}

/**
 * Set a new password from a reset link. The link is spent in the same
 * conditional write that checks it, so two submits can't both use it, and
 * every session the account had is ended.
 */
export async function resetPassword(token: string, password: string) {
  if (password.length < 10) throw new UserError("Use at least 10 characters for the password.");
  const tokenHash = hashToken(token);
  return db.$transaction(async (tx) => {
    const spent = await tx.passwordReset.updateMany({ where: { tokenHash, usedAt: null, expiresAt: { gt: new Date() } }, data: { usedAt: new Date() } });
    if (spent.count !== 1) throw new UserError("This link has expired or was already used. Ask for a new one.");
    const r = await tx.passwordReset.findUniqueOrThrow({ where: { tokenHash } });
    await tx.user.update({ where: { id: r.userId }, data: { passwordHash: hashPassword(password) } });
    await tx.session.deleteMany({ where: { userId: r.userId } });
    await tx.passwordReset.deleteMany({ where: { userId: r.userId, usedAt: null } });
    return { userId: r.userId };
  });
}
