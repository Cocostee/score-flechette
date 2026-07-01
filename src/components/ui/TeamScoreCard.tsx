"use client";

import type {
  Player,
  PlayerGameState,
  PlayerStats,
  Team,
} from "@/interfaces";
import { ATC_SEQUENCE, atcProgress } from "@/utils/aroundClock";
import { CRICKET_NUMBERS } from "@/utils/cricket";
import styles from "./TeamScoreCard.module.css";

interface TeamScoreCardProps {
  team: Team;
  state: PlayerGameState;
  members: Player[];
  stats: Record<string, PlayerStats>;
  legsWon: number;
  showLegs: boolean;
  rank: number;
  showRank: boolean;
  isCurrentTeam: boolean;
  currentPlayerId: string | null;
  isWinner: boolean;
}

const RANK_LABEL = ["", "1ᵉʳ", "2ᵉ", "3ᵉ"];

/* Team scoreboard card: shared score at the centre, member rows below. */
export function TeamScoreCard({
  team,
  state,
  members,
  stats,
  legsWon,
  showLegs,
  rank,
  showRank,
  isCurrentTeam,
  currentPlayerId,
  isWinner,
}: TeamScoreCardProps) {
  return (
    <article
      className={styles.card}
      data-color={team.color}
      data-current={isCurrentTeam ? "true" : "false"}
      data-winner={isWinner ? "true" : "false"}
    >
      <header className={styles.head}>
        {showRank && !isWinner && (
          <span className={styles.rank} data-lead={rank === 1 ? "true" : "false"}>
            {RANK_LABEL[rank] ?? `${rank}e`}
          </span>
        )}
        <span className={styles.name}>{team.name}</span>
        {showLegs && <span className={styles.legs}>{legsWon}</span>}
        {isWinner && <span className={styles.badge}>Gagné</span>}
      </header>

      {state.kind === "x01" ? (
        <div className={styles.score}>
          {state.score}
          {!state.opened && <span className={styles.locked}>fermé</span>}
        </div>
      ) : state.kind === "aroundclock" ? (
        <div className={styles.score}>
          {state.target === 0
            ? "✓"
            : state.target === 25
              ? "Bull"
              : state.target}
          <span className={styles.atcFraction}>
            {atcProgress(state)}/{ATC_SEQUENCE.length}
          </span>
        </div>
      ) : (
        <div className={styles.cricket}>
          {CRICKET_NUMBERS.map((number) => (
            <div key={number} className={styles.markRow}>
              <span className={styles.markNum}>
                {number === 25 ? "B" : number}
              </span>
              <span className={styles.pips} data-closed={state.marks[number] >= 3 ? "true" : "false"}>
                <span className={styles.pip} data-on={state.marks[number] >= 1 ? "true" : "false"} />
                <span className={styles.pip} data-on={state.marks[number] >= 2 ? "true" : "false"} />
                <span className={styles.pip} data-on={state.marks[number] >= 3 ? "true" : "false"} />
              </span>
            </div>
          ))}
          <div className={styles.cricketScore}>
            <span className={styles.cricketScoreLabel}>Points</span>
            <span className={styles.cricketScoreValue}>{state.score}</span>
          </div>
        </div>
      )}

      <div className={styles.members}>
        {members.map((member) => {
          const ms = stats[member.id];
          return (
            <div
              key={member.id}
              className={styles.memberRow}
              data-throwing={member.id === currentPlayerId ? "true" : "false"}
            >
              <span className={styles.memberName}>{member.name}</span>
              <span className={styles.memberStat}>
                {ms && ms.darts > 0 ? `${ms.lastVisit}` : "—"}
              </span>
            </div>
          );
        })}
      </div>
    </article>
  );
}
