"use client";

import { useState } from "react";
import type {
  CricketPlayerState,
  DartThrow,
  X01PlayerState,
} from "@/interfaces";
import type { DartsGame } from "@/hooks/useDartsGame";
import { getMode } from "@/data/modes";
import { deadNumbers } from "@/utils/cricket";
import { suggestCheckout } from "@/utils/checkout";
import { usePersistedState } from "@/hooks/usePersistedState";
import { PlayerScoreCard } from "@/components/ui/PlayerScoreCard";
import { DartPad } from "@/components/ui/DartPad";
import { DartBoard } from "@/components/ui/DartBoard";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import styles from "./GameScreen.module.css";

interface GameScreenProps {
  game: DartsGame;
}

const CRICKET_LIVE = [15, 16, 17, 18, 19, 20];

/* Builds a short label for a thrown dart, e.g. "T20", "D16", "Bull". */
function dartLabel(dart: DartThrow): string {
  if (dart.segment === 0) {
    return "✕";
  }
  if (dart.segment === 50) {
    return "Bull";
  }
  if (dart.segment === 25) {
    return "25";
  }
  const prefix = dart.multiplier === 3 ? "T" : dart.multiplier === 2 ? "D" : "";
  return `${prefix}${dart.segment}`;
}

/* Returns the number of cricket marks a single dart is worth. */
function marksOf(dart: DartThrow): number {
  if (dart.segment === 50) {
    return 2;
  }
  if (dart.segment === 25) {
    return 1;
  }
  if (dart.segment >= 15 && dart.segment <= 20) {
    return dart.multiplier;
  }
  return 0;
}

