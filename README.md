<picture>
  <source media="(prefers-color-scheme: dark)" srcset="brand/github-graphics/banner-dark.png">
  <img alt="recruited.tools: hire from a conversation, know who wrote the answers" src="brand/github-graphics/banner-light.png">
</picture>

# Recruited

An open-source applicant tracking system for the people hiring, built to run from a conversation over MCP. It's the employer-side sibling of [Hired](https://github.com/shifulaboratories/Hired), the ATS for applicants.

You tell Claude what you're hiring for. It writes the job, an application form, and a listing for each board you post on, each in that board's own format with its own apply link. Applicants fill in the form, and every written answer records how it got there: typed, pasted, or filled in some other way, plus a "likely written with AI" label when the writing shows the usual signs. You read the pipeline in the app, or ask Claude who's worth a call.

## What's in it

- **Board guides** for LinkedIn, Indeed, OnlineJobs.ph, Wellfound, Upwork and your own careers page: length limits, how pay is stated, what gets a listing rejected, where the apply link goes. Claude reads the guide before writing each listing, and the listing is checked against it.
- **One apply link per listing.** Two listings of one job on one board are an A/B test; `listing_report` compares them on applicants who met the must-haves, not on raw volume.
- **Forms** with must-have (knockout) questions and file questions (a setup photo, a speed-test screenshot, a PDF), and screening forms sent to a shortlisted applicant through a personal link. Files are kept in Postgres, so there's still nothing to configure, and Claude can open them with `read_upload`.
- **Answer provenance.** The form counts characters by how they arrived, using the browser's own input types, and notes a paste that comes right after the applicant left the page. It stores counts and timings, never keystrokes, and the form says so. Style signals are a separate, weaker hint and always say "likely".
- **Tiers and ranking.** `rank_applicants` proposes an A, B or C tier and a rank for each applicant, with a reason you can check, following the job's own rubric. You accept or change it in the app; a tier you decided is never overwritten. `listing_report` counts A-tier applicants and their cost per listing.
- **Messages to applicants.** Claude drafts the screening invite, interview invite or rejection from `prep_message`, which hands it the applicant's own screening link and what they've been sent before. Recruited never sends email: you send from your own, with your mail connector or the app's Open in email, and the message is marked sent so the applicant's page shows what they were told and when.
- **Importing from boards.** Paste or upload an Indeed, LinkedIn or spreadsheet export of applicants and everyone lands in the job at once, counted against the listing they came through. `import_applicants` previews first and never adds anyone twice.
- **Interviews and offers.** Rounds with times, formats and who they'll meet; a scorecard per interviewer with a yes or no and evidence; offers kept as versions, so a counter-offer never overwrites what was offered before. Nothing here moves an applicant or decides for you.
- **Work samples and short videos.** A screening form can hold a task (a brief, a time estimate, a written answer recorded like any other) and a video answer recorded in the browser, up to five minutes.
- **Around the call.** `save_probes` keeps the follow-up questions to ask, aimed at the answers worth a second look; `request_reference` sends a referee four fixed questions on a link; `schedule_interview` can offer times that the applicant picks on a booking page in their own time zone, with no calendar connected.
- **Every day and at the end.** `daily_brief` says what needs you today, and the jobs screen shows the same list. `close_out_job` drafts a kind note to everyone still waiting when a role is filled. `share_applicant` makes a read-only link for someone without an account.
- **A sample workspace** to look around before posting a real role, removed in one step without touching real data.
- **39 MCP tools and 5 prompts** (`morning_brief`, `prepare_for_call`, `post_a_role`, `review_applicants`, `message_applicants`). The app has the screens a person needs to look and adjust: jobs, applicants, one applicant's answers, and Connect Claude.

## Connect your AI

Sign in, open **Connect Claude**, copy the URL, and add it in Claude as a custom connector. Then: "I'm hiring an operations VA, full time, PHP 30–40k a month. Post it on OnlineJobs.ph and LinkedIn."

## Running it locally

Postgres and Node 20 or later.

```bash
echo 'DATABASE_URL="postgresql://…/recruited"' > .env
npm install
npx prisma migrate deploy
npm run build && npm start
```

`DATABASE_URL` is the only setting. On first start the server prints an owner email and password once; change both under Connect Claude → Your account.

## Deploying it

`docker compose up -d` runs it with its own Postgres, and `railway.json` deploys it on Railway with a Postgres beside it. Both are in [docs/DEPLOY.md](docs/DEPLOY.md).

## Working on it

Read [CLAUDE.md](CLAUDE.md) first. The plan and what's next are in [docs/PLAN.md](docs/PLAN.md); the brand is in [brand/BRAND.md](brand/BRAND.md).

License: AGPL-3.0.
