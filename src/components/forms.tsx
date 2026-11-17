"use client";

import { useActionState, useEffect, useState } from "react";
import type { ActionState } from "@/server/actions";

/** A form bound to a server action, showing its error or confirmation under the button. */
export function ActionForm({
  action,
  children,
  submit,
  className = "",
}: {
  action: (state: ActionState, form: FormData) => Promise<ActionState>;
  children: React.ReactNode;
  submit: string;
  className?: string;
}) {
  const [state, run, pending] = useActionState(action, undefined);
  return (
    <form action={run} className={`space-y-3 ${className}`}>
      {children}
      <div className="flex items-center gap-3">
        <button className="btn btn-primary" disabled={pending}>
          {pending ? "Working…" : submit}
        </button>
        {state?.error && <span className="text-rt-destructive">{state.error}</span>}
        {state?.ok && <span className="text-rt-muted">{state.ok}</span>}
      </div>
    </form>
  );
}

export function CopyButton({ text, label = "Copy" }: { text: string; label?: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      className="btn text-xs"
      onClick={async () => {
        await navigator.clipboard.writeText(text);
        setDone(true);
        setTimeout(() => setDone(false), 1500);
      }}
    >
      {done ? "Copied" : label}
    </button>
  );
}

/** A time in the viewer's own time zone. Rendered in the browser, since the server doesn't know it. */
export function LocalTime({ iso, withTime = true }: { iso: string; withTime?: boolean }) {
  const [text, setText] = useState(iso.slice(0, 10));
  useEffect(() => {
    const d = new Date(iso);
    setText(
      d.toLocaleString("en-US", {
        weekday: "short",
        month: "short",
        day: "numeric",
        ...(withTime ? { hour: "numeric", minute: "2-digit", timeZoneName: "short" } : {}),
      }),
    );
  }, [iso, withTime]);
  return <time dateTime={iso}>{text}</time>;
}

/** A datetime-local picker that submits an ISO string with the viewer's offset, so the server stores the moment they meant. */
export function DateTimeInput({ name }: { name: string }) {
  const [iso, setIso] = useState("");
  return (
    <>
      <input type="datetime-local" className="field" onChange={(e) => setIso(e.target.value ? new Date(e.target.value).toISOString() : "")} />
      <input type="hidden" name={name} value={iso} />
    </>
  );
}
