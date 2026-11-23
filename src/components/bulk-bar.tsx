"use client";

import { useEffect, useState, useTransition } from "react";
import type { Stage } from "@prisma/client";
import { bulkDraftAction, bulkMoveAction, bulkSendAction, type ActionState, type BulkDraftState } from "@/server/actions";
import { BULK_KINDS, BULK_LIMIT, KIND_LABEL } from "@/lib/messages";
import { STAGE_LABEL } from "@/components/provenance";

const STAGES: Stage[] = ["NEW", "SCREEN", "INTERVIEW", "OFFER", "HIRED", "REJECTED"];
const BOX = "input[data-bulk]";

function ticked(): string[] {
  return Array.from(document.querySelectorAll<HTMLInputElement>(`${BOX}:checked`)).map((b) => b.value);
}

/**
 * The bar that acts on the applicants ticked in the list: move them, or write
 * one message to all of them, saved as a draft each. Sending is a second press
 * on the drafts, so nobody is emailed by the first.
 */
export function BulkBar({ canMessage, canSend }: { canMessage: boolean; canSend: boolean }) {
  const [count, setCount] = useState(0);
  const [stage, setStage] = useState<Stage>("SCREEN");
  const [writing, setWriting] = useState(false);
  const [kind, setKind] = useState<string>("OTHER");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("Hi {first_name},\n\n\n\n{sender}");
  const [moved, setMoved] = useState<ActionState>();
  const [drafts, setDrafts] = useState<BulkDraftState>();
  const [sent, setSent] = useState<ActionState>();
  const [pending, start] = useTransition();

  useEffect(() => {
    const update = () => setCount(document.querySelectorAll(`${BOX}:checked`).length);
    document.addEventListener("change", update);
    update();
    return () => document.removeEventListener("change", update);
  }, []);

  const clear = () => {
    document.querySelectorAll<HTMLInputElement>(BOX).forEach((b) => (b.checked = false));
    setCount(0);
  };

  if (!count && !drafts?.drafted && !moved) return null;
  return (
    <div className="card rise p-4 space-y-3 sticky top-3 z-10" aria-label="Act on the ticked applicants">
      {count > 0 && (
        <div className="flex flex-wrap items-center gap-2 text-[13px]">
          <span className="font-medium">{count} ticked</span>
          <select className="field w-auto" aria-label="Move them to" value={stage} onChange={(e) => setStage(e.target.value as Stage)}>
            {STAGES.map((s) => (
              <option key={s} value={s}>
                {STAGE_LABEL[s]}
              </option>
            ))}
          </select>
          <button
            type="button"
            className="btn text-xs"
            disabled={pending}
            onClick={() =>
              start(async () => {
                const r = await bulkMoveAction(ticked(), stage);
                setMoved(r);
                if (!r?.error) clear();
              })
            }
          >
            Move them
          </button>
          {canMessage && (
            <button type="button" className="btn text-xs" onClick={() => setWriting((w) => !w)} aria-expanded={writing}>
              Write to them
            </button>
          )}
          <button type="button" className="btn btn-quiet text-xs" onClick={() => (clear(), setMoved(undefined))}>
            Clear
          </button>
        </div>
      )}
      {moved && (
        <p className="text-[12.5px] flex items-center gap-2">
          {moved.error ? <span className="text-rt-destructive">{moved.error}</span> : <span className="text-rt-muted">{moved.ok}</span>}
          {!count && (
            <button type="button" className="btn btn-quiet text-xs" onClick={() => setMoved(undefined)}>
              Done
            </button>
          )}
        </p>
      )}
      {count > 0 && canMessage && writing && (
        <div className="space-y-2">
          <div className="flex flex-wrap gap-2">
            <select className="field w-auto" aria-label="Kind" value={kind} onChange={(e) => setKind(e.target.value)}>
              {BULK_KINDS.map((k) => (
                <option key={k} value={k}>
                  {KIND_LABEL[k]}
                </option>
              ))}
            </select>
            <input className="field flex-1 min-w-48" aria-label="Subject" placeholder="Subject" value={subject} onChange={(e) => setSubject(e.target.value)} />
          </div>
          <textarea className="field min-h-40" aria-label="Message" value={body} onChange={(e) => setBody(e.target.value)} />
          <p className="text-[11.5px] text-rt-faint">
            {"{first_name}"}, {"{job}"}, {"{company}"}, {"{sender}"}, {"{status_link}"} and {"{screening_link}"} are filled in for each person. Up to {BULK_LIMIT} at a time. This saves a draft for each; nothing is sent yet.
          </p>
          <button
            type="button"
            className="btn btn-primary text-xs"
            disabled={pending}
            onClick={() =>
              start(async () => {
                setMoved(undefined);
                const r = await bulkDraftAction(ticked(), { kind, subject, body });
                setDrafts(r);
                setSent(undefined);
                if (r?.drafted) {
                  setWriting(false);
                  clear();
                }
              })
            }
          >
            Save {count} draft{count === 1 ? "" : "s"}
          </button>
          {drafts?.error && <p className="text-[12.5px] text-rt-destructive">{drafts.error}</p>}
        </div>
      )}
      {drafts?.drafted && (
        <div className="space-y-2 text-[13px]">
          <p>
            Saved {drafts.drafted.length} draft{drafts.drafted.length === 1 ? "" : "s"}: {drafts.drafted.map((d) => d.name).join(", ")}.
            {drafts.skipped?.length ? ` Skipped ${drafts.skipped.join(", ")}, who already had an unsent draft of this kind.` : ""} Each one is on that applicant&apos;s page.
          </p>
          <div className="flex flex-wrap items-center gap-2">
            {canSend && drafts.drafted.length > 0 && !sent?.ok && (
              <button
                type="button"
                className="btn btn-primary text-xs"
                disabled={pending}
                onClick={() => start(async () => setSent(await bulkSendAction(drafts.drafted!.map((d) => d.messageId))))}
              >
                Send all {drafts.drafted.length} from your mailbox
              </button>
            )}
            <button type="button" className="btn btn-quiet text-xs" onClick={() => (setDrafts(undefined), setSent(undefined))}>
              Done
            </button>
            {sent?.error && <span className="text-rt-destructive">{sent.error}</span>}
            {sent?.ok && <span className="text-rt-muted">{sent.ok}</span>}
          </div>
          {!canSend && <p className="text-[11.5px] text-rt-faint">Connect a mailbox in Settings to send them from here, or open each in your email from the applicant&apos;s page.</p>}
        </div>
      )}
    </div>
  );
}
