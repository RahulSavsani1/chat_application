import { createHmac, timingSafeEqual } from "node:crypto";
import { createServer } from "node:http";
import { ObjectId } from "mongodb";
import { Server } from "socket.io";

const port = Number(process.env.PORT || process.env.WS_PORT || 8080);
const onlineUsers = new Map();
const presenceTimers = new Map();
const configuredOrigins = [process.env.APP_ORIGIN, process.env.SOCKET_ALLOWED_ORIGINS]
  .filter(Boolean)
  .flatMap((value) => value.split(","))
  .map((value) => {
    try {
      return new URL(value.trim()).origin;
    } catch {
      return "";
    }
  })
  .filter(Boolean);
const signingKey =
  process.env.SOCKET_INTERNAL_SECRET ||
  (process.env.NODE_ENV === "production" ? undefined : process.env.MONGO_URL);
if (!signingKey) {
  throw new Error("Set SOCKET_INTERNAL_SECRET before starting the production Socket.IO server.");
}
const internalToken = createHmac("sha256", signingKey)
  .update("relay-socket-broadcast-v1")
  .digest("hex");

const httpServer = createServer(async (request, response) => {
  const internalPath = request.url;
  if (internalPath === "/healthz") {
    const origin = request.headers.origin;
    if (origin && configuredOrigins.includes(origin)) {
      response.setHeader("Access-Control-Allow-Origin", origin);
      response.setHeader("Vary", "Origin");
    } else if (origin) {
      response.writeHead(403).end();
      return;
    }
    if (request.method === "OPTIONS") {
      response.writeHead(204, { "Access-Control-Allow-Methods": "GET, OPTIONS" }).end();
      return;
    }
    if (request.method !== "GET") {
      response.writeHead(405).end();
      return;
    }
    response
      .writeHead(200, { "Content-Type": "application/json", "Cache-Control": "no-store" })
      .end(JSON.stringify({ ok: true }));
    return;
  }
  if (
    !["/internal/broadcast", "/internal/read", "/internal/membership-change"].includes(internalPath)
  )
    return;
  if (request.method !== "POST") {
    response.writeHead(405).end();
    return;
  }
  const suppliedToken = (request.headers.authorization || "").replace(/^Bearer\s+/i, "");
  const expected = Buffer.from(internalToken);
  const supplied = Buffer.from(suppliedToken);
  if (expected.length !== supplied.length || !timingSafeEqual(expected, supplied)) {
    response.writeHead(401).end();
    return;
  }
  try {
    let raw = "";
    for await (const chunk of request) {
      raw += chunk;
      if (raw.length > 16_384) {
        response.writeHead(413).end();
        return;
      }
    }
    const message = JSON.parse(raw);
    if (internalPath === "/internal/read") {
      if (!ObjectId.isValid(message.conversationId) || typeof message.userId !== "string") {
        response.writeHead(400).end();
        return;
      }
      io.to(`conversation:${message.conversationId}`).emit("chat:read", message);
      response.writeHead(202).end();
      return;
    }
    if (internalPath === "/internal/membership-change") {
      if (
        !ObjectId.isValid(message.conversationId) ||
        !ObjectId.isValid(message.organizationId) ||
        !Array.isArray(message.memberIds) ||
        message.memberIds.some((id) => !ObjectId.isValid(id))
      ) {
        response.writeHead(400).end();
        return;
      }
      const room = `conversation:${message.conversationId}`;
      const roomSockets = await io.in(room).fetchSockets();
      for (const roomSocket of roomSockets) {
        try {
          await callAppApi(roomSocket.data.ticket, "join", {
            conversationId: message.conversationId,
          });
        } catch {
          await roomSocket.leave(room);
        }
      }
      for (const userId of message.memberIds) {
        const memberSocketIds = await io.in(`user:${userId}`).fetchSockets();
        for (const memberSocket of memberSocketIds) await memberSocket.join(room);
      }
      io.to(`organization:${message.organizationId}`).emit("conversation:updated", {
        conversationId: message.conversationId,
      });
      response.writeHead(202).end();
      return;
    }
    if (
      !ObjectId.isValid(message.conversationId) ||
      !ObjectId.isValid(message._id) ||
      !ObjectId.isValid(message.organizationId) ||
      typeof message.text !== "string"
    ) {
      response.writeHead(400).end();
      return;
    }
    const room = `conversation:${message.conversationId}`;
    const roomSockets = await io.in(room).fetchSockets();
    const recipients = roomSockets.filter(
      (socket) => socket.data.ticket?.userId !== message.senderId,
    ).length;
    io.to(room).emit("chat:message", message);
    io.to(room).emit("conversation:activity", message);
    response
      .writeHead(202, { "Content-Type": "application/json" })
      .end(JSON.stringify({ ok: true, recipients }));
  } catch (error) {
    console.error("Internal Socket.IO broadcast failed:", error);
    response.writeHead(400).end();
  }
});
const io = new Server(httpServer, {
  cors: {
    origin(origin, callback) {
      let allowed = !origin;
      if (origin && configuredOrigins.length) allowed = configuredOrigins.includes(origin);
      else if (origin && process.env.NODE_ENV !== "production") {
        try {
          allowed = ["localhost", "127.0.0.1", "[::1]"].includes(new URL(origin).hostname);
        } catch {
          allowed = false;
        }
      }
      callback(allowed ? null : new Error("Socket.IO origin is not allowed."), allowed);
    },
  },
});

