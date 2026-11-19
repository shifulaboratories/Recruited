/**
 * What an applicant sees about their own application on /status/<token>.
 * Pure. Three states and nothing finer, because the page must never tell an
 * applicant something the team hasn't told them yet:
 *
 * - "received" while they are NEW;
 * - "closed" only once a rejection was actually sent, or the job closed
 *   (unless they were hired or have an offer, which they hear about directly);
 * - "in_review" for everything else, including someone moved to REJECTED
 *   whose rejection hasn't gone out. The stage is the team's working state;
 *   the message is what the applicant was told.
 */

export type PublicStatus = "received" | "in_review" | "closed";

export function publicStatusOf(i: { stage: string; jobStatus: string; rejectionSent: boolean }): PublicStatus {
  if (i.stage === "REJECTED" && i.rejectionSent) return "closed";
  if (i.jobStatus === "CLOSED" && i.stage !== "HIRED" && i.stage !== "OFFER") return "closed";
  if (i.stage === "NEW") return "received";
  return "in_review";
}

export const STATUS_COPY: Record<PublicStatus, { title: string; text: string }> = {
  received: {
    title: "Received",
    text: "Your application is in. This page changes as it moves along.",
  },
  in_review: {
    title: "Under review",
    text: "Someone is looking at your application. If they need anything from you, it shows below and you'll hear from them by email.",
  },
  closed: {
    title: "Closed",
    text: "This application is no longer being considered, or the role has closed. Thank you for the time you put into it.",
  },
};

export function statusPath(token: string) {
  return `/status/${encodeURIComponent(token)}`;
}
