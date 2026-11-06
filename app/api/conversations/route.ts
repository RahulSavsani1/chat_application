import { ObjectId } from "mongodb";
import { hasPermission } from "@/lib/authorization";
import { getChatUser } from "@/lib/chat-auth";

export async function GET() {
  const context = await getChatUser();
  if (!context) return Response.json({ error: "You are not logged in." }, { status: 401 });
  const conversations = await context.database
    .collection("conversations")
    .find({ organizationId: context.organizationId, memberIds: context.user._id })
    .sort({ updatedAt: -1 })
    .toArray();
  return Response.json({ conversations });
}

export async function POST(request: Request) {
  const context = await getChatUser();
  if (!context) return Response.json({ error: "You are not logged in." }, { status: 401 });
  if (!hasPermission(context, "conversation.create"))
    return Response.json({ error: "You cannot create conversations." }, { status: 403 });
  const body = (await request.json()) as { userId?: string };
  if (!body.userId || !ObjectId.isValid(body.userId))
    return Response.json({ error: "A valid user is required." }, { status: 400 });
  const otherMembership = await context.database.collection("organization_members").findOne({
    organizationId: context.organizationId,
    userId: new ObjectId(body.userId),
    status: "active",
  });
  const otherUser = otherMembership
    ? await context.database.collection("users").findOne({ _id: otherMembership.userId })
    : null;
  if (!otherUser)
    return Response.json({ error: "That user is not in your organization." }, { status: 403 });
  const memberIds = [context.user._id, otherUser._id];
  const existing = await context.database.collection("conversations").findOne({
    organizationId: context.organizationId,
    memberIds: { $all: memberIds },
    type: "direct",
  });
  if (existing) return Response.json({ conversation: existing });
  const result = await context.database.collection("conversations").insertOne({
    organizationId: context.organizationId,
    memberIds,
    type: "direct",
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  return Response.json({ conversation: { _id: result.insertedId, memberIds } }, { status: 201 });
}
