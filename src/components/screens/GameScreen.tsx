"use client";

import type { DartThrow } from "@/interfaces";
import type { DartsGame } from "@/hooks/useDartsGame";
import { getMode } from "@/data/modes";
import { PlayerScoreCard } from "@/components/ui/PlayerScoreCard";
import { DartPad } from "@/components/ui/DartPad";
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

/* Turn-by-turn play screen: scoreboard, dart input and turn controls. */
export function GameScreen({ game }: GameScreenProps) {
  const { state, currentPlayer } = game;
  const info = getMode(state.mode);
  const isCricket = state.mode !== "x01";
  const turnPoints = state.darts.reduce((sum, dart) => sum + dart.points, 0);
  const slots = [0, 1, 2];

  return (
    <div className={styles.screen}>
      <header className={styles.top}>
        <button type="button" className={styles.icon} onClick={game.goHome}>
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
          onClick={game.undoDart}
          disabled={state.darts.length === 0}
          aria-label="Annuler la dernière fléchette"
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
            Tour&nbsp;: <strong>{turnPoints}</strong>
          </span>
        </div>
        <div className={styles.slots}>
          {slots.map((slot) => {
            const dart = state.darts[slot];
            return (
              <div
                key={slot}
                className={styles.slot}
                data-filled={dart ? "true" : "false"}
              >
                <span className={styles.slotLabel}>
                  {dart ? dartLabel(dart) : "—"}
                </span>
                <span className={styles.slotPts}>
                  {dart ? `${dart.points} pts` : `Fléch. ${slot + 1}`}
                </span>
              </div>
            );
          })}
        </div>
        {state.bust && <div className={styles.bust}>Bust — tour annulé</div>}
      </section>

      <DartPad
        onThrow={game.registerDart}
        disabled={state.turnOver || state.winnerId !== null}
        liveNumbers={isCricket ? CRICKET_LIVE : undefined}
      />

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
    </div>
  );
}
