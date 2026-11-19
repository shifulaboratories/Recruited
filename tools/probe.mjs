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
 *   - mail goes only from a connected mailbox, to the applicant on file: the
 *     receipt once per application, a draft only through send_message, and
 *     never past the daily limit (against a fake SMTP server in this file);
 *   - an applicant's status page never says closed before they were told,
 *     and shows no tier, note, answer or contact detail;
 *   - an applicant's data comes out whole and is deleted whole, on request
 *     or when the retention period runs out, and hires are kept;
 *   - a teammate joins by a one-time invite, works in the owner's workspace,
 *     and their own connection lists and reaches only what their role does:
 *     a hiring manager their jobs, an interviewer the interviews they're on;
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
import net from "node:net";

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
const usersData = await load("data/users.ts");
const systemData = await load("data/system.ts");
const mailboxData = await load("data/mailbox.ts");
const privacyData = await load("data/privacy.ts");
const teamData = await load("data/team.ts");
const teamRules = await load("team.ts");
const connectionsData = await load("data/connections.ts");

const BASE = "http://probe.invalid";
const called = new Set();
function tool(name) {
  const found = TOOLS.find((t) => t.name === name);
  if (!found) throw new Error(`no tool called ${name}`);
  return (user, args = {}) => {
    called.add(name);
    // The owner's own seat. Teammates go through rpc below, the path a real connection takes.
    const seat = { userId: user.id, personId: user.id, role: "OWNER", jobIds: undefined, panelId: undefined };
    return found.handler(args, { userId: user.id, user, person: user, seat, baseUrl: BASE });
  };
}
/** A JSON-RPC call through the transport, as the connection of `person`. */
const rpc = async (person, body) => {
  const res = await handleMcpPost(new Request(`${BASE}/api/mcp`, { method: "POST", body: JSON.stringify(body) }), person, BASE);
  return res.json();
};
/** tools/call through the transport: what a teammate's assistant gets back. */
const rpcCall = async (person, name, args = {}) => {
  called.add(name);
  const got = await rpc(person, { jsonrpc: "2.0", id: 9, method: "tools/call", params: { name, arguments: args } });
  return { error: got.result?.isError ? got.result.content?.[0]?.text ?? "error" : null, data: got.result?.structuredContent, text: got.result?.content?.[0]?.text ?? "" };
};
const call = (name, user, args) => tool(name)(user, args);

