import type { GameMode } from "@/interfaces";
import { getSupabase } from "@/lib/supabase";

export interface GameInvite {
  id: string;
  hostId: string;
  guestId: string;
  hostUsername: string;
  mode: GameMode;
  status: "pending" | "accepted" | "declined" | "cancelled";
}

export interface InviteChange {
  id: string;
  hostId: string;
  guestId: string;
  mode: GameMode;
  status: GameInvite["status"];
}

interface InviteRow {
  id: string;
  host_id: string;
  guest_id: string;
  mode: string;
  status: string;
}

/* Crée une invitation en attente vers un ami ; renvoie l'id ou un message d'erreur. */
export async function createInvite(
  hostId: string,
  guestId: string,
  mode: GameMode,
): Promise<{ id: string | null; error: string | null }> {
  const supabase = getSupabase();
  if (!supabase) {
    return { id: null, error: "Service indisponible" };
  }
  const { data, error } = await supabase
    .from("game_invites")
    .insert({ host_id: hostId, guest_id: guestId, mode })
    .select("id")
    .single();
  if (error || !data) {
    return { id: null, error: error?.message ?? "Échec de l'invitation" };
  }
  return { id: data.id as string, error: null };
}

/* Met à jour le statut d'une invitation. */
async function setStatus(id: string, status: GameInvite["status"]): Promise<void> {
  const supabase = getSupabase();
  if (!supabase) {
    return;
  }
  await supabase.from("game_invites").update({ status }).eq("id", id);
}

export const acceptInvite = (id: string): Promise<void> => setStatus(id, "accepted");
export const declineInvite = (id: string): Promise<void> => setStatus(id, "declined");
export const cancelInvite = (id: string): Promise<void> => setStatus(id, "cancelled");

/* Annule toutes les invitations encore en attente émises par un hôte (nettoyage). */
export async function cancelPendingForHost(hostId: string): Promise<void> {
  const supabase = getSupabase();
  if (!supabase) {
    return;
  }
  await supabase
    .from("game_invites")
    .update({ status: "cancelled" })
    .eq("host_id", hostId)
    .eq("status", "pending");
}

/* Liste les invitations actives (pending/accepted) émises par l'hôte. */
export async function listHostInvites(hostId: string): Promise<GameInvite[]> {
  const supabase = getSupabase();
  if (!supabase) {
    return [];
  }
  const tenMinAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();
  const { data } = await supabase
    .from("game_invites")
    .select("id, host_id, guest_id, mode, status")
    .eq("host_id", hostId)
    .in("status", ["pending", "accepted"])
    .gt("created_at", tenMinAgo);
  const rows = (data as InviteRow[] | null) ?? [];
  return rows.map((r) => ({
    id: r.id,
    hostId: r.host_id,
    guestId: r.guest_id,
    hostUsername: "",
    mode: r.mode as GameMode,
    status: r.status as GameInvite["status"],
  }));
}

/* Liste les invitations en attente adressées à l'invité (récentes), avec le pseudo de l'hôte. */
export async function listIncomingInvites(guestId: string): Promise<GameInvite[]> {
  const supabase = getSupabase();
  if (!supabase) {
    return [];
  }
  const tenMinAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();
  const { data } = await supabase
    .from("game_invites")
    .select("id, host_id, guest_id, mode, status")
    .eq("guest_id", guestId)
    .eq("status", "pending")
    .gt("created_at", tenMinAgo)
    .order("created_at", { ascending: false });
  const rows = (data as InviteRow[] | null) ?? [];
  if (rows.length === 0) {
    return [];
  }
  const hostIds = [...new Set(rows.map((r) => r.host_id))];
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
  return rows.map((r) => ({
    id: r.id,
    hostId: r.host_id,
    guestId: r.guest_id,
    hostUsername: names.get(r.host_id) ?? "?",
    mode: r.mode as GameMode,
    status: r.status as GameInvite["status"],
  }));
}

/* S'abonne en temps réel aux changements d'invitations pour un host_id ou guest_id donné.
   Renvoie une fonction de désabonnement. */
export function subscribeInvites(
  column: "host_id" | "guest_id",
  userId: string,
  onChange: (change: InviteChange | null) => void,
): () => void {
  const supabase = getSupabase();
  if (!supabase) {
    return () => {};
  }
  const channel = supabase
    .channel(`game_invites:${column}:${userId}`)
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "game_invites",
        filter: `${column}=eq.${userId}`,
      },
      (payload) => {
        const row = (payload.new ?? payload.old) as Partial<InviteRow> | undefined;
        if (!row || !row.id || !row.host_id || !row.guest_id || !row.mode || !row.status) {
          onChange(null);
          return;
        }
        onChange({
          id: row.id,
          hostId: row.host_id,
          guestId: row.guest_id,
          mode: row.mode as GameMode,
          status: row.status as GameInvite["status"],
        });
      },
    )
    .subscribe();
  return () => {
    void supabase.removeChannel(channel);
  };
}
