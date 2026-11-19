import nodemailer from "nodemailer";

/**
 * The wire to a person's own mail server. Nothing here decides whether a
 * message may go: src/lib/data/mailbox.ts does. Plain text only, because a
 * message to an applicant is a letter, not a newsletter.
 */

export const SECURITY = ["starttls", "tls", "none"] as const;
export type Security = (typeof SECURITY)[number];

export type SmtpConfig = { host: string; port: number; security: string; username: string; password: string };

function transport(c: SmtpConfig) {
  return nodemailer.createTransport({
    host: c.host,
    port: c.port,
    secure: c.security === "tls",
    requireTLS: c.security === "starttls",
    ignoreTLS: c.security === "none",
    auth: c.username ? { user: c.username, pass: c.password } : undefined,
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 20_000,
  });
}

/** Signs in and says hello, sending nothing. Throws the server's own words on failure. */
export async function verifySmtp(c: SmtpConfig) {
  const t = transport(c);
  try {
    await t.verify();
  } finally {
    t.close();
  }
}

export async function sendSmtp(
  c: SmtpConfig,
  m: { fromEmail: string; fromName: string; to: string; toName: string; subject: string; text: string },
): Promise<string> {
  const t = transport(c);
  try {
    const info = await t.sendMail({
      from: m.fromName ? { name: m.fromName, address: m.fromEmail } : m.fromEmail,
      to: m.toName ? { name: m.toName, address: m.to } : m.to,
      subject: m.subject,
      text: m.text,
    });
    return String(info.messageId ?? "");
  } finally {
    t.close();
  }
}

/** A mail server's error, cut to something a person can read. */
export function smtpReason(e: unknown): string {
  const err = e as { response?: string; code?: string; message?: string };
  const text = err?.response || err?.message || String(e);
  if (err?.code === "EAUTH") return `it refused the username or password (${text.slice(0, 160)})`;
  if (err?.code === "ESOCKET" || err?.code === "ECONNECTION" || err?.code === "ETIMEDOUT" || err?.code === "EDNS")
    return `it couldn't be reached at that host and port (${text.slice(0, 160)})`;
  return text.slice(0, 240);
}
