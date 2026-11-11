import { ensureDatabaseIndexes, mongoClientPromise } from "@/lib/mongodb";
import { verifyPassword } from "@/lib/password";
import { createSession } from "@/lib/session";
import { findPendingInvitation, acceptInvitation } from "@/lib/invitations";
import { consumeRateLimit, requestAddress } from "@/lib/rate-limit";

export async function POST(request: Request) {
  let body: { email?: unknown; password?: unknown; inviteToken?: unknown };

  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Request body must be valid JSON." }, { status: 400 });
  }
  if (!body || typeof body !== "object" || Array.isArray(body))
    return Response.json({ error: "Request body must be a JSON object." }, { status: 400 });

  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const password = typeof body.password === "string" ? body.password : "";
  const inviteToken = typeof body.inviteToken === "string" ? body.inviteToken.trim() : "";

  if (!email || !password) {
    return Response.json({ error: "Email and password are required." }, { status: 400 });
  }

  try {
    const client = await mongoClientPromise;
    await ensureDatabaseIndexes();
    const database = client.db("chat_application");
    const address = requestAddress(request);
    const limits = await Promise.all([
      consumeRateLimit(database, `login:ip:${address}`, 20, 15 * 60_000),
      consumeRateLimit(database, `login:identity:${address}:${email}`, 8, 15 * 60_000),
    ]);
    const blocked = limits.find((limit) => !limit.allowed);
    if (blocked) {
      return Response.json(
        { error: "Too many login attempts. Please try again shortly." },
        { status: 429, headers: { "Retry-After": String(blocked.retryAfterSeconds) } },
      );
    }
    const user = await database.collection("users").findOne({ email });

    if (
      !user ||
      typeof user.passwordHash !== "string" ||
      !(await verifyPassword(password, user.passwordHash))
    ) {
      return Response.json({ error: "Invalid email or password." }, { status: 401 });
    }

    if (inviteToken) {
      const invitation = await findPendingInvitation(database, inviteToken);
      if (!invitation || invitation.email !== email)
        return Response.json(
          { error: "This invitation is invalid, expired, or belongs to another email." },
          { status: 400 },
        );
    }
    if (inviteToken) {
      const accepted = await acceptInvitation(database, inviteToken, user._id, email);
      if (!accepted.ok) return Response.json({ error: accepted.error }, { status: 400 });
    }
    await createSession(user._id.toString());
    return Response.json({ message: "Logged in." });
  } catch {
    return Response.json({ error: "Could not log in right now." }, { status: 500 });
  }
}
