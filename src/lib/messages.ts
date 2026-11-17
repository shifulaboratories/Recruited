/**
 * How each kind of message to an applicant should be written, and the mailto
 * link that hands a draft to the person's own email. Pure module.
 */

export const MESSAGE_KINDS = ["SCREENING_INVITE", "INTERVIEW_INVITE", "REJECTION", "OFFER", "OTHER"] as const;
export type MessageKindName = (typeof MESSAGE_KINDS)[number];

export const KIND_LABEL: Record<MessageKindName, string> = {
  SCREENING_INVITE: "Screening invite",
  INTERVIEW_INVITE: "Interview invite",
  REJECTION: "Rejection",
  OFFER: "Offer",
  OTHER: "Message",
};

/** What the assistant is told before it writes each kind. */
export const KIND_GUIDANCE: Record<MessageKindName, string[]> = {
  SCREENING_INVITE: [
    "Thank them for applying and name the role.",
    "Put their personal screening link on its own line; it identifies them, so it goes to this person only.",
    "Say how long the form takes and by when you'd like it back, if the person told you.",
    "If the form asks for files, say which ones so they can get them ready.",
  ],
  INTERVIEW_INVITE: [
    "Name the role, the format (video, phone, in person), the length and who they'll meet.",
    "Offer times or a booking link only if the person gave them; never invent a time.",
    "Say what, if anything, to prepare.",
  ],
  REJECTION: [
    "Short and kind: thank them, say plainly you're not moving forward, wish them well.",
    "Don't give a reason unless the person asked you to include one. Never mention how their answers were typed, pasted or written: provenance is not a reason to give an applicant.",
    "If they reached an interview, thank them for their time specifically.",
    "No invented promises such as 'we'll keep you on file' unless the person said so.",
  ],
  OFFER: [
    "Only the terms the person gave you: title, pay, start date, hours. Never fill a gap with a plausible number.",
    "Say what happens next and by when you need an answer, if the person said.",
  ],
  OTHER: ["Plain, direct, second person. Say why you're writing in the first sentence."],
};

/** A mailto: link that opens the person's own email with the draft filled in. */
export function mailtoLink(to: string, subject: string, body: string): string {
  const q = [subject && `subject=${encodeURIComponent(subject)}`, body && `body=${encodeURIComponent(body)}`].filter(Boolean).join("&");
  return `mailto:${encodeURIComponent(to).replace(/%40/g, "@")}${q ? `?${q}` : ""}`;
}

/**
 * Mail clients cut mailto links somewhere past 2,000 characters. Past this
 * length the app offers copy instead of "Open in email".
 */
export const MAILTO_SAFE_LENGTH = 1800;