function verifyTicket(value) {
  if (typeof value !== "string") return null;
  const [payload, signature, extra] = value.split(".");
  if (!payload || !signature || extra) return null;
  const expected = createHmac("sha256", signingKey).update(payload).digest();
  const supplied = Buffer.from(signature, "base64url");
  if (expected.length !== supplied.length || !timingSafeEqual(expected, supplied)) return null;
  try {
    const ticket = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    const origin = new URL(ticket.appOrigin);
    if (
      !["http:", "https:"].includes(origin.protocol) ||
      origin.origin !== ticket.appOrigin ||
      typeof ticket.userId !== "string" ||
      typeof ticket.organizationId !== "string" ||
      typeof ticket.expiresAt !== "number" ||
      ticket.expiresAt <= Date.now()
    )
      return null;
    if (configuredOrigins.length && !configuredOrigins.includes(origin.origin)) return null;
    if (!configuredOrigins.length && process.env.NODE_ENV === "production") return null;
    if (!configuredOrigins.length && !["localhost", "127.0.0.1", "[::1]"].includes(origin.hostname))
      return null;
    return ticket;
  } catch {
    return null;
  }
}

async function callAppApi(ticket, action, data) {
  const response = await fetch(`${ticket.appOrigin}/api/internal/socket`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...data, ticket: ticket.raw, action }),
    signal: AbortSignal.timeout(12_000),
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || `Application API returned ${response.status}.`);
  return result;
}

io.use(async (socket, next) => {
  try {
    const rawTicket = socket.handshake.auth?.ticket;
    const ticket = verifyTicket(rawTicket);
    if (!ticket) return next(new Error("Socket ticket is invalid or expired."));
    const requestOrigin = socket.handshake.headers.origin;
    if (requestOrigin && requestOrigin !== ticket.appOrigin) {
      return next(new Error("Socket ticket origin does not match this connection."));
    }
    socket.data.ticket = { ...ticket, raw: rawTicket };
    next();
  } catch (error) {
    console.error("Socket.IO ticket verification failed:", error);
    next(new Error("Could not verify chat connection."));
  }
});

