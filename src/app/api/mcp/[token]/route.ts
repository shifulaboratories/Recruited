import { corsHeaders, handleMcpPost, mcpUnauthorized } from "@/lib/mcp/handler";
import { userByConnectionToken } from "@/lib/data/connections";
import { baseUrlFromRequest } from "@/lib/auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Params = { params: Promise<{ token: string }> };

/**
 * The connection URL: https://<your-app>/api/mcp/rct_xxxx. The token is in the
 * path so connecting is one paste with no headers, and it resolves to exactly
 * one user on every request.
 */
export async function POST(request: Request, { params }: Params) {
  const { token } = await params;
  const found = await userByConnectionToken(token);
  if (!found) return mcpUnauthorized();
  return handleMcpPost(request, found.user, baseUrlFromRequest(request));
}

export async function GET(_request: Request, { params }: Params) {
  const { token } = await params;
  if (!(await userByConnectionToken(token))) return mcpUnauthorized();
  // No server-initiated stream: clients fall back to POST-only, which is all this server needs.
  return new Response(null, { status: 405, headers: { Allow: "POST", ...corsHeaders() } });
}

export async function DELETE() {
  return new Response(null, { status: 204, headers: corsHeaders() });
}

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: corsHeaders() });
}
