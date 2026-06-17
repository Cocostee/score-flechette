import type { GameStatRow, HeadToHead } from "@/interfaces";
import type { StatsMatch } from "@/utils/profileStats";

/* Identifies a row's player as a stable key, or null when anonymous. */
function rowKey(row: GameStatRow): string | null {
  if (row.userId) {
    return `u:${row.userId}`;
  }
  if (row.playerId) {
    return `p:${row.playerId}`;
  }
  if (row.guestName) {
    return `g:${row.guestName}`;
  }
  return null;
}

/* Computes win/loss records of one player against every co-participant. */
export function computeHeadToHead(
  rows: GameStatRow[],
  self: StatsMatch,
  names: Record<string, string>,
): HeadToHead[] {
  const isSelf = (row: GameStatRow) =>
    self.userId ? row.userId === self.userId : row.playerId === self.profileId;

  const byGame = new Map<string, GameStatRow[]>();
  for (const row of rows) {
    const list = byGame.get(row.gameId);
    if (list) {
      list.push(row);
    } else {
      byGame.set(row.gameId, [row]);
    }
  }

  const tally = new Map<string, HeadToHead>();
  for (const gameRows of byGame.values()) {
    const me = gameRows.find(isSelf);
    if (!me) {
      continue;
    }
    for (const other of gameRows) {
      if (other === me) {
        continue;
      }
      const key = rowKey(other);
      if (!key) {
        continue;
      }
      const name = other.userId
        ? (names[other.userId] ?? "Joueur")
        : other.playerId
          ? (names[other.playerId] ?? "Joueur")
          : (other.guestName ?? "Invité");
      const entry = tally.get(key) ?? {
        key,
        name,
        wins: 0,
        losses: 0,
        games: 0,
      };
      entry.games += 1;
      if (me.placement < other.placement) {
        entry.wins += 1;
      } else if (me.placement > other.placement) {
        entry.losses += 1;
      }
      tally.set(key, entry);
    }
  }

  return [...tally.values()].sort((a, b) => b.games - a.games);
}
