"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Snackbar, { SnackbarTone } from "@/components/Snackbar";
import styles from "@/app/page.module.css";

export default function ResetPasswordForm() {
  const router = useRouter();
  const [token, setToken] = useState("");
  const [password, setPassword] = useState("");
  const [hasResetLink, setHasResetLink] = useState(false);
  const [isReady, setIsReady] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [message, setMessage] = useState("");
  const [tone, setTone] = useState<SnackbarTone>("info");
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const resetLinkToken = params.get("token") ?? "";
    const temporaryOtp =
      params.get("otp") ?? window.sessionStorage.getItem("relay-password-reset-otp") ?? "";
    window.sessionStorage.removeItem("relay-password-reset-otp");
    setToken(resetLinkToken || temporaryOtp);
    setHasResetLink(Boolean(resetLinkToken));
    setIsReady(true);
  }, []);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);
    try {
      const response = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      });
      const data = await response.json();
      setTone(response.ok ? "success" : "error");
      setMessage(data.message ?? data.error);
      if (response.ok) router.replace("/login?passwordReset=success");
    } catch {
      setTone("error");
      setMessage("Could not reach the server. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  }
  return (
    <>
      {isReady && (
        <p className={styles.description}>
          {hasResetLink ? "Choose a new password." : "Enter your OTP and choose a new password."}
        </p>
      )}
      <form className={styles.signupForm} onSubmit={submit}>
        {isReady && !hasResetLink && (
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
        <button className={styles.button} type="submit" disabled={!isReady || isSubmitting}>
          {isSubmitting ? "Resetting..." : "Reset password"}
        </button>
      </form>
      {message && <Snackbar message={message} tone={tone} onClose={() => setMessage("")} />}
    </>
  );
}
