const objectId = { bsonType: "objectId" };
const date = { bsonType: "date" };
const string = { bsonType: "string" };
const schema = (required, properties) => ({
  bsonType: "object",
  required: ["_id", ...required],
  properties: { _id: objectId, ...properties },
});

export const collectionSchemas = {
  users: schema(["email", "createdAt"], {
    email: { bsonType: "string", minLength: 3, maxLength: 254 },
    name: { bsonType: "string", maxLength: 100 },
    passwordHash: string,
    googleId: string,
    picture: string,
    emailVerified: { bsonType: "bool" },
    createdAt: date,
  }),
  organizations: schema(["name", "ownerId", "createdAt"], {
    name: { bsonType: "string", minLength: 1, maxLength: 100 },
    ownerId: objectId,
    isPersonalWorkspace: { bsonType: "bool" },
    createdAt: date,
  }),
  organization_members: schema(["organizationId", "userId", "role", "status", "createdAt"], {
    organizationId: objectId,
    userId: objectId,
    role: { enum: ["owner", "admin", "member"] },
    status: { enum: ["active", "inactive", "invited"] },
    createdAt: date,
    updatedAt: date,
  }),
  organization_invitations: schema(
    [
      "organizationId",
      "email",
      "role",
      "tokenHash",
      "invitedBy",
      "expiresAt",
      "createdAt",
      "status",
    ],
    {
      organizationId: objectId,
      email: { bsonType: "string", maxLength: 254 },
      role: { enum: ["admin", "member"] },
      tokenHash: string,
      invitedBy: objectId,
      expiresAt: date,
      createdAt: date,
      status: { enum: ["pending", "accepted", "revoked"] },
      acceptedAt: date,
      acceptedBy: objectId,
    },
  ),
  conversations: schema(["organizationId", "memberIds", "type", "createdAt", "updatedAt"], {
    organizationId: objectId,
    memberIds: { bsonType: "array", minItems: 2, maxItems: 100, items: objectId },
    type: { enum: ["direct", "group"] },
    directKey: string,
    name: { bsonType: "string", maxLength: 80 },
    createdBy: objectId,
    adminIds: { bsonType: "array", items: objectId },
    createdAt: date,
    updatedAt: date,
  }),
  messages: schema(["conversationId", "senderId", "text", "createdAt"], {
    conversationId: objectId,
    senderId: objectId,
    text: { bsonType: "string", minLength: 1, maxLength: 10_000 },
    clientMessageId: { bsonType: ["string", "null"], maxLength: 128 },
    createdAt: date,
  }),
  conversation_reads: schema(["conversationId", "userId"], {
    conversationId: objectId,
    userId: objectId,
    readAt: date,
    deliveredAt: date,
  }),
  sessions: schema(["token", "userId", "expiresAt", "createdAt"], {
    token: { bsonType: "string", minLength: 32, maxLength: 256 },
    userId: string,
    expiresAt: date,
    createdAt: date,
  }),
  password_resets: schema(["userId", "tokenHash", "expiresAt", "createdAt"], {
    userId: objectId,
    tokenHash: string,
    expiresAt: date,
    createdAt: date,
  }),
  rate_limits: {
    bsonType: "object",
    required: ["_id", "count", "expiresAt"],
    properties: {
      _id: { bsonType: ["string", "objectId"] },
      count: { bsonType: ["int", "long", "double"], minimum: 0 },
      expiresAt: date,
    },
  },
};

export const schemaCollectionNames = Object.keys(collectionSchemas);
