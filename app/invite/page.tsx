"use client";

import { useEffect, useState } from "react";
import AppLoader from "@/components/AppLoader";
import styles from "../page.module.css";
import Brand from "@/components/Brand";

type Invitation = { email: string; role: string; organizationName: string };

export default function InvitationPage() {
  const [token, setToken] = useState("");
  const [invitation, setInvitation] = useState<Invitation | null>(null);
  const [currentEmail, setCurrentEmail] = useState("");
  const [accepted, setAccepted] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const value = new URLSearchParams(window.location.search).get("token") ?? "";
    setToken(value);
    if (!value) {
      setError("This invitation link is missing its token.");
      return;
    }
    fetch(`/api/organization/invitations?token=${encodeURIComponent(value)}`)
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error);
        setInvitation(data.invitation);
      })
      .catch((reason: Error) => setError(reason.message));
    fetch("/api/users/me")
      .then((response) => (response.ok ? response.json() : null))
      .then((data) => data?.user?.email && setCurrentEmail(data.user.email));
  }, []);

  async function accept() {
    const response = await fetch("/api/organization/invitations/accept", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token }),
    });
    const data = await response.json();
    if (!response.ok) {
      setError(data.error);
      return;
    }
    setAccepted(true);
    window.location.href = "/chat";
  }

  if (!invitation && !error)
    return (
      <main className={styles.page}>
        <AppLoader label="Checking invitation" />
      </main>
    );

  return (
    <main className={styles.page}>
      <section className={styles.authCard}>
        <Brand />
        {error ? (
          <>
            <h1>Invitation unavailable</h1>
            <p className={styles.description}>{error}</p>
            <a className={styles.buttonSecondary} href="/">
              Back home
            </a>
          </>
        ) : (
          <>
            <p className={styles.eyebrow}>Organization invitation</p>
            <h1>Join {invitation?.organizationName}</h1>
            <p className={styles.description}>
              You were invited as a {invitation?.role}. Use {invitation?.email} to join this
              organization.
            </p>
            <div className={styles.inviteActions}>
              {currentEmail && (
                <button
                  className={styles.button}
                  onClick={accept}
                  disabled={
                    currentEmail.toLowerCase() !== invitation?.email.toLowerCase() || accepted
                  }
                >
                  Accept invitation
                </button>
              )}
              <a className={styles.button} href={`/signup?invite=${encodeURIComponent(token)}`}>
                Create account
              </a>
              <a
                className={`${styles.buttonSecondary} ${styles.loginSecondary}`}
                href={`/api/auth/google?invite=${encodeURIComponent(token)}`}
              >
                Continue with Google
              </a>
              <a className={styles.authLink} href={`/login?invite=${encodeURIComponent(token)}`}>
                Already have an account? Log in
              </a>
            </div>
          </>
        )}
      </section>
    </main>
  );
}
