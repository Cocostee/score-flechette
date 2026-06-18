"use client";

import type { Player, X01PlayerState } from "@/interfaces";
import type { DartsGame } from "@/hooks/useDartsGame";
import { getMode } from "@/data/modes";
import { allClosed } from "@/utils/cricket";
import { IconTrophy } from "@/components/ui/icons";
import styles from "./ResultScreen.module.css";

interface ResultScreenProps {
  game: DartsGame;
}

/* Orders players from best to worst. */
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

/* Computes the 3-dart average for a player at the end of the game. */
function computeAvg(game: DartsGame, player: Player): number {
  const { state } = game;
  const ps = state.states[player.id];
  const pStats = state.stats[player.id];
  if (!pStats || pStats.darts === 0) return 0;
  if (ps.kind === "x01") {
    const pointsScored = state.rules.startScore - ps.score;
    return (pointsScored / pStats.darts) * 3;
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
  const pStats = state.stats[player.id];
  const isCricket = state.mode !== "x01";
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
    const closed = allClosed(ps);
    return `${ps.score} pts${closed ? " · fermé" : ""}`;
  })();

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
            <span className={styles.playerStatVal}>
              {avg.toFixed(1)}
            </span>
            <span className={styles.playerStatLabel}>
              {isCricket ? "MPR" : "Moy /3"}
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
          {!isCricket && (
            <div className={styles.playerStat}>
              <span className={styles.playerStatVal}>
                {pStats.oneEighties > 0
                  ? pStats.oneEighties
                  : pStats.tonPlus > 0
                    ? pStats.tonPlus
                    : "—"}
              </span>
              <span className={styles.playerStatLabel}>
                {pStats.oneEighties > 0 ? "180s" : "Ton+"}
              </span>
            </div>
          )}
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

  return (
    <div className={styles.screen}>
      <header className={styles.head}>
        <div className={styles.trophyWrap}>
          <IconTrophy style={{ fontSize: "2.4rem", color: "var(--gold-bright)" }} />
        </div>
        <p className={styles.kicker}>{info.name}{multiLeg ? ` · ${state.legsTarget} manches` : ""}</p>
        <h1 className={styles.winner}>{winner?.name}</h1>
        <p className={styles.winnerSub}>remporte la partie</p>
      </header>

      <section className={styles.breakdown}>
        <h2 className={styles.breakdownTitle}>
          Résultats
          {multiLeg && <span className={styles.legNote}> (dernier leg)</span>}
        </h2>
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
    </div>
  );
}
