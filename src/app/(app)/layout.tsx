import Link from "next/link";
import { requireSeat } from "@/lib/auth";
import { logout } from "@/server/actions";
import { listJobs } from "@/lib/data/jobs";
import { Lockup } from "@/components/brand";
import { Nav } from "@/components/nav";
import { Icon } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { person: user, seat, userId } = await requireSeat();
  const panel = !!seat.panelId;
  const jobs = panel ? [] : await listJobs(userId, { jobIds: seat.jobIds });
  const open = jobs.filter((j) => j.status === "OPEN").length;
  const applicants = jobs.reduce((n, j) => n + j.applicants, 0);
  // An interviewer sees only their interviews; everyone else the jobs and applicants they reach.
  const only = panel ? ["/interviews", "/settings"] : ["/jobs", "/applications", "/settings"];
  return (
    <div className="min-h-screen md:grid md:grid-cols-[232px_1fr]">
      <aside className="sticky top-0 z-20 md:h-screen flex md:flex-col items-center md:items-stretch gap-3 md:gap-6 px-4 py-3 md:p-4 md:pt-5 bg-[color-mix(in_oklch,var(--rt-canvas)_85%,transparent)] backdrop-blur md:backdrop-blur-none border-b md:border-b-0 border-rt-border">
        <Link href={panel ? "/interviews" : "/jobs"} className="px-1.5">
          <Lockup />
        </Link>
        <Nav counts={{ "/jobs": open, "/applications": applicants }} only={only} />
        <div className="hidden md:block mt-auto space-y-4">
          {!panel && (
          <div className="card p-3.5 text-[12.5px] space-y-1.5">
            <p className="flex items-center gap-1.5 font-medium">
              <Icon name="sparkle" size={13} className="text-rt-ai" />
              Try asking Claude
            </p>
            <p className="text-rt-muted leading-snug">&ldquo;Who from this week is worth a call?&rdquo;</p>
          </div>
          )}
          <form action={logout} className="flex items-center gap-2 px-1.5">
            <span className="text-xs text-rt-faint truncate flex-1" title={user.email}>
              {user.email}
            </span>
            <button className="text-rt-faint hover:text-rt-foreground" title="Sign out" aria-label="Sign out">
              <Icon name="out" size={14} />
            </button>
          </form>
        </div>
        <form action={logout} className="ml-auto md:hidden">
          <button className="text-rt-faint hover:text-rt-foreground" title="Sign out" aria-label="Sign out">
            <Icon name="out" size={15} />
          </button>
        </form>
      </aside>
      <main className="min-w-0 p-4 sm:p-6 md:p-10 md:pl-6">
        <div className="mx-auto max-w-[1180px]">{children}</div>
      </main>
    </div>
  );
}
