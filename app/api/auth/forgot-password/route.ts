import { createHash, randomBytes } from "node:crypto";
import { mongoClientPromise } from "@/lib/mongodb";

export async function POST(request: Request) {
  let body: { email?: unknown };
  try {
    body = await request.json();
  } catch {
    return Response.json({ message: "If an account exists, a reset link has been sent." });
  }

  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const genericMessage = "If an account exists, a reset link has been sent.";
  if (!email) return Response.json({ message: genericMessage });

  const client = await mongoClientPromise;
  const database = client.db("chat_application");
  const user = await database.collection("users").findOne({ email });
  if (!user) return Response.json({ message: genericMessage });

  const rawToken = randomBytes(32).toString("hex");
  const tokenHash = createHash("sha256").update(rawToken).digest("hex");
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000);
  await database.collection("password_resets").deleteMany({ userId: user._id });
  await database
    .collection("password_resets")
    .insertOne({ userId: user._id, tokenHash, expiresAt, createdAt: new Date() });

  const resetUrl = `${new URL(request.url).origin}/reset-password?token=${rawToken}`;
  if (process.env.NODE_ENV !== "production") console.info("Password reset URL:", resetUrl);

  return Response.json({
    message: genericMessage,
    ...(process.env.NODE_ENV !== "production" ? { resetUrl } : {}),
  });
}
