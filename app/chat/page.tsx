"use client";

import { FormEvent, useEffect, useState } from "react";
import styles from "../page.module.css";
import Snackbar from "@/components/Snackbar";
import AppLoader from "@/components/AppLoader";
import Brand from "@/components/Brand";

type User = { id?: string; _id?: string; email?: string; name?: string; role?: string };
type Conversation = { _id: string; memberIds: string[] };
type Message = { _id: string; text: string; senderId: string };

function userLabel(user: User) {
  return user.name?.trim() || user.email?.trim() || "User";
}

function userInitial(user: User) {
  return userLabel(user)[0].toUpperCase();
}

export default function ChatPage() {
  const [user, setUser] = useState<User | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [conversation, setConversation] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [text, setText] = useState("");
  const [error, setError] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    Promise.all([fetch("/api/users/me"), fetch("/api/chat/users")])
      .then(async ([meResponse, usersResponse]) => {
        if (!meResponse.ok) throw new Error("Not logged in");
        const me = await meResponse.json();
        const people = await usersResponse.json();
        setUser(me.user);
        setUsers(people.users.filter((person: User) => person._id !== me.user.id));
      })
      .catch(() => {
        window.location.href = "/login";
      });
  }, []);

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
    setConversation(data.conversation);
    const messagesResponse = await fetch(`/api/conversations/${data.conversation._id}/messages`);
    const messagesData = await messagesResponse.json();
    setMessages(messagesData.messages ?? []);
    setError("");
  }

  async function sendMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!conversation || !text.trim()) return;
    const response = await fetch(`/api/conversations/${conversation._id}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    });
    const data = await response.json();
    if (!response.ok) {
      setError(data.error);
      return;
    }
    setMessages((current) => [...current, data.message]);
    setText("");
  }

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.href = "/login";
  }
  if (!user)
    return (
      <main className={styles.page}>
        <AppLoader label="Opening your workspace" />
      </main>
    );
  const activeUser = users.find(
    (person) => person._id && conversation?.memberIds.includes(person._id),
  );

  return (
    <main className={styles.page}>
      <nav className={styles.nav}>
        <Brand />
        <div className={styles.profileMenu}>
          <button
            className={styles.avatarButton}
            onClick={() => setMenuOpen(!menuOpen)}
            aria-label="Open profile menu"
          >
            <span className={styles.avatar}>{userInitial(user)}</span>
          </button>
          {menuOpen && (
            <div className={styles.popover}>
              <strong>{userLabel(user)}</strong>
              <small>{user.email || "No email available"}</small>
              <a href="/profile">Profile</a>
              {(user.role === "owner" || user.role === "admin") && <a href="/settings">Settings</a>}
              <button onClick={logout}>Sign out</button>
            </div>
          )}
        </div>
      </nav>
      <section className={styles.chatShell}>
        <aside className={styles.peoplePanel}>
          <div className={styles.panelTitle}>
            <div>
              <p className={styles.eyebrow}>Workspace</p>
              <h1>Messages</h1>
            </div>
            <span className={styles.memberCount}>{users.length}</span>
          </div>
          <p className={styles.panelHint}>Your organization</p>
          {users.length === 0 && <p className={styles.status}>No other members yet.</p>}
          {users.map((person) => (
            <button
              className={`${styles.personButton} ${activeUser?._id === person._id ? styles.personActive : ""}`}
              key={person._id}
              onClick={() => openConversation(person)}
            >
              <span className={styles.avatar}>{userInitial(person)}</span>
              <span>
                <strong>{userLabel(person)}</strong>
                <small>{person.name && person.email ? person.email : "Available to chat"}</small>
              </span>
            </button>
          ))}
        </aside>
        <section className={styles.conversationPanel}>
          {activeUser ? (
            <>
              <header className={styles.conversationHeader}>
                <span className={styles.avatar}>{userInitial(activeUser)}</span>
                <div>
                  <h2>{userLabel(activeUser)}</h2>
                  <p>{activeUser.email || "No email available"}</p>
                </div>
              </header>
              <div className={styles.messageList}>
                {messages.map((message) => (
                  <p
                    className={
                      message.senderId === user.id ? styles.messageMine : styles.messageTheirs
                    }
                    key={message._id}
                  >
                    {message.text}
                  </p>
                ))}
              </div>
              <form className={styles.messageForm} onSubmit={sendMessage}>
                <input
                  value={text}
                  onChange={(event) => setText(event.target.value)}
                  placeholder="Write a message..."
                />
                <button className={styles.button} type="submit">
                  Send
                </button>
              </form>
            </>
          ) : (
            <div className={styles.chatEmpty}>
              <span>✦</span>
              <h2>Select someone to start chatting</h2>
              <p>Messages are currently saved through HTTP. Real-time sockets come next.</p>
            </div>
          )}
        </section>
      </section>
      {error && <Snackbar message={error} tone="error" onClose={() => setError("")} />}
    </main>
  );
}
