/**
 * The job boards Recruited writes listings for, and what each one wants.
 *
 * A board guide is what turns "post this job on Indeed" into a listing that
 * survives the board's own review and reads well to the people who browse it.
 * The guides are served to assistants by `get_board_guide`, and the format
 * functions at the bottom turn one markdown description into the shape each
 * board's post-a-job form accepts.
 *
 * Pure module: no imports from the app, so tools/rules.test.mjs can load it.
 *
 * Limits and rules change. Each guide says what was true when it was written;
 * when a board rejects something, fix the guide here and every assistant gets
 * the correction on its next call.
 */

export type BoardFormat = "plain" | "html" | "rich";

export type Board = {
  key: string;
  name: string;
  /** Where an employer goes to post. */
  postUrl: string;
  /** What the description field accepts. "rich" means a pasteable editor that keeps bold and bullets. */
  format: BoardFormat;
  titleMax: number;
  bodyMax: number;
  /** The fields the post-a-job form asks for, in the order it asks. */
  fields: string[];
  /** How pay is conventionally stated on this board. */
  salary: string;
  /** Who reads listings here, in a sentence. */
  audience: string;
  /** Rules that get a listing rejected or buried. Follow them. */
  rules: string[];
  /** What makes a listing here do better. */
  craft: string[];
  /** How applicants reach you, and where the apply link goes. */
  applyFlow: string;
};

