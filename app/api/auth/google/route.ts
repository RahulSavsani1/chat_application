import { randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const inviteToken = new URL(request.url).searchParams.get("invite")?.trim();
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const redirectUri = process.env.GOOGLE_REDIRECT_URI;

  if (!clientId || !redirectUri) {
    return NextResponse.json(
      { error: "Google OAuth is not configured. Add GOOGLE_CLIENT_ID and GOOGLE_REDIRECT_URI." },
      { status: 500 },
    );
  }

  const state = randomBytes(24).toString("hex");
  const cookieStore = await cookies();
  cookieStore.set("google_oauth_state", state, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 600,
  });
  if (inviteToken) {
    cookieStore.set("google_oauth_invite", inviteToken, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 600,
    });
  } else {
    cookieStore.delete("google_oauth_invite");
  }

  const googleUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  googleUrl.searchParams.set("client_id", clientId);
  googleUrl.searchParams.set("redirect_uri", redirectUri);
  googleUrl.searchParams.set("response_type", "code");
  googleUrl.searchParams.set("scope", "openid email profile");
  googleUrl.searchParams.set("state", state);

  return NextResponse.redirect(googleUrl, { headers: { "x-start-url": request.url } });
}
