"use client";

import { useEffect, useRef, useState } from "react";
import type {
  AroundClockPlayerState,
  CricketPlayerState,
  DartThrow,
  X01PlayerState,
} from "@/interfaces";
import type { DartsGame } from "@/hooks/useDartsGame";
import { getMode } from "@/data/modes";
import { deadNumbers, dartMarks } from "@/utils/cricket";
import { sidesAsPlayers } from "@/utils/teams";
import { suggestCheckouts } from "@/utils/checkout";
import { liveRanks } from "@/utils/ranking";
import { feedback } from "@/utils/feedback";
import { speak } from "@/utils/announcer";
import { usePersistedState } from "@/hooks/usePersistedState";
import { PlayerScoreCard } from "@/components/ui/PlayerScoreCard";
import { TeamScoreCard } from "@/components/ui/TeamScoreCard";
import { DartPad } from "@/components/ui/DartPad";
import { DartBoard } from "@/components/ui/DartBoard";
import { Confetti } from "@/components/ui/Confetti";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { HistoryScreen } from "@/components/ui/HistoryScreen";
import {
  IconHome,
  IconVolumeOn,
  IconVolumeOff,
  IconUndo,
  IconTarget,
  IconGrid,
  IconHistory,
} from "@/components/ui/icons";
import styles from "./GameScreen.module.css";

interface GameScreenProps {
  game: DartsGame;
}

const CRICKET_LIVE = [15, 16, 17, 18, 19, 20];

/* Builds a short label for a thrown dart, e.g. "T20", "D16", "Bull". */
function dartLabel(dart: DartThrow): string {
  if (dart.segment === 0) return "✕";
  if (dart.segment === 50) return "Bull";
  if (dart.segment === 25) return "25";
  const prefix = dart.multiplier === 3 ? "T" : dart.multiplier === 2 ? "D" : "";
  return `${prefix}${dart.segment}`;
}

