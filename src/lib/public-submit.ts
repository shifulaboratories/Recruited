import { FormErrors, type PublicPayload } from "@/lib/data/public";
import { UserError } from "@/lib/data/errors";
import { MAX_TOTAL_BYTES } from "@/lib/files";

/**
 * Read a public form post defensively and turn errors into JSON the form can
 * show. A form with no file questions posts JSON; one with files posts
 * multipart, with the same JSON in a "payload" field and each file under its
 * question id.
 */
export async function handlePublicSubmit(request: Request, run: (p: PublicPayload) => Promise<unknown>) {
  const length = Number(request.headers.get("content-length") ?? 0);
  if (length > MAX_TOTAL_BYTES + 1_000_000) return Response.json({ error: "Together the files are over 25 MB. Attach smaller ones." }, { status: 413 });
  let text: string;
  const files: NonNullable<PublicPayload["files"]> = {};
  if ((request.headers.get("content-type") ?? "").startsWith("multipart/form-data")) {
    let form: FormData;
    try {
      form = await request.formData();
    } catch {
      return Response.json({ error: "The form didn't arrive in one piece. Try again." }, { status: 400 });
    }
    text = String(form.get("payload") ?? "");
    for (const [key, value] of form.entries()) {
      if (key === "payload" || typeof value === "string" || !value.size) continue;
      files[key] = { filename: value.name, bytes: new Uint8Array(await value.arrayBuffer()) };
    }
  } else {
    text = await request.text();
  }
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
    files,
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
