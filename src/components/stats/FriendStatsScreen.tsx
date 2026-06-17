"use client";

import { useEffect, useMemo, useState } from "react";
import type { GameStatRow } from "@/interfaces";
import { fetchFriendStatRows } from "@/lib/stats";
import { computeProfileStats } from "@/utils/profileStats";
import { getMode } from "@/data/modes";
import { AvgChart } from "./AvgChart";
import styles from "./StatsScreen.module.css";

interface FriendStatsScreenProps {
  friendId: string;
  username: string;
  avatarUrl: string | null;
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

/* Read-only statistics view for an accepted friend's account. */
export function FriendStatsScreen({
  friendId,
  username,
  avatarUrl,
  onClose,
}: FriendStatsScreenProps) {
  const [rows, setRows] = useState<GameStatRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    fetchFriendStatRows(friendId).then((data) => {
      if (active) {
        setRows(data);
        setLoading(false);
      }
    });
    return () => {
      active = false;
    };
  }, [friendId]);

  const stats = useMemo(
    () => computeProfileStats(rows, { userId: friendId }),
    [rows, friendId],
  );
  const history = useMemo(
    () =>
      [...rows]
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        .slice(0, 12),
    [rows],
  );

  return (
    <div className={styles.screen}>
      <header className={styles.top}>
        <button type="button" className={styles.back} onClick={onClose}>
          ← Retour
        </button>
        <h1 className={styles.title}>Profil</h1>
        <span className={styles.spacer} />
      </header>

      <div className={styles.profileHead}>
        <span className={styles.bigAvatar}>
          {avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={avatarUrl} alt={username} className={styles.avatarImg} />
          ) : (
            username.slice(0, 1).toUpperCase()
          )}
        </span>
        <span className={styles.profileName}>@{username}</span>
      </div>

      {loading ? (
        <p className={styles.empty}>Chargement…</p>
      ) : stats.gamesPlayed === 0 ? (
        <p className={styles.empty}>
          Aucune partie partagée enregistrée avec ce joueur pour l&apos;instant.
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
