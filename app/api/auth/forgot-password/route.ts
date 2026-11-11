import { createHash, randomBytes, randomInt } from "node:crypto";
import { ensureDatabaseIndexes, mongoClientPromise } from "@/lib/mongodb";
import { consumeRateLimit, requestAddress } from "@/lib/rate-limit";
import { isSmtpConfigured, sendPasswordResetEmail } from "@/lib/email";
import { replacePasswordReset } from "@/lib/password-resets";

export async function POST(request: Request) {
  let body: { email?: unknown };
  try {
    body = await request.json();
  } catch {
    return Response.json({ message: "If an account exists, a reset link has been sent." });
  }

  const genericMessage = "If an account exists, a reset link has been sent.";
  if (!body || typeof body !== "object" || Array.isArray(body))
    return Response.json({ message: genericMessage });
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  if (!email) return Response.json({ message: genericMessage });

  const client = await mongoClientPromise;
  await ensureDatabaseIndexes();
  const database = client.db("chat_application");
  const address = requestAddress(request);
  const limits = await Promise.all([
    consumeRateLimit(database, `recovery:ip:${address}`, 20, 60 * 60_000),
    consumeRateLimit(database, `recovery:identity:${address}:${email}`, 3, 60 * 60_000),
  ]);
  if (limits.some((limit) => !limit.allowed)) return Response.json({ message: genericMessage });
  const user = await database.collection("users").findOne({ email });
  if (!user) return Response.json({ message: genericMessage });

  const smtpConfigured = isSmtpConfigured();
  const showDevelopmentOtp = process.env.NODE_ENV !== "production" && !smtpConfigured;
  const rawToken = showDevelopmentOtp
    ? randomInt(0, 100_000_000).toString().padStart(8, "0")
    : randomBytes(32).toString("hex");
  const tokenHash = createHash("sha256").update(rawToken).digest("hex");
  const expiresAt = new Date(Date.now() + (showDevelopmentOtp ? 10 : 60) * 60 * 1000);
  await replacePasswordReset(database, { userId: user._id, tokenHash, expiresAt });

  if (smtpConfigured) {
    let appOrigin: string;
    try {
      if (process.env.NODE_ENV === "production" && !process.env.APP_ORIGIN)
        throw new Error("APP_ORIGIN is required to generate production password reset links.");
      appOrigin = new URL(process.env.APP_ORIGIN || request.url).origin;
    } catch (error) {
      await database.collection("password_resets").deleteOne({ userId: user._id, tokenHash });
      console.error("Could not create password reset link:", error);
      return Response.json({ message: genericMessage });
    }
    const resetUrl = `${appOrigin}/reset-password?token=${rawToken}`;
    try {
      await sendPasswordResetEmail(email, resetUrl);
    } catch (error) {
      await database.collection("password_resets").deleteOne({ userId: user._id, tokenHash });
      console.error("Could not send password reset email:", error);
      return Response.json({ message: genericMessage });
    }
  } else if (process.env.NODE_ENV === "production") {
    await database.collection("password_resets").deleteOne({ userId: user._id, tokenHash });
    console.error("Password reset email was not sent because SMTP is not configured.");
    return Response.json({ message: genericMessage });
  }

  return Response.json({
    message: showDevelopmentOtp
      ? "SMTP is not configured. Use this temporary development OTP to reset your password. It expires in 10 minutes."
      : genericMessage,
    ...(showDevelopmentOtp ? { otp: rawToken } : {}),
  });
}
