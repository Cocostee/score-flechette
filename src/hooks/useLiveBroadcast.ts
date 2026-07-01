"use client";

import { useEffect, useRef } from "react";
import type { DartsGame } from "@/hooks/useDartsGame";
import { endLiveGame, pushLiveState } from "@/lib/liveGame";

/* Côté hôte : diffuse l'état de la partie (débounce ~120 ms) tant qu'elle
   tourne et qu'elle contient un joueur ami. Marque 'ended' à la fin. */
export function useLiveBroadcast(game: DartsGame, userId: string | null): void {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const active = useRef(false);
  const state = game.state;

  useEffect(() => {
    if (!userId) {
      return;
    }
    const hasFriend = state.players.some(
      (p) => p.friendUserId && p.friendUserId !== userId,
    );

    if (state.screen === "game" && hasFriend) {
      const snapshot = { ...state, past: [] };
      if (timer.current) {
        clearTimeout(timer.current);
      }
      timer.current = setTimeout(() => {
        void pushLiveState(userId, snapshot);
      }, 120);
      active.current = true;
    } else if (active.current) {
      // La partie n'est plus en cours (résultat / accueil) → terminée.
      if (timer.current) {
        clearTimeout(timer.current);
        timer.current = null;
      }
      void endLiveGame(userId);
      active.current = false;
    }

    return () => {
      if (timer.current) {
        clearTimeout(timer.current);
      }
    };
  }, [state, userId]);

  // Sécurité : marque terminé si le composant se démonte pendant une partie.
  useEffect(() => {
    return () => {
      if (active.current && userId) {
        void endLiveGame(userId);
        active.current = false;
      }
    };
  }, [userId]);
}
