"use client";

import { useEffect } from "react";
import styles from "@/app/page.module.css";

export type SnackbarTone = "info" | "success" | "warning" | "error";
type SnackbarProps = { message: string; tone: SnackbarTone; onClose: () => void };

export default function Snackbar({ message, tone, onClose }: SnackbarProps) {
  useEffect(() => {
    const timeout = window.setTimeout(onClose, 4200);
    return () => window.clearTimeout(timeout);
  }, [message, onClose]);
  const icons = { info: "i", success: "✓", warning: "!", error: "×" };
  const className = `${styles.snackbar} ${styles[`snackbar${tone[0].toUpperCase()}${tone.slice(1)}`]}`;
  return (
    <div className={className} role="status" aria-live="polite">
      <span className={styles.snackbarIcon}>{icons[tone]}</span>
      <span>{message}</span>
      <button className={styles.snackbarClose} onClick={onClose} aria-label="Dismiss notification">
        ×
      </button>
    </div>
  );
}
