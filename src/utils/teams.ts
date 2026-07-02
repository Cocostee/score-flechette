import type { Player, Team } from "@/interfaces";

export const TEAM_COLORS = [
  "teamA",
  "teamB",
  "teamC",
  "teamD",
  "teamE",
  "teamF",
  "teamG",
  "teamH",
] as const;

const TEAM_LETTERS = ["A", "B", "C", "D", "E", "F", "G", "H"];

/* Default display label for the nth team. */
export function teamLabel(index: number): string {
  return `Équipe ${TEAM_LETTERS[index] ?? index + 1}`;
}

/* Accent-colour key for the nth team. */
export function teamColor(index: number): string {
  return TEAM_COLORS[index % TEAM_COLORS.length];
}

/* Builds the interleaved throwing order (playerIds) across teams:
   A1,B1,A2,B2,... Smaller teams cycle their members. */
export function buildOrder(teams: Team[]): string[] {
  const nonEmpty = teams.filter((t) => t.playerIds.length > 0);
  if (nonEmpty.length === 0) {
    return [];
  }
  const maxLen = Math.max(...nonEmpty.map((t) => t.playerIds.length));
  const order: string[] = [];
  for (let i = 0; i < maxLen; i += 1) {
    for (const t of nonEmpty) {
      order.push(t.playerIds[i % t.playerIds.length]);
    }
  }
  return order;
}

/* Maps each playerId to its side (team) id. */
export function buildSideOf(teams: Team[]): Record<string, string> {
  const map: Record<string, string> = {};
  for (const t of teams) {
    for (const pid of t.playerIds) {
      map[pid] = t.id;
    }
  }
  return map;
}

export interface SideSetup {
  teams: Team[] | null;
  sideIds: string[];
  sideOf: Record<string, string>;
  order: string[];
}

/* Derives the runtime side layout from teams, or players in solo mode. */
export function setupSides(
  players: Player[],
  teams: Team[] | undefined | null,
): SideSetup {
  if (teams && teams.length > 0) {
    return {
      teams,
      sideIds: teams.map((t) => t.id),
      sideOf: buildSideOf(teams),
      order: buildOrder(teams),
    };
  }
  const sideOf: Record<string, string> = {};
  for (const p of players) {
    sideOf[p.id] = p.id;
  }
  return {
    teams: null,
    sideIds: players.map((p) => p.id),
    sideOf,
    order: players.map((p) => p.id),
  };
}

/* Returns the scoring sides as Player-shaped entities (for cricket helpers
   that iterate participants by id/name). */
export function sidesAsPlayers(
  teams: Team[] | null,
  players: Player[],
): Player[] {
  if (teams) {
    return teams.map((t) => ({ id: t.id, name: t.name }));
  }
  return players;
}
