import Link from "next/link";
import { resetIsUsable } from "@/lib/data/users";
import { resetPassword } from "@/server/actions";
import { ActionForm } from "@/components/forms";
import { Lockup } from "@/components/brand";

export const metadata = { title: "Set a new password", robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function ResetPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const usable = await resetIsUsable(token);
  return (
    <main className="min-h-screen grid place-items-center px-4">
      <div className="w-full max-w-sm space-y-6 rise">
        <Lockup size={18} />
        <div className="card p-7" style={{ boxShadow: "var(--rt-shadow-raised)" }}>
          {usable ? (
            <>
              <h1 className="h-page text-[22px] mb-1">Set a new password</h1>
              <p className="text-rt-muted text-[13px] mb-5">At least 10 characters. Saving it signs every other browser out.</p>
              <ActionForm action={resetPassword} submit="Save and sign in">
                <input type="hidden" name="token" value={token} />
                <label className="block space-y-1">
                  <span className="text-rt-muted">New password</span>
                  <input className="field" name="password" type="password" autoComplete="new-password" minLength={10} required />
                </label>
                <label className="block space-y-1">
                  <span className="text-rt-muted">The same again</span>
                  <input className="field" name="confirm" type="password" autoComplete="new-password" minLength={10} required />
                </label>
              </ActionForm>
            </>
          ) : (
            <>
              <h1 className="h-page text-[22px] mb-1">This link has run out</h1>
              <p className="text-rt-muted text-[13px]">Reset links work once, for an hour. Ask for a new one.</p>
            </>
          )}
        </div>
        <p className="text-rt-faint text-xs">
          <Link href="/login/forgot" className="underline">Ask for a new link</Link> · <Link href="/login" className="underline">Sign in</Link>
        </p>
      </div>
    </main>
  );
}
