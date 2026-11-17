import { currentUser } from "@/lib/auth";
import { readUpload } from "@/lib/data/uploads";
import { UserError } from "@/lib/data/errors";

export const dynamic = "force-dynamic";

/**
 * An applicant's file, for the signed-in owner only. Served with its sniffed
 * type, never sniffed again by the browser, and sandboxed so a PDF can't run
 * script on this origin.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await currentUser();
  if (!user) return new Response("Sign in to see this file.", { status: 401 });
  try {
    const u = await readUpload(user.id, (await params).id);
    return new Response(new Uint8Array(u.data), {
      headers: {
        "content-type": u.mimeType,
        "content-length": String(u.size),
        "content-disposition": `inline; filename="${u.filename.replace(/"/g, "")}"`,
        "x-content-type-options": "nosniff",
        "content-security-policy": "sandbox; default-src 'none'; img-src 'self'; style-src 'unsafe-inline'",
        "cache-control": "private, max-age=3600",
      },
    });
  } catch (e) {
    if (e instanceof UserError) return new Response("Not found.", { status: 404 });
    throw e;
  }
}
