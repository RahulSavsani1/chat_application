import ResetPasswordForm from "@/components/auth/ResetPasswordForm";
import styles from "../page.module.css";
import Brand from "@/components/Brand";

export default function ResetPasswordPage() {
  return (
    <main className={styles.page}>
      <section className={styles.authCard}>
        <Brand />
        <h1>Set a new password</h1>
        <ResetPasswordForm />
        <p className={styles.status}>
          <a href="/login">Back to login</a>
        </p>
      </section>
    </main>
  );
}
