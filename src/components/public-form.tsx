"use client";

import { useEffect, useRef, useState } from "react";
import type { FormQuestion } from "@/lib/forms";
import { WRITTEN_TYPES } from "@/lib/forms";
import { EMPTY_TELEMETRY, type FieldTelemetry } from "@/lib/provenance";

/**
 * The public form, with the provenance recorder built in.
 *
 * For each written field it counts characters by how they arrived, read from
 * the browser's own `beforeinput` input types: insertText is typed,
 * insertFromPaste is pasted, insertFromDrop is dropped, insertReplacementText
 * is autocorrect, and growth with no input event before it is injected
 * (autofill, an extension, a script). It also notes time away from the page,
 * because a paste right after coming back is worth knowing about.
 *
 * It records counts and timings only. It never records what was typed or
 * pasted beyond the final answer, never reads the clipboard outside a paste
 * into the field, and nothing leaves the page until the person presses send.
 * The form says so above the questions.
 */

type Pending = { type: string; len: number } | null;

type Recorder = {
  t: Record<string, FieldTelemetry>;
  prevLen: Record<string, number>;
  pending: Record<string, Pending>;
  focusAt: Record<string, number>;
  lastTyped: Record<string, number>;
  active: string | null;
  awayAt: number | null;
  returnedAt: number;
};

function useRecorder() {
  const rec = useRef<Recorder>({ t: {}, prevLen: {}, pending: {}, focusAt: {}, lastTyped: {}, active: null, awayAt: null, returnedAt: 0 });

  useEffect(() => {
    const r = rec.current;
    const leave = () => {
      if (r.awayAt === null) r.awayAt = Date.now();
    };
    const back = () => {
      if (r.awayAt === null) return;
      const away = Date.now() - r.awayAt;
      r.awayAt = null;
      if (away < 1000) return;
      r.returnedAt = Date.now();
      if (r.active) {
        r.t[r.active].awayCount++;
        r.t[r.active].awayMs += away;
      }
    };
    const vis = () => (document.hidden ? leave() : back());
    document.addEventListener("visibilitychange", vis);
    window.addEventListener("blur", leave);
    window.addEventListener("focus", back);
    return () => {
      document.removeEventListener("visibilitychange", vis);
      window.removeEventListener("blur", leave);
      window.removeEventListener("focus", back);
    };
  }, []);

  /** A ref callback for one written field. */
  function bind(id: string) {
    return (el: HTMLInputElement | HTMLTextAreaElement | null) => {
      if (!el || el.dataset.recording) return;
      el.dataset.recording = "1";
      const r = rec.current;
      r.t[id] = { ...EMPTY_TELEMETRY };
      r.prevLen[id] = el.value.length;
      el.addEventListener("focus", () => {
        r.active = id;
        r.focusAt[id] = Date.now();
      });
      el.addEventListener("blur", () => {
        if (r.focusAt[id]) r.t[id].focusMs += Date.now() - r.focusAt[id];
        r.focusAt[id] = 0;
      });
      el.addEventListener("paste", (e) => {
        const text = (e as ClipboardEvent).clipboardData?.getData("text") ?? "";
        r.pending[id] = { type: "insertFromPaste", len: text.length };
      });
      el.addEventListener("beforeinput", (e) => {
        const ie = e as InputEvent;
        const prior = r.pending[id];
        // A paste event already measured the clipboard; keep that length.
        if (prior?.type === "insertFromPaste" && ie.inputType.startsWith("insertFromPaste")) return;
        r.pending[id] = { type: ie.inputType, len: ie.data?.length ?? ie.dataTransfer?.getData("text")?.length ?? -1 };
      });
      el.addEventListener("input", () => {
        const t = r.t[id];
        const now = Date.now();
        const len = el.value.length;
        const delta = len - (r.prevLen[id] ?? 0);
        r.prevLen[id] = len;
        const p = r.pending[id];
        r.pending[id] = null;
        if (!p) {
          // No input event announced this change: something set the value.
          if (delta > 0) t.injectedChars += delta;
          else t.deletedChars += -delta;
          return;
        }
        const inserted = p.len >= 0 ? p.len : Math.max(delta, 0);
        const removed = Math.max(inserted - delta, 0);
        t.deletedChars += removed;
        if (p.type === "insertText" || p.type === "insertCompositionText" || p.type === "insertLineBreak" || p.type === "insertParagraph") {
          const n = p.type.startsWith("insertLine") || p.type === "insertParagraph" ? 1 : inserted;
          t.typedChars += n;
          t.keystrokes++;
          const gap = now - (r.lastTyped[id] ?? 0);
          if (gap < 2000) t.typingMs += gap;
          r.lastTyped[id] = now;
        } else if (p.type.startsWith("insertFromPaste")) {
          t.pastes++;
          t.pastedChars += inserted;
          t.longestPaste = Math.max(t.longestPaste, inserted);
          if (now - r.returnedAt < 3000) t.pasteAfterAway++;
        } else if (p.type === "insertFromDrop") {
          t.droppedChars += inserted;
        } else if (p.type === "insertReplacementText" || p.type === "insertFromYank") {
          t.autocorrectChars += inserted;
        } else if (p.type.startsWith("delete") || p.type.startsWith("history")) {
          // Undo and redo restore earlier text. Rare; count any growth as typed, which errs toward the applicant.
          if (delta > 0) t.typedChars += delta;
        } else if (delta > 0) {
          t.injectedChars += delta;
        }
      });
    };
  }

  /** Close the books: anything in the field the events don't explain was set from outside. */
  function snapshot(values: Record<string, string>) {
    const r = rec.current;
    const out: Record<string, FieldTelemetry> = {};
    for (const [id, t] of Object.entries(r.t)) {
      const finalLen = (values[id] ?? "").length;
      const explained = t.typedChars + t.pastedChars + t.droppedChars + t.autocorrectChars + t.injectedChars - t.deletedChars;
      if (finalLen > explained) t.injectedChars += finalLen - explained;
      if (r.focusAt[id]) t.focusMs += Date.now() - r.focusAt[id];
      out[id] = { ...t };
    }
    return out;
  }

  return { bind, snapshot };
}

