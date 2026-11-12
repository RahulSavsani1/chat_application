import { createHash, randomBytes, randomInt } from "node:crypto";
import { ensureDatabaseIndexes, mongoClientPromise } from "@/lib/mongodb";
import { consumeRateLimit, requestAddress } from "@/lib/rate-limit";
import { isSmtpConfigured, sendPasswordResetEmail } from "@/lib/email";
import { replacePasswordReset } from "@/lib/password-resets";

export async function POST(request: Request) {
  const genericMessage = "If an account exists, we'll provide password recovery instructions.";
  let body: { email?: unknown };
  try {
    body = await request.json();
  } catch {
    return Response.json({ message: genericMessage });
  }

  if (!body || typeof body !== "object" || Array.isArray(body))
    return Response.json({ message: genericMessage });
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  if (!email) return Response.json({ message: genericMessage });

  const smtpConfigured = isSmtpConfigured();
  const showOtpFallback =
    !smtpConfigured &&
    (process.env.NODE_ENV !== "production" ||
      process.env.PASSWORD_RESET_ALLOW_OTP_FALLBACK === "true");
  if (!smtpConfigured && !showOtpFallback) {
    return Response.json(
      {
        message:
          "Password recovery email is not configured. To test without SMTP, set PASSWORD_RESET_ALLOW_OTP_FALLBACK=true in the server environment.",
      },
      { status: 503 },
    );
  }

  const client = await mongoClientPromise;
  await ensureDatabaseIndexes();
  const database = client.db("chat_application");
  const address = requestAddress(request);
  const limits = await Promise.all([
    consumeRateLimit(database, `recovery:ip:${address}`, 20, 60 * 60_000),
    consumeRateLimit(database, `recovery:identity:${address}:${email}`, 3, 60 * 60_000),
  ]);
  const blocked = limits.find((limit) => !limit.allowed);
  if (blocked)
    return Response.json(
      { message: "Too many reset requests. Please wait before trying again." },
      { status: 429, headers: { "Retry-After": String(blocked.retryAfterSeconds) } },
    );
  const user = await database.collection("users").findOne({ email });
  if (!user) return Response.json({ message: genericMessage });

  const rawToken = showOtpFallback
    ? randomInt(0, 100_000_000).toString().padStart(8, "0")
    : randomBytes(32).toString("hex");
  const tokenHash = createHash("sha256").update(rawToken).digest("hex");
  const expiresAt = new Date(Date.now() + (showOtpFallback ? 10 : 60) * 60 * 1000);
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
  }

  return Response.json({
    message: showOtpFallback
      ? "SMTP is not configured. Use this temporary OTP to reset your password. It expires in 10 minutes."
      : genericMessage,
    ...(showOtpFallback ? { otp: rawToken } : {}),
  });
}
