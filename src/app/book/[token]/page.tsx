import { notFound } from "next/navigation";
import { publicBooking } from "@/lib/data/public";
import { BookingPicker } from "@/components/public-extras";
import { Lockup } from "@/components/brand";

export const dynamic = "force-dynamic";
export const metadata = { title: "Pick a time", robots: { index: false } };

const FORMAT: Record<string, string> = { video: "Video call", phone: "Phone call", in_person: "In person" };

/** An applicant picks one of the interview times on offer. */
export default async function BookingPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const b = await publicBooking(token);
  if (!b) notFound();
  const facts = [FORMAT[b.format] ?? b.format, b.durationMin ? `${b.durationMin} minutes` : "", b.interviewers ? `With ${b.interviewers}` : ""].filter(Boolean);
  return (
    <main className="max-w-[640px] mx-auto px-4 py-10 md:py-16 space-y-6">
      <header className="rise space-y-2">
        <p className="eyebrow">
          {b.company ? `${b.company} · ` : ""}
          {b.job}
        </p>
        <h1 className="text-[30px] md:text-[38px] font-semibold leading-[1.05] first-letter:uppercase" style={{ letterSpacing: "var(--rt-tracking-display)" }}>
          {b.title}
        </h1>
        <p className="text-rt-muted">Hi {b.firstName}, pick the time that suits you best.</p>
        <div className="flex flex-wrap gap-2 pt-1">
          {facts.map((f) => (
            <span key={f} className="chip">
              {f}
            </span>
          ))}
        </div>
      </header>
      <section className="card p-5 md:p-7" style={{ boxShadow: "var(--rt-shadow-raised)" }}>
        {b.booked ? (
          <p className="text-rt-muted">You&apos;ve already picked a time. If you need to change it, reply to the email you got this link in.</p>
        ) : (
          <BookingPicker token={token} slots={b.slots} durationMin={b.durationMin} />
        )}
      </section>
      <footer className="text-xs text-rt-faint flex items-center justify-center gap-2">
        <span>Hiring with</span> <Lockup size={12} />
      </footer>
    </main>
  );
}