function wordCount(s: string) {
  return s.trim() ? s.trim().split(/\s+/).length : 0;
}

export function PublicForm({
  questions,
  endpoint,
  askIdentity,
  submitLabel = "Send application",
  doneText,
}: {
  questions: FormQuestion[];
  endpoint: string;
  askIdentity: boolean;
  submitLabel?: string;
  doneText: string;
}) {
  const { bind, snapshot } = useRecorder();
  const startedAt = useRef(Date.now());
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [done, setDone] = useState(false);
  const [words, setWords] = useState<Record<string, number>>({});

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const answers: Record<string, string> = {};
    for (const q of questions) {
      answers[q.id] = q.type === "multi_choice" ? fd.getAll(q.id).map(String).join("\n") : String(fd.get(q.id) ?? "");
    }
    setSending(true);
    setMessage("");
    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: String(fd.get("name") ?? ""),
          email: String(fd.get("email") ?? ""),
          answers,
          telemetry: snapshot(answers),
          recorded: true,
          durationMs: Date.now() - startedAt.current,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (res.ok) {
        setDone(true);
        window.scrollTo({ top: 0 });
      } else {
        setErrors(body.fields ?? {});
        setMessage(body.error ?? "Something went wrong. Try again in a moment.");
      }
    } catch {
      setMessage("Couldn't reach the server. Check your connection and try again.");
    } finally {
      setSending(false);
    }
  }

  if (done) return <div className="card p-6 text-center">{doneText}</div>;

  return (
    <form onSubmit={onSubmit} className="space-y-5" noValidate>
      <p className="text-xs text-rt-muted bg-rt-subtle rounded p-3">
        This form notes how each written answer is entered (typed, pasted, or filled in some other way) and shares that with the hiring
        team. It keeps counts and timings, not your keystrokes, and nothing is sent until you press the button. Using tools to help you write
        is your call; this just lets the team see how the answer got here.
      </p>

      {askIdentity && (
        <>
          <Field label="Full name" required error={errors.name}>
            <input className="field" name="name" autoComplete="name" />
          </Field>
          <Field label="Email" required error={errors.email}>
            <input className="field" name="email" type="email" autoComplete="email" />
          </Field>
        </>
      )}

      {questions.map((q) => (
        <Field key={q.id} label={q.label} help={q.help} required={q.required} error={errors[q.id]}>
          {q.type === "long_text" ? (
            <>
              <textarea
                className="field min-h-32"
                name={q.id}
                ref={bind(q.id)}
                onChange={q.maxWords ? (e) => setWords((w) => ({ ...w, [q.id]: wordCount(e.target.value) })) : undefined}
              />
              {q.maxWords && (
                <div className={`text-xs tabular ${(words[q.id] ?? 0) > q.maxWords ? "text-rt-pasted" : "text-rt-faint"}`}>
                  {words[q.id] ?? 0} of about {q.maxWords} words
                </div>
              )}
            </>
          ) : WRITTEN_TYPES.includes(q.type) ? (
            <input className="field" name={q.id} ref={bind(q.id)} autoComplete="off" />
          ) : q.type === "yes_no" ? (
            <div className="flex gap-4">
              {["Yes", "No"].map((o) => (
                <label key={o} className="flex items-center gap-2">
                  <input type="radio" name={q.id} value={o} /> {o}
                </label>
              ))}
            </div>
          ) : q.type === "single_choice" || q.type === "multi_choice" ? (
            <div className="space-y-1.5">
              {q.options.map((o) => (
                <label key={o} className="flex items-center gap-2">
                  <input type={q.type === "single_choice" ? "radio" : "checkbox"} name={q.id} value={o} /> {o}
                </label>
              ))}
            </div>
          ) : (
            <input
              className="field"
              name={q.id}
              type={q.type === "email" ? "email" : q.type === "url" ? "url" : q.type === "phone" ? "tel" : "text"}
              inputMode={q.type === "number" ? "decimal" : undefined}
              placeholder={q.type === "url" ? "https://" : undefined}
            />
          )}
        </Field>
      ))}

      <div className="flex items-center gap-3">
        <button className="btn btn-primary" disabled={sending}>
          {sending ? "Sending…" : submitLabel}
        </button>
        {message && <span className="text-rt-destructive">{message}</span>}
      </div>
    </form>
  );
}

function Field({ label, help, required, error, children }: { label: string; help?: string; required?: boolean; error?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <div className="font-medium">
        {label}
        {required && <span className="text-rt-faint"> *</span>}
      </div>
      {help && <div className="text-xs text-rt-muted">{help}</div>}
      {children}
      {error && <div className="text-xs text-rt-destructive">{error}</div>}
    </div>
  );
}
