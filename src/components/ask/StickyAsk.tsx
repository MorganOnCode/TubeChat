"use client";

import { useEffect, useState } from "react";
import { Mark } from "@/components/brand/Mark";
import { useAsk } from "./AskProvider";

/**
 * Slim ask bar that reveals once the hero ask box scrolls out of view. Clicking
 * the field scrolls back to the hero; the arrow submits the current query.
 */
export function StickyAsk() {
  const { query, submit } = useAsk();
  const [shown, setShown] = useState(false);

  useEffect(() => {
    const target = document.querySelector("main .ask");
    if (!target) return;
    const io = new IntersectionObserver(
      ([entry]) => setShown(!entry.isIntersecting && entry.boundingClientRect.top < 0),
      { threshold: 0 },
    );
    io.observe(target);
    return () => io.disconnect();
  }, []);

  return (
    <div className={"sticky-ask" + (shown ? " show" : "")} aria-hidden={!shown}>
      <div className="wrap row gap16" style={{ padding: "11px 32px" }}>
        <div className="brand" style={{ gap: 9 }}>
          <Mark size={22} />
          <span className="name" style={{ fontSize: 16 }}>
            tube<b>chat</b>
          </span>
        </div>
        <div
          className="sticky-field row gap12"
          onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
        >
          <span style={{ color: "var(--accent)", fontSize: 15 }}>⌕</span>
          <span
            style={{
              flex: 1,
              color: "var(--ink-3)",
              fontSize: 14.5,
              overflow: "hidden",
              whiteSpace: "nowrap",
              textOverflow: "ellipsis",
            }}
          >
            {query || "Ask anything across the archive…"}
          </span>
          <button
            className="send"
            style={{ width: 32, height: 32 }}
            onClick={(e) => {
              e.stopPropagation();
              submit();
            }}
            type="button"
          >
            ↑
          </button>
        </div>
      </div>
    </div>
  );
}
