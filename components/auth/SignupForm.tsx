"use client";
import { FormEvent, useEffect, useState } from "react";
import styles from "@/app/page.module.css";
import Snackbar, { SnackbarTone } from "@/components/Snackbar";
export default function SignupForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [tone, setTone] = useState<SnackbarTone>("info");
  const [inviteToken, setInviteToken] = useState("");
  useEffect(() => {
    setInviteToken(new URLSearchParams(window.location.search).get("invite") ?? "");
  }, []);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const response = await fetch("/api/auth/signup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password, inviteToken: inviteToken || undefined }),
    });
    const data = await response.json();
    setMessage(data.message ?? data.error);
    setTone(response.ok ? "success" : "error");
    if (response.ok) {
      setEmail("");
      setPassword("");
      window.location.href = "/login?created=1";
    }
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
        <input
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          placeholder="Password (8+ characters)"
          required
        />
        <button className={styles.button} type="submit">
          Create account
        </button>
        {message && <Snackbar message={message} tone={tone} onClose={() => setMessage("")} />}
      </form>
      <div className={styles.divider}>
        <span>or</span>
      </div>
      <a
        className={`${styles.buttonSecondary} ${styles.loginSecondary}`}
        href={
          inviteToken
            ? `/api/auth/google?invite=${encodeURIComponent(inviteToken)}`
            : "/api/auth/google"
        }
      >
        <svg className={styles.googleIcon} viewBox="0 0 24 24" aria-hidden="true">
          <path
            fill="#4285F4"
            d="M21.35 12.27c0-.79-.07-1.55-.22-2.27H12v4.3h5.24a4.48 4.48 0 0 1-1.94 2.94v2.45h3.14c1.84-1.69 2.91-4.18 2.91-7.42Z"
          />
          <path
            fill="#34A853"
            d="M12 21.75c2.63 0 4.84-.87 6.45-2.36l-3.14-2.45c-.87.58-1.98.92-3.31.92-2.54 0-4.7-1.72-5.47-4.03H3.28v2.53A9.75 9.75 0 0 0 12 21.75Z"
          />
          <path
            fill="#FBBC05"
            d="M6.53 13.83a5.86 5.86 0 0 1 0-3.66V7.64H3.28a9.75 9.75 0 0 0 0 8.72l3.25-2.53Z"
          />
          <path
            fill="#EA4335"
            d="M12 6.14c1.43 0 2.71.49 3.72 1.45l2.79-2.79C16.84 3.21 14.63 2.25 12 2.25a9.75 9.75 0 0 0-8.72 5.39l3.25 2.53C7.3 7.86 9.46 6.14 12 6.14Z"
          />
        </svg>
        Sign up with Google
      </a>
    </>
  );
}
