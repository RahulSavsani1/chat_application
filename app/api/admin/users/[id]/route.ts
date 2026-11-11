import { ObjectId } from "mongodb";
import { createHash, randomBytes } from "node:crypto";
import { getAuthorizationContext, hasPermission } from "@/lib/authorization";
import { replacePasswordReset } from "@/lib/password-resets";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const context = await getAuthorizationContext();
  if (!context) return Response.json({ error: "You are not logged in." }, { status: 401 });
  if (!hasPermission(context, "member.manage_roles"))
    return Response.json({ error: "Owner or admin access is required." }, { status: 403 });
  const { id } = await params;
  if (!ObjectId.isValid(id)) return Response.json({ error: "Invalid user." }, { status: 400 });
  let body: { role?: unknown };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Request body must be valid JSON." }, { status: 400 });
  }
  if (!body || typeof body !== "object" || Array.isArray(body))
    return Response.json({ error: "Request body must be a JSON object." }, { status: 400 });
  if (typeof body.role !== "string" || !["owner", "admin", "member"].includes(body.role))
    return Response.json({ error: "Invalid role." }, { status: 400 });
  if (body.role === "owner" && context.role !== "owner")
    return Response.json({ error: "Only the owner can assign ownership." }, { status: 403 });
  const result = await context.database
    .collection("organization_members")
    .updateOne(
      { organizationId: context.organizationId, userId: new ObjectId(id), status: "active" },
      { $set: { role: body.role, updatedAt: new Date() } },
    );
  if (!result.matchedCount) return Response.json({ error: "Member not found." }, { status: 404 });
  return Response.json({ message: "Role updated." });
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const context = await getAuthorizationContext();
  if (!context) return Response.json({ error: "You are not logged in." }, { status: 401 });
  if (!hasPermission(context, "member.reset_password"))
    return Response.json({ error: "Owner or admin access is required." }, { status: 403 });
  const { id } = await params;
  if (!ObjectId.isValid(id)) return Response.json({ error: "Invalid user." }, { status: 400 });
  const member = await context.database.collection("organization_members").findOne({
    organizationId: context.organizationId,
    userId: new ObjectId(id),
    status: "active",
  });
  if (!member) return Response.json({ error: "Member not found." }, { status: 404 });
  const rawToken = randomBytes(32).toString("hex");
  const tokenHash = createHash("sha256").update(rawToken).digest("hex");
  await replacePasswordReset(context.database, {
    userId: member.userId,
    tokenHash,
    expiresAt: new Date(Date.now() + 60 * 60 * 1000),
  });
  const resetOrigin = new URL(process.env.APP_ORIGIN || request.url).origin;
  const resetUrl = `${resetOrigin}/reset-password?token=${rawToken}`;
  return Response.json({ message: "Password reset link created.", resetUrl });
}
