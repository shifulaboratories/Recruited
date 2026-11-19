import { submitScreening } from "@/lib/data/public";
import { handlePublicSubmit } from "@/lib/public-submit";

export const dynamic = "force-dynamic";

/** A screening form posts here. Public: the form slug and the applicant's token identify it. */
export async function POST(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const t = new URL(request.url).searchParams.get("t") ?? "";
  return handlePublicSubmit(request, "screen", slug, (p) => submitScreening(slug, t, p));
}
