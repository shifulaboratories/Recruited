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
