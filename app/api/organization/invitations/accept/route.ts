import { getAuthorizationContext } from "@/lib/authorization";
import { acceptInvitation } from "@/lib/invitations";

export async function POST(request: Request) {
  const context = await getAuthorizationContext();
  if (!context) return Response.json({ error: "You are not logged in." }, { status: 401 });
  let body: { token?: unknown };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Request body must be valid JSON." }, { status: 400 });
  }
  if (!body || typeof body !== "object" || Array.isArray(body))
    return Response.json({ error: "Request body must be a JSON object." }, { status: 400 });
  const token = typeof body.token === "string" ? body.token.trim() : "";
  if (!token) return Response.json({ error: "Invitation token is required." }, { status: 400 });
  const result = await acceptInvitation(
    context.database,
    token,
    context.user._id,
    String(context.user.email),
  );
  if (!result.ok) return Response.json({ error: result.error }, { status: 400 });
  return Response.json({ message: "You joined the organization." });
}
