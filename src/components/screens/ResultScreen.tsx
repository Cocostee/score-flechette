"use client";

import type { Player } from "@/interfaces";
import type { DartsGame } from "@/hooks/useDartsGame";
import { getMode } from "@/data/modes";
import { allClosed } from "@/utils/cricket";
import styles from "./ResultScreen.module.css";

interface ResultScreenProps {
  game: DartsGame;
}

/* Orders players from best to worst according to the mode's scoring. */
function rankPlayers(game: DartsGame): Player[] {
  const { state } = game;
  const others = state.players.filter((p) => p.id !== state.winnerId);
  const winner = state.players.find((p) => p.id === state.winnerId);

  const sorted = [...others].sort((a, b) => {
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

/* Returns the value shown for a player in the final standings. */
function summaryValue(game: DartsGame, player: Player): string {
  const state = game.state.states[player.id];
  if (state.kind === "x01") {
    return `${state.score} restants`;
  }
  const closed = allClosed(state);
  return `${state.score} pts${closed ? " · fermé" : ""}`;
}

/* End screen: final standings with replay and home actions. */
export function ResultScreen({ game }: ResultScreenProps) {
  const info = getMode(game.state.mode);
  const ranking = rankPlayers(game);

  return (
    <div className={styles.screen}>
      <header className={styles.head}>
        <p className={styles.kicker}>{info.name}</p>
        <h1 className={styles.title}>Récapitulatif</h1>
      </header>

      <ol className={styles.list}>
        {ranking.map((player, index) => (
          <li
            key={player.id}
            className={styles.row}
            data-first={index === 0 ? "true" : "false"}
            style={{ animationDelay: `${index * 0.07}s` }}
          >
            <span className={styles.place}>{index + 1}</span>
            <span className={styles.rowName}>{player.name}</span>
            <span className={styles.rowValue}>{summaryValue(game, player)}</span>
          </li>
        ))}
      </ol>

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
