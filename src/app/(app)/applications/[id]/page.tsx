import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { baseUrl, requireSeat } from "@/lib/auth";
import { listTeam, reaches } from "@/lib/data/team";
import { ROLE_LABEL, seesEverything } from "@/lib/team";
import { listReferences } from "@/lib/data/references";
import { getApplication, TIERS } from "@/lib/data/applications";
import { boardByKey } from "@/lib/boards";
import { filePath } from "@/lib/data/uploads";
import type { StyleSignal } from "@/lib/provenance";
import type { KnockoutResult } from "@/lib/forms";
import {
  acceptProposal,
  addInterviewAction,
  addNote,
  addScorecardAction,
  scorecardLinkAction,
  deleteApplicantAction,
  deleteMessageDraft,
  deleteReferenceAction,
  offerTimesAction,
  requestReferenceAction,
  shareApplicantAction,
  toggleProbe,
  markMessageSent,
  moveStage,
  recordOfferAction,
  saveMessageDraft,
  sendMessageAction,
  setInterviewStatus,
  setOfferStatusAction,
  setTier,
} from "@/server/actions";
import { ActionForm, CopyButton, DateTimeInput, LocalTime } from "@/components/forms";
import { interviewsAndOffers } from "@/lib/data/interviews";
import { OFFER_TERM_LABEL, RECOMMENDATION_LABEL, RECOMMENDATIONS } from "@/lib/scorecards";
import { KIND_LABEL, MAILTO_SAFE_LENGTH, MESSAGE_KINDS, mailtoLink } from "@/lib/messages";
import { ArrivalBar, OriginBadge, ProvenanceBar, QualifiedChip, STAGE_LABEL, STAGE_TONE, StyleBadge, TierChip, tierTone } from "@/components/provenance";
import { Avatar, Icon, SectionHead } from "@/components/ui";
import { RecordedVideo } from "@/components/video-answer";
import { getMailbox } from "@/lib/data/mailbox";
import { statusPath } from "@/lib/applicant-status";

function minutes(ms: number) {
  const m = Math.round(ms / 60000);
  return m < 1 ? "under a minute" : `${m} minute${m === 1 ? "" : "s"}`;
}

