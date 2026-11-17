import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth";
import { login } from "@/server/actions";
import { ActionForm } from "@/components/forms";
import { Lockup } from "@/components/brand";

export const metadata = { title: "Sign in" };

export default async function LoginPage() {
  if (await currentUser()) redirect("/jobs");
  return (
    <main className="min-h-screen grid place-items-center px-4">
      <div className="w-full max-w-sm space-y-6">
        <Lockup size={18} />
        <div className="card p-6">
          <h1 className="text-lg font-semibold mb-4">Sign in</h1>
          <ActionForm action={login} submit="Sign in">
            <label className="block space-y-1">
              <span className="text-rt-muted">Email</span>
              <input className="field" name="email" type="text" autoComplete="username" required />
            </label>
            <label className="block space-y-1">
              <span className="text-rt-muted">Password</span>
              <input className="field" name="password" type="password" autoComplete="current-password" required />
            </label>
          </ActionForm>
        </div>
        <p className="text-rt-faint text-xs">
          First time? The owner account&apos;s password is printed once in the server log when the app first starts.
        </p>
      </div>
    </main>
  );
}
