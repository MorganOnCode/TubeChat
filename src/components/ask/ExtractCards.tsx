"use client";

import Link from "next/link";
import { formatTimecode } from "@/lib/format";
import type { AskSource } from "@/lib/ask-types";

/**
 * Extractive (no-LLM) answer: the top fused transcript chunks rendered as
 * snippet-forward quote cards. Used for the free-tier serve, the low-confidence
 * fallback, and Phase-0 search before any synthesis.
 */
export function ExtractCards({ extracts }: { extracts: AskSource[] }) {
  if (!extracts.length) return null;
  return (
    <div className="answer">
      <div className="kicker" style={{ marginBottom: 10, color: "var(--ink-3)" }}>
        Most relevant clips from the archive
      </div>
      <div className="col gap10">
        {extracts.map((s, i) => (
          <Link
            key={`${s.videoId}-${i}`}
            href={s.url}
            style={{
              display: "block",
              textDecoration: "none",
              color: "inherit",
              border: "1px solid var(--line-2)",
              borderRadius: 10,
              padding: "12px 14px",
              background: "var(--surface-2)",
            }}
          >
            <div className="row gap8" style={{ marginBottom: 6 }}>
              <span className="cite-n">{i + 1}</span>
              <span style={{ fontSize: 12.5, color: "var(--ink-2)", fontWeight: 500 }}>{s.channel}</span>
              <span
                style={{
                  fontSize: 12,
                  color: "var(--ink-3)",
                  minWidth: 0,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                · {s.title}
              </span>
              {s.startSeconds != null && (
                <span className="mono" style={{ marginLeft: "auto", fontSize: 11, color: "var(--accent)" }}>
                  ▶ {formatTimecode(s.startSeconds)}
                </span>
              )}
            </div>
            <div style={{ fontSize: 13.5, color: "var(--ink-2)", lineHeight: 1.5 }}>
              “{s.snippet}…”
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
