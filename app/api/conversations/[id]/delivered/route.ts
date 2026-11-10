import { ObjectId } from "mongodb";
import { getChatUser } from "@/lib/chat-auth";
import { markConversationDelivered } from "@/lib/chat-read-state";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const context = await getChatUser();
  if (!context) return Response.json({ error: "You are not logged in." }, { status: 401 });
  const conversationId = (await params).id;
  if (!ObjectId.isValid(conversationId))
    return Response.json({ error: "Conversation not found." }, { status: 404 });
  let body: { messageId?: unknown };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Request body must be valid JSON." }, { status: 400 });
  }
  if (!body || typeof body !== "object" || Array.isArray(body))
    return Response.json({ error: "Request body must be a JSON object." }, { status: 400 });
  if (typeof body.messageId !== "string" || !ObjectId.isValid(body.messageId))
    return Response.json({ error: "A valid message is required." }, { status: 400 });

  const conversation = await context.database.collection("conversations").findOne({
    _id: new ObjectId(conversationId),
    organizationId: context.organizationId,
    memberIds: context.user._id,
  });
  if (!conversation) return Response.json({ error: "Conversation not found." }, { status: 404 });
  const message = await context.database.collection("messages").findOne({
    _id: new ObjectId(body.messageId),
    conversationId: conversation._id,
    senderId: { $ne: context.user._id },
  });
  if (!message || !(message.createdAt instanceof Date))
    return Response.json({ error: "Message not found." }, { status: 404 });
  const deliveredAt = await markConversationDelivered(
    context.database,
    conversation._id,
    context.user._id,
    message.createdAt,
  );
  return Response.json({ deliveredAt });
}
