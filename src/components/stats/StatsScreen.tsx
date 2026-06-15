"use client";

import { useEffect, useMemo, useState } from "react";
import type { GameStatRow, TrackedPlayer } from "@/interfaces";
import { fetchStatRows } from "@/lib/stats";
import { computeProfileStats, type StatsMatch } from "@/utils/profileStats";
import { useSocial } from "@/hooks/useSocial";
import { getMode } from "@/data/modes";
import { AvgChart } from "./AvgChart";
import styles from "./StatsScreen.module.css";

interface StatsScreenProps {
  userId: string;
  profiles: TrackedPlayer[];
  onClose: () => void;
}

interface StatsTab {
  id: string;
  label: string;
  match: StatsMatch;
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

/* Tells whether a row belongs to the selected tab's player or account. */
function matches(row: GameStatRow, match: StatsMatch): boolean {
  return match.userId
    ? row.userId === match.userId
    : row.playerId === match.profileId;
}

/* Full-screen statistics view for the account and its tracked profiles. */
export function StatsScreen({ userId, profiles, onClose }: StatsScreenProps) {
  const social = useSocial(userId);
  const [rows, setRows] = useState<GameStatRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState("me");

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

  const tabs: StatsTab[] = useMemo(
    () => [
      { id: "me", label: social.username ? `@${social.username}` : "Moi", match: { userId } },
      ...profiles.map((profile) => ({
        id: profile.id,
        label: profile.name,
        match: { profileId: profile.id },
      })),
    ],
    [profiles, social.username, userId],
  );

  const activeTab = tabs.find((tab) => tab.id === selected) ?? tabs[0];
  const stats = useMemo(
    () => computeProfileStats(rows, activeTab.match),
    [rows, activeTab.match],
  );
  const history = useMemo(
    () =>
      rows
        .filter((row) => matches(row, activeTab.match))
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        .slice(0, 12),
    [rows, activeTab.match],
  );

  return (
    <div className={styles.screen}>
      <header className={styles.top}>
        <button type="button" className={styles.back} onClick={onClose}>
          ← Retour
        </button>
        <h1 className={styles.title}>Stats</h1>
        <span className={styles.spacer} />
      </header>

      <div className={styles.tabs}>
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            className={styles.tab}
            data-on={tab.id === activeTab.id ? "true" : "false"}
            onClick={() => setSelected(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {loading ? (
        <p className={styles.empty}>Chargement…</p>
      ) : stats.gamesPlayed === 0 ? (
        <p className={styles.empty}>
          Aucune partie enregistrée ici. Lance une partie en sélectionnant ce
          joueur !
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
    </div>
  );
}
