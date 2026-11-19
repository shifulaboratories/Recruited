# Recruited — working agreement

The briefing for any coding agent; `AGENTS.md` is a symlink to it. Recruited follows
Hired's conventions (github.com/shifulaboratories/Hired, its CLAUDE.md) wherever this
file doesn't say otherwise.

## What this is

An applicant tracking system for small teams hiring their first people, run from a
conversation. Jobs, listings per board (each with its own apply link), application and
screening forms, applicants, and a record of how each written answer reached the form.

## Rule zero: MCP first, UI second

A feature is done when an assistant connected over MCP can do it end to end. Order:

1. `prisma/schema.prisma` and a migration in `prisma/migrations/`
2. `src/lib/data/*.ts`, `userId` as the first positional argument
3. `src/lib/mcp/tools.ts`, with a description an assistant can act on
4. `src/server/actions.ts` and a screen, only if a person needs to see or adjust it

## Invariants

1. **Tenant isolation.** Every function in `src/lib/data/` that touches content takes
   `userId` first and filters on it. `userId` is the WORKSPACE: its owner's account id.
   Server actions resolve the person from the session (`requireSeat`); MCP tools from the
   connection token, which is the person's own. `seatFor` in `src/lib/data/team.ts` turns
   a person into the workspace's id plus a role, and nothing else does. The public paths
   (`/apply/<slug>`, `/f/<slug>?t=`, `/ref/<token>`, `/book/<token>`, `/s/<slug>`,
   `/careers/<slug>`, `/status/<token>`, `/score/<token>`) live in
   `src/lib/data/public.ts`, resolve the owner from the row the slug names, and return
   only what the page shows. `/s/` is the one that shows answers, and only after the
   owner turned the link on; it never shows email, phone, notes or files. `/status/` is the
   applicant's own, and says closed only after they were told. `/join/<token>`, an invite,
   lives in `team.ts` and shows only the company, the role and the invited address.
2. **Roles are checked twice.** A narrow role (hiring manager, interviewer) gets only the
   tools in `SCOPED_TOOLS` (`src/lib/team.ts`), hidden from tools/list, not just refused;
   recruiters get everything but `OWNER_TOOLS`. Then every `job_id`, `application_id`,
   `interview_id` and `upload_id` a tool or action takes goes through `reach` before it
   runs, and every list a narrow role reads filters by the seat. A new tool that takes
   another kind of id, or a new list a narrow role gets, needs both, and a probe line.
3. **One data layer.** Tools and actions both call `src/lib/data/`. No rule lives in an action.
4. **Stateless MCP.** `src/lib/mcp/handler.ts` re-resolves the person and their seat on every POST.
5. **The question format is a contract.** `src/lib/forms.ts` is shared by the database,
   the public form and the tools. Add fields with defaults; never change a field's meaning.
   Answers store the label they were asked under.
6. **One variable.** `DATABASE_URL` only. The owner account is made on first boot.
7. **Provenance is observation, not proof.** Origin (typed, pasted, injected) is what the
   browser saw. Style signals are hints and always say "likely". No copy, tool
   description or prompt calls an applicant a cheat, and nothing declines anyone
   automatically. The form tells applicants what it records. Keep all of that true.
8. **No fabrication.** Tools that write listings or forms tell the assistant to ask rather
   than invent pay, hours or must-haves.
9. **Archiving.** Job and Application carry `archivedAt`; every read excludes archived rows,
   except in `src/lib/data/privacy.ts`, where a data request and a deletion must cover
   everything still stored.

## The map

```
prisma/schema.prisma        Data model.
src/lib/boards.ts           Board guides and the markdown → board format renderer + lint. Pure.
src/lib/forms.ts            Question schema, knockouts, validation. Pure.
src/lib/provenance.ts       Origin classification and style signals. Pure.
src/lib/team.ts             The four roles and which tools each gets. Pure.
src/lib/data/               jobs, listings, forms, applications, public, connections, users, team.
src/lib/mcp/tools.ts        Every tool and prompt.
src/lib/mcp/handler.ts      Transport and the server instructions.
src/components/public-form.tsx  The apply/screening form and its recorder.
src/app/(app)/              Jobs, applicants, one applicant, Connect Claude.
src/app/apply/, f/, ref/, book/, s/, careers/, status/, score/, join/  The public pages. Only /careers/ and a LIVE
                            careers-board apply page may be indexed; every other link is unlisted.
brand/                      The brand kit. Colours come from brand/tokens/tokens.css only.
docs/PLAN.md                What's built, what's next, open questions.
.claude/DECISIONS.md        Append-only decision log, newest at the bottom.
```

## Verify before you claim done

```bash
npm run typecheck
npm run check     # tools/rules.test.mjs: boards, forms, provenance (Node 22.18+), and that
                  # every tool named in tools/eval-cases.mjs exists
npm run probe     # tools/probe.mjs: every tool against a database named *probe*
npm run build
```

The probe needs its own database (`createdb recruited_probe`, then
`DATABASE_URL=…/recruited_probe npx prisma migrate deploy`) and refuses any other,
because it creates and deletes accounts. It fails when a tool in `TOOLS` has no case,
so a new tool gets one in the same commit, along with a cross-workspace line if it takes
an id. `.github/workflows/gate.yml` runs all four on every pull request and on main.

If you changed a tool's description, also run `ANTHROPIC_API_KEY=… npm run eval` (or
`--only=<word>`) and compare with the last score in `.claude/DECISIONS.md`. It costs money
and isn't in the gate. A case comes from a real misroute or a trap you can name, and is
added before the fix, so you see it fail.

Then exercise the change for real: the MCP endpoint with curl, and the public form in a
browser (the provenance recorder only runs there). Voice: plain, direct, second person,
no exclamation marks, no emoji; see brand/BRAND.md.
