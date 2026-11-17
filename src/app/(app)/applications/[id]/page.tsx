import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { getApplication, STAGES, TIERS } from "@/lib/data/applications";
import { boardByKey } from "@/lib/boards";
import { filePath } from "@/lib/data/uploads";
import type { StyleSignal } from "@/lib/provenance";
import type { KnockoutResult } from "@/lib/forms";
import { acceptProposal, addNote, deleteMessageDraft, markMessageSent, moveStage, saveMessageDraft, setTier } from "@/server/actions";
import { ActionForm, CopyButton } from "@/components/forms";
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
