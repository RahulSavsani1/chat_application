import { randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { ensureDatabaseIndexes, mongoClientPromise } from "@/lib/mongodb";

export const sessionCookieName = "chat_session";

export async function createSession(userId: string) {
  const token = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24 * 7);
  const client = await mongoClientPromise;
  await ensureDatabaseIndexes();

  await client.db("chat_application").collection("sessions").insertOne({
    token,
    userId,
    createdAt: new Date(),
    expiresAt,
  });

  const cookieStore = await cookies();
  cookieStore.set(sessionCookieName, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
  });
}

export async function getCurrentSession() {
  const cookieStore = await cookies();
  const token = cookieStore.get(sessionCookieName)?.value;
  if (!token) return null;

  const client = await mongoClientPromise;
  await ensureDatabaseIndexes();
  return client
    .db("chat_application")
    .collection("sessions")
    .findOne({ token, expiresAt: { $gt: new Date() } });
}

export async function clearSession() {
  const cookieStore = await cookies();
  const token = cookieStore.get(sessionCookieName)?.value;

  if (token) {
    const client = await mongoClientPromise;
    await client.db("chat_application").collection("sessions").deleteOne({ token });
  }

  cookieStore.delete(sessionCookieName);
}
