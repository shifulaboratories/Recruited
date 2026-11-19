// The pure rules, no database. Run with `npm run check` (Node 22.18+ loads the .ts directly).
import { test } from "node:test";
import assert from "node:assert/strict";
import { classifyOrigin, readTelemetry, styleSignals, styleLabel, EMPTY_TELEMETRY } from "../src/lib/provenance.ts";
import { renderListing, toPlain, toHtml, lintListing, boardByKey, BOARDS } from "../src/lib/boards.ts";
import { QuestionsSchema, failedKnockouts, validateAnswer, readQuestions } from "../src/lib/forms.ts";
import { mailtoLink, KIND_GUIDANCE, MESSAGE_KINDS, renderReceipt, DEFAULT_RECEIPT_BODY, DEFAULT_RECEIPT_SUBJECT } from "../src/lib/messages.ts";
import { parseCsv, mapColumns, guessBoard, rowsToApplicants } from "../src/lib/csv.ts";
import { panelView, offerChanges, readRatings, formatOfferPay } from "../src/lib/scorecards.ts";
import { readProbes, ProbesSchema } from "../src/lib/probes.ts";
import { checkReferenceAnswers, REFERENCE_QUESTIONS } from "../src/lib/references.ts";
import { bestListing } from "../src/lib/listing-score.ts";
import { jobPostingLd, ldJson } from "../src/lib/job-posting.ts";
import { publicStatusOf, STATUS_COPY } from "../src/lib/applicant-status.ts";
import { privacyNotice, retentionSentence } from "../src/lib/privacy.ts";
import { OWNER_TOOLS, SCOPED_TOOLS, toolAllowed, jobScope, MEMBER_ROLES } from "../src/lib/team.ts";

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

test("work samples and video answers: task and video questions parse with their own fields", () => {
  const qs = QuestionsSchema.parse([
    { id: "macro", label: "Write the reply", type: "task", brief: "A customer...", minutes: 30 },
    { id: "hello", label: "Say hello", type: "video" },
  ]);
  assert.equal(qs[0].minutes, 30);
  assert.equal(qs[1].maxSeconds, 90);
  assert.equal(validateAnswer(qs[1], ""), null);
  assert.throws(() => QuestionsSchema.parse([{ id: "v", label: "x", type: "video", maxSeconds: 900 }]));
});

test("probes: stored follow-up questions are read defensively", () => {
  assert.deepEqual(readProbes(null), []);
  const p = readProbes([{ question: "Walk me through the last angry customer you handled." }, { question: "short" }, "junk"]);
  assert.equal(p.length, 1);
  assert.equal(p[0].asked, false);
  assert.throws(() => ProbesSchema.parse(Array.from({ length: 13 }, () => ({ question: "A long enough question?" }))));
});

test("references: three answers required, the growth one optional", () => {
  const bad = checkReferenceAnswers({ context: "Manager for two years" });
  assert.ok(bad.errors.strengths && bad.errors.again && !bad.errors.growth);
  const ok = checkReferenceAnswers({ context: "x", strengths: "y", again: "z" });
  assert.deepEqual(ok.errors, {});
  assert.equal(ok.answers.length, REFERENCE_QUESTIONS.length);
});

test("listing score: judged on A-tier, cautious on small numbers", () => {
  const row = (id, applicants, A, qualified, cost = null) => ({ listingId: id, board: "linkedin", variant: id, applicants, qualified, tiers: { A }, costPerATier: cost });
  assert.equal(bestListing([row("A", 10, 1, 5)]), null);
  const b = bestListing([row("A", 30, 1, 10), row("B", 8, 3, 6)]);
  assert.equal(b.listingId, "B");
  assert.equal(b.confident, true);
  assert.equal(bestListing([row("A", 3, 1, 1, 60), row("B", 2, 1, 2, 30)]).listingId, "B");
  assert.equal(bestListing([row("A", 3, 1, 1, 60), row("B", 2, 1, 2, 30)]).confident, false);
});

// --- JobPosting for Google for Jobs -------------------------------------------

const posting = {
  title: "Operations Virtual Assistant",
  descriptionHtml: "<p>Run the inbox</p>",
  postedAt: new Date("2026-11-19T10:00:00Z"),
  url: "https://app.example/apply/abc",
  company: "Acme",
  companyWebsite: "https://acme.example",
  location: "Philippines",
  workplace: "remote",
  employmentType: "full_time",
  salaryMin: 800,
  salaryMax: 1100,
  salaryCurrency: "USD",
  salaryPeriod: "month",
};

test("a remote job is TELECOMMUTE with the country as an applicant requirement", () => {
  const ld = jobPostingLd(posting);
  assert.equal(ld.jobLocationType, "TELECOMMUTE");
  assert.deepEqual(ld.applicantLocationRequirements, { "@type": "Country", name: "Philippines" });
  assert.equal(ld.jobLocation, undefined);
  assert.equal(ld.employmentType, "FULL_TIME");
  assert.equal(ld.datePosted, "2026-11-19");
  assert.deepEqual(ld.baseSalary.value, { "@type": "QuantitativeValue", minValue: 800, maxValue: 1100, unitText: "MONTH" });
});

