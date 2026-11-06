import styles from "../app/page.module.css";

type AppLoaderProps = { label?: string };

export default function AppLoader({ label = "Loading" }: AppLoaderProps) {
  return (
    <div className={styles.loader} role="status" aria-live="polite" aria-label={label}>
      <span className={styles.loaderMark} aria-hidden="true">
        <span className={styles.loaderBubble}>C</span>
        <i className={styles.loaderDotOne} />
        <i className={styles.loaderDotTwo} />
        <i className={styles.loaderDotThree} />
      </span>
    </div>
  );
}
