"use client";

import { useCallback, useSyncExternalStore } from "react";

const listeners = new Set<() => void>();

/* Notifies every persisted-state subscriber after a same-tab write. */
function emit(): void {
  for (const listener of listeners) {
    listener();
  }
}

/* Reads and writes a value to local storage, synced across hooks and tabs. */
export function usePersistedState<T>(
  key: string,
  fallback: T,
): [T, (value: T) => void] {
  const subscribe = useCallback((onChange: () => void) => {
    listeners.add(onChange);
    window.addEventListener("storage", onChange);
    return () => {
      listeners.delete(onChange);
      window.removeEventListener("storage", onChange);
    };
  }, []);

  const getSnapshot = useCallback(() => {
    try {
      return window.localStorage.getItem(key);
    } catch {
      return null;
    }
  }, [key]);

  const raw = useSyncExternalStore(subscribe, getSnapshot, () => null);
  const value = raw !== null ? (JSON.parse(raw) as T) : fallback;

  const setValue = useCallback(
    (next: T) => {
      try {
        window.localStorage.setItem(key, JSON.stringify(next));
      } catch {
        return;
      }
      emit();
    },
    [key],
  );

  return [value, setValue];
}
