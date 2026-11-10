import { ObjectId } from "mongodb";
import { ensureDatabaseIndexes, mongoClientPromise } from "@/lib/mongodb";
import { verifySocketTicket } from "@/lib/socket-ticket";
import { ChatMessageInputError, saveChatMessage } from "@/lib/chat-messages";
import { markConversationDelivered, markConversationRead } from "@/lib/chat-read-state";
import { hasRolePermission } from "@/lib/authorization";

export async function POST(request: Request) {
  let body: {
    ticket?: unknown;
    action?: unknown;
    conversationId?: unknown;
    text?: unknown;
    clientMessageId?: unknown;
    messageId?: unknown;
  };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid request." }, { status: 400 });
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return Response.json({ error: "Invalid request." }, { status: 400 });
  }

  const ticket = verifySocketTicket(body.ticket);
  if (!ticket || !ObjectId.isValid(ticket.userId) || !ObjectId.isValid(ticket.organizationId)) {
    return Response.json({ error: "Socket ticket is invalid or expired." }, { status: 401 });
  }
  if (
    body.action !== "join" &&
    body.action !== "send" &&
    body.action !== "read" &&
    body.action !== "delivered"
  ) {
    return Response.json({ error: "Unknown socket action." }, { status: 400 });
  }
  if (typeof body.conversationId !== "string" || !ObjectId.isValid(body.conversationId)) {
    return Response.json({ error: "A valid conversation is required." }, { status: 400 });
  }

  const client = await mongoClientPromise;
  await ensureDatabaseIndexes();
  const database = client.db("chat_application");
  const userId = new ObjectId(ticket.userId);
  const organizationId = new ObjectId(ticket.organizationId);
  const membership = await database.collection("organization_members").findOne({
    organizationId,
    userId,
    status: "active",
  });
  if (!membership)
    return Response.json({ error: "Organization access has changed." }, { status: 403 });
  if (body.action === "send") {
    const organization = await database
      .collection("organizations")
      .findOne({ _id: organizationId }, { projection: { ownerId: 1 } });
    const role = organization?.ownerId?.equals(userId) ? "owner" : membership.role;
    if (!hasRolePermission(role, "message.send"))
      return Response.json({ error: "You cannot send messages." }, { status: 403 });
  }

  const conversation = await database.collection("conversations").findOne({
    _id: new ObjectId(body.conversationId),
    organizationId,
    memberIds: userId,
  });
  if (!conversation) return Response.json({ error: "Conversation not found." }, { status: 404 });
  if (body.action === "join") return Response.json({ ok: true });
  if (body.action === "read") {
    const readAt = await markConversationRead(database, conversation._id, userId);
    return Response.json({ ok: true, readAt });
  }
  if (body.action === "delivered") {
    if (typeof body.messageId !== "string" || !ObjectId.isValid(body.messageId)) {
      return Response.json({ error: "A valid message is required." }, { status: 400 });
    }
    const message = await database.collection("messages").findOne({
      _id: new ObjectId(body.messageId),
      conversationId: conversation._id,
      senderId: { $ne: userId },
    });
    if (!message || !(message.createdAt instanceof Date))
      return Response.json({ error: "Message not found." }, { status: 404 });
    const deliveredAt = await markConversationDelivered(
      database,
      conversation._id,
      userId,
      message.createdAt,
    );
    return Response.json({
      ok: true,
      conversationId: conversation._id.toString(),
      userId: userId.toString(),
      deliveredAt,
      senderId: message.senderId.toString(),
    });
  }

  try {
    const result = await saveChatMessage(database, {
      conversationId: conversation._id,
      senderId: userId,
      text: body.text,
      clientMessageId: body.clientMessageId,
    });
    return Response.json(
      { ok: true, message: result.message, organizationId: organizationId.toString() },
      { status: result.created ? 201 : 200 },
    );
  } catch (error) {
    if (error instanceof ChatMessageInputError) {
      return Response.json({ error: error.message }, { status: 400 });
    }
    throw error;
  }
}
