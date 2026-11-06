import styles from "./page.module.css";
import Brand from "@/components/Brand";
import { getCurrentSession } from "@/lib/session";
import { redirect } from "next/navigation";

export const instant = false;

export default async function Home() {
  if (await getCurrentSession()) redirect("/chat");

  return (
    <main className={styles.page}>
      <div className={styles.orbOne} aria-hidden="true" />
      <div className={styles.orbTwo} aria-hidden="true" />
      <nav className={styles.nav} aria-label="Main navigation">
        <Brand />
      </nav>
      <section className={styles.hero}>
        <div className={styles.heroCopy}>
          <p className={styles.eyebrow}>A calmer way to connect</p>
          <span className={styles.statusPill}>
            <i /> Secure conversations, built simply
          </span>
          <h1>Chat clearly. Collaborate naturally.</h1>
          <p className={styles.description}>
            A focused space for real conversations and thoughtful collaboration.
          </p>
          <div className={styles.actions}>
            <a className={styles.button} href="/signup">
              Create an account
            </a>
            <a className={styles.buttonSecondary} href="/login">
              Log in
            </a>
          </div>
        </div>
        <div className={styles.preview} aria-label="Chat preview">
          <div className={styles.previewHeader}>
            <span className={styles.avatar}>M</span>
            <span>
              <strong>Design team</strong>
              <small>3 members online</small>
            </span>
            <b>•••</b>
          </div>
          <div className={styles.messages}>
            <p className={styles.received}>
              Welcome to the conversation <span>10:42</span>
            </p>
            <p className={styles.sent}>
              Let&apos;s build something useful. <span>10:43</span>
            </p>
            <p className={styles.received}>One small step at a time.</p>
          </div>
          <div className={styles.previewInput}>
            Write a message... <span>↗</span>
          </div>
        </div>
      </section>
      <section className={styles.features} aria-label="Features">
        <article>
          <span className={styles.featureIcon}>✦</span>
          <h2>Private by design</h2>
          <p>Your conversations belong to you.</p>
        </article>
        <article>
          <span className={styles.featureIcon}>↗</span>
          <h2>Always in sync</h2>
          <p>Messages move with your team in real time.</p>
        </article>
        <article>
          <span className={styles.featureIcon}>◎</span>
          <h2>Made to feel easy</h2>
          <p>Clear, calm tools for everyday chat.</p>
        </article>
      </section>
    </main>
  );
}
