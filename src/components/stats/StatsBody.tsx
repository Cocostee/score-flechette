"use client";

import type { GameStatRow, HeadToHead, ProfileStats } from "@/interfaces";
import { getMode } from "@/data/modes";
import { AvgChart } from "./AvgChart";
import styles from "./StatsScreen.module.css";

interface StatsBodyProps {
  stats: ProfileStats;
  history: GameStatRow[];
  headToHead?: HeadToHead[];
}

/* Formats an ISO date as a short French day label. */
function shortDate(iso: string): string {
  if (!iso) {
    return "";
  }
  return new Date(iso).toLocaleDateString("fr-FR", {
    day: "2-digit",
    month: "short",
  });
}

/* Shared statistics layout: cards, charts, rivalries and history. */
export function StatsBody({ stats, history, headToHead }: StatsBodyProps) {
  const total = Math.max(stats.gamesPlayed, 1);
  const modeKeys = Object.keys(stats.modeCounts);
  const rivals = (headToHead ?? []).filter((h) => h.games > 0).slice(0, 6);

  return (
    <>
      <div className={styles.cards}>
        <div className={styles.card}>
          <span className={styles.cardValue}>{stats.gamesPlayed}</span>
          <span className={styles.cardLabel}>Parties</span>
        </div>
        <div className={styles.card}>
          <span className={styles.cardValue}>
            {stats.wins}
            <span className={styles.cardPct}>· {stats.winRate}%</span>
          </span>
          <span className={styles.cardLabel}>Victoires</span>
        </div>
        {stats.x01Count > 0 && (
          <div className={styles.card}>
            <span className={styles.cardValue}>{stats.avgThreeDart}</span>
            <span className={styles.cardLabel}>Moyenne /3</span>
          </div>
        )}
        {stats.x01Count > 0 && (
          <div className={styles.card}>
            <span className={styles.cardValue}>{stats.ppd}</span>
            <span className={styles.cardLabel}>PPD</span>
          </div>
        )}
        {stats.cricketCount > 0 && (
          <div className={styles.card}>
            <span className={styles.cardValue}>{stats.mpr}</span>
            <span className={styles.cardLabel}>MPR</span>
          </div>
        )}
        <div className={styles.card}>
          <span className={styles.cardValue}>{stats.bestVisit}</span>
          <span className={styles.cardLabel}>Meilleur score</span>
        </div>
      </div>

      <section className={styles.block}>
        <h2 className={styles.blockTitle}>Bilan</h2>
        <div className={styles.wlBar}>
          <div
            className={styles.wlWin}
            style={{ width: `${(stats.wins / total) * 100}%` }}
          />
          <div
            className={styles.wlLoss}
            style={{ width: `${(stats.losses / total) * 100}%` }}
          />
        </div>
        <div className={styles.wlLegend}>
          <span className={styles.wlWinTxt}>{stats.wins} V</span>
          <span className={styles.wlLossTxt}>{stats.losses} D</span>
        </div>
      </section>

      {stats.x01Count > 1 && (
        <section className={styles.block}>
          <h2 className={styles.blockTitle}>Moyenne /3 dans le temps</h2>
          <AvgChart series={stats.series.filter((s) => s.mode === "x01")} />
        </section>
      )}

      {modeKeys.length > 0 && (
        <section className={styles.block}>
          <h2 className={styles.blockTitle}>Par mode</h2>
          <div className={styles.modeList}>
            {modeKeys.map((mode) => {
              const count = stats.modeCounts[mode];
              return (
                <div key={mode} className={styles.modeRow}>
                  <span className={styles.modeName}>
                    {getMode(mode as GameStatRow["mode"]).name}
                  </span>
                  <div className={styles.modeTrack}>
                    <div
                      className={styles.modeFill}
                      style={{ width: `${(count / total) * 100}%` }}
                    />
                  </div>
                  <span className={styles.modeCount}>{count}</span>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {rivals.length > 0 && (
        <section className={styles.block}>
          <h2 className={styles.blockTitle}>Rivalités</h2>
          <div className={styles.history}>
            {rivals.map((rival) => (
              <div key={rival.key} className={styles.rivalRow}>
                <span className={styles.rivalName}>{rival.name}</span>
                <span className={styles.rivalRecord}>
                  <span className={styles.wlWinTxt}>{rival.wins}V</span>
                  {" - "}
                  <span className={styles.wlLossTxt}>{rival.losses}D</span>
                </span>
              </div>
            ))}
          </div>
        </section>
      )}

      {history.length > 0 && (
        <section className={styles.block}>
          <h2 className={styles.blockTitle}>Historique</h2>
          <div className={styles.history}>
            {history.map((row, index) => (
              <div key={index} className={styles.historyRow}>
                <span className={styles.histDate}>
                  {shortDate(row.createdAt)}
                </span>
                <span className={styles.histMode}>{getMode(row.mode).name}</span>
                <span
                  className={styles.histPlace}
                  data-win={row.placement === 1 ? "true" : "false"}
                >
                  {row.placement === 1 ? "Gagné" : `${row.placement}e`}
                </span>
                <span className={styles.histAvg}>{row.avg3}</span>
              </div>
            ))}
          </div>
        </section>
      )}
    </>
  );
}
