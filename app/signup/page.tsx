import SignupForm from "@/components/auth/SignupForm";
import { getCurrentSession } from "@/lib/session";
import { redirect } from "next/navigation";
import styles from "../page.module.css";

export const instant = false;

export default async function SignupPage() {
  if (await getCurrentSession()) redirect("/chat");

  return (
    <main className={styles.page}>
      <section className={styles.authCard}>
        <a className={styles.brand} href="/">
          Chat<span>App</span>
        </a>
        <h1>Create your account</h1>
        <p className={styles.description}>Start your personal chat workspace.</p>
        <SignupForm />
        <p className={styles.status}>
          Already have an account? <a href="/login">Log in</a>
        </p>
      </section>
    </main>
  );
}
