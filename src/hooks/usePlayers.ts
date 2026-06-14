"use client";

import { useCallback, useEffect, useState } from "react";
import type { TrackedPlayer } from "@/interfaces";
import { getSupabase } from "@/lib/supabase";

export interface PlayersState {
  players: TrackedPlayer[];
  addPlayer: (name: string) => Promise<string | null>;
  removePlayer: (id: string) => Promise<void>;
  refresh: () => Promise<void>;
}

/* Loads and mutates the tracked player profiles of the signed-in account. */
export function usePlayers(userId: string | null): PlayersState {
  const supabase = getSupabase();
  const [players, setPlayers] = useState<TrackedPlayer[]>([]);

  const refresh = useCallback(async () => {
    if (!supabase || !userId) {
      setPlayers([]);
      return;
    }
    const { data } = await supabase
      .from("players")
      .select("id, name")
      .order("created_at", { ascending: true });
    setPlayers((data as TrackedPlayer[] | null) ?? []);
  }, [supabase, userId]);

  useEffect(() => {
    let active = true;
    Promise.resolve().then(() => {
      if (active) {
        void refresh();
      }
    });
    return () => {
      active = false;
    };
  }, [refresh]);

  const addPlayer = useCallback(
    async (name: string): Promise<string | null> => {
      if (!supabase || !userId) {
        return "Non connecté";
      }
      const trimmed = name.trim();
      if (!trimmed) {
        return "Nom vide";
      }
      const { error } = await supabase
        .from("players")
        .insert({ name: trimmed, owner_id: userId });
      if (error) {
        return error.message;
      }
      await refresh();
      return null;
    },
    [supabase, userId, refresh],
  );

  const removePlayer = useCallback(
    async (id: string) => {
      if (!supabase) {
        return;
      }
      await supabase.from("players").delete().eq("id", id);
      await refresh();
    },
    [supabase, refresh],
  );

  return { players, addPlayer, removePlayer, refresh };
}
