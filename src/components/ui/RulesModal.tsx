"use client";

import { useEffect } from "react";
import type { ModeInfo } from "@/interfaces";
import styles from "./RulesModal.module.css";

interface RulesModalProps {
  info: ModeInfo;
  onClose: () => void;
}

/* Overlay presenting the detailed rules of a single game mode. */
export function RulesModal({ info, onClose }: RulesModalProps) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className={styles.backdrop} onClick={onClose}>
      <div
        className={styles.panel}
        role="dialog"
        aria-modal="true"
        aria-label={`Règles ${info.name}`}
        onClick={(event) => event.stopPropagation()}
      >
        <header className={styles.header}>
          <div>
            <p className={styles.kicker}>Règles du jeu</p>
            <h2 className={styles.title}>{info.name}</h2>
          </div>
          <button
            type="button"
            className={styles.close}
            onClick={onClose}
            aria-label="Fermer"
          >
            ×
          </button>
        </header>
        <ul className={styles.list}>
          {info.rules.map((rule, index) => (
            <li key={index} className={styles.item}>
              <span className={styles.bullet}>{index + 1}</span>
              <span>{rule}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
