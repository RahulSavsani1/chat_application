import { MongoServerError, ObjectId } from "mongodb";
import type { Db } from "mongodb";

export const maxMessageLength = 10_000;

export class ChatMessageInputError extends Error {}

export type SavedChatMessage = {
  _id: string;
  conversationId: string;
  senderId: string;
  text: string;
  createdAt: Date;
};

type StoredChatMessage = {
  _id?: ObjectId;
  conversationId: ObjectId;
  senderId: ObjectId;
  text: string;
  clientMessageId: string | null;
  createdAt: Date;
};

export async function saveChatMessage(
  database: Db,
  input: {
    conversationId: ObjectId;
    senderId: ObjectId;
    text: unknown;
    clientMessageId?: unknown;
  },
): Promise<{ message: SavedChatMessage; created: boolean }> {
  const text = typeof input.text === "string" ? input.text.trim() : "";
  if (!text || text.length > maxMessageLength) {
    throw new ChatMessageInputError(`Message must contain 1 to ${maxMessageLength} characters.`);
  }

  const clientMessageId =
    typeof input.clientMessageId === "string" ? input.clientMessageId.trim() : "";
  if (input.clientMessageId !== undefined && input.clientMessageId !== null) {
    if (typeof input.clientMessageId !== "string" || clientMessageId.length === 0) {
      throw new ChatMessageInputError("Message id must be a non-empty string.");
    }
  }
  if (clientMessageId.length > 128) {
    throw new ChatMessageInputError("Message id is too long.");
  }

  const messages = database.collection<StoredChatMessage>("messages");
  const query = clientMessageId
    ? { conversationId: input.conversationId, senderId: input.senderId, clientMessageId }
    : null;
  if (query) {
    const existing = await messages.findOne(query);
    if (existing) {
      await bumpConversationActivity(database, input.conversationId, existing.createdAt);
      return { message: serialize(existing), created: false };
    }
  }

  const document = {
    conversationId: input.conversationId,
    senderId: input.senderId,
    text,
    clientMessageId: clientMessageId || null,
    createdAt: new Date(),
  };

  let insertedId: ObjectId;
  try {
    insertedId = (await messages.insertOne(document)).insertedId;
  } catch (error) {
    if (query && error instanceof MongoServerError && error.code === 11000) {
      const existing = await messages.findOne(query);
      if (existing) {
        await bumpConversationActivity(database, input.conversationId, existing.createdAt);
        return { message: serialize(existing), created: false };
      }
    }
    throw error;
  }

  await bumpConversationActivity(database, input.conversationId, document.createdAt);

  return {
    message: {
      _id: insertedId.toString(),
      conversationId: input.conversationId.toString(),
      senderId: input.senderId.toString(),
      text,
      createdAt: document.createdAt,
    },
    created: true,
  };
}

async function bumpConversationActivity(database: Db, conversationId: ObjectId, activityAt: Date) {
  await database
    .collection("conversations")
    .updateOne({ _id: conversationId }, { $max: { updatedAt: activityAt } });
}

function serialize(message: StoredChatMessage & { _id: ObjectId }): SavedChatMessage {
  return {
    _id: message._id.toString(),
    conversationId: message.conversationId.toString(),
    senderId: message.senderId.toString(),
    text: message.text,
    createdAt: message.createdAt,
  };
}
