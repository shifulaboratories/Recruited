import Link from "next/link";
import { baseUrl, requireUser } from "@/lib/auth";
import { formatPay, getJob } from "@/lib/data/jobs";
import { applyPath, listingReport } from "@/lib/data/listings";
import { listApplications } from "@/lib/data/applications";
import { boardByKey, renderListing, toHtml } from "@/lib/boards";
import { readQuestions } from "@/lib/forms";
import { setJobStatus, setListingStatus } from "@/server/actions";
import { CopyButton } from "@/components/forms";
import { ImportApplicants } from "@/components/import-applicants";
import { ProvenanceBar, QualifiedChip, StageChip, TierChip } from "@/components/provenance";

export default async function JobPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser();
  const job = await getJob(user.id, id);
  const base = await baseUrl();
  const report = await listingReport(user.id, job.id);
  const { applications } = await listApplications(user.id, { jobId: job.id, sort: "tier" });
  const byId = new Map(report.listings.map((r) => [r.listingId, r]));

  return (
    <div className="space-y-8">
      <header className="flex flex-wrap items-start gap-4">
        <div className="flex-1">
          <p className="eyebrow">Job · {job.status.toLowerCase()}</p>
          <h1 className="text-2xl font-semibold tracking-tight">{job.title}</h1>
          <p className="text-rt-muted">{[job.team, job.location, job.workplace, formatPay(job)].filter(Boolean).join(" · ")}</p>
        </div>
        <div className="flex gap-2">
          {job.status !== "OPEN" && (
            <form action={setJobStatus.bind(null, job.id, "OPEN")}>
              <button className="btn btn-primary">Open for applications</button>
            </form>
          )}
          {job.status === "OPEN" && (
            <form action={setJobStatus.bind(null, job.id, "CLOSED")}>
              <button className="btn">Close</button>
            </form>
          )}
        </div>
      </header>

      <section className="space-y-3">
        <h2 className="font-semibold">Listings</h2>
        {job.listings.length === 0 ? (
          <p className="text-rt-muted">
            No listings yet. Ask Claude to <span className="font-mono text-xs">create_listing</span> for the boards you use; each one gets its own apply link.
          </p>
        ) : (
          <ul className="space-y-3">
            {job.listings.map((l) => {
              const url = `${base}${applyPath(l.slug)}`;
              const r = byId.get(l.id);
              const paste = renderListing(l.board, l.title, l.body, url);
              return (
                <li key={l.id} className="card p-4 space-y-3">
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                    <span className="font-mono text-xs rounded bg-rt-primary-tint text-rt-primary px-1.5 py-0.5">
                      {boardByKey(l.board)?.name ?? l.board} · {l.variant}
                    </span>
                    <span className="font-medium flex-1 min-w-[160px]">{l.title}</span>
                    <span className="text-xs text-rt-muted tabular">
                      {r?.applicants ?? 0} applied · {r?.qualified ?? 0} qualified ·{" "}
                      <span style={{ color: "var(--rt-tier-a)" }}>{r?.tiers.A ?? 0} A-tier</span> · {r?.reachedInterview ?? 0} interviewed
                      {r?.costPerATier != null && ` · ${report.currency} ${r.costPerATier} per A-tier`}
                    </span>
                    <StageChip stage={l.status} />
                  </div>
                  <div className="flex flex-wrap gap-2 items-center">
                    <code className="text-xs text-rt-muted truncate max-w-full">{url}</code>
                    <CopyButton text={url} label="Copy apply link" />
                    <CopyButton text={paste.title} label="Copy title" />
                    <CopyButton text={paste.body} label={`Copy ${paste.format === "html" ? "HTML" : "text"} to paste`} />
                    {l.status !== "LIVE" && (
                      <form action={setListingStatus.bind(null, l.id, "LIVE")}>
                        <button className="btn text-xs">Mark live</button>
                      </form>
                    )}
                    {l.status === "LIVE" && (
                      <form action={setListingStatus.bind(null, l.id, "PAUSED")}>
                        <button className="btn text-xs">Pause</button>
                      </form>
                    )}
                  </div>
                  {paste.warnings.length > 0 && (
                    <ul className="text-xs text-rt-pasted list-disc pl-4">
                      {paste.warnings.map((w) => (
                        <li key={w}>{w}</li>
                      ))}
                    </ul>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="font-semibold">Applicants</h2>
        {applications.length === 0 ? (
          <p className="text-rt-muted">Nobody yet. People who use an apply link land here on their own.</p>
        ) : (
          <ul className="card divide-y divide-rt-border">
            {applications.map((a) => (
              <li key={a.id}>
                <Link href={`/applications/${a.id}`} className="flex flex-wrap items-center gap-x-6 gap-y-2 p-4 hover:bg-rt-subtle">
                  <div className="w-28 shrink-0">
                    <TierChip tier={a.effectiveTier} proposal={a.tierIsProposal} rank={a.proposal?.rank} />
                  </div>
                  <div className="flex-1 min-w-[180px]">
                    <div className="font-medium">{a.candidate}</div>
                    <div className="text-xs text-rt-muted">{a.source}</div>
                  </div>
                  <QualifiedChip qualified={a.qualified} />
                  <ProvenanceBar r={a.provenance} />
                  <StageChip stage={a.stage} />
                </Link>
              </li>
            ))}
          </ul>
        )}
        <details className="text-sm">
          <summary className="cursor-pointer text-rt-muted hover:text-rt-foreground">Import applicants from a board export (CSV)</summary>
          <div className="pt-3">
            <ImportApplicants
              jobId={job.id}
              listings={job.listings.map((l) => ({ id: l.id, label: `${boardByKey(l.board)?.name ?? l.board} ${l.variant}: ${l.title}` }))}
            />
          </div>
        </details>
      </section>

      <section className="space-y-3">
        <h2 className="font-semibold">Forms</h2>
        {job.forms.length === 0 ? (
          <p className="text-rt-muted">No application form yet, so the apply page asks only for a name and email.</p>
        ) : (
          <div className="grid md:grid-cols-2 gap-3">
            {job.forms.map((f) => (
              <div key={f.id} className="card p-4">
                <p className="eyebrow">{f.kind.toLowerCase()}</p>
                <div className="font-medium mb-2">{f.name}</div>
                <ol className="list-decimal pl-5 text-rt-muted space-y-1">
                  {readQuestions(f.questions).map((q) => (
                    <li key={q.id}>
                      {q.label}
                      {q.knockout && <span className="text-xs text-rt-faint"> · must-have</span>}
                    </li>
                  ))}
                </ol>
              </div>
            ))}
          </div>
        )}
      </section>

      {job.rubric && (
        <section className="space-y-2">
          <h2 className="font-semibold">What makes an A</h2>
          <p className="card p-4 text-rt-muted whitespace-pre-wrap">{job.rubric}</p>
        </section>
      )}

      {job.description && (
        <section className="space-y-2">
          <h2 className="font-semibold">Description</h2>
          <article
            className="card p-4 space-y-3 text-rt-muted [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5 [&_a]:text-rt-primary"
            dangerouslySetInnerHTML={{ __html: toHtml(job.description) }}
          />
        </section>
      )}
    </div>
  );
}
