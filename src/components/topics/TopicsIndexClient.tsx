"use client";

import { useMemo, useState } from "react";
import { Eyebrow } from "@/components/ui/Eyebrow";
import { TopicCard } from "./TopicCard";
import { TCATS, type Topic } from "@/lib/topic-model";

export function TopicsIndexClient({ topics, segments }: { topics: Topic[]; segments: number }) {
  const [q, setQ] = useState("");
  const [cat, setCat] = useState("All");

  // Only show category chips that actually have topics (real tags are sparse).
  const presentCats = useMemo(() => {
    const set = new Set(topics.map((t) => t.cat));
    return TCATS.filter((c) => c === "All" || set.has(c));
  }, [topics]);

  const list = useMemo(
    () =>
      topics.filter(
        (t) => (cat === "All" || t.cat === cat) && t.n.toLowerCase().includes(q.toLowerCase()),
      ),
    [topics, q, cat],
  );

  return (
    <div className="wrap tpx-wrap">
      <div className="tpx-head">
        <div>
          <Eyebrow>
            {topics.length} topics · auto-clustered from {segments.toLocaleString()} segments
          </Eyebrow>
          <h1 className="display" style={{ fontSize: "clamp(30px,3.6vw,46px)", marginTop: 14 }}>
            Browse by <em>topic</em>.
          </h1>
          <p className="lede" style={{ marginTop: 8 }}>
            Every theme tubechat has clustered across the archive. Open one to see the clips and ask.
          </p>
        </div>
        <div className="tpx-controls">
          <div className="tpx-search">
            <span style={{ color: "var(--ink-3)" }}>⌕</span>
            <input
              placeholder="Search topics…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              spellCheck={false}
            />
          </div>
        </div>
      </div>

      {presentCats.length > 1 && (
        <div className="tpx-cats">
          {presentCats.map((c) => (
            <button
              key={c}
              className={"topic" + (c === cat ? " hot" : "")}
              style={{ fontSize: 13, padding: "7px 13px" }}
              onClick={() => setCat(c)}
              type="button"
            >
              {c}
            </button>
          ))}
        </div>
      )}

      <div className="tpx-grid">
        {list.map((t) => (
          <TopicCard key={t.slug} topic={t} />
        ))}
        {!list.length && <div style={{ padding: 30, color: "var(--ink-3)" }}>No topics match.</div>}
      </div>
    </div>
  );
}
