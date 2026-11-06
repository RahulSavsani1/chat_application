import { ObjectId } from "mongodb";
import { getAuthorizationContext, hasPermission } from "@/lib/authorization";

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const context = await getAuthorizationContext();
  if (!context) return Response.json({ error: "You are not logged in." }, { status: 401 });
  if (!hasPermission(context, "member.invite"))
    return Response.json({ error: "You cannot delete invitations." }, { status: 403 });
  const { id } = await params;
  if (!ObjectId.isValid(id))
    return Response.json({ error: "Invalid invitation." }, { status: 400 });
  const result = await context.database.collection("organization_invitations").deleteOne({
    _id: new ObjectId(id),
    organizationId: context.organizationId,
    status: "pending",
  });
  if (!result.deletedCount)
    return Response.json({ error: "Pending invitation not found." }, { status: 404 });
  return Response.json({ message: "Invitation deleted." });
}
