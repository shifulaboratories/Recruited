import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { baseUrl, requireSeat } from "@/lib/auth";
import { reaches } from "@/lib/data/team";
import { seesEverything } from "@/lib/team";
import { formatPay, getJob } from "@/lib/data/jobs";
import { applyPath, listingReport } from "@/lib/data/listings";
import { listApplications } from "@/lib/data/applications";
import { boardByKey, renderListing, toHtml } from "@/lib/boards";
import { readQuestions } from "@/lib/forms";
import { closeOutAction, setJobStatus, setListingStatus } from "@/server/actions";
import { closeOutJob, DEFAULT_CLOSEOUT } from "@/lib/data/closeout";
import { ActionForm, CopyButton } from "@/components/forms";
import { ImportApplicants } from "@/components/import-applicants";
import { Board } from "@/components/board";
import { StepEditor } from "@/components/step-editor";
import { Empty, Icon, PageHeader, SectionHead } from "@/components/ui";
import { StageChip } from "@/components/provenance";

function sourceLabel(source: string) {
  const [key, variant] = source.split(" ");
  const b = boardByKey(key);
  return b ? `${b.name}${variant ? ` · ${variant}` : ""}` : source;
}

export default async function JobPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { seat, userId } = await requireSeat();
  if (seat.panelId) redirect("/interviews");
  if (!(await reaches(seat, { jobId: id }))) notFound();
  // Owners and recruiters run the job; a hiring manager sees it and moves applicants.
  const full = seesEverything(seat.role);
  const job = await getJob(userId, id);
  const base = await baseUrl();
  const report = await listingReport(userId, job.id);
  const { applications } = await listApplications(userId, { jobId: job.id, sort: "tier", limit: 500 });
  const byId = new Map(report.listings.map((r) => [r.listingId, r]));
  const filled = job.status === "CLOSED" || applications.some((a) => a.stage === "HIRED");
  const loop = filled && full ? await closeOutJob(userId, job.id, { dryRun: true }) : null;
  const pending = loop?.wouldDraft ?? 0;

  return (
    <div className="space-y-10">
      <div className="space-y-3">
        <Link href="/jobs" className="rise inline-flex items-center gap-1 text-[12.5px] text-rt-muted hover:text-rt-foreground">
          <Icon name="chevron" size={13} className="rotate-180" />
          Jobs
        </Link>
        <PageHeader
          eyebrow={<StageChip stage={job.status} />}
          title={job.title}
          sub={[job.team, job.location, job.workplace, formatPay(job)].filter(Boolean).join(" · ") || undefined}
          actions={
            !full ? undefined : job.status !== "OPEN" ? (
              <form action={setJobStatus.bind(null, job.id, "OPEN")}>
                <button className="btn btn-primary">Open for applications</button>
              </form>
            ) : (
              <form action={setJobStatus.bind(null, job.id, "CLOSED")}>
                <button className="btn">Close the role</button>
              </form>
            )
          }
        />
      </div>

      <section>
        <SectionHead title="Pipeline" count={applications.length}>
          <span className="text-[12px] text-rt-faint hidden sm:inline">Drag a card to move it. Tier order, A first.</span>
        </SectionHead>
        {applications.length === 0 ? (
          <Empty icon="board" title="Nobody yet" ask={job.listings.length ? "Import last week's applicants from this Indeed export." : `Post the ${job.title} role on LinkedIn.`} />
        ) : (
          <Board
            steps={job.steps}
            cards={applications.map((a) => ({
              id: a.id,
              candidate: a.candidate,
              source: sourceLabel(a.source),
              stage: a.stage,
              stepId: a.stepId,
              tier: a.effectiveTier,
              proposal: a.tierIsProposal,
              rank: a.proposal?.rank ?? null,
              qualified: a.qualified,
              provenance: a.provenance,
            }))}
          />
        )}
        {full && (
        <details className="mt-3 text-sm group">
          <summary className="btn btn-quiet text-xs cursor-pointer">Change this job&apos;s stages</summary>
          <div className="card p-4 mt-2">
            <StepEditor jobId={job.id} steps={job.steps} custom={job.customSteps} />
          </div>
        </details>
        )}
        {full && (
        <details className="mt-3 text-sm group">
          <summary className="btn btn-quiet text-xs cursor-pointer">Import applicants from a board export (CSV)</summary>
          <div className="card p-4 mt-2">
            <ImportApplicants
              jobId={job.id}
              listings={job.listings.map((l) => ({ id: l.id, label: `${boardByKey(l.board)?.name ?? l.board} ${l.variant}: ${l.title}` }))}
            />
          </div>
        </details>
        )}
      </section>

      {loop && pending > 0 && (
        <section className="card rise p-5 sm:p-6 space-y-4" style={{ boxShadow: "var(--rt-shadow-card), inset 3px 0 0 var(--rt-primary)" }}>
          <div className="space-y-1">
            <h2 className="h-section">Close the loop</h2>
            <p className="text-[13px] text-rt-muted">
              {pending} {pending === 1 ? "person hasn't" : "people haven't"} heard back:{" "}
              {loop.applicants
                .slice(0, 6)
                .map((x) => x.name)
                .join(", ")}
              {pending > 6 ? ` and ${pending - 6} more` : ""}. This saves a short, kind note for each as a draft on their page; nothing is sent until you send it.
            </p>
          </div>
          <details className="text-sm">
            <summary className="btn btn-primary text-xs cursor-pointer">Write the notes</summary>
            <ActionForm action={closeOutAction} submit={`Save ${pending} draft${pending === 1 ? "" : "s"}`} className="pt-3">
              <input type="hidden" name="jobId" value={job.id} />
              <input className="field" name="subject" defaultValue={DEFAULT_CLOSEOUT.subject} />
              <textarea className="field min-h-48" name="body" defaultValue={DEFAULT_CLOSEOUT.body} />
              <p className="text-[11.5px] text-rt-faint">
                {"{first_name}"}, {"{job}"}, {"{at_company}"} and {"{from}"} are filled in for each person.
              </p>
              <label className="flex items-center gap-2 text-[13px] text-rt-muted">
                <input type="checkbox" name="moveToRejected" defaultChecked /> Move them to Not this time
              </label>
              {job.status !== "CLOSED" && (
                <label className="flex items-center gap-2 text-[13px] text-rt-muted">
                  <input type="checkbox" name="closeJob" /> Close the role and its listings
                </label>
              )}
            </ActionForm>
          </details>
        </section>
      )}

      <section>
        <SectionHead title="Listings" count={job.listings.length} />
        {job.listings.length === 0 ? (
          <Empty icon="link" title="No listings yet" ask={`Write a listing for ${job.title} on OnlineJobs.ph and one on LinkedIn.`} />
        ) : (
          <div className="grid lg:grid-cols-2 gap-3">
            {job.listings.map((l, i) => {
              const url = `${base}${applyPath(l.slug)}`;
              const r = byId.get(l.id);
              const paste = renderListing(l.board, l.title, l.body, url);
              const stats: [string, number | string, string?][] = [
                ["Applied", r?.applicants ?? 0],
                ["Met must-haves", r?.qualified ?? 0],
                ["A tier", r?.tiers.A ?? 0, "var(--rt-tier-a)"],
                ["Interviewed", r?.reachedInterview ?? 0],
              ];
              return (
                <article key={l.id} className="card rise p-5 space-y-4 min-w-0" style={{ ["--i" as string]: i }}>
                  <div className="flex items-start gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="eyebrow">
                        {boardByKey(l.board)?.name ?? l.board} · listing {l.variant}
                      </p>
                      <p className="font-medium truncate mt-0.5">{l.title}</p>
                    </div>
                    {report.best?.listingId === l.id && (
                      <span
                        className="chip"
                        style={{ ["--tone" as string]: "var(--rt-tier-a)" }}
                        title={`Leads on ${report.best.by}.${report.best.note ? ` ${report.best.note}` : ""}`}
                      >
                        <span className="dot" />
                        {report.best.confident ? "Best so far" : "Leading"}
                      </span>
                    )}
                    <StageChip stage={l.status} />
                  </div>
                  <dl className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    {stats.map(([k, v, tone]) => (
                      <div key={k} className="inset px-2.5 py-2">
                        <dd className="text-[18px] font-semibold tabular leading-tight" style={tone ? { color: tone } : undefined}>
                          {v}
                        </dd>
                        <dt className="text-[10.5px] text-rt-faint leading-tight mt-0.5">{k}</dt>
                      </div>
                    ))}
                  </dl>
                  {r?.costPerATier != null && (
                    <p className="text-[12px] text-rt-muted">
                      {report.currency} {r.costPerATier.toLocaleString("en-US")} per A-tier applicant
                    </p>
                  )}
                  <div className="flex items-center gap-2 inset px-2.5 py-1.5">
                    <Icon name="link" size={13} className="text-rt-faint" />
                    <code className="text-[11.5px] text-rt-muted truncate flex-1 min-w-0">{url}</code>
                    <CopyButton text={url} label="Copy" />
                  </div>
                  <div className="flex flex-wrap gap-2 items-center">
                    <CopyButton text={paste.title} label="Copy title" />
                    <CopyButton text={paste.body} label={`Copy ${paste.format === "html" ? "HTML" : "text"} to paste`} />
                    <div className="flex-1" />
                    {!full ? null : l.status !== "LIVE" ? (
                      <form action={setListingStatus.bind(null, l.id, "LIVE")}>
                        <button className="btn text-xs">Mark live</button>
                      </form>
                    ) : (
                      <form action={setListingStatus.bind(null, l.id, "PAUSED")}>
                        <button className="btn btn-quiet text-xs">Pause</button>
                      </form>
                    )}
                  </div>
                  {paste.warnings.length > 0 && (
                    <ul className="text-[12px] text-rt-pasted space-y-1">
                      {paste.warnings.map((w) => (
                        <li key={w} className="flex gap-1.5">
                          <span className="dot mt-1.5" style={{ ["--tone" as string]: "var(--rt-pasted)" }} />
                          {w}
                        </li>
                      ))}
                    </ul>
                  )}
                </article>
              );
            })}
          </div>
        )}
      </section>

      <div className="grid lg:grid-cols-2 gap-6 items-start">
        <section>
          <SectionHead title="Forms" count={job.forms.length} />
          {job.forms.length === 0 ? (
            <p className="card p-4 text-rt-muted">No application form yet, so the apply page asks only for a name and email.</p>
          ) : (
            <div className="space-y-3">
              {job.forms.map((f) => (
                <div key={f.id} className="card p-5">
                  <div className="flex items-center gap-2 mb-3">
                    <Icon name="form" size={15} className="text-rt-faint" />
                    <span className="font-medium flex-1">{f.name}</span>
                    <span className="chip chip-mono">{f.kind.toLowerCase()}</span>
                  </div>
                  <ol className="space-y-2">
                    {readQuestions(f.questions).map((q, qi) => (
                      <li key={q.id} className="flex gap-3 text-[13px]">
                        <span className="font-mono text-[11px] text-rt-faint pt-0.5 w-4 text-right tabular">{qi + 1}</span>
                        <span className="flex-1 text-rt-muted">{q.label}</span>
                        {q.knockout && (
                          <span className="chip shrink-0" style={{ ["--tone" as string]: "var(--rt-primary)" }}>
                            must-have
                          </span>
                        )}
                      </li>
                    ))}
                  </ol>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="space-y-6">
          {job.rubric && (
            <div>
              <SectionHead title="What makes an A" />
              <p className="card p-5 text-rt-muted whitespace-pre-wrap" style={{ boxShadow: "var(--rt-shadow-card), inset 3px 0 0 var(--rt-tier-a)" }}>
                {job.rubric}
              </p>
            </div>
          )}
          {job.description && (
            <div>
              <SectionHead title="Description" />
              <article
                className="card p-5 space-y-3 text-rt-muted [&_h2]:text-rt-foreground [&_h2]:font-semibold [&_h3]:text-rt-foreground [&_h3]:font-medium [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5 [&_a]:text-rt-primary"
                dangerouslySetInnerHTML={{ __html: toHtml(job.description) }}
              />
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
