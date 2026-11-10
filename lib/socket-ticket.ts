import { createHmac, timingSafeEqual } from "node:crypto";

export type SocketTicket = {
  userId: string;
  organizationId: string;
  appOrigin: string;
  expiresAt: number;
};

export function getSocketSigningKey() {
  const key =
    process.env.SOCKET_INTERNAL_SECRET ||
    (process.env.NODE_ENV === "production" ? undefined : process.env.MONGO_URL);
  if (!key) throw new Error("SOCKET_INTERNAL_SECRET is required in production.");
  return key;
}

export function isAllowedSocketOrigin(origin: string) {
  let parsed: URL;
  try {
    parsed = new URL(origin);
  } catch {
    return false;
  }
  if (!["http:", "https:"].includes(parsed.protocol) || parsed.origin !== origin) return false;

  const configuredOrigins = [process.env.APP_ORIGIN, process.env.SOCKET_ALLOWED_ORIGINS]
    .filter(Boolean)
    .flatMap((value) => value!.split(","))
    .map((value) => {
      try {
        return new URL(value.trim()).origin;
      } catch {
        return "";
      }
    })
    .filter(Boolean);
  if (configuredOrigins.length) return configuredOrigins.includes(origin);
  if (process.env.NODE_ENV === "production") return false;
  return ["localhost", "127.0.0.1", "[::1]"].includes(parsed.hostname);
}

export function createInternalBroadcastToken() {
  return createHmac("sha256", getSocketSigningKey())
    .update("relay-socket-broadcast-v1")
    .digest("hex");
}

export function createSocketTicket(ticket: SocketTicket) {
  const payload = Buffer.from(JSON.stringify(ticket)).toString("base64url");
  const signature = createHmac("sha256", getSocketSigningKey()).update(payload).digest("base64url");
  return `${payload}.${signature}`;
}

export function verifySocketTicket(value: unknown): SocketTicket | null {
  if (typeof value !== "string") return null;
  const [payload, signature, extra] = value.split(".");
  if (!payload || !signature || extra) return null;
  const expected = createHmac("sha256", getSocketSigningKey()).update(payload).digest();
  let supplied: Buffer;
  try {
    supplied = Buffer.from(signature, "base64url");
  } catch {
    return null;
  }
  if (expected.length !== supplied.length || !timingSafeEqual(expected, supplied)) return null;
  try {
    const ticket = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as SocketTicket;
    if (
      typeof ticket.userId !== "string" ||
      typeof ticket.organizationId !== "string" ||
      typeof ticket.appOrigin !== "string" ||
      typeof ticket.expiresAt !== "number" ||
      ticket.expiresAt <= Date.now()
    )
      return null;
    return ticket;
  } catch {
    return null;
  }
}
