import { getAuthorizationContext, hasPermission } from "@/lib/authorization";

export async function getChatUser() {
  const context = await getAuthorizationContext();
  if (!context || !hasPermission(context, "member.view")) return null;
  return context;
}
