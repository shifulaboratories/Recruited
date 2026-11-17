import type { JobStatus, ListingStatus, Stage, Tier, User } from "@prisma/client";
import * as jobs from "@/lib/data/jobs";
import * as listings from "@/lib/data/listings";
import * as forms from "@/lib/data/forms";
import * as applications from "@/lib/data/applications";
import { UserError } from "@/lib/data/errors";
import { BOARDS, BOARD_KEYS, boardByKey } from "@/lib/boards";
import { QUESTION_TYPES } from "@/lib/forms";

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
    "short_text and long_text answers are recorded for provenance (typed, pasted, likely AI), so ask open questions in those types.",
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
      "Tier counts include assistant proposals the person hasn't decided on (tiers.proposalsOnly says how many); say so. Small numbers are small: say so before calling a winner.",
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
      "A second form for applicants you've shortlisted: work samples, scenario questions, setup checks. Returns the form's id; get_screening_link makes the personal link for each applicant. " +
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
      "say what was observed ('pasted after 40 seconds away from the page', 'likely written with AI') and weigh it against what they said.",
    inputSchema: object({ application_id: str("The application's id.") }, ["application_id"]),
    annotations: READ,
    handler: async (args, ctx) => {
      const { screenToken: _t, ...rest } = await applications.getApplication(ctx.userId, need(args, "application_id"));
      return rest;
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
    name: "move_stage",
    title: "Move an applicant",
    description:
      "Move an application to another stage: NEW, SCREEN, INTERVIEW, OFFER, HIRED or REJECTED. Moving someone to REJECTED sends them nothing; tell the person if they want a message drafted.",
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
];

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
];

export const promptsByName = new Map(PROMPTS.map((p) => [p.name, p]));
