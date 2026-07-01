"use client";

import { createPortal } from "react-dom";
import styles from "./LiveBanner.module.css";

interface LiveBannerProps {
  hostUsername: string;
  onWatch: () => void;
  onDismiss: () => void;
}

/* Bannière proposant de regarder la partie live d'un ami. */
export function LiveBanner({ hostUsername, onWatch, onDismiss }: LiveBannerProps) {
  if (typeof document === "undefined") {
    return null;
  }
  return createPortal(
    <div className={styles.wrap}>
      <div className={styles.banner} role="status">
        <span className={styles.dot} />
        <span className={styles.text}>
          @{hostUsername} joue en direct
        </span>
        <button type="button" className={styles.watch} onClick={onWatch}>
          Regarder
        </button>
        <button
          type="button"
          className={styles.close}
          onClick={onDismiss}
          aria-label="Masquer"
        >
          ✕
        </button>
      </div>
    </div>,
    document.body,
  );
}
