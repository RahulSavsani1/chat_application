"use client";

import { FormEvent, useEffect, useState } from "react";
import Snackbar, { SnackbarTone } from "@/components/Snackbar";
import styles from "../page.module.css";
import AppLoader from "@/components/AppLoader";

export default function ProfilePage() {
  const [user, setUser] = useState<{ name: string; picture: string } | null>(null);
  const [name, setName] = useState("");
  const [picture, setPicture] = useState("");
  const [notice, setNotice] = useState("");
  const [tone, setTone] = useState<SnackbarTone>("info");
  useEffect(() => {
    fetch("/api/users/me")
      .then((response) => {
        if (!response.ok) throw new Error();
        return response.json();
      })
      .then((data) => {
        setUser(data.user);
        setName(data.user.name);
        setPicture(data.user.picture);
      })
      .catch(() => {
        window.location.href = "/login";
      });
  }, []);
  async function saveProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const response = await fetch("/api/users/me", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, picture }),
    });
    const data = await response.json();
    setTone(response.ok ? "success" : "error");
    setNotice(data.message ?? data.error);
    if (response.ok) setUser({ name, picture });
  }
  if (!user)
    return (
      <main className={styles.page}>
        <AppLoader label="Loading profile" />
      </main>
    );
  return (
    <main className={styles.page}>
      <nav className={styles.nav}>
        <a className={styles.brand} href="/">
          Chat<span>App</span>
        </a>
        <a className={styles.navLink} href="/chat">
          Back to chat
        </a>
      </nav>
      <section className={styles.profileCard}>
        <p className={styles.eyebrow}>Personal profile</p>
        <div className={styles.profileIntro}>
          <span className={styles.profileAvatar}>{(name || "U")[0].toUpperCase()}</span>
          <div>
            <h1>Your profile</h1>
            <p>Update the information people see when they chat with you.</p>
          </div>
        </div>
        <form className={styles.signupForm} onSubmit={saveProfile}>
          <label>
            Name
            <input value={name} onChange={(event) => setName(event.target.value)} required />
          </label>
          <label>
            Profile picture URL
            <input
              value={picture}
              onChange={(event) => setPicture(event.target.value)}
              placeholder="https://..."
            />
          </label>
          <button className={styles.button} type="submit">
            Save changes
          </button>
        </form>
      </section>
      {notice && <Snackbar message={notice} tone={tone} onClose={() => setNotice("")} />}
    </main>
  );
}
