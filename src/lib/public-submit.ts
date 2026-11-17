import { FormErrors, type PublicPayload } from "@/lib/data/public";
import { UserError } from "@/lib/data/errors";

/** Read a public form post defensively and turn errors into JSON the form can show. */
export async function handlePublicSubmit(request: Request, run: (p: PublicPayload) => Promise<unknown>) {
  const text = await request.text();
  if (text.length > 400_000) return Response.json({ error: "That's more than this form accepts." }, { status: 413 });
  let raw: Record<string, unknown>;
  try {
    raw = JSON.parse(text);
  } catch {
    return Response.json({ error: "The form didn't arrive in one piece. Try again." }, { status: 400 });
  }
  const answers: Record<string, string> = {};
  if (raw.answers && typeof raw.answers === "object")
    for (const [k, v] of Object.entries(raw.answers as Record<string, unknown>)) if (typeof v === "string") answers[k] = v;
  const payload: PublicPayload = {
    name: typeof raw.name === "string" ? raw.name.slice(0, 200) : undefined,
    email: typeof raw.email === "string" ? raw.email.slice(0, 320) : undefined,
    answers,
    telemetry: raw.telemetry && typeof raw.telemetry === "object" ? (raw.telemetry as Record<string, unknown>) : {},
    recorded: raw.recorded === true,
    durationMs: Number(raw.durationMs) || 0,
  };
  try {
    await run(payload);
    return Response.json({ ok: true });
  } catch (e) {
    if (e instanceof FormErrors) return Response.json({ error: e.message, fields: e.fields }, { status: 422 });
    if (e instanceof UserError) return Response.json({ error: e.message }, { status: 400 });
    console.error("[apply] submit failed", e);
    return Response.json({ error: "Something went wrong on our side. Try again in a moment." }, { status: 500 });
  }
}
