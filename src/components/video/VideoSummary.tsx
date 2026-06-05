"use client";

import { formatTimecode } from "@/lib/format";
import type { SummaryPoint } from "@/lib/transcript-utils";
import { useSeek } from "./VideoDetailClient";

/**
 * "Key takeaways" — an AI summary of the video shown as a list of bullets. Each
 * bullet anchored to a transcript moment is a button that seeks the player there;
 * unanchored bullets render as plain text (graceful fallback, like the transcript).
 */
export function VideoSummary({ points }: { points: SummaryPoint[] }) {
  const seek = useSeek();
  if (points.length === 0) return null;

  return (
    <div className="vsum">
      <div className="vsum-hd">
        <span className="vsum-ttl">
          <span className="tagdot">◈</span> Key takeaways
        </span>
        <span className="kicker">
          AI summary · {points.length} {points.length === 1 ? "point" : "points"}
        </span>
      </div>
      <div className="vsum-list">
        {points.map((p, i) =>
          p.start != null ? (
            <button key={i} className="vsum-item" onClick={() => seek(p.start as number)} type="button">
              <span className="vsum-ts">{formatTimecode(p.start)}</span>
              <span className="vsum-tx">{p.text}</span>
            </button>
          ) : (
            <div key={i} className="vsum-item noseek">
              <span className="vsum-tx">{p.text}</span>
            </div>
          ),
        )}
      </div>
      <div className="vsum-foot">Generated from the transcript — jump to any point to verify.</div>
    </div>
  );
}
