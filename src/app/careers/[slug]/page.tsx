import Link from "next/link";
import { notFound } from "next/navigation";
import { publicCareers } from "@/lib/data/public";
import { formatPay } from "@/lib/data/jobs";
import { Lockup } from "@/components/brand";

export const dynamic = "force-dynamic";

/**
 * A company's careers page. Public and indexable: it lists every open job
 * with a LIVE listing on the careers board, each linking to that listing's
 * apply page, which carries the JobPosting data Google for Jobs reads.
 */
export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const c = await publicCareers((await params).slug);
  if (!c) return { title: "Not found", robots: { index: false } };
  const name = c.company || "Open roles";
  return { title: `Careers at ${name}`, description: c.companyAbout.slice(0, 160) || `Open roles at ${name}.` };
}

const TYPE: Record<string, string> = { full_time: "Full time", part_time: "Part time", contract: "Contract", internship: "Internship", temporary: "Temporary" };
const PLACE: Record<string, string> = { remote: "Remote", hybrid: "Hybrid", onsite: "On site" };

export default async function CareersPage({ params }: { params: Promise<{ slug: string }> }) {
  const c = await publicCareers((await params).slug);
  if (!c) notFound();
  const name = c.company || "Open roles";
  const initial = name.trim()[0]?.toUpperCase() ?? "R";
  const site = c.companyWebsite?.replace(/^https?:\/\//, "").replace(/\/$/, "");
  return (
    <div className="min-h-screen">
      <div
        aria-hidden="true"
        className="absolute inset-x-0 top-0 h-[420px] -z-10"
        style={{
          background:
            "radial-gradient(60% 80% at 20% 0%, color-mix(in oklch, var(--rt-primary) 13%, transparent), transparent 70%), radial-gradient(40% 60% at 90% 10%, color-mix(in oklch, var(--rt-ai) 8%, transparent), transparent 70%)",
        }}
      />
      <main className="max-w-[720px] mx-auto px-4 py-10 md:py-16 space-y-8">
        <header className="rise space-y-5">
          <div className="flex items-center gap-3">
            <span className="grid place-items-center w-11 h-11 rounded-xl bg-rt-foreground text-rt-background text-[18px] font-semibold">{initial}</span>
            <div>
              <p className="font-semibold">{name}</p>
              {site && (
                <a href={c.companyWebsite} target="_blank" rel="noreferrer" className="text-[12.5px] text-rt-muted hover:text-rt-foreground">
                  {site}
                </a>
              )}
            </div>
          </div>
          <h1 className="text-[34px] md:text-[44px] font-semibold leading-[1.05]" style={{ letterSpacing: "var(--rt-tracking-display)" }}>
            {c.company ? `Work at ${c.company}` : "Open roles"}
          </h1>
          {c.companyAbout && <p className="text-rt-muted whitespace-pre-wrap">{c.companyAbout}</p>}
        </header>

        <section className="space-y-3">
          <p className="eyebrow">
            {c.jobs.length === 0 ? "No open roles right now" : c.jobs.length === 1 ? "1 open role" : `${c.jobs.length} open roles`}
          </p>
          {c.jobs.length === 0 && <p className="text-rt-muted">Nothing is open at the moment. Check back, or follow the company for news.</p>}
          <ul className="space-y-2">
            {c.jobs.map((j, i) => {
              const facts = [PLACE[j.workplace] ?? j.workplace, j.location, TYPE[j.employmentType] ?? j.employmentType, formatPay(j), j.team].filter(Boolean);
              return (
                <li key={j.applyPath} className="rise" style={{ ["--i" as string]: i + 1 }}>
                  <Link href={j.applyPath} className="card p-4 md:p-5 flex items-center gap-4 hover:border-rt-primary transition-colors">
                    <div className="flex-1 min-w-0 space-y-1">
                      <p className="font-semibold text-[16px]">{j.title}</p>
                      <p className="text-[13px] text-rt-muted">{facts.join(" · ")}</p>
                    </div>
                    <span className="btn text-xs shrink-0">View and apply</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>

        <footer className="text-xs text-rt-faint flex items-center justify-center gap-2 pt-4">
          <span>Hiring with</span> <Lockup size={12} />
        </footer>
      </main>
    </div>
  );
}
