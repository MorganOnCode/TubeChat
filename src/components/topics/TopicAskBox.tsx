"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/** "Ask about this topic" — seeds the Ask flow with the user's question. */
export function TopicAskBox({ topicName, videoCount }: { topicName: string; videoCount: number }) {
  const router = useRouter();
  const [ask, setAsk] = useState("");

  const go = (q?: string) => {
    const t = (q ?? ask).trim();
    if (!t) return;
    router.push(`/ask?q=${encodeURIComponent(t)}`);
  };

  const suggestions = [
    `What's the strongest evidence for ${topicName}?`,
    `Where do channels disagree on ${topicName}?`,
    `Give me the timeline of ${topicName}`,
  ];

  return (
    <div className="askt">
      <div className="askt-hd">
        <span style={{ color: "var(--accent)" }}>◈</span> Ask about{" "}
        <b style={{ color: "var(--ink)", fontWeight: 600, marginLeft: 4 }}>{topicName}</b>
      </div>
      <div className="askt-body">
        <textarea
          className="askt-ta"
          rows={2}
          spellCheck={false}
          placeholder={`Ask anything about ${topicName} across ${videoCount} videos…`}
          value={ask}
          onChange={(e) => setAsk(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              go();
            }
          }}
          aria-label={`Ask about ${topicName}`}
        />
        <div className="askt-bar">
          <span className="chip-sm">scope: {topicName}</span>
          <button className="send" style={{ width: 34, height: 34 }} onClick={() => go()} type="button">
            ↑
          </button>
        </div>
        <div className="askt-sugg">
          {suggestions.map((s) => (
            <button key={s} className="suggest" style={{ fontSize: 12.5 }} onClick={() => go(s)} type="button">
              <span className="arr">↗</span>
              {s}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
