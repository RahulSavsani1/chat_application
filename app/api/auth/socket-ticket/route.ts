import { getAuthorizationContext } from "@/lib/authorization";
import { createSocketTicket, isAllowedSocketOrigin } from "@/lib/socket-ticket";

export async function GET(request: Request) {
  const context = await getAuthorizationContext();
  if (!context) return Response.json({ error: "You are not logged in." }, { status: 401 });
  const appOrigin = new URL(process.env.APP_ORIGIN || request.url).origin;
  if (!isAllowedSocketOrigin(appOrigin)) {
    return Response.json(
      { error: "This app origin is not allowed for chat sockets." },
      { status: 403 },
    );
  }
  const expiresAt = Date.now() + 60_000;
  const ticket = createSocketTicket({
    userId: context.user._id.toString(),
    organizationId: context.organizationId.toString(),
    appOrigin,
    expiresAt,
  });
  return Response.json({ ticket, expiresAt });
}
