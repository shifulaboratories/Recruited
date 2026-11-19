/**
 * The guarantees only a real database can show, run against one.
 *
 *   DATABASE_URL=postgresql://…/recruited_probe npm run probe
 *
 * tools/rules.test.mjs pins the pure rules (boards, forms, provenance). This
 * pins what their CALLERS do with them, ported from Hired's probe:
 *
 *   - every tool in TOOLS runs at least once against real rows, and the run
 *     fails if a tool has no case here, so a new tool can't ship unexercised;
 *   - one workspace can't read or write another's rows through any tool that
 *     takes an id;
 *   - archived jobs and applications drop out of every read;
 *   - the public apply page records provenance, marks knockouts without
 *     declining anyone, and refuses a second application;
 *   - the MCP transport lists every tool and renders every prompt.
 *
 * It REFUSES any database whose name does not contain "probe", because it
 * creates and deletes accounts. Run `npx prisma migrate deploy` against that
 * database first. Every account it makes is @probe.invalid and is deleted in
 * `finally`, cascading everything it owned.
 *
 * Run it when src/lib/data/, src/lib/mcp/ or prisma/ changes. It is part of
 * the gate in CLAUDE.md and runs in CI on every pull request.
 */
import { createJiti } from "jiti";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dbName = new URL(process.env.DATABASE_URL ?? "postgresql://x/none").pathname.slice(1);
if (!dbName.includes("probe")) {
  console.error(`Refusing to run against "${dbName}": the probe only touches a database whose name contains "probe".`);
  process.exit(2);
}

const jiti = createJiti(import.meta.url, { alias: { "@": path.join(root, "src") }, interopDefault: true });
const load = (file) => jiti.import(path.join(root, "src/lib", file));

const { db } = await load("db.ts");
const jobsData = await load("data/jobs.ts");
const appsData = await load("data/applications.ts");
const publicData = await load("data/public.ts");
const { TOOLS, PROMPTS } = await load("mcp/tools.ts");
const { handleMcpPost } = await load("mcp/handler.ts");
const { handlePublicSubmit } = await load("public-submit.ts");
const ratelimit = await load("data/ratelimit.ts");

const BASE = "http://probe.invalid";
const called = new Set();
function tool(name) {
  const found = TOOLS.find((t) => t.name === name);
  if (!found) throw new Error(`no tool called ${name}`);
  return (user, args = {}) => {
    called.add(name);
    return found.handler(args, { userId: user.id, user, baseUrl: BASE });
  };
}
const call = (name, user, args) => tool(name)(user, args);

let passed = 0;
const failures = [];
async function check(name, fn) {
  try {
    await fn();
    passed += 1;
  } catch (error) {
    failures.push(`${name}: ${error instanceof Error ? error.message : String(error)}`);
  }
}
function ok(condition, message) {
  if (!condition) throw new Error(message);
}
async function refuses(promise, pattern) {
  try {
    await promise;
  } catch (error) {
    if (pattern && !pattern.test(String(error?.message ?? error))) throw new Error(`refused, but with: ${error?.message}`);
    return;
  }
  throw new Error("did not refuse");
}

const stamp = Date.now().toString(36);
const made = [];
async function person(label) {
  const user = await db.user.create({
    data: { email: `${label}-${stamp}@probe.invalid`, name: `Probe ${label}`, passwordHash: "x", companyName: `Probe ${label} Co` },
  });
  made.push(user.id);
  return user;
}

// A 1x1 PNG, so a file question has real image bytes to store and read back.
const PNG = Uint8Array.from(
  Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64"),
);

