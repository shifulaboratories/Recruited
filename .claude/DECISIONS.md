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
