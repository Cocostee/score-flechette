"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import type { GameStatRow } from "@/interfaces";
import { fetchFriendStatRows, fetchStatRows } from "@/lib/stats";
import { computeProfileStats } from "@/utils/profileStats";
import { computeHeadToHead } from "@/utils/headToHead";
import { StatsBody } from "./StatsBody";
import styles from "./StatsScreen.module.css";

interface FriendStatsScreenProps {
  viewerId: string;
  friendId: string;
  username: string;
  avatarUrl: string | null;
  onClose: () => void;
}

/* Read-only statistics view for an accepted friend's account. */
export function FriendStatsScreen({
  viewerId,
  friendId,
  username,
  avatarUrl,
  onClose,
}: FriendStatsScreenProps) {
  const [rows, setRows] = useState<GameStatRow[]>([]);
  const [myRows, setMyRows] = useState<GameStatRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    Promise.all([fetchFriendStatRows(friendId), fetchStatRows(viewerId)]).then(
      ([friendData, mine]) => {
        if (active) {
          setRows(friendData);
          setMyRows(mine);
          setLoading(false);
        }
      },
    );
    return () => {
      active = false;
    };
  }, [friendId, viewerId]);

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
  const versus = useMemo(() => {
    const h2h = computeHeadToHead(myRows, { userId: viewerId }, {});
    return h2h.find((entry) => entry.key === `u:${friendId}`) ?? null;
  }, [myRows, viewerId, friendId]);

  if (typeof document === "undefined") {
    return null;
  }

  return createPortal(
    <div className={styles.screen} style={{ zIndex: 90 }}>
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

      {versus && versus.games > 0 && (
        <div className={styles.versus}>
          <span className={styles.versusLabel}>Face à face (toi)</span>
          <span className={styles.versusRecord}>
            <span className={styles.wlWinTxt}>{versus.wins}V</span>
            {" - "}
            <span className={styles.wlLossTxt}>{versus.losses}D</span>
          </span>
        </div>
      )}

      {loading ? (
        <p className={styles.empty}>Chargement…</p>
      ) : stats.gamesPlayed === 0 ? (
        <p className={styles.empty}>
          Aucune partie partagée enregistrée avec ce joueur pour l&apos;instant.
        </p>
      ) : (
        <StatsBody stats={stats} history={history} />
      )}
    </div>,
    document.body,
  );
}