io.on("connection", (socket) => {
  const { userId, organizationId } = socket.data.ticket;
  const userRoom = `user:${userId}`;
  const organizationRoom = `organization:${organizationId}`;
  const presenceKey = `${organizationId}:${userId}`;
  const reconnecting = presenceTimers.has(presenceKey);
  const pendingOffline = presenceTimers.get(presenceKey);
  if (pendingOffline) clearTimeout(pendingOffline);
  presenceTimers.delete(presenceKey);
  socket.join(userRoom);
  socket.join(organizationRoom);
  const currentCount = onlineUsers.get(presenceKey) || 0;
  onlineUsers.set(presenceKey, currentCount + 1);
  const onlineInOrganization = [...onlineUsers.keys()]
    .filter((key) => key.startsWith(`${organizationId}:`))
    .map((key) => key.slice(organizationId.length + 1));
  socket.emit("presence:snapshot", onlineInOrganization);
  if (currentCount === 0 && !reconnecting) {
    io.to(organizationRoom).emit("presence:update", { userId, online: true });
  }

  socket.on("conversation:join", async ({ conversationId } = {}, acknowledge = () => {}) => {
    try {
      await callAppApi(socket.data.ticket, "join", { conversationId });
      await socket.join(`conversation:${conversationId}`);
      acknowledge({ ok: true });
    } catch (error) {
      acknowledge({ ok: false, error: error.message || "Could not join conversation." });
    }
  });

  socket.on("conversation:leave", ({ conversationId } = {}) => {
    if (typeof conversationId === "string") socket.leave(`conversation:${conversationId}`);
  });

  socket.on("chat:send", async (payload = {}, acknowledge = () => {}) => {
    try {
      const result = await callAppApi(socket.data.ticket, "send", payload);
      const savedMessage = result.message;
      if (result.created) {
        io.to(`conversation:${savedMessage.conversationId}`).emit("chat:message", savedMessage);
        io.to(`conversation:${savedMessage.conversationId}`).emit(
          "conversation:activity",
          savedMessage,
        );
      }
      acknowledge({ ok: true, message: savedMessage });
    } catch (error) {
      console.error("Socket.IO message forwarding failed:", error);
      acknowledge({ ok: false, error: error.message || "Message could not be saved." });
    }
  });

  socket.on("conversation:read", async ({ conversationId } = {}) => {
    try {
      const result = await callAppApi(socket.data.ticket, "read", { conversationId });
      io.to(`conversation:${conversationId}`).emit("chat:read", {
        conversationId,
        userId,
        readAt: result.readAt,
      });
    } catch {}
  });

  socket.on("chat:delivered", async ({ conversationId, messageId } = {}) => {
    if (typeof conversationId !== "string" || !socket.rooms.has(`conversation:${conversationId}`))
      return;
    try {
      const result = await callAppApi(socket.data.ticket, "delivered", {
        conversationId,
        messageId,
      });
      io.to(`user:${result.senderId}`).emit("chat:delivery", {
        conversationId: result.conversationId,
        userId: result.userId,
        deliveredAt: result.deliveredAt,
      });
    } catch {}
  });

  socket.on("chat:typing", ({ conversationId, isTyping } = {}) => {
    if (
      typeof conversationId !== "string" ||
      typeof isTyping !== "boolean" ||
      !socket.rooms.has(`conversation:${conversationId}`)
    )
      return;
    socket.to(`conversation:${conversationId}`).emit("chat:typing", {
      conversationId,
      userId,
      isTyping,
    });
  });

  socket.on("disconnecting", () => {
    for (const room of socket.rooms) {
      if (!room.startsWith("conversation:")) continue;
      socket.to(room).emit("chat:typing", {
        conversationId: room.slice("conversation:".length),
        userId,
        isTyping: false,
      });
    }
  });

  socket.on("disconnect", () => {
    const remaining = (onlineUsers.get(presenceKey) || 1) - 1;
    if (remaining > 0) onlineUsers.set(presenceKey, remaining);
    else {
      onlineUsers.set(presenceKey, 0);
      const offlineTimer = setTimeout(() => {
        if (onlineUsers.get(presenceKey) === 0) {
          onlineUsers.delete(presenceKey);
          io.to(organizationRoom).emit("presence:update", { userId, online: false });
        }
        presenceTimers.delete(presenceKey);
      }, 600);
      presenceTimers.set(presenceKey, offlineTimer);
    }
  });
});

httpServer.listen(port, "0.0.0.0", () => {
  console.log(`Socket.IO chat server listening on port ${port}`);
});
