import styles from "@/app/page.module.css";

export default function Brand() {
  return (
    <a className={styles.brand} href="/" aria-label="Relay home">
      <svg className={styles.brandMark} viewBox="0 0 64 64" aria-hidden="true">
        <rect width="64" height="64" rx="18" fill="#197c78" />
        <path
          d="M17 18.5h22a9 9 0 0 1 9 9v7a9 9 0 0 1-9 9H29l-8.5 6v-6H17a9 9 0 0 1-9-9v-7a9 9 0 0 1 9-9Z"
          fill="#fffefa"
        />
        <path
          d="M27 25h22a7 7 0 0 1 7 7v5a7 7 0 0 1-7 7h-6l-6 4v-4h-10a7 7 0 0 1-7-7v-5a7 7 0 0 1 7-7Z"
          fill="#f28c6b"
          opacity=".95"
        />
        <circle cx="32" cy="34.5" r="2.2" fill="#183b40" />
        <circle cx="40" cy="34.5" r="2.2" fill="#183b40" />
        <circle cx="48" cy="34.5" r="2.2" fill="#183b40" />
      </svg>
      Relay
    </a>
  );
}
