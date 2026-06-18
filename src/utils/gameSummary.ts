import type { GameState } from "@/interfaces";
import { liveRanks } from "@/utils/ranking";

export interface GamePlayerSummary {
  profileId: string | null;
  userId: string | null;
  name: string;
  placement: number;
  legsWon: number;
  darts: number;
  points: number;
  marks: number;
  bestVisit: number;
  avg3: number;
}

export interface GameSummary {
  mode: string;
  rules: GameState["rules"] | null;
  legsTarget: number;
  winnerProfileId: string | null;
  players: GamePlayerSummary[];
}

/* Builds the persisted summary of a finished match from its final state. */
export function summarizeGame(state: GameState): GameSummary {
  const ranks = liveRanks(state);

  const players: GamePlayerSummary[] = state.players.map((player) => {
    const ps = state.states[player.id];
    const stats = state.stats[player.id];
    const darts = stats?.darts ?? 0;
    const isX01 = ps.kind === "x01";
    const points = isX01
      ? state.rules.startScore - ps.score
      : ps.kind === "cricket"
        ? ps.score
        : 0;
    const marks = isX01 ? 0 : (stats?.marks ?? 0);
    const numerator = isX01 ? points : marks;
    const avg3 = darts > 0 ? (numerator / darts) * 3 : 0;

    return {
      profileId: player.profileId ?? null,
      userId: player.friendUserId ?? null,
      name: player.name,
      placement: ranks[player.id] ?? 0,
      legsWon: state.legsWon[player.id] ?? 0,
      darts,
      points,
      marks,
      bestVisit: stats?.bestVisit ?? 0,
      avg3: Math.round(avg3 * 100) / 100,
    };
  });

  const winner = state.players.find((p) => p.id === state.winnerId);

  return {
    mode: state.mode,
    rules: state.mode === "x01" ? state.rules : null,
    legsTarget: state.legsTarget,
    winnerProfileId: winner?.profileId ?? null,
    players,
  };
}
