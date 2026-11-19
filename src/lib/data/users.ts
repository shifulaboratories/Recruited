import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
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
  input: { name?: string; email?: string; companyName?: string; companyAbout?: string; companyWebsite?: string; password?: string },
) {
  const data: Record<string, string> = {};
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
