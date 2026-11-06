import { createHash } from "node:crypto";
import type { Db } from "mongodb";
import { ObjectId } from "mongodb";

export type InvitationRole = "admin" | "member";

export function hashInvitationToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export async function findPendingInvitation(database: Db, token: string) {
  return database.collection("organization_invitations").findOne({
    tokenHash: hashInvitationToken(token),
    status: "pending",
    expiresAt: { $gt: new Date() },
  });
}

export async function acceptInvitation(
  database: Db,
  token: string,
  userId: ObjectId,
  userEmail: string,
) {
  const invitation = await findPendingInvitation(database, token);
  if (!invitation) return { ok: false as const, error: "This invitation is invalid or expired." };
  if (invitation.email !== userEmail.toLowerCase())
    return { ok: false as const, error: "This invitation belongs to a different email address." };

  const members = database.collection("organization_members");
  const existingMember = await members.findOne({
    organizationId: invitation.organizationId,
    userId,
    status: "active",
  });
  if (!existingMember) {
    await members.updateOne(
      { organizationId: invitation.organizationId, userId },
      {
        $set: { role: invitation.role, status: "active", updatedAt: new Date() },
        $setOnInsert: { createdAt: new Date() },
      },
      { upsert: true },
    );
  }
  await database.collection("organization_invitations").updateOne(
    { _id: invitation._id },
    {
      $set: {
        status: "accepted",
        acceptedAt: new Date(),
        acceptedBy: userId,
      },
    },
  );
  return { ok: true as const, organizationId: invitation.organizationId };
}
