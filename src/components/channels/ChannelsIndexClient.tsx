"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ChannelAvatar } from "@/components/ui/ChannelAvatar";
import { Eyebrow } from "@/components/ui/Eyebrow";
import { Popover } from "@/components/ask/Popover";
import { formatCount } from "@/lib/format";
import { channelHandle, channelHref, type ChannelCard } from "@/lib/channel-utils";

const SORTS: [string, string][] = [
  ["active", "Most active"],
  ["subs", "Most subscribers"],
  ["name", "Name"],
];

export function ChannelsIndexClient({
  channels,
  topicFilters,
  totalVideos,
}: {
  channels: ChannelCard[];
  topicFilters: string[];
  totalVideos: number;
}) {
  const [q, setQ] = useState("");
  const [topic, setTopic] = useState("All");
  const [sort, setSort] = useState("active");

  const list = useMemo(() => {
    const filtered = channels.filter(
      (c) =>
        (topic === "All" || c.topics.some((t) => t.toLowerCase().includes(topic.toLowerCase()))) &&
        c.name.toLowerCase().includes(q.toLowerCase()),
    );
    return [...filtered].sort((a, b) => {
      if (sort === "subs") return (b.subscriberCount ?? 0) - (a.subscriberCount ?? 0);
      if (sort === "name") return a.name.localeCompare(b.name);
      return b.videoCount - a.videoCount;
    });
  }, [channels, q, topic, sort]);

  const sortLabel = SORTS.find((s) => s[0] === sort)?.[1] ?? "Most active";

  return (
    <div className="wrap chx-wrap">
      <div className="chx-head">
        <div>
          <Eyebrow>
            {channels.length} channels · {totalVideos.toLocaleString()} videos indexed
          </Eyebrow>
          <h1 className="display" style={{ fontSize: "clamp(30px,3.6vw,46px)", marginTop: 14 }}>
            Indexed <em>channels</em>.
          </h1>
          <p className="lede" style={{ marginTop: 8 }}>
            Every creator tubechat reads. Browse, then ask across one channel or all of them.
          </p>
        </div>
        <div className="chx-controls">
          <div className="chx-search">
            <span style={{ color: "var(--ink-3)" }}>⌕</span>
            <input
              placeholder="Search channels…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              spellCheck={false}
            />
          </div>
          <Popover
            align="right"
            width={200}
            trigger={({ toggle }) => (
              <button className="btn" onClick={toggle} type="button">
                Sort: {sortLabel} ▾
              </button>
            )}
          >
            {({ close }) => (
              <div className="pop-list" style={{ maxHeight: "none" }}>
                {SORTS.map(([k, label]) => (
                  <div
                    key={k}
                    className={"opt" + (sort === k ? " on" : "")}
                    onClick={() => {
                      setSort(k);
                      close();
                    }}
                    role="radio"
                    aria-checked={sort === k}
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        setSort(k);
                        close();
                      }
                    }}
                  >
                    <span className="rd" />
                    <span>{label}</span>
                  </div>
                ))}
              </div>
            )}
          </Popover>
        </div>
      </div>

      {topicFilters.length > 1 && (
        <div className="chx-topicbar">
          {topicFilters.map((t) => (
            <button
              key={t}
              className={"topic" + (t === topic ? " hot" : "")}
              style={{ fontSize: 13, padding: "7px 13px" }}
              onClick={() => setTopic(t)}
              type="button"
            >
              {t}
            </button>
          ))}
        </div>
      )}

      <div className="chx-grid">
        {list.map((c) => (
          <Link key={c.id} href={channelHref(c)} className="chx-card">
            <div className="top">
              <ChannelAvatar logoUrl={c.thumbnailUrl} name={c.name} size="sm" />
              <div className="meta">
                <div className="nm">{c.name}</div>
                <div className="hd">{channelHandle(c)}</div>
              </div>
              {c.videoCount > 0 && (
                <span className="live-dot" style={{ marginLeft: "auto" }} title="indexed" />
              )}
            </div>
            {c.description && (
              <div
                className="blurb"
                style={{
                  display: "-webkit-box",
                  WebkitLineClamp: 2,
                  WebkitBoxOrient: "vertical",
                  overflow: "hidden",
                }}
              >
                {c.description}
              </div>
            )}
            <div className="chx-stats">
              <div className="chx-stat">
                <span className="n">{formatCount(c.subscriberCount)}</span>
                <span className="l">subs</span>
              </div>
              <div className="chx-stat">
                <span className="n">{c.videoCount}</span>
                <span className="l">videos</span>
              </div>
              <div className="chx-stat">
                <span className="n">{formatCount(c.segmentCount)}</span>
                <span className="l">segments</span>
              </div>
            </div>
            {c.topics.length > 0 && (
              <div className="row gap6 wrapf">
                {c.topics.map((t) => (
                  <span key={t} className="topic" style={{ fontSize: 11.5, padding: "4px 9px" }}>
                    {t}
                  </span>
                ))}
              </div>
            )}
            <div className="foot">
              <span className="btn">View channel</span>
              <span className="btn accent">◈ Ask</span>
            </div>
          </Link>
        ))}
        {!list.length && <div style={{ padding: 30, color: "var(--ink-3)" }}>No channels match.</div>}
      </div>
    </div>
  );
}
