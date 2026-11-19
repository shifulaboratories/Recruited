import { turnstileKeys } from "@/lib/data/settings";

/**
 * Checks a Cloudflare Turnstile token when the owner has turned the spam
 * check on. Off, it passes everything. If Cloudflare can't be reached it
 * passes too: losing a real application to someone else's outage is worse
 * than letting one bot through, and the rate limit still holds.
 */
export async function passesTurnstile(token: string | undefined, address: string): Promise<boolean> {
  const keys = await turnstileKeys();
  if (!keys) return true;
  if (!token) return false;
  try {
    const body = new URLSearchParams({ secret: keys.secretKey, response: token });
    if (address) body.set("remoteip", address);
    const res = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", { method: "POST", body, signal: AbortSignal.timeout(5000) });
    if (!res.ok) return true;
    const data = (await res.json()) as { success?: boolean };
    return data.success === true;
  } catch (e) {
    console.error("[turnstile] couldn't reach Cloudflare; letting the post through", e);
    return true;
  }
}

export const NOT_CONFIRMED = "We couldn't confirm you're a person. Reload the page, wait for the check under the form to finish, and send again.";
