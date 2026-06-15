import type { GameStatRow, ProfileStats } from "@/interfaces";

/* Aggregates a profile's recorded rows into displayable statistics. */
export function computeProfileStats(
  rows: GameStatRow[],
  profileId: string,
): ProfileStats {
  const mine = rows
    .filter((row) => row.playerId === profileId)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));

  const gamesPlayed = mine.length;
  const wins = mine.filter((row) => row.placement === 1).length;
  const bestVisit = mine.reduce((max, row) => Math.max(max, row.bestVisit), 0);
  const bestAvg = mine.reduce((max, row) => Math.max(max, row.avg3), 0);

  const byModeTotals: Record<string, { sum: number; count: number }> = {};
  for (const row of mine) {
    const bucket = byModeTotals[row.mode] ?? { sum: 0, count: 0 };
    bucket.sum += row.avg3;
    bucket.count += 1;
    byModeTotals[row.mode] = bucket;
  }
  const avgByMode: Record<string, number> = {};
  for (const mode of Object.keys(byModeTotals)) {
    const bucket = byModeTotals[mode];
    avgByMode[mode] =
      bucket.count > 0
        ? Math.round((bucket.sum / bucket.count) * 10) / 10
        : 0;
  }

  return {
    gamesPlayed,
    wins,
    winRate: gamesPlayed > 0 ? Math.round((wins / gamesPlayed) * 100) : 0,
    bestVisit,
    bestAvg: Math.round(bestAvg * 10) / 10,
    avgByMode,
    series: mine.map((row) => ({
      date: row.createdAt,
      avg3: row.avg3,
      mode: row.mode,
      won: row.placement === 1,
    })),
  };
}
