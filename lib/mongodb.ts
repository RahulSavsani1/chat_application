import { MongoClient } from "mongodb";

const mongoUrl = process.env.MONGO_URL;

if (!mongoUrl) {
  throw new Error("Please add MONGO_URL to .env");
}

const globalForMongo = globalThis as unknown as {
  mongoClientPromise?: Promise<MongoClient>;
};

export const mongoClientPromise =
  globalForMongo.mongoClientPromise ?? new MongoClient(mongoUrl).connect();

let indexesPromise: Promise<void> | undefined;

export async function ensureDatabaseIndexes() {
  if (!indexesPromise) {
    indexesPromise = mongoClientPromise
      .then(async (client) => {
        const database = client.db("chat_application");
        await database.collection("users").createIndex({ email: 1 }, { unique: true });
        await database
          .collection("users")
          .createIndex({ googleId: 1 }, { unique: true, sparse: true });
        await database.collection("sessions").createIndex({ token: 1 }, { unique: true });
        await database.collection("organizations").createIndex(
          { ownerId: 1 },
          {
            unique: true,
            partialFilterExpression: { isPersonalWorkspace: true },
          },
        );
        await database.collection("messages").createIndex(
          { conversationId: 1, senderId: 1, clientMessageId: 1 },
          {
            unique: true,
            partialFilterExpression: { clientMessageId: { $type: "string" } },
          },
        );
        await database.collection("conversations").createIndex(
          { organizationId: 1, directKey: 1 },
          {
            unique: true,
            partialFilterExpression: { directKey: { $type: "string" } },
          },
        );
        await database
          .collection("messages")
          .createIndex({ conversationId: 1, createdAt: -1, _id: -1 });
        await database
          .collection("messages")
          .createIndex({ conversationId: 1, senderId: 1, createdAt: 1 });
        await database
          .collection("conversations")
          .createIndex({ organizationId: 1, memberIds: 1, updatedAt: -1 });
        await database
          .collection("conversation_reads")
          .createIndex({ conversationId: 1, userId: 1 }, { unique: true });
        await database
          .collection("rate_limits")
          .createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 });
        await database
          .collection("sessions")
          .createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 });
        await database
          .collection("password_resets")
          .createIndex({ tokenHash: 1 }, { unique: true });
        await database
          .collection("password_resets")
          .createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 });
        await database.collection("password_resets").createIndex({ userId: 1 }, { unique: true });
        await database
          .collection("organization_members")
          .createIndex({ organizationId: 1, userId: 1 }, { unique: true });
        await database.collection("organization_members").createIndex({ userId: 1, status: 1 });
        await database
          .collection("organization_invitations")
          .createIndex({ tokenHash: 1 }, { unique: true });
        await database
          .collection("organization_invitations")
          .createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 });
        await database.collection("organization_invitations").createIndex({
          organizationId: 1,
          email: 1,
          status: 1,
        });
        await database.collection("organization_invitations").createIndex(
          { organizationId: 1, email: 1 },
          {
            unique: true,
            partialFilterExpression: { status: "pending" },
          },
        );
      })
      .catch((error) => {
        indexesPromise = undefined;
        throw error;
      });
  }

  await indexesPromise;
}

if (process.env.NODE_ENV !== "production") {
  globalForMongo.mongoClientPromise = mongoClientPromise;
}
