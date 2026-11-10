import { ObjectId } from "mongodb";
import { getChatUser } from "@/lib/chat-auth";
import { markConversationRead } from "@/lib/chat-read-state";
import { publishConversationRead } from "@/lib/realtime";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const context = await getChatUser();
  if (!context) return Response.json({ error: "You are not logged in." }, { status: 401 });
  const id = (await params).id;
  if (!ObjectId.isValid(id))
    return Response.json({ error: "Conversation not found." }, { status: 404 });
  const conversation = await context.database.collection("conversations").findOne({
    _id: new ObjectId(id),
    organizationId: context.organizationId,
    memberIds: context.user._id,
  });
  if (!conversation) return Response.json({ error: "Conversation not found." }, { status: 404 });
  const readReceipts = await context.database
    .collection("conversation_reads")
    .find({ conversationId: conversation._id, userId: { $in: conversation.memberIds } })
    .project({ userId: 1, readAt: 1, deliveredAt: 1 })
    .toArray();
  return Response.json({ readReceipts });
}

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const context = await getChatUser();
  if (!context) return Response.json({ error: "You are not logged in." }, { status: 401 });
  const id = (await params).id;
  if (!ObjectId.isValid(id))
    return Response.json({ error: "Conversation not found." }, { status: 404 });
  const conversationId = new ObjectId(id);
  const conversation = await context.database.collection("conversations").findOne({
    _id: conversationId,
    organizationId: context.organizationId,
    memberIds: context.user._id,
  });
  if (!conversation) return Response.json({ error: "Conversation not found." }, { status: 404 });
  const readAt = await markConversationRead(context.database, conversationId, context.user._id);
  void publishConversationRead({
    conversationId: id,
    userId: context.user._id.toString(),
    readAt,
  });
  return Response.json({ readAt });
}
