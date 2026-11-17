import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { getApplication, STAGES, TIERS } from "@/lib/data/applications";
import { boardByKey } from "@/lib/boards";
import { filePath } from "@/lib/data/uploads";
import type { StyleSignal } from "@/lib/provenance";
import type { KnockoutResult } from "@/lib/forms";
import {
  acceptProposal,
  addInterviewAction,
  addNote,
  addScorecardAction,
  deleteMessageDraft,
  markMessageSent,
  moveStage,
  recordOfferAction,
  saveMessageDraft,
  setInterviewStatus,
  setOfferStatusAction,
  setTier,
} from "@/server/actions";
import { ActionForm, CopyButton, DateTimeInput, LocalTime } from "@/components/forms";
import { interviewsAndOffers } from "@/lib/data/interviews";
import { OFFER_TERM_LABEL, RECOMMENDATION_LABEL, RECOMMENDATIONS } from "@/lib/scorecards";
import { KIND_LABEL, MAILTO_SAFE_LENGTH, MESSAGE_KINDS, mailtoLink } from "@/lib/messages";
import { OriginBadge, ProvenanceBar, QualifiedChip, StyleBadge, TierChip } from "@/components/provenance";

function minutes(ms: number) {
  const m = Math.round(ms / 60000);
  return m < 1 ? "under a minute" : `${m} minute${m === 1 ? "" : "s"}`;
}

