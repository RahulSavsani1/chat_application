import { MongoServerError, ObjectId } from "mongodb";
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
    const organizations = database.collection("organizations");
    let personalWorkspace = await organizations.findOne({
      ownerId: user._id,
      isPersonalWorkspace: true,
    });

    if (!personalWorkspace) {
      const legacyOwnedWorkspace = await organizations.findOne({ ownerId: user._id });
      if (legacyOwnedWorkspace) {
        try {
          await organizations.updateOne(
            { _id: legacyOwnedWorkspace._id, ownerId: user._id },
            { $set: { isPersonalWorkspace: true } },
          );
          personalWorkspace = await organizations.findOne({
            ownerId: user._id,
            isPersonalWorkspace: true,
          });
        } catch (error) {
          if (!(error instanceof MongoServerError && error.code === 11000)) throw error;
          personalWorkspace = await organizations.findOne({
            ownerId: user._id,
            isPersonalWorkspace: true,
          });
        }
      } else {
        try {
          const created = await organizations.insertOne({
            name: `${user.name ?? user.email}'s workspace`,
            ownerId: user._id,
            isPersonalWorkspace: true,
            createdAt: new Date(),
          });
          personalWorkspace = await organizations.findOne({ _id: created.insertedId });
        } catch (error) {
          if (!(error instanceof MongoServerError && error.code === 11000)) throw error;
          personalWorkspace = await organizations.findOne({
            ownerId: user._id,
            isPersonalWorkspace: true,
          });
        }
      }
    }

    if (!personalWorkspace) throw new Error("Could not create the user's personal workspace.");
    const now = new Date();
    const memberships = database.collection("organization_members");
    try {
      await memberships.updateOne(
        { organizationId: personalWorkspace._id, userId: user._id },
        {
          $set: { role: "owner", status: "active", updatedAt: now },
          $setOnInsert: { createdAt: now },
        },
        { upsert: true },
      );
    } catch (error) {
      if (!(error instanceof MongoServerError && error.code === 11000)) throw error;
    }
    membership = await memberships.findOne({
      organizationId: personalWorkspace._id,
      userId: user._id,
      status: "active",
    });
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
  return Boolean(context && hasRolePermission(context.role, permission));
}

export function hasRolePermission(role: unknown, permission: Permission) {
  const normalizedRole = String(role ?? "").toLowerCase() as Role;
  return Boolean(rolePermissions[normalizedRole]?.includes(permission));
}