export const BOARDS: Board[] = [
  {
    key: "linkedin",
    name: "LinkedIn Jobs",
    postUrl: "https://www.linkedin.com/talent/post-a-job",
    format: "rich",
    titleMax: 100,
    bodyMax: 10000,
    fields: [
      "Job title",
      "Company",
      "Workplace type (on-site, hybrid, remote)",
      "Job location",
      "Job type",
      "Description",
      "Skills (up to 10)",
      "Screening questions (optional)",
      "Apply method: LinkedIn Easy Apply or an external website",
    ],
    salary: "A pay range in the local currency per year (or per hour for hourly roles). Several US states and the EU require a range in the posting.",
    audience: "Employed professionals browsing on their phone; most are passive and decide in the first three lines.",
    rules: [
      "The title is a real job title only: no pay, no location, no emoji, no ALL CAPS, no 'urgent'.",
      "Do not ask for age, photo, marital status or anything else a discrimination law protects.",
      "Choose 'external website' as the apply method and paste the Recruited apply link, or the application will stay inside LinkedIn and never reach the pipeline.",
    ],
    craft: [
      "Open with what the person will own in their first six months, not with the company history.",
      "Short paragraphs and bullet lists; the editor keeps bold and bullets when you paste.",
      "Name the tools and the team size. Specifics beat adjectives.",
      "State the pay range even where it is not required; listings with pay get more qualified applicants.",
      "Add the skills LinkedIn suggests only if the job really needs them: they drive who sees the post.",
    ],
    applyFlow: "Set Apply method to 'External website' and paste the listing's apply link.",
  },
  {
    key: "indeed",
    name: "Indeed",
    postUrl: "https://employers.indeed.com/",
    format: "html",
    titleMax: 100,
    bodyMax: 20000,
    fields: [
      "Job title",
      "Job location type and address",
      "Job type and schedule",
      "Pay (range, rate and period)",
      "Benefits",
      "Description",
      "Application settings (resume required, screener questions)",
    ],
    salary: "A range with a rate period (per hour, per month, per year). Indeed shows an estimate when you leave it blank, which is usually worse than your real number.",
    audience: "Active job seekers, many applying to dozens of postings a day. Volume is high and fit is mixed.",
    rules: [
      "The title is the job title only: no pay, no company name, no 'apply now', no special characters, no ALL CAPS.",
      "No external links that ask for payment, and no requests for bank or ID details.",
      "Indeed may hold a posting for review when the description is very short or vague; write at least a few real paragraphs.",
      "Indeed's own Apply keeps applicants in Indeed. To route them into Recruited, put the apply link in the description and say it is the way to apply, or use the screener questions to send them there.",
    ],
    craft: [
      "Put pay, schedule and location in the structured fields as well as the text; Indeed filters on the fields.",
      "Lead with the schedule and pay for hourly roles; that is what the reader is scanning for.",
      "Use plain headings: What you'll do, What you need, Pay and benefits, How to apply.",
      "Keep must-haves to five or six. Long lists depress applications without raising quality.",
    ],
    applyFlow: "Paste the apply link under a 'How to apply' heading in the description.",
  },
  {
    key: "onlinejobs_ph",
    name: "OnlineJobs.ph",
    postUrl: "https://www.onlinejobs.ph/employers/jobs/post",
    format: "plain",
    titleMax: 100,
    bodyMax: 8000,
    fields: [
      "Job title",
      "Employment type (full-time, part-time, gig)",
      "Job description",
      "Wage or salary",
      "Hours per week",
      "Skills (pick three from the board's list)",
    ],
    salary: "PHP per month for full-time and part-time, or PHP/USD per hour for gigs. Full-time means 40 hours a week. Propose the lower middle of the market band so quality applicants still apply.",
    audience: "Filipino remote workers, many second-language English speakers, scanning dozens of posts a session.",
    rules: [
      "Salary, hours and contact details go in their own fields, not in the description.",
      "Plain text only: the description field keeps line breaks and nothing else.",
      "Pick three skills from OLJ's fixed list; suggest the closest three and let the employer swap them.",
    ],
    craft: [
      "The first two lines are the outcome the worker is hired to deliver.",
      "Name the tools and the daily volume: 'Edit 2 to 3 sixty-second shorts a day in CapCut'.",
      "Four to six must-haves and two or three nice-to-haves. Plain, direct English; no 'rockstar', 'ninja' or 'synergy'.",
      "Say there is a screener: 'Shortlisted applicants get a short form to fill in before an interview.' It cuts spray-and-pray applications.",
      "Remote readiness matters as much as skill: the screener should ask about internet speed, a backup power source and the work setup.",
    ],
    applyFlow: "Add a closing line 'To apply, fill in this form:' with the apply link. Applicants also message you on OLJ; send those people the same link.",
  },
  {
    key: "wellfound",
    name: "Wellfound",
    postUrl: "https://wellfound.com/recruit",
    format: "rich",
    titleMax: 80,
    bodyMax: 10000,
    fields: ["Title", "Job type", "Location and remote policy", "Salary range", "Equity range", "Description", "Skills"],
    salary: "Salary range and equity range are both expected; listings without them rank lower.",
    audience: "People who want to work at a startup and compare equity, stage and team.",
    rules: ["Salary and equity ranges are required for most listings.", "Remote listings must say which time zones or countries are allowed."],
    craft: [
      "Say the stage, the team size and who they will work with directly.",
      "Explain the equity in one honest sentence.",
    ],
    applyFlow: "Paste the apply link in the description; Wellfound applications also arrive in its inbox, so add those people with add_applicant.",
  },
  {
    key: "upwork",
    name: "Upwork",
    postUrl: "https://www.upwork.com/nx/job-post/",
    format: "plain",
    titleMax: 75,
    bodyMax: 5000,
    fields: ["Headline", "Skills", "Scope (size, duration, experience level)", "Budget (hourly or fixed)", "Description", "Screening questions"],
    salary: "Hourly range or a fixed price for the whole project.",
    audience: "Freelancers bidding on work; they read the first two lines in search results.",
    rules: [
      "Upwork prohibits asking freelancers to communicate or be paid outside Upwork before a contract starts. Use Upwork's own screening questions for pre-contract screening, and add hires to Recruited with add_applicant.",
    ],
    craft: ["State the deliverable and the deadline first.", "Ask one specific question that only someone who read the post can answer."],
    applyFlow: "Do not put an external apply link in an Upwork post. Add proposals you want to track with add_applicant, source 'upwork'.",
  },
  {
    key: "careers",
    name: "Your careers page",
    postUrl: "",
    format: "rich",
    titleMax: 120,
    bodyMax: 20000,
    fields: ["Title", "Description"],
    salary: "A range and a period. Google for Jobs shows it, and listings with pay get more clicks.",
    audience: "People who searched Google for the role, or came to your site looking for openings.",
    rules: [
      "Only LIVE careers listings show on the careers page and reach Google, so mark one LIVE when the role is ready.",
      "Google for Jobs reads the title, the pay, the location and the description from the apply page itself; keep the title a plain job title.",
    ],
    craft: ["Same structure as everywhere: what they will do, what they need, pay, how you work."],
    applyFlow:
      "Recruited hosts it: the careers page at /careers/<your careers slug> lists every open job with a LIVE careers listing, and that listing's apply page is the one Google indexes. Set the slug with update_company.",
  },
  {
    key: "generic",
    name: "Anywhere else",
    postUrl: "",
    format: "rich",
    titleMax: 120,
    bodyMax: 20000,
    fields: ["Title", "Description"],
    salary: "A range and a period.",
    audience: "Anyone who followed a link: a newsletter, a Slack community, a friend. Not indexed by search engines.",
    rules: [],
    craft: ["Same structure as everywhere: what they will do, what they need, pay, how to apply."],
    applyFlow: "Share the apply link directly.",
  },
];

export const BOARD_KEYS = BOARDS.map((b) => b.key);

export function boardByKey(key: string): Board | undefined {
  return BOARDS.find((b) => b.key === key);
}

// ---------------------------------------------------------------------------
// Rendering one markdown description into each board's format
// ---------------------------------------------------------------------------

/**
 * The markdown Recruited accepts is deliberately small: headings (#, ##, ###),
 * bullet lines (- or *), numbered lines, **bold**, *italic*, [links](url) and
 * paragraphs. That is everything a job board can keep, so writing more would
 * only produce something that does not survive the paste.
 */
type Block =
  | { kind: "heading"; text: string }
  | { kind: "para"; text: string }
  | { kind: "list"; ordered: boolean; items: string[] };

