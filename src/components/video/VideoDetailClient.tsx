"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { formatTimecode } from "@/lib/format";

interface YTPlayer {
  seekTo(seconds: number, allowSeekAhead: boolean): void;
  playVideo(): void;
  getCurrentTime(): number;
  destroy(): void;
}
interface YTPlayerOptions {
  videoId: string;
  width?: string | number;
  height?: string | number;
  playerVars?: Record<string, string | number>;
}
declare global {
  interface Window {
    YT?: { Player: new (el: HTMLElement, opts: YTPlayerOptions) => YTPlayer };
    onYouTubeIframeAPIReady?: () => void;
  }
}

let ytReady: Promise<NonNullable<Window["YT"]>> | null = null;
function loadYT(): Promise<NonNullable<Window["YT"]>> {
  if (ytReady) return ytReady;
  ytReady = new Promise((resolve) => {
    if (window.YT?.Player) return resolve(window.YT);
    const prev = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      prev?.();
      if (window.YT) resolve(window.YT);
    };
    if (!document.getElementById("yt-iframe-api")) {
      const s = document.createElement("script");
      s.id = "yt-iframe-api";
      s.src = "https://www.youtube.com/iframe_api";
      document.body.appendChild(s);
    }
  });
  return ytReady;
}

export interface TimedSeg {
  start: number;
  text: string;
  chapter?: boolean;
}

function highlight(text: string, q: string): React.ReactNode {
  if (!q) return text;
  const out: React.ReactNode[] = [];
  const lower = text.toLowerCase();
  const ql = q.toLowerCase();
  let i = 0;
  let idx = lower.indexOf(ql, i);
  while (idx !== -1) {
    if (idx > i) out.push(text.slice(i, idx));
    out.push(
      <span className="hl" key={idx}>
        {text.slice(idx, idx + q.length)}
      </span>,
    );
    i = idx + q.length;
    idx = lower.indexOf(ql, i);
  }
  if (i < text.length) out.push(text.slice(i));
  return out;
}

/**
 * Player (real YouTube IFrame API) + synced transcript. When timed `segments`
 * are available, lines are clickable (seek) and the active line follows the
 * playhead; otherwise it falls back to a search-only paragraph transcript.
 */
