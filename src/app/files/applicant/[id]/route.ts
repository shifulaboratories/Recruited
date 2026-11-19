import { currentUser } from "@/lib/auth";
import { exportApplicantData } from "@/lib/data/privacy";
import { UserError } from "@/lib/data/errors";

export const dynamic = "force-dynamic";

/**
 * Everything held about one applicant as a JSON download, for the signed-in
 * owner of the workspace: the app's side of export_applicant_data, for
 * answering a data request.
 */
export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await currentUser();
  if (!user) return new Response("Sign in to download this.", { status: 401 });
  try {
    const data = await exportApplicantData(user.id, { applicationId: (await params).id });
    const name = data.person.name.replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-|-$/g, "").toLowerCase() || "applicant";
    return new Response(JSON.stringify(data, null, 2), {
      headers: {
        "content-type": "application/json; charset=utf-8",
        "content-disposition": `attachment; filename="${name}-data.json"`,
        "cache-control": "private, no-store",
      },
    });
  } catch (e) {
    if (e instanceof UserError) return new Response(e.message, { status: 404 });
    throw e;
  }
}
