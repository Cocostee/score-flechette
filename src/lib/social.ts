import { getSupabase } from "@/lib/supabase";

export interface FriendInfo {
  friendshipId: string;
  userId: string;
  username: string;
}

export interface IncomingRequest {
  friendshipId: string;
  userId: string;
  username: string;
}

interface FriendshipRow {
  id: string;
  requester_id: string;
  addressee_id: string;
  status: string;
}

/* Reads the signed-in account's public username, or null when unset. */
export async function getMyUsername(userId: string): Promise<string | null> {
  const supabase = getSupabase();
  if (!supabase) {
    return null;
  }
  const { data } = await supabase
    .from("profiles")
    .select("username")
    .eq("id", userId)
    .maybeSingle();
  return (data?.username as string | undefined) ?? null;
}

/* Creates or updates the account's public username; returns an error message. */
export async function setUsername(
  userId: string,
  username: string,
): Promise<string | null> {
  const supabase = getSupabase();
  if (!supabase) {
    return "Service indisponible";
  }
  const clean = username.trim();
  if (clean.length < 3) {
    return "Pseudo trop court (3 caractères min.)";
  }
  const { error } = await supabase
    .from("profiles")
    .upsert({ id: userId, username: clean });
  if (error) {
    return error.code === "23505"
      ? "Ce pseudo est déjà pris"
      : error.message;
  }
  return null;
}

/* Resolves the other party ids into username-bearing friend records. */
async function withUsernames(
  rows: FriendshipRow[],
  myId: string,
): Promise<{ friendshipId: string; userId: string; username: string }[]> {
  const supabase = getSupabase();
  if (!supabase || rows.length === 0) {
    return [];
  }
  const otherIds = rows.map((row) =>
    row.requester_id === myId ? row.addressee_id : row.requester_id,
  );
  const { data } = await supabase
    .from("profiles")
    .select("id, username")
    .in("id", otherIds);
  const names = new Map(
    (data ?? []).map((p) => [p.id as string, p.username as string]),
  );
  return rows.map((row) => {
    const otherId =
      row.requester_id === myId ? row.addressee_id : row.requester_id;
    return {
      friendshipId: row.id,
      userId: otherId,
      username: names.get(otherId) ?? "?",
    };
  });
}

/* Lists accepted friends of the account. */
export async function listFriends(myId: string): Promise<FriendInfo[]> {
  const supabase = getSupabase();
  if (!supabase) {
    return [];
  }
  const { data } = await supabase
    .from("friendships")
    .select("id, requester_id, addressee_id, status")
    .eq("status", "accepted");
  return withUsernames((data as FriendshipRow[] | null) ?? [], myId);
}

/* Lists pending friend requests addressed to the account. */
export async function listIncoming(myId: string): Promise<IncomingRequest[]> {
  const supabase = getSupabase();
  if (!supabase) {
    return [];
  }
  const { data } = await supabase
    .from("friendships")
    .select("id, requester_id, addressee_id, status")
    .eq("status", "pending")
    .eq("addressee_id", myId);
  return withUsernames((data as FriendshipRow[] | null) ?? [], myId);
}

/* Sends a friend request to the account owning the given username. */
export async function sendFriendRequest(
  myId: string,
  username: string,
): Promise<string | null> {
  const supabase = getSupabase();
  if (!supabase) {
    return "Service indisponible";
  }
  const { data: target } = await supabase
    .from("profiles")
    .select("id, username")
    .ilike("username", username.trim())
    .maybeSingle();
  if (!target) {
    return "Pseudo introuvable";
  }
  if (target.id === myId) {
    return "C'est toi !";
  }
  const { error } = await supabase
    .from("friendships")
    .insert({ requester_id: myId, addressee_id: target.id });
  if (error) {
    return error.code === "23505"
      ? "Demande déjà existante"
      : error.message;
  }
  return null;
}

/* Accepts a pending friend request. */
export async function acceptRequest(friendshipId: string): Promise<void> {
  const supabase = getSupabase();
  if (!supabase) {
    return;
  }
  await supabase
    .from("friendships")
    .update({ status: "accepted" })
    .eq("id", friendshipId);
}

/* Removes a friendship or declines a request. */
export async function removeFriendship(friendshipId: string): Promise<void> {
  const supabase = getSupabase();
  if (!supabase) {
    return;
  }
  await supabase.from("friendships").delete().eq("id", friendshipId);
}
