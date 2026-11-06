import { getAuthorizationContext, hasPermission } from "@/lib/authorization";

export async function GET() {
  const context = await getAuthorizationContext();
  if (!context) return Response.json({ error: "You are not logged in." }, { status: 401 });
  if (!hasPermission(context, "organization.view"))
    return Response.json({ error: "Access denied." }, { status: 403 });
  return Response.json({
    roles: [
      {
        name: "owner",
        description: "Full organization access, including ownership and role management.",
        permissions: [
          "member.view",
          "member.manage_roles",
          "conversation.create",
          "message.send",
          "profile.update",
        ],
      },
      {
        name: "admin",
        description: "Can manage members and use organization features.",
        permissions: [
          "member.view",
          "member.manage_roles",
          "conversation.create",
          "message.send",
          "profile.update",
        ],
      },
      {
        name: "member",
        description: "Can chat and update their own profile.",
        permissions: ["member.view", "conversation.create", "message.send", "profile.update"],
      },
    ],
  });
}
