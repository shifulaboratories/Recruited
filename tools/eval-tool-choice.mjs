/**
 * Does an assistant reach for the right tool? Ported from Hired.
 *
 * Sends the real tool array (the names, descriptions and schemas tools/list
 * serves) and the real server instructions, with each prompt in
 * eval-cases.mjs, and records which tool comes back first. Nothing is
 * executed: the loop stops at the first tool_use block. It reads no database
 * and writes nothing.
 *
 * Unlike Hired's, it loads tools.ts and handler.ts directly through jiti, as
 * the probe does: Prisma doesn't connect until a query runs, so there is no
 * text-parsing copy of the tool array to drift. And it calls the Messages API
 * with fetch, so the app gains no dependency for a script it never runs.
 *
 * NOT in the gate, and never should be: it costs money, needs a network, and
 * is non-deterministic in the small. Run it after changing a description and
 * compare with the last score in .claude/DECISIONS.md.
 *
 *   ANTHROPIC_API_KEY=… node tools/eval-tool-choice.mjs
 *   node tools/eval-tool-choice.mjs --only=reject     # cases matching a word
 *   node tools/eval-tool-choice.mjs --runs=3          # each case 3 times, majority
 *   node tools/eval-tool-choice.mjs --model=claude-sonnet-5-5 --json=out.json
 *   node tools/eval-tool-choice.mjs --check           # validate the cases, free
 *
 * Without a key it validates the cases, says nothing was measured, and exits
 * 0, loudly, so nobody reads silence as a pass.
 */
import { createJiti } from "jiti";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { CASES, NO_TOOL_CASES } from "./eval-cases.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
process.env.DATABASE_URL ??= "postgresql://eval:eval@localhost:5432/eval_never_connects";
const jiti = createJiti(import.meta.url, { alias: { "@": path.join(root, "src") }, interopDefault: true });
const { TOOLS } = await jiti.import(path.join(root, "src/lib/mcp/tools.ts"));
const { instructions } = await jiti.import(path.join(root, "src/lib/mcp/handler.ts"));

const argv = process.argv.slice(2);
const flag = (name, fallback = null) => argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3) ?? fallback;
const has = (name) => argv.includes(`--${name}`);
const MODEL = flag("model", "claude-opus-5-5");
const RUNS = Math.max(1, Number(flag("runs", "1")) || 1);
const ONLY = flag("only")?.toLowerCase();
const JSON_OUT = flag("json");

const SYSTEM = instructions({ companyName: "Acme", name: "Dana" });
const API_TOOLS = TOOLS.map((t) => ({ name: t.name, description: t.description, input_schema: t.inputSchema }));

// A case naming a tool that doesn't exist can never pass and never says why.
const real = new Set(TOOLS.map((t) => t.name));
const bad = [...CASES, ...NO_TOOL_CASES].flatMap((c) => [...(c.expect ?? []), ...(c.avoid ?? [])].filter((n) => !real.has(n)).map((n) => `${n}: "${c.prompt}"`));
if (bad.length) {
  console.error("eval-cases.mjs names tools that don't exist:\n  " + bad.join("\n  "));
  process.exit(2);
}

const all = [...CASES.map((c) => ({ ...c, noTool: false })), ...NO_TOOL_CASES.map((c) => ({ ...c, expect: [], noTool: true }))].filter(
  (c) => !ONLY || c.prompt.toLowerCase().includes(ONLY) || [...(c.expect ?? []), ...(c.avoid ?? [])].some((n) => n.includes(ONLY)),
);
console.log(`${API_TOOLS.length} tools, ${all.length} cases, ${RUNS} run(s): ${all.length * RUNS} calls to ${MODEL}.`);
if (has("check")) {
  console.log("Cases are valid. Nothing was measured.");
  process.exit(0);
}
const KEY = process.env.ANTHROPIC_API_KEY;
if (!KEY) {
  console.log("SKIPPED: set ANTHROPIC_API_KEY to measure. The cases are valid. Nothing was measured; this is NOT a pass.");
  process.exit(0);
}
console.log("This spends real money: one request per call, with the whole tool array.\n");

async function firstTool(prompt) {
  for (let attempt = 0; attempt < 4; attempt++) {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": KEY, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({ model: MODEL, max_tokens: 1024, system: SYSTEM, tools: API_TOOLS, messages: [{ role: "user", content: prompt }] }),
    });
    if (res.status === 429 || res.status === 529) {
      console.error(`  ${res.status}, waiting 20s`);
      await new Promise((r) => setTimeout(r, 20_000));
      continue;
    }
    const body = await res.json();
    if (!res.ok) throw new Error(`API ${res.status}: ${body?.error?.message ?? JSON.stringify(body).slice(0, 200)}`);
    return body.content?.find((b) => b.type === "tool_use")?.name ?? null;
  }
  throw new Error("still rate limited after four tries");
}

function verdict(picked, c) {
  if (c.noTool) return picked === null ? "pass" : "fail";
  if (picked === null) return "fail";
  if (c.avoid?.includes(picked)) return "trap";
  return c.expect.includes(picked) ? "pass" : "fail";
}

const results = [];
for (const c of all) {
  const picks = [];
  for (let i = 0; i < RUNS; i++) picks.push(await firstTool(c.prompt));
  const counts = new Map();
  for (const p of picks) counts.set(p, (counts.get(p) ?? 0) + 1);
  const [picked, n] = [...counts].sort((a, b) => b[1] - a[1])[0];
  const v = verdict(picked, c);
  results.push({ prompt: c.prompt, expect: c.expect, avoid: c.avoid ?? [], picked, picks, agreement: n / RUNS, verdict: v });
  const mark = { pass: "ok  ", fail: "MISS", trap: "TRAP" }[v];
  console.log(`${mark}  ${(picked ?? "(no tool)").padEnd(24)} want ${c.noTool ? "(no tool)" : c.expect.join(" | ")}${RUNS > 1 && n < RUNS ? `  [${Math.round((100 * n) / RUNS)}% agreement]` : ""}`);
  if (v !== "pass") console.log(`      "${c.prompt}"\n      ${c.why}`);
}
const passed = results.filter((r) => r.verdict === "pass").length;
const traps = results.filter((r) => r.verdict === "trap").length;
console.log(`\n${passed}/${results.length} correct${traps ? `, ${traps} landed on the tool the case was written to catch` : ""}.`);
if (JSON_OUT) writeFileSync(JSON_OUT, JSON.stringify({ model: MODEL, runs: RUNS, results }, null, 2));
if (passed !== results.length) process.exitCode = 1;
