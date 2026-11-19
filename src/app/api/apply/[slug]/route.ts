import { submitApplication } from "@/lib/data/public";
import { handlePublicSubmit } from "@/lib/public-submit";

export const dynamic = "force-dynamic";

/** The apply page posts here. Public: the listing slug names the workspace. */
export async function POST(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return handlePublicSubmit(request, "apply", slug, (p) => submitApplication(slug, p));
}
