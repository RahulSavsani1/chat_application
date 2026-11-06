import { getChatUser } from "@/lib/chat-auth";

export async function GET() {
  const context = await getChatUser();
  if (!context) return Response.json({ error: "You are not logged in." }, { status: 401 });
  const members = await context.database
    .collection("organization_members")
    .find({ organizationId: context.organizationId, status: "active" })
    .toArray();
  const users = await context.database
    .collection("users")
    .find(
      { _id: { $in: members.map((member) => member.userId) } },
      { projection: { email: 1, name: 1, picture: 1 } },
    )
    .toArray();
  return Response.json({ users });
}
