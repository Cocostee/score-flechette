"use client";

import type { Player, PlayerGameState } from "@/interfaces";
import { CRICKET_NUMBERS } from "@/utils/cricket";
import styles from "./PlayerScoreCard.module.css";

interface PlayerScoreCardProps {
  player: Player;
  state: PlayerGameState;
  isCurrent: boolean;
  isWinner: boolean;
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
  isCurrent,
  isWinner,
}: PlayerScoreCardProps) {
  return (
    <article
      className={styles.card}
      data-current={isCurrent ? "true" : "false"}
      data-winner={isWinner ? "true" : "false"}
    >
      <header className={styles.head}>
        <span className={styles.name}>{player.name}</span>
        {isWinner && <span className={styles.badge}>Vainqueur</span>}
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
    </article>
  );
}
