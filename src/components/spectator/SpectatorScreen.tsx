"use client";

import { useState } from "react";
import { createPortal } from "react-dom";
import type { DartThrow, X01PlayerState } from "@/interfaces";
import type { LiveGame } from "@/lib/liveGame";
import { getMode } from "@/data/modes";
import { dartMarks } from "@/utils/cricket";
import { liveRanks } from "@/utils/ranking";
import { suggestCheckouts } from "@/utils/checkout";
import { PlayerScoreCard } from "@/components/ui/PlayerScoreCard";
import { TeamScoreCard } from "@/components/ui/TeamScoreCard";
import { HistoryScreen } from "@/components/ui/HistoryScreen";
import { IconHistory } from "@/components/ui/icons";
import styles from "./SpectatorScreen.module.css";

interface SpectatorScreenProps {
  live: LiveGame;
  onClose: () => void;
}

/* Short label for a thrown dart, e.g. "T20", "D16", "Bull". */
function dartLabel(dart: DartThrow): string {
  if (dart.segment === 0) return "✕";
  if (dart.segment === 50) return "Bull";
  if (dart.segment === 25) return "25";
  const prefix = dart.multiplier === 3 ? "T" : dart.multiplier === 2 ? "D" : "";
  return `${prefix}${dart.segment}`;
}

/* Read-only live view of another player's game. No controls. */
export function SpectatorScreen({ live, onClose }: SpectatorScreenProps) {
  if (typeof document === "undefined") {
    return null;
  }
  const state = live.state;
  const [showHistory, setShowHistory] = useState(false);
  const info = getMode(state.mode);
  const isCricket = state.mode === "cricket" || state.mode === "cutthroat";
  const isATC = state.mode === "aroundclock";
  const ended = live.status === "ended";

  const ranks = liveRanks(state);
  const currentId =
    state.order.length > 0 ? state.order[state.currentIndex] : null;
  const currentPlayer = currentId
    ? state.players.find((p) => p.id === currentId) ?? null
    : null;
  const currentSideId = currentPlayer
    ? state.sideOf[currentPlayer.id] ?? currentPlayer.id
    : null;
  const activeX01 =
    state.mode === "x01" && currentPlayer && currentSideId
      ? (state.states[currentSideId] as X01PlayerState)
      : null;
  const checkouts =
    activeX01 && activeX01.opened && !state.winnerId && !ended
      ? suggestCheckouts(
          activeX01.score,
          3 - state.darts.length,
          state.rules.outOption,
        )
      : [];
  const turnPoints = state.darts.reduce((sum, d) => sum + d.points, 0);
  const turnMarks = state.darts.reduce((sum, d) => sum + dartMarks(d), 0);
  const slots = [0, 1, 2];

  const winnerName = state.winnerId
    ? state.teams?.find((t) => t.id === state.winnerId)?.name ??
      state.players.find((p) => p.id === state.winnerId)?.name ??
      ""
    : "";

  return createPortal(
    <div className={styles.screen}>
      <header className={styles.top}>
        <div className={styles.liveTag}>
          <span className={styles.dot} />
          {ended ? "Terminé" : "En direct"}
        </div>
        <div className={styles.hostInfo}>
          <span className={styles.hostName}>@{live.hostUsername}</span>
          <span className={styles.modeName}>{info.name}</span>
        </div>
        <button
          type="button"
          className={styles.close}
          onClick={() => setShowHistory(true)}
          aria-label="Historique de la partie"
        >
          <IconHistory />
        </button>
        <button
          type="button"
          className={styles.close}
          onClick={onClose}
          aria-label="Fermer"
        >
          ✕
        </button>
      </header>

      {ended && (
        <div className={styles.endedBanner}>
          Partie terminée{winnerName ? ` — ${winnerName} gagne` : ""}
        </div>
      )}

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
                showRank={(state.teams?.length ?? 0) > 1}
                isCurrentTeam={
                  currentSideId === team.id && !state.winnerId && !ended
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
                isCurrent={index === state.currentIndex && !state.winnerId && !ended}
                isWinner={state.winnerId === player.id}
              />
            ))}
      </div>

      {!ended && currentPlayer && (
        <section className={styles.turn}>
          <div className={styles.turnHead}>
            <span className={styles.turnPlayer}>
              {state.teams
                ? `${state.teams.find((t) => t.id === currentSideId)?.name ?? ""} · ${currentPlayer.name}`
                : currentPlayer.name}
              <span className={styles.turnRound}>Round {state.round}</span>
            </span>
            <span className={styles.turnTotal}>
              {isATC
                ? "Autour de l'horloge"
                : isCricket
                  ? `${turnMarks} marq.`
                  : `${turnPoints} pts`}
            </span>
          </div>
          <div className={styles.slots}>
            {slots.map((slot) => {
              const dart = state.darts[slot];
              const sub = dart
                ? isCricket
                  ? `${dartMarks(dart)} marq.`
                  : isATC
                    ? dart.segment === 0
                      ? "raté"
                      : "touché"
                    : `${dart.points} pts`
                : `Fléch. ${slot + 1}`;
              return (
                <div
                  key={slot}
                  className={styles.slot}
                  data-filled={dart ? "true" : "false"}
                >
                  <span className={styles.slotLabel}>
                    {dart ? dartLabel(dart) : "—"}
                  </span>
                  <span className={styles.slotSub}>{sub}</span>
                </div>
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
          {state.bust && <div className={styles.bust}>Bust</div>}
        </section>
      )}
      {showHistory && (
        <HistoryScreen
          state={state}
          canEdit={false}
          onClose={() => setShowHistory(false)}
        />
      )}
    </div>,
    document.body,
  );
}
