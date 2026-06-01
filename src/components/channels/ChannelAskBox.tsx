"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/** Compact "ask this channel" box (scope pre-set to one channel). */
export function ChannelAskBox({
  channelId,
  channelName,
  videoCount,
}: {
  channelId: string;
  channelName: string;
  videoCount: number;
}) {
  const router = useRouter();
  const [ask, setAsk] = useState("");

  const go = (q?: string) => {
    const text = (q ?? ask).trim();
    if (!text) return;
    const p = new URLSearchParams();
    p.set("q", text);
    p.set("channels", channelId);
    router.push(`/ask?${p.toString()}`);
  };

  const suggestions = [
    `What are ${channelName}’s strongest claims?`,
    "Summarize their latest video",
    "Where do they disagree with the mainstream?",
  ];

  return (
    <div className="askch">
      <div className="askch-hd">
        <span style={{ color: "var(--accent)" }}>◈</span> Ask {channelName}
      </div>
      <div className="askch-body">
        <textarea
          className="askch-ta"
          rows={2}
          spellCheck={false}
          placeholder={`Ask anything across ${channelName}’s ${videoCount} videos…`}
          value={ask}
          onChange={(e) => setAsk(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              go();
            }
          }}
          aria-label={`Ask ${channelName}`}
        />
        <div className="askch-bar">
          <span className="chip-sm">scope: this channel</span>
          <button className="send" style={{ width: 34, height: 34 }} onClick={() => go()} type="button">
            ↑
          </button>
        </div>
        <div className="askch-sugg">
          {suggestions.map((s) => (
            <button
              key={s}
              className="suggest"
              style={{ fontSize: 12.5 }}
              onClick={() => go(s)}
              type="button"
            >
              <span className="arr">↗</span>
              {s}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
