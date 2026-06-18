"use client";

import { useEffect, useRef, useState } from "react";
import type {
  CricketPlayerState,
  DartThrow,
  X01PlayerState,
} from "@/interfaces";
import type { DartsGame } from "@/hooks/useDartsGame";
import { getMode } from "@/data/modes";
import { deadNumbers, dartMarks } from "@/utils/cricket";
import { suggestCheckout } from "@/utils/checkout";
import { liveRanks } from "@/utils/ranking";
import { feedback } from "@/utils/feedback";
import { speak } from "@/utils/announcer";
import { usePersistedState } from "@/hooks/usePersistedState";
import { PlayerScoreCard } from "@/components/ui/PlayerScoreCard";
import { DartPad } from "@/components/ui/DartPad";
import { DartBoard } from "@/components/ui/DartBoard";
import { Confetti } from "@/components/ui/Confetti";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import {
  IconHome,
  IconVolumeOn,
  IconVolumeOff,
  IconUndo,
  IconTarget,
  IconGrid,
} from "@/components/ui/icons";
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
  const turnMarks = state.darts.reduce((sum, dart) => sum + dartMarks(dart), 0);
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
  const [muted, setMuted] = usePersistedState("oche:mute", false);
  const [voice] = usePersistedState("oche:voice", true);
  const [confettiOn] = usePersistedState("oche:confetti", true);

  const announced = useRef({ turnOver: false, bust: false, winner: "" });
  useEffect(() => {
    const prev = announced.current;
    const winner = state.winnerId ?? "";
    if (winner && winner !== prev.winner) {
      const name = state.players.find((p) => p.id === winner)?.name ?? "";
      speak(`${name}, partie terminée`, voice && !muted);
    } else if (state.bust && !prev.bust) {
      speak("Bust", voice && !muted);
    } else if (state.turnOver && !prev.turnOver && !state.bust && !winner) {
      speak(isCricket ? `${turnMarks} marques` : `${turnPoints}`, voice && !muted);
    }
    announced.current = {
      turnOver: state.turnOver,
      bust: state.bust,
      winner,
    };
  }, [
    state.turnOver,
    state.bust,
    state.winnerId,
    state.players,
    voice,
    muted,
    isCricket,
    turnMarks,
    turnPoints,
  ]);

  const previous = useRef({ darts: 0, bust: false, winner: "" });
  useEffect(() => {
    const prev = previous.current;
    const winner = state.winnerId ?? "";
    if (winner && winner !== prev.winner) {
      feedback("win", muted);
    } else if (state.bust && !prev.bust) {
      feedback("bust", muted);
    } else if (state.darts.length > prev.darts) {
      feedback("throw", muted);
    }
    previous.current = {
      darts: state.darts.length,
      bust: state.bust,
      winner,
    };
  }, [state.darts.length, state.bust, state.winnerId, muted]);

  const matchOver =
    state.winnerId !== null &&
    state.legsWon[state.winnerId] >= state.legsTarget;
  const ranks = liveRanks(state);

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
          <IconHome />
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
          onClick={() => setMuted(!muted)}
          aria-label={muted ? "Activer le son" : "Couper le son"}
        >
          {muted ? <IconVolumeOff /> : <IconVolumeOn />}
        </button>
        <button
          type="button"
          className={styles.icon}
          onClick={game.undo}
          disabled={state.past.length === 0}
          aria-label="Annuler la dernière action"
        >
          <IconUndo />
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
            stats={state.stats[player.id]}
            legsWon={state.legsWon[player.id] ?? 0}
            showLegs={state.legsTarget > 1}
            startScore={state.rules.startScore}
            rank={ranks[player.id]}
            showRank={state.players.length > 1}
            isCurrent={index === state.currentIndex && !state.winnerId}
            isWinner={state.winnerId === player.id}
          />
        ))}
      </div>

      <section className={styles.turn}>
        <div className={styles.turnHead}>
          <span className={styles.turnPlayer}>
            {currentPlayer ? currentPlayer.name : ""}
            <span className={styles.turnRound}>Round {state.round}</span>
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
                ? `${dartMarks(dart)} marq.`
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
          <IconTarget /> Cible
</button>
        <button
          type="button"
          className={styles.switchBtn}
          data-on={inputMode === "pad" ? "true" : "false"}
          onClick={() => setInputMode("pad")}
        >
          <IconGrid /> Chiffres
</button>
      </div>

      {inputMode === "board" ? (
        <>
          <DartBoard
            onThrow={game.registerDart}
            disabled={inputDisabled}
            cricket={cricketOverlay}
            darts={state.darts}
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

      {state.winnerId && (
        <div className={styles.overlay}>
          {confettiOn && <Confetti />}
          <div className={styles.victory}>
            <p className={styles.victoryKicker}>
              {matchOver ? "Match terminé" : "Manche gagnée"}
            </p>
            <h2 className={styles.victoryName}>
              {state.players.find((p) => p.id === state.winnerId)?.name}
            </h2>
            <p className={styles.victorySub}>
              {state.legsTarget > 1
                ? `${state.legsWon[state.winnerId]} / ${state.legsTarget} manche${state.legsTarget > 1 ? "s" : ""}`
                : "remporte la manche"}
            </p>
            <button
              type="button"
              className={styles.victoryBtn}
              onClick={matchOver ? game.finishGame : game.nextLeg}
            >
              {matchOver ? "Voir le récap" : "Manche suivante →"}
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
