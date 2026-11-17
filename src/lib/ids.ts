import { randomBytes } from "node:crypto";

const ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789";

/** A short, unguessable, unambiguous id for public links: no 0/o, 1/l/i. */
export function slug(length = 10): string {
  const bytes = randomBytes(length);
  let out = "";
  for (let i = 0; i < length; i++) out += ALPHABET[bytes[i] % ALPHABET.length];
  return out;
}

/** A secret for a URL that grants access (an MCP connection, a screening link). */
export function secret(prefix: string): string {
  return `${prefix}_${randomBytes(24).toString("base64url")}`;
}
