import Link from "next/link";
import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth";
import { login } from "@/server/actions";
import { ActionForm } from "@/components/forms";
import { Lockup } from "@/components/brand";

export const metadata = { title: "Sign in" };

export default async function LoginPage() {
  if (await currentUser()) redirect("/jobs");
  return (
    <main className="relative min-h-screen grid place-items-center px-4 overflow-hidden">
      <div
        aria-hidden="true"
        className="absolute inset-0 -z-10"
        style={{
          background:
            "radial-gradient(60% 50% at 30% 20%, color-mix(in oklch, var(--rt-primary) 12%, transparent), transparent 70%), radial-gradient(50% 40% at 80% 80%, color-mix(in oklch, var(--rt-ai) 9%, transparent), transparent 70%)",
        }}
      />
      <div className="w-full max-w-sm space-y-6 rise">
        <Lockup size={18} />
        <div className="card p-7" style={{ boxShadow: "var(--rt-shadow-raised)" }}>
          <h1 className="h-page text-[22px] mb-1">Welcome back</h1>
          <p className="text-rt-muted text-[13px] mb-5">Sign in to see who applied.</p>
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
          First time? The owner account&apos;s password is printed once in the server log when the app first starts.{" "}
          <Link href="/login/forgot" className="underline">Forgot your password?</Link>
        </p>
      </div>
    </main>
  );
}
