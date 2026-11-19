import type { JobStatus, ListingStatus, Stage, Tier, User } from "@prisma/client";
import * as jobs from "@/lib/data/jobs";
import * as listings from "@/lib/data/listings";
import * as forms from "@/lib/data/forms";
import * as applications from "@/lib/data/applications";
import * as uploads from "@/lib/data/uploads";
import * as messages from "@/lib/data/messages";
import * as imports from "@/lib/data/imports";
import * as interviews from "@/lib/data/interviews";
import * as probes from "@/lib/data/probes";
import * as references from "@/lib/data/references";
import * as share from "@/lib/data/share";
import * as brief from "@/lib/data/brief";
import * as closeout from "@/lib/data/closeout";
import * as sample from "@/lib/data/sample";
import * as users from "@/lib/data/users";
import * as settings from "@/lib/data/settings";
import * as system from "@/lib/data/system";
import { UserError } from "@/lib/data/errors";
import { careersPath } from "@/lib/data/public";
import { BOARDS, BOARD_KEYS, boardByKey } from "@/lib/boards";
import { QUESTION_TYPES } from "@/lib/forms";
import { MESSAGE_KINDS } from "@/lib/messages";
import { IMPORT_FIELDS, type ImportField } from "@/lib/csv";
import { INTERVIEW_FORMATS, OFFER_STATUSES, PAY_PERIODS, RECOMMENDATIONS } from "@/lib/scorecards";

/**
 * Every tool and prompt, in one array each. The description IS the interface:
 * it says when to reach for the tool, what comes back, and what it overwrites.
 *
 * Every handler receives ctx.userId from the connection token and passes it
 * as the first argument of every data call, so a connection can only reach
 * its own workspace.
 */

type Json = Record<string, unknown>;

export type McpContext = { userId: string; user: User; baseUrl: string };

export type McpTool = {
  name: string;
  title: string;
  description: string;
  inputSchema: Json;
  annotations: { readOnlyHint: boolean; destructiveHint: boolean; idempotentHint: boolean; openWorldHint: boolean };
  handler: (args: Json, ctx: McpContext) => Promise<unknown>;
};

// ---------------------------------------------------------------------------
// Schema helpers
// ---------------------------------------------------------------------------

const str = (description: string, extra: Json = {}) => ({ type: "string", description, ...extra });
const num = (description: string, extra: Json = {}) => ({ type: "number", description, ...extra });
const bool = (description: string) => ({ type: "boolean", description });
const oneOf = (values: readonly string[], description: string) => ({ type: "string", enum: values, description });
const object = (properties: Json, required: string[] = []) => ({ type: "object", properties, required, additionalProperties: false });

const READ = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false };
const ADD = { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false };
const SET = { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false };
const REPLACE = { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false };

function s(args: Json, key: string): string | undefined {
  const v = args[key];
  if (v === undefined || v === null) return undefined;
  if (typeof v !== "string") throw new UserError(`${key} must be text.`);
  return v;
}
function need(args: Json, key: string): string {
  const v = s(args, key);
  if (!v?.trim()) throw new UserError(`${key} is required.`);
  return v;
}
function n(args: Json, key: string): number | undefined {
  const v = args[key];
  if (v === undefined || v === null) return undefined;
  const x = Number(v);
  if (!Number.isFinite(x)) throw new UserError(`${key} must be a number.`);
  return x;
}

const STAGE_VALUES = ["NEW", "SCREEN", "INTERVIEW", "OFFER", "HIRED", "REJECTED"] as const;
const LISTING_STATUS = ["DRAFT", "LIVE", "PAUSED", "CLOSED"] as const;
const JOB_STATUS = ["DRAFT", "OPEN", "CLOSED"] as const;
const TIER_VALUES = ["A", "B", "C"] as const;

/** The default meaning of a tier, used when a job has no rubric of its own. */
const TIER_MEANING =
  "A: meets every must-have and the answers show they've done this work; worth a call this week. " +
  "B: plausible, but evidence is thin or one thing is missing; call if the A's run out. " +
  "C: misses a must-have, or nothing in the application speaks to the job.";

const QUESTION_SCHEMA = {
  type: "array",
  description:
    "The questions, in order. Name and email are asked on every application form already; don't add them. Each: " +
    "{ id: lowercase_with_underscores, label, type, required?, help?, options? (choice types), knockout?, maxWords? }. " +
    "knockout marks a must-have: { accept: [answers that pass] } for yes_no and single_choice, { min, max } for number. " +
    "Missing a knockout marks the applicant as not meeting the must-haves; it never rejects them automatically. " +
    "short_text and long_text answers are recorded for provenance (typed, pasted, likely AI), so ask open questions in those types. " +
    "file takes one attachment up to 10 MB; accept is image, pdf or image_or_pdf (default). Use it for a work-setup photo, a speed-test or typing-test screenshot, a portfolio PDF; say in help exactly what the picture should show. " +
    "task is a work sample: brief (markdown, the scenario and what to hand in, with every fact they need) and minutes (how long it should take, shown to them); the answer is written and recorded like long_text. " +
    "video is a short answer on camera, recorded in the browser (or a file they attach), up to maxSeconds (15 to 300, default 90). Use it for a hello or a spoken-English check, and make it optional unless speaking is the job.",
  items: {
    type: "object",
    properties: {
      id: { type: "string" },
      label: { type: "string" },
      type: { type: "string", enum: QUESTION_TYPES },
      required: { type: "boolean" },
      help: { type: "string" },
      options: { type: "array", items: { type: "string" } },
      knockout: { type: "object", properties: { accept: { type: "array", items: { type: "string" } }, min: { type: "number" }, max: { type: "number" } } },
      maxWords: { type: "number" },
      accept: { type: "string", enum: ["image", "pdf", "image_or_pdf"] },
      brief: { type: "string", description: "task only: the scenario, markdown." },
      minutes: { type: "number", description: "task only: how long it should take." },
      maxSeconds: { type: "number", description: "video only: the recording limit in seconds." },
    },
    required: ["id", "label", "type"],
  },
};

const JOB_FIELDS = {
  title: str("The job title as a person would search for it: 'Operations Virtual Assistant', not 'Ops Ninja'."),
  team: str("Team or department."),
  location: str("City and country, or the regions a remote hire may live in."),
  workplace: oneOf(jobs.WORKPLACES, "remote, hybrid or onsite."),
  employment_type: oneOf(jobs.EMPLOYMENT_TYPES, "Employment type."),
  salary_min: num("Bottom of the pay range, a whole number in salary_currency."),
  salary_max: num("Top of the pay range."),
  salary_currency: str("ISO code: USD, PHP, EUR…"),
  salary_period: oneOf(jobs.SALARY_PERIODS, "What the range is per: hour, month or year."),
  description: str(
    "Markdown: headings, bullets, **bold**, links. The canonical description every listing is adapted from: what they'll do, what they need, pay and how you work.",
  ),
  rubric: str(
    "What makes an A, B or C applicant for this role, in the person's own words: 'A has run a support inbox solo and writes clear, warm replies'. rank_applicants follows it. Ask for it rather than inventing one.",
  ),
  after_apply: str(
    "What happens after someone applies, one step per line, up to six: 'We reply within three working days', 'A 30-minute written task', 'A call with the founder'. Shown on the thank-you screen. Only steps the person has told you; ask rather than invent a timeline.",
  ),
};

