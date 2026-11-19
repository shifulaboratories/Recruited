# Decisions

Append-only. Newest at the bottom. A later entry supersedes an earlier one on the same subject.

## 2026-11-17 — The foundation

**Same stack and shape as Hired.** Next.js, Prisma, Postgres, a hand-written stateless MCP
transport, `userId` first in every data function, `DATABASE_URL` the only setting. A person
who has run Hired can run this.

**Provenance is two kinds of evidence, kept apart.** Origin comes from the browser's own
`beforeinput` input types (insertText, insertFromPaste, insertFromDrop,
insertReplacementText); growth with no event before it is "injected" (autofill, an
extension, a script). Typing faster than 25 characters a second over 150 characters counts
as injected, because auto-typers exist to beat paste detection; Playwright typing at 40 cps
was caught by it in testing. Style signals (stock phrases, chat-reply openers, markdown in a
form field, uniform sentence lengths, em dashes, lists of three) are a separate, weaker
score, labelled "likely written with AI" at 0.5 and above. The brand kit's rule: never
proof, never red. The form tells applicants what it records, and stores counts and timings,
not keystrokes.

**Boards are guides, not integrations.** No posting API is available to a small employer on
these boards without a partner agreement, so a listing is rendered for pasting and Claude
marks it live. Each listing has its own apply link, which is the attribution and makes an A/B
test free. Upwork forbids moving freelancers off-platform before a contract, so its listings
get no apply link and applicants are added with `add_applicant`.

**Knockouts mark, never reject.** `Application.qualified` is false when a must-have was
missed; the stage doesn't change.

## 2026-11-17 — Tiers: the assistant proposes, the person decides

William picked tiers and ranking as the next step. An application carries two tiers: the
person's decision (`tier`, set in the app or by telling Claude, through `set_tier`) and the
assistant's proposal (`proposedTier` with a reason and a rank, from `rank_applicants`). A
ranking never overwrites a decision; it returns which applicants already have one so the
assistant can say where it disagrees. Everywhere a single tier is needed, the decision wins
and the proposal stands in until there is one; `tierIsProposal` and the dashed chip say so,
and `listing_report` counts how many of its tier numbers are still proposals.

A reason of at least 15 characters is required per applicant, because an unexplained tier
is not something a person can check. Each ranking is one pass: applicants left out lose
their old rank but keep their proposed tier. Jobs gained a free-text `rubric` ("what makes
an A"), which `rank_applicants` follows and `review_applicants` asks for when it's empty.
The tool description repeats the provenance rule: it never moves anyone down on its own.

## 2026-11-17 — File questions keep their bytes in Postgres

OnlineJobs.ph screeners ask for a setup photo, a speed test and a typing test, and links to
them were a poor substitute. A `file` question takes one image or PDF up to 10 MB (25 MB a
submission). The bytes live in an `Upload` row under the answer, the call Hired's
Attachment made, so `DATABASE_URL` stays the only setting; every read names its columns and
only the download and `read_upload` select `data`. The type is sniffed from the first
bytes and the browser's claim is ignored, so an HTML file renamed .png is refused. Files are
served only to the signed-in owner, with nosniff and a sandbox CSP.

`read_upload` returns MCP image content rather than a link, because the owner-only URL is
useless to an assistant without a session, and seeing the screenshot is the point: Claude
can check "87 Mbps" against a 25 Mbps must-have. HEIC goes back as a document since clients
can't show it. Forms with files post multipart with the same JSON in a `payload` field;
forms without files still post JSON.

## 2026-11-17 — Messages are drafts and a record; the server never sends mail

Sending from Recruited would mean SMTP settings (breaking the one-variable rule) and mail
arriving from an address the applicant doesn't know. Instead a `Message` is a draft until
the person sends it from their own email, through their assistant's mail connector or the
app's Open in email (a mailto link; past 1,800 characters the app offers Copy, since mail
clients cut long mailto links), and is then marked SENT. A sent message can't be edited,
deleted or turned back into a draft, so the applicant's page is a true log of what they
were told and when.

