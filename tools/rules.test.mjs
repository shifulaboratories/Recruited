// The pure rules, no database. Run with `npm run check` (Node 22.18+ loads the .ts directly).
import { test } from "node:test";
import assert from "node:assert/strict";
import { classifyOrigin, readTelemetry, styleSignals, styleLabel, EMPTY_TELEMETRY } from "../src/lib/provenance.ts";
import { renderListing, toPlain, toHtml, lintListing, boardByKey, BOARDS } from "../src/lib/boards.ts";
import { QuestionsSchema, failedKnockouts, validateAnswer, readQuestions } from "../src/lib/forms.ts";
import { mailtoLink, KIND_GUIDANCE, MESSAGE_KINDS } from "../src/lib/messages.ts";
import { parseCsv, mapColumns, guessBoard, rowsToApplicants } from "../src/lib/csv.ts";
import { panelView, offerChanges, readRatings, formatOfferPay } from "../src/lib/scorecards.ts";

const t = (o) => ({ ...EMPTY_TELEMETRY, ...o });

test("typed text is TYPED", () => {
  const r = classifyOrigin(t({ typedChars: 300, keystrokes: 300, typingMs: 60000 }), "x".repeat(290), true);
  assert.equal(r.origin, "TYPED");
  assert.equal(r.pastedShare, 0);
  assert.deepEqual(r.flags, []);
});

test("one big paste is PASTED, and a paste after leaving the page is flagged", () => {
  const r = classifyOrigin(t({ pastes: 1, pastedChars: 600, longestPaste: 600, typedChars: 4, awayCount: 1, awayMs: 45000, pasteAfterAway: 1 }), "x".repeat(600), true);
  assert.equal(r.origin, "PASTED");
  assert.ok(r.flags.includes("pasted_after_leaving_page"));
  assert.match(r.summary, /left the page once/);
});

test("half typed, half pasted is MIXED", () => {
  const r = classifyOrigin(t({ typedChars: 200, pastes: 1, pastedChars: 200 }), "x".repeat(400), true);
  assert.equal(r.origin, "MIXED");
  assert.equal(r.pastedShare, 0.5);
});

test("text with no input events is INJECTED", () => {
  const r = classifyOrigin(t({}), "Some text that arrived from nowhere.", true);
  assert.equal(r.origin, "INJECTED");
});

test("an auto-typer is not TYPED", () => {
  const r = classifyOrigin(t({ typedChars: 800, keystrokes: 800, typingMs: 8000 }), "x".repeat(800), true);
  assert.equal(r.origin, "INJECTED");
  assert.ok(r.flags.includes("typed_faster_than_a_person"));
});

test("no recording is UNKNOWN, never a guess", () => {
  assert.equal(classifyOrigin(t({}), "hello there", false).origin, "UNKNOWN");
});

test("telemetry from the browser is clamped and filled", () => {
  const r = readTelemetry({ typedChars: "12", pastedChars: -5, junk: 1, focusMs: 1e15 });
  assert.equal(r.typedChars, 12);
  assert.equal(r.pastedChars, 0);
  assert.equal(r.focusMs, 1e9);
  assert.equal(r.awayMs, 0);
});

test("style signals stay quiet on plain writing and say 'likely' when they fire", () => {
  const plain = styleSignals("I ran the support inbox at a dental clinic for two years. Mostly rescheduling, some billing questions. I used Zendesk and a shared Google Sheet for the callbacks, and I wrote the macros we used.");
  assert.equal(plain.score, 0);
  const gen = styleSignals(
    "Certainly! I am excited to apply. I am passionate about operations and I thrive in a fast-paced environment. Furthermore, I have a proven track record of streamlining workflows, and I am confident that my skills align with your needs. **Key strengths:** organisation, communication, and reliability.",
  );
  assert.ok(gen.score >= 0.5, `score ${gen.score}`);
  assert.equal(styleLabel(gen.score), "Likely written with AI");
  assert.match(styleLabel(0.3), /signs/);
});

