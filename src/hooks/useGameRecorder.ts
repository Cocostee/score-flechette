"use client";

import { useEffect } from "react";
import type { DartsGame } from "@/hooks/useDartsGame";
import { recordGame } from "@/lib/games";

/* Records the finished match to Supabase once, when the user is signed in. */
export function useGameRecorder(game: DartsGame, userId: string | null): void {
  const { screen, recorded } = game.state;
  const { markRecorded } = game;

  useEffect(() => {
    if (!userId || screen !== "result" || recorded) {
      return;
    }
    let active = true;
    recordGame(userId, game.state).then((ok) => {
      if (active && ok) {
        markRecorded();
      }
    });
    return () => {
      active = false;
    };
  }, [userId, screen, recorded, game.state, markRecorded]);
}
