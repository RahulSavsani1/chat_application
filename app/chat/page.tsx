"use client";

import { FormEvent, Fragment, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { io, Socket } from "socket.io-client";
import styles from "../page.module.css";
import { messageDateLabel, messageDayKey } from "@/lib/chat-dates";
import Snackbar from "@/components/Snackbar";
import AppLoader from "@/components/AppLoader";
import Brand from "@/components/Brand";

type User = { id?: string; _id?: string; email?: string; name?: string; role?: string };
type Conversation = {
  _id: string;
  memberIds: string[];
  type?: "direct" | "group";
  name?: string;
  createdBy?: string;
  adminIds?: string[];
  unreadCount?: number;
  lastMessage?: Message | null;
};
type Message = { _id: string; text: string; senderId: string; createdAt?: string };
type MessagePage = { messages: Message[]; hasMore: boolean };
type ReadReceipt = { userId: string; readAt?: string; deliveredAt?: string };
type ChatFilter = "all" | "unread" | "groups";

function mergeReadReceipts(current: ReadReceipt[], incoming: ReadReceipt[]) {
  const receipts = new Map(current.map((receipt) => [receipt.userId, receipt]));
  for (const receipt of incoming) {
    const previous = receipts.get(receipt.userId);
    const newest = (left?: string, right?: string) => {
      if (!left) return right;
      if (!right) return left;
      return Date.parse(left) >= Date.parse(right) ? left : right;
    };
    receipts.set(receipt.userId, {
      userId: receipt.userId,
      readAt: newest(previous?.readAt, receipt.readAt),
      deliveredAt: newest(previous?.deliveredAt, receipt.deliveredAt),
    });
  }
  return [...receipts.values()];
}

function userLabel(user: User) {
  return user.name?.trim() || user.email?.trim() || "User";
}

function userInitial(user: User) {
  return userLabel(user)[0].toUpperCase();
}

function shortTime(value?: string) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const now = new Date();
  return date.toDateString() === now.toDateString()
    ? date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })
    : date.toLocaleDateString([], { month: "short", day: "numeric" });
}