try {
  const a = await person("a");
  const b = await person("b");

  // --- A workspace built the way an assistant builds one -------------------
  const job = await call("create_job", a, {
    title: "Operations Virtual Assistant",
    workplace: "remote",
    employment_type: "full_time",
    salary_min: 800,
    salary_max: 1100,
    salary_currency: "USD",
    salary_period: "month",
    description: "## What you'll do\n\n- Run the support inbox\n- Keep the order sheet right",
    rubric: "A has run an inbox solo and writes clear, warm replies.",
    status: "OPEN",
  });
  const form = await call("set_application_form", a, {
    job_id: job.id,
    questions: [
      { id: "hours", label: "Can you work US Eastern mornings?", type: "yes_no", required: true, knockout: { accept: ["Yes"] } },
      { id: "inbox", label: "Tell us about an inbox you've run.", type: "long_text", required: true },
      { id: "setup", label: "A photo of your work setup", type: "file", required: false, accept: "image" },
    ],
  });
  const listing = await call("create_listing", a, {
    job_id: job.id,
    board: "onlinejobs_ph",
    title: "Operations Virtual Assistant",
    body: "Run our support inbox and order sheet.",
  });
  await call("update_listing", a, { listing_id: listing.id, status: "LIVE", spend: 69 });
  const slug = listing.applyUrl.split("/").pop();

  // --- The public apply page ------------------------------------------------
  const payload = (name, email, hours) => ({
    name,
    email,
    answers: { hours, inbox: "I ran a Zendesk inbox for two years at about 100 tickets a day." },
    telemetry: { inbox: { origin: "PASTED", keystrokes: 0, pastes: 1, pastedChars: 64 } },
    recorded: true,
    durationMs: 90_000,
    files: { setup: { filename: "desk.png", bytes: PNG } },
  });
  const passing = await publicData.submitApplication(slug, payload("Ana Probe", `ana-${stamp}@probe.invalid`, "Yes"));
  const failing = await publicData.submitApplication(slug, payload("Ben Probe", `ben-${stamp}@probe.invalid`, "No"));

  await check("a missed knockout marks the applicant and declines no one", async () => {
    const row = await db.application.findUnique({ where: { id: failing.applicationId } });
    ok(row.qualified === false, `qualified is ${row.qualified}`);
    ok(row.stage === "NEW", `stage moved to ${row.stage}`);
    const good = await db.application.findUnique({ where: { id: passing.applicationId } });
    ok(good.qualified === true, `the passing applicant is ${good.qualified}`);
  });

  await check("a second application with the same email is refused", async () => {
    await refuses(publicData.submitApplication(slug, payload("Ana Again", `ana-${stamp}@probe.invalid`, "Yes")), /already applied/);
  });

  await check("a paste is recorded as pasted, and the upload reads back as an image", async () => {
    const got = await call("get_application", a, { application_id: passing.applicationId });
    const text = JSON.stringify(got);
    ok(/PASTED/.test(text), "no pasted origin on the application");
    const upload = await db.upload.findFirst({ where: { userId: a.id } });
    ok(upload, "the file question stored nothing");
    const read = await call("read_upload", a, { upload_id: upload.id });
    ok(JSON.stringify(read).includes('"image"'), "read_upload did not return an image");
  });

  await check("the public form refuses an answer set with a required question missing", async () => {
    await refuses(
      publicData.submitApplication(slug, { name: "No Answers", email: `none-${stamp}@probe.invalid`, answers: {}, telemetry: {}, recorded: false, durationMs: 0 }),
      /another look/,
    );
  });

  const post = (body, address) =>
    handlePublicSubmit(
      new Request(`${BASE}/api/apply/${slug}`, { method: "POST", headers: { "content-type": "application/json", "x-forwarded-for": `10.9.9.${Math.floor(Math.random() * 250)}, ${address}` }, body: JSON.stringify(body) }),
      "apply",
      slug,
      (p) => publicData.submitApplication(slug, p),
    );
  await check("a post that fills the hidden trap field is answered ok and saved nowhere", async () => {
    const before = await db.application.count({ where: { userId: a.id } });
    const res = await post({ ...payload("Bot Probe", `bot-${stamp}@probe.invalid`, "Yes"), files: undefined, trap: "http://spam.invalid" }, `198.51.100.${stamp.length}`);
    ok(res.status === 200, `status ${res.status}`);
    ok((await db.application.count({ where: { userId: a.id } })) === before, "the trapped post saved an application");
  });
  await check("one address is held to the hourly limit, and its address is stored only as a hash", async () => {
    const address = `203.0.113.${(Date.now() % 200) + 1}`;
    let last;
    for (let i = 0; i <= ratelimit.LIMITS.perTarget; i++) last = await post({ name: "", email: "", answers: {} }, address);
    ok(last.status === 429, `post ${ratelimit.LIMITS.perTarget + 1} got ${last.status}`);
    const other = await post({ name: "", email: "", answers: {} }, "192.0.2.77");
    ok(other.status !== 429, "a different address was limited too");
    const leaked = await db.$queryRaw`SELECT 1 FROM "RateHit" WHERE "key" LIKE ${"%" + address + "%"}`;
    ok(leaked.length === 0, "the raw address is in RateHit");
  });

  // --- Every tool, once, on that workspace -----------------------------------
  const app = passing.applicationId;
  let screeningId;
  await check("the read tools answer", async () => {
    ok((await call("get_board_guide", a, {})).boards.length >= 5, "fewer than five board guides");
    await call("get_board_guide", a, { board: "linkedin" });
    ok((await call("list_jobs", a, {})).some((j) => j.id === job.id), "list_jobs misses the job");
    await call("get_job", a, { job_id: job.id });
    await call("get_listing", a, { listing_id: listing.id });
    await call("get_form", a, { form_id: form.formId });
    const report = await call("listing_report", a, { job_id: job.id });
    ok(JSON.stringify(report).includes(listing.id), "listing_report misses the listing");
    ok((await call("list_applications", a, { job_id: job.id })).applications.length === 2, "list_applications is not two rows");
    await call("daily_brief", a, {});
  });

  await check("the job, form and listing writes land", async () => {
    await call("update_job", a, { job_id: job.id, team: "Operations" });
    await call("update_form", a, {
      form_id: form.formId,
      questions: [
        { id: "hours", label: "Can you work US Eastern mornings?", type: "yes_no", required: true, knockout: { accept: ["Yes"] } },
        { id: "inbox", label: "Tell us about an inbox you've run.", type: "long_text", required: true },
        { id: "setup", label: "A photo of your work setup", type: "file", required: false, accept: "image" },
      ],
    });
    const screening = await call("create_screening_form", a, {
      job_id: job.id,
      name: "A short task",
      questions: [{ id: "reply", label: "Reply to this customer.", type: "task", brief: "Sam's order is late.", minutes: 20 }],
    });
    screeningId = screening.formId;
    const link = await call("get_screening_link", a, { application_id: app, form_id: screening.formId, move_to_screen: true });
    ok(link.url.startsWith(BASE), "the screening link is not on this instance");
  });

  await check("tiers are proposed by Claude and decided by a person", async () => {
    await call("rank_applicants", a, {
      job_id: job.id,
      rankings: [
        { application_id: app, tier: "A", reason: "Ran an inbox at 100 a day." },
        { application_id: failing.applicationId, tier: "C", reason: "Can't work the hours." },
      ],
    });
    const before = await db.application.findUnique({ where: { id: app } });
    ok(before.proposedTier === "A" && before.tier === null, "a proposal decided the tier");
    await call("set_tier", a, { application_id: app, tier: "A", reason: "Agreed." });
    ok((await db.application.findUnique({ where: { id: app } })).tier === "A", "set_tier did not decide");
  });

  await check("applicants, notes, stages and imports", async () => {
    const added = await call("add_applicant", a, { job_id: job.id, name: "Cy Probe", email: `cy-${stamp}@probe.invalid`, source: "referral" });
    await call("add_note", a, { application_id: added.applicationId, body: "Met at a meetup." });
    await call("move_stage", a, { application_id: added.applicationId, stage: "SCREEN" });
    const csv = `Name,Email\nDee Probe,dee-${stamp}@probe.invalid\n`;
    const preview = await call("import_applicants", a, { job_id: job.id, csv });
    ok((await db.candidate.count({ where: { userId: a.id, email: `dee-${stamp}@probe.invalid` } })) === 0, "a dry run saved a candidate");
    ok(preview, "no preview");
    await call("import_applicants", a, { job_id: job.id, csv, dry_run: false });
    ok((await db.candidate.count({ where: { userId: a.id, email: `dee-${stamp}@probe.invalid` } })) === 1, "the import saved nothing");
  });

  await check("interviews, scorecards and offers", async () => {
    const i = await call("schedule_interview", a, { application_id: app, title: "Call with the founder", format: "video", scheduled_at: "2026-12-01T14:00:00+08:00", interviewers: "William" });
    const interviewId = i.id ?? i.interviewId ?? i.interview?.id;
    ok(interviewId, `no interview id in ${JSON.stringify(i).slice(0, 200)}`);
    const offered = await call("schedule_interview", a, { application_id: app, title: "Second round", offer_times: ["2026-12-02T09:00:00+08:00", "2026-12-03T09:00:00+08:00"] });
    ok(JSON.stringify(offered).includes("/book/"), "offering times returned no booking link");
    await call("record_scorecard", a, { interview_id: interviewId, interviewer: "William", recommendation: "YES", summary: "Clear and warm." });
    ok((await call("list_interviews", a, { job_id: job.id })).length >= 2, "list_interviews misses a round");
    const o = await call("record_offer", a, { application_id: app, title: "Operations VA", pay_amount: 1000, pay_currency: "USD", pay_period: "month" });
    await call("record_offer", a, { offer_id: o.id, status: "EXTENDED" });
  });

  await check("messages are drafted and logged, never sent by the server", async () => {
    const prep = await call("prep_message", a, { application_id: app, kind: "INTERVIEW_INVITE" });
    ok(prep, "prep_message returned nothing");
    const saved = await call("save_message", a, { application_id: app, kind: "OTHER", subject: "Hello", body: "Thanks for applying." });
    const id = saved.id ?? saved.messageId;
    ok(id, `no message id in ${JSON.stringify(saved).slice(0, 200)}`);
    await call("save_message", a, { message_id: id, status: "SENT" });
  });

  await check("probes, references and the share link", async () => {
    await call("save_probes", a, { application_id: app, probes: [{ question: "Which macros did you write?", why: "They claimed to write most of them." }] });
    await call("save_probes", a, { application_id: app, index: 0, asked: true, note: "About 40 macros." });
    const r = await call("request_reference", a, { application_id: app, name: "Pat Referee", relation: "Former manager" });
    ok(JSON.stringify(r).includes("/ref/"), "no reference link");
    const s = await call("share_applicant", a, { application_id: app, shared: true });
    const shareSlug = JSON.stringify(s).match(/\/s\/([A-Za-z0-9_-]+)/)?.[1];
    ok(shareSlug, `no share link in ${JSON.stringify(s).slice(0, 200)}`);
    ok(await publicData.publicShared(shareSlug), "the share link shows nothing");
    await call("share_applicant", a, { application_id: app, shared: false });
    ok(!(await publicData.publicShared(shareSlug)), "the share link still works after it was turned off");
  });

  await check("the company profile and the sample workspace", async () => {
    await call("update_company", a, { company_name: "Probe Co", about: "We make probes." });
    await call("load_sample_workspace", b, {});
    ok((await db.job.count({ where: { userId: b.id, sample: true } })) === 1, "no sample job");
    await call("wipe_sample_workspace", b, {});
    ok((await db.job.count({ where: { userId: b.id } })) === 0, "the wipe left a job behind");
  });

  await check("closing out a job is a dry run until asked", async () => {
    const dry = await call("close_out_job", a, { job_id: job.id, dry_run: true });
    ok(dry, "no dry run");
    ok((await db.job.findUnique({ where: { id: job.id } })).status !== "CLOSED", "a dry run closed the job");
    await call("move_stage", a, { application_id: app, stage: "HIRED" });
    await call("close_out_job", a, { job_id: job.id, close_job: true, move_to_rejected: true });
    ok((await db.application.findUnique({ where: { id: app } })).stage !== "REJECTED", "close-out rejected someone with an offer");
  });

  await check("every tool has a case in this probe", async () => {
    const missing = TOOLS.map((t) => t.name).filter((n) => !called.has(n));
    ok(!missing.length, `no case for ${missing.join(", ")}`);
  });

  // --- Tenant isolation -------------------------------------------------------
  // B holds a connection of their own and passes A's ids. Every one must fail.
  // Each call is one the owner could make with the same arguments, so a
  // refusal here is the workspace boundary and not a validation error.
  const upload = await db.upload.findFirst({ where: { userId: a.id } });
  const interview = await db.interview.findFirst({ where: { userId: a.id } });
  const offer = await db.offer.findFirst({ where: { userId: a.id } });
  const message = await db.message.findFirst({ where: { userId: a.id } });
  const ids = { job_id: job.id, listing_id: listing.id, form_id: form.formId, application_id: app, upload_id: upload.id, interview_id: interview.id };
  const crossings = [
    ["get_job", { job_id: ids.job_id }],
    ["update_job", { job_id: ids.job_id, title: "Taken" }],
    ["create_listing", { job_id: ids.job_id, board: "linkedin", title: "Taken", body: "x" }],
    ["get_listing", { listing_id: ids.listing_id }],
    ["update_listing", { listing_id: ids.listing_id, status: "PAUSED" }],
    ["listing_report", { job_id: ids.job_id }],
    ["set_application_form", { job_id: ids.job_id, questions: [] }],
    ["create_screening_form", { job_id: ids.job_id, questions: [{ id: "q", label: "Why?", type: "short_text" }] }],
    ["update_form", { form_id: ids.form_id, questions: [] }],
    ["get_form", { form_id: ids.form_id }],
    ["get_screening_link", { application_id: ids.application_id, form_id: screeningId }],
    ["get_application", { application_id: ids.application_id }],
    ["rank_applicants", { job_id: ids.job_id, rankings: [{ application_id: ids.application_id, tier: "C", reason: "Nothing in the application speaks to running an inbox." }] }],
    ["set_tier", { application_id: ids.application_id, tier: "C" }],
    ["read_upload", { upload_id: ids.upload_id }],
    ["add_applicant", { job_id: ids.job_id, name: "Spy", email: "spy@probe.invalid" }],
    ["import_applicants", { job_id: ids.job_id, csv: "Name,Email\nSpy,spy@probe.invalid\n", dry_run: false }],
    ["schedule_interview", { application_id: ids.application_id, title: "x" }],
    ["schedule_interview", { interview_id: ids.interview_id, title: "Taken" }],
    ["record_scorecard", { interview_id: ids.interview_id, interviewer: "Spy", recommendation: "NO" }],
    ["record_offer", { application_id: ids.application_id, title: "x" }],
    ["record_offer", { offer_id: offer.id, status: "WITHDRAWN" }],
    ["move_stage", { application_id: ids.application_id, stage: "REJECTED" }],
    ["add_note", { application_id: ids.application_id, body: "x" }],
    ["prep_message", { application_id: ids.application_id, kind: "REJECTION" }],
    ["save_message", { application_id: ids.application_id, kind: "OTHER", body: "x" }],
    ["save_message", { message_id: message.id, status: "SENT" }],
    ["save_probes", { application_id: ids.application_id, probes: [] }],
    ["request_reference", { application_id: ids.application_id, name: "Spy" }],
    ["close_out_job", { job_id: ids.job_id, dry_run: true }],
    ["share_applicant", { application_id: ids.application_id, shared: true }],
  ];
  for (const [name, args] of crossings) {
    await check(`${name} refuses another workspace's ${Object.keys(args)[0]}`, () => refuses(call(name, b, args)));
  }
  await check("another workspace's lists come back empty", async () => {
    ok((await call("list_jobs", b, {})).length === 0, "list_jobs shows A's job");
    ok((await call("list_applications", b, { job_id: job.id })).applications.length === 0, "list_applications shows A's applicants");
    ok((await call("list_interviews", b, {})).length === 0, "list_interviews shows A's rounds");
  });

  // --- Archiving ---------------------------------------------------------------
  await check("an archived application drops out of every read", async () => {
    await appsData.archiveApplication(a.id, failing.applicationId);
    ok(!(await call("list_applications", a, { job_id: job.id })).applications.some((r) => r.id === failing.applicationId), "list_applications shows it");
    await refuses(call("get_application", a, { application_id: failing.applicationId }));
    const report = JSON.stringify(await call("listing_report", a, { job_id: job.id }));
    ok(!report.includes(failing.applicationId), "listing_report names it");
  });
  await check("an archived job drops out of every read and closes its apply page", async () => {
    await jobsData.archiveJob(a.id, job.id);
    ok(!(await call("list_jobs", a, {})).some((j) => j.id === job.id), "list_jobs shows it");
    await refuses(call("get_job", a, { job_id: job.id }));
    ok((await call("list_applications", a, {})).applications.length === 0, "its applications still list");
    ok((await call("list_interviews", a, {})).length === 0, "its interviews still list");
    ok(!(await publicData.publicListing(slug)), "the apply page still opens");
  });

  // --- The transport -------------------------------------------------------------
  const rpc = async (user, body) => {
    const res = await handleMcpPost(new Request(`${BASE}/api/mcp`, { method: "POST", body: JSON.stringify(body) }), user, BASE);
    return res.json();
  };
  await check("tools/list returns every tool, and prompts/get renders every prompt", async () => {
    const init = await rpc(a, { jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "probe", version: "1" } } });
    ok(init.result?.serverInfo, "initialize returned no serverInfo");
    const listed = await rpc(a, { jsonrpc: "2.0", id: 2, method: "tools/list" });
    ok(listed.result.tools.length === TOOLS.length, `tools/list has ${listed.result.tools.length} of ${TOOLS.length}`);
    for (const p of PROMPTS) {
      const args = Object.fromEntries((p.arguments ?? []).map((x) => [x.name, "probe"]));
      const got = await rpc(a, { jsonrpc: "2.0", id: 3, method: "prompts/get", params: { name: p.name, arguments: args } });
      ok(got.result?.messages?.[0]?.content?.text, `prompt ${p.name} rendered nothing`);
    }
  });
  await check("a tool error comes back as a tool result, not a crash", async () => {
    const got = await rpc(b, { jsonrpc: "2.0", id: 4, method: "tools/call", params: { name: "get_job", arguments: { job_id: job.id } } });
    ok(got.result?.isError === true, `expected isError, got ${JSON.stringify(got).slice(0, 200)}`);
  });
} catch (error) {
  failures.push(`setup: ${error instanceof Error ? error.stack : String(error)}`);
} finally {
  await db.rateHit.deleteMany({});
  await db.user.deleteMany({ where: { id: { in: made } } });
  await db.$disconnect();
}

for (const f of failures) console.error(`FAIL ${f}`);
console.log(`${passed} passed, ${failures.length} failed`);
process.exit(failures.length ? 1 : 0);
