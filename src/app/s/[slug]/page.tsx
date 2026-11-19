import { notFound } from "next/navigation";
import { publicShared } from "@/lib/data/public";
import { ArrivalBar, OriginBadge, QualifiedChip, StageChip, TierChip, tierTone } from "@/components/provenance";
import { Avatar } from "@/components/ui";
import { Lockup } from "@/components/brand";
import { boardByKey } from "@/lib/boards";

export const dynamic = "force-dynamic";
export const metadata = { title: "Applicant", robots: { index: false } };

const VERDICT: Record<string, string> = { STRONG_YES: "Strong yes", YES: "Yes", NO: "No", STRONG_NO: "Strong no" };

/** One applicant, read-only, for someone the owner shared the link with. */
export default async function SharedApplicantPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const a = await publicShared(slug);
  if (!a) notFound();
  const tone = tierTone(a.tier);
  return (
    <main className="max-w-[820px] mx-auto px-4 py-10 md:py-14 space-y-6">
      <p className="eyebrow rise">
        {a.company ? `${a.company} · ` : ""}
        {a.job} · shared read-only
      </p>
      <header className="card rise p-5 sm:p-6 flex flex-wrap items-center gap-5" style={{ boxShadow: tone ? `var(--rt-shadow-card), inset 0 3px 0 ${tone}` : undefined }}>
        <Avatar name={a.name} tone={tone} size={52} />
        <div className="flex-1 min-w-[200px] space-y-1">
          <h1 className="h-page">{a.name}</h1>
          <p className="text-[12px] text-rt-faint">
            Applied {a.appliedAt.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
            {a.source ? ` via ${boardByKey(a.source)?.name ?? a.source}` : ""}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <StageChip stage={a.stage} />
          <TierChip tier={a.tier} proposal={a.tierIsProposal} />
          <QualifiedChip qualified={a.qualified} />
        </div>
        {a.tierReason && <p className="basis-full text-[13.5px] text-rt-muted">{a.tierReason}</p>}
      </header>

      {a.submissions.map((s) => (
        <section key={s.form + s.at.toISOString()} className="space-y-3">
          <h2 className="h-section">{s.form}</h2>
          <ul className="space-y-3">
            {s.answers.map((x) => (
              <li key={x.question} className="card p-5 space-y-3">
                <div className="text-[12.5px] font-medium text-rt-muted">{x.question}</div>
                <div className="whitespace-pre-wrap text-[14.5px] leading-relaxed">{x.answer || <span className="text-rt-faint">No answer</span>}</div>
                {x.written && x.answer && (
                  <div className="space-y-2">
                    <ArrivalBar pastedShare={x.pastedShare} ai={x.likelyAi} />
                    <div className="flex flex-wrap items-center gap-2">
                      <OriginBadge origin={x.origin} />
                      {x.likelyAi && (
                        <span className="chip" style={{ ["--tone" as string]: "var(--rt-ai)" }}>
                          <span className="dot" />
                          Likely written with AI
                        </span>
                      )}
                      <span className="text-xs text-rt-muted">{x.summary}</span>
                    </div>
                  </div>
                )}
              </li>
            ))}
          </ul>
        </section>
      ))}

      {a.interviews.some((i) => i.scorecards.length) && (
        <section className="space-y-3">
          <h2 className="h-section">Interviews</h2>
          {a.interviews
            .filter((i) => i.scorecards.length)
            .map((i) => (
              <div key={i.title + (i.at?.toISOString() ?? "")} className="card p-5 space-y-2">
                <p className="font-medium">{i.title}</p>
                {i.scorecards.map((c, k) => (
                  <div key={k} className="inset p-3 space-y-1">
                    <p className="text-xs">
                      <span className="font-medium">{c.interviewer}</span> <span className="font-mono uppercase tracking-wide text-rt-muted">{VERDICT[c.recommendation] ?? c.recommendation}</span>
                    </p>
                    {c.summary && <p className="text-[13.5px] text-rt-muted whitespace-pre-wrap">{c.summary}</p>}
                  </div>
                ))}
              </div>
            ))}
        </section>
      )}

      <p className="text-[11.5px] text-rt-faint leading-snug">
        How an answer arrived is what the browser saw, not proof of who wrote it. &ldquo;Likely written with AI&rdquo; is a style hint that misfires on second-language writers and grammar tools.
      </p>
      <footer className="text-xs text-rt-faint flex items-center justify-center gap-2">
        <span>Hiring with</span> <Lockup size={12} />
      </footer>
    </main>
  );
}
