"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { ByokConfig } from "@/lib/providers";

export interface ScopeChannel {
  id: string;
  name: string;
  slug: string | null;
  videoCount?: number;
  logoUrl?: string | null;
}

export interface DatePreset {
  key: string;
  label: string;
}

export interface ScopeSource {
  id: string;
  type: "video" | "topic";
  label: string;
}

export interface Scope {
  channels: string[]; // selected channel ids
  date: DatePreset;
  sources: ScopeSource[];
}

export const DEFAULT_DATE: DatePreset = { key: "any", label: "Any date" };

// --- Bring-your-own-key/model: persisted in localStorage, synced like the theme.
const BYOK_KEY = "tubechat-byok-config";
const BYOK_EVENT = "tubechat-byok";

interface StoredByok {
  config: ByokConfig | null;
  enabled: boolean;
}

function readByok(): StoredByok {
  if (typeof window === "undefined") return { config: null, enabled: false };
  try {
    const raw = localStorage.getItem(BYOK_KEY);
    if (!raw) return { config: null, enabled: false };
    const parsed = JSON.parse(raw) as Partial<StoredByok>;
    const c = parsed.config;
    const config =
      c && typeof c.provider === "string" && typeof c.model === "string" && typeof c.apiKey === "string"
        ? { provider: c.provider, model: c.model, apiKey: c.apiKey }
        : null;
    return { config, enabled: !!parsed.enabled && !!config };
  } catch {
    return { config: null, enabled: false };
  }
}

function persistByok(s: StoredByok) {
  try {
    localStorage.setItem(BYOK_KEY, JSON.stringify(s));
  } catch {
    /* ignore quota */
  }
  window.dispatchEvent(new CustomEvent<StoredByok>(BYOK_EVENT, { detail: s }));
}

interface AskContextValue {
  query: string;
  setQuery: (q: string) => void;
  scope: Scope;
  setScope: (patch: Partial<Scope>) => void;
  submit: (q?: string) => void;
  channels: ScopeChannel[];
  // BYOK
  byok: ByokConfig | null;
  byokEnabled: boolean;
  /** The config to actually send (enabled && configured), else null. */
  activeByok: ByokConfig | null;
  setByok: (config: ByokConfig | null) => void;
  setByokEnabled: (enabled: boolean) => void;
}

const AskContext = createContext<AskContextValue | null>(null);

export function useAsk(): AskContextValue {
  const ctx = useContext(AskContext);
  if (!ctx) throw new Error("useAsk must be used within an <AskProvider>");
  return ctx;
}

/**
 * Holds the shared ask state (query + scope + BYOK model config) so every entry
 * point — home hero, sticky bar, channel/topic/video "ask" boxes, and the /ask
 * page — drives the same flow. submit() navigates to /ask carrying the question
 * and scope as URL params. BYOK config persists in localStorage and is shared
 * across instances + tabs (so a key set on the home box applies on /ask too).
 */
export function AskProvider({
  channels = [],
  children,
}: {
  channels?: ScopeChannel[];
  children: React.ReactNode;
}) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [scope, setScopeState] = useState<Scope>({ channels: [], date: DEFAULT_DATE, sources: [] });

  // Lazy-init from storage; no SSR'd DOM depends on it, so no hydration mismatch.
  const [byokState, setByokState] = useState<StoredByok>(readByok);

  useEffect(() => {
    setByokState(readByok());
    const onEvent = (e: Event) => {
      const v = (e as CustomEvent<StoredByok>).detail;
      if (v) setByokState(v);
    };
    const onStorage = (e: StorageEvent) => {
      if (e.key === BYOK_KEY) setByokState(readByok());
    };
    window.addEventListener(BYOK_EVENT, onEvent as EventListener);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener(BYOK_EVENT, onEvent as EventListener);
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  const setScope = useCallback(
    (patch: Partial<Scope>) => setScopeState((s) => ({ ...s, ...patch })),
    [],
  );

  const setByok = useCallback((config: ByokConfig | null) => {
    setByokState((prev) => {
      const next: StoredByok = { config, enabled: config ? prev.enabled : false };
      persistByok(next);
      return next;
    });
  }, []);

  const setByokEnabled = useCallback((enabled: boolean) => {
    setByokState((prev) => {
      const next: StoredByok = { config: prev.config, enabled: enabled && !!prev.config };
      persistByok(next);
      return next;
    });
  }, []);

  const submit = useCallback(
    (q?: string) => {
      const text = (q ?? query).trim();
      if (!text) return;
      const params = new URLSearchParams();
      params.set("q", text);
      if (scope.channels.length) params.set("channels", scope.channels.join(","));
      if (scope.date.key !== "any") params.set("date", scope.date.key);
      if (scope.sources.length) {
        params.set("sources", scope.sources.map((s) => `${s.type}:${s.label}`).join("|"));
      }
      router.push(`/ask?${params.toString()}`);
    },
    [query, scope, router],
  );

  const activeByok = byokState.enabled && byokState.config ? byokState.config : null;

  const value = useMemo<AskContextValue>(
    () => ({
      query,
      setQuery,
      scope,
      setScope,
      submit,
      channels,
      byok: byokState.config,
      byokEnabled: byokState.enabled,
      activeByok,
      setByok,
      setByokEnabled,
    }),
    [query, scope, setScope, submit, channels, byokState, activeByok, setByok, setByokEnabled],
  );

  return <AskContext.Provider value={value}>{children}</AskContext.Provider>;
}
