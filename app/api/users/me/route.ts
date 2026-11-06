import { getAuthorizationContext, hasPermission } from "@/lib/authorization";

export async function GET() {
  try {
    const context = await getAuthorizationContext();
    if (!context) return Response.json({ error: "You are not logged in." }, { status: 401 });
    return Response.json({
      user: {
        id: context.user._id.toString(),
        email: context.user.email,
        name: context.user.name ?? "",
        picture: context.user.picture ?? "",
        role: context.role,
        organizationId: context.organizationId.toString(),
      },
    });
  } catch {
    return Response.json({ error: "Could not load your profile." }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  let body: { name?: unknown; picture?: unknown };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Request body must be valid JSON." }, { status: 400 });
  }
  const name = typeof body.name === "string" ? body.name.trim() : "";
  const picture = typeof body.picture === "string" ? body.picture.trim() : "";
  if (name.length < 2 || name.length > 60)
    return Response.json({ error: "Name must be between 2 and 60 characters." }, { status: 400 });
  if (picture && !picture.startsWith("https://"))
    return Response.json({ error: "Profile picture must use an HTTPS URL." }, { status: 400 });
  try {
    const context = await getAuthorizationContext();
    if (!context) return Response.json({ error: "You are not logged in." }, { status: 401 });
    if (!hasPermission(context, "profile.update"))
      return Response.json({ error: "You cannot update this profile." }, { status: 403 });
    await context.database
      .collection("users")
      .updateOne({ _id: context.user._id }, { $set: { name, picture, updatedAt: new Date() } });
    return Response.json({ message: "Profile updated." });
  } catch {
    return Response.json({ error: "Could not update your profile." }, { status: 500 });
  }
}
