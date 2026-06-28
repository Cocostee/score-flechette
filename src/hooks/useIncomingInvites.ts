"use client";

import { useCallback, useEffect, useState } from "react";
import {
  acceptInvite,
  declineInvite,
  listIncomingInvites,
  subscribeInvites,
  type GameInvite,
} from "@/lib/gameInvites";

export interface IncomingInvitesState {
  current: GameInvite | null;
  accept: () => Promise<void>;
  decline: () => Promise<void>;
}

/* Côté invité : écoute globale des invitations entrantes ; expose la plus récente. */
export function useIncomingInvites(userId: string | null): IncomingInvitesState {
  const [current, setCurrent] = useState<GameInvite | null>(null);

  const refresh = useCallback(async (): Promise<void> => {
    if (!userId) {
      setCurrent(null);
      return;
    }
    const list = await listIncomingInvites(userId);
    setCurrent(list[0] ?? null);
  }, [userId]);

  useEffect(() => {
    if (!userId) {
      setCurrent(null);
      return;
    }
    let active = true;
    void refresh();
    const unsub = subscribeInvites("guest_id", userId, () => {
      if (active) {
        void refresh();
      }
    });
    return () => {
      active = false;
      unsub();
    };
  }, [userId, refresh]);

  const accept = useCallback(async (): Promise<void> => {
    if (!current) {
      return;
    }
    await acceptInvite(current.id);
    setCurrent(null);
    await refresh();
  }, [current, refresh]);

  const decline = useCallback(async (): Promise<void> => {
    if (!current) {
      return;
    }
    await declineInvite(current.id);
    setCurrent(null);
    await refresh();
  }, [current, refresh]);

  return { current, accept, decline };
}
