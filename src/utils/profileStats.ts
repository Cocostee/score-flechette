import type { GameStatRow, ProfileStats } from "@/interfaces";

export interface StatsMatch {
  profileId?: string;
  userId?: string;
}

/* Aggregates the rows matching a profile or account into statistics. */
export function computeProfileStats(
  rows: GameStatRow[],
  match: StatsMatch,
): ProfileStats {
  const mine = rows
    .filter((row) =>
      match.userId
        ? row.userId === match.userId
        : row.playerId === match.profileId,
    )
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));

  const gamesPlayed = mine.length;
  const wins = mine.filter((row) => row.placement === 1).length;
  const bestVisit = mine.reduce((max, row) => Math.max(max, row.bestVisit), 0);
  const x01Rows = mine.filter((row) => row.mode === "x01");
  const cricketRows = mine.filter((row) => row.mode !== "x01");
  const bestAvg = x01Rows.reduce((max, row) => Math.max(max, row.avg3), 0);
  const mean = (rows: GameStatRow[]) =>
    rows.length === 0
      ? 0
      : rows.reduce((sum, row) => sum + row.avg3, 0) / rows.length;
  const avgThreeDart = Math.round(mean(x01Rows) * 10) / 10;
  const mpr = Math.round(mean(cricketRows) * 100) / 100;
  const modeCounts: Record<string, number> = {};
  for (const row of mine) {
    modeCounts[row.mode] = (modeCounts[row.mode] ?? 0) + 1;
  }

  return {
    gamesPlayed,
    wins,
    losses: gamesPlayed - wins,
    winRate: gamesPlayed > 0 ? Math.round((wins / gamesPlayed) * 100) : 0,
    bestVisit,
    bestAvg: Math.round(bestAvg * 10) / 10,
    avgThreeDart,
    ppd: Math.round((avgThreeDart / 3) * 100) / 100,
    mpr,
    x01Count: x01Rows.length,
    cricketCount: cricketRows.length,
    modeCounts,
    series: mine.map((row) => ({
      date: row.createdAt,
      avg3: row.avg3,
      mode: row.mode,
      won: row.placement === 1,
    })),
  };
}
