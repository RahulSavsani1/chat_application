"use client";

import { FormEvent, useState } from "react";
import Snackbar, { SnackbarTone } from "@/components/Snackbar";
import styles from "@/app/page.module.css";

export default function ForgotPasswordForm() {
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [resetUrl, setResetUrl] = useState("");
  const [tone, setTone] = useState<SnackbarTone>("info");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const response = await fetch("/api/auth/forgot-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    });
    const data = await response.json();
    setTone("info");
    setMessage(data.message);
    if (data.resetUrl) setResetUrl(data.resetUrl);
  }
  return (
    <>
      <form className={styles.signupForm} onSubmit={submit}>
        <input
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          placeholder="Email address"
          required
        />
        <button className={styles.button} type="submit">
          Send reset link
        </button>
      </form>
      {resetUrl && (
        <a className={styles.devResetLink} href={resetUrl}>
          Open development reset link
        </a>
      )}
      {message && <Snackbar message={message} tone={tone} onClose={() => setMessage("")} />}
    </>
  );
}
