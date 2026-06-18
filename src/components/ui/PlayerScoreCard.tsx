"use client";

import type { Player, PlayerGameState, PlayerStats } from "@/interfaces";
import { CRICKET_NUMBERS } from "@/utils/cricket";
import { IconTrophy } from "@/components/ui/icons";
import styles from "./PlayerScoreCard.module.css";

interface PlayerScoreCardProps {
  player: Player;
  state: PlayerGameState;
  stats?: PlayerStats;
  legsWon: number;
  showLegs: boolean;
  startScore: number;
  rank: number;
  showRank: boolean;
  isCurrent: boolean;
  isWinner: boolean;
}

const RANK_LABEL = ["", "1ᵉʳ", "2ᵉ", "3ᵉ", "4ᵉ", "5ᵉ", "6ᵉ"];

/* Formats the headline stat (3-dart average or marks per round). */
function formatStat(
  state: PlayerGameState,
  stats: PlayerStats | undefined,
  startScore: number,
): string {
  if (!stats || stats.darts === 0) {
    return "—";
  }
  if (state.kind === "x01") {
    return (((startScore - state.score) / stats.darts) * 3).toFixed(1);
  }
  return ((stats.marks / stats.darts) * 3).toFixed(1);
}

/* Renders a closing-mark pip for a single cricket number. */
function MarksPips({ count }: { count: number }) {
  return (
    <span className={styles.pips} data-closed={count >= 3 ? "true" : "false"}>
      <span className={styles.pip} data-on={count >= 1 ? "true" : "false"} />
      <span className={styles.pip} data-on={count >= 2 ? "true" : "false"} />
      <span className={styles.pip} data-on={count >= 3 ? "true" : "false"} />
    </span>
  );
}

/* Scoreboard card showing one player's score or cricket marks. */
export function PlayerScoreCard({
  player,
  state,
  stats,
  legsWon,
  showLegs,
  startScore,
  rank,
  showRank,
  isCurrent,
  isWinner,
}: PlayerScoreCardProps) {
  const statLabel = state.kind === "x01" ? "Moy. /3" : "MPR";
  return (
    <article
      className={styles.card}
      data-current={isCurrent ? "true" : "false"}
      data-winner={isWinner ? "true" : "false"}
    >
      <header className={styles.head}>
        {showRank && !isWinner && (
          <span className={styles.rank} data-lead={rank === 1 ? "true" : "false"}>
            {RANK_LABEL[rank] ?? `${rank}e`}
          </span>
        )}
        <span className={styles.name}>{player.name}</span>
        {showLegs && <span className={styles.legs}><IconTrophy style={{ fontSize: "0.85em" }} /> {legsWon}</span>}
        {isWinner && <span className={styles.badge}>Gagné</span>}
        {!isWinner && isCurrent && <span className={styles.turn}>à toi</span>}
      </header>

      {state.kind === "x01" ? (
        <div className={styles.score}>
          {state.score}
          {!state.opened && <span className={styles.locked}>fermé</span>}
        </div>
      ) : (
        <div className={styles.cricket}>
          <div className={styles.marks}>
            {CRICKET_NUMBERS.map((number) => (
              <div key={number} className={styles.markRow}>
                <span className={styles.markNum}>
                  {number === 25 ? "B" : number}
                </span>
                <MarksPips count={state.marks[number]} />
              </div>
            ))}
          </div>
          <div className={styles.cricketScore}>
            <span className={styles.cricketScoreLabel}>Points</span>
            <span className={styles.cricketScoreValue}>{state.score}</span>
          </div>
        </div>
      )}

      {stats && (
        <div className={styles.stats}>
          <span className={styles.stat}>
            <span className={styles.statLabel}>{statLabel}</span>
            <span className={styles.statValue}>
              {formatStat(state, stats, startScore)}
            </span>
          </span>
          <span className={styles.stat}>
            <span className={styles.statLabel}>Dernier</span>
            <span className={styles.statValue}>{stats.lastVisit || "—"}</span>
          </span>
          <span className={styles.stat}>
            <span className={styles.statLabel}>Best</span>
            <span className={styles.statValue}>{stats.bestVisit || "—"}</span>
          </span>
        </div>
      )}
    </article>
  );
}
