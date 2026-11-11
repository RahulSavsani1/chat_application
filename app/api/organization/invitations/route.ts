import { MongoServerError } from "mongodb";
import { randomBytes } from "node:crypto";
import { getAuthorizationContext, hasPermission } from "@/lib/authorization";
import { findPendingInvitation, hashInvitationToken } from "@/lib/invitations";
import { ensureDatabaseIndexes, mongoClientPromise } from "@/lib/mongodb";

export async function GET(request: Request) {
  const token = new URL(request.url).searchParams.get("token")?.trim();
  if (!token) {
    const context = await getAuthorizationContext();
    if (!context) return Response.json({ error: "You are not logged in." }, { status: 401 });
    if (!hasPermission(context, "member.invite"))
      return Response.json({ error: "You cannot view invitations." }, { status: 403 });
    const invitations = await context.database
      .collection("organization_invitations")
      .find({ organizationId: context.organizationId, status: "pending" })
      .sort({ createdAt: -1 })
      .project({ email: 1, role: 1, expiresAt: 1, createdAt: 1 })
      .toArray();
    return Response.json({ invitations });
  }
  const client = await mongoClientPromise;
  await ensureDatabaseIndexes();
  const database = client.db("chat_application");
  const invitation = await findPendingInvitation(database, token);
  if (!invitation)
    return Response.json({ error: "This invitation is invalid or expired." }, { status: 404 });
  const organization = await database
    .collection("organizations")
    .findOne({ _id: invitation.organizationId }, { projection: { name: 1 } });
  return Response.json({
    invitation: {
      email: invitation.email,
      role: invitation.role,
      organizationName: organization?.name ?? "Chat organization",
    },
  });
}

export async function POST(request: Request) {
  const context = await getAuthorizationContext();
  if (!context) return Response.json({ error: "You are not logged in." }, { status: 401 });
  let body: { email?: unknown; role?: unknown };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Request body must be valid JSON." }, { status: 400 });
  }
  if (!body || typeof body !== "object" || Array.isArray(body))
    return Response.json({ error: "Request body must be a JSON object." }, { status: 400 });
  if (!hasPermission(context, "member.invite"))
    return Response.json({ error: "You cannot invite organization members." }, { status: 403 });
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const role = body.role === "admin" ? "admin" : "member";
  if (!email || !email.includes("@"))
    return Response.json({ error: "Enter a valid email address." }, { status: 400 });
  if (role === "admin" && context.role !== "owner")
    return Response.json({ error: "Only the owner can invite admins." }, { status: 403 });
  const existingUser = await context.database.collection("users").findOne({ email });
  if (existingUser) {
    const member = await context.database.collection("organization_members").findOne({
      organizationId: context.organizationId,
      userId: existingUser._id,
      status: "active",
    });
    if (member) return Response.json({ error: "This user is already a member." }, { status: 409 });
  }
  const rawToken = randomBytes(32).toString("hex");
  const tokenHash = hashInvitationToken(rawToken);
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  const invitationFilter = {
    organizationId: context.organizationId,
    email,
    status: "pending",
  };
  const invitationUpdate = {
    $set: { role, tokenHash, invitedBy: context.user._id, expiresAt },
    $setOnInsert: { createdAt: new Date() },
  };
  try {
    await context.database
      .collection("organization_invitations")
      .updateOne(invitationFilter, invitationUpdate, { upsert: true });
  } catch (error) {
    if (!(error instanceof MongoServerError && error.code === 11000)) throw error;
    await context.database
      .collection("organization_invitations")
      .updateOne(invitationFilter, invitationUpdate);
  }
  const appOrigin = new URL(process.env.APP_ORIGIN || request.url).origin;
  const inviteUrl = `${appOrigin}/invite?token=${rawToken}`;
  return Response.json({ message: "Invitation created.", inviteUrl }, { status: 201 });
}
