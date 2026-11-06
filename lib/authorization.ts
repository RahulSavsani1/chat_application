import { ObjectId } from "mongodb";
import { ensureDatabaseIndexes, mongoClientPromise } from "@/lib/mongodb";
import { getCurrentSession } from "@/lib/session";

export type Role = "owner" | "admin" | "member";
export type Permission =
  | "organization.view"
  | "organization.settings.view"
  | "organization.update"
  | "organization.delete"
  | "organization.transfer_owner"
  | "member.view"
  | "member.invite"
  | "member.remove"
  | "member.manage_roles"
  | "member.reset_password"
  | "conversation.create"
  | "message.send"
  | "profile.update";

const rolePermissions: Record<Role, Permission[]> = {
  owner: [
    "organization.view",
    "organization.settings.view",
    "organization.update",
    "organization.delete",
    "organization.transfer_owner",
    "member.view",
    "member.invite",
    "member.remove",
    "member.manage_roles",
    "member.reset_password",
    "conversation.create",
    "message.send",
    "profile.update",
  ],
  admin: [
    "organization.view",
    "organization.settings.view",
    "member.view",
    "member.invite",
    "member.remove",
    "member.manage_roles",
    "member.reset_password",
    "conversation.create",
    "message.send",
    "profile.update",
  ],
  member: [
    "organization.view",
    "member.view",
    "conversation.create",
    "message.send",
    "profile.update",
  ],
};

export async function getAuthorizationContext() {
  const session = await getCurrentSession();
  if (!session || typeof session.userId !== "string" || !ObjectId.isValid(session.userId))
    return null;
  const client = await mongoClientPromise;
  await ensureDatabaseIndexes();
  const database = client.db("chat_application");
  const user = await database.collection("users").findOne({ _id: new ObjectId(session.userId) });
  if (!user) return null;
  let membership = await database
    .collection("organization_members")
    .findOne({ userId: user._id, status: "active" });
  if (!membership) {
    const organization = await database.collection("organizations").insertOne({
      name: `${user.name ?? user.email}'s workspace`,
      ownerId: user._id,
      createdAt: new Date(),
    });
    await database.collection("organization_members").insertOne({
      organizationId: organization.insertedId,
      userId: user._id,
      role: "owner",
      status: "active",
      createdAt: new Date(),
    });
    membership = {
      _id: organization.insertedId,
      organizationId: organization.insertedId,
      userId: user._id,
      role: "owner",
      status: "active",
    };
  }
  if (!membership) return null;
  const organization = await database
    .collection("organizations")
    .findOne({ _id: membership.organizationId }, { projection: { ownerId: 1 } });
  const membershipRole = String(membership.role ?? "").toLowerCase();
  const isOrganizationOwner = organization?.ownerId?.toString() === user._id.toString();
  const role: Role = isOrganizationOwner
    ? "owner"
    : membershipRole === "admin"
      ? "admin"
      : membershipRole === "owner"
        ? "owner"
        : "member";
  return {
    client,
    database,
    user,
    organizationId: membership.organizationId as ObjectId,
    role,
    permissions: rolePermissions[role],
  };
}

export function hasPermission(
  context: Awaited<ReturnType<typeof getAuthorizationContext>>,
  permission: Permission,
) {
  return Boolean(context?.permissions.includes(permission));
}
