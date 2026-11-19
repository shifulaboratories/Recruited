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

## 2026-11-19 — Password reset without mail

- Two ways to a reset link, because the server sends no mail: the connected
  assistant (`get_password_reset_link`, for the connection's own account
  only) and "Forgot your password?", which prints the link to the server log.
  The MCP token already reads everything in the workspace, so a link behind it
  grants nothing new.
- The forgot form answers the same whether or not the address has an
  account, and is rate limited with the public forms.
- Tokens are stored as SHA-256. The link is spent in the same conditional
  write that checks it, and a reset ends every session the account had.
- When connected mail lands (roadmap item 11), the forgot form should email
  the link too; the log stays as the fallback for a self-hoster with no mail.

## 2026-11-19 — Turnstile, and where settings live

- Instance configuration goes in a `Setting` table (key, value), changed by
  the owner from Settings or by tool, never by an environment variable. The
  first use is Turnstile's two keys. Secrets are written and never read back
  out to a page or a tool.
- Turnstile guards the open apply page only. Screening, reference and booking
  links are personal tokens, and asking a referee to solve a check is rude.
- Turnstile fails open when Cloudflare is unreachable, like the rate limit:
  someone else's outage shouldn't cost a real application.
- The probe uses Cloudflare's published test keys (1x… always passes, 2x…
  always fails), so CI checks the real siteverify call.

## 2026-11-19 — Backups and the error log

- Compose gets a `backup` service (the postgres image running pg_dump once a
  day into ./backups, keeping 14), not a cron on the host, so it works with
  the one command self-hosters already run. A dump and restore round trip
  was checked with pg_dump and pg_restore 16.
- Railway backups are a setting on the Postgres service, not something the
  app can turn on; DEPLOY.md points at the Backups tab.
- Caught errors go to `ErrorEvent` through `recordError`, which still writes
  the console line and never throws. Messages are cut to 500 characters.
  They can carry fragments of whatever failed, which is why only the owner
  reads them and only through `instance_health`.
- No screen for health yet: it's a question you ask Claude when something
  breaks. Add one if real use asks for it.

## 2026-11-19 — Careers page and JobPosting

- The careers page is a board (`careers`), not a new model: each job reaches
  it through a listing like any board, so attribution, split tests and
  listing_report keep working, and "careers page" shows up as a source.
- Only a LIVE careers listing's apply page is indexable and carries
  JobPosting. Every other apply link stays noindex, so Google never sees one
  job five times and per-board attribution isn't polluted by search traffic.
- The careers address is a slug on User, unique per instance, set by the
  person. No default: a page shouldn't go public until someone names it.
- JobPosting leaves out anything not entered (no pay range, no baseSalary)
  rather than guessing, in line with the no-fabrication rule.

## 2026-11-19 — Mail goes from the person's own mailbox; only the receipt goes by itself

William chose "your mailbox over SMTP first: receipts automatic, everything else waits for
a yes". This supersedes "the server never sends mail" from 17 Nov in one respect: once a
person connects their own mailbox, Recruited sends from it. It still never sends as
itself, which is what that entry protected.

- SMTP rather than Gmail and Microsoft OAuth first: it covers both (with an app password)
  and every other host, needs no OAuth client registered per instance, and keeps
  `DATABASE_URL` the only variable, since the settings live in the `Mailbox` row. OAuth can
  come later as another way to fill the same row.
- nodemailer for the wire, pinned to 10.3.x (not the newest release, which was days old).
  Hand-writing SMTP with STARTTLS and AUTH is where bugs live.
- The receipt is the only automatic message. It states a fact and promises nothing, and
  the rules test fails if the built-in wording promises a reply or a timeline. It goes
  after the response with `after()`, so a slow or broken mail server never reaches the
  applicant; a receipt that can't go stays as a draft with the reason, which the daily
  brief shows. One per application.
