"use client";

import { createContext, useCallback, useContext, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

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

interface AskContextValue {
  query: string;
  setQuery: (q: string) => void;
  scope: Scope;
  setScope: (patch: Partial<Scope>) => void;
  submit: (q?: string) => void;
  channels: ScopeChannel[];
}

const AskContext = createContext<AskContextValue | null>(null);

export function useAsk(): AskContextValue {
  const ctx = useContext(AskContext);
  if (!ctx) throw new Error("useAsk must be used within an <AskProvider>");
  return ctx;
}

/**
 * Holds the shared ask state (query + scope) so every entry point — home hero,
 * sticky bar, channel/topic/video "ask" boxes — drives the same flow. submit()
 * navigates to /ask carrying the question and scope as URL params.
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

  const setScope = useCallback(
    (patch: Partial<Scope>) => setScopeState((s) => ({ ...s, ...patch })),
    [],
  );

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

  const value = useMemo<AskContextValue>(
    () => ({ query, setQuery, scope, setScope, submit, channels }),
    [query, scope, setScope, submit, channels],
  );

  return <AskContext.Provider value={value}>{children}</AskContext.Provider>;
}