let passed = 0;
const failures = [];
async function check(name, fn) {
  try {
    await fn();
    passed += 1;
  } catch (error) {
    failures.push(`${name}: ${error instanceof Error ? error.message : String(error)}${process.env.PROBE_STACK ? error?.stack : ""}`);
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

/**
 * Just enough of an SMTP server for nodemailer to sign in and hand over a
 * message, on a random local port. It takes the password "right-password"
 * and refuses any other, and keeps what it receives.
 */
function fakeSmtp() {
  const received = [];
  const server = net.createServer((sock) => {
    let buf = "";
    let inData = false;
    let msg = { rcpt: [], data: "" };
    const say = (line) => sock.write(`${line}\r\n`);
    say("220 probe ESMTP");
    sock.on("error", () => {});
    sock.on("data", (chunk) => {
      buf += chunk.toString("utf8");
      let i;
      while ((i = buf.indexOf("\r\n")) >= 0) {
        const line = buf.slice(0, i);
        buf = buf.slice(i + 2);
        if (inData) {
          if (line === ".") {
            inData = false;
            received.push(msg);
            msg = { rcpt: [], data: "" };
            say("250 2.0.0 queued");
          } else msg.data += `${line.startsWith("..") ? line.slice(1) : line}\n`;
          continue;
        }
        const cmd = line.slice(0, 4).toUpperCase();
        if (cmd === "EHLO") sock.write("250-probe\r\n250-AUTH PLAIN LOGIN\r\n250 8BITMIME\r\n");
        else if (cmd === "HELO") say("250 probe");
        else if (cmd === "AUTH") {
          const creds = Buffer.from(line.split(" ")[2] ?? "", "base64").toString();
          say(creds.endsWith("\0right-password") ? "235 2.7.0 Accepted" : "535 5.7.8 Username and Password not accepted");
        } else if (cmd === "MAIL") say("250 ok");
        else if (cmd === "RCPT") {
          msg.rcpt.push(line);
          say("250 ok");
        } else if (cmd === "DATA") {
          inData = true;
          say("354 go ahead");
        } else if (cmd === "QUIT") {
          say("221 bye");
          sock.end();
        } else if (cmd === "RSET" || cmd === "NOOP") say("250 ok");
        else say("502 not here");
      }
    });
  });
  return new Promise((resolve) => server.listen(0, "127.0.0.1", () => resolve({ server, port: server.address().port, received })));
}
const smtp = await fakeSmtp();
let sendable = null;

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

  await check("only the owner turns the spam check on, the secret never comes back, and it guards the apply page", async () => {
    await refuses(call("set_spam_check", b, { site_key: "1x00000000000000000000AA", secret_key: "1x0000000000000000000000000000000AA" }), /owner/);
    await db.user.update({ where: { id: a.id }, data: { role: "OWNER" } });
    const on = await call("set_spam_check", a, { site_key: "1x00000000000000000000AA", secret_key: "2x0000000000000000000000000000000AA" });
    ok(on.on === true, "it didn't turn on");
    ok(!JSON.stringify(on).includes("2x000"), "the secret came back");
    ok(!JSON.stringify(await call("set_spam_check", b, {})).includes("2x000"), "the status shows the secret");
    const before = await db.application.count({ where: { userId: a.id } });
    const noToken = await post({ ...payload("Tok Probe", `tok-${stamp}@probe.invalid`, "Yes"), files: undefined }, "192.0.2.10");
    ok(noToken.status === 400, `a post without a token got ${noToken.status}`);
    const failing = await post({ ...payload("Tok Probe", `tok-${stamp}@probe.invalid`, "Yes"), files: undefined, turnstile: "XXXX.DUMMY.TOKEN.XXXX" }, "192.0.2.11");
    ok(failing.status === 400, `a token Cloudflare rejects got ${failing.status}`);
    await call("set_spam_check", a, { site_key: "1x00000000000000000000AA", secret_key: "1x0000000000000000000000000000000AA" });
    const passing = await post({ ...payload("Tok Probe", `tok-${stamp}@probe.invalid`, "Yes"), files: undefined, turnstile: "XXXX.DUMMY.TOKEN.XXXX" }, "192.0.2.12");
    ok(passing.status === 200, `a token Cloudflare accepts got ${passing.status}`);
    ok((await db.application.count({ where: { userId: a.id } })) === before + 1, "the accepted post saved nothing");
    const off = await call("set_spam_check", a, { site_key: "", secret_key: "" });
    ok(off.on === false, "it didn't turn off");
    await db.user.update({ where: { id: a.id }, data: { role: "MEMBER" } });
  });

  await check("only the owner reads the instance's health, and caught errors show in it", async () => {
    await refuses(call("instance_health", b, {}), /owner/);
    await db.user.update({ where: { id: a.id }, data: { role: "OWNER" } });
    await systemData.recordError(`probe-${stamp}`, new Error("a probe error"));
    const h = await call("instance_health", a, {});
    ok(h.database.ok && h.database.latestMigration, "no database status");
    ok(h.errors.recent.some((e) => e.where === `probe-${stamp}` && /a probe error/.test(e.message)), "the recorded error isn't listed");
    await db.user.update({ where: { id: a.id }, data: { role: "MEMBER" } });
  });

  await check("a mailbox is saved only after it signs in, and its password never comes back", async () => {
    const box = { host: "127.0.0.1", port: smtp.port, security: "none", username: "a@probe.invalid", from_email: `hiring-${stamp}@probe.invalid`, from_name: "Probe Hiring" };
    ok((await call("set_mailbox", a, {})).connected === false, "a mailbox is connected before any was");
    await refuses(call("set_mailbox", a, { ...box, password: "wrong-password" }), /refused the username or password/);
    ok((await db.mailbox.count({ where: { userId: a.id } })) === 0, "a mailbox that failed to sign in was saved");
    const got = await call("set_mailbox", a, { ...box, password: "right-password" });
    ok(got.connected && got.verifiedAt, "it didn't connect");
    ok(!JSON.stringify(got).includes("right-password"), "the password came back");
    ok(!JSON.stringify(await call("set_mailbox", a, {})).includes("right-password"), "the status shows the password");
    await call("set_mailbox", b, { ...box, from_email: `b-${stamp}@probe.invalid`, password: "right-password" });
  });

  await check("someone who applies gets one receipt, from the person's address, saying only that it arrived", async () => {
    const before = smtp.received.length;
    const r = await publicData.submitApplication(slug, payload("Rae Probe", `rae-${stamp}@probe.invalid`, "Yes"));
    await mailboxData.sendReceipt(r.userId, r.applicationId);
    await mailboxData.sendReceipt(r.userId, r.applicationId);
    ok(smtp.received.length === before + 1, `${smtp.received.length - before} receipts went out`);
    const mail = smtp.received.at(-1);
    ok(mail.rcpt.some((l) => l.includes(`rae-${stamp}@probe.invalid`)), "the receipt went to someone else");
    ok(mail.data.includes(`hiring-${stamp}@probe.invalid`), "the receipt isn't from the person's address");
    const row = await db.message.findFirst({ where: { applicationId: r.applicationId, kind: "RECEIPT" } });
    ok(row?.status === "SENT" && row.sentVia === "mailbox", `the receipt is ${row?.status} via ${row?.sentVia}`);
    ok(/Hi Rae,/.test(row.body) && /Operations Virtual Assistant/.test(row.body), "the receipt's placeholders weren't filled");
    const app = await db.application.findUnique({ where: { id: r.applicationId } });
    ok(row.body.includes(`${BASE}/status/${app.screenToken}`), "the receipt has no status link");
  });

  await check("an applicant's status page shows only what they've been told, and nothing private", async () => {
    const r = await publicData.submitApplication(slug, payload("Ida Probe", `ida-${stamp}@probe.invalid`, "Yes"));
    const token = (await db.application.findUnique({ where: { id: r.applicationId } })).screenToken;
    const view = await publicData.publicApplicantStatus(token);
    ok(view.status === "received" && view.firstName === "Ida", `a new application shows ${view.status}`);
    await call("set_tier", a, { application_id: r.applicationId, tier: "C" });
    await call("add_note", a, { application_id: r.applicationId, body: "private-note-probe" });
    await call("move_stage", a, { application_id: r.applicationId, stage: "REJECTED" });
    const before = await publicData.publicApplicantStatus(token);
    ok(before.status === "in_review", `rejected but not told shows ${before.status}`);
    const text = JSON.stringify(before);
    ok(!/private-note-probe|"tier"|"C"|@probe\.invalid|PASTED|stage/.test(text), `the status page leaks: ${text.slice(0, 200)}`);
    await call("save_message", a, { application_id: r.applicationId, kind: "REJECTION", body: "Thank you, we're not moving forward.", status: "SENT" });
    ok((await publicData.publicApplicantStatus(token)).status === "closed", "a sent rejection doesn't close the page");
    ok((await publicData.publicApplicantStatus("scr_nobody")) === null, "an unknown token opens a page");
    await appsData.archiveApplication(a.id, r.applicationId);
    ok((await publicData.publicApplicantStatus(token)) === null, "an archived application's page still opens");
  });

  await check("with receipts off, someone who applies gets nothing", async () => {
    await call("set_mailbox", a, { receipt_on: false });
    const before = smtp.received.length;
    const r = await publicData.submitApplication(slug, payload("Sol Probe", `sol-${stamp}@probe.invalid`, "Yes"));
    ok((await mailboxData.sendReceipt(r.userId, r.applicationId)) === null, "a receipt was made");
    ok(smtp.received.length === before, "a receipt went out with receipts off");
    await call("set_mailbox", a, { receipt_on: true });
  });

  await check("a draft goes out once, through send_message, to the applicant on file", async () => {
    const draft = await call("save_message", a, { application_id: passing.applicationId, kind: "OTHER", subject: "Next step", body: "Hi Ana, a quick question." });
    const before = smtp.received.length;
    const sent = await call("send_message", a, { message_id: draft.id });
    ok(sent.status === "SENT" && sent.sentVia === "mailbox", `send_message left it ${sent.status}`);
    ok(smtp.received.length === before + 1, "nothing reached the mail server");
    ok(smtp.received.at(-1).rcpt.some((l) => l.includes(`ana-${stamp}@probe.invalid`)), "it went to someone else");
    await refuses(call("send_message", a, { message_id: draft.id }), /already sent/);
  });

  await check("a mail server that refuses leaves the draft a draft, with the reason", async () => {
    const draft = await call("save_message", a, { application_id: passing.applicationId, kind: "OTHER", body: "Hi Ana." });
    await db.mailbox.update({ where: { userId: a.id }, data: { password: "wrong-password" } });
    await refuses(call("send_message", a, { message_id: draft.id }), /Not sent/);
    const row = await db.message.findUnique({ where: { id: draft.id } });
    ok(row.status === "DRAFT" && row.sendError, `the failed draft is ${row.status} with "${row.sendError}"`);
    await db.mailbox.update({ where: { userId: a.id }, data: { password: "right-password" } });
  });

  await check("nothing goes past the daily limit, and nothing goes without a mailbox", async () => {
    const draft = await call("save_message", a, { application_id: passing.applicationId, kind: "OTHER", body: "Hi Ana, again." });
    const sentAt = new Date();
    await db.message.createMany({
      data: Array.from({ length: mailboxData.DAILY_LIMIT }, () => ({ userId: a.id, applicationId: passing.applicationId, kind: "OTHER", status: "SENT", body: "filler", sentVia: "mailbox", sentAt })),
    });
    await refuses(call("send_message", a, { message_id: draft.id }), /in the last 24 hours/);
    await db.message.deleteMany({ where: { userId: a.id, body: "filler" } });
    await call("set_mailbox", a, { disconnect: true });
    await refuses(call("send_message", a, { message_id: draft.id }), /No mailbox/);
    ok((await db.message.findUnique({ where: { id: draft.id } })).status === "DRAFT", "a refused send changed the draft");
    // Connected again, so the crossing below is refused by the workspace
    // boundary and not by a missing mailbox: A could send this draft.
    await call("set_mailbox", a, { host: "127.0.0.1", port: smtp.port, security: "none", username: "a@probe.invalid", password: "right-password", from_email: `hiring-${stamp}@probe.invalid` });
    sendable = draft.id;
  });

  await check("the apply form states the workspace's own retention and contact, and bad settings are refused", async () => {
    const set = await call("update_company", a, { retention_months: 6, privacy_email: `privacy-${stamp}@probe.invalid` });
    ok(set.retentionMonths === 6 && set.privacyEmail === `privacy-${stamp}@probe.invalid`, `saved ${JSON.stringify(set)}`);
    const notice = (await publicData.publicListing(slug)).privacyNotice;
    ok(/6 months/.test(notice) && notice.includes(`privacy-${stamp}@probe.invalid`), `the form says: ${notice}`);
    await refuses(call("update_company", a, { retention_months: -1 }), /0 \(keep until deleted\)/);
    await refuses(call("update_company", a, { privacy_email: "not an address" }), /email address/);
    await call("update_company", a, { retention_months: 12, privacy_email: "" });
  });

  await check("an applicant's export holds everything about them, archived applications too, and no one else", async () => {
    const extra = await call("create_job", a, { title: "Export Probe Role", status: "OPEN" });
    const second = await call("add_applicant", a, { job_id: extra.id, name: "Ana Probe", email: `ana-${stamp}@probe.invalid` });
    await appsData.archiveApplication(a.id, second.id ?? second.applicationId);
    await call("add_note", a, { application_id: passing.applicationId, body: "export-note-probe" });
    const got = await call("export_applicant_data", a, { email: `ANA-${stamp}@probe.invalid` });
    ok(got.person.email === `ana-${stamp}@probe.invalid`, "the export is someone else's");
    ok(got.applications.length >= 2 && got.applications.some((x) => x.archived), `${got.applications.length} applications, archived one missing`);
    const text = JSON.stringify(got);
    ok(text.includes("Zendesk") && text.includes("export-note-probe") && text.includes("desk.png"), "answers, notes or files are missing");
    ok(!text.includes(`ben-${stamp}`), "another applicant is in the export");
    await refuses(call("export_applicant_data", b, { email: `ana-${stamp}@probe.invalid` }), /Nobody with that email/);
    await jobsData.archiveJob(a.id, extra.id);
  });

  await check("deleting an applicant's data is a dry run until asked, then takes everything", async () => {
    const r = await publicData.submitApplication(slug, payload("Del Probe", `del-${stamp}@probe.invalid`, "Yes"));
    const dry = await call("delete_applicant_data", a, { application_id: r.applicationId });
    ok(dry.dryRun === true && dry.wouldDelete.name === "Del Probe", "the default isn't a dry run");
    ok(await db.application.findUnique({ where: { id: r.applicationId } }), "a dry run deleted the application");
    const uploadsBefore = await db.upload.count({ where: { userId: a.id } });
    await call("delete_applicant_data", a, { email: `del-${stamp}@probe.invalid`, dry_run: false });
    ok(!(await db.application.findUnique({ where: { id: r.applicationId } })), "the application survived");
    ok(!(await db.candidate.findFirst({ where: { userId: a.id, email: `del-${stamp}@probe.invalid` } })), "the person survived");
    ok((await db.upload.count({ where: { userId: a.id } })) === uploadsBefore - 1, "their file survived");
  });

  await check("retention deletes applications from long-closed jobs, keeps hires, and warns first", async () => {
    const old = await call("create_job", a, { title: "Retention Probe Role", status: "OPEN" });
    const gone = await call("add_applicant", a, { job_id: old.id, name: "Old Probe", email: `old-${stamp}@probe.invalid` });
    const hired = await call("add_applicant", a, { job_id: old.id, name: "Hire Probe", email: `hire-${stamp}@probe.invalid` });
    const goneId = gone.id ?? gone.applicationId;
    const hiredId = hired.id ?? hired.applicationId;
    await call("move_stage", a, { application_id: hiredId, stage: "HIRED" });
    await call("update_job", a, { job_id: old.id, status: "CLOSED" });
    ok((await db.job.findUnique({ where: { id: old.id } })).closedAt, "closing the job didn't start the clock");
    await db.job.update({ where: { id: old.id }, data: { closedAt: new Date(Date.now() - 350 * 86400_000) } });
    const brief = await call("daily_brief", a, {});
    ok(brief.deletedWithin30Days?.count >= 1, "the brief doesn't warn before deleting");
    await privacyData.retentionSweep();
    ok(await db.application.findUnique({ where: { id: goneId } }), "the sweep deleted early");
    await db.job.update({ where: { id: old.id }, data: { closedAt: new Date(Date.now() - 400 * 86400_000) } });
    await privacyData.retentionSweep();
    ok(!(await db.application.findUnique({ where: { id: goneId } })), "an application past retention survived");
    ok(!(await db.candidate.findFirst({ where: { userId: a.id, email: `old-${stamp}@probe.invalid` } })), "their person survived");
    ok(await db.application.findUnique({ where: { id: hiredId } }), "the sweep deleted a hire");
    await call("update_job", a, { job_id: old.id, status: "OPEN" });
    ok((await db.job.findUnique({ where: { id: old.id } })).closedAt === null, "reopening didn't stop the clock");
    await jobsData.archiveJob(a.id, old.id);
  });

  await check("an interviewer's link writes one scorecard, shows no one else's, and dies with the application", async () => {
    const iv = await db.interview.findFirst({ where: { userId: a.id, application: { archivedAt: null } } });
    await call("record_scorecard", a, { interview_id: iv.id, interviewer: "Probe Lead", recommendation: "STRONG_NO", summary: "secret-verdict-probe" });
    const got = await call("get_scorecard_link", a, { interview_id: iv.id, interviewer: "Ana Panel" });
    const again = await call("get_scorecard_link", a, { interview_id: iv.id, interviewer: "Ana Panel" });
    ok(got.link === again.link, "asking twice minted a second link");
    const token = got.link.split("/score/")[1];
    const page = await publicData.publicScorecard(token);
    ok(page && page.interviewer === "Ana Panel" && !page.done, "the page didn't open");
    ok(!/secret-verdict-probe|STRONG_NO|PASTED|@probe\.invalid/.test(JSON.stringify(page)), "the page shows another verdict or private data");
    await refuses(publicData.submitScorecard(token, { recommendation: "YES", summary: "" }), /another look/);
    await publicData.submitScorecard(token, { recommendation: "YES", summary: "Clear on reconciliations.", ratings: [{ criterion: "Excel", score: 4 }] });
    const card = await db.scorecard.findFirst({ where: { interviewId: iv.id, interviewer: "Ana Panel" } });
    ok(card?.writtenBy === "link" && card.recommendation === "YES", "the scorecard wasn't saved from the link");
    await refuses(publicData.submitScorecard(token, { recommendation: "NO", summary: "Changed my mind." }), /already in/);
    ok((await db.scorecard.count({ where: { interviewId: iv.id, interviewer: "Ana Panel" } })) === 1, "a second post wrote a second card");
    ok((await publicData.publicScorecard(token)).done === true, "the page doesn't say it's done");
    ok((await publicData.publicScorecard("sc_nobody")) === null, "an unknown token opens a page");
  });

  await check("the careers page lists only open jobs with a live careers listing, and only that apply page is indexable", async () => {
    const set = await call("update_company", a, { careers_slug: `probe-${stamp}` });
    ok(set.careersUrl === `${BASE}/careers/probe-${stamp}`, `careersUrl is ${set.careersUrl}`);
    await refuses(call("update_company", b, { careers_slug: `probe-${stamp}` }), /Another workspace/);
    await refuses(call("update_company", b, { careers_slug: "Not A Slug" }), /lowercase/);
    const open = await call("create_job", a, { title: "Careers Probe Role", status: "OPEN", workplace: "remote", location: "Philippines" });
    const draftJob = await call("create_job", a, { title: "Careers Draft Role" });
    const live = await call("create_listing", a, { job_id: open.id, board: "careers", title: "Careers Probe Role", body: "Do the work." });
    await call("create_listing", a, { job_id: draftJob.id, board: "careers", title: "Careers Draft Role", body: "x" });
    ok((await publicData.publicCareers(`probe-${stamp}`)).jobs.length === 0, "a DRAFT careers listing shows");
    await call("update_listing", a, { listing_id: live.id, status: "LIVE" });
    const page = await publicData.publicCareers(`probe-${stamp}`);
    ok(page.jobs.length === 1 && page.jobs[0].title === "Careers Probe Role", `careers lists ${JSON.stringify(page.jobs.map((j) => j.title))}`);
    ok((await publicData.publicListing(live.applyUrl.split("/").pop())).indexable === true, "the live careers listing isn't indexable");
    ok((await publicData.publicListing(slug)).indexable === false, "an onlinejobs_ph apply link is indexable");
    await jobsData.archiveJob(a.id, open.id);
    ok((await publicData.publicCareers(`probe-${stamp}`)).jobs.length === 0, "an archived job still shows on the careers page");
    await jobsData.archiveJob(a.id, draftJob.id);
    await call("update_company", a, { careers_slug: "" });
    ok((await publicData.publicCareers(`probe-${stamp}`)) === null, "the careers page outlived its slug");
  });

  await check("a reset link works once, for its own account, and signs every browser out", async () => {
    const got = await call("get_password_reset_link", b, {});
    ok(got.account === b.email, "the link is for another account");
    const token = got.url.split("/reset/")[1];
    await db.session.create({ data: { token: `sess-${stamp}`, userId: b.id, expiresAt: new Date(Date.now() + 86400_000) } });
    await refuses(usersData.resetPassword(token, "short"), /10 characters/);
    ok(await usersData.resetIsUsable(token), "a refused password spent the link");
    await usersData.resetPassword(token, "a-long-new-password");
    ok(await usersData.userByLogin(b.email, "a-long-new-password"), "the new password doesn't sign in");
    ok((await db.session.count({ where: { userId: b.id } })) === 0, "a session survived the reset");
    await refuses(usersData.resetPassword(token, "another-long-password"), /expired or was already used/);
    const aBefore = (await db.user.findUnique({ where: { id: a.id } })).passwordHash;
    ok(aBefore === "x", "another account's password changed");
    ok((await db.passwordReset.findFirst({ where: { tokenHash: token } })) === null, "the raw token is stored");
  });
  await check("an expired reset link is refused, and an unknown email mints nothing", async () => {
    const { token } = await usersData.resetLinkFor(a.id);
    await db.passwordReset.updateMany({ where: { userId: a.id }, data: { expiresAt: new Date(Date.now() - 1000) } });
    ok(!(await usersData.resetIsUsable(token)), "an expired link shows as usable");
    await refuses(usersData.resetPassword(token, "a-long-new-password"), /expired/);
    ok((await usersData.resetLinkForEmail(`nobody-${stamp}@probe.invalid`)) === null, "a link for nobody");
  });

  await check("closing out a job is a dry run until asked", async () => {
    const dry = await call("close_out_job", a, { job_id: job.id, dry_run: true });
    ok(dry, "no dry run");
    ok((await db.job.findUnique({ where: { id: job.id } })).status !== "CLOSED", "a dry run closed the job");
    await call("move_stage", a, { application_id: app, stage: "HIRED" });
    await call("close_out_job", a, { job_id: job.id, close_job: true, move_to_rejected: true });
    ok((await db.application.findUnique({ where: { id: app } })).stage !== "REJECTED", "close-out rejected someone with an offer");
  });

  // --- Teams -------------------------------------------------------------------
  // Teammates are real accounts made through invites, and every call they make
  // goes through the transport, where the role is enforced.
  const join = async (role, extra = {}) => {
    const inv = await call("invite_teammate", a, { email: `${role.toLowerCase()}-${stamp}@probe.invalid`, name: `Probe ${role}`, role, ...extra });
    const token = inv.link.split("/join/")[1];
    const { userId } = await teamData.acceptInvite(token, { name: `Probe ${role}`, password: "a-long-password" });
    made.push(userId);
    return { person: await db.user.findUnique({ where: { id: userId } }), token };
  };
  const job2 = await call("create_job", a, { title: "Probe Second Job", status: "OPEN" });
  const app2 = (await call("add_applicant", a, { job_id: job2.id, name: "Eve Probe", email: `eve-${stamp}@probe.invalid` })).applicationId;
  let rec = null;
  let hm = null;
  let iv = null;

  await check("an invite works once, for a new address, and seats the teammate in the owner's workspace", async () => {
    await refuses(call("invite_teammate", a, { email: a.email, role: "RECRUITER" }), /already has an account/);
    await refuses(call("invite_teammate", a, { email: `x-${stamp}@probe.invalid`, role: "HIRING_MANAGER" }), /at least one/);
    await refuses(call("invite_teammate", a, { email: `x-${stamp}@probe.invalid`, role: "OWNER" }), /one owner/);
    const joined = await join("RECRUITER");
    rec = joined.person;
    await refuses(teamData.acceptInvite(joined.token, { name: "Again", password: "a-long-password" }), /expired or was already used/);
    const seat = await teamData.seatFor(rec);
    ok(seat.userId === a.id && seat.role === "RECRUITER" && seat.personId === rec.id, "the recruiter isn't seated in A's workspace");
    const team = await call("list_team", a, {});
    ok(team.members.some((m) => m.id === rec.id && m.role === "RECRUITER"), "list_team doesn't show the recruiter");
    ok(!/passwordHash|tokenHash/.test(JSON.stringify(team)), "list_team leaks a secret");
  });

  await check("a recruiter's own connection reaches the whole workspace, but not the team or the company settings", async () => {
    const conn = await connectionsData.createConnection(rec.id);
    const found = await connectionsData.userByConnectionToken(conn.token);
    ok(found.user.id === rec.id, "the recruiter's token resolves to someone else");
    const listed = (await rpc(found.user, { jsonrpc: "2.0", id: 1, method: "tools/list" })).result.tools.map((t) => t.name);
    ok(listed.includes("send_message") && !listed.includes("invite_teammate") && !listed.includes("update_company"), "the recruiter's tools/list is wrong");
    const jobs = await rpcCall(rec, "list_jobs");
    ok(!jobs.error && jobs.data.items.some((j) => j.id === job.id), "the recruiter can't see A's jobs");
    ok((await rpcCall(rec, "update_company", { company_name: "Taken" })).error, "a recruiter changed the company");
    ok((await rpcCall(rec, "invite_teammate", { email: `y-${stamp}@probe.invalid`, role: "RECRUITER" })).error, "a recruiter invited someone");
    const reset = await rpcCall(rec, "get_password_reset_link");
    ok(reset.data?.account === rec.email, "the reset link is for someone other than the recruiter");
  });

  await check("a hiring manager lists, reads and moves only the jobs they were given", async () => {
    hm = (await join("HIRING_MANAGER", { job_ids: [job2.id] })).person;
    const listed = (await rpc(hm, { jsonrpc: "2.0", id: 1, method: "tools/list" })).result.tools.map((t) => t.name);
    ok(listed.length === teamRules.SCOPED_TOOLS.HIRING_MANAGER.length, `a hiring manager sees ${listed.length} tools`);
    const prompts = (await rpc(hm, { jsonrpc: "2.0", id: 1, method: "prompts/list" })).result.prompts;
    ok(prompts.length === 0, "a hiring manager sees prompts built on tools they don't have");
    const jobs = (await rpcCall(hm, "list_jobs")).data.items;
    ok(jobs.length === 1 && jobs[0].id === job2.id, "list_jobs shows a job they weren't given");
    const listedApps = await rpcCall(hm, "list_applications");
    ok(!listedApps.error, `list_applications failed: ${listedApps.error}`);
    const apps = listedApps.data.applications;
    ok(apps.length === 1 && apps[0].id === app2, "list_applications shows another job's applicants");
    ok((await rpcCall(hm, "list_applications", { job_id: job.id })).error, "filtering by another job was allowed");
    ok(/access/.test((await rpcCall(hm, "get_application", { application_id: app })).error ?? ""), "they read an applicant on another job");
    ok((await rpcCall(hm, "get_job", { job_id: job.id })).error, "they read another job");
    ok((await rpcCall(hm, "read_upload", { upload_id: (await db.upload.findFirst({ where: { userId: a.id } })).id })).error, "they opened a file on another job");
    ok((await rpcCall(hm, "move_stage", { application_id: app, stage: "REJECTED" })).error, "they moved an applicant on another job");
    ok(/isn't available/.test((await rpcCall(hm, "prep_message", { application_id: app2, kind: "OTHER" })).error ?? ""), "they reached a messaging tool");
    ok(!(await rpcCall(hm, "get_application", { application_id: app2 })).error, "they can't read their own job's applicant");
    ok(!(await rpcCall(hm, "move_stage", { application_id: app2, stage: "SCREEN" })).error, "they can't move their own job's applicant");
  });

  await check("an interviewer sees only interviews they're on, no one's verdict, and writes only their own card", async () => {
    iv = (await join("INTERVIEWER")).person;
    await refuses(call("schedule_interview", a, { application_id: app2, title: "Panel", member_ids: [b.id] }), /isn't on this workspace's team/);
    const round = await call("schedule_interview", a, { application_id: app2, title: "Panel with the team", member_ids: [iv.id, hm.id] });
    await call("record_scorecard", a, { interview_id: round.id, interviewer: "Probe Lead", recommendation: "STRONG_NO", summary: "hidden-verdict-probe" });
    await call("set_tier", a, { application_id: app2, tier: "A" });
    await call("add_note", a, { application_id: app2, body: "hidden-note-probe" });
    const mine = (await rpcCall(iv, "list_interviews")).data.items;
    ok(mine.length === 1 && mine[0].id === round.id, `list_interviews shows ${mine.length} interviews`);
    const seen = await rpcCall(iv, "get_application", { application_id: app2 });
    ok(!seen.error, `they can't read the applicant: ${seen.error}`);
    ok(!/hidden-verdict-probe|hidden-note-probe|eve-.*@probe\.invalid|"tier"/.test(seen.text), "the interviewer sees a verdict, a note, a tier or the email");
    ok((await rpcCall(iv, "get_application", { application_id: app })).error, "they read an applicant they aren't interviewing");
    const other = await db.interview.findFirst({ where: { userId: a.id, NOT: { id: round.id } } });
    ok((await rpcCall(iv, "record_scorecard", { interview_id: other.id, interviewer: "x", recommendation: "YES" })).error, "they scored an interview they aren't on");
    const card = await rpcCall(iv, "record_scorecard", { interview_id: round.id, interviewer: "Someone Else", recommendation: "YES", summary: "Clear thinker." });
    ok(!card.error, `their own card was refused: ${card.error}`);
    ok((await db.scorecard.findUnique({ where: { id: card.data.id } })).interviewer === "Probe INTERVIEWER", "the card went in under another name");
    ok((await rpcCall(iv, "list_jobs")).error, "an interviewer reached list_jobs");
  });

  await check("the owner changes a role, withdraws an invite and removes a teammate, whose connection then stops", async () => {
    const changed = await call("update_teammate", a, { teammate_id: hm.id, role: "RECRUITER" });
    ok(changed.role === "RECRUITER" && changed.jobIds.length === 0, "the role didn't change");
    ok((await rpcCall(hm, "list_jobs")).data.items.length >= 2, "a promoted teammate still sees only one job");
    await refuses(call("update_teammate", a, { teammate_id: a.id, remove: true }), /owner/);
    const inv = await call("invite_teammate", a, { email: `later-${stamp}@probe.invalid`, role: "INTERVIEWER" });
    const open = (await call("list_team", a, {})).invites.find((i) => i.email === `later-${stamp}@probe.invalid`);
    await call("update_teammate", a, { invite_id: open.id });
    ok(!(await teamData.inviteByToken(inv.link.split("/join/")[1])), "a withdrawn invite still opens");
    const conn = await connectionsData.createConnection(iv.id);
    await call("update_teammate", a, { teammate_id: iv.id, remove: true });
    ok(!(await db.user.findUnique({ where: { id: iv.id } })), "the removed teammate's account is still there");
    ok(!(await connectionsData.userByConnectionToken(conn.token)), "the removed teammate's connection still works");
  });

  await check("every tool a role list names exists", async () => {
    const names = new Set(TOOLS.map((t) => t.name));
    const named = [...teamRules.OWNER_TOOLS, ...teamRules.SCOPED_TOOLS.HIRING_MANAGER, ...teamRules.SCOPED_TOOLS.INTERVIEWER];
    const unknown = named.filter((n) => !names.has(n));
    ok(!unknown.length, `src/lib/team.ts names tools that don't exist: ${unknown.join(", ")}`);
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
    ["get_scorecard_link", { interview_id: ids.interview_id, interviewer: "Spy" }],
    ["record_offer", { application_id: ids.application_id, title: "x" }],
    ["record_offer", { offer_id: offer.id, status: "WITHDRAWN" }],
    ["move_stage", { application_id: ids.application_id, stage: "REJECTED" }],
    ["add_note", { application_id: ids.application_id, body: "x" }],
    ["prep_message", { application_id: ids.application_id, kind: "REJECTION" }],
    ["save_message", { application_id: ids.application_id, kind: "OTHER", body: "x" }],
    ["save_message", { message_id: message.id, status: "SENT" }],
    ["send_message", { message_id: sendable }],
    ["export_applicant_data", { application_id: ids.application_id }],
    ["delete_applicant_data", { application_id: ids.application_id }],
    ["save_probes", { application_id: ids.application_id, probes: [] }],
    ["request_reference", { application_id: ids.application_id, name: "Spy" }],
    ["close_out_job", { job_id: ids.job_id, dry_run: true }],
    ["share_applicant", { application_id: ids.application_id, shared: true }],
    ["update_teammate", { teammate_id: rec.id, role: "INTERVIEWER" }],
    ["update_teammate", { teammate_id: rec.id, remove: true }],
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
    ok(!(await call("list_applications", a, {})).applications.some((r) => r.jobId === job.id), "its applications still list");
    ok(!(await call("list_interviews", a, {})).some((i) => i.job.id === job.id), "its interviews still list");
    ok(!(await publicData.publicListing(slug)), "the apply page still opens");
  });

  // --- The transport -------------------------------------------------------------
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
  await db.errorEvent.deleteMany({ where: { where: { startsWith: "probe-" } } });
  await db.setting.deleteMany({ where: { key: { startsWith: "turnstile." } } });
  await db.user.deleteMany({ where: { id: { in: made } } });
  await db.$disconnect();
  smtp.server.close();
}

for (const f of failures) console.error(`FAIL ${f}`);
console.log(`${passed} passed, ${failures.length} failed`);
process.exit(failures.length ? 1 : 0);
