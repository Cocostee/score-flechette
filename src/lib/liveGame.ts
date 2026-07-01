import type { GameState } from "@/interfaces";
import { getSupabase } from "@/lib/supabase";

// L'état publié est stripPast(state) : un GameState complet avec past vidé ([]).
export type LiveState = GameState;

export interface LiveGame {
  hostId: string;
  hostUsername: string;
  state: LiveState;
  status: "live" | "ended";
}

interface LiveRow {
  host_id: string;
  state: LiveState;
  status: string;
  updated_at: string;
}

/* Publie (upsert) l'état courant de la partie de l'hôte. */
export async function pushLiveState(
  hostId: string,
  state: LiveState,
): Promise<void> {
  const supabase = getSupabase();
  if (!supabase) {
    return;
  }
  await supabase
    .from("live_games")
    .upsert(
      { host_id: hostId, state, status: "live", updated_at: new Date().toISOString() },
      { onConflict: "host_id" },
    );
}

/* Marque la partie live de l'hôte comme terminée (garde le dernier état). */
export async function endLiveGame(hostId: string): Promise<void> {
  const supabase = getSupabase();
  if (!supabase) {
    return;
  }
  await supabase
    .from("live_games")
    .update({ status: "ended", updated_at: new Date().toISOString() })
    .eq("host_id", hostId);
}

/* Liste les parties live récentes (< 30 min) lisibles par le spectateur,
   pseudo de l'hôte résolu via profiles. La RLS restreint aux amis acceptés. */
export async function listLiveForViewer(viewerId: string): Promise<LiveGame[]> {
  const supabase = getSupabase();
  if (!supabase || !viewerId) {
    return [];
  }
  const cutoff = new Date(Date.now() - 30 * 60 * 1000).toISOString();
  const { data } = await supabase
    .from("live_games")
    .select("host_id, state, status, updated_at")
    .eq("status", "live")
    .gt("updated_at", cutoff)
    .order("updated_at", { ascending: false });
  const rows = (data as LiveRow[] | null) ?? [];
  const hostRows = rows.filter((r) => r.host_id !== viewerId);
  if (hostRows.length === 0) {
    return [];
  }
  const hostIds = [...new Set(hostRows.map((r) => r.host_id))];
  const { data: profs } = await supabase
    .from("profiles")
    .select("id, username")
    .in("id", hostIds);
  const names = new Map(
    ((profs as { id: string; username: string }[] | null) ?? []).map((p) => [
      p.id,
      p.username,
    ]),
  );
  return hostRows.map((r) => ({
    hostId: r.host_id,
    hostUsername: names.get(r.host_id) ?? "?",
    state: r.state,
    status: r.status as "live" | "ended",
  }));
}

/* Écoute globale des changements live_games. Le payload est volontairement
   ignoré : on ne fait que déclencher un re-fetch via listLiveForViewer, qui est
   protégé par la RLS (REST). Donc même si Realtime notifiait une ligne non
   lisible, aucune donnée ne fuite — au pire un re-fetch superflu. Le nom de
   canal inclut le viewerId pour éviter toute collision multi-montage. */
export function subscribeLiveForViewer(
  viewerId: string,
  onChange: () => void,
): () => void {
  const supabase = getSupabase();
  if (!supabase) {
    return () => {};
  }
  const channel = supabase
    .channel(`live_games:viewer:${viewerId}`)
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "live_games" },
      () => onChange(),
    )
    .subscribe();
  return () => {
    void supabase.removeChannel(channel);
  };
}

/* Écoute d'une partie précise (celle regardée) : chaque mise à jour renvoie
   le nouvel état + statut. */
export function subscribeLiveRow(
  hostId: string,
  onChange: (row: { state: LiveState; status: "live" | "ended" } | null) => void,
): () => void {
  const supabase = getSupabase();
  if (!supabase) {
    return () => {};
  }
  const channel = supabase
    .channel(`live_games:row:${hostId}`)
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "live_games",
        filter: `host_id=eq.${hostId}`,
      },
      (payload) => {
        const row = (payload.new ?? payload.old) as Partial<LiveRow> | undefined;
        if (!row || !row.state || !row.status) {
          onChange(null);
          return;
        }
        onChange({ state: row.state, status: row.status as "live" | "ended" });
      },
    )
    .subscribe();
  return () => {
    void supabase.removeChannel(channel);
  };
}
