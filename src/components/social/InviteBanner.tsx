"use client";

import { createPortal } from "react-dom";
import type { GameInvite } from "@/lib/gameInvites";
import { getMode } from "@/data/modes";
import styles from "./InviteBanner.module.css";

interface InviteBannerProps {
  invite: GameInvite;
  onAccept: () => void;
  onDecline: () => void;
}

/* Modal affichée à l'invité quand un ami l'invite à rejoindre une partie. */
export function InviteBanner({ invite, onAccept, onDecline }: InviteBannerProps) {
  if (typeof document === "undefined") {
    return null;
  }
  const modeName = getMode(invite.mode).name;
  return createPortal(
    <div className={styles.backdrop}>
      <div
        className={styles.panel}
        role="alertdialog"
        aria-modal="true"
        aria-label="Invitation à une partie"
      >
        <p className={styles.kicker}>Invitation</p>
        <h2 className={styles.title}>
          @{invite.hostUsername} t&apos;invite à une partie
        </h2>
        <p className={styles.mode}>{modeName}</p>
        <div className={styles.actions}>
          <button type="button" className={styles.decline} onClick={onDecline}>
            Refuser
          </button>
          <button type="button" className={styles.accept} onClick={onAccept}>
            Rejoindre
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
