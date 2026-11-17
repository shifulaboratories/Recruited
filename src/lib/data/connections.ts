import { db } from "@/lib/db";
import { notFound } from "@/lib/data/errors";
import { secret } from "@/lib/ids";

/**
 * MCP connections. The token sits in the URL path (/api/mcp/<token>) so the
 * whole connection is one copy-paste, as in Hired, and resolves to exactly
 * one user.
 */

export function mcpPath(token: string) {
  return `/api/mcp/${token}`;
}

export async function listConnections(userId: string) {
  return db.connection.findMany({ where: { userId }, orderBy: { createdAt: "asc" } });
}

export async function createConnection(userId: string, name = "Claude") {
  return db.connection.create({ data: { userId, name: name.trim() || "Claude", token: secret("rct") } });
}

/** The first connection, made on demand so Settings always has a URL to show. */
export async function primaryConnection(userId: string) {
  return (await db.connection.findFirst({ where: { userId }, orderBy: { createdAt: "asc" } })) ?? createConnection(userId);
}

/** Replace a connection's URL. The old one stops working at once. */
export async function rotateConnection(userId: string, connectionId: string) {
  const c = await db.connection.findFirst({ where: { id: connectionId, userId } });
  if (!c) notFound("connection");
  return db.connection.update({ where: { id: c.id }, data: { token: secret("rct") } });
}

/** Resolve a connection token to its user. Instance-level: the token is the credential. */
export async function userByConnectionToken(token: string) {
  const c = await db.connection.findUnique({ where: { token }, include: { user: true } });
  if (!c) return null;
  db.connection.update({ where: { id: c.id }, data: { lastUsedAt: new Date() } }).catch(() => {});
  return { user: c.user, connection: c };
}
