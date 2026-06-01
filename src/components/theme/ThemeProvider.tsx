"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";

export type Theme = "dark" | "light";

const STORAGE_KEY = "tubechat-theme";
const EVENT = "tubechat-theme";

interface ThemeContextValue {
  theme: Theme;
  setTheme: (t: Theme) => void;
  toggle: () => void;
}

const ThemeContext = createContext<ThemeContextValue>({
  theme: "dark",
  setTheme: () => {},
  toggle: () => {},
});

export function useTheme() {
  return useContext(ThemeContext);
}

function applyTheme(t: Theme) {
  const el = document.documentElement;
  el.classList.remove("theme-dark", "theme-light");
  el.classList.add(`theme-${t}`);
}

function persist(t: Theme) {
  try {
    localStorage.setItem(STORAGE_KEY, t);
  } catch {
    /* ignore */
  }
  window.dispatchEvent(new CustomEvent<Theme>(EVENT, { detail: t }));
}

/**
 * Owns the persisted theme and keeps every instance in lockstep. The actual
 * `theme-*` class on <html> is set pre-paint by ThemeScript; this provider
 * syncs React state to it and broadcasts changes (header toggle <-> account
 * appearance control) via a CustomEvent + cross-tab `storage` events.
 */
function readStored(): Theme {
  if (typeof window === "undefined") return "dark";
  try {
    return localStorage.getItem(STORAGE_KEY) === "light" ? "light" : "dark";
  } catch {
    return "dark";
  }
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  // Lazy initializer reads the persisted theme on the client's first render.
  // No DOM depends on this value (only the mounted-guarded toggle icon), so it
  // can differ from the server's "dark" default without a hydration mismatch.
  const [theme, setThemeState] = useState<Theme>(readStored);

  useEffect(() => {
    // Ensure the <html> class matches storage even if the pre-paint script was
    // skipped, then keep every instance in sync.
    applyTheme(readStored());

    const onEvent = (e: Event) => {
      const v = (e as CustomEvent<Theme>).detail;
      if (v === "dark" || v === "light") {
        setThemeState(v);
        applyTheme(v);
      }
    };
    const onStorage = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY && (e.newValue === "dark" || e.newValue === "light")) {
        setThemeState(e.newValue);
        applyTheme(e.newValue);
      }
    };
    window.addEventListener(EVENT, onEvent as EventListener);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener(EVENT, onEvent as EventListener);
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  const setTheme = useCallback((t: Theme) => {
    setThemeState(t);
    applyTheme(t);
    persist(t);
  }, []);

  const toggle = useCallback(() => {
    setThemeState((prev) => {
      const next: Theme = prev === "dark" ? "light" : "dark";
      applyTheme(next);
      persist(next);
      return next;
    });
  }, []);

  return (
    <ThemeContext.Provider value={{ theme, setTheme, toggle }}>{children}</ThemeContext.Provider>
  );
}
