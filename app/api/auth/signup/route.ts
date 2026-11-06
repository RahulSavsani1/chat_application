import { hashPassword } from "@/lib/password";
import { ensureDatabaseIndexes, mongoClientPromise } from "@/lib/mongodb";
import { acceptInvitation, findPendingInvitation } from "@/lib/invitations";

type SignupBody = { email: string; password: string; inviteToken?: string };

export async function POST(request: Request) {
  let body: Partial<SignupBody>;

  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Request body must be valid JSON." }, { status: 400 });
  }

  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const password = typeof body.password === "string" ? body.password : "";
  const inviteToken = typeof body.inviteToken === "string" ? body.inviteToken.trim() : "";

  if (!email || !email.includes("@")) {
    return Response.json({ error: "Enter a valid email address." }, { status: 400 });
  }

  if (password.length < 8) {
    return Response.json({ error: "Password must be at least 8 characters." }, { status: 400 });
  }

  try {
    const client = await mongoClientPromise;
    await ensureDatabaseIndexes();
    const database = client.db("chat_application");
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
    if (inviteToken) {
      await acceptInvitation(database, inviteToken, userResult.insertedId, email);
    } else {
      const organization = await database.collection("organizations").insertOne({
        name: `${email.split("@")[0]}'s workspace`,
        ownerId: userResult.insertedId,
        createdAt: new Date(),
      });
      await database.collection("organization_members").insertOne({
        organizationId: organization.insertedId,
        userId: userResult.insertedId,
        role: "owner",
        status: "active",
        createdAt: new Date(),
      });
    }

    return Response.json({ message: "Account created." }, { status: 201 });
  } catch {
    return Response.json({ error: "Could not create the account." }, { status: 500 });
  }
}
