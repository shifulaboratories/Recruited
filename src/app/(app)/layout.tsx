import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { logout } from "@/server/actions";
import { Lockup } from "@/components/brand";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  return (
    <div className="min-h-screen md:grid md:grid-cols-[220px_1fr]">
      <aside className="border-b md:border-b-0 md:border-r border-rt-border p-4 flex md:flex-col gap-4 md:gap-6 items-center md:items-stretch">
        <Link href="/jobs">
          <Lockup />
        </Link>
        <nav className="flex md:flex-col gap-1 text-rt-muted">
          <Link className="px-2 py-1.5 rounded hover:bg-rt-subtle hover:text-rt-foreground" href="/jobs">
            Jobs
          </Link>
          <Link className="px-2 py-1.5 rounded hover:bg-rt-subtle hover:text-rt-foreground" href="/applications">
            Applicants
          </Link>
          <Link className="px-2 py-1.5 rounded hover:bg-rt-subtle hover:text-rt-foreground" href="/settings">
            Connect Claude
          </Link>
        </nav>
        <form action={logout} className="ml-auto md:ml-0 md:mt-auto">
          <span className="hidden md:block text-xs text-rt-faint mb-2 truncate">{user.email}</span>
          <button className="text-xs text-rt-muted hover:text-rt-foreground">Sign out</button>
        </form>
      </aside>
      <main className="p-4 md:p-8 max-w-5xl w-full">{children}</main>
    </div>
  );
}
