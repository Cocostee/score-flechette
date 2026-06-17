import type { GameMode, GameStatRow } from "@/interfaces";
import { getSupabase } from "@/lib/supabase";

interface RawRow {
  game_id: string;
  player_id: string | null;
  user_id: string | null;
  guest_name: string | null;
  placement: number | null;
  legs_won: number | null;
  darts: number | null;
  points_scored: number | null;
  best_visit: number | null;
  avg3: number | null;
  marks: number | null;
  games: { mode: string; created_at: string } | null;
}

/* Fetches every recorded participation row for the signed-in account. */
export async function fetchStatRows(userId: string): Promise<GameStatRow[]> {
  const supabase = getSupabase();
  if (!supabase) {
    return [];
  }
  const { data, error } = await supabase
    .from("game_players")
    .select(
      "game_id, player_id, user_id, guest_name, placement, legs_won, darts, points_scored, best_visit, avg3, marks, games(mode, created_at)",
    )
    .or(`owner_id.eq.${userId},user_id.eq.${userId}`)
    .limit(2000);

  if (error || !data) {
    return [];
  }

  return (data as unknown as RawRow[])
    .filter((row) => row.games !== null)
    .map((row) => ({
      gameId: row.game_id,
      playerId: row.player_id,
      userId: row.user_id,
      guestName: row.guest_name,
      placement: row.placement ?? 0,
      legsWon: row.legs_won ?? 0,
      darts: row.darts ?? 0,
      pointsScored: row.points_scored ?? 0,
      bestVisit: row.best_visit ?? 0,
      avg3: row.avg3 ?? 0,
      marks: row.marks ?? 0,
      mode: (row.games?.mode ?? "x01") as GameMode,
      createdAt: row.games?.created_at ?? "",
    }));
}

interface FriendStatRpcRow {
  placement: number | null;
  avg3: number | null;
  points_scored: number | null;
  best_visit: number | null;
  marks: number | null;
  mode: string;
  created_at: string;
}

/* Fetches a friend's recorded games via the secured RPC (accepted friends only). */
export async function fetchFriendStatRows(
  targetId: string,
): Promise<GameStatRow[]> {
  const supabase = getSupabase();
  if (!supabase) {
    return [];
  }
  const { data, error } = await supabase.rpc("friend_stat_rows", {
    target: targetId,
  });
  if (error || !data) {
    return [];
  }
  return (data as FriendStatRpcRow[]).map((row) => ({
    gameId: "",
    playerId: null,
    userId: targetId,
    guestName: null,
    placement: row.placement ?? 0,
    legsWon: 0,
    darts: 0,
    pointsScored: row.points_scored ?? 0,
    bestVisit: row.best_visit ?? 0,
    avg3: row.avg3 ?? 0,
    marks: row.marks ?? 0,
    mode: (row.mode ?? "x01") as GameMode,
    createdAt: row.created_at ?? "",
  }));
}