/* Turn-by-turn play screen: scoreboard, dart input and turn controls. */
export function GameScreen({ game }: GameScreenProps) {
  const { state, currentPlayer } = game;
  const info = getMode(state.mode);
  const isCricket = state.mode !== "x01";
  const turnPoints = state.darts.reduce((sum, dart) => sum + dart.points, 0);
  const turnMarks = state.darts.reduce((sum, dart) => sum + marksOf(dart), 0);
  const slots = [0, 1, 2];

  const activeX01 =
    state.mode === "x01" && currentPlayer
      ? (state.states[currentPlayer.id] as X01PlayerState)
      : null;
  const checkout =
    activeX01 && activeX01.opened && !state.turnOver && !state.winnerId
      ? suggestCheckout(
          activeX01.score,
          3 - state.darts.length,
          state.rules.outOption,
        )
      : null;
  const [inputMode, setInputMode] = usePersistedState<"board" | "pad">(
    "oche:input",
    "board",
  );
  const inputDisabled = state.turnOver || state.winnerId !== null;
  const [confirmQuit, setConfirmQuit] = useState(false);

  const cricketOverlay =
    isCricket && currentPlayer
      ? {
          marks: (state.states[currentPlayer.id] as CricketPlayerState).marks,
          dead: deadNumbers(
            state.states as Record<string, CricketPlayerState>,
            state.players,
          ),
        }
      : undefined;

  return (
    <div className={styles.screen}>
      <header className={styles.top}>
        <button
          type="button"
          className={styles.icon}
          onClick={() => setConfirmQuit(true)}
          aria-label="Quitter la partie"
        >
          ⌂
        </button>
        <div className={styles.modeInfo}>
          <span className={styles.modeName}>{info.name}</span>
          <span className={styles.modeSub}>
            {state.mode === "x01"
              ? `${state.rules.startScore} · ${state.rules.outOption === "open" ? "Open" : state.rules.outOption === "master" ? "Master" : "Double"} Out`
              : info.tagline}
          </span>
        </div>
        <button
          type="button"
          className={styles.icon}
          onClick={game.undo}
          disabled={state.past.length === 0}
          aria-label="Annuler la dernière action"
        >
          ↺
        </button>
      </header>

      <div
        className={styles.board}
        data-many={state.players.length > 2 ? "true" : "false"}
      >
        {state.players.map((player, index) => (
          <PlayerScoreCard
            key={player.id}
            player={player}
            state={state.states[player.id]}
            isCurrent={index === state.currentIndex && !state.winnerId}
            isWinner={state.winnerId === player.id}
          />
        ))}
      </div>

      <section className={styles.turn}>
        <div className={styles.turnHead}>
          <span className={styles.turnPlayer}>
            {currentPlayer ? currentPlayer.name : ""}
          </span>
          <span className={styles.turnTotal}>
            Tour&nbsp;:{" "}
            <strong>
              {isCricket ? `${turnMarks} marq.` : turnPoints}
            </strong>
          </span>
        </div>
        <div className={styles.slots}>
          {slots.map((slot) => {
            const dart = state.darts[slot];
            const sub = dart
              ? isCricket
                ? `${marksOf(dart)} marq.`
                : `${dart.points} pts`
              : `Fléch. ${slot + 1}`;
            return (
              <button
                key={slot}
                type="button"
                className={styles.slot}
                data-filled={dart ? "true" : "false"}
                disabled={!dart}
                onClick={() => game.removeDart(slot)}
                aria-label={dart ? `Retirer la fléchette ${slot + 1}` : undefined}
              >
                <span className={styles.slotLabel}>
                  {dart ? dartLabel(dart) : "—"}
                </span>
                <span className={styles.slotPts}>{sub}</span>
              </button>
            );
          })}
        </div>
        {checkout && (
          <div className={styles.checkout}>
            <span className={styles.checkoutLabel}>Sortie</span>
            <span className={styles.checkoutCombo}>{checkout.join(" · ")}</span>
          </div>
        )}
        {state.bust && <div className={styles.bust}>Bust — tour annulé</div>}
      </section>

      <div className={styles.switch}>
        <button
          type="button"
          className={styles.switchBtn}
          data-on={inputMode === "board" ? "true" : "false"}
          onClick={() => setInputMode("board")}
        >
          🎯 Cible
        </button>
        <button
          type="button"
          className={styles.switchBtn}
          data-on={inputMode === "pad" ? "true" : "false"}
          onClick={() => setInputMode("pad")}
        >
          # Chiffres
        </button>
      </div>

      {inputMode === "board" ? (
        <>
          <DartBoard
            onThrow={game.registerDart}
            disabled={inputDisabled}
            cricket={cricketOverlay}
          />
          <button
            type="button"
            className={styles.miss}
            onClick={() => game.registerDart(0, 1)}
            disabled={inputDisabled}
          >
            ✕ À côté
          </button>
        </>
      ) : (
        <DartPad
          onThrow={game.registerDart}
          disabled={inputDisabled}
          liveNumbers={isCricket ? CRICKET_LIVE : undefined}
        />
      )}

      <button
        type="button"
        className={`${styles.next} ${state.turnOver ? styles.nextReady : ""}`}
        onClick={game.nextTurn}
        disabled={state.winnerId !== null}
      >
        {state.turnOver ? "Joueur suivant →" : "Passer le tour"}
      </button>

      {state.winnerId && currentPlayer && (
        <div className={styles.overlay}>
          <div className={styles.victory}>
            <p className={styles.victoryKicker}>Partie terminée</p>
            <h2 className={styles.victoryName}>
              {state.players.find((p) => p.id === state.winnerId)?.name}
            </h2>
            <p className={styles.victorySub}>remporte la manche</p>
            <button
              type="button"
              className={styles.victoryBtn}
              onClick={game.finishGame}
            >
              Voir le récap
            </button>
          </div>
        </div>
      )}

      {confirmQuit && (
        <ConfirmDialog
          title="Quitter la partie ?"
          message="La partie en cours sera perdue. Cette action est définitive."
          confirmLabel="Quitter"
          cancelLabel="Continuer"
          onConfirm={game.goHome}
          onCancel={() => setConfirmQuit(false)}
        />
      )}
    </div>
  );
}
