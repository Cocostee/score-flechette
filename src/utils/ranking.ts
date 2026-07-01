import type { GameState } from "@/interfaces";
import { allClosed } from "@/utils/cricket";
import { atcProgress } from "@/utils/aroundClock";

/* The scoring sides of a game: team ids in team mode, player ids in solo. */
function sideIds(state: GameState): string[] {
  return state.teams ? state.teams.map((t) => t.id) : state.players.map((p) => p.id);
}

/* Scores a side for ranking; higher is better in every mode. */
function metric(state: GameState, sideId: string): number {
  if (state.legsTarget > 1) {
    return state.legsWon[sideId] ?? 0;
  }
  const ps = state.states[sideId];
  if (!ps) {
    return 0;
  }
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

/* Returns each side's live 1-based rank, sharing ties. Keyed by sideId. */
export function liveRanks(state: GameState): Record<string, number> {
  const ordered = [...sideIds(state)].sort(
    (a, b) => metric(state, b) - metric(state, a),
  );
  const ranks: Record<string, number> = {};
  ordered.forEach((sideId, index) => {
    if (index > 0 && metric(state, sideId) === metric(state, ordered[index - 1])) {
      ranks[sideId] = ranks[ordered[index - 1]];
    } else {
      ranks[sideId] = index + 1;
    }
  });
  return ranks;
}
