"use client";

import Link from "next/link";
import { formatTimecode } from "@/lib/format";
import type { AskSource } from "@/lib/ask-types";

export function ClipCard({
  source,
  n,
  active,
  onEnter,
  innerRef,
}: {
  source: AskSource;
  n: number;
  active: boolean;
  onEnter?: () => void;
  innerRef?: (el: HTMLAnchorElement | null) => void;
}) {
  const thumb = `https://i.ytimg.com/vi/${source.videoId}/mqdefault.jpg`;
  return (
    <Link
      ref={innerRef}
      href={source.url}
      className={"clip-card" + (active ? " active" : "")}
      onMouseEnter={onEnter}
      style={{ display: "block", textDecoration: "none", color: "inherit" }}
    >
      <div className="thumb" style={{ height: 78 }}>
        {/* eslint-disable-next-line @next/next/no-img-element -- remote YT thumbnail */}
        <img src={thumb} alt="" loading="lazy" />
      </div>
      <div className="row gap8" style={{ marginTop: 9 }}>
        <span className="cite-n">{n}</span>
        <span
          style={{
            fontSize: 12.5,
            color: "var(--ink-2)",
            fontWeight: 500,
            minWidth: 0,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {source.channel}
        </span>
        {source.startSeconds != null && (
          <span className="mono" style={{ marginLeft: "auto", fontSize: 11, color: "var(--accent)" }}>
            {formatTimecode(source.startSeconds)}
          </span>
        )}
      </div>
      <div style={{ fontSize: 12, color: "var(--ink-3)", marginTop: 5, lineHeight: 1.4 }}>
        {source.title}
      </div>
    </Link>
  );
}
