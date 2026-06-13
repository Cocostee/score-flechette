"use client";

import { useState } from "react";
import type { GameMode } from "@/interfaces";
import type { DartsGame } from "@/hooks/useDartsGame";
import { MODES, getMode } from "@/data/modes";
import { RulesModal } from "@/components/ui/RulesModal";
import styles from "./HomeScreen.module.css";

interface HomeScreenProps {
  game: DartsGame;
}

/* Landing screen: pick a mode, read its rules, start a game. */
export function HomeScreen({ game }: HomeScreenProps) {
  const [selected, setSelected] = useState<GameMode>("x01");
  const [rulesFor, setRulesFor] = useState<GameMode | null>(null);

  return (
    <div className={styles.screen}>
      <header className={styles.hero}>
        <p className={styles.kicker}>Compteur de fléchettes · hors-ligne</p>
        <h1 className={styles.title}>
          Sur la
          <br />
          <span className={styles.titleAccent}>Ligne</span>
        </h1>
        <p className={styles.subtitle}>
          Choisis ton jeu, ajoute les joueurs, et laisse l&apos;ardoise compter.
        </p>
      </header>

      <div className={styles.modes}>
        {MODES.map((mode) => {
          const active = selected === mode.mode;
          return (
            <article
              key={mode.mode}
              className={`${styles.card} ${active ? styles.cardActive : ""}`}
              onClick={() => setSelected(mode.mode)}
            >
              <div className={styles.cardText}>
                <h2 className={styles.cardName}>{mode.name}</h2>
                <p className={styles.cardTagline}>{mode.tagline}</p>
              </div>
              <button
                type="button"
                className={styles.info}
                aria-label={`Règles ${mode.name}`}
                onClick={(event) => {
                  event.stopPropagation();
                  setRulesFor(mode.mode);
                }}
              >
                i
              </button>
              <span
                className={styles.radio}
                data-on={active ? "true" : "false"}
              />
            </article>
          );
        })}
      </div>

      <button
        type="button"
        className={styles.start}
        onClick={() => game.openSetup(selected)}
      >
        Commencer une partie
      </button>

      {rulesFor && (
        <RulesModal info={getMode(rulesFor)} onClose={() => setRulesFor(null)} />
      )}
    </div>
  );
}
