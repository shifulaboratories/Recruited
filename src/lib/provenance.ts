/**
 * How an answer was written: typed, pasted, or put there by something else.
 *
 * Two independent kinds of evidence, kept apart on purpose:
 *
 *   1. ORIGIN — what the browser saw happen in the field. The public form
 *      (src/components/provenance-field.tsx) counts characters by how they
 *      arrived: typed keys, paste, drop, autocorrect, and text that appeared
 *      with no input event at all (autofill, an extension, a script). This is
 *      an observation, not a guess, and it is what the UI leads with.
 *
 *   2. STYLE — features of the text that are common in generated writing:
 *      stock phrases, markdown in a form field, sentence lengths that barely
 *      vary. These are weak, they misfire on second-language writers and
 *      people who use grammar tools, and they are never shown as a verdict.
 *      They are a reason to read an answer more closely, nothing more.
 *
 * Neither proves that someone used AI. Pasting from your own notes is pasting.
 * The candidate is told on the form that this is recorded (see the apply
 * page), and every tool description that returns it says how to read it.
 *
 * Pure module: tools/rules.test.mjs loads it directly.
 */

/** What the recorder sends for one field. Every number defaults to 0. */
export type FieldTelemetry = {
  /** Characters inserted by typing (insertText and IME composition). */
  typedChars: number;
  /** Key presses that produced input, for typing speed. */
  keystrokes: number;
  pastes: number;
  pastedChars: number;
  /** The largest single paste. */
  longestPaste: number;
  droppedChars: number;
  /** Characters replaced by spellcheck or autocorrect. Counted as typed. */
  autocorrectChars: number;
  /** Characters that appeared with no input event: autofill, extensions, scripts. */
  injectedChars: number;
  deletedChars: number;
  /** Time the field had focus. */
  focusMs: number;
  /** Time spent typing: the sum of gaps under two seconds between typed keys. */
  typingMs: number;
  /** How often the person left the page (tab switch, window blur) while this field was the active one. */
  awayCount: number;
  awayMs: number;
  /** A paste that came within 3 seconds of returning to the page. */
  pasteAfterAway: number;
};

export const EMPTY_TELEMETRY: FieldTelemetry = {
  typedChars: 0,
  keystrokes: 0,
  pastes: 0,
  pastedChars: 0,
  longestPaste: 0,
  droppedChars: 0,
  autocorrectChars: 0,
  injectedChars: 0,
  deletedChars: 0,
  focusMs: 0,
  typingMs: 0,
  awayCount: 0,
  awayMs: 0,
  pasteAfterAway: 0,
};

/** Accept whatever the browser sent, clamp it, and fill the gaps. Never throws. */
export function readTelemetry(raw: unknown): FieldTelemetry {
  const t = { ...EMPTY_TELEMETRY };
  if (!raw || typeof raw !== "object") return t;
  for (const key of Object.keys(EMPTY_TELEMETRY) as (keyof FieldTelemetry)[]) {
    const v = Number((raw as Record<string, unknown>)[key]);
    t[key] = Number.isFinite(v) && v > 0 ? Math.min(Math.round(v), 1e9) : 0;
  }
  return t;
}

export type OriginKind = "TYPED" | "PASTED" | "MIXED" | "INJECTED" | "UNKNOWN";

export type OriginFlag =
  | "pasted_after_leaving_page"
  | "typed_faster_than_a_person"
  | "pasted_then_lightly_edited"
  | "text_appeared_without_input";

export type OriginResult = {
  origin: OriginKind;
  /** Share of the inserted text that was not typed, 0..1. */
  pastedShare: number;
  /** Typing speed in characters per second while typing, or 0. */
  typingCps: number;
  flags: OriginFlag[];
  /** One sentence a reviewer can read. */
  summary: string;
};

/**
 * Sustained typing faster than this is not a person. The fastest human typists
 * sustain roughly 200 words a minute, about 17 characters a second; 25 leaves a
 * wide margin, so the flag only fires on auto-typers built to dodge paste
 * detection.
 */
const MAX_HUMAN_CPS = 25;

export function classifyOrigin(t: FieldTelemetry, finalText: string, recorded: boolean): OriginResult {
  const len = finalText.trim().length;
  if (!recorded || len === 0) {
    return { origin: "UNKNOWN", pastedShare: 0, typingCps: 0, flags: [], summary: recorded ? "Empty." : "No recording for this answer." };
  }
  const typed = t.typedChars + t.autocorrectChars;
  const outside = t.pastedChars + t.droppedChars;
  const injected = t.injectedChars;
  const inserted = typed + outside + injected;
  const typingCps = t.typingMs > 0 ? Math.round((t.typedChars / (t.typingMs / 1000)) * 10) / 10 : 0;

  const flags: OriginFlag[] = [];
  if (t.pasteAfterAway > 0) flags.push("pasted_after_leaving_page");
  if (t.typedChars >= 150 && typingCps > MAX_HUMAN_CPS) flags.push("typed_faster_than_a_person");
  if (inserted === 0) flags.push("text_appeared_without_input");

  // Nothing the recorder saw explains the text: it was set from outside.
  if (inserted === 0) {
    return { origin: "INJECTED", pastedShare: 1, typingCps, flags, summary: "The text appeared without typing or pasting (autofill, an extension or a script)." };
  }

  const pastedShare = Math.round(((outside + injected) / inserted) * 100) / 100;
  let origin: OriginKind;
  if (injected > outside && injected / inserted >= 0.5) origin = "INJECTED";
  else if (pastedShare >= 0.9) origin = "PASTED";
  else if (pastedShare <= 0.1) origin = "TYPED";
  else origin = "MIXED";

  if ((origin === "PASTED" || origin === "MIXED") && typed > 0 && typed < outside * 0.15) flags.push("pasted_then_lightly_edited");
  // An auto-typer produces typed characters, so speed overrides the count.
  if (flags.includes("typed_faster_than_a_person") && origin === "TYPED") origin = "INJECTED";

  return { origin, pastedShare, typingCps, flags, summary: summarize(origin, t, pastedShare, typingCps, flags) };
}

