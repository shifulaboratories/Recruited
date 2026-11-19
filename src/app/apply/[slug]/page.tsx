import { notFound } from "next/navigation";
import { publicListing } from "@/lib/data/public";
import { turnstileSiteKey } from "@/lib/data/settings";
import { formatPay } from "@/lib/data/jobs";
import { toHtml } from "@/lib/boards";
import { PublicForm } from "@/components/public-form";
import { Lockup } from "@/components/brand";

export const dynamic = "force-dynamic";

/**
 * A listing's apply page. Public, reached by an unguessable slug, and the
 * reason every application knows which listing brought it. It shows the
 * listing, the company's own few lines, and the job's application form, and
 * nothing else from the workspace.
 */
export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const l = await publicListing((await params).slug);
  return { title: l ? `${l.title}${l.company ? ` at ${l.company}` : ""}` : "Not found", robots: { index: false } };
}

const TYPE: Record<string, string> = {
  full_time: "Full time",
  part_time: "Part time",
  contract: "Contract",
  internship: "Internship",
  temporary: "Temporary",
};
const PLACE: Record<string, string> = { remote: "Remote", hybrid: "Hybrid", onsite: "On site" };

export default async function ApplyPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const l = await publicListing(slug);
  const turnstile = await turnstileSiteKey();
  if (!l) notFound();
  const pay = formatPay(l.job);
  const facts: [string, string][] = (
    [
      ["Pay", pay],
      ["Type", TYPE[l.job.employmentType] ?? l.job.employmentType],
      ["Where", [PLACE[l.job.workplace] ?? l.job.workplace, l.job.location].filter(Boolean).join(" · ")],
      ["Team", l.job.team],
    ] as [string, string][]
  ).filter(([, v]) => v);
  const initial = (l.company || l.title).trim()[0]?.toUpperCase() ?? "R";
  const site = l.companyWebsite?.replace(/^https?:\/\//, "").replace(/\/$/, "");

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
        {l.preview && <p className="text-xs text-rt-muted inset p-2.5 text-center">Preview: this listing is still a draft. Applications sent now are kept.</p>}

        <header className="rise space-y-5">
          <div className="flex items-center gap-3">
            <span className="grid place-items-center w-11 h-11 rounded-xl bg-rt-foreground text-rt-background text-[18px] font-semibold">{initial}</span>
            <div>
              <p className="font-semibold">{l.company || "Hiring now"}</p>
              {site && (
                <a href={l.companyWebsite} target="_blank" rel="noreferrer" className="text-[12.5px] text-rt-muted hover:text-rt-foreground">
                  {site}
                </a>
              )}
            </div>
          </div>
          <h1 className="text-[34px] md:text-[44px] font-semibold leading-[1.05]" style={{ letterSpacing: "var(--rt-tracking-display)" }}>
            {l.title}
          </h1>
          {facts.length > 0 && (
            <dl className="grid grid-cols-2 md:grid-cols-4 gap-2">
              {facts.map(([k, v], i) => (
                <div key={k} className="card rise px-3.5 py-3" style={{ ["--i" as string]: i + 1 }}>
                  <dt className="eyebrow">{k}</dt>
                  <dd className="mt-1 text-[13.5px] font-medium leading-snug">{v}</dd>
                </div>
              ))}
            </dl>
          )}
          {l.open && (
            <a href="#apply" className="btn btn-primary h-10 px-5 text-[14px]">
              Apply now
            </a>
          )}
        </header>

        {l.companyAbout && (
          <section className="rise card p-5 md:p-6 space-y-2" style={{ ["--i" as string]: 2 }}>
            <p className="eyebrow">About {l.company || "us"}</p>
            <p className="text-rt-muted whitespace-pre-wrap">{l.companyAbout}</p>
          </section>
        )}

        {l.body && (
          <article
            className="rise space-y-3 text-[15px] leading-relaxed [&_b]:text-rt-foreground [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:space-y-1 [&_ol]:list-decimal [&_ol]:pl-5 [&_a]:text-rt-primary"
            style={{ ["--i" as string]: 3 }}
            dangerouslySetInnerHTML={{ __html: toHtml(l.body) }}
          />
        )}

        <section id="apply" className="card p-5 md:p-7 space-y-4 scroll-mt-6" style={{ boxShadow: "var(--rt-shadow-raised)" }}>
          <div className="space-y-1">
            <h2 className="h-page text-[22px]">Apply</h2>
            {l.open && <p className="text-rt-muted text-[13px]">Most people finish in about ten minutes.</p>}
          </div>
          {l.open ? (
            <PublicForm
              questions={l.questions}
              endpoint={`/api/apply/${slug}`}
              askIdentity
              doneText={`Thanks for applying${l.company ? ` to ${l.company}` : ""}. A confirmation isn't emailed, so this page is your receipt.`}
              nextSteps={l.afterApply}
              company={l.company}
              turnstileSiteKey={turnstile}
            />
          ) : (
            <p className="text-rt-muted">This role isn&apos;t taking applications any more.</p>
          )}
        </section>

        <footer className="text-xs text-rt-faint flex items-center justify-center gap-2 pt-4">
          <span>Hiring with</span> <Lockup size={12} />
        </footer>
      </main>
    </div>
  );
}
