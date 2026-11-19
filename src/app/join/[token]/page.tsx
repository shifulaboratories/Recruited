import Link from "next/link";
import { inviteByToken } from "@/lib/data/team";
import { acceptInviteAction } from "@/server/actions";
import { ActionForm } from "@/components/forms";
import { Lockup } from "@/components/brand";
import { ROLE_FOR_YOU, ROLE_LABEL } from "@/lib/team";

export const metadata = { title: "Join your team", robots: { index: false } };
export const dynamic = "force-dynamic";

/** An invite link. Unlisted, works once, for 7 days; accepting it makes the teammate's account. */
export default async function JoinPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const invite = await inviteByToken(token);
  return (
    <main className="min-h-screen grid place-items-center px-4">
      <div className="w-full max-w-sm space-y-6 rise">
        <Lockup size={18} />
        <div className="card p-7" style={{ boxShadow: "var(--rt-shadow-raised)" }}>
          {invite ? (
            <>
              <h1 className="h-page text-[22px] mb-1">Join {invite.company}</h1>
              <p className="text-rt-muted text-[13px] mb-5">
                You&apos;re invited as {ROLE_LABEL[invite.role].toLowerCase()}. {ROLE_FOR_YOU[invite.role]} You&apos;ll sign in as {invite.email}.
              </p>
              <ActionForm action={acceptInviteAction} submit="Join and sign in">
                <input type="hidden" name="token" value={token} />
                <label className="block space-y-1">
                  <span className="text-rt-muted">Your name</span>
                  <input className="field" name="name" defaultValue={invite.name} autoComplete="name" required />
                </label>
                <label className="block space-y-1">
                  <span className="text-rt-muted">Choose a password</span>
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
              <h1 className="h-page text-[22px] mb-1">This invite has run out</h1>
              <p className="text-rt-muted text-[13px]">Invites work once, for 7 days. Ask whoever invited you for a new one.</p>
            </>
          )}
        </div>
        <p className="text-rt-faint text-xs">
          Already joined? <Link href="/login" className="underline">Sign in</Link>
        </p>
      </div>
    </main>
  );
}
