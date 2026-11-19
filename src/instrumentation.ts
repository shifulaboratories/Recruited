/**
 * Runs once when the server starts. Provisions the owner account on an empty
 * instance and prints its password to the log, once, and starts the daily
 * retention sweep.
 *
 * The import sits inside the runtime check, not after an early return: Next
 * compiles this file for the edge runtime too, and only drops the import (and
 * the node:crypto under it) from that bundle when it's inside the branch.
 * Written the other way, `npm run dev` fails to compile every page.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { provisionOwner } = await import("@/lib/provision");
    await provisionOwner();
    // Retention: delete applicant data each workspace's period says is due,
    // a minute after start and then once a day. Idempotent, so a restart or a second replica
    // running it too does no harm.
    const { retentionSweep } = await import("@/lib/data/privacy");
    const sweep = () => void retentionSweep();
    setTimeout(sweep, 60_000).unref();
    setInterval(sweep, 86_400_000).unref();
  }
}
