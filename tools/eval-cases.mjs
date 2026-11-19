/**
 * What an assistant should reach for first, and what it reaches for instead.
 * Ported from Hired's eval-cases.mjs, whose rules apply here too:
 *
 * - A case must come from a real misroute, or from a trap you can name. Cases
 *   invented to pad the count make the score go up and tell you nothing.
 * - Write the prompt the way a person talks. If it contains the tool's own
 *   name it is testing nothing.
 * - When you change a description because of a failure here, add the case
 *   first and watch it fail.
 *
 * `expect` lists acceptable FIRST calls; any one passes. `avoid` names the
 * tool a naive reading picks, and picking it is a TRAP, worse than a miss.
 * In Recruited the traps that matter are the ones that leave the building or
 * can't be undone: sending instead of drafting, deleting instead of archiving,
 * replacing a form instead of reading it first.
 */
export const CASES = [
  // --- Jobs and listings ------------------------------------------------------
  {
    prompt: "I'm hiring a part-time bookkeeper, remote, about 20 hours a week. Let's get it posted on OnlineJobs.ph.",
    expect: ["create_job", "get_board_guide", "list_jobs"],
    avoid: ["create_listing"],
    why: "A listing hangs off a job and follows the board's guide; writing one first invents the role.",
  },
  {
    prompt: "Write me the LinkedIn version of the bookkeeper role.",
    expect: ["get_board_guide", "list_jobs", "get_job"],
    avoid: ["create_listing"],
    why: "The board guide comes before the listing, or the listing ignores the board's format.",
  },
  {
    prompt: "I posted the OnlineJobs listing. It's live now.",
    expect: ["update_listing", "list_jobs", "get_job"],
    avoid: ["create_listing"],
    why: "Marking a listing LIVE is an update, not a second listing.",
  },
  {
    prompt: "Which board is actually bringing me good people for the bookkeeper role?",
    expect: ["listing_report", "list_jobs"],
    avoid: ["list_applications"],
    why: "listing_report compares boards on A-tier and qualified applicants, not raw counts.",
  },
  // --- Forms --------------------------------------------------------------------
  {
    prompt: "Add a question to the bookkeeper application asking which accounting software they've used.",
    expect: ["get_form", "get_job", "list_jobs"],
    avoid: ["set_application_form", "update_form"],
    why: "set_application_form and update_form REPLACE every question; read the form first.",
  },
  {
    prompt: "Make the shortlisted bookkeepers fill in a short skills check before I call them.",
    expect: ["create_screening_form", "list_jobs", "get_job"],
    avoid: ["set_application_form"],
    why: "A second-round form is a screening form; the application form is the one on the apply page.",
  },
  // --- Applicants -----------------------------------------------------------------
  {
    prompt: "Who's applied for the bookkeeper job so far?",
    expect: ["list_applications", "list_jobs"],
    why: "The plain read.",
  },
  {
    prompt: "Go through the bookkeeper applicants and tell me who's worth a call.",
    expect: ["list_jobs", "list_applications", "get_job"],
    avoid: ["set_tier", "move_stage"],
    why: "Ranking proposes; deciding a tier or moving someone is the person's call.",
  },
  {
    prompt: "Did Maria actually type her answers or paste them?",
    expect: ["list_applications", "get_application"],
    why: "Provenance lives on the application's answers.",
  },
  {
    prompt: "I got a CSV export from OnlineJobs with 40 applicants. Get them in.",
    expect: ["import_applicants", "list_jobs"],
    avoid: ["add_applicant"],
    why: "A whole export is one import, dry run first, not forty adds.",
  },
  {
    prompt: "Move Maria to interview.",
    expect: ["move_stage", "list_applications"],
    why: "An explicit ask to move is the person's decision, so moving is right.",
  },
  // --- Messages: the ones that leave the building -----------------------------------
  {
    prompt: "Write a rejection for Ben.",
    expect: ["prep_message", "list_applications"],
    avoid: ["send_message", "save_message"],
    why: "prep_message comes first; sending before the person has read it breaks the one rule about mail.",
  },
  {
    prompt: "Invite the A-tier bookkeepers to the screening form.",
    expect: ["list_jobs", "list_applications", "prep_message"],
    avoid: ["send_message"],
    why: "A batch of invites is drafted and shown first; nothing goes out on the strength of the ask alone.",
  },
  {
    prompt: "Hook up my Gmail so applicants get a confirmation when they apply.",
    expect: ["set_mailbox"],
    avoid: ["send_message", "update_company"],
    why: "The receipt goes out from the connected mailbox.",
  },
  {
    prompt: "We're done hiring for the bookkeeper. Let everyone else down gently and close it.",
    expect: ["close_out_job", "list_jobs"],
    avoid: ["send_message", "move_stage", "update_job"],
    why: "close_out_job drafts the rejections and closes the job as a dry run first.",
  },
  // --- Interviews and offers -----------------------------------------------------
  {
    prompt: "Set up a 30 minute video call with Maria next week and let her pick the time.",
    expect: ["schedule_interview", "list_applications"],
    avoid: ["send_message"],
    why: "The interview with offered slots is recorded first; its booking link goes in a message after.",
  },
  {
    prompt: "My call with Maria went well: strong yes, great with spreadsheets, a bit slow on reconciliations.",
    expect: ["record_scorecard", "list_interviews", "list_applications"],
    avoid: ["add_note"],
    why: "An interviewer's verdict is a scorecard, which the panel view reads.",
  },
  {
    prompt: "Ana did the second interview with Maria. Can she put her own feedback in?",
    expect: ["get_scorecard_link", "list_interviews", "list_applications"],
    avoid: ["record_scorecard"],
    why: "Ana writes her own card through a link; recording one for her invents her verdict.",
  },
  {
    prompt: "Offer Maria 900 a month, start on the 1st.",
    expect: ["record_offer", "list_applications"],
    avoid: ["send_message", "save_message"],
    why: "The offer is recorded as a version first; the email states only what's recorded.",
  },
  // --- Applicant data rights ----------------------------------------------------------
  {
    prompt: "Ben emailed asking us to delete everything we have on him.",
    expect: ["delete_applicant_data", "list_applications"],
    why: "A deletion request, which starts as a dry run.",
  },
  {
    prompt: "A candidate wants to know what data we hold about them, ben@example.com.",
    expect: ["export_applicant_data"],
    avoid: ["get_application", "delete_applicant_data"],
    why: "A data request is the export, archived applications and all.",
  },
  {
    prompt: "How long do we keep applicants' data? Make it two years.",
    expect: ["update_company"],
    why: "Retention is a company setting.",
  },
  // --- The instance -------------------------------------------------------------------
  {
    prompt: "I'm getting a lot of junk applications from bots.",
    expect: ["set_spam_check"],
    why: "The spam check is the answer to bots on the apply page.",
  },
  {
    prompt: "I can't log into Recruited, I forgot my password.",
    expect: ["get_password_reset_link"],
    why: "The connected person can get their own reset link.",
  },
  {
    prompt: "What needs me today?",
    expect: ["daily_brief"],
    why: "The one read for 'what's on'.",
  },
  {
    prompt: "Add my co-founder Sam (sam@acme.test) so they can see the applicants for the bookkeeper role.",
    expect: ["list_jobs", "invite_teammate"],
    why: "A teammate is an invite with a role; a hiring manager needs the job's id first. Not share_applicant, which is one read-only link per applicant.",
  },
];

/** Things that should get an answer in words, with no tool at all. */
export const NO_TOOL_CASES = [
  { prompt: "What's a fair hourly rate for a bookkeeper in the Philippines?", why: "General knowledge; no tool holds pay norms." },
  { prompt: "How does Recruited decide if someone pasted an answer?", why: "A question about the product, answered from the instructions." },
];