Two tools rather than four: `prep_message` gathers what a message needs (the applicant's
personal screening links, whether each form is already filled in and which files it asks
for, what they were sent before) plus per-kind guidance from `src/lib/messages.ts`, and
`save_message` adds a draft or, with `message_id`, edits one or marks it sent. The guidance
carries the rules that matter most: never invent a time, pay figure or reason, and never
mention how an applicant's answers were typed or pasted in anything sent to them. The
server instructions add that nothing goes to an applicant without the person's approval.

## 2026-11-17 — Board imports match columns by header, preview by default

Indeed and LinkedIn both export applicants as CSV, but neither documents its headers and
both change them, so `src/lib/csv.ts` matches columns against aliases ("Email Address",
"E-mail", "Contact email") and joins first and last name when there's no full-name column.
When the email or name column can't be found, the error lists the headers, and the
assistant names the right one with `columns`. Every column that isn't a contact detail is
kept as a note on the applicant ("candidate location", "relevant experience"), because it's
what the board knew about them and there's nowhere better to put it.

`import_applicants` defaults to `dry_run: true`, as Hired's `import_resume` does: a bad
column guess on a thousand rows is expensive to undo. The real run goes through
`addApplicant` for each row, so an import follows the same rules as adding one person, and
people already in the job are reported, never added twice. The board is guessed from the
headers only to label `source` when no listing is given. Imported applicants have no
answers and so no provenance, which the tool description says.

## 2026-11-17 — Interviews, scorecards and offers are records; none of them decides

Four tools, not eight. `schedule_interview` adds a round or, with `interview_id`, changes
one (status included); `record_scorecard` adds one interviewer's verdict; `record_offer`
writes a new offer version or, with `offer_id`, changes only a version's status;
`list_interviews` answers "what's on this week" across jobs. `get_application` returns the
interviews, scorecards and offers, so there's no separate getter.

