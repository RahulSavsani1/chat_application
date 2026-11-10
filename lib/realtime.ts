import { createInternalBroadcastToken } from "@/lib/socket-ticket";

export async function publishChatMessage(message: {
  _id: string;
  conversationId: string;
  senderId: string;
  organizationId: string;
  text: string;
  createdAt: Date;
}): Promise<number | null> {
  const port = Number(process.env.WS_PORT || 8080);
  try {
    const response = await fetch(`http://127.0.0.1:${port}/internal/broadcast`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${createInternalBroadcastToken()}`,
      },
      body: JSON.stringify(message),
      signal: AbortSignal.timeout(2500),
      cache: "no-store",
    });
    if (!response.ok) return null;
    const result = (await response.json()) as { recipients?: unknown };
    return typeof result.recipients === "number" ? result.recipients : 0;
  } catch (error) {
    console.error("Could not publish saved message to Socket.IO:", error);
    return null;
  }
}

export async function publishConversationRead(read: {
  conversationId: string;
  userId: string;
  readAt: Date;
}) {
  const port = Number(process.env.WS_PORT || 8080);
  try {
    await fetch(`http://127.0.0.1:${port}/internal/read`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${createInternalBroadcastToken()}`,
      },
      body: JSON.stringify(read),
      signal: AbortSignal.timeout(1000),
      cache: "no-store",
    });
  } catch (error) {
    console.warn(
      "Socket.IO read-state relay timed out or is unavailable; the read receipt remains saved.",
      error instanceof Error ? error.message : error,
    );
  }
}

export async function publishMembershipChange(change: {
  conversationId: string;
  organizationId: string;
  memberIds: string[];
}) {
  const port = Number(process.env.WS_PORT || 8080);
  try {
    await fetch(`http://127.0.0.1:${port}/internal/membership-change`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${createInternalBroadcastToken()}`,
      },
      body: JSON.stringify(change),
      signal: AbortSignal.timeout(2500),
      cache: "no-store",
    });
  } catch (error) {
    console.error("Could not refresh Socket.IO group membership:", error);
  }
}