export default async function ApplicationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser();
  const a = await getApplication(user.id, id);
  const io = await interviewsAndOffers(user.id, id);
  const latestOffer = io.offers.at(-1);
  return (
    <div className="space-y-8">
      <header className="space-y-2">
        <p className="eyebrow">
          <Link href={`/jobs/${a.job.id}`} className="hover:text-rt-foreground">
            {a.job.title}
          </Link>{" "}
          · {a.listing ? `${boardByKey(a.listing.board)?.name ?? a.listing.board} ${a.listing.variant}` : a.source || "added by hand"}
        </p>
        <h1 className="text-2xl font-semibold tracking-tight">{a.candidate.name}</h1>
        <p className="text-rt-muted">
          {a.candidate.email}
          {a.candidate.phone && ` · ${a.candidate.phone}`}
          {a.candidate.links.map((l) => (
            <a key={l} href={l} className="link ml-2" target="_blank" rel="noreferrer">
              {l.replace(/^https?:\/\//, "").slice(0, 40)}
            </a>
          ))}
        </p>
        <div className="flex flex-wrap items-center gap-4">
          <TierChip tier={a.effectiveTier} proposal={a.tierIsProposal} rank={a.proposal?.rank} />
          <QualifiedChip qualified={a.qualified} />
          <ProvenanceBar r={a.provenance} />
        </div>
        <div className="flex flex-wrap gap-1 pt-2">
          {STAGES.map((s) => (
            <form key={s} action={moveStage.bind(null, a.id, s)}>
              <button
                className={`font-mono text-[11px] uppercase tracking-wide rounded px-2 py-1 border ${
                  a.stage === s ? "border-rt-primary bg-rt-primary-tint text-rt-primary" : "border-rt-border text-rt-muted hover:text-rt-foreground"
                }`}
              >
                {s.toLowerCase()}
              </button>
            </form>
          ))}
        </div>
      </header>

      <section className="card p-4 space-y-3">
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="font-semibold">Tier</h2>
          <div className="flex gap-1">
            {TIERS.map((t) => (
              <form key={t} action={setTier.bind(null, a.id, t)}>
                <button
                  className={`font-mono text-xs w-8 h-7 rounded border ${a.tier === t ? "border-rt-primary bg-rt-primary-tint text-rt-primary" : "border-rt-border text-rt-muted hover:text-rt-foreground"}`}
                  aria-pressed={a.tier === t}
                >
                  {t}
                </button>
              </form>
            ))}
            {a.tier && (
              <form action={setTier.bind(null, a.id, null)}>
                <button className="text-xs text-rt-muted hover:text-rt-foreground px-2 h-7">Clear</button>
              </form>
            )}
          </div>
          <span className="text-xs text-rt-faint">
            {a.tier ? `Decided${a.tierBy === "mcp" ? " through Claude" : ""}.` : "Not decided yet."} A: worth a call this week. B: call if the A&apos;s run out. C: not this time.
          </span>
        </div>
        {a.tierReason && <p className="text-rt-muted">{a.tierReason}</p>}
        {a.proposal && !(a.tier === a.proposal.tier && a.tierReason === a.proposal.reason) && (
          <div className="flex flex-wrap items-start gap-3 rounded bg-rt-subtle p-3">
            <TierChip tier={a.proposal.tier} proposal rank={a.proposal.rank} />
            <p className="flex-1 min-w-[200px] text-rt-muted">
              <span className="text-rt-foreground">Claude&apos;s proposal: </span>
              {a.proposal.reason}
            </p>
            {a.tier !== a.proposal.tier && (
              <form action={acceptProposal.bind(null, a.id)}>
                <button className="btn text-xs">Accept {a.proposal.tier}</button>
              </form>
            )}
          </div>
        )}
      </section>

      {a.submissions.length === 0 && <p className="text-rt-muted">No forms filled in yet.</p>}

      {a.submissions.map((s) => {
        const failed = (s.failedKnockouts as KnockoutResult[]) ?? [];
        return (
          <section key={s.id} className="space-y-3">
            <div className="flex flex-wrap items-baseline gap-x-3">
              <h2 className="font-semibold">{s.form.name}</h2>
              <span className="text-xs text-rt-faint">
                {s.submittedAt.toLocaleDateString("en-US", { month: "short", day: "numeric" })} · took {minutes(s.durationMs)}
                {!s.recorded && " · not recorded (the page's script didn't run)"}
              </span>
            </div>
            {failed.length > 0 && (
              <div className="text-xs text-rt-muted">
                Missed {failed.length === 1 ? "a must-have" : `${failed.length} must-haves`}:{" "}
                {failed.map((f) => `${f.label} (answered "${f.answer}", needs ${f.expected})`).join("; ")}
              </div>
            )}
            <ul className="space-y-3">
              {s.answers.map((x) => {
                const signals = (x.style.signals as StyleSignal[]) ?? [];
                const written = x.origin !== "UNKNOWN" || signals.length > 0;
                const hl = x.style.score >= 0.5 ? "hl-ai" : x.origin === "PASTED" || x.origin === "INJECTED" ? "hl-pasted" : "";
                return (
                  <li key={x.questionId} className="card p-4 space-y-2">
                    <div className="text-rt-muted">{x.question}</div>
                    {x.files.length > 0 ? (
                      <div className="flex flex-wrap gap-3">
                        {x.files.map((f) => (
                          <a key={f.id} href={filePath(f.id)} target="_blank" rel="noreferrer" className="block group">
                            {f.mimeType.startsWith("image/") && f.mimeType !== "image/heic" ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img src={filePath(f.id)} alt={f.filename} className="max-h-56 max-w-full rounded border border-rt-border" />
                            ) : (
                              <span className="btn text-xs">Open {f.mimeType === "application/pdf" ? "PDF" : "file"}</span>
                            )}
                            <span className="block text-xs text-rt-muted mt-1 group-hover:text-rt-foreground">
                              {f.filename} · {Math.max(1, Math.round(f.size / 1024))} KB
                            </span>
                          </a>
                        ))}
                      </div>
                    ) : (
                      <div className="whitespace-pre-wrap">
                        {x.answer ? <span className={`rounded-sm ${hl}`}>{x.answer}</span> : <span className="text-rt-faint">No answer</span>}
                      </div>
                    )}
                    {written && x.answer && (
                      <div className="space-y-1 pt-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <OriginBadge origin={x.origin} />
                          <StyleBadge score={x.style.score} label={x.style.label} />
                          <span className="text-xs text-rt-muted">{x.summary}</span>
                        </div>
                        {signals.length > 0 && (
                          <details className="text-xs text-rt-muted">
                            <summary className="cursor-pointer">Why the style label says that</summary>
                            <ul className="list-disc pl-4 mt-1">
                              {signals.map((sig) => (
                                <li key={sig.key}>
                                  {sig.label}: {sig.evidence}
                                </li>
                              ))}
                            </ul>
                            <p className="mt-1 text-rt-faint">
                              Style signals are hints, not proof. They misfire on second-language writers and people who use grammar tools.
                            </p>
                          </details>
                        )}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}

      <section className="space-y-3">
        <div className="flex flex-wrap items-baseline gap-x-3">
          <h2 className="font-semibold">Interviews</h2>
          {io.panel.scorecards > 0 && (
            <span className="text-xs text-rt-muted">
              {io.panel.yes} yes, {io.panel.no} no across {io.panel.scorecards} scorecard{io.panel.scorecards === 1 ? "" : "s"}
              {io.panel.strongNo && " · someone said strong no; read why before deciding"}
              {io.panel.split && !io.panel.strongNo && " · the panel is split"}
            </span>
          )}
        </div>
        {io.interviews.length === 0 && <p className="text-rt-muted">No interviews yet. Ask Claude to schedule one, or add it below.</p>}
        {io.interviews.map((iv) => (
          <div key={iv.id} className={`card p-4 space-y-3 ${iv.status === "CANCELLED" ? "opacity-60" : ""}`}>
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <span className="font-mono text-[11px] uppercase tracking-wide text-rt-muted">Round {iv.round}</span>
              <span className="font-medium">{iv.title}</span>
              <span className="text-xs text-rt-muted">
                {iv.scheduledAt ? <LocalTime iso={iv.scheduledAt.toISOString()} /> : "No time set"}
                {iv.durationMin ? ` · ${iv.durationMin} min` : ""} · {iv.format.replace("_", " ")}
                {iv.interviewers && ` · with ${iv.interviewers}`}
              </span>
            </div>
            {iv.location && (
              <div className="text-xs">
                {/^https?:\/\//.test(iv.location) ? (
                  <a className="link" href={iv.location} target="_blank" rel="noreferrer">
                    {iv.location}
                  </a>
                ) : (
                  <span className="text-rt-muted">{iv.location}</span>
                )}
              </div>
            )}
            <div className="flex flex-wrap gap-1">
              {(["SCHEDULED", "DONE", "CANCELLED", "NO_SHOW"] as const).map((st) => (
                <form key={st} action={setInterviewStatus.bind(null, a.id, iv.id, st)}>
                  <button
                    className={`font-mono text-[11px] uppercase tracking-wide rounded px-2 py-1 border ${
                      iv.status === st ? "border-rt-primary bg-rt-primary-tint text-rt-primary" : "border-rt-border text-rt-muted hover:text-rt-foreground"
                    }`}
                  >
                    {st.replace("_", " ").toLowerCase()}
                  </button>
                </form>
              ))}
            </div>
            {iv.scorecards.map((c) => (
              <div key={c.id} className="rounded bg-rt-subtle p-3 space-y-1">
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <span className="font-medium text-rt-foreground">{c.interviewer}</span>
                  <span className="font-mono uppercase tracking-wide text-rt-muted">{RECOMMENDATION_LABEL[c.recommendation]}</span>
                  {c.writtenBy === "mcp" && <span className="text-rt-faint">recorded through Claude</span>}
                </div>
                {c.ratings.length > 0 && (
                  <ul className="text-xs text-rt-muted space-y-0.5">
                    {c.ratings.map((r) => (
                      <li key={r.criterion}>
                        <span className="font-mono">{r.score}/4</span> {r.criterion}
                        {r.note && ` · ${r.note}`}
                      </li>
                    ))}
                  </ul>
                )}
                {c.summary && <p className="text-rt-muted whitespace-pre-wrap">{c.summary}</p>}
              </div>
            ))}
            {iv.status !== "CANCELLED" && (
              <details className="text-sm">
                <summary className="cursor-pointer text-rt-muted hover:text-rt-foreground">Add a scorecard</summary>
                <ActionForm action={addScorecardAction} submit="Save scorecard" className="pt-3">
                  <input type="hidden" name="applicationId" value={a.id} />
                  <input type="hidden" name="interviewId" value={iv.id} />
                  <input className="field" name="interviewer" placeholder="Interviewer" />
                  <select name="recommendation" className="field" defaultValue="YES">
                    {RECOMMENDATIONS.map((r) => (
                      <option key={r} value={r}>
                        {RECOMMENDATION_LABEL[r]}
                      </option>
                    ))}
                  </select>
                  <textarea className="field min-h-20" name="summary" placeholder="What you saw: evidence, not adjectives." />
                </ActionForm>
              </details>
            )}
          </div>
        ))}
        <details className="text-sm">
          <summary className="cursor-pointer text-rt-muted hover:text-rt-foreground">Add an interview</summary>
          <ActionForm action={addInterviewAction} submit="Add round" className="pt-3">
            <input type="hidden" name="applicationId" value={a.id} />
            <input className="field" name="title" placeholder="Screening call, work sample review, final with the founder" />
            <div className="grid gap-3 sm:grid-cols-3">
              <DateTimeInput name="scheduledAt" />
              <input className="field" name="durationMin" type="number" min={5} max={600} placeholder="Minutes" />
              <select name="format" className="field" defaultValue="video">
                <option value="video">Video</option>
                <option value="phone">Phone</option>
                <option value="in_person">In person</option>
              </select>
            </div>
            <input className="field" name="interviewers" placeholder="Who they'll meet" />
            <input className="field" name="location" placeholder="Meeting link or address" />
          </ActionForm>
        </details>
      </section>

      <section className="space-y-3">
        <h2 className="font-semibold">Offer</h2>
        {!latestOffer && <p className="text-rt-muted">No offer yet.</p>}
        {[...io.offers].reverse().map((o) => {
          const latest = o.id === latestOffer?.id;
          return (
            <div key={o.id} className={`card p-4 space-y-2 ${latest ? "" : "opacity-70"}`}>
              <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <span className="font-mono text-[11px] uppercase tracking-wide text-rt-muted">Version {o.version}</span>
                <span className="font-medium">{o.title}</span>
                <span className="text-xs text-rt-muted">{o.status.toLowerCase()}</span>
                {o.changedFromPrevious.length > 0 && <span className="text-xs text-rt-faint">changed: {o.changedFromPrevious.map((k) => OFFER_TERM_LABEL[k as keyof typeof OFFER_TERM_LABEL] ?? k).join(", ")}</span>}
              </div>
              <dl className="grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
                {o.pay && (
                  <div>
                    <dt className="inline text-rt-muted">Pay </dt>
                    <dd className="inline">{o.pay}</dd>
                  </div>
                )}
                {o.startDate && (
                  <div>
                    <dt className="inline text-rt-muted">Starts </dt>
                    <dd className="inline">{o.startDate.toISOString().slice(0, 10)}</dd>
                  </div>
                )}
                {o.hours && (
                  <div>
                    <dt className="inline text-rt-muted">Hours </dt>
                    <dd className="inline">{o.hours}</dd>
                  </div>
                )}
                {o.respondBy && (
                  <div>
                    <dt className="inline text-rt-muted">Answer by </dt>
                    <dd className="inline">{o.respondBy.toISOString().slice(0, 10)}</dd>
                  </div>
                )}
              </dl>
              {o.terms && <p className="text-rt-muted whitespace-pre-wrap">{o.terms}</p>}
              {latest && (
                <div className="flex flex-wrap gap-1 pt-1">
                  {(["DRAFT", "EXTENDED", "ACCEPTED", "DECLINED", "WITHDRAWN"] as const).map((st) => (
                    <form key={st} action={setOfferStatusAction.bind(null, a.id, o.id, st)}>
                      <button
                        className={`font-mono text-[11px] uppercase tracking-wide rounded px-2 py-1 border ${
                          o.status === st ? "border-rt-primary bg-rt-primary-tint text-rt-primary" : "border-rt-border text-rt-muted hover:text-rt-foreground"
                        }`}
                      >
                        {st.toLowerCase()}
                      </button>
                    </form>
                  ))}
                </div>
              )}
            </div>
          );
        })}
        <details className="text-sm">
          <summary className="cursor-pointer text-rt-muted hover:text-rt-foreground">{latestOffer ? "Change the terms (saves a new version)" : "Write an offer"}</summary>
          <ActionForm action={recordOfferAction} submit="Save version" className="pt-3">
            <input type="hidden" name="applicationId" value={a.id} />
            <p className="text-xs text-rt-faint">{latestOffer ? "Leave a field empty to keep it as it is." : "Leave a field empty if it isn't decided yet."}</p>
            <div className="grid gap-3 sm:grid-cols-3">
              <input className="field" name="payAmount" inputMode="numeric" placeholder={latestOffer?.payAmount?.toLocaleString("en-US") ?? "Pay"} />
              <input className="field" name="payCurrency" placeholder={latestOffer?.payCurrency ?? "Currency"} />
              <select name="payPeriod" className="field" defaultValue="">
                <option value="">{latestOffer ? `per ${latestOffer.payPeriod}` : "Per…"}</option>
                <option value="hour">per hour</option>
                <option value="month">per month</option>
                <option value="year">per year</option>
              </select>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="text-xs text-rt-muted space-y-1 block">
                Start date
                <input className="field" name="startDate" type="date" />
              </label>
              <label className="text-xs text-rt-muted space-y-1 block">
                Answer by
                <input className="field" name="respondBy" type="date" />
              </label>
            </div>
            <input className="field" name="hours" placeholder={latestOffer?.hours || "Hours and schedule"} />
            <textarea className="field min-h-20" name="terms" placeholder={latestOffer?.terms || "Anything else agreed: probation, equipment, leave."} />
          </ActionForm>
        </details>
      </section>

      <section className="space-y-3">
        <div className="flex flex-wrap items-baseline gap-x-3">
          <h2 className="font-semibold">Messages</h2>
          <span className="text-xs text-rt-faint">Recruited never sends email. Open a draft in your own email, send it there, then mark it sent.</span>
        </div>
        {a.messages.length === 0 && <p className="text-rt-muted">Nothing sent yet. Ask Claude to draft a screening invite, an interview invite or a rejection, or write one below.</p>}
        {a.messages.map((m) => {
          const mailto = mailtoLink(a.candidate.email, m.subject, m.body);
          const draft = m.status === "DRAFT";
          const day = (d: Date) => d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
          return (
            <div key={m.id} className={`card p-4 space-y-2 ${draft ? "border-dashed" : ""}`}>
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <span className="font-mono uppercase tracking-wide text-rt-muted">{KIND_LABEL[m.kind]}</span>
                <span className={draft ? "text-rt-muted" : "text-rt-foreground"}>
                  {draft ? `Draft${m.writtenBy === "mcp" ? " from Claude" : ""} · ${day(m.createdAt)}` : `Sent ${day(m.sentAt ?? m.createdAt)}`}
                </span>
              </div>
              {m.subject && <div className="font-medium">{m.subject}</div>}
              <div className="whitespace-pre-wrap text-rt-muted">{m.body}</div>
              {draft && (
                <div className="flex flex-wrap items-center gap-2 pt-1">
                  {mailto.length <= MAILTO_SAFE_LENGTH ? (
                    <a className="btn btn-primary text-xs" href={mailto}>
                      Open in email
                    </a>
                  ) : (
                    <>
                      <CopyButton text={m.body} label="Copy message" />
                      <span className="text-xs text-rt-faint">Too long to open in email directly; copy it into a new email to {a.candidate.email}.</span>
                    </>
                  )}
                  <form action={markMessageSent.bind(null, m.id)}>
                    <button className="btn text-xs">Mark sent</button>
                  </form>
                  <form action={deleteMessageDraft.bind(null, a.id, m.id)}>
                    <button className="text-xs text-rt-muted hover:text-rt-foreground px-2">Delete draft</button>
                  </form>
                </div>
              )}
            </div>
          );
        })}
        <details className="text-sm">
          <summary className="cursor-pointer text-rt-muted hover:text-rt-foreground">Write a message yourself</summary>
          <ActionForm action={saveMessageDraft} submit="Save draft" className="pt-3">
            <input type="hidden" name="applicationId" value={a.id} />
            <select name="kind" className="field" defaultValue="OTHER">
              {MESSAGE_KINDS.map((k) => (
                <option key={k} value={k}>
                  {KIND_LABEL[k]}
                </option>
              ))}
            </select>
            <input className="field" name="subject" placeholder="Subject" />
            <textarea className="field min-h-32" name="body" placeholder={`Hi ${a.candidate.name.split(/\s+/)[0]},`} />
          </ActionForm>
        </details>
      </section>

      <section className="space-y-3">
        <h2 className="font-semibold">Notes</h2>
        {a.notes.map((n) => (
          <div key={n.id} className="card p-3">
            <div className="whitespace-pre-wrap">{n.body}</div>
            <div className="text-xs text-rt-faint mt-1">
              {n.writtenBy === "mcp" ? "From Claude" : "You"} · {n.at.toLocaleDateString("en-US", { month: "short", day: "numeric" })}
            </div>
          </div>
        ))}
        <ActionForm action={addNote} submit="Add note">
          <input type="hidden" name="applicationId" value={a.id} />
          <textarea className="field min-h-20" name="body" placeholder="A call summary, a reference, why you moved them." />
        </ActionForm>
      </section>
    </div>
  );
}
