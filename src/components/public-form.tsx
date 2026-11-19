"use client";

import { useEffect, useRef, useState } from "react";
import Script from "next/script";
import type { FormQuestion } from "@/lib/forms";
import { FILE_TYPES, WRITTEN_TYPES } from "@/lib/forms";
import { EMPTY_TELEMETRY, type FieldTelemetry } from "@/lib/provenance";
import { acceptAttr, acceptLabel, MAX_FILE_BYTES, MAX_VIDEO_BYTES } from "@/lib/files";
import { toHtml } from "@/lib/boards";
import { VideoAnswer } from "@/components/video-answer";

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

const DEFAULT_NEXT = [
  "The team reads every application themselves. Nothing here declines anyone on its own.",
  "If it's a fit, you'll get an email with a few more questions or a time to talk.",
  "Either way, you'll hear back. Keep an eye on the inbox you gave us.",
];

export function PublicForm({
  questions,
  endpoint,
  askIdentity,
  submitLabel = "Send application",
  doneTitle = "Your application is in.",
  doneText,
  nextSteps,
  company,
  turnstileSiteKey,
  privacyNotice,
}: {
  questions: FormQuestion[];
  endpoint: string;
  askIdentity: boolean;
  submitLabel?: string;
  doneTitle?: string;
  doneText: string;
  /** What happens next, one step per line. Empty uses a default. */
  nextSteps?: string;
  company?: string;
  /** Set when the owner turned on Cloudflare Turnstile; the widget then sits above the send button. */
  turnstileSiteKey?: string | null;
  /** Who gets the application, how long it's kept and where to write. Shown on the apply form. */
  privacyNotice?: string;
}) {
  const { bind, snapshot } = useRecorder();
  const startedAt = useRef(Date.now());
  const formRef = useRef<HTMLFormElement>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [done, setDone] = useState(false);
  const [words, setWords] = useState<Record<string, number>>({});
  const [videos, setVideos] = useState<Record<string, File | null>>({});
  const [filled, setFilled] = useState(0);

  const total = questions.length + (askIdentity ? 2 : 0);

  /** How many questions have something in them, for the progress bar. */
  function recount() {
    const el = formRef.current;
    if (!el) return;
    const fd = new FormData(el);
    let n = 0;
    if (askIdentity) {
      if (String(fd.get("name") ?? "").trim()) n++;
      if (String(fd.get("email") ?? "").trim()) n++;
    }
    for (const q of questions) {
      if (q.type === "video") {
        if (videos[q.id]) n++;
        continue;
      }
      const v = fd.getAll(q.id);
      if (v.some((x) => (typeof x === "string" ? x.trim() : x.size > 0))) n++;
    }
    setFilled(n);
  }
  useEffect(recount, [videos]); // eslint-disable-line react-hooks/exhaustive-deps

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const answers: Record<string, string> = {};
    const files: [string, File][] = [];
    for (const q of questions) {
      if (q.type === "video") {
        const v = videos[q.id];
        if (v) files.push([q.id, v]);
        continue;
      }
      if (q.type === "file") {
        const f = fd.get(q.id);
        if (f instanceof File && f.size > 0) files.push([q.id, f]);
        continue;
      }
      answers[q.id] = q.type === "multi_choice" ? fd.getAll(q.id).map(String).join("\n") : String(fd.get(q.id) ?? "");
    }
    const tooBig = files.find(([id, f]) => f.size > (questions.find((q) => q.id === id)?.type === "video" ? MAX_VIDEO_BYTES : MAX_FILE_BYTES));
    if (tooBig) {
      setErrors({ [tooBig[0]]: "That file is too large. Try a smaller one." });
      setMessage("Some answers need another look.");
      return;
    }
    setSending(true);
    setMessage("");
    const payload = JSON.stringify({
      name: String(fd.get("name") ?? ""),
      email: String(fd.get("email") ?? ""),
      trap: String(fd.get("trap") ?? ""),
      turnstile: String(fd.get("cf-turnstile-response") ?? ""),
      answers,
      telemetry: snapshot(answers),
      recorded: true,
      durationMs: Date.now() - startedAt.current,
    });
    let body: BodyInit = payload;
    if (files.length) {
      const multi = new FormData();
      multi.set("payload", payload);
      for (const [id, f] of files) multi.set(id, f, f.name);
      body = multi;
    }
    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: files.length ? undefined : { "content-type": "application/json" },
        body,
      });
      const answer = await res.json().catch(() => ({}));
      if (res.ok) {
        setDone(true);
        window.scrollTo({ top: 0, behavior: "smooth" });
      } else {
        // A Turnstile token works once; get a fresh one for the next try.
        (window as unknown as { turnstile?: { reset: () => void } }).turnstile?.reset();
        setErrors(answer.fields ?? {});
        setMessage(answer.fields?._form ?? answer.error ?? "Something went wrong. Try again in a moment.");
        const first = Object.keys(answer.fields ?? {})[0];
        if (first) document.getElementById(`q-${first}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
      }
    } catch {
      setMessage("Couldn't reach the server. Check your connection and try again.");
    } finally {
      setSending(false);
    }
  }

  if (done) {
    const steps = (nextSteps ?? "").split("\n").map((x) => x.trim()).filter(Boolean);
    return (
      <div className="rise text-center py-6 space-y-6">
        <span className="mx-auto grid place-items-center w-14 h-14 rounded-full" style={{ background: "color-mix(in oklch, var(--rt-success) 14%, transparent)", color: "var(--rt-success)" }}>
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M20 6 9 17l-5-5" />
          </svg>
        </span>
        <div className="space-y-1.5">
          <h2 className="h-page text-[24px]">{doneTitle}</h2>
          <p className="text-rt-muted">{doneText}</p>
        </div>
        <div className="text-left inset p-5 space-y-3 max-w-md mx-auto">
          <p className="eyebrow">What happens next</p>
          <ol className="space-y-3">
            {(steps.length ? steps : DEFAULT_NEXT).map((st, i) => (
              <li key={i} className="flex gap-3 text-[13.5px]">
                <span className="shrink-0 grid place-items-center w-5 h-5 rounded-full bg-rt-surface text-[11px] font-semibold tabular shadow-[var(--rt-shadow-card)]">{i + 1}</span>
                <span className="text-rt-muted">{st}</span>
              </li>
            ))}
          </ol>
        </div>
        {company && <p className="text-xs text-rt-faint">Thanks for your time. {company}</p>}
      </div>
    );
  }

  const pct = total ? Math.round((filled / total) * 100) : 0;
  let number = 0;

  return (
    <form ref={formRef} onSubmit={onSubmit} onInput={recount} onChange={recount} className="space-y-6" noValidate>
      {/* Left empty by people, who never see it; software that fills every field fills this one too. */}
      <div aria-hidden="true" style={{ position: "absolute", left: "-10000px", width: 1, height: 1, overflow: "hidden" }}>
        <label>
          Leave this empty
          <input type="text" name="trap" tabIndex={-1} autoComplete="off" defaultValue="" />
        </label>
      </div>
      <div className="sticky top-0 z-10 -mx-5 md:-mx-7 px-5 md:px-7 py-3 bg-[color-mix(in_oklch,var(--rt-surface)_92%,transparent)] backdrop-blur border-b border-rt-border">
        <div className="flex items-center gap-3 text-[12px] text-rt-muted">
          <span className="tabular">
            {filled} of {total} answered
          </span>
          <div className="flex-1 h-1.5 rounded-full bg-rt-subtle overflow-hidden">
            <div className="h-full rounded-full bg-rt-primary transition-[width] duration-500" style={{ width: `${pct}%` }} />
          </div>
        </div>
      </div>

      <p className="text-[12.5px] text-rt-muted inset p-3.5 flex gap-2.5">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 mt-0.5" aria-hidden="true">
          <circle cx="12" cy="12" r="10" />
          <path d="M12 16v-4" />
          <path d="M12 8h.01" />
        </svg>
        <span>
          This form notes how each written answer is entered (typed, pasted, or filled in some other way) and shares that with the hiring team. It
          keeps counts and timings, not your keystrokes, and nothing is sent until you press the button. Using tools to help you write is your call;
          this just lets the team see how the answer got here.
          {privacyNotice && <span className="block mt-1.5">{privacyNotice}</span>}
        </span>
      </p>

      {askIdentity && (
        <div className="grid sm:grid-cols-2 gap-4">
          <Field id="name" label="Full name" required error={errors.name}>
            <input className="field" name="name" autoComplete="name" />
          </Field>
          <Field id="email" label="Email" required error={errors.email}>
            <input className="field" name="email" type="email" autoComplete="email" />
          </Field>
        </div>
      )}

      {questions.map((q) => {
        number++;
        return (
          <Field key={q.id} id={q.id} n={number} label={q.label} help={q.help} required={q.required} error={errors[q.id]}>
            {q.type === "task" ? (
              <>
                {q.brief && (
                  <div
                    className="inset p-4 space-y-2 text-[13.5px] [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5 [&_a]:text-rt-primary"
                    dangerouslySetInnerHTML={{ __html: toHtml(q.brief) }}
                  />
                )}
                {q.minutes && <div className="text-xs text-rt-faint">Should take about {q.minutes} minutes. Do it your way; there&apos;s no trick.</div>}
                <textarea
                  className="field min-h-48"
                  name={q.id}
                  ref={bind(q.id)}
                  placeholder="Your work goes here."
                  onChange={q.maxWords ? (e) => setWords((w) => ({ ...w, [q.id]: wordCount(e.target.value) })) : undefined}
                />
                {q.maxWords && <WordCount n={words[q.id] ?? 0} max={q.maxWords} />}
              </>
            ) : q.type === "long_text" ? (
              <>
                <textarea
                  className="field min-h-32"
                  name={q.id}
                  ref={bind(q.id)}
                  onChange={q.maxWords ? (e) => setWords((w) => ({ ...w, [q.id]: wordCount(e.target.value) })) : undefined}
                />
                {q.maxWords && <WordCount n={words[q.id] ?? 0} max={q.maxWords} />}
              </>
            ) : WRITTEN_TYPES.includes(q.type) ? (
              <input className="field" name={q.id} ref={bind(q.id)} autoComplete="off" />
            ) : q.type === "video" ? (
              <VideoAnswer maxSeconds={q.maxSeconds} onChange={(f) => setVideos((v) => ({ ...v, [q.id]: f }))} />
            ) : FILE_TYPES.includes(q.type) ? (
              <>
                <input
                  className="field file:mr-3 file:rounded-md file:border-0 file:bg-rt-subtle file:px-2.5 file:py-1 file:text-rt-foreground file:font-medium"
                  type="file"
                  name={q.id}
                  accept={acceptAttr(q.accept)}
                />
                <div className="text-xs text-rt-faint">One file, up to 10 MB: {acceptLabel(q.accept)}.</div>
              </>
            ) : q.type === "yes_no" ? (
              <div className="grid grid-cols-2 gap-2 max-w-xs">
                {["Yes", "No"].map((o) => (
                  <Choice key={o} type="radio" name={q.id} value={o} />
                ))}
              </div>
            ) : q.type === "single_choice" || q.type === "multi_choice" ? (
              <div className="grid gap-2">
                {q.options.map((o) => (
                  <Choice key={o} type={q.type === "single_choice" ? "radio" : "checkbox"} name={q.id} value={o} />
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
        );
      })}

      {turnstileSiteKey && (
        <>
          <Script src="https://challenges.cloudflare.com/turnstile/v0/api.js" strategy="afterInteractive" />
          <div className="cf-turnstile" data-sitekey={turnstileSiteKey} data-size="flexible" />
        </>
      )}

      <div className="flex flex-wrap items-center gap-3 pt-2">
        <button className="btn btn-primary h-10 px-5 text-[14px]" disabled={sending}>
          {sending ? "Sending…" : submitLabel}
        </button>
        {message && <span className="text-rt-destructive text-[13px]">{message}</span>}
      </div>
    </form>
  );
}

function WordCount({ n, max }: { n: number; max: number }) {
  return <div className={`text-xs tabular ${n > max ? "text-rt-pasted" : "text-rt-faint"}`}>{n} of about {max} words</div>;
}

/** A radio or checkbox drawn as a whole tappable row, which is what thumbs need. */
function Choice({ type, name, value }: { type: "radio" | "checkbox"; name: string; value: string }) {
  return (
    <label className="flex items-center gap-2.5 min-h-11 px-3.5 rounded-lg cursor-pointer bg-rt-surface shadow-[0_0_0_1px_var(--rt-border)] hover:bg-rt-subtle has-[:checked]:shadow-[0_0_0_2px_var(--rt-primary)] has-[:checked]:bg-rt-primary-tint transition">
      <input type={type} name={name} value={value} className="accent-[var(--rt-primary)]" /> <span className="text-[14px]">{value}</span>
    </label>
  );
}

function Field({
  id,
  n,
  label,
  help,
  required,
  error,
  children,
}: {
  id: string;
  n?: number;
  label: string;
  help?: string;
  required?: boolean;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div id={`q-${id}`} className="space-y-2 scroll-mt-24">
      <div className="flex gap-2.5">
        {n != null && <span className="font-mono text-[11px] text-rt-faint pt-[3px] tabular">{String(n).padStart(2, "0")}</span>}
        <div className="space-y-0.5">
          <div className="font-medium text-[14.5px] leading-snug">
            {label}
            {required && <span className="text-rt-faint"> *</span>}
          </div>
          {help && <div className="text-[12.5px] text-rt-muted">{help}</div>}
        </div>
      </div>
      {children}
      {error && <div className="text-[12.5px] text-rt-destructive">{error}</div>}
    </div>
  );
}
