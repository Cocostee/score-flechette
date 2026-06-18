"use client";

import { useEffect } from "react";
import { usePersistedState } from "@/hooks/usePersistedState";

export type Theme = "brown" | "light" | "night";

export const THEMES: { id: Theme; label: string }[] = [
  { id: "light", label: "Clair" },
  { id: "brown", label: "Marron" },
  { id: "night", label: "Nuit" },
];

const META_COLOR: Record<Theme, string> = {
  brown: "#141109",
  night: "#0c0e13",
  light: "#f4eede",
};

/* Reads the saved theme and applies it to the document. */
export function useTheme(): [Theme, (theme: Theme) => void] {
  const [theme, setTheme] = usePersistedState<Theme>("oche:theme", "brown");

  useEffect(() => {
    const root = document.documentElement;
    root.classList.add("theme-changing");
    root.dataset.theme = theme;
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) {
      meta.setAttribute("content", META_COLOR[theme] ?? META_COLOR.brown);
    }
    const timer = setTimeout(() => root.classList.remove("theme-changing"), 400);
    return () => clearTimeout(timer);
  }, [theme]);

  return [theme, setTheme];
}
