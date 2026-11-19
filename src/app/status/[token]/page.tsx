import Link from "next/link";
import { notFound } from "next/navigation";
import { publicApplicantStatus } from "@/lib/data/public";
import { STATUS_COPY, type PublicStatus } from "@/lib/applicant-status";
import { Lockup } from "@/components/brand";

export const dynamic = "force-dynamic";
export const metadata = { title: "Your application", robots: { index: false } };

const STEPS: PublicStatus[] = ["received", "in_review", "closed"];

/**
 * One applicant's own page, by the personal token in their links. Unlisted,
 * never indexed, and it shows only what they have already been told.
 */
export default async function StatusPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const s = await publicApplicantStatus(token);
  if (!s) notFound();
  const at = STEPS.indexOf(s.status);
  const copy = STATUS_COPY[s.status];
  const applied = s.appliedAt.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
  const waiting = s.forms.length + s.toBook.length;
  return (
    <main className="max-w-[640px] mx-auto px-4 py-10 md:py-16 space-y-6">
      <header className="rise space-y-2">
        <p className="eyebrow">
          {s.company ? `${s.company} · ` : ""}
          {s.jobTitle}
        </p>
        <h1 className="text-[32px] md:text-[40px] font-semibold leading-[1.05]" style={{ letterSpacing: "var(--rt-tracking-display)" }}>
          {s.firstName ? `${s.firstName}, your application` : "Your application"}
        </h1>
        <p className="text-rt-muted">Sent {applied}.</p>
      </header>

      <section className="card p-5 md:p-7 space-y-5" style={{ boxShadow: "var(--rt-shadow-raised)" }}>
        <ol className="grid grid-cols-3 gap-2" aria-label="Where your application is">
          {STEPS.map((step, i) => (
            <li key={step} className="space-y-1.5" aria-current={i === at ? "step" : undefined}>
              <span className={`block h-1.5 rounded-full ${i <= at ? "bg-rt-primary" : "bg-rt-border"}`} />
              <span className={`block text-[12.5px] ${i === at ? "font-semibold text-rt-foreground" : "text-rt-faint"}`}>{STATUS_COPY[step].title}</span>
            </li>
          ))}
        </ol>
        <div className="space-y-1">
          <h2 className="h-section">{copy.title}</h2>
          <p className="text-rt-muted">{copy.text}</p>
        </div>
        {s.afterApply && s.status !== "closed" && (
          <div className="space-y-1 border-t border-rt-border pt-4">
            <p className="eyebrow">What happens next</p>
            <p className="text-rt-muted whitespace-pre-wrap">{s.afterApply}</p>
          </div>
        )}
      </section>

      {waiting > 0 && (
        <section className="space-y-2">
          <p className="eyebrow">Waiting on you</p>
          {s.forms.map((f) => (
            <Link key={f.path} href={f.path} className="card p-4 flex items-center gap-3 hover:border-rt-primary transition-colors">
              <span className="flex-1">{f.name}</span>
              <span className="btn btn-primary text-xs">Fill it in</span>
            </Link>
          ))}
          {s.toBook.map((b) => (
            <Link key={b.path} href={b.path} className="card p-4 flex items-center gap-3 hover:border-rt-primary transition-colors">
              <span className="flex-1">{b.title}</span>
              <span className="btn btn-primary text-xs">Pick a time</span>
            </Link>
          ))}
        </section>
      )}

      <p className="text-xs text-rt-faint text-center">This page is only for you. Anyone with its address can see it, so keep the link to yourself.</p>
      <footer className="text-xs text-rt-faint flex items-center justify-center gap-2">
        <span>Hiring with</span> <Lockup size={12} />
      </footer>
    </main>
  );
}
