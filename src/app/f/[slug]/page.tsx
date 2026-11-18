import { notFound } from "next/navigation";
import { publicScreening } from "@/lib/data/public";
import { PublicForm } from "@/components/public-form";
import { Lockup } from "@/components/brand";

export const dynamic = "force-dynamic";
export const metadata = { title: "Screening", robots: { index: false } };

/** A screening form, reached by one applicant's personal link (?t=<token>). */
export default async function ScreeningPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ t?: string }> }) {
  const { slug } = await params;
  const { t } = await searchParams;
  const f = t ? await publicScreening(slug, t) : null;
  if (!f) notFound();
  return (
    <main className="max-w-[720px] mx-auto px-4 py-10 md:py-16 space-y-6">
      <header className="rise space-y-2">
        <p className="eyebrow">
          {f.company ? `${f.company} · ` : ""}
          {f.jobTitle}
        </p>
        <h1 className="text-[32px] md:text-[40px] font-semibold leading-[1.05]" style={{ letterSpacing: "var(--rt-tracking-display)" }}>
          {f.formName}
        </h1>
        <p className="text-rt-muted">Hi {f.firstName}, thanks for applying. A few more questions before we talk.</p>
      </header>
      <section className="card p-5 md:p-7" style={{ boxShadow: "var(--rt-shadow-raised)" }}>
        {f.done ? (
          <p className="text-rt-muted">You&apos;ve already sent this form. Thank you.</p>
        ) : (
          <PublicForm
            questions={f.questions}
            endpoint={`/api/screen/${slug}?t=${encodeURIComponent(t!)}`}
            askIdentity={false}
            submitLabel="Send answers"
            doneTitle="Your answers are in."
            doneText="Thanks for taking the time."
            nextSteps={f.afterApply}
            company={f.company}
          />
        )}
      </section>
      <footer className="text-xs text-rt-faint flex items-center justify-center gap-2">
        <span>Hiring with</span> <Lockup size={12} />
      </footer>
    </main>
  );
}
