"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  listLiveForViewer,
  subscribeLiveForViewer,
  subscribeLiveRow,
  type LiveGame,
} from "@/lib/liveGame";

export interface LiveSpectatorState {
  available: LiveGame | null;
  watching: LiveGame | null;
  watch: () => void;
  dismiss: () => void;
  stopWatching: () => void;
}

/* Côté spectateur : détecte une partie live d'un ami dont on est joueur
   (bannière), et suit la partie regardée en direct. */
export function useLiveSpectator(userId: string | null): LiveSpectatorState {
  const [available, setAvailable] = useState<LiveGame | null>(null);
  const [watching, setWatching] = useState<LiveGame | null>(null);
  const watchingHost = useRef<string | null>(null);
  const dismissedHost = useRef<string | null>(null);

  // Écoute globale → partie live pertinente pour la bannière.
  const refresh = useCallback(async (): Promise<void> => {
    if (!userId) {
      setAvailable(null);
      return;
    }
    const list = await listLiveForViewer(userId);
    // Ne garder que les parties où le spectateur est un joueur.
    const relevant =
      list.find((lg) =>
        lg.state.players.some((p) => p.friendUserId === userId),
      ) ?? null;
    if (!relevant) {
      // Plus de partie live → réinitialise un éventuel masquage.
      dismissedHost.current = null;
      setAvailable(null);
      return;
    }
    // Masquée manuellement pour cette partie précise → reste cachée.
    setAvailable(relevant.hostId === dismissedHost.current ? null : relevant);
  }, [userId]);

  useEffect(() => {
    if (!userId) {
      setAvailable(null);
      return;
    }
    let active = true;
    void refresh();
    const unsub = subscribeLiveForViewer(userId, () => {
      if (active) {
        void refresh();
      }
    });
    return () => {
      active = false;
      unsub();
    };
  }, [userId, refresh]);

  // Suivi de la partie regardée.
  useEffect(() => {
    const host = watching?.hostId ?? null;
    if (host === watchingHost.current) {
      return;
    }
    watchingHost.current = host;
    if (!host) {
      return;
    }
    const unsub = subscribeLiveRow(host, (row) => {
      if (!row) {
        return;
      }
      setWatching((cur) =>
        cur && cur.hostId === host
          ? { ...cur, state: row.state, status: row.status }
          : cur,
      );
    });
    return () => {
      unsub();
    };
  }, [watching?.hostId]);

  const watch = useCallback(() => {
    setAvailable((av) => {
      if (av) {
        setWatching(av);
      }
      return av;
    });
  }, []);

  const dismiss = useCallback(() => {
    setAvailable((av) => {
      if (av) {
        dismissedHost.current = av.hostId;
      }
      return null;
    });
  }, []);

  const stopWatching = useCallback(() => {
    setWatching(null);
    watchingHost.current = null;
  }, []);

  return { available, watching, watch, dismiss, stopWatching };
}
