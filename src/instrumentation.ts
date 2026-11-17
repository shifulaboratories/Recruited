/**
 * Runs once when the server starts. Provisions the owner account on an empty
 * instance and prints its password to the log, once.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  try {
    const { ensureOwner } = await import("@/lib/data/users");
    const owner = await ensureOwner();
    if (owner) {
      console.log("\n  Recruited is ready. Sign in with:");
      console.log(`    email:    ${owner.email}`);
      console.log(`    password: ${owner.password}`);
      console.log("  Change both under Connect Claude, Your account. This password is not shown again.\n");
    }
  } catch (e) {
    console.error("Could not provision the owner account:", e);
  }
}
