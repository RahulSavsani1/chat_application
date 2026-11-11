"use client";

import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import styles from "@/app/page.module.css";

export type SnackbarTone = "info" | "success" | "warning" | "error";
type SnackbarProps = {
  message: string;
  tone: SnackbarTone;
  onClose: () => void;
  autoCloseMs?: number | null;
};

export default function Snackbar({ message, tone, onClose, autoCloseMs = 4200 }: SnackbarProps) {
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);
  useEffect(() => {
    if (autoCloseMs === null) return;
    const timeout = window.setTimeout(() => onCloseRef.current(), autoCloseMs);
    return () => window.clearTimeout(timeout);
  }, [autoCloseMs, message]);
  const icons = { info: "i", success: "✓", warning: "!", error: "×" };
  const className = `${styles.snackbar} ${styles[`snackbar${tone[0].toUpperCase()}${tone.slice(1)}`]}`;
  return createPortal(
    <div
      className={className}
      data-persistent={autoCloseMs === null}
      role="status"
      aria-live="polite"
    >
      <span className={styles.snackbarIcon}>{icons[tone]}</span>
      <span>{message}</span>
      <button className={styles.snackbarClose} onClick={onClose} aria-label="Dismiss notification">
        ×
      </button>
    </div>,
    document.body,
  );
}
