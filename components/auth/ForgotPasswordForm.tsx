"use client";

import { FormEvent, useState } from "react";
import Snackbar, { SnackbarTone } from "@/components/Snackbar";
import styles from "@/app/page.module.css";

export default function ForgotPasswordForm() {
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [otp, setOtp] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [tone, setTone] = useState<SnackbarTone>("info");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);
    setOtp("");
    try {
      const response = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = await response.json();
      setTone(response.ok ? "info" : "error");
      setMessage(data.message || data.error || "Could not process the request.");
      if (typeof data.otp === "string") setOtp(data.otp);
    } catch {
      setTone("error");
      setMessage("Could not reach the server. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  }
  return (
    <>
      <form className={styles.signupForm} onSubmit={submit}>
        <input
          type="email"
          value={email}
          onChange={(event) => {
            setEmail(event.target.value);
            setOtp("");
          }}
          placeholder="Email address"
          required
        />
        <button className={styles.button} type="submit">
          {isSubmitting ? "Sending..." : "Send reset link"}
        </button>
      </form>
      {otp && (
        <section className={styles.developmentOtp} aria-live="polite">
          <strong>SMTP is not configured</strong>
          <p>For local testing, enter this temporary OTP on the reset password screen.</p>
          <output aria-label="Temporary password reset OTP">{otp}</output>
          <small>This code expires in 10 minutes and works only in development.</small>
          <a className={styles.buttonSecondary} href="/reset-password">
            Continue to reset password
          </a>
        </section>
      )}
      {message && <Snackbar message={message} tone={tone} onClose={() => setMessage("")} />}
    </>
  );
}
