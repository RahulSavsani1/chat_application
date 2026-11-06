import { getAuthorizationContext, hasPermission } from "@/lib/authorization";

export async function GET() {
  const context = await getAuthorizationContext();
  if (!context) return Response.json({ error: "You are not logged in." }, { status: 401 });
  if (!hasPermission(context, "member.manage_roles"))
    return Response.json({ error: "Owner or admin access is required." }, { status: 403 });
  const members = await context.database
    .collection("organization_members")
    .find({ organizationId: context.organizationId, status: "active" })
    .toArray();
  const users = await context.database
    .collection("users")
    .find(
      { _id: { $in: members.map((member) => member.userId) } },
      { projection: { email: 1, name: 1, createdAt: 1 } },
    )
    .toArray();
  return Response.json({ users, members });
}
