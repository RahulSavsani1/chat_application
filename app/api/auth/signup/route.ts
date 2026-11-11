import { MongoServerError } from "mongodb";
import { hashPassword } from "@/lib/password";
import { ensureDatabaseIndexes, mongoClientPromise } from "@/lib/mongodb";
import { acceptInvitation, findPendingInvitation } from "@/lib/invitations";
import { consumeRateLimit, requestAddress } from "@/lib/rate-limit";

type SignupBody = { email: string; password: string; inviteToken?: string };

export async function POST(request: Request) {
  let body: Partial<SignupBody>;

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

  if (!email || !email.includes("@")) {
    return Response.json({ error: "Enter a valid email address." }, { status: 400 });
  }

  if (password.length < 8 || password.length > 1024) {
    return Response.json(
      { error: "Password must be between 8 and 1024 characters." },
      { status: 400 },
    );
  }

  try {
    const client = await mongoClientPromise;
    await ensureDatabaseIndexes();
    const database = client.db("chat_application");
    const limit = await consumeRateLimit(
      database,
      `signup:ip:${requestAddress(request)}`,
      5,
      60 * 60_000,
    );
    if (!limit.allowed) {
      return Response.json(
        { error: "Too many signup attempts. Please try again later." },
        { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } },
      );
    }
    const users = database.collection("users");
    const invitation = inviteToken ? await findPendingInvitation(database, inviteToken) : null;
    if (inviteToken && (!invitation || invitation.email !== email))
      return Response.json(
        { error: "This invitation is invalid, expired, or belongs to another email." },
        { status: 400 },
      );
    const existingUser = await users.findOne({ email });

    if (existingUser) {
      return Response.json(
        { error: "An account with this email already exists." },
        { status: 409 },
      );
    }

    const userResult = await users.insertOne({
      email,
      passwordHash: await hashPassword(password),
      name: email.split("@")[0],
      emailVerified: false,
      createdAt: new Date(),
    });
    let workspaceId: typeof userResult.insertedId | null = null;
    try {
      if (inviteToken) {
        const accepted = await acceptInvitation(
          database,
          inviteToken,
          userResult.insertedId,
          email,
        );
        if (!accepted.ok) {
          await users.deleteOne({ _id: userResult.insertedId });
          return Response.json({ error: accepted.error }, { status: 400 });
        }
      } else {
        const workspace = await database.collection("organizations").insertOne({
          name: `${email.split("@")[0]}'s workspace`,
          ownerId: userResult.insertedId,
          isPersonalWorkspace: true,
          createdAt: new Date(),
        });
        workspaceId = workspace.insertedId;
        await database.collection("organization_members").insertOne({
          organizationId: workspaceId,
          userId: userResult.insertedId,
          role: "owner",
          status: "active",
          createdAt: new Date(),
        });
      }
    } catch (error) {
      const cleanup = [users.deleteOne({ _id: userResult.insertedId })];
      if (workspaceId) {
        cleanup.push(
          database.collection("organization_members").deleteOne({
            organizationId: workspaceId,
            userId: userResult.insertedId,
          }),
        );
        cleanup.push(database.collection("organizations").deleteOne({ _id: workspaceId }));
      }
      if (invitation) {
        cleanup.push(
          database.collection("organization_members").deleteOne({
            organizationId: invitation.organizationId,
            userId: userResult.insertedId,
          }),
        );
      }
      await Promise.allSettled(cleanup);
      throw error;
    }

    return Response.json({ message: "Account created." }, { status: 201 });
  } catch (error) {
    if (error instanceof MongoServerError && error.code === 11000) {
      return Response.json(
        { error: "An account with this email already exists." },
        { status: 409 },
      );
    }
    return Response.json({ error: "Could not create the account." }, { status: 500 });
  }
}
