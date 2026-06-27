"use client";

import { useCallback, useEffect, useState } from "react";
import type { GameMode } from "@/interfaces";
import {
  cancelInvite,
  cancelPendingForHost,
  createInvite,
  listHostInvites,
  subscribeInvites,
  type GameInvite,
} from "@/lib/gameInvites";

export interface HostInviteEntry {
  inviteId: string;
  status: GameInvite["status"];
}

export interface HostInvitesState {
  invites: Record<string, HostInviteEntry>;
  invite: (guestId: string, mode: GameMode) => Promise<string | null>;
  cancelForGuest: (guestId: string) => Promise<void>;
  cancelAll: () => Promise<void>;
  hasPending: boolean;
}

/* Côté hôte : suit les invitations de la config courante, indexées par guestId. */
export function useGameInvites(userId: string | null): HostInvitesState {
  const [invites, setInvites] = useState<Record<string, HostInviteEntry>>({});

  useEffect(() => {
    if (!userId) {
      setInvites({});
      return;
    }
    let active = true;
    void listHostInvites(userId).then((rows) => {
      if (!active) {
        return;
      }
      const map: Record<string, HostInviteEntry> = {};
      for (const r of rows) {
        map[r.guestId] = { inviteId: r.id, status: r.status };
      }
      setInvites(map);
    });
    const unsub = subscribeInvites("host_id", userId, (change) => {
      if (!change) {
        return;
      }
      setInvites((m) => ({
        ...m,
        [change.guestId]: { inviteId: change.id, status: change.status },
      }));
    });
    return () => {
      active = false;
      unsub();
    };
  }, [userId]);

  const invite = useCallback(
    async (guestId: string, mode: GameMode): Promise<string | null> => {
      if (!userId) {
        return "Non connecté";
      }
      const { id, error } = await createInvite(userId, guestId, mode);
      if (error || !id) {
        return error ?? "Échec de l'invitation";
      }
      setInvites((m) => ({
        ...m,
        [guestId]: { inviteId: id, status: "pending" },
      }));
      return null;
    },
    [userId],
  );

  const cancelForGuest = useCallback(
    async (guestId: string): Promise<void> => {
      let inviteId: string | undefined;
      setInvites((m) => {
        inviteId = m[guestId]?.inviteId;
        const next = { ...m };
        delete next[guestId];
        return next;
      });
      if (inviteId) {
        await cancelInvite(inviteId);
      }
    },
    [],
  );

  const cancelAll = useCallback(async (): Promise<void> => {
    if (userId) {
      await cancelPendingForHost(userId);
    }
    setInvites({});
  }, [userId]);

  const hasPending = Object.values(invites).some((e) => e.status === "pending");

  return { invites, invite, cancelForGuest, cancelAll, hasPending };
}