Offers are versions, as in Hired: terms left out carry over from the version before, a
counter is one field, and "nothing changed" is refused so versions mean something. A
status change edits the version in place, because it isn't a new term. A scorecard marks
its interview DONE, since a verdict means the conversation happened; that is the only
automatic change. Nothing moves an applicant's stage or tier: the panel summary
(yes/no counts, whether anyone said strong no, whether it's split) is shown, never acted on.

Times are stored in UTC. Tools take ISO 8601 with an offset; the page renders times in
the viewer's browser and its picker submits an ISO string with the viewer's offset, because
the server can't know the person's time zone. `prep_message` now returns the scheduled
rounds and the latest offer, so an invite or an offer email states only what was recorded.

## 2026-11-17 — Deploy the way Hired does: Nixpacks on Railway, Docker for everything else

`railway.json` builds with Nixpacks and only runs `npm run build` (Hired found that running
`npm ci` again there fails with EBUSY on the cache mount). The Dockerfile lives in
`docker/`, not the root, because Railway prefers a root Dockerfile over the configured
builder, and Hired's image never passed Railway's healthcheck. Unlike Hired's, the image
ships no browser, since nothing here renders a PDF; it only adds openssl for Prisma.

The base image is an `ARG` so a build can use a mirror when Docker Hub rate-limits, which
happened while testing this. A one-click Railway template has to be published from a
Railway account, so the repo carries the config and docs/DEPLOY.md the steps; publishing
the template is William's to do.

## 2026-11-17: The landing page reuses hired.tools' page system

site/styles.css and site/motion.js are copies of Hired's, retuned to Recruited's
tokens (primary, tiers, provenance) and with the 3D mark rebuilt for the person
glyph. Copied rather than shared because the two sites deploy separately and
Recruited has no dependency on Hired. Recruited-only rules sit at the bottom of
styles.css. No pricing and no waitlist on the page: there is no hosted plan and
no signup backend, so both CTAs go to the deploy guide and the repository.

## 2026-11-17: The app wears the landing page's look

William found the product "mid" and chose a visual rebuild over new features.
The app now uses the landing page's language: a grey canvas with white cards
lit by a rim-plus-shadow (`--rt-shadow-card`), segmented controls for stage,
tier and statuses, toned chips, and one-shot arrival animations (`.rise`,
`.draw`) that stop for reduced motion. New pieces: `src/components/ui.tsx`
(icons, headers, stats, empty states, avatars), `nav.tsx`, and `board.tsx`,
a drag-and-drop pipeline that calls the same `moveStage` action as the
applicant page. No data or tool changed. A true "replay" of how an answer was
written was considered and left out: the form promises counts and timings,
never keystrokes, and a replay would need the keystrokes.

## 2026-11-18: Twelve features, no new screens

William asked for all twelve ideas from the "make it better" list. They went
into the screens that exist, to keep the three-screen rule: the applicant page
gained Ask on the call, Share, References and booking state; the job page a
Close the loop card and a Leading badge; the jobs page a Today list; settings
the company profile and the sample workspace. Calls worth remembering:

- Work samples are a question type (`task`), not a new model or tool: they
  ride on screening forms and screening links, and their answers get
  provenance like any written answer.
- Video answers are stored in Postgres like files (40 MB each, 60 MB a
  submission) to keep DATABASE_URL the only setting. Browsers write WebM
  without a duration, so `RecordedVideo` nudges the player once to find it,
  and `/files/[id]` answers byte ranges (Safari won't play without them).
- Reference questions are fixed (four), so referees can be compared, and
  answers are plain text: provenance is for applicants' own answers only.
- Booking stores offered times on the Interview (`slots`, `bookToken`); the
  pick clears the slots in the same conditional write, so two picks can't both
  land. Times render after mount, in the viewer's zone.
- `close_out_job` never touches OFFER or HIRED and skips anyone with a
  REJECTION message, drafted or sent; the tool says to dry-run first.
- The shared applicant link is the one public page that shows answers, so it
  is off by default, cleared rather than hidden when turned off, and leaves out
  contact details, notes, messages and files.
- The sample workspace marks the Job and Candidates `sample`; wiping deletes
  only those and lets cascades take the rest.

## 2026-11-19 — The probe and the CI gate

- PR #9 merged whole after the probe passed against it (William's call on the
  roadmap's first open decision); splitting 3,800 lines would have cost more
  than it caught.
- `tools/probe.mjs` is ported from Hired's, loading src/ through jiti. Unlike
  Hired's, it keeps a set of the tools it called and fails when one in `TOOLS`
  has no case, so coverage can't quietly fall behind the array.
- The cross-workspace checks only count if the owner could make the same call:
  each crossing was run once as the owner while writing it, and three that
  failed on validation instead of the boundary were fixed. Keep that true when
  adding one.
- Recruited gets a CI gate where Hired has none, because the roadmap invites
  design partners and other contributors; Railway still deploys main directly.

## 2026-11-19 — Flood protection on the public pages

- Limits are counted in Postgres (`RateHit`), not memory, so they hold across
  restarts and replicas. The key is a SHA-256 of the address and the route, so
  the table can't be turned back into a list of who applied.
- 20 posts per address per form an hour, 60 across all forms. Loose on
  purpose: applicants on Philippine mobile networks share public addresses
  behind carrier NAT. The duplicate-email check does the fine work.
- The address is X-Real-IP, else the LAST X-Forwarded-For entry. The first
  entry is what the caller claims and a bot can rotate it.
- A filled honeypot gets a 200 and saves nothing, rather than an error, so a
  bot can't learn to skip it. No real person sees the field.
- A failed count lets the post through: losing an application is worse than
  letting a burst in.
- instrumentation.ts must keep its dynamic import inside the
  `NEXT_RUNTIME === "nodejs"` branch; after an early return Next still bundles
  it for edge and `npm run dev` breaks on node:crypto.
