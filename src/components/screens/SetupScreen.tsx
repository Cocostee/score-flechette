"use client";

import { useState } from "react";
import type {
  Player,
  X01InOption,
  X01OutOption,
  X01Rules,
} from "@/interfaces";
import type { DartsGame } from "@/hooks/useDartsGame";
import { getMode, X01_START_SCORES } from "@/data/modes";
import styles from "./SetupScreen.module.css";

interface SetupScreenProps {
  game: DartsGame;
}

const MAX_PLAYERS = 6;
const MIN_PLAYERS = 1;

/* Creates a fresh empty player slot. */
function emptyPlayer(): Player {
  return { id: crypto.randomUUID(), name: "" };
}

/* Configuration screen: players, names and 01 rule options. */
export function SetupScreen({ game }: SetupScreenProps) {
  const mode = game.state.mode;
  const info = getMode(mode);
  const [players, setPlayers] = useState<Player[]>([
    { id: crypto.randomUUID(), name: "" },
    { id: crypto.randomUUID(), name: "" },
  ]);
  const [rules, setRules] = useState<X01Rules>(game.state.rules);

  const isX01 = mode === "x01";

  const rename = (id: string, name: string) =>
    setPlayers((list) =>
      list.map((player) => (player.id === id ? { ...player, name } : player)),
    );

  const addPlayer = () =>
    setPlayers((list) =>
      list.length >= MAX_PLAYERS ? list : [...list, emptyPlayer()],
    );

  const removePlayer = (id: string) =>
    setPlayers((list) =>
      list.length <= MIN_PLAYERS
        ? list
        : list.filter((player) => player.id !== id),
    );

  const launch = () => {
    const named = players.map((player, index) => ({
      id: player.id,
      name: player.name.trim() || `Joueur ${index + 1}`,
    }));
    game.startGame({ mode, rules, players: named });
  };

  return (
    <div className={styles.screen}>
      <header className={styles.top}>
        <button type="button" className={styles.back} onClick={game.goHome}>
          ← Retour
        </button>
        <div className={styles.modeTag}>
          <span className={styles.modeKicker}>Mode</span>
          <span className={styles.modeName}>{info.name}</span>
        </div>
      </header>

      <section className={styles.block}>
        <div className={styles.blockHead}>
          <h2 className={styles.blockTitle}>Joueurs</h2>
          <span className={styles.count}>{players.length}</span>
        </div>
        <div className={styles.players}>
          {players.map((player, index) => (
            <div key={player.id} className={styles.playerRow}>
              <span className={styles.playerIndex}>{index + 1}</span>
              <input
                className={styles.input}
                value={player.name}
                placeholder={`Joueur ${index + 1}`}
                maxLength={14}
                onChange={(event) => rename(player.id, event.target.value)}
              />
              <button
                type="button"
                className={styles.remove}
                aria-label="Retirer"
                disabled={players.length <= MIN_PLAYERS}
                onClick={() => removePlayer(player.id)}
              >
                −
              </button>
            </div>
          ))}
        </div>
        <button
          type="button"
          className={styles.add}
          disabled={players.length >= MAX_PLAYERS}
          onClick={addPlayer}
        >
          + Ajouter un joueur
        </button>
      </section>

      {isX01 && (
        <section className={styles.block}>
          <h2 className={styles.blockTitle}>Options 01</h2>

          <p className={styles.optionLabel}>Score de départ</p>
          <div className={styles.segment}>
            {X01_START_SCORES.map((score) => (
              <button
                key={score}
                type="button"
                className={`${styles.segBtn} ${
                  rules.startScore === score ? styles.segOn : ""
                }`}
                onClick={() => setRules((r) => ({ ...r, startScore: score }))}
              >
                {score}
              </button>
            ))}
          </div>

          <p className={styles.optionLabel}>Ouverture (In)</p>
          <div className={styles.segment}>
            {(["open", "double"] as X01InOption[]).map((option) => (
              <button
                key={option}
                type="button"
                className={`${styles.segBtn} ${
                  rules.inOption === option ? styles.segOn : ""
                }`}
                onClick={() => setRules((r) => ({ ...r, inOption: option }))}
              >
                {option === "open" ? "Open In" : "Double In"}
              </button>
            ))}
          </div>

          <p className={styles.optionLabel}>Fermeture (Out)</p>
          <div className={styles.segment}>
            {(["open", "double", "master"] as X01OutOption[]).map((option) => (
              <button
                key={option}
                type="button"
                className={`${styles.segBtn} ${
                  rules.outOption === option ? styles.segOn : ""
                }`}
                onClick={() => setRules((r) => ({ ...r, outOption: option }))}
              >
                {option === "open"
                  ? "Open Out"
                  : option === "double"
                    ? "Double Out"
                    : "Master Out"}
              </button>
            ))}
          </div>
        </section>
      )}

      <button type="button" className={styles.launch} onClick={launch}>
        Lancer la partie
      </button>
    </div>
  );
}
