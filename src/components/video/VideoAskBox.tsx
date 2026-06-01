"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/** "Ask about this video" — routes to the Ask flow scoped to this single video. */
export function VideoAskBox({ youtubeId, videoTitle }: { youtubeId: string; videoTitle: string }) {
  const router = useRouter();
  const [text, setText] = useState("");

  const go = (q?: string) => {
    const t = (q ?? text).trim();
    if (!t) return;
    const p = new URLSearchParams();
    p.set("q", t);
    p.set("video", youtubeId);
    router.push(`/ask?${p.toString()}`);
  };

  const chips = ["Summarize this video", "What are the key claims?", "What’s left unverified?"];
  const short = videoTitle.length > 46 ? videoTitle.slice(0, 46) + "…" : videoTitle;

  return (
    <div className="vask">
      <div className="vask-hd">
        <span className="tagdot">◈</span> Ask about this video
      </div>
      <div className="vask-body">
        <textarea
          className="vask-ta"
          rows={2}
          spellCheck={false}
          placeholder={`Ask anything about “${short}”`}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              go();
            }
          }}
          aria-label="Ask about this video"
        />
        <div className="vask-bar">
          <span className="chip-sm">scope: this video</span>
          <button className="send" style={{ width: 34, height: 34 }} onClick={() => go()} type="button">
            ↑
          </button>
        </div>
        <div className="vask-chips">
          {chips.map((c) => (
            <button key={c} className="vask-chip" onClick={() => go(c)} type="button">
              {c}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