function jobInput(args: Json): jobs.JobInput {
  return {
    title: s(args, "title"),
    team: s(args, "team"),
    location: s(args, "location"),
    workplace: s(args, "workplace"),
    employmentType: s(args, "employment_type"),
    salaryMin: n(args, "salary_min"),
    salaryMax: n(args, "salary_max"),
    salaryCurrency: s(args, "salary_currency"),
    salaryPeriod: s(args, "salary_period"),
    description: s(args, "description"),
    rubric: s(args, "rubric"),
    afterApply: s(args, "after_apply"),
    status: s(args, "status") as JobStatus | undefined,
  };
}

function withUrls(ctx: McpContext, l: { slug: string }) {
  return `${ctx.baseUrl}${listings.applyPath(l.slug)}`;
}

// ---------------------------------------------------------------------------
// Tools
// ---------------------------------------------------------------------------

export const TOOLS: McpTool[] = [
  {
    name: "get_board_guide",
    title: "Board guide",
    description:
      "How to write a listing for a specific job board: field order, length limits, how pay is stated, what gets a listing rejected, what makes it do well, and where the apply link goes. " +
      "Call this BEFORE writing a listing for a board, every time; the rules differ more than you'd expect (OnlineJobs.ph wants pay out of the description, Upwork forbids external apply links). " +
      `Boards: ${BOARD_KEYS.join(", ")}. Leave board out to list them all with a one-line summary.`,
    inputSchema: object({ board: oneOf(BOARD_KEYS, "The board to read. Leave out for the list.") }),
    annotations: READ,
    handler: async (args) => {
      const key = s(args, "board");
      if (!key) return { boards: BOARDS.map((b) => ({ board: b.key, name: b.name, format: b.format, audience: b.audience })) };
      const b = boardByKey(key);
      if (!b) throw new UserError(`board is one of ${BOARD_KEYS.join(", ")}.`);
      return b;
    },
  },
  {
    name: "list_jobs",
    title: "List jobs",
    description:
      "Every role in this workspace with its status, listings and how many applicants sit in each stage. Start here when the person mentions a role by name, to get its id.",
    inputSchema: object({ status: oneOf(JOB_STATUS, "Only jobs in this status.") }),
    annotations: READ,
    handler: async (args, ctx) =>
      (await jobs.listJobs(ctx.userId, { status: s(args, "status") as JobStatus | undefined })).map((j) => ({
        id: j.id,
        title: j.title,
        status: j.status,
        pay: jobs.formatPay(j),
        applicants: j.applicants,
        stages: j.stages,
        listings: j.listings.map((l) => `${l.board} ${l.variant} (${l.status.toLowerCase()})`),
      })),
  },
  {
    name: "get_job",
    title: "Get a job",
    description:
      "One role whole: the description, pay, every listing with its apply link, its application and screening forms with their questions, and applicants per stage. Read this before update_job or before writing listings for it.",
    inputSchema: object({ job_id: str("The job's id, from list_jobs.") }, ["job_id"]),
    annotations: READ,
    handler: async (args, ctx) => {
      const j = await jobs.getJob(ctx.userId, need(args, "job_id"));
      return {
        ...j,
        pay: jobs.formatPay(j),
        listings: j.listings.map((l) => ({ id: l.id, board: l.board, variant: l.variant, title: l.title, status: l.status, applyUrl: withUrls(ctx, l), externalUrl: l.externalUrl, spend: l.spendCents / 100 })),
        forms: j.forms.map((f) => ({ id: f.id, kind: f.kind, name: f.name, questions: f.questions })),
      };
    },
  },
  {
    name: "create_job",
    title: "Create a job",
    description:
      "Open a new role. Write a full markdown description from what the person told you; ask for anything you'd otherwise have to invent (pay, hours, must-haves). " +
      "Starts as DRAFT. Next steps are usually set_application_form, then create_listing once per board.",
    inputSchema: object({ ...JOB_FIELDS, status: oneOf(JOB_STATUS, "DRAFT unless they say it's open.") }, ["title"]),
    annotations: ADD,
    handler: async (args, ctx) => {
      const input = jobInput(args);
      const j = await jobs.createJob(ctx.userId, { ...input, title: need(args, "title") });
      return { id: j.id, title: j.title, status: j.status, next: "set_application_form, then create_listing for each board" };
    },
  },
  {
    name: "update_job",
    title: "Update a job",
    description:
      "Change a role's fields. Only the fields you send change; description is replaced whole, so read it with get_job, edit, and send it back complete. " +
      "status OPEN makes its listings' apply pages accept applications; CLOSED stops them.",
    inputSchema: object({ job_id: str("The job's id."), ...JOB_FIELDS, status: oneOf(JOB_STATUS, "DRAFT, OPEN or CLOSED.") }, ["job_id"]),
    annotations: SET,
    handler: async (args, ctx) => {
      const j = await jobs.updateJob(ctx.userId, need(args, "job_id"), jobInput(args));
      return { id: j.id, title: j.title, status: j.status, pay: jobs.formatPay(j) };
    },
  },
  {
    name: "create_listing",
    title: "Create a listing",
    description:
      "Write one version of a job for one board and get back the text to paste, in the board's own format, with the apply link built in. " +
      "Call get_board_guide for that board first and follow it. Write body in markdown adapted from the job's description for that board's reader; don't paste the description unchanged. " +
      "A second listing for the same job and board is a split test (variant B): change one thing (title, pay shown, opening lines) so listing_report can tell you which brought better applicants. " +
      "Returns warnings for anything the board would reject; fix them with update_listing before the person posts it. It doesn't post anything to the board: the person pastes it, then you mark it LIVE with update_listing.",
    inputSchema: object(
      {
        job_id: str("The job's id."),
        board: oneOf(BOARD_KEYS, "Which board this listing is for."),
        title: str("The title for this board, within its limit."),
        body: str("Markdown. Pay, apply link and 'how to apply' are handled for you; follow the board guide on what else to leave out."),
        variant: str("A, B, … Leave out to take the next free letter for this job on this board."),
      },
      ["job_id", "board", "title", "body"],
    ),
    annotations: ADD,
    handler: async (args, ctx) => {
      const l = await listings.createListing(ctx.userId, {
        jobId: need(args, "job_id"),
        board: need(args, "board"),
        title: need(args, "title"),
        body: s(args, "body") ?? "",
        variant: s(args, "variant"),
      });
      const full = await listings.getListing(ctx.userId, l.id, ctx.baseUrl);
      const b = boardByKey(l.board)!;
      return { id: l.id, board: l.board, variant: l.variant, applyUrl: full.applyUrl, postAt: b.postUrl, paste: full.rendered };
    },
  },
  {
    name: "get_listing",
    title: "Get a listing",
    description: "One listing with the exact text to paste into its board, the apply link, and any warnings. Use when the person asks for 'the Indeed version' again.",
    inputSchema: object({ listing_id: str("The listing's id.") }, ["listing_id"]),
    annotations: READ,
    handler: async (args, ctx) => {
      const l = await listings.getListing(ctx.userId, need(args, "listing_id"), ctx.baseUrl);
      return { id: l.id, jobId: l.jobId, board: l.board, variant: l.variant, status: l.status, title: l.title, body: l.body, applyUrl: l.applyUrl, externalUrl: l.externalUrl, spend: l.spendCents / 100, paste: l.rendered };
    },
  },
  {
    name: "update_listing",
    title: "Update a listing",
    description:
      "Change a listing. Only what you send changes; body is replaced whole. Mark it LIVE once the person has posted it (and pass external_url, the board's link), PAUSED or CLOSED when they take it down. " +
      "spend is the TOTAL spent on this listing so far, not an increment; listing_report divides it by applicants.",
    inputSchema: object(
      {
        listing_id: str("The listing's id."),
        title: str("New title."),
        body: str("New markdown body, complete."),
        status: oneOf(LISTING_STATUS, "DRAFT, LIVE, PAUSED or CLOSED."),
        external_url: str("The listing's address on the board."),
        spend: num("Total spent on this listing so far, in the job's currency."),
      },
      ["listing_id"],
    ),
    annotations: SET,
    handler: async (args, ctx) => {
      const spend = n(args, "spend");
      const l = await listings.updateListing(ctx.userId, need(args, "listing_id"), {
        title: s(args, "title"),
        body: s(args, "body"),
        status: s(args, "status") as ListingStatus | undefined,
        externalUrl: s(args, "external_url"),
        spendCents: spend === undefined ? undefined : Math.round(spend * 100),
      });
      return { id: l.id, status: l.status, title: l.title, spend: l.spendCents / 100 };
    },
  },
  {
    name: "listing_report",
    title: "Compare listings",
    description:
      "Every listing of one job side by side: applicants, how many met the must-haves, tiers (A, B, C, unranked), how many reached interview, hires, spend, and cost per applicant, per qualified applicant and per A-tier applicant. " +
      "Reach for it for 'which board is working', 'did variant B beat A', 'where should I spend'. Judge on A-tier and qualified applicants, not raw volume. " +
      "Tier counts include assistant proposals the person hasn't decided on (tiers.proposalsOnly says how many); say so. Small numbers are small: say so before calling a winner. " +
      "best names the leading listing, what it leads on, and whether there's enough to be confident. When there is a leader, suggest the next variant to test against it: change ONE thing (the title, the pay line, the opening, the must-haves) and say which, then create_listing with the same board and no variant letter.",
    inputSchema: object({ job_id: str("The job's id.") }, ["job_id"]),
    annotations: READ,
    handler: async (args, ctx) => listings.listingReport(ctx.userId, need(args, "job_id")),
  },
  {
    name: "set_application_form",
    title: "Set the application form",
    description:
      "Set the questions on a job's apply page, which every listing of the job shares. REPLACES the whole form: to change one question, read it with get_job, edit, send all of them back. " +
      "Keep it short (3 to 6 questions): one or two must-haves as yes_no knockouts, one open long_text question that shows whether they read the post, and links. Save deeper questions for a screening form.",
    inputSchema: object({ job_id: str("The job's id."), questions: QUESTION_SCHEMA }, ["job_id", "questions"]),
    annotations: REPLACE,
    handler: async (args, ctx) => {
      const f = await forms.setApplicationForm(ctx.userId, need(args, "job_id"), args.questions);
      return { formId: f.id, questions: (f.questions as unknown[]).length };
    },
  },
  {
    name: "create_screening_form",
    title: "Create a screening form",
    description:
      "A second form for applicants you've shortlisted: work samples, scenario questions, setup checks, a short video. Returns the form's id; get_screening_link makes the personal link for each applicant. " +
      "For a work sample, use one task question with a brief that holds every fact the applicant needs and a realistic minutes figure (30 to 90 is kind); ask the person for the scenario rather than inventing their business details. " +
      "Open questions should be long_text so you can see how each answer was written. If you ask about AI use, say on the form that using AI is fine and you only want to understand how they work.",
    inputSchema: object({ job_id: str("The job's id."), name: str("What the applicant sees as the form's title."), questions: QUESTION_SCHEMA }, ["job_id", "questions"]),
    annotations: ADD,
    handler: async (args, ctx) => {
      const f = await forms.createScreeningForm(ctx.userId, need(args, "job_id"), s(args, "name") ?? "", args.questions);
      return { formId: f.id, name: f.name };
    },
  },
  {
    name: "update_form",
    title: "Update a form",
    description: "Replace a form's questions, and optionally its name. REPLACES every question: read with get_form first and send them all back. Answers already given keep the wording they were asked under.",
    inputSchema: object({ form_id: str("The form's id."), name: str("New name."), questions: QUESTION_SCHEMA }, ["form_id", "questions"]),
    annotations: REPLACE,
    handler: async (args, ctx) => {
      const f = await forms.replaceFormQuestions(ctx.userId, need(args, "form_id"), args.questions, s(args, "name"));
      return { formId: f.id, questions: (f.questions as unknown[]).length };
    },
  },
  {
    name: "get_form",
    title: "Get a form",
    description: "One form's questions, kind and name.",
    inputSchema: object({ form_id: str("The form's id.") }, ["form_id"]),
    annotations: READ,
    handler: async (args, ctx) => forms.getForm(ctx.userId, need(args, "form_id")),
  },
  {
    name: "get_screening_link",
    title: "Get a screening link",
    description:
      "The personal link one applicant uses to fill in a screening form. It identifies them, so send it only to them. Pass move_to_screen true to move them to SCREEN at the same time. " +
      "This doesn't send anything: give the person the link to send, or draft the message with their mail tool.",
    inputSchema: object(
      { application_id: str("The application's id."), form_id: str("A SCREENING form of the same job."), move_to_screen: bool("Also move the application to SCREEN.") },
      ["application_id", "form_id"],
    ),
    annotations: SET,
    handler: async (args, ctx) => {
      const a = await applications.requireApplication(ctx.userId, need(args, "application_id"));
      const f = await forms.requireForm(ctx.userId, need(args, "form_id"));
      if (f.kind !== "SCREENING" || f.jobId !== a.jobId) throw new UserError("That form isn't a screening form for this applicant's job.");
      if (args.move_to_screen === true) await applications.moveStage(ctx.userId, a.id, "SCREEN");
      return { url: `${ctx.baseUrl}${applications.screeningPath(a.screenToken, f.slug)}` };
    },
  },
  {
    name: "list_applications",
    title: "List applications",
    description:
      "Applicants, newest first, one row each: job, stage, tier (decided and proposed), where they came from, whether they met the must-haves, and a provenance roll-up of their written answers (how many typed, pasted, injected, and likely written with AI). " +
      "Use it for 'who applied this week', 'who's waiting in NEW'. Read get_application before judging anyone. Capped at 100 unless you raise limit; the result says the total.",
    inputSchema: object({
      job_id: str("Only this job."),
      stage: oneOf(STAGE_VALUES, "Only this stage."),
      listing_id: str("Only applicants this listing brought."),
      qualified: bool("true: only those who met every knockout; false: only those who missed one."),
      tier: oneOf(TIER_VALUES, "Only this tier: the person's decision, or the proposal where they haven't decided."),
      sort: oneOf(["newest", "tier"], "newest (default), or tier: decided A first, then proposals, by rank."),
      limit: num("Rows to return, up to 500."),
    }),
    annotations: READ,
    handler: async (args, ctx) =>
      applications.listApplications(ctx.userId, {
        jobId: s(args, "job_id"),
        stage: s(args, "stage") as Stage | undefined,
        listingId: s(args, "listing_id"),
        qualified: typeof args.qualified === "boolean" ? args.qualified : undefined,
        tier: s(args, "tier") as Tier | undefined,
        sort: s(args, "sort") as "newest" | "tier" | undefined,
        limit: n(args, "limit"),
      }),
  },
  {
    name: "get_application",
    title: "Get an application",
    description:
      "One applicant whole: contact, the listing that brought them, every answer on every form with how it arrived, knockouts missed, and notes. " +
      "Each written answer has origin (TYPED, PASTED, MIXED, INJECTED for autofill or auto-typers, UNKNOWN), a one-line summary of what the page observed, and style signals with a label. " +
      "Read origin as observation and style as a weak hint: pasting from your own notes is pasting, and second-language writers trip style signals. Never call someone a cheat or reject them on provenance alone; " +
      "say what was observed ('pasted after 40 seconds away from the page', 'likely written with AI') and weigh it against what they said. " +
      "Answers to file questions list their files; read_upload opens one (video answers are listed but can't be read here; the person watches them in the app). " +
      "Also returns interviews with their scorecards and any booking link, where the panel stands, every offer version, saved follow-up questions (probes), reference checks with what referees said, and the read-only share link if it's on.",
    inputSchema: object({ application_id: str("The application's id.") }, ["application_id"]),
    annotations: READ,
    handler: async (args, ctx) => {
      const id = need(args, "application_id");
      const { screenToken: _t, sharePath, ...rest } = await applications.getApplication(ctx.userId, id);
      const io = await interviews.interviewsAndOffers(ctx.userId, id);
      const refs = await references.listReferences(ctx.userId, id);
      return {
        ...rest,
        shareLink: sharePath ? `${ctx.baseUrl}${sharePath}` : null,
        ...io,
        interviews: io.interviews.map(({ bookingPath, ...i }) => ({ ...i, bookingLink: bookingPath ? `${ctx.baseUrl}${bookingPath}` : null })),
        references: refs.map(({ path, ...r }) => ({ ...r, link: `${ctx.baseUrl}${path}` })),
      };
    },
  },
  {
    name: "rank_applicants",
    title: "Rank applicants",
    description:
      "Propose a tier (A, B or C) for applicants of one job, strongest first; the order you send is the rank. Saves PROPOSALS only: the person accepts or changes them in the app, and a tier they decided is never overwritten. " +
      "Before calling: get_job for the rubric and must-haves, then get_application for every applicant you rank. Use the job's rubric when it has one; otherwise " +
      TIER_MEANING +
      " Each reason names what in their application put them there, in a sentence the person can check. Provenance alone never moves anyone down a tier: weigh what they said, and suggest a follow-up question where an answer was pasted or likely written with AI. " +
      "Rank everyone you've read, not just the top. Returns which applicants already have a decided tier, so you can mention where you disagree.",
    inputSchema: object(
      {
        job_id: str("The job's id."),
        rankings: {
          type: "array",
          description: "Strongest first. Each: { application_id, tier: A|B|C, reason }.",
          items: {
            type: "object",
            properties: { application_id: { type: "string" }, tier: { type: "string", enum: TIER_VALUES }, reason: { type: "string" } },
            required: ["application_id", "tier", "reason"],
          },
        },
      },
      ["job_id", "rankings"],
    ),
    annotations: SET,
    handler: async (args, ctx) => {
      if (!Array.isArray(args.rankings)) throw new UserError("rankings must be a list.");
      const rankings = (args.rankings as Json[]).map((r) => ({
        applicationId: need(r, "application_id"),
        tier: need(r, "tier").toUpperCase() as Tier,
        reason: need(r, "reason"),
      }));
      return applications.proposeTiers(ctx.userId, need(args, "job_id"), rankings);
    },
  },
  {
    name: "set_tier",
    title: "Set a tier",
    description:
      "Decide an applicant's tier, ONLY when the person tells you to ('make Ana an A', 'accept your ranking for the top three'). This is their decision, not a proposal; to propose, use rank_applicants. " +
      "Pass tier null to clear a decision, which leaves your proposal as the working tier.",
    inputSchema: object(
      {
        application_id: str("The application's id."),
        tier: { type: ["string", "null"], enum: [...TIER_VALUES, null], description: "A, B, C, or null to clear." },
        reason: str("Their reason, in their words if they gave one."),
      },
      ["application_id", "tier"],
    ),
    annotations: SET,
    handler: async (args, ctx) => {
      const raw = args.tier;
      const tier = raw === null ? null : (String(raw).toUpperCase() as Tier);
      const a = await applications.setTier(ctx.userId, need(args, "application_id"), tier, s(args, "reason") ?? "", "mcp");
      return { id: a.id, tier: a.tier, proposedTier: a.proposedTier };
    },
  },
  {
    name: "read_upload",
    title: "Open an applicant's file",
    description:
      "Open a file an applicant attached (ids are in get_application, under each answer's files). Images come back as images you can see: check a speed-test screenshot against the must-have, describe a work-setup photo, read a typing-test score. PDFs come back as the document. " +
      "Say what the file shows, not what you assume; a screenshot can be old or someone else's, so suggest asking for a live check when it matters.",
    inputSchema: object({ upload_id: str("The file's id.") }, ["upload_id"]),
    annotations: READ,
    handler: async (args, ctx) => {
      const u = await uploads.readUpload(ctx.userId, need(args, "upload_id"));
      const meta = await uploads.uploadMeta(ctx.userId, u.id);
      const data = Buffer.from(u.data).toString("base64");
      const note = { type: "text", text: `${u.filename} (${u.mimeType}, ${Math.round(u.size / 1024)} KB), the answer to "${meta.question}".` };
      if (u.mimeType.startsWith("image/") && u.mimeType !== "image/heic")
        return { [MCP_CONTENT]: [note, { type: "image", data, mimeType: u.mimeType }] };
      return {
        [MCP_CONTENT]: [note, { type: "resource", resource: { uri: `${ctx.baseUrl}${uploads.filePath(u.id)}`, mimeType: u.mimeType, blob: data } }],
      };
    },
  },
  {
    name: "add_applicant",
    title: "Add an applicant",
    description:
      "Put someone in a job's pipeline by hand: they applied inside a board (Upwork, LinkedIn Easy Apply, an OnlineJobs.ph message), were referred, or you sourced them. " +
      "People who use an apply link are added automatically; don't add them again. Copy only what you were given; never invent an email.",
    inputSchema: object(
      {
        job_id: str("The job's id."),
        name: str("Full name."),
        email: str("Email address. Required; it's how the same person is recognised across jobs."),
        phone: str("Phone, if given."),
        links: { type: "array", items: { type: "string" }, description: "Profile, portfolio or resume links." },
        source: str("Where they came from: 'upwork', 'referral: Ana', 'sourced on LinkedIn'."),
        listing_id: str("The listing they responded to, if any, so listing_report counts them."),
        note: str("Anything worth keeping from where you found them."),
      },
      ["job_id", "name", "email"],
    ),
    annotations: ADD,
    handler: async (args, ctx) => {
      const a = await applications.addApplicant(ctx.userId, {
        jobId: need(args, "job_id"),
        name: need(args, "name"),
        email: need(args, "email"),
        phone: s(args, "phone"),
        links: Array.isArray(args.links) ? args.links.filter((x): x is string => typeof x === "string") : undefined,
        source: s(args, "source"),
        listingId: s(args, "listing_id"),
        note: s(args, "note"),
      });
      return { applicationId: a.id, candidate: a.candidate.name, stage: a.stage };
    },
  },
  {
    name: "import_applicants",
    title: "Import applicants from a board export",
    description:
      "Add everyone in an applicant export (Indeed, LinkedIn, Wellfound, a spreadsheet) to one job at once. Reach for it when the person pastes or attaches a CSV of applicants; for one or two people use add_applicant. " +
      "Pass the file's text as it is. Columns are recognised by their headers (name or first and last name, email, phone, profile and resume links); every other column is kept as a note on the applicant. If a column isn't found, the error lists the headers: ask which one it is, or pass columns. " +
      "dry_run defaults to true and saves nothing: it returns what would be added, who already applied, and which rows would be skipped and why. Show the person that summary, then call again with dry_run false. " +
      "Give listing_id when the export came from one of this job's listings, so listing_report counts those applicants against it. People already in this job are never added twice. Imported applicants have no answers, so they have no provenance.",
    inputSchema: object(
      {
        job_id: str("The job's id."),
        csv: str("The export's full text, header row first. Comma, tab or semicolon separated."),
        listing_id: str("The listing these applicants came through, if any."),
        source: str("Where they came from when there's no listing, e.g. 'indeed export'. Guessed from the headers when left out."),
        columns: {
          type: "object",
          description: `Name a column outright when the guess is wrong or missing, as field to header, e.g. {"email": "Contact"}. Fields: ${IMPORT_FIELDS.join(", ")}.`,
          properties: Object.fromEntries(IMPORT_FIELDS.map((f) => [f, { type: "string" }])),
          additionalProperties: false,
        },
        dry_run: bool("True (the default) previews and saves nothing. False adds them."),
      },
      ["job_id", "csv"],
    ),
    annotations: ADD,
    handler: (args, ctx) => {
      const cols = (args.columns && typeof args.columns === "object" ? args.columns : {}) as Record<string, unknown>;
      return imports.importApplicants(ctx.userId, {
        jobId: need(args, "job_id"),
        csv: need(args, "csv"),
        listingId: s(args, "listing_id"),
        source: s(args, "source"),
        columns: Object.fromEntries(Object.entries(cols).filter(([k, v]) => IMPORT_FIELDS.includes(k as ImportField) && typeof v === "string")),
        dryRun: args.dry_run !== false,
        writtenBy: "mcp",
      });
    },
  },
  {
    name: "schedule_interview",
    title: "Schedule or update an interview",
    description:
      "Record an interview with an applicant: the screening call, the work sample review, the final. With application_id it adds the next round; with interview_id it changes only the fields you send, including status (DONE, CANCELLED, NO_SHOW). " +
      "This keeps the record; it doesn't send an invite or touch a calendar. To invite them, prep_message with kind INTERVIEW_INVITE, which reads what you saved here. If you have the person's calendar connector, create the event there too, only when they ask. " +
      "Never invent a time or an interviewer: ask. Give scheduled_at in ISO 8601 with the time zone offset the person means. It doesn't move the applicant's stage; use move_stage if the person wants them in INTERVIEW. " +
      "To let the applicant choose instead, pass offer_times: the times the person said they're free. That returns a booking link where the applicant sees those times in their own time zone and picks one, which becomes scheduled_at; no calendar needed. Offering again replaces the times; an empty list withdraws them. The invite then carries the link (prep_message INTERVIEW_INVITE).",
    inputSchema: object({
      application_id: str("The application, to add a new round."),
      interview_id: str("An interview's id, to change it."),
      title: str("What the conversation is: 'screening call', 'work sample review', 'final with the founder'. Required when adding."),
      format: oneOf(INTERVIEW_FORMATS, "video, phone or in_person."),
      scheduled_at: str("When, ISO 8601 with offset, e.g. 2026-11-20T14:00:00+08:00. Empty string clears it."),
      duration_min: num("Length in minutes."),
      interviewers: str("Who they'll meet, as the person said it."),
      location: str("A meeting link or an address."),
      status: oneOf(["SCHEDULED", "DONE", "CANCELLED", "NO_SHOW"], "Only when changing an interview."),
      offer_times: { type: "array", items: { type: "string" }, description: "Times for the applicant to pick from, ISO 8601 with offset, up to twelve. Use instead of scheduled_at." },
    }),
    annotations: ADD,
    handler: async (args, ctx) => {
      const input = {
        title: s(args, "title"),
        format: s(args, "format"),
        scheduledAt: typeof args.scheduled_at === "string" ? args.scheduled_at : undefined,
        durationMin: n(args, "duration_min"),
        interviewers: s(args, "interviewers"),
        location: s(args, "location"),
        status: s(args, "status"),
      };
      const offer = args.offer_times;
      if (offer !== undefined) {
        if (!Array.isArray(offer) || offer.some((t) => typeof t !== "string")) throw new UserError("offer_times is a list of ISO 8601 times.");
        if (input.scheduledAt && offer.length) throw new UserError("Give either scheduled_at or offer_times, not both.");
      }
      const id = s(args, "interview_id");
      let i = id ? await interviews.updateInterview(ctx.userId, id, input) : await interviews.addInterview(ctx.userId, need(args, "application_id"), input);
      if (offer !== undefined) i = await interviews.offerTimes(ctx.userId, i.id, offer as string[]);
      const { userId: _u, bookToken, ...rest } = i;
      return { ...rest, bookingLink: bookToken && rest.slots.length && !rest.scheduledAt ? `${ctx.baseUrl}${interviews.bookingPath(bookToken)}` : null };
    },
  },
  {
    name: "list_interviews",
    title: "List interviews",
    description:
      "Interviews across every open job, earliest first, with the applicant, the job, and how many scorecards say yes or no. Reach for it for 'what's on this week', 'who still needs a scorecard' (status DONE with no scorecards), or one job's interview loop. " +
      "Times are stored in UTC; say them in the person's time zone.",
    inputSchema: object({
      from: str("Start of the window, ISO 8601. Leave out for no start."),
      to: str("End of the window, ISO 8601."),
      job_id: str("Only this job."),
      status: oneOf(["SCHEDULED", "DONE", "CANCELLED", "NO_SHOW"], "Only this status."),
    }),
    annotations: READ,
    handler: (args, ctx) =>
      interviews.listInterviews(ctx.userId, { from: s(args, "from"), to: s(args, "to"), jobId: s(args, "job_id"), status: s(args, "status") }),
  },
  {
    name: "record_scorecard",
    title: "Record a scorecard",
    description:
      "Save one interviewer's verdict on one interview: a recommendation (STRONG_YES, YES, NO, STRONG_NO), optional ratings per criterion from 1 (well below the bar) to 4 (above it), and a summary. " +
      "Write it from what the interviewer told you, in their words, and attribute it to them; never fill in a rating they didn't give. Use the job's rubric (get_job) for the criteria when they rate against it. " +
      "Adds; several interviewers each get their own scorecard. Marks a SCHEDULED interview DONE. It decides nothing: the person still decides the tier and the stage.",
    inputSchema: object(
      {
        interview_id: str("The interview's id, from get_application or list_interviews."),
        interviewer: str("Whose verdict this is."),
        recommendation: oneOf(RECOMMENDATIONS, "Their overall call."),
        ratings: {
          type: "array",
          description: "Optional. One entry per criterion they rated.",
          items: object({ criterion: str("What was rated."), score: num("1 well below, 2 below, 3 meets, 4 above the bar."), note: str("Why, in their words.") }, ["criterion", "score"]),
        },
        summary: str("What they said, briefly: evidence, not adjectives."),
      },
      ["interview_id", "interviewer", "recommendation"],
    ),
    annotations: ADD,
    handler: async (args, ctx) => {
      const c = await interviews.addScorecard(ctx.userId, need(args, "interview_id"), {
        interviewer: need(args, "interviewer"),
        recommendation: need(args, "recommendation"),
        ratings: args.ratings,
        summary: s(args, "summary"),
        writtenBy: "mcp",
      });
      return { id: c.id, interviewId: c.interviewId, recommendation: c.recommendation };
    },
  },
  {
    name: "record_offer",
    title: "Record an offer",
    description:
      "Write down an offer to an applicant. With application_id it saves a NEW VERSION: terms you leave out carry over from the version before (the first takes currency and period from the job), so a counter at a higher figure is just pay_amount. Every version is kept, which is the history of the negotiation. " +
      "With offer_id and status it changes only that version's status: EXTENDED once it has gone to them, then ACCEPTED, DECLINED or WITHDRAWN. " +
      "Only the terms the person gave you; never fill a gap with a plausible number. Returns pay formatted and which terms changed from the last version. " +
      "It sends nothing: to write the offer email, prep_message with kind OFFER, which reads the latest version. It doesn't move the stage.",
    inputSchema: object({
      application_id: str("The application, to save a new version."),
      offer_id: str("An offer version's id, to change only its status."),
      title: str("The job title on the offer. Defaults to the job's."),
      pay_amount: num("Whole number in the currency, e.g. 40000."),
      pay_currency: str("ISO code, e.g. PHP, USD."),
      pay_period: oneOf(PAY_PERIODS, "hour, month or year."),
      start_date: str("ISO date, e.g. 2026-12-01."),
      hours: str("Hours and schedule as the person said them."),
      terms: str("Anything else agreed, markdown: probation, equipment, leave."),
      respond_by: str("ISO date they're asked to answer by."),
      status: oneOf(OFFER_STATUSES, "DRAFT (default for a new version), EXTENDED, ACCEPTED, DECLINED, WITHDRAWN."),
    }),
    annotations: ADD,
    handler: async (args, ctx) => {
      const offerId = s(args, "offer_id");
      if (offerId) {
        const o = await interviews.setOfferStatus(ctx.userId, offerId, need(args, "status"));
        return { id: o.id, version: o.version, status: o.status };
      }
      const { userId: _u, ...o } = await interviews.recordOffer(ctx.userId, need(args, "application_id"), {
        title: s(args, "title"),
        payAmount: n(args, "pay_amount"),
        payCurrency: s(args, "pay_currency"),
        payPeriod: s(args, "pay_period"),
        startDate: s(args, "start_date"),
        hours: s(args, "hours"),
        terms: s(args, "terms"),
        respondBy: s(args, "respond_by"),
        status: s(args, "status"),
      });
      return o;
    },
  },
  {
    name: "move_stage",
    title: "Move an applicant",
    description:
      "Move an application to another stage: NEW, SCREEN, INTERVIEW, OFFER, HIRED or REJECTED. Moving a stage sends the applicant nothing; offer to draft the matching message with prep_message.",
    inputSchema: object({ application_id: str("The application's id."), stage: oneOf(STAGE_VALUES, "The new stage.") }, ["application_id", "stage"]),
    annotations: SET,
    handler: async (args, ctx) => {
      const a = await applications.moveStage(ctx.userId, need(args, "application_id"), need(args, "stage") as Stage);
      return { id: a.id, stage: a.stage };
    },
  },
  {
    name: "add_note",
    title: "Add a note",
    description: "Add a note to an application: a call summary, a reference, why you moved them. Adds; never replaces.",
    inputSchema: object({ application_id: str("The application's id."), body: str("The note.") }, ["application_id", "body"]),
    annotations: ADD,
    handler: async (args, ctx) => {
      const note = await applications.addNote(ctx.userId, need(args, "application_id"), need(args, "body"), "mcp");
      return { id: note.id };
    },
  },
  {
    name: "prep_message",
    title: "Prepare a message to an applicant",
    description:
      "Call this FIRST before writing any email to an applicant: a screening invite, an interview invite, a rejection, an offer. " +
      "Returns who they are, the role, their stage and tier, their personal screening links (with whether they already filled each in and which files each asks for), every message they were sent before, and guidance for this kind of message. " +
      "Follow the guidance. Never invent a time, a pay figure, a start date or a reason: if the person didn't give you one, ask. Never mention how an applicant's answers were typed or pasted in anything sent to them. " +
      "Then save the draft with save_message. Saves nothing itself.",
    inputSchema: object(
      { application_id: str("The application's id."), kind: oneOf(MESSAGE_KINDS, "What the message is for. OTHER for anything else.") },
      ["application_id", "kind"],
    ),
    annotations: READ,
    handler: (args, ctx) => messages.prepMessage(ctx.userId, need(args, "application_id"), need(args, "kind"), ctx.baseUrl),
  },
  {
    name: "save_message",
    title: "Save or mark a message",
    description:
      "Save a message to an applicant as a draft, or record that it was sent. This server never sends email. " +
      "To send, use the person's own mail connector if you have one (Gmail, Outlook) and only after they say send, then call this again with message_id and status SENT; " +
      "otherwise tell them the draft is on the applicant's page in Recruited, where Open in email puts it in their mail app. " +
      "Without message_id it adds a new message. With message_id it changes that draft: subject and body replace what was there. A SENT message can't be edited, because it is the record of what the applicant was told. " +
      "Returns the message with a mailto link.",
    inputSchema: object({
      application_id: str("The application's id. Required when adding a new message."),
      message_id: str("A message's id, to change a draft or mark it sent. Leave out to add a new one."),
      kind: oneOf(MESSAGE_KINDS, "What the message is for. Required when adding."),
      subject: str("The subject line."),
      body: str("The whole message, plain text, as the applicant will read it. Replaces the draft's body when message_id is given."),
      status: oneOf(["DRAFT", "SENT"], "DRAFT (default) or SENT once it has actually gone out."),
    }),
    annotations: ADD,
    handler: async (args, ctx) => {
      const status = s(args, "status") as "DRAFT" | "SENT" | undefined;
      const id = s(args, "message_id");
      const m = id
        ? await messages.updateMessage(ctx.userId, id, { subject: s(args, "subject"), body: s(args, "body"), status })
        : await messages.saveMessage(ctx.userId, {
            applicationId: need(args, "application_id"),
            kind: need(args, "kind"),
            subject: s(args, "subject"),
            body: need(args, "body"),
            status,
            writtenBy: "mcp",
          });
      const all = await messages.listMessages(ctx.userId, m.applicationId);
      const saved = all.find((x) => x.id === m.id)!;
      return {
        id: saved.id,
        kind: saved.kind,
        status: saved.status,
        sentAt: saved.sentAt,
        subject: saved.subject,
        mailto: saved.mailto,
        page: `${ctx.baseUrl}/applications/${m.applicationId}`,
      };
    },
  },
  {
    name: "daily_brief",
    title: "Daily brief",
    description:
      "Everything that needs the person today, in one read: who applied since yesterday (or since), tier proposals waiting for a decision, applicants in SCREEN who haven't answered their screening form, interviews in the next 48 hours (with how many follow-up questions are still unasked), interviews waiting for the applicant to pick a time, interviews with no scorecard, unsent drafts, references that came in and offers waiting on an answer. " +
      "Reach for it for 'what's on today', 'catch me up', 'what needs me'. Lead with what needs a decision or is time-bound; skip empty sections; give times in the person's time zone. Read-only.",
    inputSchema: object({ since: str("Count new things from this moment, ISO 8601. Defaults to 24 hours ago.") }),
    annotations: READ,
    handler: (args, ctx) => brief.dailyBrief(ctx.userId, { since: s(args, "since") }),
  },
  {
    name: "save_probes",
    title: "Save follow-up questions",
    description:
      "Save the questions to ask one applicant on the call, shown on their page as 'Ask on the call'. Read get_application first, then aim each question at an answer that needs a second look: pasted, likely written with AI, thin, or a claim worth testing. " +
      "A good probe asks for a real example only someone who did the work can give ('Walk me through the last time…'). why says what prompted it in a sentence the person can check; it's for them, never the applicant, and it never calls the applicant a cheat. " +
      "With probes it REPLACES the whole list (up to twelve): read the current ones from get_application to keep them. With index and asked or note it changes one question only, e.g. after the call: asked true and a note of what they said.",
    inputSchema: object(
      {
        application_id: str("The application's id."),
        probes: {
          type: "array",
          description: "The whole list, in the order to ask. Each: { about: the question or answer it follows up on, question, why }.",
          items: object({ about: str("Which answer this follows up on."), question: str("The question, in full."), why: str("What prompted it.") }, ["question"]),
        },
        index: num("To change one question: its position, from 0."),
        asked: bool("Mark that question asked (true) or not yet (false)."),
        note: str("What they said, briefly."),
      },
      ["application_id"],
    ),
    annotations: REPLACE,
    handler: async (args, ctx) => {
      const id = need(args, "application_id");
      if (args.probes !== undefined) return { probes: await probes.saveProbes(ctx.userId, id, args.probes) };
      const index = n(args, "index");
      if (index === undefined) throw new UserError("Send probes to save the list, or index with asked or note to change one.");
      return { probes: await probes.markProbe(ctx.userId, id, index, { asked: typeof args.asked === "boolean" ? args.asked : undefined, note: s(args, "note") }) };
    },
  },
  {
    name: "request_reference",
    title: "Request a reference",
    description:
      "Ask one of an applicant's referees four short questions on a personal link: how they know them, what they were best at, what would help them do their best work, and whether they'd work with them again. " +
      "Only for a referee the applicant or the person named; never look one up yourself. Returns the link and a suggested note to the referee. Nothing is sent: send it with the person's mail tool once they say so, or give them the note to send. " +
      "Answers appear in get_application under references and in the daily brief.",
    inputSchema: object(
      {
        application_id: str("The application's id."),
        name: str("The referee's full name."),
        email: str("Their email, if the person has it."),
        relation: str("How they know the applicant, as given: 'manager at Acme, 2022 to 2024'."),
      },
      ["application_id", "name"],
    ),
    annotations: ADD,
    handler: async (args, ctx) => {
      const id = need(args, "application_id");
      const r = await references.requestReference(ctx.userId, id, { name: need(args, "name"), email: s(args, "email"), relation: s(args, "relation") });
      const a = await applications.getApplication(ctx.userId, id);
      const url = `${ctx.baseUrl}${references.referencePath(r.token)}`;
      return {
        id: r.id,
        referee: r.name,
        email: r.email || null,
        link: url,
        note: references.referenceNote({ referee: r.name, candidate: a.candidate.name, job: a.job.title, company: ctx.user.companyName, from: ctx.user.name || ctx.user.companyName, url }),
      };
    },
  },
  {
    name: "close_out_job",
    title: "Close the loop on a role",
    description:
      "When a role is filled or closed, make sure everyone still waiting hears back. Saves one REJECTION draft for every applicant in NEW, SCREEN, INTERVIEW or REJECTED who hasn't already been sent or drafted one; OFFER and HIRED are never touched. " +
      "ALWAYS call with dry_run true first and show the person who it covers and the preview; run it for real only after they say yes. " +
      "subject and body are templates: {first_name}, {name}, {job}, {company}, {at_company} (' at Acme' or nothing) and {from} are filled per applicant. Leave them out for a short, kind default. Don't give a reason, and never mention how answers were typed or pasted. " +
      "move_to_rejected also moves them to REJECTED; close_job also closes the job and every listing. It sends nothing: the drafts wait on each applicant's page, or go out through the person's mail tool (then save_message with status SENT).",
    inputSchema: object(
      {
        job_id: str("The job's id."),
        dry_run: bool("true: say who it would cover and show one filled message, saving nothing."),
        subject: str("Subject template."),
        body: str("Message template, plain text."),
        move_to_rejected: bool("Also move each of them to REJECTED."),
        close_job: bool("Also set the job to CLOSED and close its listings."),
      },
      ["job_id"],
    ),
    annotations: ADD,
    handler: (args, ctx) =>
      closeout.closeOutJob(ctx.userId, need(args, "job_id"), {
        dryRun: args.dry_run === true,
        subject: s(args, "subject"),
        body: s(args, "body"),
        moveToRejected: args.move_to_rejected === true,
        closeJob: args.close_job === true,
      }),
  },
  {
    name: "share_applicant",
    title: "Share an applicant",
    description:
      "Turn on or off a read-only link to one applicant, for a co-founder or hiring manager without an account. The page shows their name, the job, the tier and its reason, every answer with how it arrived, and interview scorecards; never their email, phone, notes, messages or files. " +
      "Anyone with the link can see it, so give it only to the people the person names. Turning it off breaks the link for good; turning it on again makes a new one.",
    inputSchema: object({ application_id: str("The application's id."), shared: bool("true for a link, false to turn it off.") }, ["application_id", "shared"]),
    annotations: SET,
    handler: async (args, ctx) => {
      if (typeof args.shared !== "boolean") throw new UserError("shared is true or false.");
      const r = await share.shareApplicant(ctx.userId, need(args, "application_id"), args.shared);
      return { shared: r.shared, link: r.path ? `${ctx.baseUrl}${r.path}` : null };
    },
  },
  {
    name: "update_company",
    title: "Update the company profile and careers page",
    description:
      "The company every public job page shows: its name, a few sentences about it, and its website. Changes only what you send. Write about in plain words from what the person tells you (what you make, who for, how you work), three or four sentences; never invent size, funding or perks. " +
      "careers_slug sets the careers page's address, /careers/<slug>: a public page listing every open job that has a LIVE listing on the careers board, which is also the only kind of apply page search engines and Google for Jobs may index. Ask the person what they want it called; their company name in lowercase is the usual choice. Empty string takes the page down. " +
      "Returns the careers page's full URL once a slug is set.",
    inputSchema: object({
      company_name: str("The company's name."),
      about: str("A few sentences about the company, plain text."),
      website: str("Full address, starting with https://. Empty string clears it."),
      careers_slug: str("Lowercase letters, numbers and dashes, e.g. 'acme'. Empty string takes the careers page down."),
    }),
    annotations: SET,
    handler: async (args, ctx) => {
      const u = await users.updateAccount(ctx.userId, {
        companyName: s(args, "company_name"),
        companyAbout: s(args, "about"),
        companyWebsite: s(args, "website"),
        careersSlug: s(args, "careers_slug"),
      });
      return {
        companyName: u.companyName,
        about: u.companyAbout,
        website: u.companyWebsite,
        careersUrl: u.careersSlug ? `${ctx.baseUrl}${careersPath(u.careersSlug)}` : null,
      };
    },
  },
  {
    name: "set_spam_check",
    title: "Turn the apply page's spam check on or off",
    description:
      "Cloudflare Turnstile on the public apply pages: a small check above the send button that stops most bots, usually without the applicant doing anything. " +
      "Every apply page already has a hidden trap field and a per-address hourly limit; reach for this when the person says spam or fake applications are still getting through, or asks for a captcha. " +
      "It needs a free Cloudflare account: in the Cloudflare dashboard, Turnstile, add a widget for the domain the apply pages are on, then paste its site key and secret key here. Never invent keys; ask for them. " +
      "Send both keys to turn it on, two empty strings to turn it off, or nothing to see whether it's on. Only the instance's owner can change it. The secret is stored and never shown again, here or in the app.",
    inputSchema: object({
      site_key: str("The widget's site key, from Cloudflare. Empty string turns the check off."),
      secret_key: str("The widget's secret key, from Cloudflare. Empty string turns the check off."),
    }),
    annotations: SET,
    handler: async (args, ctx) => {
      const siteKey = s(args, "site_key");
      const secretKey = s(args, "secret_key");
      if (siteKey === undefined && secretKey === undefined) return settings.spamCheckStatus();
      return settings.setTurnstile(ctx.userId, { siteKey: siteKey ?? "", secretKey: secretKey ?? "" });
    },
  },
  {
    name: "instance_health",
    title: "Check this Recruited instance's health",
    description:
      "Reach for this when something in Recruited failed, looks slow or looks wrong, or the person asks whether their instance is healthy. Owner only. " +
      "Returns whether the database answers and how fast, the latest migration applied, account, job and application totals, whether the spam check is on, " +
      "and the errors the server caught: how many in the last seven days and the newest twenty, each with where it happened, the message and when. " +
      "Read-only. Explain an error in plain words and say what the person can do; don't guess at causes the message doesn't support.",
    inputSchema: object({}),
    annotations: READ,
    handler: (_args, ctx) => system.instanceHealth(ctx.userId),
  },
  {
    name: "get_password_reset_link",
    title: "Get a link to reset the password",
    description:
      "Reach for this when the person can't sign in to the Recruited app: they forgot their password, or never saw the one printed when the instance started. " +
      "Returns a one-time link for the account this connection belongs to, and only that account. It works once, for an hour; setting a new password through it signs every browser out. " +
      "Give the person the link and nothing else; don't post it anywhere shared, because whoever opens it can set the password. Nothing is emailed.",
    inputSchema: object({}),
    annotations: ADD,
    handler: async (_args, ctx) => {
      const r = await users.resetLinkFor(ctx.userId);
      return { url: `${ctx.baseUrl}${users.resetPath(r.token)}`, account: ctx.user.email, validForMinutes: r.minutes };
    },
  },
  {
    name: "load_sample_workspace",
    title: "Load the sample workspace",
    description:
      "Fill the workspace with a made-up role, 'Customer Support Specialist (sample)', so the person can see how Recruited works before posting a real one: listings on two boards, six applicants whose answers arrived in different ways, tier proposals, an interview with a scorecard, one waiting for a time to be picked, follow-up questions and a draft. " +
      "Offer it when the workspace is empty and the person wants to look around. Everything it makes is marked as sample; wipe_sample_workspace removes exactly that.",
    inputSchema: object({}),
    annotations: ADD,
    handler: (_args, ctx) => sample.loadSampleWorkspace(ctx.userId),
  },
  {
    name: "wipe_sample_workspace",
    title: "Remove the sample workspace",
    description: "Delete the sample role and its made-up applicants, and nothing else. Real jobs and applicants are never touched. Permanent: say so and get a yes first.",
    inputSchema: object({}),
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false },
    handler: (_args, ctx) => sample.wipeSampleWorkspace(ctx.userId),
  },
];

