"use client";

import { ReactNode, useEffect } from "react";
import styles from "@/app/page.module.css";

type ModalProps = {
  title: string;
  onClose: () => void;
  children: ReactNode;
};

export default function Modal({ title, onClose, children }: ModalProps) {
  useEffect(() => {
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    document.addEventListener("keydown", closeOnEscape);
    return () => document.removeEventListener("keydown", closeOnEscape);
  }, [onClose]);

  return (
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
          <button className={styles.modalClose} onClick={onClose} aria-label="Close modal">
            ×
          </button>
        </div>
        {children}
      </section>
    </div>
  );
}
