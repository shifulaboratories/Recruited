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
   `userId` first and filters on it. Server actions resolve the caller from the session;
   MCP tools from the connection token. The public paths (`/apply/<slug>`,
   `/f/<slug>?t=`, `/ref/<token>`, `/book/<token>`, `/s/<slug>`, `/careers/<slug>`) live in
   `src/lib/data/public.ts`, resolve the owner from the row the slug names, and return
   only what the page shows. `/s/` is the one that shows answers, and only after the
   owner turned the link on; it never shows email, phone, notes or files.
2. **One data layer.** Tools and actions both call `src/lib/data/`. No rule lives in an action.
3. **Stateless MCP.** `src/lib/mcp/handler.ts` re-resolves the user on every POST.
4. **The question format is a contract.** `src/lib/forms.ts` is shared by the database,
   the public form and the tools. Add fields with defaults; never change a field's meaning.
   Answers store the label they were asked under.
5. **One variable.** `DATABASE_URL` only. The owner account is made on first boot.
6. **Provenance is observation, not proof.** Origin (typed, pasted, injected) is what the
   browser saw. Style signals are hints and always say "likely". No copy, tool
   description or prompt calls an applicant a cheat, and nothing declines anyone
   automatically. The form tells applicants what it records. Keep all of that true.
7. **No fabrication.** Tools that write listings or forms tell the assistant to ask rather
   than invent pay, hours or must-haves.
8. **Archiving.** Job and Application carry `archivedAt`; every read excludes archived rows.

## The map

```
prisma/schema.prisma        Data model.
src/lib/boards.ts           Board guides and the markdown → board format renderer + lint. Pure.
src/lib/forms.ts            Question schema, knockouts, validation. Pure.
src/lib/provenance.ts       Origin classification and style signals. Pure.
src/lib/data/               jobs, listings, forms, applications, public, connections, users.
src/lib/mcp/tools.ts        Every tool and prompt.
src/lib/mcp/handler.ts      Transport and the server instructions.
src/components/public-form.tsx  The apply/screening form and its recorder.
src/app/(app)/              Jobs, applicants, one applicant, Connect Claude.
src/app/apply/, f/, ref/, book/, s/, careers/  The public pages. Only /careers/ and a LIVE
                            careers-board apply page may be indexed; every other link is unlisted.
brand/                      The brand kit. Colours come from brand/tokens/tokens.css only.
docs/PLAN.md                What's built, what's next, open questions.
.claude/DECISIONS.md        Append-only decision log, newest at the bottom.
```

## Verify before you claim done

```bash
npm run typecheck
npm run check     # tools/rules.test.mjs: boards, forms, provenance (Node 22.18+)
npm run probe     # tools/probe.mjs: every tool against a database named *probe*
npm run build
```

The probe needs its own database (`createdb recruited_probe`, then
`DATABASE_URL=…/recruited_probe npx prisma migrate deploy`) and refuses any other,
because it creates and deletes accounts. It fails when a tool in `TOOLS` has no case,
so a new tool gets one in the same commit, along with a cross-workspace line if it takes
an id. `.github/workflows/gate.yml` runs all four on every pull request and on main.

Then exercise the change for real: the MCP endpoint with curl, and the public form in a
browser (the provenance recorder only runs there). Voice: plain, direct, second person,
no exclamation marks, no emoji; see brand/BRAND.md.