export function parseMarkdown(md: string): Block[] {
  const blocks: Block[] = [];
  const lines = md.replace(/\r\n?/g, "\n").split("\n");
  let para: string[] = [];
  let list: { ordered: boolean; items: string[] } | null = null;
  const flushPara = () => {
    if (para.length) blocks.push({ kind: "para", text: para.join(" ").trim() });
    para = [];
  };
  const flushList = () => {
    if (list) blocks.push({ kind: "list", ...list });
    list = null;
  };
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) {
      flushPara();
      flushList();
      continue;
    }
    const heading = /^#{1,6}\s+(.*)$/.exec(line);
    const bullet = /^[-*•]\s+(.*)$/.exec(line);
    const numbered = /^\d+[.)]\s+(.*)$/.exec(line);
    if (heading) {
      flushPara();
      flushList();
      blocks.push({ kind: "heading", text: heading[1].trim() });
    } else if (bullet || numbered) {
      flushPara();
      const ordered = !!numbered;
      if (list && list.ordered !== ordered) flushList();
      if (!list) list = { ordered, items: [] };
      list.items.push((bullet ?? numbered)![1].trim());
    } else {
      flushList();
      para.push(line);
    }
  }
  flushPara();
  flushList();
  return blocks;
}

function escapeHtml(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function inlineHtml(s: string) {
  return escapeHtml(s)
    .replace(/\*\*(.+?)\*\*/g, "<b>$1</b>")
    .replace(/(^|[^*])\*(?!\s)(.+?)\*/g, "$1<i>$2</i>")
    .replace(/\[(.+?)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2">$1</a>');
}

function inlinePlain(s: string) {
  return s
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/(^|[^*])\*(?!\s)(.+?)\*/g, "$1$2")
    .replace(/\[(.+?)\]\((https?:\/\/[^\s)]+)\)/g, "$1 ($2)");
}

export function toHtml(md: string): string {
  return parseMarkdown(md)
    .map((b) => {
      if (b.kind === "heading") return `<p><b>${inlineHtml(b.text)}</b></p>`;
      if (b.kind === "para") return `<p>${inlineHtml(b.text)}</p>`;
      const tag = b.ordered ? "ol" : "ul";
      return `<${tag}>${b.items.map((i) => `<li>${inlineHtml(i)}</li>`).join("")}</${tag}>`;
    })
    .join("\n");
}

/**
 * Plain text for boards whose description field keeps nothing but line breaks.
 * Headings become a line of their own and bullets become "• ", so the
 * structure survives without markup. Rich editors (LinkedIn, Wellfound) get the
 * same text: their editors turn pasted bullets back into lists.
 */
export function toPlain(md: string): string {
  return parseMarkdown(md)
    .map((b) => {
      if (b.kind === "heading") return inlinePlain(b.text);
      if (b.kind === "para") return inlinePlain(b.text);
      return b.items.map((i, n) => `${b.ordered ? `${n + 1}.` : "•"} ${inlinePlain(i)}`).join("\n");
    })
    .join("\n\n");
}

export type RenderedListing = {
  board: string;
  format: BoardFormat;
  title: string;
  body: string;
  /** Problems a person should fix before pasting. Empty means ready. */
  warnings: string[];
};

/**
 * One listing in the shape its board accepts, with the apply link appended
 * where the board allows one, and the problems a board would reject it for.
 */
export function renderListing(
  boardKey: string,
  title: string,
  markdown: string,
  applyUrl: string,
): RenderedListing {
  const board = boardByKey(boardKey) ?? boardByKey("generic")!;
  const withLink =
    board.key === "upwork" || !applyUrl
      ? markdown
      : `${markdown.trim()}\n\n## How to apply\n\nApply here: ${applyUrl}`;
  const body = board.format === "html" ? toHtml(withLink) : toPlain(withLink);
  const warnings = lintListing(board, title, body);
  return { board: board.key, format: board.format, title: title.trim(), body, warnings };
}

export function lintListing(board: Board, title: string, body: string): string[] {
  const w: string[] = [];
  const t = title.trim();
  if (!t) w.push("The title is empty.");
  if (t.length > board.titleMax) w.push(`The title is ${t.length} characters; ${board.name} allows ${board.titleMax}.`);
  if (body.length > board.bodyMax) w.push(`The description is ${body.length} characters; ${board.name} allows about ${board.bodyMax}.`);
  if (t.length > 4 && t === t.toUpperCase() && /[A-Z]/.test(t)) w.push("The title is in capitals; boards bury or reject that.");
  if (/[$₱€£]\s?\d|\d+\s?(k|K)\b|\bper (hour|month|year)\b/.test(t)) w.push("The title states pay; put pay in the salary field instead.");
  if (/\b(urgent|asap|apply now|hiring now)\b/i.test(t)) w.push("The title has a call to action ('urgent', 'apply now'); boards reject those.");
  if (/\p{Extended_Pictographic}/u.test(t)) w.push("The title has an emoji; most boards reject them.");
  if (board.key === "onlinejobs_ph" && /(₱|PHP|php)\s?\d|\b\d+\s?hours? (a|per) week\b/.test(body))
    w.push("OnlineJobs.ph has its own wage and hours fields; take pay and hours out of the description.");
  if (/\b(age|years old|marital status|religion)\b/i.test(body))
    w.push("The description mentions age, marital status or religion; remove anything a discrimination law protects.");
  return w;
}
