/**
 * How each kind of message to an applicant should be written, and the mailto
 * link that hands a draft to the person's own email. Pure module.
 */

export const MESSAGE_KINDS = ["SCREENING_INVITE", "INTERVIEW_INVITE", "REJECTION", "OFFER", "OTHER"] as const;
export type MessageKindName = (typeof MESSAGE_KINDS)[number];

export const KIND_LABEL: Record<MessageKindName | "RECEIPT", string> = {
  RECEIPT: "Receipt",
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
    "Use the scheduled interview from prep_message for the time, format, length, link and who they'll meet. Where it has a bookingLink instead of a time, give them that link to pick a time themselves. Never invent a time.",
    "Give the time with its time zone, and the applicant's own if you know it.",
    "Say what, if anything, to prepare.",
  ],
  REJECTION: [
    "Short and kind: thank them, say plainly you're not moving forward, wish them well.",
    "Don't give a reason unless the person asked you to include one. Never mention how their answers were typed, pasted or written: provenance is not a reason to give an applicant.",
    "If they reached an interview, thank them for their time specifically.",
    "No invented promises such as 'we'll keep you on file' unless the person said so.",
  ],
  OFFER: [
    "Only the terms in the recorded offer (prep_message returns the latest version) or that the person gave you: title, pay, start date, hours. Never fill a gap with a plausible number.",
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

/**
 * The application receipt: the one message that goes out without a person
 * saying send, and only when they connected a mailbox and left receipts on.
 * It states a fact (the application arrived) and promises nothing, because no
 * one has read it yet. A person may rewrite it; these four placeholders are
 * all it can use.
 */
export const RECEIPT_PLACEHOLDERS = ["first_name", "job", "company", "sender", "status_link"] as const;
export const DEFAULT_RECEIPT_SUBJECT = "We have your application for {job}";
export const DEFAULT_RECEIPT_BODY = `Hi {first_name},

Thanks for applying for {job} at {company}. This is to confirm your application reached us.

You can see where it stands at any time here: {status_link}

{sender}`;

/**
 * Fill the placeholders. A line whose placeholder has no value is dropped
 * whole, so a receipt with no status link doesn't end in "here: ".
 */
export function renderReceipt(template: string, vars: Record<(typeof RECEIPT_PLACEHOLDERS)[number], string>): string {
  const known = (key: string): key is keyof typeof vars => (RECEIPT_PLACEHOLDERS as readonly string[]).includes(key);
  return template
    .split("\n")
    .filter((line) => ![...line.matchAll(/\{(\w+)\}/g)].some(([, key]) => known(key) && !vars[key]))
    .join("\n")
    .replace(/\{(\w+)\}/g, (whole, key: string) => ((RECEIPT_PLACEHOLDERS as readonly string[]).includes(key) ? vars[key as keyof typeof vars] : whole))
    .replace(/ +([.,])/g, "$1")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
