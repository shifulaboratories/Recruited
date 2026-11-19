"use client";

import { useEffect, useState } from "react";

/**
 * The two small public forms that aren't application forms: a referee's four
 * answers, and an applicant picking an interview time. Neither records how
 * text arrived; provenance is for applicants' own answers only.
 */

async function post(url: string, body: unknown) {
  const r = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const j = (await r.json().catch(() => ({}))) as { error?: string; fields?: Record<string, string>; scheduledAt?: string };
  return { ok: r.ok, ...j };
}

export function ReferenceForm({ token, questions, candidate }: { token: string; questions: { id: string; label: string; required: boolean }[]; candidate: string }) {
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const r = await post(`/api/ref/${encodeURIComponent(token)}`, { answers });
    setBusy(false);
    if (r.ok) return setDone(true);
    setErrors(r.fields ?? {});
    setError(r.error ?? "That didn't go through. Try again.");
  }

  if (done)
    return (
      <div className="text-center py-6 space-y-2">
        <p className="text-[20px] font-semibold">Thank you.</p>
        <p className="text-rt-muted">Your answers about {candidate.split(/\s+/)[0]} are with the people hiring. You can close this page.</p>
      </div>
    );

  return (
    <form onSubmit={send} className="space-y-6" noValidate>
      {questions.map((q, i) => (
        <label key={q.id} className="block space-y-2">
          <span className="flex gap-2 font-medium leading-snug">
            <span className="text-rt-faint tabular">{i + 1}.</span>
            <span>
              {q.label}
              {!q.required && <span className="text-rt-faint font-normal"> (optional)</span>}
            </span>
          </span>
          <textarea
            className="field min-h-[110px]"
            value={answers[q.id] ?? ""}
            onChange={(e) => setAnswers({ ...answers, [q.id]: e.target.value })}
            aria-invalid={!!errors[q.id]}
          />
          {errors[q.id] && <span className="block text-[12.5px] text-rt-destructive">{errors[q.id]}</span>}
        </label>
      ))}
      {error && <p className="text-[13px] text-rt-destructive">{error}</p>}
      <button className="btn btn-primary w-full sm:w-auto" disabled={busy}>
        {busy ? "Sending…" : "Send reference"}
      </button>
    </form>
  );
}

export function BookingPicker({ token, slots, durationMin }: { token: string; slots: string[]; durationMin: number | null }) {
  const [pick, setPick] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [booked, setBooked] = useState<string | null>(null);
  // Times are drawn in the viewer's own zone, which the server can't know: render them after mount.
  const [tz, setTz] = useState<string | null>(null);
  useEffect(() => setTz(Intl.DateTimeFormat().resolvedOptions().timeZone || ""), []);
  const day = (iso: string) => new Date(iso).toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" });
  const time = (iso: string) => {
    const s = new Date(iso);
    const t = s.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
    if (!durationMin) return t;
    return `${t} to ${new Date(s.getTime() + durationMin * 60_000).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}`;
  };
  const byDay = new Map<string, string[]>();
  for (const s of slots) byDay.set(day(s), [...(byDay.get(day(s)) ?? []), s]);

  async function confirm() {
    if (!pick) return;
    setBusy(true);
    setError("");
    const r = await post(`/api/book/${encodeURIComponent(token)}`, { slot: pick });
    setBusy(false);
    if (r.ok) return setBooked(r.scheduledAt ?? pick);
    setError(r.error ?? "That didn't go through. Try again.");
  }

  if (booked)
    return (
      <div className="text-center py-6 space-y-2">
        <p className="text-[20px] font-semibold">You&apos;re booked.</p>
        <p className="text-rt-muted">
          {day(booked)}, {time(booked)}
          {tz ? ` (${tz.replace(/_/g, " ")})` : ""}. Watch your email for the details.
        </p>
      </div>
    );

  if (tz === null) return <div className="h-40" aria-busy="true" />;

  if (!slots.length) return <p className="text-rt-muted">There are no times left to pick. Reply to the email you got this link in and we&apos;ll find another.</p>;

  return (
    <div className="space-y-5">
      <p className="text-[13px] text-rt-muted">Times are shown in your time zone{tz ? `, ${tz.replace(/_/g, " ")}` : ""}.</p>
      {[...byDay.entries()].map(([d, list]) => (
        <div key={d} className="space-y-2">
          <p className="eyebrow">{d}</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {list.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setPick(s)}
                aria-pressed={pick === s}
                className={`text-left rounded-xl px-4 py-3 tabular transition ${pick === s ? "bg-rt-primary text-white" : "inset hover:bg-rt-subtle"}`}
              >
                {time(s)}
              </button>
            ))}
          </div>
        </div>
      ))}
      {error && <p className="text-[13px] text-rt-destructive">{error}</p>}
      <button type="button" onClick={confirm} className="btn btn-primary w-full sm:w-auto" disabled={!pick || busy}>
        {busy ? "Booking…" : pick ? `Book ${time(pick).split(" to ")[0]}` : "Pick a time"}
      </button>
    </div>
  );
}
