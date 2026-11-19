import { ensureOwner } from "@/lib/data/users";

/** Makes the owner account on an empty instance and prints its password, once. */
export async function provisionOwner() {
  try {
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
