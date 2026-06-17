"use client";

import { useEffect, useMemo, useState } from "react";
import type { GameStatRow, TrackedPlayer } from "@/interfaces";
import { fetchStatRows } from "@/lib/stats";
import { computeProfileStats, type StatsMatch } from "@/utils/profileStats";
import { computeHeadToHead } from "@/utils/headToHead";
import { useSocial } from "@/hooks/useSocial";
import { StatsBody } from "./StatsBody";
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

  const names = useMemo(() => {
    const map: Record<string, string> = {
      [userId]: social.username ? `@${social.username}` : "Moi",
    };
    for (const profile of profiles) {
      map[profile.id] = profile.name;
    }
    for (const friend of social.friends) {
      map[friend.userId] = `@${friend.username}`;
    }
    return map;
  }, [userId, social.username, social.friends, profiles]);

  const tabs: StatsTab[] = useMemo(
    () => [
      {
        id: "me",
        label: social.username ? `@${social.username}` : "Moi",
        match: { userId },
      },
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
  const headToHead = useMemo(
    () => computeHeadToHead(rows, activeTab.match, names),
    [rows, activeTab.match, names],
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
        <StatsBody stats={stats} history={history} headToHead={headToHead} />
      )}
    </div>
  );
}
