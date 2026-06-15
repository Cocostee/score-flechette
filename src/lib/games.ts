import type { GameState } from "@/interfaces";
import { summarizeGame } from "@/utils/gameSummary";
import { getSupabase } from "@/lib/supabase";

/* Writes a finished match and its per-player rows to Supabase. */
export async function recordGame(
  userId: string,
  state: GameState,
): Promise<boolean> {
  const supabase = getSupabase();
  if (!supabase) {
    return false;
  }

  const summary = summarizeGame(state);

  const { data: game, error } = await supabase
    .from("games")
    .insert({
      owner_id: userId,
      mode: summary.mode,
      rules: summary.rules,
      legs_target: summary.legsTarget,
      winner_player_id: summary.winnerProfileId,
    })
    .select("id")
    .single();

  if (error || !game) {
    return false;
  }

  const rows = summary.players.map((player) => ({
    game_id: game.id,
    owner_id: userId,
    player_id: player.profileId,
    guest_name: player.profileId ? null : player.name,
    placement: player.placement,
    legs_won: player.legsWon,
    darts: player.darts,
    points_scored: player.points,
    best_visit: player.bestVisit,
    avg3: player.avg3,
    marks: player.marks,
  }));

  const { error: rowsError } = await supabase
    .from("game_players")
    .insert(rows);

  return !rowsError;
}
