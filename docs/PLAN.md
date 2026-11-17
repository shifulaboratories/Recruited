# Plan

## Built in the foundation (November 2026)

- Data model: jobs, listings (board + variant + apply slug), forms (application and
  screening), candidates, applications with stages, submissions, answers with provenance,
  notes, MCP connections.
- Board guides for LinkedIn, Indeed, OnlineJobs.ph, Wellfound, Upwork and a generic page,
  with a renderer that turns one markdown description into each board's format and a lint
  that catches what boards reject (pay or "urgent" in a title, capitals, emoji, pay inside
  an OnlineJobs.ph description, protected characteristics).
- The public apply page and screening form, with the provenance recorder.
- 19 MCP tools, 2 prompts, and four screens.

## Next, in the order I'd take them

1. **File uploads on forms.** OnlineJobs.ph screeners ask for a setup photo, a speed-test
   screenshot and a typing test. Today those have to be links.
2. **Tiers and ranking.** An A/B/C tier per applicant (the brand kit already has the
   colours), set by a person or proposed by Claude through a `rank_applicants` tool with
   reasons, and listing_report counting A-tier per dollar.
3. **Messages to applicants.** Draft the screening invite, the rejection and the interview
   ask; send through the person's own mail connector rather than from this server.
4. **Importing from boards.** Paste an Indeed or LinkedIn applicant export (CSV) and add
   everyone at once with their listing attributed.
5. **Apply with Hired.** An applicant pastes their published Hired resume link
   (`/r/<slug>/resume.json`, already built on the Hired side) and the form fills itself.
6. **Interviews and offers.** Rounds, scorecards and offer versions, the hiring-side
   mirror of what Hired has.
7. **Deploy.** Dockerfile and a Railway template, as in Hired.

## What it deliberately doesn't do

- Post to boards automatically. None of these boards offers a posting API to a small
  employer that doesn't need a partner agreement; the listing is pasted by a person and
  marked live by Claude.
- Decide on applicants. Knockouts mark who missed a must-have; nobody is declined without
  a person saying so.
- Call anything proof of AI use.

## Open questions for William

- The earlier recruited.tools demo (split tests, pipeline, candidate profile with an
  interview loop) lived in byw1/recruited, which this session can't read. Should this repo
  take its screens across, or keep growing from this foundation?
- Which board matters most first? The OnlineJobs.ph guide is the deepest, built from your
  own listing skill.
- Multi-user workspaces (a team hiring together) are parked, as in Hired. Still right?