export function VideoDetailClient({
  youtubeId,
  startSeconds = 0,
  segments,
  paragraphs,
  children,
}: {
  youtubeId: string;
  startSeconds?: number;
  segments?: TimedSeg[];
  paragraphs?: string[];
  children?: React.ReactNode;
}) {
  const mountRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<YTPlayer | null>(null);
  const [currentTime, setCurrentTime] = useState(startSeconds);
  const [q, setQ] = useState("");
  const [matchPtr, setMatchPtr] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);
  const segRefs = useRef<(HTMLElement | null)[]>([]);

  useEffect(() => {
    let cancelled = false;
    let poll: ReturnType<typeof setInterval> | undefined;
    loadYT().then((YT) => {
      if (cancelled || !mountRef.current) return;
      playerRef.current = new YT.Player(mountRef.current, {
        videoId: youtubeId,
        width: "100%",
        height: "100%",
        playerVars: { start: Math.floor(startSeconds), rel: 0, modestbranding: 1 },
      });
      poll = setInterval(() => {
        const p = playerRef.current;
        if (p && typeof p.getCurrentTime === "function") {
          const t = p.getCurrentTime();
          if (typeof t === "number" && !Number.isNaN(t)) setCurrentTime(t);
        }
      }, 500);
    });
    return () => {
      cancelled = true;
      if (poll) clearInterval(poll);
      try {
        playerRef.current?.destroy();
      } catch {
        /* ignore */
      }
      playerRef.current = null;
    };
  }, [youtubeId, startSeconds]);

  const seek = (s: number) => {
    const p = playerRef.current;
    if (p) {
      p.seekTo(s, true);
      p.playVideo();
    }
    setCurrentTime(s);
  };

  const timed = segments && segments.length > 0 ? segments : null;

  const items: { text: string; start?: number; chapter?: boolean }[] = useMemo(
    () =>
      timed
        ? timed.map((s) => ({ text: s.text, start: s.start, chapter: s.chapter }))
        : (paragraphs ?? []).map((p) => ({ text: p })),
    [timed, paragraphs],
  );

  const activeIdx = useMemo(() => {
    if (!timed) return -1;
    let idx = 0;
    for (let i = 0; i < timed.length; i++) if (timed[i].start <= currentTime + 0.25) idx = i;
    return idx;
  }, [timed, currentTime]);

  useEffect(() => {
    if (activeIdx < 0) return;
    const el = segRefs.current[activeIdx];
    const list = listRef.current;
    if (el && list) {
      const top = el.offsetTop - list.offsetTop;
      if (top < list.scrollTop + 8 || top > list.scrollTop + list.clientHeight - 60) {
        list.scrollTo({ top: top - 16, behavior: "smooth" });
      }
    }
  }, [activeIdx]);

  const matches = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return [];
    return items.map((it, i) => (it.text.toLowerCase().includes(needle) ? i : -1)).filter((i) => i >= 0);
  }, [q, items]);

  const gotoMatch = (dir: number) => {
    if (!matches.length) return;
    const next = (matchPtr + dir + matches.length) % matches.length;
    setMatchPtr(next);
    const el = segRefs.current[matches[next]];
    const list = listRef.current;
    if (el && list) list.scrollTo({ top: el.offsetTop - list.offsetTop - 16, behavior: "smooth" });
  };

  return (
    <div className="vid-grid">
      <div className="vid-left">
        <div className="player">
          <div ref={mountRef} style={{ width: "100%", height: "100%" }} />
        </div>
        {children}
      </div>

      <aside className="transcript">
        <div className="ts-hd">
          <div className="ts-hd-row">
            <span className="section-title" style={{ fontSize: 16 }}>
              Transcript
            </span>
            <span className="kicker">{timed ? "click a line to jump" : "AI-cleaned"}</span>
          </div>
          <div className="ts-search">
            <span style={{ color: "var(--ink-3)" }}>⌕</span>
            <input
              placeholder="Search this transcript…"
              value={q}
              onChange={(e) => {
                setQ(e.target.value);
                setMatchPtr(0);
              }}
              spellCheck={false}
              aria-label="Search transcript"
            />
            {q.trim() && (
              <>
                <span className="count">
                  {matches.length ? `${matchPtr + 1} / ${matches.length}` : "0"}
                </span>
                <button className="nav-btn" onClick={() => gotoMatch(-1)} type="button" aria-label="Previous match">
                  ↑
                </button>
                <button className="nav-btn" onClick={() => gotoMatch(1)} type="button" aria-label="Next match">
                  ↓
                </button>
              </>
            )}
          </div>
        </div>
        <div className="ts-list" ref={listRef}>
          {items.length === 0 && (
            <div style={{ padding: 16, color: "var(--ink-3)", fontSize: 13.5 }}>Transcript processing…</div>
          )}
          {items.map((it, i) => {
            const cls =
              "ts-seg" +
              (i === activeIdx ? " active" : "") +
              (it.chapter ? " chap" : "") +
              (it.start == null ? " noseek" : "");
            const inner = (
              <>
                {it.start != null && <span className="ts-t">{formatTimecode(it.start)}</span>}
                <span className="ts-x">{highlight(it.text, q.trim())}</span>
              </>
            );
            if (it.start == null) {
              return (
                <div
                  key={i}
                  ref={(el) => {
                    segRefs.current[i] = el;
                  }}
                  className={cls}
                >
                  {inner}
                </div>
              );
            }
            const at = it.start;
            return (
              <button
                key={i}
                ref={(el) => {
                  segRefs.current[i] = el;
                }}
                className={cls}
                onClick={() => seek(at)}
                type="button"
              >
                {inner}
              </button>
            );
          })}
        </div>
      </aside>
    </div>
  );
}
