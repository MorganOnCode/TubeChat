"use client";

import { useRef, useState } from "react";
import { Popover } from "./Popover";
import { ChannelAvatar } from "@/components/ui/ChannelAvatar";
import { useAsk, type DatePreset } from "./AskProvider";

const DATE_PRESETS: DatePreset[] = [
  { key: "any", label: "Any date" },
  { key: "7d", label: "Last 7 days" },
  { key: "30d", label: "Last 30 days" },
  { key: "6m", label: "Last 6 months" },
  { key: "1y", label: "Last year" },
];

function ytLabel(url: string): string {
  try {
    const u = new URL(url);
    const id = u.searchParams.get("v") || u.pathname.split("/").pop();
    return id ? "Video · " + id.slice(0, 6) : "YouTube video";
  } catch {
    return "YouTube video";
  }
}

export function ChannelFilter() {
  const { scope, setScope, channels } = useAsk();
  const sel = scope.channels;
  const [q, setQ] = useState("");
  const byId = new Map(channels.map((c) => [c.id, c]));
  const label =
    sel.length === 0
      ? "All channels"
      : sel.length === 1
        ? byId.get(sel[0])?.name ?? "1 channel"
        : `${sel.length} channels`;
  const list = channels.filter((c) => c.name.toLowerCase().includes(q.toLowerCase()));
  const toggle = (id: string) =>
    setScope({ channels: sel.includes(id) ? sel.filter((x) => x !== id) : [...sel, id] });

  return (
    <Popover
      width={310}
      trigger={({ toggle: t }) => (
        <button className={"pill" + (sel.length ? " on" : "")} onClick={t} type="button">
          {label} <span style={{ opacity: 0.6 }}>▾</span>
        </button>
      )}
    >
      {() => (
        <>
          <div className="pop-hd">
            <span className="pop-ttl">Channels</span>
            <span className="mono" style={{ fontSize: 11, color: "var(--ink-3)" }}>
              {channels.length} indexed
            </span>
          </div>
          <div className="pop-search">
            <span style={{ color: "var(--ink-3)" }}>⌕</span>
            <input
              placeholder="Search channels…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              spellCheck={false}
            />
          </div>
          <div className="pop-list">
            {list.map((c) => {
              const on = sel.includes(c.id);
              return (
                <div
                  key={c.id}
                  className={"opt" + (on ? " on" : "")}
                  onClick={() => toggle(c.id)}
                  role="checkbox"
                  aria-checked={on}
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      toggle(c.id);
                    }
                  }}
                >
                  <span className="cb">{on ? "✓" : ""}</span>
                  <ChannelAvatar logoUrl={c.logoUrl} name={c.name} size="tiny" />
                  <span className="nm">{c.name}</span>
                  {typeof c.videoCount === "number" && <span className="ct">{c.videoCount}</span>}
                </div>
              );
            })}
            {!list.length && (
              <div style={{ padding: "12px 8px", fontSize: 13, color: "var(--ink-3)" }}>
                No channels match “{q}”.
              </div>
            )}
          </div>
          <div className="pop-foot">
            <button className="pop-link" onClick={() => setScope({ channels: [] })} type="button">
              Clear
            </button>
            <button
              className="pop-link"
              onClick={() => setScope({ channels: channels.map((c) => c.id) })}
              type="button"
            >
              Select all
            </button>
          </div>
        </>
      )}
    </Popover>
  );
}

export function DateFilter() {
  const { scope, setScope } = useAsk();
  const cur = scope.date;
  return (
    <Popover
      width={236}
      align="right"
      trigger={({ toggle }) => (
        <button className={"pill" + (cur.key !== "any" ? " on" : "")} onClick={toggle} type="button">
          {cur.label} <span style={{ opacity: 0.6 }}>▾</span>
        </button>
      )}
    >
      {({ close }) => (
        <>
          <div className="pop-hd">
            <span className="pop-ttl">Date range</span>
          </div>
          <div className="pop-list" style={{ maxHeight: "none" }}>
            {DATE_PRESETS.map((p) => {
              const on = cur.key === p.key;
              return (
                <div
                  key={p.key}
                  className={"opt" + (on ? " on" : "")}
                  onClick={() => {
                    setScope({ date: p });
                    close();
                  }}
                  role="radio"
                  aria-checked={on}
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      setScope({ date: p });
                      close();
                    }
                  }}
                >
                  <span className="rd" />
                  <span>{p.label}</span>
                </div>
              );
            })}
          </div>
        </>
      )}
    </Popover>
  );
}

export function AddScope({ topics = [] }: { topics?: string[] }) {
  const { scope, setScope } = useAsk();
  const [url, setUrl] = useState("");
  const idSeq = useRef(0);

  const addUrl = (close: () => void) => {
    if (!url.trim()) return;
    setScope({
      sources: [...scope.sources, { id: "u" + idSeq.current++, type: "video", label: ytLabel(url) }],
    });
    setUrl("");
    close();
  };
  const addTopic = (t: string, close: () => void) => {
    if (scope.sources.some((s) => s.id === "t" + t)) {
      close();
      return;
    }
    setScope({ sources: [...scope.sources, { id: "t" + t, type: "topic", label: t }] });
    close();
  };

  return (
    <Popover
      width={306}
      trigger={({ toggle }) => (
        <button className="icon-btn" title="Add to scope" onClick={toggle} type="button">
          ＋
        </button>
      )}
    >
      {({ close }) => (
        <>
          <div className="pop-sec" style={{ paddingTop: 2 }}>
            Ask about a specific video
          </div>
          <div className="url-row">
            <input
              placeholder="Paste a YouTube URL…"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") addUrl(close);
              }}
              spellCheck={false}
            />
            <button
              className="btn accent"
              style={{ padding: "8px 12px" }}
              onClick={() => addUrl(close)}
              type="button"
            >
              Add
            </button>
          </div>
          {topics.length > 0 && (
            <>
              <div className="pop-sec">Add a topic to scope</div>
              <div className="row gap6 wrapf" style={{ padding: "0 4px 4px" }}>
                {topics.slice(0, 6).map((t) => (
                  <button
                    key={t}
                    className="suggest"
                    style={{ fontSize: 12, padding: "5px 10px" }}
                    onClick={() => addTopic(t, close)}
                    type="button"
                  >
                    {t}
                  </button>
                ))}
              </div>
            </>
          )}
          <div className="pop-foot">
            <span style={{ fontSize: 11.5, color: "var(--ink-faint)", lineHeight: 1.4 }}>
              Uploads aren’t supported — tubechat answers from indexed transcripts.
            </span>
          </div>
        </>
      )}
    </Popover>
  );
}

export function ScopeChips({ inBar = false }: { inBar?: boolean }) {
  const { scope, setScope } = useAsk();
  const s = scope.sources;
  if (!s.length) return null;
  return (
    <>
      {s.map((src) => (
        <span key={src.id} className={inBar ? "pill on" : "scope-chip"}>
          {src.type === "topic" ? "#" : "▶"} {src.label}
          <span
            className="x"
            onClick={() => setScope({ sources: s.filter((x) => x.id !== src.id) })}
          >
            ×
          </span>
        </span>
      ))}
    </>
  );
}
