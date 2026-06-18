"use client";

import { useState } from "react";
import type { Player } from "@/interfaces";
import type { DartsGame } from "@/hooks/useDartsGame";
import { getMode } from "@/data/modes";
import { allClosed } from "@/utils/cricket";
import { atcProgress, ATC_SEQUENCE } from "@/utils/aroundClock";
import { IconTrophy } from "@/components/ui/icons";
import styles from "./ResultScreen.module.css";

interface ResultScreenProps {
  game: DartsGame;
}

/* Orders players from best to worst for the final podium. */
function rankPlayers(game: DartsGame): Player[] {
  const { state } = game;
  const others = state.players.filter((p) => p.id !== state.winnerId);
  const winner = state.players.find((p) => p.id === state.winnerId);

  const sorted = [...others].sort((a, b) => {
    if (state.legsTarget > 1) {
      return state.legsWon[b.id] - state.legsWon[a.id];
    }
    const sa = state.states[a.id];
    const sb = state.states[b.id];
    if (sa.kind === "x01" && sb.kind === "x01") {
      return sa.score - sb.score;
    }
    if (sa.kind === "aroundclock" && sb.kind === "aroundclock") {
      return atcProgress(sb) - atcProgress(sa);
    }
    if (sa.kind === "cricket" && sb.kind === "cricket") {
      return state.mode === "cutthroat"
        ? sa.score - sb.score
        : sb.score - sa.score;
    }
    return 0;
  });

  return winner ? [winner, ...sorted] : sorted;
}

const MEDALS = ["Or", "Argent", "Bronze"];
const PLACE_LABELS = ["1er", "2e", "3e", "4e", "5e", "6e"];

/* Computes the 3-dart average for a player from accumulated totalStats. */
function computeAvg(game: DartsGame, player: Player): number {
  const { state } = game;
  const pStats = state.totalStats[player.id];
  if (!pStats || pStats.darts === 0) return 0;
  if (state.mode === "x01") {
    return pStats.pointsScored > 0
      ? (pStats.pointsScored / pStats.darts) * 3
      : 0;
  }
  return (pStats.marks / pStats.darts) * 3;
}

interface PlayerResultCardProps {
  player: Player;
  game: DartsGame;
  rank: number;
}

/* One per-player card in the result breakdown. */
function PlayerResultCard({ player, game, rank }: PlayerResultCardProps) {
  const { state } = game;
  const ps = state.states[player.id];
  const pStats = state.totalStats[player.id];
  const isCricket = state.mode === "cricket" || state.mode === "cutthroat";
  const isATC = state.mode === "aroundclock";
  const avg = computeAvg(game, player);
  const medal = MEDALS[rank - 1];
  const isWinner = rank === 1;

  const summaryLine = (() => {
    if (state.legsTarget > 1) {
      const won = state.legsWon[player.id] ?? 0;
      return `${won} manche${won > 1 ? "s" : ""}`;
    }
    if (ps.kind === "x01") {
      return ps.score === 0 ? "Checkout !" : `${ps.score} restants`;
    }
    if (ps.kind === "aroundclock") {
      return ps.target === 0
        ? "Tour complet !"
        : `Cible ${ps.target} (${atcProgress(ps)}/${ATC_SEQUENCE.length})`;
    }
    const closed = allClosed(ps);
    return `${ps.score} pts${closed ? " · fermé" : ""}`;
  })();

  const checkoutPct =
    !isCricket && !isATC && pStats && pStats.checkoutAttempts > 0
      ? Math.round((pStats.checkoutHits / pStats.checkoutAttempts) * 100)
      : null;

  return (
    <div
      className={styles.playerCard}
      data-winner={isWinner ? "true" : "false"}
      style={{ animationDelay: `${(rank - 1) * 0.08}s` }}
    >
      <div className={styles.playerCardHead}>
        <span className={styles.playerMedal} data-medal={medal ?? "none"}>
          {PLACE_LABELS[rank - 1] ?? `${rank}e`}
        </span>
        <span className={styles.playerCardName}>{player.name}</span>
        <span className={styles.playerSummary}>{summaryLine}</span>
      </div>

      {pStats && pStats.darts > 0 && (
        <div className={styles.playerStats}>
          <div className={styles.playerStat}>
            <span className={styles.playerStatVal}>{avg.toFixed(1)}</span>
            <span className={styles.playerStatLabel}>
              {isATC ? "H/T" : isCricket ? "MPR" : "Moy /3"}
            </span>
          </div>
          <div className={styles.playerStat}>
            <span className={styles.playerStatVal}>{pStats.bestVisit || "—"}</span>
            <span className={styles.playerStatLabel}>Meilleur</span>
          </div>
          <div className={styles.playerStat}>
            <span className={styles.playerStatVal}>{pStats.darts}</span>
            <span className={styles.playerStatLabel}>Fléch.</span>
          </div>
          {!isCricket && !isATC && (
            <div className={styles.playerStat}>
              <span className={styles.playerStatVal}>
                {checkoutPct !== null
                  ? `${checkoutPct}%`
                  : pStats.oneEighties > 0
                    ? pStats.oneEighties
                    : pStats.tonPlus > 0
                      ? pStats.tonPlus
                      : "—"}
              </span>
              <span className={styles.playerStatLabel}>
                {checkoutPct !== null
                  ? "Checkout"
                  : pStats.oneEighties > 0
                    ? "180s"
                    : "Ton+"}
              </span>
            </div>
          )}
          {isATC && (
            <div className={styles.playerStat}>
              <span className={styles.playerStatVal}>
                {atcProgress(ps.kind === "aroundclock" ? ps : { kind: "aroundclock", target: 1 })}
              </span>
              <span className={styles.playerStatLabel}>Cibles</span>
            </div>
          )}
        </div>
      )}

      {!isCricket && !isATC && pStats && pStats.oneEighties > 0 && checkoutPct !== null && (
        <div className={styles.bonusLine}>
          {pStats.oneEighties} × 180
          {pStats.tonPlus > pStats.oneEighties
            ? ` · ${pStats.tonPlus - pStats.oneEighties} ton+`
            : ""}
        </div>
      )}
    </div>
  );
}