function seconds(ms: number) {
  const s = Math.round(ms / 1000);
  return s < 90 ? `${s}s` : `${Math.round(s / 60)} min`;
}

function summarize(origin: OriginKind, t: FieldTelemetry, share: number, cps: number, flags: OriginFlag[]): string {
  const parts: string[] = [];
  if (origin === "TYPED") parts.push(`Typed${cps ? ` at about ${Math.round(cps * 12)} words a minute` : ""}.`);
  if (origin === "PASTED") parts.push(`Pasted: ${t.pastedChars + t.droppedChars} characters in ${t.pastes || 1} paste${t.pastes === 1 ? "" : "s"}.`);
  if (origin === "MIXED") parts.push(`Partly pasted: ${Math.round(share * 100)}% of the text came from ${t.pastes} paste${t.pastes === 1 ? "" : "s"}, the rest was typed.`);
  if (origin === "INJECTED")
    parts.push(
      flags.includes("typed_faster_than_a_person")
        ? `Entered at ${cps} characters a second, faster than anyone types: likely an auto-typer.`
        : "Most of the text appeared without typing or pasting (autofill, an extension or a script).",
    );
  if (flags.includes("pasted_after_leaving_page"))
    parts.push(`They left the page ${t.awayCount === 1 ? "once" : `${t.awayCount} times`} (${seconds(t.awayMs)} away) and pasted on returning.`);
  if (flags.includes("pasted_then_lightly_edited")) parts.push("Lightly edited after pasting.");
  return parts.join(" ");
}

// ---------------------------------------------------------------------------
// Style signals
// ---------------------------------------------------------------------------

export type StyleSignal = { key: string; label: string; weight: number; evidence: string };

/**
 * Phrases that turn up far more in generated application answers than in
 * ones people write themselves. Each is weak alone; the score counts how many
 * distinct ones appear.
 */
const STOCK_PHRASES = [
  "i am excited to",
  "i'm excited to",
  "i am writing to express",
  "delve",
  "tapestry",
  "testament to",
  "fast-paced environment",
  "in today's fast-paced",
  "i am confident that",
  "aligns perfectly",
  "align with your",
  "passionate about",
  "navigate the complexities",
  "seamlessly",
  "multifaceted",
  "it's worth noting",
  "it is worth noting",
  "a proven track record",
  "leverage my",
  "invaluable",
  "honed my",
  "dynamic team",
  "i thrive in",
  "unwavering",
  "foster",
  "in conclusion",
  "overall,",
  "furthermore,",
  "moreover,",
];

const OPENERS = /^(certainly|absolutely|great question|sure[,!]|of course[,!]|as an? (ai|language model))/i;

function sentences(text: string) {
  return text
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.split(/\s+/).length >= 3);
}

export function styleSignals(text: string): { score: number; signals: StyleSignal[] } {
  const signals: StyleSignal[] = [];
  const lower = text.toLowerCase();
  const words = text.split(/\s+/).filter(Boolean).length;
  if (words < 25) return { score: 0, signals };

  const hits = STOCK_PHRASES.filter((p) => lower.includes(p));
  if (hits.length >= 2)
    signals.push({ key: "stock_phrases", label: "Stock phrases common in generated text", weight: Math.min(0.1 * hits.length, 0.4), evidence: hits.slice(0, 5).map((h) => `"${h}"`).join(", ") });

  if (OPENERS.test(text.trim()))
    signals.push({ key: "assistant_opener", label: "Opens like a chat reply", weight: 0.3, evidence: text.trim().slice(0, 40) });

  if (/\*\*[^*]+\*\*|^#{1,3}\s|^\s*[-*]\s.+\n\s*[-*]\s/m.test(text))
    signals.push({ key: "markdown", label: "Markdown formatting in a plain form field", weight: 0.25, evidence: "bold markers, headings or bullet lists" });

  const dashes = (text.match(/—/g) ?? []).length;
  if (dashes >= 2 && dashes / words > 0.01)
    signals.push({ key: "em_dashes", label: "Frequent em dashes", weight: 0.1, evidence: `${dashes} in ${words} words` });

  const ss = sentences(text);
  if (ss.length >= 6) {
    const lens = ss.map((s) => s.split(/\s+/).length);
    const mean = lens.reduce((a, b) => a + b, 0) / lens.length;
    const sd = Math.sqrt(lens.reduce((a, b) => a + (b - mean) ** 2, 0) / lens.length);
    if (mean > 0 && sd / mean < 0.25)
      signals.push({ key: "uniform_sentences", label: "Sentence lengths barely vary", weight: 0.1, evidence: `average ${Math.round(mean)} words, spread ${Math.round((sd / mean) * 100)}%` });
  }

  const triplets = (text.match(/\b\w+(?: \w+)?, \w+(?: \w+)?,? and \w+/g) ?? []).length;
  if (triplets >= 3) signals.push({ key: "triplets", label: "Repeated lists of three", weight: 0.1, evidence: `${triplets} "X, Y and Z" lists` });

  const score = Math.min(1, Math.round(signals.reduce((a, s) => a + s.weight, 0) * 100) / 100);
  return { score, signals };
}

/** A label for the style score that never claims more than it knows. */
export function styleLabel(score: number): string {
  if (score >= 0.5) return "Several style signals";
  if (score >= 0.2) return "Some style signals";
  return "No notable style signals";
}
