import { cookies } from "next/headers";
import { ObjectId } from "mongodb";
import { NextResponse } from "next/server";
import { ensureDatabaseIndexes, mongoClientPromise } from "@/lib/mongodb";
import { createSession } from "@/lib/session";
import { acceptInvitation } from "@/lib/invitations";

type GoogleTokenResponse = { access_token?: string };
type GoogleUser = {
  sub: string;
  email: string;
  email_verified?: boolean;
  name?: string;
  picture?: string;
};

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const returnedState = url.searchParams.get("state");
  const cookieStore = await cookies();
  const savedState = cookieStore.get("google_oauth_state")?.value;
  const inviteToken = cookieStore.get("google_oauth_invite")?.value;
  const redirectToChat = () => NextResponse.redirect(new URL("/chat", request.url));

  if (!code || !returnedState || returnedState !== savedState) {
    return NextResponse.json({ error: "Google login state was invalid." }, { status: 400 });
  }

  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const redirectUri = process.env.GOOGLE_REDIRECT_URI;

  if (!clientId || !clientSecret || !redirectUri) {
    return NextResponse.json({ error: "Google OAuth is not fully configured." }, { status: 500 });
  }

  const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    }),
  });

  if (!tokenResponse.ok) {
    return NextResponse.json({ error: "Could not exchange the Google code." }, { status: 400 });
  }

  const tokenData = (await tokenResponse.json()) as GoogleTokenResponse;
  if (!tokenData.access_token) {
    return NextResponse.json({ error: "Google did not return an access token." }, { status: 400 });
  }

  const userResponse = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
    headers: { Authorization: `Bearer ${tokenData.access_token}` },
  });
  if (!userResponse.ok) {
    return NextResponse.json({ error: "Could not read the Google profile." }, { status: 400 });
  }

  const googleUser = (await userResponse.json()) as GoogleUser;
  if (!googleUser.email || googleUser.email_verified !== true) {
    return NextResponse.json(
      { error: "Google did not verify this email address." },
      { status: 400 },
    );
  }
  const client = await mongoClientPromise;
  await ensureDatabaseIndexes();
  const users = client.db("chat_application").collection("users");
  const database = client.db("chat_application");
  let user = await users.findOne({ googleId: googleUser.sub });
  if (!user) user = await users.findOne({ email: googleUser.email.toLowerCase() });

  if (!user) {
    const result = await users.insertOne({
      email: googleUser.email.toLowerCase(),
      name: googleUser.name ?? "Google user",
      picture: googleUser.picture,
      googleId: googleUser.sub,
      emailVerified: true,
      createdAt: new Date(),
    });
    user = { _id: new ObjectId(result.insertedId), email: googleUser.email.toLowerCase() };
  } else if (user.googleId && user.googleId !== googleUser.sub) {
    return NextResponse.json(
      { error: "This Google account is linked to another user." },
      { status: 409 },
    );
  } else if (!user.googleId) {
    await users.updateOne(
      { _id: user._id },
      {
        $set: {
          googleId: googleUser.sub,
          emailVerified: true,
          name: googleUser.name,
          picture: googleUser.picture,
        },
      },
    );
  }

  if (inviteToken) await acceptInvitation(database, inviteToken, user._id, user.email);
  await createSession(user._id.toString());
  cookieStore.delete("google_oauth_state");
  cookieStore.delete("google_oauth_invite");
  return redirectToChat();
}