/* End screen: podium, per-player stats, replay and home actions. */
export function ResultScreen({ game }: ResultScreenProps) {
  const { state } = game;
  const info = getMode(state.mode);
  const ranking = rankPlayers(game);
  const winner = ranking[0];
  const multiLeg = state.legsTarget > 1;
  const [copied, setCopied] = useState(false);

  const handleShare = async () => {
    const lines = ranking.map((p, i) => {
      const pStats = state.totalStats[p.id];
      const avg = computeAvg(game, p);
      const darts = pStats?.darts ?? 0;
      return `${PLACE_LABELS[i] ?? `${i + 1}e`} ${p.name} — Moy/3: ${avg.toFixed(1)}, ${darts} fléch.`;
    });
    const text = [
      `🎯 Sur la Ligne · ${info.name}`,
      multiLeg ? `${state.legsTarget} manches` : "",
      "",
      ...lines,
    ]
      .filter((l) => l !== "")
      .join("\n");

    try {
      if (navigator.share) {
        await navigator.share({ title: "Sur la Ligne", text });
      } else {
        await navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }
    } catch {
      // user cancelled
    }
  };

  return (
    <div className={styles.screen}>
      <header className={styles.head}>
        <div className={styles.trophyWrap}>
          <IconTrophy style={{ fontSize: "2.4rem", color: "var(--gold-bright)" }} />
        </div>
        <p className={styles.kicker}>
          {info.name}
          {multiLeg ? ` · ${state.legsTarget} manches` : ""}
        </p>
        <h1 className={styles.winner}>{winner?.name}</h1>
        <p className={styles.winnerSub}>remporte la partie</p>
      </header>

      <section className={styles.breakdown}>
        <h2 className={styles.breakdownTitle}>Résultats</h2>
        <div className={styles.playerCards}>
          {ranking.map((player, index) => (
            <PlayerResultCard
              key={player.id}
              player={player}
              game={game}
              rank={index + 1}
            />
          ))}
        </div>
      </section>

      <div className={styles.actions}>
        <button type="button" className={styles.replay} onClick={game.newGame}>
          Rejouer
        </button>
        <button type="button" className={styles.home} onClick={game.goHome}>
          Accueil
        </button>
      </div>

      <button type="button" className={styles.share} onClick={handleShare}>
        {copied ? "Copié !" : "Partager"}
      </button>
    </div>
  );
}
