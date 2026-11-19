import { notFound } from "next/navigation";
import { publicScorecard } from "@/lib/data/public";
import { ScorecardForm } from "@/components/public-extras";
import { Lockup } from "@/components/brand";

export const dynamic = "force-dynamic";
export const metadata = { title: "Scorecard", robots: { index: false } };

/**
 * One interviewer's scorecard, by their own link. It shows the role's rubric
 * and nothing about other interviewers' verdicts, so each card is written
 * without seeing the rest.
 */
export default async function ScorecardPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const s = await publicScorecard(token);
  if (!s) notFound();
  const when = s.interview.scheduledAt?.toLocaleDateString("en-US", { month: "long", day: "numeric" });
  return (
    <main className="max-w-[680px] mx-auto px-4 py-10 md:py-16 space-y-6">
      <header className="rise space-y-2">
        <p className="eyebrow">
          {s.company ? `${s.company} · ` : ""}
          {s.job}
        </p>
        <h1 className="text-[30px] md:text-[38px] font-semibold leading-[1.05]" style={{ letterSpacing: "var(--rt-tracking-display)" }}>
          Your scorecard for {s.applicant}
        </h1>
        <p className="text-rt-muted">
          Hi {s.interviewer}. This is for {s.interview.title}
          {when ? ` on ${when}` : ""}. Write it before you compare notes with anyone; nobody else&apos;s verdict is shown here, so yours stays your own.
        </p>
      </header>
      {s.rubric && (
        <section className="card p-5 space-y-1">
          <p className="eyebrow">What makes a strong hire for this role</p>
          <p className="text-rt-muted whitespace-pre-wrap">{s.rubric}</p>
        </section>
      )}
      <section className="card p-5 md:p-7" style={{ boxShadow: "var(--rt-shadow-raised)" }}>
        {s.done ? <p className="text-rt-muted">Your scorecard is already in. Thank you.</p> : <ScorecardForm token={token} applicant={s.applicant} />}
      </section>
      <footer className="text-xs text-rt-faint flex items-center justify-center gap-2">
        <span>Hiring with</span> <Lockup size={12} />
      </footer>
    </main>
  );
}
