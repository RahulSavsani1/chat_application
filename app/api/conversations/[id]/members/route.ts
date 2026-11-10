import { ObjectId } from "mongodb";
import { getChatUser } from "@/lib/chat-auth";
import { publishMembershipChange } from "@/lib/realtime";

async function getGroupContext(params: Promise<{ id: string }>) {
  const context = await getChatUser();
  if (!context)
    return { response: Response.json({ error: "You are not logged in." }, { status: 401 }) };
  const id = (await params).id;
  if (!ObjectId.isValid(id))
    return { response: Response.json({ error: "Group not found." }, { status: 404 }) };
  const conversation = await context.database.collection("conversations").findOne({
    _id: new ObjectId(id),
    organizationId: context.organizationId,
    memberIds: context.user._id,
    type: "group",
  });
  if (!conversation)
    return { response: Response.json({ error: "Group not found." }, { status: 404 }) };
  return { context, conversation };
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const result = await getGroupContext(params);
  if ("response" in result) return result.response;
  const { context, conversation } = result;
  if (!conversation.adminIds?.some((id: ObjectId) => id.equals(context.user._id)))
    return Response.json({ error: "Only group admins can add members." }, { status: 403 });
  let body: { userId?: string };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Request body must be valid JSON." }, { status: 400 });
  }
  if (
    !body ||
    typeof body !== "object" ||
    Array.isArray(body) ||
    typeof body.userId !== "string" ||
    !ObjectId.isValid(body.userId)
  )
    return Response.json({ error: "A valid user is required." }, { status: 400 });
  const userId = new ObjectId(body.userId!);
  const member = await context.database.collection("organization_members").findOne({
    organizationId: context.organizationId,
    userId,
    status: "active",
  });
  if (!member)
    return Response.json({ error: "That user is not in your organization." }, { status: 403 });
  await context.database
    .collection<{ memberIds: ObjectId[]; adminIds: ObjectId[] }>("conversations")
    .updateOne(
      { _id: conversation._id, memberIds: context.user._id },
      { $addToSet: { memberIds: userId }, $set: { updatedAt: new Date() } },
    );
  const updated = await context.database
    .collection("conversations")
    .findOne({ _id: conversation._id });
  await publishMembershipChange({
    conversationId: conversation._id.toString(),
    organizationId: context.organizationId.toString(),
    memberIds: updated!.memberIds.map((id: ObjectId) => id.toString()),
  });
  return Response.json({ conversation: updated });
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const result = await getGroupContext(params);
  if ("response" in result) return result.response;
  const { context, conversation } = result;
  let body: { userId?: string };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Request body must be valid JSON." }, { status: 400 });
  }
  if (
    !body ||
    typeof body !== "object" ||
    Array.isArray(body) ||
    typeof body.userId !== "string" ||
    !ObjectId.isValid(body.userId)
  )
    return Response.json({ error: "A valid user is required." }, { status: 400 });
  const targetId = new ObjectId(body.userId!);
  const isAdmin = conversation.adminIds?.some((id: ObjectId) => id.equals(context.user._id));
  const isSelf = targetId.equals(context.user._id);
  if (!isAdmin && !isSelf)
    return Response.json({ error: "Only group admins can remove other members." }, { status: 403 });
  if (conversation.createdBy?.equals(targetId))
    return Response.json({ error: "The group creator cannot leave the group." }, { status: 400 });
  await context.database
    .collection<{ memberIds: ObjectId[]; adminIds: ObjectId[] }>("conversations")
    .updateOne(
      { _id: conversation._id, memberIds: targetId },
      { $pull: { memberIds: targetId, adminIds: targetId }, $set: { updatedAt: new Date() } },
    );
  const updated = await context.database
    .collection("conversations")
    .findOne({ _id: conversation._id });
  await publishMembershipChange({
    conversationId: conversation._id.toString(),
    organizationId: context.organizationId.toString(),
    memberIds: updated!.memberIds.map((id: ObjectId) => id.toString()),
  });
  return Response.json({ conversation: updated });
}