/**
 * A handler that returns { [MCP_CONTENT]: [...] } hands the transport MCP
 * content blocks as they are (an image, a document) instead of JSON text.
 */
export const MCP_CONTENT = "__mcpContent";

export const toolsByName = new Map(TOOLS.map((t) => [t.name, t]));

// ---------------------------------------------------------------------------
// Prompts: multi-step jobs composed of the tools above
// ---------------------------------------------------------------------------

export type McpPrompt = {
  name: string;
  title: string;
  description: string;
  arguments: { name: string; description: string; required?: boolean }[];
  render: (args: Record<string, string>) => string;
};

export const PROMPTS: McpPrompt[] = [
  {
    name: "morning_brief",
    title: "Morning brief",
    description: "What needs you today across every role, in order of what's time-bound, with a suggested next step for each.",
    arguments: [],
    render: () => `Give me my hiring brief for today.

1. daily_brief.
2. Start with anything time-bound: interviews in the next 48 hours (time in my time zone, and whether there are follow-up questions to ask), offers waiting on an answer, interviews still waiting for the applicant to pick a time.
3. Then decisions only I can make: tier proposals to accept, scorecards to write, drafts to send.
4. Then what's new: applicants since yesterday, screening forms not answered, references that came in.
5. One line each, with a suggested next step I can say yes to. Skip anything empty. If nothing needs me, say so in one sentence.`,
  },
  {
    name: "prepare_for_call",
    title: "Prepare for a call",
    description: "Read one applicant whole and write the follow-up questions to ask, aimed at the answers that need a second look.",
    arguments: [{ name: "applicant", description: "Their name, or the application's id.", required: true }],
    render: (a) => `Get me ready for my call with ${a.applicant}.

1. Find them with list_applications if I gave a name, then get_application.
2. Summarise in four lines: who they are, what stands out, where the panel stands, and anything still unknown.
3. Write three to six follow-up questions and save them with save_probes. Aim them at answers that were pasted, likely written with AI, thin, or make a claim worth testing. Each asks for a real example only someone who did the work could give. Say why for each, as observation ("pasted after a minute away"), never as an accusation.
4. Show me the questions. After the call I'll tell you how it went; then mark each one asked with a note, and record_scorecard from what I say.`,
  },
  {
    name: "post_a_role",
    title: "Post a role everywhere",
    description: "From a rough description to a job, an application form and a listing for each board, ready to paste.",
    arguments: [
      { name: "role", description: "What you're hiring for, in your own words.", required: true },
      { name: "boards", description: "Which boards, e.g. 'linkedin, onlinejobs_ph'. Leave empty to be asked." },
    ],
    render: (a) => `I want to hire for this role: ${a.role}
${a.boards ? `Post it on: ${a.boards}.` : "Ask me which boards to post on, and suggest some from get_board_guide."}

Do this in order, and stop to ask whenever you'd otherwise have to invent something (pay, hours, must-haves):
1. create_job with a full markdown description.
2. set_application_form: three to six questions, one or two yes_no knockouts for true must-haves, one open long_text question that only someone who read the post can answer.
3. For each board: get_board_guide, then create_listing written for that board's reader. Fix any warnings with update_listing.
4. Show me each listing's paste text and where to post it. Remind me to tell you when it's live so you can mark it LIVE.`,
  },
  {
    name: "review_applicants",
    title: "Review new applicants",
    description: "Read everyone waiting in NEW for a job, propose a tier and rank for each, and suggest who to screen.",
    arguments: [{ name: "job", description: "The role's title or id.", required: true }],
    render: (a) => `Review the applicants waiting in NEW for "${a.job}".

1. Find the job with list_jobs, then list_applications with stage NEW.
2. get_job for the rubric (if it has none, ask me what makes an A before ranking), then get_application for each.
3. rank_applicants with every one of them, strongest first, each with a reason I can check.
4. Report in a table: rank, name, proposed tier, met must-haves, the one thing that stands out, how the written answers arrived, and your suggestion (screen, hold, decline).
5. Describe provenance as observation: "pasted", "typed", "likely written with AI". It's a reason to ask a follow-up question, never a reason on its own to rank someone lower.
6. Don't move anyone or decide a tier until I say which suggestions to take.`,
  },
  {
    name: "message_applicants",
    title: "Message applicants",
    description: "Draft one kind of message (screening invite, interview invite, rejection) for a group of applicants, each written to them, for you to review and send.",
    arguments: [
      { name: "job", description: "The role's title or id.", required: true },
      { name: "who", description: "Who to write to, e.g. 'A-tier in NEW', 'everyone rejected this week'.", required: true },
      { name: "kind", description: "screening invite, interview invite, rejection, offer or other.", required: true },
    ],
    render: (a) => `Draft a ${a.kind} for ${a.who} applying to "${a.job}".

1. Find the job with list_jobs, then the applicants with list_applications. Show me the list and wait for me to confirm it before writing anything.
2. For each one: prep_message, then write the message following its guidance, using their first name and, for a screening invite, their own screening link. Ask me once for anything the guidance needs that I haven't given you (a deadline, interview times, who they'll meet); never fill it in yourself.
3. save_message each one as a DRAFT.
4. Show me one in full and the rest as a list. If you have my mail connector, send only after I say so, then save_message each with status SENT. Otherwise tell me they're waiting on each applicant's page under Messages.
5. Don't move anyone's stage unless I ask.`,
  },
];

export const promptsByName = new Map(PROMPTS.map((p) => [p.name, p]));
