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
- Tiers and ranking (17 Nov): proposals from `rank_applicants` with reasons and rank, decisions by the person (`set_tier` or the app), a per-job rubric, tier filter and sort, A-tier counts and cost per A-tier in `listing_report`. 21 tools.
- File questions (17 Nov): one image or PDF per question, up to 10 MB, typed by its bytes and stored in Postgres; shown on the applicant page and opened by Claude with `read_upload`. 22 tools.
- Messages to applicants (17 Nov): `prep_message` and `save_message`, a `message_applicants` prompt, and a message log on the applicant page with Open in email, Mark sent and Delete draft. The server never sends mail. 24 tools, 3 prompts.
- Importing from boards (17 Nov): `import_applicants` reads an Indeed, LinkedIn or spreadsheet CSV, matches columns by header, previews by default, attributes everyone to a listing, and keeps the other columns as a note. Also on the job page. 25 tools.
- Interviews and offers (17 Nov): `schedule_interview`, `list_interviews`, `record_scorecard`, `record_offer`. Rounds per application, one scorecard per interviewer with a panel summary, offers as versions with what changed. `prep_message` now hands an interview invite the scheduled round and an offer email the latest version. 29 tools.
- Deploy (17 Nov): `docker/Dockerfile` and `docker-compose.yml` for self-hosting, `railway.json` for Railway, and docs/DEPLOY.md. The image was built and run against an empty database: migrations applied, the owner was printed once, and MCP answered.
- The twelve (18 Nov), all inside the existing screens: work samples (`task` questions) and short video answers (`video`, recorded with MediaRecorder, stored like files, served with byte ranges); follow-up questions per applicant (`save_probes`, "Ask on the call"); reference checks on a link (`request_reference`, `/ref/<token>`); a daily brief (`daily_brief`, `morning_brief`, Today on the jobs screen); self-booking (`schedule_interview` `offer_times`, `/book/<token>`); closing the loop (`close_out_job`, a card on a filled job); the leading listing in `listing_report` and a badge; company profile and "what happens next" on public pages (`update_company`, `after_apply`); a read-only applicant link (`share_applicant`, `/s/<slug>`); a sample workspace (`load_sample_workspace`, `wipe_sample_workspace`); and a reworked apply form. 37 tools, 5 prompts.

- The probe (19 Nov): `tools/probe.mjs` runs every tool against a real database, checks that another workspace's ids are refused by every tool that takes one, that archived jobs and applications drop out of reads and close the apply page, and that the transport lists every tool and renders every prompt. `.github/workflows/gate.yml` runs typecheck, check, probe and build on every pull request.

- Flood protection (19 Nov): the public POST routes (apply, screening, reference, booking) allow 20 posts per address per form an hour and 60 across all of them, counted in Postgres as a hash of the address, never the address. The apply and screening forms carry a hidden `trap` field; a post that fills it is answered as a success and saved nowhere. Also fixed `npm run dev`, which failed to compile any page because instrumentation pulled `node:crypto` into the edge bundle.

- Password reset (19 Nov): `get_password_reset_link` gives the connected person a one-time link to their own account, and "Forgot your password?" on the sign-in page prints one to the server log, since the server sends no mail. Links last an hour, work once, are stored only as a hash, and signing in through one ends every other session. 38 tools, 5 prompts.

- Spam check (19 Nov): optional Cloudflare Turnstile on the open apply page, turned on by the owner with `set_spam_check` or under Settings. Keys live in a new `Setting` table, so `DATABASE_URL` stays the only variable; the secret is never shown again. Screening links are personal and skip it. If Cloudflare can't be reached the post goes through. 39 tools, 5 prompts.

- Backups and health (19 Nov): docs/DEPLOY.md says how to back up on Railway (the Postgres service's Backups tab) and with Compose, whose new `backup` service writes a dump a day to `./backups` and keeps 14. Server errors the app catches (a tool failing, a public form failing) are kept in `ErrorEvent`, newest 1000, and the owner reads them with `instance_health`, beside database status, the latest migration and totals. 40 tools, 5 prompts.

- Careers page and Google for Jobs (19 Nov): a new `careers` board. `update_company` takes `careers_slug`, and `/careers/<slug>` lists every open job with a LIVE careers listing. That listing's apply page is the only one search engines may index, and it carries schema.org JobPosting data (`src/lib/job-posting.ts`, pure, tested in rules.test.mjs). Every other apply link stays unlisted.

- Your mailbox (19 Nov): Recruited sends from the person's own account over SMTP (`Mailbox`, one per workspace; the password is stored and never read back). `set_mailbox` connects it, signing in before saving, and words the receipt; `send_message` sends a saved draft only after the person said send, to the address on file. Each person who applies through an apply link gets a receipt that says only that it arrived, sent after the response so the applicant never waits on a mail server. A failed send leaves the draft a draft with the reason; 150 sends a day at most. 42 tools, 5 prompts.

## Next

Everything on the first plan is built. What's worth doing next should come from using it on a real hire.

## What it deliberately doesn't do

- Depend on Hired. Recruited is a separate product with no integration to Hired; it only
  borrows Hired's conventions (William, 17 Nov).
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