test("markdown renders to each board's format with the apply link", () => {
  const md = "Run our inbox.\n\n## What you'll do\n\n- Answer **tickets**\n- Book calls";
  const plain = renderListing("onlinejobs_ph", "Customer Support VA", md, "https://x.test/apply/abc");
  assert.equal(plain.format, "plain");
  assert.match(plain.body, /• Answer tickets/);
  assert.match(plain.body, /https:\/\/x\.test\/apply\/abc/);
  assert.deepEqual(plain.warnings, []);
  const html = renderListing("indeed", "Customer Support VA", md, "https://x.test/apply/abc");
  assert.match(html.body, /<ul><li>Answer <b>tickets<\/b><\/li>/);
  const upwork = renderListing("upwork", "Support VA", md, "https://x.test/apply/abc");
  assert.doesNotMatch(upwork.body, /x\.test/, "Upwork forbids external apply links");
});

test("html rendering escapes what applicants or assistants wrote", () => {
  assert.doesNotMatch(toHtml("<script>alert(1)</script> [x](javascript:alert(1))"), /<script>|href="javascript/);
});

test("listing lint catches what boards reject", () => {
  const b = boardByKey("indeed");
  assert.ok(lintListing(b, "URGENT HIRING VA", "x").some((w) => /capitals/.test(w)));
  assert.ok(lintListing(b, "VA $5/hr", "x").some((w) => /pay/.test(w)));
  assert.ok(lintListing(boardByKey("onlinejobs_ph"), "VA", "Pay is PHP 30,000 a month").some((w) => /wage/.test(w)));
  assert.equal(toPlain("1. one\n2. two"), "1. one\n2. two");
  assert.ok(BOARDS.every((x) => x.rules && x.craft && x.applyFlow));
});

test("forms: schema rules, knockouts and validation", () => {
  const ok = QuestionsSchema.safeParse([
    { id: "backup_power", label: "Do you have backup power?", type: "yes_no", required: true, knockout: { accept: ["Yes"] } },
    { id: "speed", label: "Download speed in Mbps", type: "number", knockout: { min: 25 } },
    { id: "why", label: "Why this role?", type: "long_text" },
  ]);
  assert.ok(ok.success);
  assert.ok(!QuestionsSchema.safeParse([{ id: "email", label: "Email", type: "email" }]).success, "email is built in");
  assert.ok(!QuestionsSchema.safeParse([{ id: "a", label: "A", type: "single_choice", options: ["x"] }]).success);
  const qs = ok.data;
  assert.equal(failedKnockouts(qs, { backup_power: "Yes", speed: "50" }).length, 0);
  const f = failedKnockouts(qs, { backup_power: "No", speed: "10" });
  assert.deepEqual(f.map((x) => x.questionId), ["backup_power", "speed"]);
  assert.equal(validateAnswer(qs[0], ""), "This one is required.");
  assert.equal(readQuestions([{ id: "x", label: "X", type: "nope" }, qs[2]]).length, 1);
});

import { sniffMime, accepts, cleanFilename } from "../src/lib/files.ts";

test("files: the type comes from the bytes, not the name", () => {
  const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
  const pdf = new TextEncoder().encode("%PDF-1.7 rest of file");
  const html = new TextEncoder().encode("<html><script>alert(1)</script></html>");
  assert.equal(sniffMime(png), "image/png");
  assert.equal(sniffMime(pdf), "application/pdf");
  assert.equal(sniffMime(html), null);
  assert.ok(accepts("image_or_pdf", "application/pdf"));
  assert.ok(!accepts("image", "application/pdf"));
  assert.equal(cleanFilename("../../etc/pass\"wd.png"), "pass_wd.png");
  assert.equal(cleanFilename(""), "file");
  const q = QuestionsSchema.parse([{ id: "setup_photo", label: "Your work setup", type: "file", accept: "image", required: true }]);
  assert.equal(q[0].accept, "image");
  assert.equal(QuestionsSchema.parse([{ id: "cv", label: "CV", type: "file" }])[0].accept, "image_or_pdf");
});

test("messages: mailto keeps the address readable and encodes the rest", () => {
  const m = mailtoLink("ana+jobs@example.com", "Next step & a form", "Hi Ana,\n\nLink: https://x.test/f/a?t=1&b=2");
  assert.ok(m.startsWith("mailto:ana%2Bjobs@example.com?subject=Next%20step%20%26%20a%20form&body="));
  assert.ok(m.includes("%0A%0ALink%3A%20https%3A%2F%2Fx.test%2Ff%2Fa%3Ft%3D1%26b%3D2"));
  assert.equal(mailtoLink("a@b.c", "", ""), "mailto:a@b.c");
});

test("messages: every kind has guidance, and a rejection never cites provenance", () => {
  for (const k of MESSAGE_KINDS) assert.ok(KIND_GUIDANCE[k].length > 0, k);
  assert.ok(KIND_GUIDANCE.REJECTION.some((g) => /provenance is not a reason/.test(g)));
  assert.ok(KIND_GUIDANCE.OFFER.some((g) => /Never fill a gap/.test(g)));
});

test("csv: quotes, embedded commas and newlines, BOM, CRLF and tabs", () => {
  const rows = parseCsv('\uFEFFName,Email,Note\r\n"Cruz, Lea",lea@x.co,"line one\nline ""two"""\r\n\r\n');
  assert.deepEqual(rows, [["Name", "Email", "Note"], ["Cruz, Lea", "lea@x.co", 'line one\nline "two"']]);
  assert.deepEqual(parseCsv("a\tb\n1\t2"), [["a", "b"], ["1", "2"]]);
});

test("csv: LinkedIn-style headers map by alias, and the rest becomes a note", () => {
  const rows = parseCsv("First Name,Last Name,Email Address,Phone Number,Profile URL,Location\nAna,Villanueva,ANA@x.co,+63 900,https://linkedin.com/in/ana,Cebu\nBo,Lee,,,,\nCy,Tan,not-an-email,,,\nAna,V,ana@x.co,,,");
  const map = mapColumns(rows[0]);
  assert.deepEqual(map.email, ["Email Address"]);
  assert.equal(guessBoard(rows[0]), "linkedin");
  const out = rowsToApplicants(rows, map);
  assert.equal(out[0].name, "Ana Villanueva");
  assert.equal(out[0].email, "ana@x.co");
  assert.deepEqual(out[0].links, ["https://linkedin.com/in/ana"]);
  assert.deepEqual(out[0].extra, ["Location: Cebu"]);
  assert.equal(out[1].problem, "no email address");
  assert.match(out[2].problem, /isn't an email/);
  assert.equal(out[3].problem, "same email as an earlier row");
});

test("csv: a named column beats the guess", () => {
  const map = mapColumns(["Candidate", "Contact", "Email"], { email: "contact" });
  assert.deepEqual(map.email, ["Contact"]);
  assert.deepEqual(map.name, ["Candidate"]);
});

test("scorecards: the panel view counts yes and no and flags a strong no", () => {
  const p = panelView([{ recommendation: "STRONG_YES" }, { recommendation: "YES" }, { recommendation: "STRONG_NO" }]);
  assert.deepEqual(p, { scorecards: 3, yes: 2, no: 1, strongNo: true, split: true });
  assert.equal(panelView([]).split, false);
  assert.deepEqual(readRatings([{ criterion: "Writing", score: 5 }]), []);
  assert.equal(readRatings([{ criterion: "Writing", score: 3 }])[0].note, "");
});

test("offers: changes between versions, and pay formatting", () => {
  const v1 = { payAmount: 35000, payCurrency: "PHP", payPeriod: "month", startDate: new Date("2026-12-01"), hours: "40", title: "Ops VA", terms: "", respondBy: null };
  assert.deepEqual(offerChanges(null, v1), []);
  assert.deepEqual(offerChanges(v1, { ...v1, payAmount: 40000, startDate: new Date("2026-12-01T00:00:00Z") }), ["payAmount"]);
  assert.equal(formatOfferPay(v1), "PHP 35,000 per month");
  assert.equal(formatOfferPay({ ...v1, payAmount: null }), "");
});
