import { bookSlot } from "@/lib/data/public";
import { UserError } from "@/lib/data/errors";
import { overLimit, TOO_MANY } from "@/lib/data/ratelimit";
import { recordError } from "@/lib/data/system";

export const dynamic = "force-dynamic";

/** An applicant picks one of the offered interview times. Public: the token names the interview. */
export async function POST(request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (await overLimit(request, "book", token)) return Response.json({ error: TOO_MANY }, { status: 429 });
  let slot = "";
  try {
    const raw = (await request.json()) as { slot?: unknown };
    slot = typeof raw.slot === "string" ? raw.slot.slice(0, 64) : "";
  } catch {
    return Response.json({ error: "That didn't arrive in one piece. Try again." }, { status: 400 });
  }
  try {
    return Response.json(await bookSlot(token, slot));
  } catch (e) {
    if (e instanceof UserError) return Response.json({ error: e.message }, { status: 400 });
    await recordError("book", e);
    return Response.json({ error: "Something went wrong on our side. Try again in a moment." }, { status: 500 });
  }
}
