import { MongoServerError, ObjectId } from "mongodb";
import { hasPermission } from "@/lib/authorization";
import { getChatUser } from "@/lib/chat-auth";
import { publishMembershipChange } from "@/lib/realtime";

export async function GET() {
  const context = await getChatUser();
  if (!context) return Response.json({ error: "You are not logged in." }, { status: 401 });
  const conversationsWithUnread = await context.database
    .collection("conversations")
    .aggregate([
      { $match: { organizationId: context.organizationId, memberIds: context.user._id } },
      { $sort: { updatedAt: -1 } },
      {
        $lookup: {
          from: "conversation_reads",
          let: { conversationId: "$_id" },
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [
                    { $eq: ["$conversationId", "$$conversationId"] },
                    { $eq: ["$userId", context.user._id] },
                  ],
                },
              },
            },
            { $project: { readAt: 1 } },
            { $limit: 1 },
          ],
          as: "readState",
        },
      },
      {
        $set: {
          readAt: { $ifNull: [{ $arrayElemAt: ["$readState.readAt", 0] }, new Date(0)] },
        },
      },
      {
        $lookup: {
          from: "messages",
          let: { conversationId: "$_id" },
          pipeline: [
            { $match: { $expr: { $eq: ["$conversationId", "$$conversationId"] } } },
            { $sort: { createdAt: -1, _id: -1 } },
            { $limit: 1 },
          ],
          as: "lastMessageResult",
        },
      },
      {
        $lookup: {
          from: "messages",
          let: { conversationId: "$_id", readAt: "$readAt" },
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [
                    { $eq: ["$conversationId", "$$conversationId"] },
                    { $ne: ["$senderId", context.user._id] },
                    { $gt: ["$createdAt", "$$readAt"] },
                  ],
                },
              },
            },
            { $count: "count" },
          ],
          as: "unreadResult",
        },
      },
      {
        $set: {
          lastMessage: { $ifNull: [{ $arrayElemAt: ["$lastMessageResult", 0] }, null] },
          unreadCount: { $ifNull: [{ $arrayElemAt: ["$unreadResult.count", 0] }, 0] },
        },
      },
      { $project: { readState: 0, readAt: 0, lastMessageResult: 0, unreadResult: 0 } },
    ])
    .toArray();
  return Response.json({ conversations: conversationsWithUnread });
}

export async function POST(request: Request) {
  const context = await getChatUser();
  if (!context) return Response.json({ error: "You are not logged in." }, { status: 401 });
  if (!hasPermission(context, "conversation.create"))
    return Response.json({ error: "You cannot create conversations." }, { status: 403 });
  let body: { userId?: string; type?: string; name?: string; userIds?: string[] };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Request body must be valid JSON." }, { status: 400 });
  }
  if (!body || typeof body !== "object" || Array.isArray(body))
    return Response.json({ error: "Request body must be a JSON object." }, { status: 400 });
  if (body.type === "group") {
    const name = typeof body.name === "string" ? body.name.trim() : "";
    const requestedIds = Array.isArray(body.userIds) ? [...new Set(body.userIds)] : [];
    if (name.length < 1 || name.length > 80)
      return Response.json(
        { error: "Group name must contain 1 to 80 characters." },
        { status: 400 },
      );
    if (
      requestedIds.length < 1 ||
      requestedIds.some((id) => typeof id !== "string" || !ObjectId.isValid(id))
    )
      return Response.json(
        { error: "Select at least one other member for the group." },
        { status: 400 },
      );
    const memberIds = requestedIds.map((id) => new ObjectId(id));
    if (memberIds.some((id) => id.equals(context.user._id)))
      return Response.json({ error: "You are added to the group automatically." }, { status: 400 });
    const activeMembers = await context.database.collection("organization_members").countDocuments({
      organizationId: context.organizationId,
      userId: { $in: memberIds },
      status: "active",
    });
    if (activeMembers !== memberIds.length)
      return Response.json(
        { error: "Every group member must belong to your organization." },
        { status: 403 },
      );
    const allMemberIds = [context.user._id, ...memberIds];
    const result = await context.database.collection("conversations").insertOne({
      organizationId: context.organizationId,
      memberIds: allMemberIds,
      type: "group",
      name,
      createdBy: context.user._id,
      adminIds: [context.user._id],
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    await publishMembershipChange({
      conversationId: result.insertedId.toString(),
      organizationId: context.organizationId.toString(),
      memberIds: allMemberIds.map((id) => id.toString()),
    });
    return Response.json(
      {
        conversation: {
          _id: result.insertedId,
          memberIds: allMemberIds,
          type: "group",
          name,
          createdBy: context.user._id,
          adminIds: [context.user._id],
        },
      },
      { status: 201 },
    );
  }
  if (typeof body.userId !== "string" || !ObjectId.isValid(body.userId))
    return Response.json({ error: "A valid user is required." }, { status: 400 });
  const otherMembership = await context.database.collection("organization_members").findOne({
    organizationId: context.organizationId,
    userId: new ObjectId(body.userId),
    status: "active",
  });
  const otherUser = otherMembership
    ? await context.database.collection("users").findOne({ _id: otherMembership.userId })
    : null;
  if (!otherUser)
    return Response.json({ error: "That user is not in your organization." }, { status: 403 });
  const memberIds = [context.user._id, otherUser._id];
  const directKey = memberIds
    .map((id) => id.toString())
    .sort()
    .join(":");
  const existing = await context.database.collection("conversations").findOne({
    organizationId: context.organizationId,
    directKey,
    type: "direct",
  });
  const legacyConversation = existing
    ? null
    : await context.database.collection("conversations").findOne({
        organizationId: context.organizationId,
        memberIds: { $all: memberIds },
        type: "direct",
      });
  if (existing) return Response.json({ conversation: existing });
  if (legacyConversation) {
    try {
      await context.database
        .collection("conversations")
        .updateOne({ _id: legacyConversation._id }, { $set: { directKey } });
    } catch (error) {
      if (!(error instanceof MongoServerError && error.code === 11000)) throw error;
    }
    const canonicalConversation = await context.database.collection("conversations").findOne({
      organizationId: context.organizationId,
      directKey,
      type: "direct",
    });
    return Response.json({ conversation: canonicalConversation ?? legacyConversation });
  }
  try {
    const result = await context.database.collection("conversations").insertOne({
      organizationId: context.organizationId,
      memberIds,
      directKey,
      type: "direct",
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    return Response.json({ conversation: { _id: result.insertedId, memberIds } }, { status: 201 });
  } catch (error) {
    if (error instanceof MongoServerError && error.code === 11000) {
      const concurrentConversation = await context.database
        .collection("conversations")
        .findOne({ organizationId: context.organizationId, directKey, type: "direct" });
      if (concurrentConversation) return Response.json({ conversation: concurrentConversation });
    }
    throw error;
  }
}
