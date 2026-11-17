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
    <main className="max-w-2xl mx-auto px-4 py-10 space-y-6">
      <header className="space-y-1">
        <p className="eyebrow">
          {f.company ? `${f.company} · ` : ""}
          {f.jobTitle}
        </p>
        <h1 className="text-3xl font-semibold" style={{ letterSpacing: "var(--rt-tracking-display)" }}>
          {f.formName}
        </h1>
        <p className="text-rt-muted">Hi {f.firstName}, thanks for applying. A few more questions before we talk.</p>
      </header>
      <section className="card p-5 md:p-6">
        {f.done ? (
          <p className="text-rt-muted">You&apos;ve already sent this form. Thank you.</p>
        ) : (
          <PublicForm
            questions={f.questions}
            endpoint={`/api/screen/${slug}?t=${encodeURIComponent(t!)}`}
            askIdentity={false}
            submitLabel="Send answers"
            doneText="Thanks, your answers are in."
          />
        )}
      </section>
      <footer className="text-xs text-rt-faint flex items-center gap-2">
        <span>Hiring with</span> <Lockup size={12} />
      </footer>
    </main>
  );
}