test("an onsite job has a place, and missing pay is left out rather than guessed", () => {
  const ld = jobPostingLd({ ...posting, workplace: "onsite", location: "Manila", salaryMin: null, salaryMax: null });
  assert.equal(ld.jobLocationType, undefined);
  assert.equal(ld.jobLocation.address.addressLocality, "Manila");
  assert.equal(ld.baseSalary, undefined);
});

test("the JSON can't close its script tag", () => {
  const out = ldJson(jobPostingLd({ ...posting, descriptionHtml: "</script><script>alert(1)</script>" }));
  assert.ok(!out.includes("</script>"));
});

test("the receipt fills its four placeholders and leaves anything else alone", () => {
  const vars = { first_name: "Ana", job: "Bookkeeper", company: "Acme", sender: "Dana" };
  assert.equal(renderReceipt(DEFAULT_RECEIPT_SUBJECT, vars), "We have your application for Bookkeeper");
  const body = renderReceipt(DEFAULT_RECEIPT_BODY, vars);
  assert.match(body, /^Hi Ana,/);
  assert.match(body, /Bookkeeper at Acme/);
  assert.ok(body.endsWith("Dana"));
  assert.equal(renderReceipt("Hi {first_name}, {salary} {constructor}", vars), "Hi Ana, {salary} {constructor}");
});

test("the built-in receipt promises nothing", () => {
  assert.doesNotMatch(DEFAULT_RECEIPT_BODY + DEFAULT_RECEIPT_SUBJECT, /will (reply|respond|get back|be in touch)|within \d|days?\b/i);
});

test("a receipt line whose placeholder is empty is dropped whole", () => {
  const vars = { first_name: "Ana", job: "Bookkeeper", company: "Acme", sender: "Dana", status_link: "" };
  const body = renderReceipt(DEFAULT_RECEIPT_BODY, vars);
  assert.doesNotMatch(body, /here:/);
  assert.match(renderReceipt(DEFAULT_RECEIPT_BODY, { ...vars, status_link: "https://x.test/status/abc" }), /here: https:\/\/x\.test\/status\/abc/);
});

test("the status page never says closed before the applicant was told", () => {
  const s = (stage, jobStatus = "OPEN", rejectionSent = false) => publicStatusOf({ stage, jobStatus, rejectionSent });
  assert.equal(s("NEW"), "received");
  assert.equal(s("SCREEN"), "in_review");
  assert.equal(s("REJECTED"), "in_review");
  assert.equal(s("REJECTED", "OPEN", true), "closed");
  assert.equal(s("NEW", "CLOSED"), "closed");
  assert.equal(s("OFFER", "CLOSED"), "in_review");
  assert.equal(s("HIRED", "CLOSED"), "in_review");
  for (const c of Object.values(STATUS_COPY)) assert.doesNotMatch(c.text + c.title, /reject|tier|score|rank/i);
});

test("the privacy notice says who, how long and where to write", () => {
  assert.equal(retentionSentence(12), "They keep it for 1 year after this role closes, then it's deleted, unless they hire you.");
  assert.match(retentionSentence(24), /2 years/);
  assert.match(retentionSentence(6), /6 months/);
  assert.match(retentionSentence(0), /until they delete it/);
  const n = privacyNotice({ company: "Acme", retentionMonths: 12, contactEmail: "privacy@acme.test" });
  assert.match(n, /^Your application goes to Acme and no one else\./);
  assert.match(n, /email privacy@acme\.test\.$/);
  assert.match(privacyNotice({ company: "", retentionMonths: 12, contactEmail: "" }), /reply to any email they send you/);
});

test("roles: the owner gets everything, a recruiter all but the owner's, narrow roles only their lists", () => {
  for (const name of ["send_message", "invite_teammate", "list_jobs"]) assert.ok(toolAllowed("OWNER", name));
  for (const name of OWNER_TOOLS) assert.equal(toolAllowed("RECRUITER", name), false, name);
  assert.ok(toolAllowed("RECRUITER", "send_message"));
  for (const role of ["HIRING_MANAGER", "INTERVIEWER"]) {
    for (const name of SCOPED_TOOLS[role]) assert.ok(!OWNER_TOOLS.includes(name), `${role} gets owner tool ${name}`);
    for (const name of ["send_message", "save_message", "record_offer", "delete_applicant_data", "share_applicant"]) assert.equal(toolAllowed(role, name), false, `${role} gets ${name}`);
  }
  for (const name of SCOPED_TOOLS.INTERVIEWER) assert.ok(SCOPED_TOOLS.HIRING_MANAGER.includes(name), `an interviewer gets ${name} and a hiring manager doesn't`);
  assert.ok(!MEMBER_ROLES.includes("OWNER"));
});

test("jobScope narrows to the allowed jobs, and a job outside them matches nothing", () => {
  assert.deepEqual(jobScope(undefined, undefined), {});
  assert.deepEqual(jobScope("j1", undefined), { jobId: "j1" });
  assert.deepEqual(jobScope(undefined, ["j1", "j2"]), { jobId: { in: ["j1", "j2"] } });
  assert.deepEqual(jobScope("j2", ["j1", "j2"]), { jobId: { in: ["j2"] } });
  assert.deepEqual(jobScope("j3", ["j1"]), { jobId: { in: [] } });
});
