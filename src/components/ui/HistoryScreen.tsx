"use client";

import { useState } from "react";
import { createPortal } from "react-dom";
import type { DartThrow, GameState } from "@/interfaces";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { IconX } from "@/components/ui/icons";
import styles from "./HistoryScreen.module.css";

interface HistoryScreenProps {
  state: GameState;
  canEdit: boolean;
  onClose: () => void;
  onRollback?: (index: number) => void;
}

/* Short label for a thrown dart, e.g. "T20", "D16", "Bull". */
function dartLabel(dart: DartThrow): string {
  if (dart.segment === 0) return "✕";
  if (dart.segment === 50) return "Bull";
  if (dart.segment === 25) return "25";
  const prefix = dart.multiplier === 3 ? "T" : dart.multiplier === 2 ? "D" : "";
  return `${prefix}${dart.segment}`;
}

/* Read-only (or host-editable) list of the current leg's turns. */
export function HistoryScreen({
  state,
  canEdit,
  onClose,
  onRollback,
}: HistoryScreenProps) {
  const [pending, setPending] = useState<number | null>(null);

  if (typeof document === "undefined") {
    return null;
  }

  const isCricket = state.mode === "cricket" || state.mode === "cutthroat";
  const isATC = state.mode === "aroundclock";

  const scoreLabel = (after: number): string => {
    if (isATC) return `${after}/21`;
    if (isCricket) return `${after} pts`;
    return `${after} rest.`;
  };

  const pendingName =
    pending !== null
      ? state.players.find((p) => p.id === state.history[pending]?.playerId)
          ?.name ?? ""
      : "";

  return createPortal(
    <div className={styles.screen}>
      <header className={styles.top}>
        <h1 className={styles.title}>Historique</h1>
        <button
          type="button"
          className={styles.close}
          onClick={onClose}
          aria-label="Fermer"
        >
          <IconX />
        </button>
      </header>

      {state.history.length === 0 ? (
        <p className={styles.empty}>Aucun tour joué pour l&apos;instant.</p>
      ) : (
        <div className={styles.list}>
          {state.history.map((rec, index) => {
            const player = state.players.find((p) => p.id === rec.playerId);
            const team = state.teams?.find((t) => t.id === rec.sideId);
            return (
              <div key={index} className={styles.row} data-bust={rec.bust ? "true" : "false"}>
                <span className={styles.round}>R{rec.round}</span>
                <div className={styles.who}>
                  <span className={styles.name}>{player?.name ?? "?"}</span>
                  {team && <span className={styles.team}>{team.name}</span>}
                </div>
                <div className={styles.darts}>
                  {rec.darts.length > 0
                    ? rec.darts.map((d, i) => (
                        <span key={i} className={styles.dart}>
                          {dartLabel(d)}
                        </span>
                      ))
                    : <span className={styles.dart}>—</span>}
                </div>
                <span className={styles.score}>
                  {rec.bust ? "Bust" : scoreLabel(rec.scoreAfter)}
                </span>
                {canEdit && onRollback && (
                  <button
                    type="button"
                    className={styles.fix}
                    onClick={() => setPending(index)}
                  >
                    Corriger
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}

      {pending !== null && onRollback && (
        <ConfirmDialog
          title="Corriger ce tour ?"
          message={`La partie reviendra juste avant le tour de ${pendingName}. Les tours suivants seront effacés.`}
          confirmLabel="Corriger"
          cancelLabel="Annuler"
          onConfirm={() => {
            onRollback(pending);
            setPending(null);
            onClose();
          }}
          onCancel={() => setPending(null)}
        />
      )}
    </div>,
    document.body,
  );
}
