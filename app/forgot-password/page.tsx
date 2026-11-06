import ForgotPasswordForm from "@/components/auth/ForgotPasswordForm";
import styles from "../page.module.css";
import Brand from "@/components/Brand";

export default function ForgotPasswordPage() {
  return (
    <main className={styles.page}>
      <section className={styles.authCard}>
        <Brand />
        <h1>Forgot password?</h1>
        <p className={styles.description}>
          Enter your email and we&apos;ll help you reset your password.
        </p>
        <ForgotPasswordForm />
        <p className={styles.status}>
          <a href="/login">Back to login</a>
        </p>
      </section>
    </main>
  );
}
