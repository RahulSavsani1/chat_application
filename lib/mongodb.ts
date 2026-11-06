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
    indexesPromise = mongoClientPromise.then(async (client) => {
      const database = client.db("chat_application");
      await database.collection("users").createIndex({ email: 1 }, { unique: true });
      await database
        .collection("users")
        .createIndex({ googleId: 1 }, { unique: true, sparse: true });
      await database.collection("sessions").createIndex({ token: 1 }, { unique: true });
      await database
        .collection("sessions")
        .createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 });
      await database.collection("password_resets").createIndex({ tokenHash: 1 }, { unique: true });
      await database
        .collection("password_resets")
        .createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 });
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
    });
  }

  await indexesPromise;
}

if (process.env.NODE_ENV !== "production") {
  globalForMongo.mongoClientPromise = mongoClientPromise;
}
