"use client";

import { useEffect, useMemo, useState } from "react";
import type { GameStatRow, TrackedPlayer } from "@/interfaces";
import { fetchStatRows } from "@/lib/stats";
import { computeProfileStats } from "@/utils/profileStats";
import { getMode } from "@/data/modes";
import { AvgChart } from "./AvgChart";
import styles from "./StatsScreen.module.css";

interface StatsScreenProps {
  userId: string;
  profiles: TrackedPlayer[];
  onClose: () => void;
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

/* Full-screen statistics view for the account's tracked profiles. */
export function StatsScreen({ userId, profiles, onClose }: StatsScreenProps) {
  const [rows, setRows] = useState<GameStatRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    fetchStatRows(userId).then((data) => {
      if (active) {
        setRows(data);
        setLoading(false);
      }
    });
    return () => {
      active = false;
    };
  }, [userId]);

  const activeId = selected ?? profiles[0]?.id ?? null;
  const stats = useMemo(
    () => (activeId ? computeProfileStats(rows, activeId) : null),
    [rows, activeId],
  );

  const history = useMemo(() => {
    if (!activeId) {
      return [];
    }
    return rows
      .filter((row) => row.playerId === activeId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, 12);
  }, [rows, activeId]);

  return (
    <div className={styles.screen}>
      <header className={styles.top}>
        <button type="button" className={styles.back} onClick={onClose}>
          ← Retour
        </button>
        <h1 className={styles.title}>Stats</h1>
        <span className={styles.spacer} />
      </header>

      {profiles.length === 0 ? (
        <p className={styles.empty}>
          Ajoute des joueurs dans ton compte, puis joue des parties pour voir
          apparaître les statistiques.
        </p>
      ) : (
        <>
          <div className={styles.tabs}>
            {profiles.map((profile) => (
              <button
                key={profile.id}
                type="button"
                className={styles.tab}
                data-on={profile.id === activeId ? "true" : "false"}
                onClick={() => setSelected(profile.id)}
              >
                {profile.name}
              </button>
            ))}
          </div>

          {loading ? (
            <p className={styles.empty}>Chargement…</p>
          ) : !stats || stats.gamesPlayed === 0 ? (
            <p className={styles.empty}>
              Aucune partie enregistrée pour ce joueur. Lance une partie en le
              sélectionnant !
            </p>
          ) : (
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
                <div className={styles.card}>
                  <span className={styles.cardValue}>{stats.bestAvg}</span>
                  <span className={styles.cardLabel}>Meilleure moy.</span>
                </div>
                <div className={styles.card}>
                  <span className={styles.cardValue}>{stats.bestVisit}</span>
                  <span className={styles.cardLabel}>Meilleur tour</span>
                </div>
              </div>

              <section className={styles.block}>
                <h2 className={styles.blockTitle}>Moyenne /3 dans le temps</h2>
                <AvgChart series={stats.series} />
              </section>

              <section className={styles.block}>
                <h2 className={styles.blockTitle}>Historique</h2>
                <div className={styles.history}>
                  {history.map((row, index) => (
                    <div key={index} className={styles.historyRow}>
                      <span className={styles.histDate}>
                        {shortDate(row.createdAt)}
                      </span>
                      <span className={styles.histMode}>
                        {getMode(row.mode).name}
                      </span>
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
            </>
          )}
        </>
      )}
    </div>
  );
}
