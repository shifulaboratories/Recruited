"use client";

import { useActionState, useState } from "react";
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
