import { getChatUser } from "@/lib/chat-auth";

const onlineWindowMs = 120_000;

export async function POST() {
  const context = await getChatUser();
  if (!context) return Response.json({ error: "You are not logged in." }, { status: 401 });
  await context.database
    .collection("user_presence")
    .updateOne(
      { organizationId: context.organizationId, userId: context.user._id },
      { $set: { lastSeenAt: new Date() } },
      { upsert: true },
    );
  const onlineUsers = await context.database
    .collection("user_presence")
    .find({
      organizationId: context.organizationId,
      lastSeenAt: { $gte: new Date(Date.now() - onlineWindowMs) },
    })
    .project({ userId: 1 })
    .toArray();
  return Response.json({ ok: true, userIds: onlineUsers.map((entry) => entry.userId.toString()) });
}
