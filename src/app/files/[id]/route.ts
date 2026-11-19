import { currentUser } from "@/lib/auth";
import { readUpload } from "@/lib/data/uploads";
import { UserError } from "@/lib/data/errors";
import { reach, seatFor } from "@/lib/data/team";

export const dynamic = "force-dynamic";

/**
 * An applicant's file, for a signed-in teammate whose role reaches it. Served with its sniffed
 * type, never sniffed again by the browser, and sandboxed so a PDF can't run
 * script on this origin.
 */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await currentUser();
  if (!user) return new Response("Sign in to see this file.", { status: 401 });
  try {
    const id = (await params).id;
    const seat = await seatFor(user);
    await reach(seat, { uploadId: id });
    const u = await readUpload(seat.userId, id);
    const bytes = new Uint8Array(u.data);
    // Video players ask for byte ranges to seek, and Safari won't play without them.
    const range = /^bytes=(\d*)-(\d*)$/.exec(request.headers.get("range") ?? "");
    if (range && (range[1] || range[2])) {
      const size = bytes.length;
      const start = range[1] ? Number(range[1]) : Math.max(0, size - Number(range[2]));
      const end = range[1] && range[2] ? Math.min(Number(range[2]), size - 1) : size - 1;
      if (start >= size || start > end) return new Response(null, { status: 416, headers: { "content-range": `bytes */${size}` } });
      return new Response(bytes.slice(start, end + 1), {
        status: 206,
        headers: {
          "content-type": u.mimeType,
          "content-length": String(end - start + 1),
          "content-range": `bytes ${start}-${end}/${size}`,
          "accept-ranges": "bytes",
          "x-content-type-options": "nosniff",
          "cache-control": "private, max-age=3600",
        },
      });
    }
    return new Response(bytes, {
      headers: {
        "content-type": u.mimeType,
        "content-length": String(u.size),
        "accept-ranges": "bytes",
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