function messageTime(value?: string) {
  if (!value) return "";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? ""
    : date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

export default function ChatPage() {
  const [user, setUser] = useState<User | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [conversation, setConversation] = useState<Conversation | null>(null);
  const [chatFilter, setChatFilter] = useState<ChatFilter>("all");
  const [chatSearch, setChatSearch] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [hasOlderMessages, setHasOlderMessages] = useState(false);
  const [loadingOlderMessages, setLoadingOlderMessages] = useState(false);
  const [text, setText] = useState("");
  const [error, setError] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);
  const [groupName, setGroupName] = useState("");
  const [groupMemberIds, setGroupMemberIds] = useState<string[]>([]);
  const [readReceipts, setReadReceipts] = useState<ReadReceipt[]>([]);
  const [onlineUserIds, setOnlineUserIds] = useState<string[]>([]);
  const [typingUserIds, setTypingUserIds] = useState<string[]>([]);
  const [socketConnected, setSocketConnected] = useState(false);
  const [socketServerReachable, setSocketServerReachable] = useState(false);
  const socketRef = useRef<Socket | null>(null);
  const currentConversationRef = useRef<Conversation | null>(null);
  const joinedConversationIdRef = useRef<string | null>(null);
  const messageListRef = useRef<HTMLDivElement | null>(null);
  const readMarkTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const profileMenuButtonRef = useRef<HTMLButtonElement | null>(null);
  const profilePopoverRef = useRef<HTMLDivElement | null>(null);
  const groupMenuRef = useRef<HTMLDetailsElement | null>(null);
  const directChatMenuRef = useRef<HTMLDetailsElement | null>(null);
  const groupManagementRef = useRef<HTMLDetailsElement | null>(null);
  const scrollToBottomOnMessageChange = useRef(false);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const conversationLoadRequestRef = useRef(0);
  useEffect(() => {
    currentConversationRef.current = conversation;
  }, [conversation]);
  useLayoutEffect(() => {
    if (!scrollToBottomOnMessageChange.current) return;
    const messageList = messageListRef.current;
    if (!messageList) return;
    messageList.scrollTop = messageList.scrollHeight;
    scrollToBottomOnMessageChange.current = false;
  }, [messages, conversation?._id]);

  useEffect(
    () => () => {
      if (readMarkTimerRef.current) clearTimeout(readMarkTimerRef.current);
    },
    [],
  );

  useEffect(() => {
    const closeOutside = (event: PointerEvent) => {
      if (!(event.target instanceof Node)) return;
      const target = event.target;
      if (
        menuOpen &&
        !profileMenuButtonRef.current?.contains(target) &&
        !profilePopoverRef.current?.contains(target)
      ) {
        setMenuOpen(false);
      }
      for (const menu of [
        groupMenuRef.current,
        directChatMenuRef.current,
        groupManagementRef.current,
      ]) {
        if (menu?.open && !menu.contains(target)) menu.open = false;
      }
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setMenuOpen(false);
      for (const menu of [
        groupMenuRef.current,
        directChatMenuRef.current,
        groupManagementRef.current,
      ]) {
        if (menu) menu.open = false;
      }
    };
    document.addEventListener("pointerdown", closeOutside);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOutside);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [menuOpen]);

  async function loadConversation(nextConversation: Conversation, updateUrl = true) {
    const requestId = ++conversationLoadRequestRef.current;
    const shouldMarkRead = document.visibilityState === "visible" && document.hasFocus();
    setMessages([]);
    setReadReceipts([]);
    setTypingUserIds([]);
    setHasOlderMessages(false);
    setConversation(nextConversation);
    if (updateUrl) {
      window.history.replaceState(
        null,
        "",
        `/chat?conversation=${encodeURIComponent(nextConversation._id)}`,
      );
    }
    const response = await fetch(`/api/conversations/${nextConversation._id}/messages`, {
      cache: "no-store",
    });
    const data = await response.json();
    if (requestId !== conversationLoadRequestRef.current) return;
    if (!response.ok) {
      setError(data.error || "Could not load this conversation.");
      return;
    }
    scrollToBottomOnMessageChange.current = true;
    setMessages(data.messages ?? []);
    setReadReceipts((current) => mergeReadReceipts(current, data.readReceipts ?? []));
    setHasOlderMessages(Boolean(data.hasMore));
    setConversations((current) =>
      current.map((item) =>
        item._id === nextConversation._id
          ? {
              ...item,
              unreadCount: shouldMarkRead ? 0 : item.unreadCount,
              lastMessage: data.messages?.[data.messages.length - 1] ?? item.lastMessage,
            }
          : item,
      ),
    );
    if (shouldMarkRead) {
      const socket = socketRef.current;
      if (socket?.connected) {
        socket.emit("conversation:read", { conversationId: nextConversation._id });
      } else {
        fetch(`/api/conversations/${nextConversation._id}/read`, { method: "POST" }).catch(
          () => {},
        );
      }
    }
    setError("");
  }

  async function loadOlderMessages() {
    const firstMessage = messages[0];
    if (!conversation || !firstMessage || !hasOlderMessages || loadingOlderMessages) return;
    const list = messageListRef.current;
    const oldScrollHeight = list?.scrollHeight ?? 0;
    setLoadingOlderMessages(true);
    try {
      const response = await fetch(
        `/api/conversations/${conversation._id}/messages?before=${encodeURIComponent(firstMessage._id)}`,
        { cache: "no-store" },
      );
      const data = (await response.json()) as MessagePage & { error?: string };
      if (!response.ok) throw new Error(data.error || "Could not load older messages.");
      setMessages((current) => {
        const currentIds = new Set(current.map((message) => message._id));
        return [...data.messages.filter((message) => !currentIds.has(message._id)), ...current];
      });
      setHasOlderMessages(data.hasMore);
      requestAnimationFrame(() => {
        if (list) list.scrollTop += list.scrollHeight - oldScrollHeight;
      });
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Could not load older messages.");
    } finally {
      setLoadingOlderMessages(false);
    }
  }

  useEffect(() => {
    Promise.all([
      fetch("/api/users/me"),
      fetch("/api/chat/users"),
      fetch("/api/conversations", { cache: "no-store" }),
    ])
      .then(async ([meResponse, usersResponse, conversationsResponse]) => {
        if (!meResponse.ok) throw new Error("Not logged in");
        const me = await meResponse.json();
        const people = await usersResponse.json();
        const conversationData = await conversationsResponse.json();
        if (!conversationsResponse.ok) throw new Error("Could not load conversations");
        const availableUsers = people.users.filter((person: User) => person._id !== me.user.id);
        setConversations(conversationData.conversations ?? []);
        setUser(me.user);
        setUsers(availableUsers);
        const conversationId = new URLSearchParams(window.location.search).get("conversation");
        const savedConversation = conversationData.conversations?.find(
          (item: Conversation) => item._id === conversationId,
        );
        if (savedConversation) await loadConversation(savedConversation, false);
      })
      .catch(() => {
        window.location.href = "/login";
      });
  }, []);

  useEffect(() => {
    if (!user) return;
    setSocketConnected(false);
    setSocketServerReachable(false);
    const configuredUrl = process.env.NEXT_PUBLIC_WS_URL;
    const socketUrl =
      configuredUrl || `${window.location.protocol}//${window.location.hostname}:8080`;
    let active = true;
    let socket: Socket | null = null;
    let authRetryTimer: ReturnType<typeof setTimeout> | null = null;
    const scheduleRead = (id: string) => {
      if (readMarkTimerRef.current) clearTimeout(readMarkTimerRef.current);
      readMarkTimerRef.current = setTimeout(() => {
        if (socket?.connected) {
          socket.emit("conversation:read", { conversationId: id });
        } else {
          fetch(`/api/conversations/${id}/read`, { method: "POST" }).catch(() => {});
        }
        readMarkTimerRef.current = null;
      }, 250);
    };
    socket = io(socketUrl, {
      autoConnect: false,
      reconnection: true,
      auth: (callback) => {
        fetch("/api/auth/socket-ticket", { cache: "no-store" })
          .then(async (response) => {
            const data = await response.json();
            if (!response.ok || !data.ticket)
              throw new Error(data.error || "Could not authenticate chat.");
            if (!active) return callback({ ticket: "" });
            callback({ ticket: data.ticket });
          })
          .catch((ticketError) => {
            if (active)
              setError(
                ticketError instanceof Error ? ticketError.message : "Could not authenticate chat.",
              );
            callback({ ticket: "" });
          });
      },
    });
    socketRef.current = socket;
    const checkSocketHealth = async () => {
      if (!active || socket?.connected) return;
      try {
        const response = await fetch(`${socketUrl.replace(/\/+$/, "")}/healthz`, {
          cache: "no-store",
          signal: AbortSignal.timeout(5000),
        });
        if (!response.ok) throw new Error("Socket server is not ready.");
        const health = await response.json();
        setSocketServerReachable(health.ok === true);
      } catch {
        if (active) setSocketServerReachable(false);
      }
    };
    let healthPoll: ReturnType<typeof setInterval> | null = null;
    const startHealthPoll = () => {
      if (healthPoll) return;
      void checkSocketHealth();
      healthPoll = setInterval(() => void checkSocketHealth(), 10_000);
    };
    const stopHealthPoll = () => {
      if (!healthPoll) return;
      clearInterval(healthPoll);
      healthPoll = null;
    };
    startHealthPoll();
    socket.on("connect", () => {
      stopHealthPoll();
      setSocketConnected(true);
      setSocketServerReachable(true);
      setError("");
    });
    socket.on("connect_error", (error) => {
      startHealthPoll();
      setSocketConnected(false);
      // Socket.IO does not automatically retry when namespace middleware rejects a connection.
      if (!socket?.active && active && !authRetryTimer) {
        authRetryTimer = setTimeout(() => {
          authRetryTimer = null;
          if (active) socket?.connect();
        }, 2000);
      }
    });
    socket.on("disconnect", () => {
      startHealthPoll();
      setSocketConnected(false);
      joinedConversationIdRef.current = null;
      setTypingUserIds([]);
    });
    socket.on("presence:snapshot", (userIds: string[]) => setOnlineUserIds(userIds));
    socket.on("presence:update", ({ userId, online }: { userId: string; online: boolean }) => {
      setOnlineUserIds((current) =>
        online
          ? current.includes(userId)
            ? current
            : [...current, userId]
          : current.filter((id) => id !== userId),
      );
    });
    socket.on(
      "chat:typing",
      ({
        conversationId,
        userId,
        isTyping,
      }: {
        conversationId: string;
        userId: string;
        isTyping: boolean;
      }) => {
        if (currentConversationRef.current?._id !== conversationId) return;
        setTypingUserIds((current) =>
          isTyping
            ? current.includes(userId)
              ? current
              : [...current, userId]
            : current.filter((id) => id !== userId),
        );
      },
    );
    socket.on("chat:read", (receipt: ReadReceipt & { conversationId: string }) => {
      if (currentConversationRef.current?._id !== receipt.conversationId) return;
      setReadReceipts((current) => mergeReadReceipts(current, [receipt]));
    });
    socket.on("chat:delivery", (receipt: ReadReceipt & { conversationId: string }) => {
      if (currentConversationRef.current?._id !== receipt.conversationId) return;
      setReadReceipts((current) => mergeReadReceipts(current, [receipt]));
    });
    socket.on("conversation:activity", (message: Message & { conversationId: string }) => {
      setConversations((current) =>
        current.map((item) => {
          if (item._id !== message.conversationId) return item;
          const isActiveAndFocused =
            currentConversationRef.current?._id === message.conversationId &&
            document.visibilityState === "visible" &&
            document.hasFocus();
          const isOwnMessage = message.senderId === user?.id;
          return {
            ...item,
            lastMessage: message,
            unreadCount: isOwnMessage || isActiveAndFocused ? 0 : (item.unreadCount ?? 0) + 1,
          };
        }),
      );
    });
    socket.on("conversation:updated", async () => {
      try {
        const response = await fetch("/api/conversations", { cache: "no-store" });
        const data = await response.json();
        if (!response.ok) return;
        const updatedConversations = data.conversations ?? [];
        setConversations(updatedConversations);
        const currentConversationId = currentConversationRef.current?._id;
        const currentConversation = currentConversationId
          ? updatedConversations.find((item: Conversation) => item._id === currentConversationId)
          : null;
        if (currentConversation) setConversation(currentConversation);
        else if (currentConversationId) {
          setConversation(null);
          setMessages([]);
          window.history.replaceState(null, "", "/chat");
        }
      } catch {}
    });
    socket.on("chat:message", (message: Message & { conversationId: string }) => {
      if (currentConversationRef.current?._id !== message.conversationId) return;
      scrollToBottomOnMessageChange.current = true;
      setMessages((current) =>
        current.some((item) => item._id === message._id) ? current : [...current, message],
      );
      const isReadingNow = document.visibilityState === "visible" && document.hasFocus();
      if (message.senderId !== user?.id) {
        if (isReadingNow) {
          scheduleRead(message.conversationId);
        } else if (socket?.connected) {
          socket.emit("chat:delivered", {
            conversationId: message.conversationId,
            messageId: message._id,
          });
        } else {
          fetch(`/api/conversations/${message.conversationId}/delivered`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ messageId: message._id }),
          }).catch(() => {});
        }
      }
    });

    const markReadWhenFocused = () => {
      const activeConversationId = currentConversationRef.current?._id;
      if (activeConversationId && document.visibilityState === "visible" && document.hasFocus()) {
        scheduleRead(activeConversationId);
      }
    };
    document.addEventListener("visibilitychange", markReadWhenFocused);
    window.addEventListener("focus", markReadWhenFocused);

    socket.connect();

    return () => {
      active = false;
      if (authRetryTimer) clearTimeout(authRetryTimer);
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
      document.removeEventListener("visibilitychange", markReadWhenFocused);
      window.removeEventListener("focus", markReadWhenFocused);
      if (readMarkTimerRef.current) {
        clearTimeout(readMarkTimerRef.current);
        readMarkTimerRef.current = null;
      }
      stopHealthPoll();
      socket?.disconnect();
      joinedConversationIdRef.current = null;
      socketRef.current = null;
    };
  }, [user?.id]);

  useEffect(() => {
    const socket = socketRef.current;
    const conversationId = conversation?._id ?? null;
    if (!socketConnected || !socket?.connected) return;

    const previousConversationId = joinedConversationIdRef.current;
    if (previousConversationId && previousConversationId !== conversationId) {
      socket.emit("conversation:leave", { conversationId: previousConversationId });
    }
    joinedConversationIdRef.current = conversationId;
    if (!conversationId) return;

    const requestId = conversationLoadRequestRef.current;
    socket.emit(
      "conversation:join",
      { conversationId },
      (result: { ok: boolean; error?: string }) => {
        if (currentConversationRef.current?._id !== conversationId) return;
        if (!result.ok) {
          setError(result.error || "Could not open this conversation.");
          return;
        }
        setError("");
        fetch(`/api/conversations/${conversationId}/messages`, { cache: "no-store" })
          .then((response) => response.json())
          .then((data) => {
            if (
              !Array.isArray(data.messages) ||
              currentConversationRef.current?._id !== conversationId ||
              conversationLoadRequestRef.current !== requestId
            )
              return;
            scrollToBottomOnMessageChange.current = true;
            setReadReceipts((current) => mergeReadReceipts(current, data.readReceipts ?? []));
            setMessages((current) => {
              const byId = new Map(current.map((message) => [message._id, message]));
              for (const message of data.messages as Message[]) byId.set(message._id, message);
              return [...byId.values()];
            });
          })
          .catch(() => {});
        if (document.visibilityState === "visible" && document.hasFocus()) {
          socket.emit("conversation:read", { conversationId });
        }
      },
    );

    return () => {
      if (joinedConversationIdRef.current === conversationId) {
        socket.emit("conversation:leave", { conversationId });
        joinedConversationIdRef.current = null;
      }
    };
  }, [conversation?._id, socketConnected]);

  async function openConversation(otherUser: User) {
    if (!otherUser._id) return;
    const otherUserId = otherUser._id;
    const response = await fetch("/api/conversations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId: otherUserId }),
    });
    const data = await response.json();
    if (!response.ok) {
      setError(data.error);
      return;
    }
    setConversations((current) => {
      const existing = current.find((item) => item._id === data.conversation._id);
      return [
        { ...existing, ...data.conversation },
        ...current.filter((item) => item._id !== data.conversation._id),
      ];
    });
    await loadConversation(data.conversation);
  }

  async function createGroup(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const response = await fetch("/api/conversations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "group", name: groupName, userIds: groupMemberIds }),
    });
    const data = await response.json();
    if (!response.ok) {
      setError(data.error || "Could not create this group.");
      return;
    }
    setGroupName("");
    setGroupMemberIds([]);
    if (groupMenuRef.current) groupMenuRef.current.open = false;
    setConversations((current) => [data.conversation, ...current]);
    await loadConversation(data.conversation);
  }

  async function changeGroupMember(userId: string, method: "POST" | "DELETE") {
    if (!conversation) return;
    const response = await fetch(`/api/conversations/${conversation._id}/members`, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId }),
    });
    const data = await response.json();
    if (!response.ok) {
      setError(data.error || "Could not update group members.");
      return;
    }
    setConversation(data.conversation);
    setConversations((current) =>
      current.map((item) => (item._id === conversation._id ? data.conversation : item)),
    );
  }

  function updateTyping(value: string) {
    setText(value);
    const socket = socketRef.current;
    if (!conversation || !socket?.connected) return;
    socket.emit("chat:typing", { conversationId: conversation._id, isTyping: true });
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = setTimeout(() => {
      socket.emit("chat:typing", { conversationId: conversation._id, isTyping: false });
      typingTimeoutRef.current = null;
    }, 1400);
  }

  function stopTyping() {
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = null;
    if (conversation && socketRef.current?.connected) {
      socketRef.current.emit("chat:typing", { conversationId: conversation._id, isTyping: false });
    }
  }

  async function sendMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!conversation || !socketRef.current?.connected || !text.trim()) return;
    const clientMessageId = crypto.randomUUID();
    if (socketRef.current?.connected) {
      socketRef.current.emit(
        "chat:send",
        { conversationId: conversation._id, text, clientMessageId },
        (result: { ok: boolean; error?: string; message?: Message }) => {
          if (!result.ok) setError(result.error || "Message could not be sent.");
          else {
            setText("");
            if (result.message) {
              scrollToBottomOnMessageChange.current = true;
              setConversations((current) =>
                current.map((item) =>
                  item._id === conversation._id
                    ? { ...item, lastMessage: result.message, unreadCount: 0 }
                    : item,
                ),
              );
              setMessages((current) =>
                current.some((item) => item._id === result.message?._id)
                  ? current
                  : [...current, result.message!],
              );
            }
          }
        },
      );
      return;
    }
    const response = await fetch(`/api/conversations/${conversation._id}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, clientMessageId }),
    });
    const data = await response.json();
    if (!response.ok) {
      setError(data.error);
      return;
    }
    scrollToBottomOnMessageChange.current = true;
    setConversations((current) =>
      current.map((item) =>
        item._id === conversation._id
          ? { ...item, lastMessage: data.message, unreadCount: 0 }
          : item,
      ),
    );
    setMessages((current) =>
      current.some((item) => item._id === data.message._id) ? current : [...current, data.message],
    );
    setText("");
  }

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.href = "/login";
  }
  function returnToChats() {
    conversationLoadRequestRef.current += 1;
    setConversation(null);
    setMessages([]);
    window.history.replaceState(null, "", "/chat");
  }
  if (!user)
    return (
      <main className={`${styles.page} ${styles.chatPage}`}>
        <AppLoader label="Opening your workspace" />
      </main>
    );
  const currentUserId = user.id;
  const activeUser = users.find(
    (person) =>
      person._id && person._id !== user.id && conversation?.memberIds.includes(person._id),
  );
  const isGroupConversation = conversation?.type === "group";
  const activeTitle = isGroupConversation
    ? conversation.name || "Group chat"
    : userLabel(activeUser ?? {});
  const activeTypingNames = typingUserIds
    .map((userId) => users.find((person) => person._id === userId))
    .filter((person): person is User => Boolean(person))
    .map(userLabel);
  function getMessageStatus(message: Message) {
    if (message.senderId !== currentUserId || !message.createdAt || !conversation) return null;
    const sentAt = Date.parse(message.createdAt);
    const recipients = conversation.memberIds.filter((memberId) => memberId !== currentUserId);
    if (recipients.length === 0) return "sent";
    const statusFor = (memberId: string) => {
      const receipt = readReceipts.find((item) => item.userId === memberId);
      const read = receipt?.readAt ? Date.parse(receipt.readAt) >= sentAt : false;
      const delivered = receipt?.deliveredAt ? Date.parse(receipt.deliveredAt) >= sentAt : false;
      return read ? "read" : delivered ? "delivered" : "sent";
    };
    const recipientStatuses = recipients.map(statusFor);
    if (recipientStatuses.every((status) => status === "read")) return "read";
    if (recipientStatuses.every((status) => status === "read" || status === "delivered"))
      return "delivered";
    return "sent";
  }
  const currentUserIsGroupAdmin = Boolean(conversation?.adminIds?.includes(currentUserId ?? ""));
  function conversationTitle(item: Conversation) {
    if (item.type === "group") return item.name || "Group chat";
    const peer = users.find(
      (person) => person._id && person._id !== currentUserId && item.memberIds.includes(person._id),
    );
    return peer ? userLabel(peer) : "Direct chat";
  }
  const visibleConversations = conversations.filter((item) => {
    if (chatFilter === "unread" && !item.unreadCount) return false;
    if (chatFilter === "groups" && item.type !== "group") return false;
    const searchText = `${conversationTitle(item)} ${item.lastMessage?.text || ""}`.toLowerCase();
    return searchText.includes(chatSearch.trim().toLowerCase());
  });

  return (
    <main className={`${styles.page} ${styles.chatPage}`}>
      <nav className={styles.nav}>
        <Brand />
        <div className={styles.profileMenu}>
          <button
            className={styles.avatarButton}
            ref={profileMenuButtonRef}
            onClick={() => setMenuOpen(!menuOpen)}
            aria-label="Open profile menu"
            aria-expanded={menuOpen}
          >
            <span className={styles.avatar}>{userInitial(user)}</span>
          </button>
        </div>
        {menuOpen &&
          createPortal(
            <div className={styles.popover} ref={profilePopoverRef}>
              <strong>{userLabel(user)}</strong>
              <small>{user.email || "No email available"}</small>
              <a href="/profile">Profile</a>
              {(user.role === "owner" || user.role === "admin") && <a href="/settings">Settings</a>}
              <button onClick={logout}>Sign out</button>
            </div>,
            document.body,
          )}
      </nav>
      <section className={`${styles.chatShell} ${conversation ? styles.hasConversation : ""}`}>
        <aside className={styles.chatSidebar}>
          <div className={styles.chatSidebarHeader}>
            <div>
              <p className={styles.eyebrow}>Workspace</p>
              <h1>Chats</h1>
            </div>
            <div className={styles.sidebarActions}>
              <details className={styles.createMenu} ref={groupMenuRef}>
                <summary
                  title="Create a group"
                  onClick={() => {
                    if (directChatMenuRef.current) directChatMenuRef.current.open = false;
                  }}
                >
                  ＋ Group
                </summary>
                <form className={styles.groupCreateForm} onSubmit={createGroup}>
                  <strong>Start a group</strong>
                  <input
                    aria-label="Group name"
                    placeholder="Group name"
                    maxLength={80}
                    value={groupName}
                    onChange={(event) => setGroupName(event.target.value)}
                    required
                  />
                  <div className={styles.groupMemberChoices}>
                    {users.map((person) => (
                      <label key={person._id}>
                        <input
                          type="checkbox"
                          checked={Boolean(person._id && groupMemberIds.includes(person._id))}
                          onChange={(event) => {
                            if (!person._id) return;
                            setGroupMemberIds((current) =>
                              event.target.checked
                                ? [...current, person._id!]
                                : current.filter((id) => id !== person._id),
                            );
                          }}
                        />
                        {userLabel(person)}
                      </label>
                    ))}
                  </div>
                  <button
                    className={styles.button}
                    type="submit"
                    disabled={groupMemberIds.length < 1}
                  >
                    Create group
                  </button>
                </form>
              </details>
              <details className={styles.createMenu} ref={directChatMenuRef}>
                <summary
                  title="Start a direct chat"
                  onClick={() => {
                    if (groupMenuRef.current) groupMenuRef.current.open = false;
                  }}
                >
                  ＋ Chat
                </summary>
                <div className={styles.contactsMenu}>
                  <strong>Start a direct chat</strong>
                  {users.map((person) => (
                    <button
                      key={person._id}
                      type="button"
                      onClick={() => {
                        if (directChatMenuRef.current) directChatMenuRef.current.open = false;
                        openConversation(person);
                      }}
                    >
                      <span
                        className={styles.onlineDot}
                        data-online={Boolean(person._id && onlineUserIds.includes(person._id))}
                      />
                      {userLabel(person)}
                    </button>
                  ))}
                </div>
              </details>
            </div>
          </div>
          <label className={styles.chatSearch}>
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <circle cx="10.8" cy="10.8" r="6.8" />
              <path d="m16 16 4.2 4.2" />
            </svg>
            <input
              value={chatSearch}
              onChange={(event) => setChatSearch(event.target.value)}
              placeholder="Search chats or messages"
              aria-label="Search chats or messages"
            />
          </label>
          <div className={styles.chatFilters} role="tablist" aria-label="Conversation filters">
            {(["all", "unread", "groups"] as ChatFilter[]).map((filter) => (
              <button
                key={filter}
                className={chatFilter === filter ? styles.chatFilterActive : ""}
                onClick={() => setChatFilter(filter)}
                role="tab"
                aria-selected={chatFilter === filter}
              >
                {filter === "all" ? "All" : filter === "unread" ? "Unread" : "Groups"}
              </button>
            ))}
          </div>
          <div className={styles.conversationList}>
            {visibleConversations.map((item) => {
              const peer = users.find(
                (person) =>
                  person._id && person._id !== user.id && item.memberIds.includes(person._id),
              );
              const title = conversationTitle(item);
              const preview = item.lastMessage
                ? `${item.lastMessage.senderId === user.id ? "You: " : ""}${item.lastMessage.text}`
                : item.type === "group"
                  ? `${item.memberIds.length} members`
                  : "Start the conversation";
              const isOnline = Boolean(peer?._id && onlineUserIds.includes(peer._id));
              return (
                <button
                  className={`${styles.conversationRow} ${conversation?._id === item._id ? styles.conversationRowActive : ""}`}
                  key={item._id}
                  onClick={() => loadConversation(item)}
                >
                  <span className={styles.conversationAvatar}>
                    {userInitial(item.type === "group" ? { name: title } : (peer ?? {}))}
                    {item.type !== "group" && (
                      <i className={styles.onlineDot} data-online={isOnline} />
                    )}
                  </span>
                  <span className={styles.conversationRowContent}>
                    <span className={styles.conversationRowTop}>
                      <strong>{title}</strong>
                      <time>{shortTime(item.lastMessage?.createdAt)}</time>
                    </span>
                    <span className={styles.conversationRowBottom}>
                      <small>{preview}</small>
                      {!!item.unreadCount && (
                        <b className={styles.unreadPill}>{item.unreadCount}</b>
                      )}
                    </span>
                  </span>
                </button>
              );
            })}
            {visibleConversations.length === 0 && (
              <div className={styles.sidebarEmpty}>
                <strong>
                  {chatSearch
                    ? "No matching chats"
                    : chatFilter === "unread"
                      ? "All caught up"
                      : "No chats yet"}
                </strong>
                <span>
                  {chatSearch
                    ? "Try another name or message."
                    : "Start a chat or create a group to begin."}
                </span>
              </div>
            )}
          </div>
        </aside>
        <section className={styles.conversationPanel}>
          {activeUser || isGroupConversation ? (
            <>
              <header className={styles.conversationHeader}>
                <button
                  className={styles.mobileBackButton}
                  type="button"
                  onClick={returnToChats}
                  aria-label="Back to chats"
                >
                  ←
                </button>
                <span className={styles.avatar}>
                  {userInitial(isGroupConversation ? { name: activeTitle } : activeUser!)}
                </span>
                <div className={styles.conversationIdentity}>
                  <h2>{activeTitle}</h2>
                  <p className={styles.presenceLine}>
                    {isGroupConversation ? (
                      `${conversation?.memberIds.length} members`
                    ) : (
                      <>
                        <i
                          className={styles.onlineDot}
                          data-online={Boolean(
                            activeUser?._id && onlineUserIds.includes(activeUser._id),
                          )}
                        />
                        {activeUser?._id && onlineUserIds.includes(activeUser._id)
                          ? "Online"
                          : "Offline"}
                      </>
                    )}
                  </p>
                  {activeTypingNames.length > 0 && (
                    <small className={styles.typingStatus}>
                      {activeTypingNames.join(", ")} typing…
                    </small>
                  )}
                  {isGroupConversation && (
                    <details className={styles.groupManagement} ref={groupManagementRef}>
                      <summary>
                        <svg viewBox="0 0 16 16" aria-hidden="true">
                          <circle cx="6" cy="5" r="2" />
                          <circle cx="11.5" cy="6" r="1.5" />
                          <path d="M2.5 13c.1-2.1 1.4-3.5 3.5-3.5S9.4 10.9 9.5 13M9.4 10c.5-.7 1.2-1 2.1-1 1.2 0 2 .7 2.1 2" />
                        </svg>
                        <span>Group details</span>
                        <b>{conversation?.memberIds.length}</b>
                      </summary>
                      <div className={styles.groupManagePanel}>
                        <div className={styles.groupManageHeading}>
                          <div>
                            <strong>{conversation?.name || "Group chat"}</strong>
                            <small>
                              {currentUserIsGroupAdmin
                                ? "Manage members in this conversation"
                                : "People in this conversation"}
                            </small>
                          </div>
                          <span>{conversation?.memberIds.length} members</span>
                        </div>
                        <div className={styles.groupMemberChoices}>
                          {conversation?.memberIds.map((memberId) => {
                            const member = users.find((person) => person._id === memberId);
                            return (
                              <div className={styles.groupMemberRow} key={memberId}>
                                <span className={styles.groupMemberAvatar}>
                                  {userInitial(memberId === user.id ? user : (member ?? {}))}
                                </span>
                                <span className={styles.groupMemberInfo}>
                                  <strong>
                                    {memberId === user.id
                                      ? userLabel(user)
                                      : member
                                        ? userLabel(member)
                                        : "Member"}
                                  </strong>
                                  <small>
                                    {memberId === user.id ? "You" : member?.email || "Group member"}
                                  </small>
                                </span>
                                {memberId === user.id ? (
                                  <span className={styles.groupMemberTag}>You</span>
                                ) : null}
                                {memberId !== user.id && (
                                  <>
                                    {conversation?.adminIds?.includes(memberId) && (
                                      <span className={styles.groupMemberTag}>Admin</span>
                                    )}
                                    {currentUserIsGroupAdmin && (
                                      <button
                                        className={styles.groupRemoveButton}
                                        type="button"
                                        aria-label={`Remove ${member ? userLabel(member) : "member"} from group`}
                                        onClick={() => changeGroupMember(memberId, "DELETE")}
                                      >
                                        Remove
                                      </button>
                                    )}
                                  </>
                                )}
                              </div>
                            );
                          })}
                        </div>
                        {currentUserIsGroupAdmin &&
                          users.some(
                            (person) => person._id && !conversation?.memberIds.includes(person._id),
                          ) && (
                            <div className={styles.groupAddSection}>
                              <strong>Add people</strong>
                              <div className={styles.groupAddList}>
                                {users
                                  .filter(
                                    (person) =>
                                      person._id && !conversation?.memberIds.includes(person._id),
                                  )
                                  .map((person) => (
                                    <button
                                      key={person._id}
                                      type="button"
                                      onClick={() => changeGroupMember(person._id!, "POST")}
                                    >
                                      <span>+</span>
                                      {userLabel(person)}
                                    </button>
                                  ))}
                              </div>
                            </div>
                          )}
                      </div>
                    </details>
                  )}
                </div>
              </header>
              <div className={styles.messageList} ref={messageListRef}>
                {hasOlderMessages && (
                  <button
                    className={`${styles.buttonSecondary} ${styles.loadOlderMessages}`}
                    type="button"
                    onClick={loadOlderMessages}
                    disabled={loadingOlderMessages}
                  >
                    {loadingOlderMessages ? "Loading…" : "Load earlier messages"}
                  </button>
                )}
                {messages.map((message, index) => {
                  const status = getMessageStatus(message);
                  const isMine = message.senderId === user.id;
                  const sender = users.find((person) => person._id === message.senderId);
                  const dayKey = messageDayKey(message.createdAt);
                  const previousMessage = messages[index - 1];
                  const nextMessage = messages[index + 1];
                  const sameAsPrevious = Boolean(
                    previousMessage &&
                    previousMessage.senderId === message.senderId &&
                    dayKey &&
                    messageDayKey(previousMessage.createdAt) === dayKey,
                  );
                  const sameAsNext = Boolean(
                    nextMessage &&
                    nextMessage.senderId === message.senderId &&
                    dayKey &&
                    messageDayKey(nextMessage.createdAt) === dayKey,
                  );
                  const showDateDivider = Boolean(
                    dayKey &&
                    (!previousMessage || messageDayKey(previousMessage.createdAt) !== dayKey),
                  );
                  return (
                    <Fragment key={message._id}>
                      {showDateDivider && (
                        <div className={styles.dateDivider}>
                          <span>{messageDateLabel(message.createdAt)}</span>
                        </div>
                      )}
                      <div
                        className={`${isMine ? styles.messageMine : styles.messageTheirs} ${sameAsPrevious ? styles.messageGroupedPrevious : ""} ${sameAsNext ? styles.messageGroupedNext : ""}`}
                      >
                        {isGroupConversation && !isMine && (
                          <small className={styles.groupSenderName}>
                            {sender ? userLabel(sender) : "Member"}
                          </small>
                        )}
                        <span className={styles.messageText}>{message.text}</span>
                        <span className={styles.messageMeta}>
                          <time>{messageTime(message.createdAt)}</time>
                          {status && (
                            <span
                              className={`${styles.messageStatus} ${status === "read" ? styles.messageStatusRead : ""}`}
                              aria-label={
                                status === "read"
                                  ? "Seen"
                                  : status === "delivered"
                                    ? "Delivered"
                                    : "Sent"
                              }
                              title={
                                status === "read"
                                  ? "Seen"
                                  : status === "delivered"
                                    ? "Delivered"
                                    : "Sent"
                              }
                            >
                              {status === "sent" ? "\u2713" : "\u2713\u2713"}
                            </span>
                          )}
                        </span>
                      </div>
                    </Fragment>
                  );
                })}
              </div>
              <form className={styles.messageForm} onSubmit={sendMessage}>
                <textarea
                  rows={1}
                  maxLength={10_000}
                  value={text}
                  onChange={(event) => updateTyping(event.target.value)}
                  onBlur={stopTyping}
                  placeholder="Write a message..."
                  aria-label="Write a message"
                  disabled={!socketConnected}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && !event.shiftKey) {
                      event.preventDefault();
                      event.currentTarget.form?.requestSubmit();
                    }
                  }}
                />
                <button
                  className={styles.sendButton}
                  type="submit"
                  aria-label="Send message"
                  disabled={!socketConnected}
                >
                  ↑
                </button>
              </form>
            </>
          ) : (
            <div className={styles.chatEmpty}>
              <span>✦</span>
              <h2>Select someone to start chatting</h2>
              <p>Your conversations and messages will appear here.</p>
            </div>
          )}
        </section>
      </section>
      {error ? (
        <Snackbar message={error} tone="error" onClose={() => setError("")} />
      ) : !socketConnected ? (
        <Snackbar
          message={
            socketServerReachable
              ? "Socket server is awake. Securing your chat connection…"
              : "Waiting for socket connection. A sleeping Render service can take about a minute to wake."
          }
          tone={socketServerReachable ? "info" : "warning"}
          autoCloseMs={null}
          onClose={() => {}}
        />
      ) : null}
    </main>
  );
}
