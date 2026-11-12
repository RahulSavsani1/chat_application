"use client";

import { ReactNode, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import styles from "@/app/page.module.css";

type ModalProps = {
  title: string;
  onClose: () => void;
  children: ReactNode;
};

export default function Modal({ title, onClose, children }: ModalProps) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, []);

  useEffect(() => {
    if (!mounted) return;
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    document.addEventListener("keydown", closeOnEscape);
    return () => document.removeEventListener("keydown", closeOnEscape);
  }, [mounted, onClose]);

  if (!mounted) return null;

  return createPortal(
    <div className={styles.modalBackdrop} onMouseDown={onClose}>
      <section
        className={styles.modal}
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className={styles.modalHeader}>
          <h2 id="modal-title">{title}</h2>
          <button
            className={styles.modalClose}
            type="button"
            onClick={onClose}
            aria-label="Close modal"
          >
            ×
          </button>
        </div>
        {children}
      </section>
    </div>,
    document.body,
  );
}
