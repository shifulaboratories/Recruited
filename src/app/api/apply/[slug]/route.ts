import { after } from "next/server";
import { submitApplication } from "@/lib/data/public";
import { sendReceipt } from "@/lib/data/mailbox";
import { handlePublicSubmit } from "@/lib/public-submit";

export const dynamic = "force-dynamic";

/**
 * The apply page posts here. Public: the listing slug names the workspace.
 * The receipt goes after the response, so the applicant never waits on
 * someone's mail server and a mail failure never reaches them.
 */
export async function POST(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return handlePublicSubmit(request, "apply", slug, async (p) => {
    const r = await submitApplication(slug, p);
    after(() => sendReceipt(r.userId, r.applicationId));
  });
}
