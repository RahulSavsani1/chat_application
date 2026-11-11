import { MongoServerError, ObjectId } from "mongodb";
import type { Db } from "mongodb";

export async function replacePasswordReset(
  database: Db,
  reset: { userId: ObjectId; tokenHash: string; expiresAt: Date },
) {
  const resets = database.collection("password_resets");
  const update = {
    $set: {
      tokenHash: reset.tokenHash,
      expiresAt: reset.expiresAt,
      createdAt: new Date(),
    },
  };
  try {
    await resets.updateOne({ userId: reset.userId }, update, { upsert: true });
  } catch (error) {
    if (!(error instanceof MongoServerError && error.code === 11000)) throw error;
    await resets.updateOne({ userId: reset.userId }, update);
  }
}
