import LoginForm from "@/components/auth/LoginForm";
import { getCurrentSession } from "@/lib/session";
import { redirect } from "next/navigation";
import styles from "../page.module.css";

export const instant = false;

export default async function LoginPage() {
  if (await getCurrentSession()) redirect("/chat");

  return (
    <main className={styles.page}>
      <section className={styles.authCard}>
        <a className={styles.brand} href="/">
          Chat<span>App</span>
        </a>
        <h1>Welcome back</h1>
        <p className={styles.description}>Log in with your email or Google.</p>
        <LoginForm />
        <a className={styles.authLink} href="/forgot-password">
          Forgot password?
        </a>
        <p className={styles.status}>
          Need an account? <a href="/signup">Sign up</a>
        </p>
      </section>
    </main>
  );
}