- Where Hired makes approval a click no tool can make, Recruited lets `send_message` send
  after the person says send in the conversation, because running hiring from a
  conversation is the product, and the roadmap item was "a send tool that asks first". Its
  description says loudly that approval means this exact draft. What limits the damage
  of a wrong call: it only sends saved drafts, only to the address on the applicant's row
  (no argument takes an address), and at most 150 a day per workspace, receipts included.
- `security: "none"` exists for a relay on the same private network, and is what lets the
  probe run against its own fake SMTP server. The probe covers sign-in before save, the
  password never coming back, one receipt per application, receipts off, send once, a
  refusing server, the daily limit, no mailbox, and the cross-workspace refusal.

## 2026-11-19 — The applicant status page follows what they were told, not the stage

`/status/<token>` reuses the application's screen token, which already sits in every
screening link the applicant has, rather than minting a second secret. It has three states.
The one rule that matters: a stage is the team's working state, and a message is what the
applicant was told. So REJECTED reads "under review" until a REJECTION message is SENT,
and a screening form shows as waiting only after a SCREENING_INVITE was sent. Otherwise
moving someone on the board would tell them before the email did. OFFER and HIRED never
read closed, even after the job closes, because those people hear directly.

The receipt links to the page. The link's origin is `Mailbox.siteUrl`, recorded whenever
the signed-in person saves mailbox settings, and never comes from the applicant's request:
the apply POST's Host and X-Forwarded-Host are theirs to forge, and a receipt is mail from
the person's own account. Checked on the dev server: a POST with
`X-Forwarded-Host: evil.example` still produced a localhost link.

## 2026-11-19 — Applicant data rights: a notice, a clock, an export, a delete

- A notice, not a checkbox. Hiring rests on the employer's legitimate interest more often
  than on consent, and a checkbox adds friction without adding a right. The notice says
  who gets the application, how long it's kept and where to write, and the retention
  sentence is generated from the same setting the sweep enforces (`src/lib/privacy.ts`),
  so it can't drift from what happens.
- The clock starts at `Job.closedAt`, a new column. `updatedAt` would have restarted
  whenever someone edited a closed job. Existing closed jobs were backfilled from
  `updatedAt`, which only errs toward keeping data longer. Reopening a job stops the
  clock.
- The sweep is the one thing that deletes without being asked each time. The person
  chose the period, the default is 12 months, hires are never swept, and `daily_brief`
  shows what goes in the next 30 days. It runs from `instrumentation.ts`, a minute
  after start and then daily. It is idempotent, so replicas or restarts do no harm.
- Export and delete read archived rows on purpose: archiving keeps data in the database,
  and a data request covers what is stored, not what is shown. CLAUDE.md invariant 8 now
  names this file as the exception. The export leaves out referees' own contact details
  (theirs, not the applicant's) and keeps notes and scorecards (about the applicant), and
  it says so, so the person reads it before sending.
- `delete_applicant_data` defaults to a dry run. The app asks the person to type the
  applicant's name.

## 2026-11-19 — The tool-choice eval, ported from Hired, without its parser or the SDK

`tools/eval-tool-choice.mjs` loads `tools.ts` and `handler.ts` through jiti, as the probe
does. Prisma doesn't connect until a query runs, so a placeholder `DATABASE_URL` is enough.
Hired reads tools.ts as text because its tools file can't be imported without a
database; Recruited's can, so there is no parallel copy of the tool array or of the
server instructions to drift. `instructions()` in handler.ts is exported for this.

It calls the Messages API with fetch rather than adding `@anthropic-ai/sdk`. Everything
here sits in `dependencies`, which ship in the image, for a script the app never runs.

The 26 cases target the traps that cost the most in an ATS: anything that sends, deletes or
replaces. `npm run check` runs it with `--check`, which validates the cases for free and
fails if one names a tool that no longer exists. No scored run yet: this session had no
API key. Record the first score here when there is one.
