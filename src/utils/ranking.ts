import type { GameState } from "@/interfaces";
import { allClosed } from "@/utils/cricket";
import { atcProgress } from "@/utils/aroundClock";

/* Scores a player for ranking; higher is better in every mode. */
function metric(state: GameState, playerId: string): number {
  if (state.legsTarget > 1) {
    return state.legsWon[playerId] ?? 0;
  }
  const ps = state.states[playerId];
  if (ps.kind === "x01") {
    return -ps.score;
  }
  if (ps.kind === "aroundclock") {
    return atcProgress(ps);
  }
  const closedBonus = allClosed(ps) ? 1000 : 0;
  return state.mode === "cutthroat"
    ? closedBonus - ps.score
    : closedBonus + ps.score;
}

/* Returns each player's live 1-based rank, sharing ties. */
export function liveRanks(state: GameState): Record<string, number> {
  const ordered = [...state.players].sort(
    (a, b) => metric(state, b.id) - metric(state, a.id),
  );
  const ranks: Record<string, number> = {};
  ordered.forEach((player, index) => {
    if (
      index > 0 &&
      metric(state, player.id) === metric(state, ordered[index - 1].id)
    ) {
      ranks[player.id] = ranks[ordered[index - 1].id];
    } else {
      ranks[player.id] = index + 1;
    }
  });
  return ranks;
}
