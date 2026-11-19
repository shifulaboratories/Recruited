import type { TeamRole } from "@prisma/client";

/**
 * Who on a team may do what. Pure: the database side (seats, invites, the
 * checks against a row) is src/lib/data/team.ts.
 *
 * Four fixed roles, never custom permissions. The owner is the account the
 * workspace belongs to. A recruiter does the hiring. A hiring manager sees only
 * the jobs they were given. An interviewer sees only interviews they're on the
 * panel of, and writes their own scorecard.
 */

export const TEAM_ROLES = ["OWNER", "RECRUITER", "HIRING_MANAGER", "INTERVIEWER"] as const satisfies readonly TeamRole[];
/** The roles a teammate can be given. There is one owner: the workspace's own account. */
export const MEMBER_ROLES = ["RECRUITER", "HIRING_MANAGER", "INTERVIEWER"] as const satisfies readonly TeamRole[];

export const ROLE_LABEL: Record<TeamRole, string> = {
  OWNER: "Owner",
  RECRUITER: "Recruiter",
  HIRING_MANAGER: "Hiring manager",
  INTERVIEWER: "Interviewer",
};

export const ROLE_SUMMARY: Record<TeamRole, string> = {
  OWNER: "Everything, including the team, the company profile, the mailbox and deleting an applicant's data.",
  RECRUITER: "Everything in hiring: jobs, listings, forms, applicants, interviews, offers and messages. Not the team or the company settings.",
  HIRING_MANAGER: "Only the jobs you give them: reading applicants, moving stages, notes, tiers, interviews and scorecards. No messages or offers.",
  INTERVIEWER: "Only the interviews they're on: the applicant's application and their own scorecard.",
};

/** The same, said to the teammate: on their invite and in their own Settings. */
export const ROLE_FOR_YOU: Record<TeamRole, string> = {
  OWNER: "You see and change everything.",
  RECRUITER: "You run the hiring: jobs, listings, forms, applicants, interviews, offers and messages. The owner keeps the team and the company settings.",
  HIRING_MANAGER: "You see the jobs the owner gives you: their applicants, stages, notes, tiers, interviews and scorecards.",
  INTERVIEWER: "You see the interviews you're on, the applicant's answers for them, and you write your own scorecard.",
};

/** Full access to hiring: every job, every applicant. */
export function seesEverything(role: TeamRole) {
  return role === "OWNER" || role === "RECRUITER";
}

/**
 * The tools each narrow role gets. Owner and recruiter get every tool except
 * OWNER_TOOLS, which only the owner gets. A tool not listed here is hidden from
 * a narrow role's tools/list, not merely refused.
 */
export const SCOPED_TOOLS: Record<"HIRING_MANAGER" | "INTERVIEWER", readonly string[]> = {
  HIRING_MANAGER: [
    "list_jobs",
    "get_job",
    "list_applications",
    "get_application",
    "read_upload",
    "set_tier",
    "move_stage",
    "add_note",
    "save_probes",
    "schedule_interview",
    "list_interviews",
    "get_scorecard_link",
    "record_scorecard",
    "list_team",
    "get_password_reset_link",
  ],
  INTERVIEWER: ["list_interviews", "get_application", "read_upload", "record_scorecard", "list_team", "get_password_reset_link"],
};

export const OWNER_TOOLS: readonly string[] = [
  "invite_teammate",
  "update_teammate",
  "update_company",
  "set_mailbox",
  "delete_applicant_data",
  "set_spam_check",
  "instance_health",
  "load_sample_workspace",
  "wipe_sample_workspace",
];

export function toolAllowed(role: TeamRole, name: string) {
  if (role === "OWNER") return true;
  if (role === "RECRUITER") return !OWNER_TOOLS.includes(name);
  return SCOPED_TOOLS[role].includes(name);
}

/** One job, the allowed jobs, or both: the one job if it's allowed, else none. A Prisma filter on jobId. */
export function jobScope(jobId: string | undefined, jobIds: string[] | undefined): { jobId?: string | { in: string[] } } {
  if (jobIds) return { jobId: { in: jobId ? jobIds.filter((j) => j === jobId) : jobIds } };
  return jobId ? { jobId } : {};
}
