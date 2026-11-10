"use client";

import { FormEvent, useEffect, useState } from "react";
import Snackbar, { SnackbarTone } from "@/components/Snackbar";
import styles from "@/app/page.module.css";

export default function ResetPasswordForm() {
  const [token, setToken] = useState("");
  const [password, setPassword] = useState("");
  const [hasResetLink, setHasResetLink] = useState(false);
  const [message, setMessage] = useState("");
  const [tone, setTone] = useState<SnackbarTone>("info");
  useEffect(() => {
    const resetLinkToken = new URLSearchParams(window.location.search).get("token") ?? "";
    setToken(resetLinkToken);
    setHasResetLink(Boolean(resetLinkToken));
  }, []);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const response = await fetch("/api/auth/reset-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, password }),
    });
    const data = await response.json();
    setTone(response.ok ? "success" : "error");
    setMessage(data.message ?? data.error);
    if (response.ok) setPassword("");
  }
  return (
    <>
      <form className={styles.signupForm} onSubmit={submit}>
        {!hasResetLink && (
          <input
            type="text"
            value={token}
            onChange={(event) => setToken(event.target.value.replace(/\D/g, "").slice(0, 8))}
            placeholder="8-digit reset OTP"
            aria-label="Password reset OTP"
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="[0-9]{8}"
            minLength={8}
            maxLength={8}
            required
          />
        )}
        <input
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          placeholder="New password (8+ characters)"
          minLength={8}
          required
        />
        <button className={styles.button} type="submit">
          Reset password
        </button>
      </form>
      {message && <Snackbar message={message} tone={tone} onClose={() => setMessage("")} />}
    </>
  );
}
