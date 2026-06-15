import type { GameMode, GameStatRow } from "@/interfaces";
import { getSupabase } from "@/lib/supabase";

interface RawRow {
  player_id: string | null;
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
      "player_id, guest_name, placement, legs_won, darts, points_scored, best_visit, avg3, marks, games(mode, created_at)",
    )
    .eq("owner_id", userId)
    .limit(1000);

  if (error || !data) {
    return [];
  }

  return (data as unknown as RawRow[])
    .filter((row) => row.games !== null)
    .map((row) => ({
      playerId: row.player_id,
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
