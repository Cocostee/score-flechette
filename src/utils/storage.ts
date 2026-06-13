import type { GameState } from "@/interfaces";

const STORAGE_KEY = "score-flechette:game";

/* Reads a previously saved game state, or null when none is stored. */
export function loadGame(): GameState | null {
  if (typeof window === "undefined") {
    return null;
  }
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return null;
    }
    return JSON.parse(raw) as GameState;
  } catch {
    return null;
  }
}

/* Persists the current game state to local storage. */
export function saveGame(state: GameState): void {
  if (typeof window === "undefined") {
    return;
  }
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    return;
  }
}

/* Removes any saved game state from local storage. */
export function clearGame(): void {
  if (typeof window === "undefined") {
    return;
  }
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    return;
  }
}