export default async function ApplicationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { seat, userId } = await requireSeat();
  if (seat.panelId) redirect("/interviews");
  if (!(await reaches(seat, { applicationId: id }))) notFound();
  // A hiring manager reads, moves, tiers, notes and interviews; messages, offers, references and sharing are for owners and recruiters.
  const full = seesEverything(seat.role);
  const a = await getApplication(userId, id);
  const io = await interviewsAndOffers(userId, id);
  const refs = await listReferences(userId, id);
  const mail = await getMailbox(userId);
  const { members } = await listTeam(userId);
  const base = await baseUrl();
  const latestOffer = io.offers.at(-1);
  const board = a.listing ? `${boardByKey(a.listing.board)?.name ?? a.listing.board} · listing ${a.listing.variant}` : a.source || "added by hand";
  const tone = tierTone(a.effectiveTier);
  return (
    <div className="space-y-6">
      <Link href={`/jobs/${a.job.id}`} className="rise inline-flex items-center gap-1 text-[12.5px] text-rt-muted hover:text-rt-foreground">
        <Icon name="chevron" size={13} className="rotate-180" />
        {a.job.title}
      </Link>

      <header className="card rise p-5 sm:p-6 flex flex-wrap items-center gap-5" style={{ boxShadow: tone ? `var(--rt-shadow-card), inset 0 3px 0 ${tone}` : undefined }}>
        <Avatar name={a.candidate.name} tone={tone} size={52} />
        <div className="flex-1 min-w-[220px] space-y-1">
          <h1 className="h-page">{a.candidate.name}</h1>
          <p className="text-rt-muted text-[13px] flex flex-wrap items-center gap-x-3 gap-y-1">
            <a className="hover:text-rt-foreground inline-flex items-center gap-1.5" href={`mailto:${a.candidate.email}`}>
              <Icon name="mail" size={13} />
              {a.candidate.email}
            </a>
            {a.candidate.phone && <span>{a.candidate.phone}</span>}
            {a.candidate.links.map((l) => (
              <a key={l} href={l} className="link inline-flex items-center gap-1" target="_blank" rel="noreferrer">
                <Icon name="link" size={12} />
                {l.replace(/^https?:\/\//, "").slice(0, 40)}
              </a>
            ))}
            <a className="hover:text-rt-foreground inline-flex items-center gap-1" href={statusPath(a.screenToken)} target="_blank" rel="noreferrer" title="The page this applicant sees about their own application">
              <Icon name="link" size={12} />
              Their status page
            </a>
          </p>
          <p className="text-[12px] text-rt-faint">
            Applied {a.appliedAt.toLocaleDateString("en-US", { month: "short", day: "numeric" })} via {board}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <TierChip tier={a.effectiveTier} proposal={a.tierIsProposal} rank={a.proposal?.rank} />
          <QualifiedChip qualified={a.qualified} />
        </div>
        <div className="basis-full">
          <div className="seg" role="group" aria-label="Stage">
            {a.jobSteps.map((s) => (
              <form key={s.id} action={moveStage.bind(null, a.id, s.stage, s.id)}>
                <button aria-pressed={a.stepId === s.id} className="inline-flex items-center gap-1.5" style={{ ["--tone" as string]: STAGE_TONE[s.stage] }}>
                  {a.stepId === s.id && <span className="dot" />}
                  {s.label}
                </button>
              </form>
            ))}
          </div>
        </div>
      </header>

      <div className="grid lg:grid-cols-[minmax(0,1fr)_320px] gap-6 items-start">
      <aside className="space-y-4 lg:sticky lg:top-6 lg:order-2">
        <section className="card rise p-5 space-y-3" style={{ ["--i" as string]: 1 }}>
          <div className="flex items-center gap-2">
            <h2 className="h-section flex-1">Tier</h2>
            <div className="seg" role="group" aria-label="Tier">
              {TIERS.map((t) => (
                <form key={t} action={setTier.bind(null, a.id, t)}>
                  <button aria-pressed={a.tier === t} className="w-8" style={a.tier === t ? { color: tierTone(t) } : undefined}>
                    {t}
                  </button>
                </form>
              ))}
            </div>
          </div>
          <p className="text-[12px] text-rt-faint">
            {a.tier ? `Decided${a.tierBy === "mcp" ? " through Claude" : ""}. ` : "Not decided yet. "}A: worth a call this week. B: if the A&apos;s run out. C: not this time.
          </p>
          {a.tierReason && <p className="text-rt-muted text-[13px]">{a.tierReason}</p>}
          {a.proposal && !(a.tier === a.proposal.tier && a.tierReason === a.proposal.reason) && (
            <div className="inset p-3 space-y-2.5">
              <div className="flex items-center gap-2">
                <Icon name="sparkle" size={13} className="text-rt-ai" />
                <span className="text-[12.5px] font-medium flex-1">Claude proposes</span>
                <TierChip tier={a.proposal.tier} proposal rank={a.proposal.rank} />
              </div>
              <p className="text-rt-muted text-[13px]">{a.proposal.reason}</p>
              <div className="flex gap-2">
                {a.tier !== a.proposal.tier && (
                  <form action={acceptProposal.bind(null, a.id)}>
                    <button className="btn btn-primary text-xs">Accept {a.proposal.tier}</button>
                  </form>
                )}
                {a.tier && (
                  <form action={setTier.bind(null, a.id, null)}>
                    <button className="btn btn-quiet text-xs">Clear my tier</button>
                  </form>
                )}
              </div>
            </div>
          )}
        </section>

        <section className="card rise p-5 space-y-3" style={{ ["--i" as string]: 2 }}>
          <h2 className="h-section">How the answers arrived</h2>
          <ProvenanceBar r={a.provenance} />
          <div className="flex flex-wrap gap-x-3 gap-y-1 text-[11.5px] text-rt-muted">
            <span className="inline-flex items-center gap-1.5" style={{ ["--tone" as string]: "var(--rt-typed)" }}><span className="dot" />Typed</span>
            <span className="inline-flex items-center gap-1.5" style={{ ["--tone" as string]: "var(--rt-pasted)" }}><span className="dot" />Pasted</span>
            <span className="inline-flex items-center gap-1.5" style={{ ["--tone" as string]: "var(--rt-ai)" }}><span className="dot" />Likely AI</span>
          </div>
          <p className="text-[11.5px] text-rt-faint leading-snug">
            What the browser saw, not proof of who wrote it. Style labels misfire on second-language writers and grammar tools; ask on the call.
          </p>
        </section>

        <section className="card rise p-5 space-y-3" style={{ ["--i" as string]: 3 }}>
          <div className="flex items-center gap-2">
            <h2 className="h-section flex-1">Ask on the call</h2>
            {a.probes.length > 0 && (
              <span className="text-[11.5px] text-rt-faint tabular">
                {a.probes.filter((p) => p.asked).length} of {a.probes.length} asked
              </span>
            )}
          </div>
          {a.probes.length === 0 ? (
            <p className="text-[12.5px] text-rt-muted">
              Ask Claude: <span className="text-rt-foreground">&ldquo;Prepare me for the call with {a.candidate.name.split(/\s+/)[0]}&rdquo;</span>. It writes follow-up questions aimed at the answers worth a second look.
            </p>
          ) : (
            <ol className="space-y-2.5">
              {a.probes.map((p, i) => (
                <li key={i} className={`flex gap-2.5 ${p.asked ? "opacity-60" : ""}`}>
                  <form action={toggleProbe.bind(null, a.id, i, !p.asked)}>
                    <button
                      aria-label={p.asked ? "Mark not asked" : "Mark asked"}
                      aria-pressed={p.asked}
                      className={`mt-0.5 w-[18px] h-[18px] rounded-md grid place-items-center ${p.asked ? "bg-rt-primary text-white" : "inset"}`}
                    >
                      {p.asked && (
                        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" aria-hidden="true">
                          <path d="M20 6 9 17l-5-5" />
                        </svg>
                      )}
                    </button>
                  </form>
                  <div className="min-w-0 space-y-0.5">
                    <p className={`text-[13.5px] leading-snug ${p.asked ? "line-through decoration-rt-faint" : ""}`}>{p.question}</p>
                    {p.why && <p className="text-[11.5px] text-rt-faint leading-snug">{p.why}</p>}
                    {p.note && <p className="text-[12px] text-rt-muted">They said: {p.note}</p>}
                  </div>
                </li>
              ))}
            </ol>
          )}
        </section>

        {full && (
        <section className="card rise p-5 space-y-3" style={{ ["--i" as string]: 4 }}>
          <div className="flex items-center gap-2">
            <h2 className="h-section flex-1">Share</h2>
            <form action={shareApplicantAction.bind(null, a.id, !a.sharePath)}>
              <button className={`btn text-xs ${a.sharePath ? "" : "btn-primary"}`}>{a.sharePath ? "Turn off" : "Make a link"}</button>
            </form>
          </div>
          {a.sharePath ? (
            <div className="space-y-2">
              <code className="block text-[11.5px] inset px-2.5 py-2 break-all">{`${base}${a.sharePath}`}</code>
              <div className="flex items-center gap-2">
                <CopyButton text={`${base}${a.sharePath}`} label="Copy link" />
                <a className="text-xs link" href={a.sharePath} target="_blank" rel="noreferrer">
                  Preview
                </a>
              </div>
              <p className="text-[11.5px] text-rt-faint leading-snug">Anyone with the link sees the answers, how they arrived, the tier and scorecards. Never the email, phone, notes or files.</p>
            </div>
          ) : (
            <p className="text-[12.5px] text-rt-muted">A read-only link for a co-founder or hiring manager without an account.</p>
          )}
        </section>
        )}
      </aside>

      <div className="space-y-10 min-w-0 lg:order-1">
      {a.submissions.length === 0 && <p className="card p-5 text-rt-muted">No forms filled in yet.</p>}

      {a.submissions.map((s) => {
        const failed = (s.failedKnockouts as KnockoutResult[]) ?? [];
        return (
          <section key={s.id} className="space-y-3">
            <div className="flex flex-wrap items-baseline gap-x-3">
              <h2 className="h-section">{s.form.name}</h2>
              <span className="text-xs text-rt-faint">
                {s.submittedAt.toLocaleDateString("en-US", { month: "short", day: "numeric" })} · took {minutes(s.durationMs)}
                {!s.recorded && " · not recorded (the page's script didn't run)"}
              </span>
            </div>
            {failed.length > 0 && (
              <div className="text-[12.5px] text-rt-muted inset px-3 py-2">
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
                  <li key={x.questionId} className="card rise p-5 space-y-3">
                    <div className="text-[12.5px] font-medium text-rt-muted">{x.question}</div>
                    {x.files.length > 0 ? (
                      <div className="flex flex-wrap gap-3">
                        {x.files.map((f) => (
                          <a key={f.id} href={f.mimeType.startsWith("video/") ? undefined : filePath(f.id)} target="_blank" rel="noreferrer" className="block group w-full">
                            {f.mimeType.startsWith("video/") ? (
                              <RecordedVideo src={filePath(f.id)} className="w-full max-w-[520px] aspect-video rounded-lg bg-black" />
                            ) : f.mimeType.startsWith("image/") && f.mimeType !== "image/heic" ? (
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
                      <div className="whitespace-pre-wrap text-[14.5px] leading-relaxed">
                        {x.answer ? <span className={`rounded-sm ${hl}`}>{x.answer}</span> : <span className="text-rt-faint">No answer</span>}
                      </div>
                    )}
                    {written && x.answer && (
                      <div className="space-y-2 pt-1">
                        <ArrivalBar pastedShare={x.pastedShare} ai={x.style.score >= 0.5} />
                        <div className="flex flex-wrap items-center gap-2">
                          <OriginBadge origin={x.origin} />
                          <StyleBadge score={x.style.score} label={x.style.label} />
                          <span className="text-xs text-rt-muted">{x.summary}</span>
                        </div>
                        {signals.length > 0 && (
                          <details className="text-xs text-rt-muted">
                            <summary className="cursor-pointer text-rt-ai hover:underline">Why the style label says that</summary>
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
          <h2 className="h-section">Interviews</h2>
          {io.panel.scorecards > 0 && (
            <span className="text-xs text-rt-muted">
              {io.panel.yes} yes, {io.panel.no} no across {io.panel.scorecards} scorecard{io.panel.scorecards === 1 ? "" : "s"}
              {io.panel.strongNo && " · someone said strong no; read why before deciding"}
              {io.panel.split && !io.panel.strongNo && " · the panel is split"}
            </span>
          )}
        </div>
        {io.interviews.length === 0 && <p className="card p-5 text-rt-muted">No interviews yet. Ask Claude to schedule one, or add it below.</p>}
        {io.interviews.map((iv) => (
          <div key={iv.id} className={`card p-5 space-y-3 ${iv.status === "CANCELLED" ? "opacity-60" : ""}`}>
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <span className="font-mono text-[11px] uppercase tracking-wide text-rt-muted">Round {iv.round}</span>
              <span className="font-medium">{iv.title}</span>
              <span className="text-xs text-rt-muted">
                {iv.scheduledAt ? <LocalTime iso={iv.scheduledAt.toISOString()} /> : iv.bookingPath ? `Waiting for them to pick one of ${iv.slots.length} times` : "No time set"}
                {iv.durationMin ? ` · ${iv.durationMin} min` : ""} · {iv.format.replace("_", " ")}
                {iv.interviewers && ` · with ${iv.interviewers}`}
              </span>
              {iv.memberIds.length > 0 && (
                <span className="text-xs text-rt-faint">
                  Panel: {iv.memberIds.map((mid) => members.find((m) => m.id === mid)).filter(Boolean).map((m) => m!.name || m!.email).join(", ")}
                </span>
              )}
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
            {iv.bookingPath && (
              <div className="inset p-3 space-y-2">
                <p className="text-[12.5px] text-rt-muted">
                  Offered:{" "}
                  {iv.slots.map((t, k) => (
                    <span key={t.toISOString()}>
                      {k > 0 && ", "}
                      <LocalTime iso={t.toISOString()} />
                    </span>
                  ))}
                </p>
                <div className="flex flex-wrap items-center gap-2">
                  <CopyButton text={`${base}${iv.bookingPath}`} label="Copy booking link" />
                  <span className="text-[11.5px] text-rt-faint">They see these in their own time zone and pick one.</span>
                </div>
              </div>
            )}
            {iv.status === "SCHEDULED" && !iv.scheduledAt && !iv.bookingPath && (
              <details className="text-sm">
                <summary className="btn btn-quiet text-xs cursor-pointer">Let them pick a time</summary>
                <ActionForm action={offerTimesAction} submit="Offer these times" className="pt-3">
                  <input type="hidden" name="applicationId" value={a.id} />
                  <input type="hidden" name="interviewId" value={iv.id} />
                  <p className="text-xs text-rt-faint">Times you&apos;re free, in your time zone. Leave any you don&apos;t need empty.</p>
                  <div className="grid gap-2 sm:grid-cols-3">
                    <DateTimeInput name="slot" />
                    <DateTimeInput name="slot" />
                    <DateTimeInput name="slot" />
                  </div>
                </ActionForm>
              </details>
            )}
            <div className="seg" role="group" aria-label="Interview status">
              {(["SCHEDULED", "DONE", "CANCELLED", "NO_SHOW"] as const).map((st) => (
                <form key={st} action={setInterviewStatus.bind(null, a.id, iv.id, st)}>
                  <button aria-pressed={iv.status === st}>
                    {{ SCHEDULED: "Scheduled", DONE: "Done", CANCELLED: "Cancelled", NO_SHOW: "No-show" }[st]}
                  </button>
                </form>
              ))}
            </div>
            {iv.scorecards.map((c) => (
              <div key={c.id} className="inset p-3 space-y-1">
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
                <summary className="btn btn-quiet text-xs cursor-pointer">Add a scorecard</summary>
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
            {iv.status !== "CANCELLED" && (
              <details className="text-sm">
                <summary className="btn btn-quiet text-xs cursor-pointer">Get a scorecard link for an interviewer</summary>
                <ActionForm action={scorecardLinkAction} submit="Make link" className="pt-3">
                  <input type="hidden" name="interviewId" value={iv.id} />
                  <p className="text-[12.5px] text-rt-muted">
                    They fill it in without an account, once, and don&apos;t see anyone else&apos;s verdict. Send it to them yourself.
                  </p>
                  <input className="field" name="interviewer" placeholder="Their name" />
                </ActionForm>
              </details>
            )}
          </div>
        ))}
        <details className="text-sm">
          <summary className="btn btn-quiet text-xs cursor-pointer">Add an interview</summary>
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
            {members.length > 1 && (
              <fieldset className="space-y-1.5">
                <legend className="text-[12px] text-rt-muted">Teammates on the panel. An interviewer sees only the interviews they&apos;re on.</legend>
                <div className="flex flex-wrap gap-x-4 gap-y-1">
                  {members.map((m) => (
                    <label key={m.id} className="inline-flex items-center gap-1.5 text-[13px]">
                      <input type="checkbox" name="memberId" value={m.id} />
                      {m.name || m.email} <span className="text-rt-faint text-[11.5px]">{ROLE_LABEL[m.role]}</span>
                    </label>
                  ))}
                </div>
              </fieldset>
            )}
          </ActionForm>
        </details>
      </section>

      {full && (
      <>
      <section className="space-y-3">
        <div className="flex flex-wrap items-baseline gap-x-3">
          <h2 className="h-section">References</h2>
          <span className="text-xs text-rt-faint">Four short questions on a link. Nothing is sent from here.</span>
        </div>
        {refs.length === 0 && <p className="card p-5 text-rt-muted">No references yet. Ask Claude to request one, or add a referee below.</p>}
        {refs.map((r) => (
          <div key={r.id} className="card p-5 space-y-3">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <span className="font-medium">{r.name}</span>
              {r.relation && <span className="text-xs text-rt-muted">{r.relation}</span>}
              <span className="chip" style={{ ["--tone" as string]: r.submittedAt ? "var(--rt-success)" : "var(--rt-faint)" }}>
                <span className="dot" />
                {r.submittedAt ? "Answered" : "Waiting"}
              </span>
              <span className="flex-1" />
              {!r.submittedAt && <CopyButton text={`${base}${r.path}`} label="Copy link" />}
              <form action={deleteReferenceAction.bind(null, a.id, r.id)}>
                <button className="text-xs text-rt-muted hover:text-rt-foreground px-1">Remove</button>
              </form>
            </div>
            {r.answers.length > 0 && (
              <dl className="space-y-2.5">
                {r.answers
                  .filter((x) => x.answer)
                  .map((x) => (
                    <div key={x.id}>
                      <dt className="text-[12.5px] font-medium text-rt-muted">{x.question}</dt>
                      <dd className="whitespace-pre-wrap text-[14px] leading-relaxed">{x.answer}</dd>
                    </div>
                  ))}
              </dl>
            )}
          </div>
        ))}
        <details className="text-sm">
          <summary className="btn btn-quiet text-xs cursor-pointer">Ask a referee</summary>
          <ActionForm action={requestReferenceAction} submit="Make the link" className="pt-3">
            <input type="hidden" name="applicationId" value={a.id} />
            <div className="grid gap-3 sm:grid-cols-2">
              <input className="field" name="name" placeholder="Referee's name" />
              <input className="field" name="email" type="email" placeholder="Their email (optional)" />
            </div>
            <input className="field" name="relation" placeholder="How they know them, e.g. manager at Acme, 2022 to 2024" />
          </ActionForm>
        </details>
      </section>

      <section className="space-y-3">
        <h2 className="h-section">Offer</h2>
        {!latestOffer && <p className="card p-5 text-rt-muted">No offer yet.</p>}
        {[...io.offers].reverse().map((o) => {
          const latest = o.id === latestOffer?.id;
          return (
            <div key={o.id} className={`card p-5 space-y-2 ${latest ? "" : "opacity-70"}`}>
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
                <div className="seg" role="group" aria-label="Offer status">
                  {(["DRAFT", "EXTENDED", "ACCEPTED", "DECLINED", "WITHDRAWN"] as const).map((st) => (
                    <form key={st} action={setOfferStatusAction.bind(null, a.id, o.id, st)}>
                      <button aria-pressed={o.status === st}>{st.charAt(0) + st.slice(1).toLowerCase()}</button>
                    </form>
                  ))}
                </div>
              )}
            </div>
          );
        })}
        <details className="text-sm">
          <summary className="btn btn-quiet text-xs cursor-pointer">{latestOffer ? "Change the terms (saves a new version)" : "Write an offer"}</summary>
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
          <h2 className="h-section">Messages</h2>
          <span className="text-xs text-rt-faint">
            {mail.connected
              ? `Send goes from ${mail.fromEmail}, your connected mailbox. Nothing goes out until you press it or tell Claude to send.`
              : "Open a draft in your own email, send it there, then mark it sent. Connect a mailbox in Settings to send from here."}
          </span>
        </div>
        {a.messages.length === 0 && <p className="card p-5 text-rt-muted">Nothing sent yet. Ask Claude to draft a screening invite, an interview invite or a rejection, or write one below.</p>}
        {a.messages.map((m) => {
          const mailto = mailtoLink(a.candidate.email, m.subject, m.body);
          const draft = m.status === "DRAFT";
          const day = (d: Date) => d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
          return (
            <div key={m.id} className={`card p-5 space-y-2 ${draft ? "outline-dashed outline-1 outline-rt-border" : ""}`}>
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <span className="font-mono uppercase tracking-wide text-rt-muted">{KIND_LABEL[m.kind]}</span>
                <span className={draft ? "text-rt-muted" : "text-rt-foreground"}>
                  {draft
                    ? `Draft${m.writtenBy === "mcp" ? " from Claude" : ""} · ${day(m.createdAt)}`
                    : `Sent ${day(m.sentAt ?? m.createdAt)}${m.sentVia === "mailbox" ? ` from ${mail.connected ? mail.fromEmail : "your mailbox"}` : ""}`}
                </span>
              </div>
              {draft && m.sendError && <p className="text-xs text-rt-destructive">Didn&apos;t send: {m.sendError}</p>}
              {m.subject && <div className="font-medium">{m.subject}</div>}
              <div className="whitespace-pre-wrap text-rt-muted">{m.body}</div>
              {draft && mail.connected && (
                <ActionForm action={sendMessageAction} submit={`Send to ${a.candidate.email}`} className="pt-1">
                  <input type="hidden" name="messageId" value={m.id} />
                  <input type="hidden" name="applicationId" value={a.id} />
                </ActionForm>
              )}
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
          <summary className="btn btn-quiet text-xs cursor-pointer">Write a message yourself</summary>
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

      </>
      )}

      <section className="space-y-3">
        <h2 className="h-section">Notes</h2>
        {a.notes.map((n) => (
          <div key={n.id} className="card p-4">
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

      {full && (
      <section className="space-y-2">
        <h2 className="h-section">Their data</h2>
        <p className="text-[12.5px] text-rt-muted">
          If {a.candidate.name.split(/\s+/)[0]} asks what you hold about them, download it. It includes your notes and scorecards, so read it
          before you send it on.
        </p>
        <div className="flex flex-wrap items-start gap-2">
          <a className="btn text-xs" href={`/files/applicant/${a.id}`}>
            Download everything about them
          </a>
          {seat.role === "OWNER" && (
          <details className="text-sm">
            <summary className="btn btn-quiet text-xs cursor-pointer">Delete everything about them</summary>
            <ActionForm action={deleteApplicantAction} submit="Delete for good" className="pt-3">
              <input type="hidden" name="applicationId" value={a.id} />
              <p className="text-[12.5px] text-rt-muted">
                This deletes {a.candidate.name} and everything about them in this workspace: every application, answer, file, message, note,
                interview, offer and reference. It can&apos;t be undone. Type their name to confirm.
              </p>
              <input className="field" name="confirm" placeholder={a.candidate.name} autoComplete="off" />
            </ActionForm>
          </details>
          )}
        </div>
      </section>
      )}
      </div>
      </div>
    </div>
  );
}
