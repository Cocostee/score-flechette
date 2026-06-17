import { getSupabase } from "@/lib/supabase";

export interface FriendInfo {
  friendshipId: string;
  userId: string;
  username: string;
  avatarUrl: string | null;
}

export interface IncomingRequest {
  friendshipId: string;
  userId: string;
  username: string;
  avatarUrl: string | null;
}

export interface MyProfile {
  username: string | null;
  avatarUrl: string | null;
}

interface FriendshipRow {
  id: string;
  requester_id: string;
  addressee_id: string;
  status: string;
}

/* Reads the signed-in account's username and avatar. */
export async function getMyProfile(userId: string): Promise<MyProfile> {
  const supabase = getSupabase();
  if (!supabase) {
    return { username: null, avatarUrl: null };
  }
  const primary = await supabase
    .from("profiles")
    .select("username, avatar_url")
    .eq("id", userId)
    .maybeSingle();
  const fallback = primary.error
    ? await supabase
        .from("profiles")
        .select("username")
        .eq("id", userId)
        .maybeSingle()
    : null;
  const data = (fallback ? fallback.data : primary.data) as
    | { username?: string; avatar_url?: string }
    | null;
  return {
    username: data?.username ?? null,
    avatarUrl: data?.avatar_url ?? null,
  };
}

/* Uploads a new avatar image and stores its public URL on the profile. */
export async function uploadAvatar(
  userId: string,
  file: File,
): Promise<string | null> {
  const supabase = getSupabase();
  if (!supabase) {
    return "Service indisponible";
  }
  const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
  const path = `${userId}/avatar-${Date.now()}.${ext}`;
  const up = await supabase.storage
    .from("avatars")
    .upload(path, file, { upsert: true, cacheControl: "3600" });
  if (up.error) {
    return up.error.message;
  }
  const { data } = supabase.storage.from("avatars").getPublicUrl(path);
  const { error } = await supabase
    .from("profiles")
    .update({ avatar_url: data.publicUrl })
    .eq("id", userId);
  return error ? error.message : null;
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
): Promise<FriendInfo[]> {
  const supabase = getSupabase();
  if (!supabase || rows.length === 0) {
    return [];
  }
  const otherIds = rows.map((row) =>
    row.requester_id === myId ? row.addressee_id : row.requester_id,
  );
  const primary = await supabase
    .from("profiles")
    .select("id, username, avatar_url")
    .in("id", otherIds);
  const fallback = primary.error
    ? await supabase.from("profiles").select("id, username").in("id", otherIds)
    : null;
  const data = (fallback ? fallback.data : primary.data) as
    | { id: string; username: string; avatar_url?: string }[]
    | null;
  const profiles = new Map(
    (data ?? []).map((p) => [
      p.id as string,
      {
        username: p.username as string,
        avatarUrl: (p.avatar_url as string | null) ?? null,
      },
    ]),
  );
  return rows.map((row) => {
    const otherId =
      row.requester_id === myId ? row.addressee_id : row.requester_id;
    const profile = profiles.get(otherId);
    return {
      friendshipId: row.id,
      userId: otherId,
      username: profile?.username ?? "?",
      avatarUrl: profile?.avatarUrl ?? null,
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
