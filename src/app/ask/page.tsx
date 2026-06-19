"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Mark } from "@/components/brand/Mark";
import { AnswerBody, type CiteHandlers } from "@/components/ask/AnswerBody";
import { ClipCard } from "@/components/ask/ClipCard";
import { ExtractCards } from "@/components/ask/ExtractCards";
import { streamAsk } from "@/lib/ask-client";
import { STAGE_LABEL, type AskSource, type AskStage } from "@/lib/ask-types";
import { AskProvider, useAsk } from "@/components/ask/AskProvider";
import { ModelSettings } from "@/components/ask/ModelSettings";
import { PROVIDER_PRESETS } from "@/lib/providers";

interface Turn {
  id: number;
  question: string;
  scopeChips: string[];
  answer: string;
  sources: AskSource[];
  extracts: AskSource[];
  stage: AskStage | null;
  stageCount: number | null;
  done: boolean;
  error: string | null;
  shareId?: string;
  followups?: string[];
  /** A bring-your-own-model run failed → offer "retry on default". */
  byokFailed?: boolean;
}

const FOLLOWUPS = [
  "What's the strongest counter-evidence?",
  "Summarize all the sources",
  "Who is most credible here?",
];

const THREAD_KEY = "tubechat-ask-thread";

interface SavedThread {
  turns: Turn[];
  scope: { videoId?: string; channelId?: string };
}

function stageText(stage: AskStage | null, count: number | null): string {
  if (stage === "found") return `Found ${count ?? 0} relevant clip${count === 1 ? "" : "s"}`;
  return stage ? STAGE_LABEL[stage] : "Thinking…";
}

function AskPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { activeByok } = useAsk();
  const [turns, setTurns] = useState<Turn[]>([]);
  const [activeCite, setActiveCite] = useState<number | null>(null);
  const [follow, setFollow] = useState("");

  const idRef = useRef(0);
  const didInit = useRef(false);
  const abortRef = useRef<AbortController | null>(null);
  const scopeRef = useRef<{ videoId?: string; channelId?: string }>({});
  const railRef = useRef<HTMLDivElement>(null);
  const cardRefs = useRef<Record<number, HTMLAnchorElement | null>>({});
  const turnRefs = useRef<Record<number, HTMLDivElement | null>>({});
  const bottomRef = useRef<HTMLDivElement>(null);

  const patch = (id: number, p: Partial<Turn>) =>
    setTurns((prev) => prev.map((t) => (t.id === id ? { ...t, ...p } : t)));
  const appendAnswer = (id: number, text: string) =>
    setTurns((prev) => prev.map((t) => (t.id === id ? { ...t, answer: t.answer + text } : t)));

  const historyFromTurns = (beforeId?: number) =>
    turns
      .filter((t) => (beforeId ? t.id < beforeId : true) && t.done && !t.error)
      .flatMap((t) => [
        { role: "user" as const, content: t.question },
        { role: "assistant" as const, content: t.answer },
      ]);

  const runTurn = (
    id: number,
    question: string,
    history: { role: "user" | "assistant"; content: string }[],
    useDefault = false,
  ) => {
    patch(id, { answer: "", sources: [], extracts: [], stage: "searching", stageCount: null, done: false, error: null, byokFailed: false });
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    streamAsk(
      {
        question,
        history,
        ...(scopeRef.current.videoId ? { videoId: scopeRef.current.videoId } : {}),
        ...(scopeRef.current.channelId ? { channelId: scopeRef.current.channelId } : {}),
        ...(activeByok && !useDefault ? { byok: activeByok } : {}),
      },
      (e) => {
        if (e.type === "stage") patch(id, { stage: e.stage, stageCount: e.count ?? null });
        else if (e.type === "sources") patch(id, { sources: e.sources });
        else if (e.type === "extracts") patch(id, { extracts: e.extracts });
        else if (e.type === "token") appendAnswer(id, e.text);
        else if (e.type === "followups") patch(id, { followups: e.followups });
        else if (e.type === "done") patch(id, { done: true, stage: null });
        else if (e.type === "error") patch(id, { done: true, stage: null, error: e.message, byokFailed: e.code === "byok_failed" });
      },
      controller.signal,
    ).catch((err) => {
      if (err?.name !== "AbortError") {
        patch(id, { done: true, stage: null, error: "Couldn't reach the server. Please retry." });
      }
    });
  };

  const ask = (question: string) => {
    const q = question.trim();
    if (!q) return;
    const id = (idRef.current += 1);
    const chips: string[] = [];
    if (scopeRef.current.videoId) chips.push("▶ this video");
    else if (scopeRef.current.channelId) chips.push("this channel");
    else chips.push("all channels");
    const history = historyFromTurns();
    setTurns((prev) => [
      ...prev,
      { id, question: q, scopeChips: chips, answer: "", sources: [], extracts: [], stage: "searching", stageCount: null, done: false, error: null },
    ]);
    runTurn(id, q, history);
  };

  // Initial mount: restore a saved thread and/or run the entry-point question.
  useEffect(() => {
    if (didInit.current) return;
    didInit.current = true;

    const q = (searchParams.get("q") || "").trim();
    const paramScope = {
      videoId: searchParams.get("video") || undefined,
      channelId: (searchParams.get("channels") || "").split(",")[0] || undefined,
    };

    let saved: SavedThread | null = null;
    try {
      const raw = sessionStorage.getItem(THREAD_KEY);
      if (raw) saved = JSON.parse(raw) as SavedThread;
    } catch {
      /* ignore malformed storage */
    }

    const restore = (s: SavedThread): boolean => {
      const restored = (s.turns ?? []).filter((t) => t.done && !t.error);
      if (restored.length === 0) return false;
      scopeRef.current = s.scope ?? {};
      idRef.current = restored.reduce((m, t) => Math.max(m, t.id), 0);
      setTurns(restored);
      return true;
    };

    if (q) {
      // Refreshing an already-asked thread (q still in the URL) → restore, don't re-ask.
      if (!(saved && saved.turns?.[0]?.question === q && restore(saved))) {
        scopeRef.current = paramScope;
        ask(q);
      }
      router.replace("/ask"); // strip ?q= so a later refresh restores from storage
    } else if (!(saved && restore(saved))) {
      scopeRef.current = paramScope;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Persist completed turns (+ scope) so a refresh restores the conversation.
  // Write-only — newThread() handles clearing; avoids clobbering on first mount.
  useEffect(() => {
    const doneTurns = turns.filter((t) => t.done && !t.error).slice(-20);
    if (doneTurns.length === 0) return;
    try {
      sessionStorage.setItem(THREAD_KEY, JSON.stringify({ turns: doneTurns, scope: scopeRef.current } satisfies SavedThread));
    } catch {
      /* ignore quota */
    }
  }, [turns]);

  // Keep the latest turn in view as it streams.
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [turns.length]);

  const newThread = () => {
    abortRef.current?.abort();
    scopeRef.current = {};
    setTurns([]);
    setActiveCite(null);
    try {
      sessionStorage.removeItem(THREAD_KEY);
    } catch {
      /* ignore */
    }
    router.replace("/ask");
  };

  const submitFollow = () => {
    if (!follow.trim()) return;
    ask(follow);
    setFollow("");
  };

  const shareTurn = async (turn: Turn) => {
    if (turn.shareId) {
      router.push(`/a/${turn.shareId}`);
      return;
    }
    try {
      const res = await fetch("/api/answers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: turn.question, answer: turn.answer, sources: turn.sources }),
      });
      if (res.ok) {
        const { id } = await res.json();
        patch(turn.id, { shareId: id });
        router.push(`/a/${id}`);
      }
    } catch {
      /* ignore — share is best-effort */
    }
  };

  const latest = turns[turns.length - 1];
  const streaming = latest ? !latest.done : false;
  // Extractive turns carry no `sources` but populate `extracts` — show those in the rail too.
  const railSources = latest?.sources.length ? latest.sources : (latest?.extracts ?? []);

  const focusClip = (n: number) => {
    setActiveCite(n);
    const el = cardRefs.current[n];
    const rail = railRef.current;
    if (el && rail) rail.scrollTo({ top: el.offsetTop - rail.offsetTop - 12, behavior: "smooth" });
  };

  return (
    <div className="ask-view">
      <div className="wrap ask-grid">
        {/* history rail */}
        <aside className="thread-rail">
          <button
            className="btn accent"
            style={{ width: "100%", justifyContent: "center", marginBottom: 18 }}
            onClick={newThread}
            type="button"
          >
            ＋ New thread
          </button>
          {turns.length > 0 && (
            <>
              <div className="kicker" style={{ marginBottom: 10 }}>
                This thread
              </div>
              <div className="col" style={{ gap: 2 }}>
                {turns.map((t, i) => (
                  <div
                    key={t.id}
                    className={"hist" + (i === turns.length - 1 ? " active" : "")}
                    title={t.question}
                    onClick={() => turnRefs.current[t.id]?.scrollIntoView({ behavior: "smooth", block: "start" })}
                  >
                    {t.question.length > 32 ? t.question.slice(0, 32) + "…" : t.question}
                  </div>
                ))}
              </div>
            </>
          )}
        </aside>

        {/* thread */}
        <main className="thread">
          {turns.length === 0 && (
            <div style={{ paddingTop: 40, color: "var(--ink-3)" }}>
              <div className="q-text" style={{ color: "var(--ink-2)" }}>
                Ask anything about the UFO/UAP archive.
              </div>
              <p className="lede" style={{ marginTop: 12 }}>
                Type a question below — every answer cites the exact clips it draws from.
              </p>
            </div>
          )}

          {turns.map((turn, ti) => {
            const isLatest = ti === turns.length - 1;
            const handlers: CiteHandlers | undefined = isLatest
              ? {
                  enter: (n) => setActiveCite(n),
                  leave: () => setActiveCite(null),
                  click: (n) => {
                    const s = turn.sources[n - 1];
                    if (s) router.push(s.url);
                    else focusClip(n);
                  },
                }
              : undefined;
            const thinking = !turn.error && turn.answer === "" && !turn.done;

            return (
              <div
                key={turn.id}
                ref={(el) => {
                  turnRefs.current[turn.id] = el;
                }}
                style={{ marginBottom: 40 }}
              >
                <div className="msg-user">
                  <div className="row gap10" style={{ marginBottom: 8 }}>
                    <span className="ava-you" />
                    <span className="kicker">You</span>
                  </div>
                  <div className="q-text">{turn.question}</div>
                  {turn.scopeChips.length > 0 && (
                    <div className="row gap6 wrapf" style={{ marginTop: 10 }}>
                      {turn.scopeChips.map((c) => (
                        <span className="chip-sm" key={c}>
                          {c}
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                <div className="msg-ans">
                  <div className="row gap10" style={{ marginBottom: 12 }}>
                    <span className="ava-tc">
                      <Mark size={15} />
                    </span>
                    <span className="kicker" style={{ color: "var(--accent)" }}>
                      tubechat
                    </span>
                    {turn.done && !turn.error && turn.sources.length > 0 && (
                      <span className="kicker" style={{ color: "var(--ink-faint)" }}>
                        · {turn.sources.length} sources
                      </span>
                    )}
                    {turn.done && !turn.error && (
                      <button
                        className="btn ghost"
                        style={{ marginLeft: "auto", padding: "5px 11px", fontSize: 12.5 }}
                        onClick={() => shareTurn(turn)}
                        type="button"
                      >
                        ↗ Share
                      </button>
                    )}
                  </div>

                  {thinking ? (
                    <div className="thinking">
                      <span className="scan" />
                      <span className="status">{stageText(turn.stage, turn.stageCount)}</span>
                    </div>
                  ) : turn.extracts.length > 0 && !turn.answer ? (
                    <ExtractCards extracts={turn.extracts} />
                  ) : (
                    <AnswerBody
                      text={turn.answer}
                      sources={turn.sources}
                      activeCite={isLatest ? activeCite : null}
                      handlers={handlers}
                      streaming={isLatest && streaming && !turn.error}
                    />
                  )}

                  {turn.error && (
                    <div
                      style={{
                        marginTop: 12,
                        padding: "12px 14px",
                        borderRadius: 10,
                        border: "1px solid var(--line-2)",
                        background: "var(--surface-2)",
                        fontSize: 13.5,
                        color: "var(--ink-2)",
                      }}
                    >
                      {turn.error}{" "}
                      {turn.byokFailed ? (
                        <>
                          <button
                            className="pop-link"
                            style={{ color: "var(--accent)" }}
                            onClick={() => runTurn(turn.id, turn.question, historyFromTurns(turn.id), true)}
                            type="button"
                          >
                            Retry on tubechat’s default model
                          </button>
                          {" · "}
                          <button
                            className="pop-link"
                            style={{ color: "var(--ink-3)" }}
                            onClick={() => runTurn(turn.id, turn.question, historyFromTurns(turn.id))}
                            type="button"
                          >
                            Retry with my model
                          </button>
                        </>
                      ) : (
                        <button
                          className="pop-link"
                          style={{ color: "var(--accent)" }}
                          onClick={() => runTurn(turn.id, turn.question, historyFromTurns(turn.id))}
                          type="button"
                        >
                          Retry
                        </button>
                      )}
                    </div>
                  )}

                  {turn.done && !turn.error && turn.sources.length === 0 && turn.extracts.length === 0 && (
                    <div style={{ marginTop: 10, fontSize: 13, color: "var(--ink-3)" }}>
                      No specific clips matched — try widening your channels or date range.
                    </div>
                  )}

                  {isLatest && turn.done && !turn.error && (
                    <div className="followups">
                      <div className="kicker" style={{ marginBottom: 10 }}>
                        Follow up
                      </div>
                      <div className="col" style={{ gap: 6 }}>
                        {(turn.followups ?? FOLLOWUPS).map((f) => (
                          <button key={f} className="follow-chip" onClick={() => ask(f)} type="button">
                            <span>{f}</span>
                            <span style={{ color: "var(--ink-faint)" }}>↗</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            );
          })}

          <div ref={bottomRef} />

          {/* sticky follow-up composer */}
          <div className="composer">
            <textarea
              className="composer-ta"
              placeholder={turns.length ? "Ask a follow-up…" : "Ask a question…"}
              value={follow}
              onChange={(e) => setFollow(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  submitFollow();
                }
              }}
              rows={1}
              spellCheck={false}
              aria-label="Ask a follow-up"
            />
            <div className="row gap8">
              <span className="chip-sm">scope: thread</span>
              <ModelSettings />
              {activeByok && (
                <span
                  className="pill on"
                  title={`Answering with ${PROVIDER_PRESETS[activeByok.provider].label}`}
                  style={{ maxWidth: 150, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
                >
                  ⚙ {activeByok.model}
                </span>
              )}
              <button className="send" style={{ width: 30, height: 30 }} onClick={submitFollow} type="button">
                ↑
              </button>
            </div>
          </div>

          <p style={{ fontSize: 11, color: "var(--ink-faint)", textAlign: "center", marginTop: 14 }}>
            AI-synthesized from creator transcripts — verify with the cited clips.
          </p>
        </main>

        {/* cited clips rail */}
        <aside className="clip-rail" ref={railRef}>
          <div className="row between" style={{ marginBottom: 12 }}>
            <span className="section-title" style={{ fontSize: 15 }}>
              Cited clips
            </span>
            <span className="kicker">{streaming && railSources.length === 0 ? "…" : railSources.length}</span>
          </div>
          {railSources.length === 0 ? (
            <div style={{ fontSize: 13, color: "var(--ink-faint)", lineHeight: 1.5 }}>
              {streaming ? "Finding the clips behind the answer…" : "Cited clips will appear here."}
            </div>
          ) : (
            <div className="col gap10">
              {railSources.map((s, i) => (
                <ClipCard
                  key={`${s.videoId}-${i}`}
                  source={s}
                  n={i + 1}
                  active={activeCite === i + 1}
                  onEnter={() => setActiveCite(i + 1)}
                  innerRef={(el) => {
                    cardRefs.current[i + 1] = el;
                  }}
                />
              ))}
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}

export default function AskPage() {
  return (
    <Suspense fallback={null}>
      <AskProvider>
        <AskPageInner />
      </AskProvider>
    </Suspense>
  );
}
