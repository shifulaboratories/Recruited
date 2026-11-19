import { randomBytes } from "node:crypto";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import type { User } from "@prisma/client";
import { db } from "@/lib/db";
import { seatFor, type Seat } from "@/lib/data/team";

export const SESSION_COOKIE = "recruited_session";
const SESSION_DAYS = 30;

export async function createSession(userId: string) {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 86400_000);
  await db.session.create({ data: { token, userId, expiresAt } });
  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: expiresAt,
  });
}

export async function destroySession() {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) await db.session.deleteMany({ where: { token } });
  jar.delete(SESSION_COOKIE);
}

export async function currentUser() {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const s = await db.session.findUnique({ where: { token }, include: { user: true } });
  if (!s || s.expiresAt < new Date()) return null;
  return s.user;
}

/** The signed-in user, or a redirect to sign in. Pages and server actions resolve the caller only here. */
export async function requireUser() {
  const user = await currentUser();
  if (!user) redirect("/login");
  return user;
}

/**
 * The signed-in person, the workspace they work in, and their seat in it. Pages
 * and actions pass seat.userId (the workspace) to every data call, and the
 * person's own id only to what is theirs: their account and their connection.
 */
export async function requireSeat(): Promise<{ person: User; workspace: User; seat: Seat; userId: string }> {
  const person = await requireUser();
  const seat = await seatFor(person);
  const workspace = seat.userId === person.id ? person : await db.user.findUnique({ where: { id: seat.userId } });
  if (!workspace) redirect("/login");
  return { person, workspace, seat, userId: seat.userId };
}

/** Where this instance is reachable, from the request headers. */
export async function baseUrl() {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (/^(localhost|127\.)/.test(host) ? "http" : "https");
  return `${proto}://${host}`;
}

export function baseUrlFromRequest(request: Request) {
  const url = new URL(request.url);
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host") ?? url.host;
  const proto = request.headers.get("x-forwarded-proto") ?? url.protocol.replace(":", "");
  return `${proto}://${host}`;
}
