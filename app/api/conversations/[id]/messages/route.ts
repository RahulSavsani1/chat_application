import { ObjectId } from "mongodb";
import { hasPermission } from "@/lib/authorization";
import { getChatUser } from "@/lib/chat-auth";

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
  const messages = await context.database
    .collection("messages")
    .find({ conversationId: conversation._id })
    .sort({ createdAt: 1 })
    .toArray();
  return Response.json({ messages });
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const context = await getChatUser();
  if (!context) return Response.json({ error: "You are not logged in." }, { status: 401 });
  if (!hasPermission(context, "message.send"))
    return Response.json({ error: "You cannot send messages." }, { status: 403 });
  const conversation = await getConversation(context, (await params).id);
  const body = (await request.json()) as { text?: string };
  const text = body.text?.trim() ?? "";
  if (!conversation || !text)
    return Response.json({ error: "A conversation and message are required." }, { status: 400 });
  const message = {
    conversationId: conversation._id,
    senderId: context.user._id,
    text,
    createdAt: new Date(),
  };
  const result = await context.database.collection("messages").insertOne(message);
  await context.database
    .collection("conversations")
    .updateOne({ _id: conversation._id }, { $set: { updatedAt: new Date() } });
  return Response.json({ message: { ...message, _id: result.insertedId } }, { status: 201 });
}
