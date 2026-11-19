import Link from "next/link";
import { forgotPassword } from "@/server/actions";
import { ActionForm } from "@/components/forms";
import { Lockup } from "@/components/brand";

export const metadata = { title: "Reset your password" };

export default function ForgotPage() {
  return (
    <main className="min-h-screen grid place-items-center px-4">
      <div className="w-full max-w-sm space-y-6 rise">
        <Lockup size={18} />
        <div className="card p-7" style={{ boxShadow: "var(--rt-shadow-raised)" }}>
          <h1 className="h-page text-[22px] mb-1">Reset your password</h1>
          <p className="text-rt-muted text-[13px] mb-5">
            This server doesn&apos;t send email, so the link goes to the server&apos;s log, where whoever runs this instance can read it.
            If Claude is connected, the quicker way is to ask it for a password reset link.
          </p>
          <ActionForm action={forgotPassword} submit="Make a reset link">
            <label className="block space-y-1">
              <span className="text-rt-muted">Your account&apos;s email</span>
              <input className="field" name="email" type="text" autoComplete="username" required />
            </label>
          </ActionForm>
        </div>
        <p className="text-rt-faint text-xs">
          <Link href="/login" className="underline">Back to sign in</Link>
        </p>
      </div>
    </main>
  );
}
