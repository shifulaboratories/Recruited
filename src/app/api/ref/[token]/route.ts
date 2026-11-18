import { FormErrors, submitReference } from "@/lib/data/public";
import { UserError } from "@/lib/data/errors";

export const dynamic = "force-dynamic";

/** A referee's answers. Public: the token in the path names the request. */
export async function POST(request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const text = await request.text();
  if (text.length > 20_000) return Response.json({ error: "That's more than this form accepts." }, { status: 413 });
  let raw: { answers?: Record<string, unknown> };
  try {
    raw = JSON.parse(text);
  } catch {
    return Response.json({ error: "The form didn't arrive in one piece. Try again." }, { status: 400 });
  }
  const answers: Record<string, string> = {};
  for (const [k, v] of Object.entries(raw.answers ?? {})) if (typeof v === "string") answers[k] = v;
  try {
    return Response.json(await submitReference(token, answers));
  } catch (e) {
    if (e instanceof FormErrors) return Response.json({ error: e.message, fields: e.fields }, { status: 422 });
    if (e instanceof UserError) return Response.json({ error: e.message }, { status: 400 });
    console.error("[ref] submit failed", e);
    return Response.json({ error: "Something went wrong on our side. Try again in a moment." }, { status: 500 });
  }
}
