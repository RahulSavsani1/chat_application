import type { Db } from "mongodb";
import type { ObjectId } from "mongodb";

export async function markConversationRead(
  database: Db,
  conversationId: ObjectId,
  userId: ObjectId,
) {
  const readAt = new Date();
  await database.collection("conversation_reads").updateOne(
    { conversationId, userId },
    {
      $max: { readAt, deliveredAt: readAt },
      $setOnInsert: { conversationId, userId },
    },
    { upsert: true },
  );
  return readAt;
}

export async function markConversationDelivered(
  database: Db,
  conversationId: ObjectId,
  userId: ObjectId,
  deliveredAt: Date,
) {
  await database
    .collection("conversation_reads")
    .updateOne(
      { conversationId, userId },
      { $max: { deliveredAt }, $setOnInsert: { conversationId, userId } },
      { upsert: true },
    );
  return deliveredAt;
}