/* Turn-by-turn play screen: scoreboard, dart input and turn controls. */
export function GameScreen({ game }: GameScreenProps) {
  const { state, currentPlayer } = game;
  const info = getMode(state.mode);
  const isCricket = state.mode === "cricket" || state.mode === "cutthroat";
  const isATC = state.mode === "aroundclock";
  const turnPoints = state.darts.reduce((sum, dart) => sum + dart.points, 0);
  const turnMarks = state.darts.reduce((sum, dart) => sum + dartMarks(dart), 0);
  const slots = [0, 1, 2];

  const currentSideId = currentPlayer
    ? state.sideOf[currentPlayer.id] ?? currentPlayer.id
    : null;
  const winnerName = state.winnerId
    ? state.teams?.find((t) => t.id === state.winnerId)?.name ??
      state.players.find((p) => p.id === state.winnerId)?.name ??
      ""
    : "";

  const activeX01 =
    state.mode === "x01" && currentPlayer && currentSideId
      ? (state.states[currentSideId] as X01PlayerState)
      : null;
  const checkouts =
    activeX01 && activeX01.opened && !state.turnOver && !state.winnerId
      ? suggestCheckouts(activeX01.score, 3 - state.darts.length, state.rules.outOption)
      : [];

  const atcState =
    isATC && currentPlayer && currentSideId
      ? (state.states[currentSideId] as AroundClockPlayerState)
      : null;
  const atcTarget = atcState?.target ?? undefined;

  const [inputMode, setInputMode] = usePersistedState<"board" | "pad">(
    "oche:input",
    "board",
  );
  const inputDisabled = state.turnOver || state.winnerId !== null;
  const [confirmQuit, setConfirmQuit] = useState(false);
  const [showHistory, setShowHistory] = useState(false);

  useEffect(() => {
    window.history.pushState(null, "");
    const handler = () => {
      setConfirmQuit(true);
      window.history.pushState(null, "");
    };
    window.addEventListener("popstate", handler);
    return () => window.removeEventListener("popstate", handler);
  }, []);

  const [muted, setMuted] = usePersistedState("oche:mute", false);
  const [voice] = usePersistedState("oche:voice", true);
  const [confettiOn] = usePersistedState("oche:confetti", true);

  const announced = useRef({ turnOver: false, bust: false, winner: "" });
  useEffect(() => {
    const prev = announced.current;
    const winner = state.winnerId ?? "";
    if (winner && winner !== prev.winner) {
      const name =
        state.teams?.find((t) => t.id === winner)?.name ??
        state.players.find((p) => p.id === winner)?.name ??
        "";
      speak(`${name}, partie terminée`, voice && !muted);
    } else if (state.bust && !prev.bust) {
      speak("Bust", voice && !muted);
    } else if (state.turnOver && !prev.turnOver && !state.bust && !winner) {
      speak(isCricket ? `${turnMarks} marques` : `${turnPoints}`, voice && !muted);
    }
    announced.current = { turnOver: state.turnOver, bust: state.bust, winner };
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
    previous.current = { darts: state.darts.length, bust: state.bust, winner };
  }, [state.darts.length, state.bust, state.winnerId, muted]);

  const matchOver =
    state.winnerId !== null &&
    state.legsWon[state.winnerId] >= state.legsTarget;
  const ranks = liveRanks(state);

  const cricketOverlay =
    isCricket && currentPlayer && currentSideId
      ? {
          marks: (state.states[currentSideId] as CricketPlayerState).marks,
          dead: deadNumbers(
            state.states as Record<string, CricketPlayerState>,
            sidesAsPlayers(state.teams, state.players),
          ),
        }
      : undefined;

  const atcTurnLabel = (() => {
    if (!atcTarget) return null;
    return atcTarget === 25 ? "Cible : Bull" : `Cible : ${atcTarget}`;
  })();

  const nextPlayerName = (() => {
    if (state.order.length === 0) return "";
    const nextId = state.order[(state.currentIndex + 1) % state.order.length];
    return state.players.find((p) => p.id === nextId)?.name ?? "";
  })();

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
          onClick={() => setShowHistory(true)}
          aria-label="Historique de la partie"
        >
          <IconHistory />
        </button>
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
        data-many={
          (state.teams ? state.teams.length : state.players.length) > 2
            ? "true"
            : "false"
        }
      >
        {state.teams
          ? state.teams.map((team) => (
              <TeamScoreCard
                key={team.id}
                team={team}
                state={state.states[team.id]}
                members={team.playerIds
                  .map((pid) => state.players.find((p) => p.id === pid))
                  .filter((p): p is NonNullable<typeof p> => p != null)}
                stats={state.stats}
                legsWon={state.legsWon[team.id] ?? 0}
                showLegs={state.legsTarget > 1}
                rank={ranks[team.id]}
                showRank={state.teams!.length > 1}
                isCurrentTeam={
                  currentPlayer != null &&
                  state.sideOf[currentPlayer.id] === team.id &&
                  !state.winnerId
                }
                currentPlayerId={currentPlayer?.id ?? null}
                isWinner={state.winnerId === team.id}
              />
            ))
          : state.players.map((player, index) => (
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
            {currentPlayer
              ? state.teams
                ? `${state.teams.find((t) => t.id === currentSideId)?.name ?? ""} · ${currentPlayer.name}`
                : currentPlayer.name
              : ""}
            <span className={styles.turnRound}>Round {state.round}</span>
          </span>
          <span className={styles.turnTotal}>
            {isATC && atcTurnLabel ? (
              atcTurnLabel
            ) : (
              <>Tour&nbsp;:{" "}
                <strong>
                  {isCricket ? `${turnMarks} marq.` : turnPoints}
                </strong>
              </>
            )}
          </span>
        </div>
        <div className={styles.slots}>
          {slots.map((slot) => {
            const dart = state.darts[slot];
            const sub = dart
              ? isCricket
                ? `${dartMarks(dart)} marq.`
                : isATC
                  ? dart.segment === 0 ? "raté" : "touché"
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
        {checkouts.length > 0 && (
          <div className={styles.checkout}>
            <span className={styles.checkoutLabel}>Sortie</span>
            <div className={styles.checkoutList}>
              {checkouts.map((combo, i) => (
                <span
                  key={i}
                  className={styles.checkoutCombo}
                  data-alt={i > 0 ? "true" : undefined}
                >
                  {combo.join(" · ")}
                </span>
              ))}
            </div>
          </div>
        )}
        {state.bust && <div className={styles.bust}>Bust — tour annulé</div>}
      </section>

      <div className={styles.inputArea}>
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
              atcTarget={atcTarget}
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
          {state.turnOver
            ? nextPlayerName
              ? `→ ${nextPlayerName}`
              : "Joueur suivant →"
            : "Passer le tour"}
        </button>
      </div>

      {state.winnerId && (
        <div className={styles.overlay}>
          {confettiOn && <Confetti />}
          <div className={styles.victory}>
            <p className={styles.victoryKicker}>
              {matchOver ? "Match terminé" : "Manche gagnée"}
            </p>
            <h2 className={styles.victoryName}>
              {winnerName}
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

      {showHistory && (
        <HistoryScreen
          state={state}
          canEdit
          onClose={() => setShowHistory(false)}
          onRollback={game.rollbackToTurn}
        />
      )}
    </div>
  );
}
