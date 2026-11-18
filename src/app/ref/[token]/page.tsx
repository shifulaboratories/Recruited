import { notFound } from "next/navigation";
import { publicReference } from "@/lib/data/public";
import { ReferenceForm } from "@/components/public-extras";
import { Lockup } from "@/components/brand";

export const dynamic = "force-dynamic";
export const metadata = { title: "Reference", robots: { index: false } };

/** A referee's page, reached by the personal link in the request. */
export default async function ReferencePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const r = await publicReference(token);
  if (!r) notFound();
  return (
    <main className="max-w-[680px] mx-auto px-4 py-10 md:py-16 space-y-6">
      <header className="rise space-y-2">
        <p className="eyebrow">
          {r.company ? `${r.company} · ` : ""}
          {r.job}
        </p>
        <h1 className="text-[30px] md:text-[38px] font-semibold leading-[1.05]" style={{ letterSpacing: "var(--rt-tracking-display)" }}>
          A reference for {r.candidate}
        </h1>
        <p className="text-rt-muted">
          Hi {r.referee}, {r.candidate.split(/\s+/)[0]} gave your name as someone who knows their work. Four short questions, about five minutes. What you write goes only to the people hiring for this role.
        </p>
      </header>
      <section className="card p-5 md:p-7" style={{ boxShadow: "var(--rt-shadow-raised)" }}>
        {r.done ? <p className="text-rt-muted">You&apos;ve already answered. Thank you.</p> : <ReferenceForm token={token} questions={r.questions} candidate={r.candidate} />}
      </section>
      <footer className="text-xs text-rt-faint flex items-center justify-center gap-2">
        <span>Hiring with</span> <Lockup size={12} />
      </footer>
    </main>
  );
}
