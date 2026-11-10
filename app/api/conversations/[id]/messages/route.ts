import { ObjectId } from "mongodb";
import { hasPermission } from "@/lib/authorization";
import { getChatUser } from "@/lib/chat-auth";
import { publishChatMessage } from "@/lib/realtime";
import { ChatMessageInputError, saveChatMessage } from "@/lib/chat-messages";
import type { Document, Filter } from "mongodb";

const messagePageSize = 50;

async function getConversation(
  context: NonNullable<Awaited<ReturnType<typeof getChatUser>>>,
  id: string,
) {
  if (!ObjectId.isValid(id)) return null;
  return context.database.collection("conversations").findOne({
    _id: new ObjectId(id),
    organizationId: context.organizationId,
    memberIds: context.user._id,
  });
}

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const context = await getChatUser();
  if (!context) return Response.json({ error: "You are not logged in." }, { status: 401 });
  const conversation = await getConversation(context, (await params).id);
  if (!conversation) return Response.json({ error: "Conversation not found." }, { status: 404 });

  const collection = context.database.collection("messages");
  const before = new URL(request.url).searchParams.get("before");
  const filter: Filter<Document> = { conversationId: conversation._id };
  if (before) {
    if (!ObjectId.isValid(before)) {
      return Response.json({ error: "Invalid message cursor." }, { status: 400 });
    }
    const anchor = await collection.findOne(
      { _id: new ObjectId(before), conversationId: conversation._id },
      { projection: { createdAt: 1 } },
    );
    if (!anchor) return Response.json({ error: "Message cursor not found." }, { status: 400 });
    filter.$or = [
      { createdAt: { $lt: anchor.createdAt } },
      { createdAt: anchor.createdAt, _id: { $lt: anchor._id } },
    ];
  }

  const documents = await collection
    .find(filter)
    .sort({ createdAt: -1, _id: -1 })
    .limit(messagePageSize + 1)
    .toArray();
  const readReceipts = await context.database
    .collection("conversation_reads")
    .find({ conversationId: conversation._id, userId: { $in: conversation.memberIds } })
    .project({ userId: 1, readAt: 1, deliveredAt: 1 })
    .toArray();
  const hasMore = documents.length > messagePageSize;
  const messages = documents.slice(0, messagePageSize).reverse();
  return Response.json({
    messages,
    hasMore,
    readReceipts,
  });
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const context = await getChatUser();
  if (!context) return Response.json({ error: "You are not logged in." }, { status: 401 });
  if (!hasPermission(context, "message.send"))
    return Response.json({ error: "You cannot send messages." }, { status: 403 });
  const conversation = await getConversation(context, (await params).id);
  if (!conversation) return Response.json({ error: "Conversation not found." }, { status: 404 });
  let body: { text?: unknown; clientMessageId?: unknown };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Request body must be valid JSON." }, { status: 400 });
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return Response.json({ error: "Request body must be a JSON object." }, { status: 400 });
  }
  try {
    const result = await saveChatMessage(context.database, {
      conversationId: conversation._id,
      senderId: context.user._id,
      text: body.text,
      clientMessageId: body.clientMessageId,
    });
    const realtimeRecipients = result.created
      ? await publishChatMessage({
          ...result.message,
          organizationId: context.organizationId.toString(),
        })
      : null;
    return Response.json(
      { message: result.message, realtimeRecipients, duplicate: !result.created },
      { status: result.created ? 201 : 200 },
    );
  } catch (error) {
    if (error instanceof ChatMessageInputError) {
      return Response.json({ error: error.message }, { status: 400 });
    }
    throw error;
  }
}
