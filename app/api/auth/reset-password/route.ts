import { createHash } from "node:crypto";
import { hashPassword } from "@/lib/password";
import { ensureDatabaseIndexes, mongoClientPromise } from "@/lib/mongodb";
import { consumeRateLimit, requestAddress } from "@/lib/rate-limit";

export async function POST(request: Request) {
  let body: { token?: unknown; password?: unknown };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Request body must be valid JSON." }, { status: 400 });
  }

  const token = typeof body.token === "string" ? body.token : "";
  const password = typeof body.password === "string" ? body.password : "";
  if (!token || password.length < 8)
    return Response.json(
      { error: "A valid token and password of at least 8 characters are required." },
      { status: 400 },
    );

  const client = await mongoClientPromise;
  await ensureDatabaseIndexes();
  const database = client.db("chat_application");
  const limit = await consumeRateLimit(
    database,
    `password-reset:ip:${requestAddress(request)}`,
    10,
    60 * 60_000,
  );
  if (!limit.allowed)
    return Response.json(
      { error: "Too many reset attempts. Please try again later." },
      { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } },
    );
  const tokenHash = createHash("sha256").update(token).digest("hex");
  const reset = await database
    .collection("password_resets")
    .findOne({ tokenHash, expiresAt: { $gt: new Date() } });
  if (!reset)
    return Response.json({ error: "This reset link is invalid or expired." }, { status: 400 });

  await database
    .collection("users")
    .updateOne(
      { _id: reset.userId },
      { $set: { passwordHash: await hashPassword(password), updatedAt: new Date() } },
    );
  await database.collection("password_resets").deleteOne({ _id: reset._id });
  await database.collection("sessions").deleteMany({ userId: reset.userId.toString() });
  return Response.json({ message: "Password reset successfully." });
}
