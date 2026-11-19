import { FormErrors, submitScorecard } from "@/lib/data/public";
import { UserError } from "@/lib/data/errors";
import { overLimit, TOO_MANY } from "@/lib/data/ratelimit";
import { recordError } from "@/lib/data/system";

export const dynamic = "force-dynamic";

/** An interviewer's scorecard. Public: the token in the path names the link, which works once. */
export async function POST(request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (await overLimit(request, "score", token)) return Response.json({ error: TOO_MANY }, { status: 429 });
  const text = await request.text();
  if (text.length > 30_000) return Response.json({ error: "That's more than this form accepts." }, { status: 413 });
  let raw: { recommendation?: unknown; summary?: unknown; ratings?: unknown };
  try {
    raw = JSON.parse(text);
  } catch {
    return Response.json({ error: "The form didn't arrive in one piece. Try again." }, { status: 400 });
  }
  try {
    return Response.json(
      await submitScorecard(token, {
        recommendation: typeof raw.recommendation === "string" ? raw.recommendation : undefined,
        summary: typeof raw.summary === "string" ? raw.summary : undefined,
        ratings: Array.isArray(raw.ratings) ? raw.ratings : [],
      }),
    );
  } catch (e) {
    if (e instanceof FormErrors) return Response.json({ error: e.message, fields: e.fields }, { status: 422 });
    if (e instanceof UserError) return Response.json({ error: e.message }, { status: 400 });
    await recordError("score", e);
    return Response.json({ error: "Something went wrong on our side. Try again in a moment." }, { status: 500 });
  }
}
