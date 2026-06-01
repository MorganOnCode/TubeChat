"use client";

import { AskProvider, type ScopeChannel } from "@/components/ask/AskProvider";
import { AskBox, Suggestions } from "@/components/ask/AskBox";
import { StickyAsk } from "@/components/ask/StickyAsk";
import { Eyebrow } from "@/components/ui/Eyebrow";
import { TopicRail, type TopicChip } from "./TopicRail";
import { TrendingPanel, ActivityPanel, type TrendItem, type ActivityItem, type NowIndexing } from "./Panels";

export function HomeHero({
  channels,
  statsLabel,
  suggestions,
  topics,
  topicNames,
  trending,
  trendMax,
  activity,
  nowIndexing,
}: {
  channels: ScopeChannel[];
  statsLabel: string;
  suggestions: string[];
  topics: TopicChip[];
  topicNames: string[];
  trending: TrendItem[];
  trendMax: number;
  activity: ActivityItem[];
  nowIndexing: NowIndexing | null;
}) {
  return (
    <AskProvider channels={channels}>
      <StickyAsk />
      <section className="b-hero">
        <div>
          <Eyebrow>{statsLabel}</Eyebrow>
          <h1 className="display" style={{ marginTop: 18, fontSize: "clamp(38px, 4.6vw, 60px)" }}>
            Every UFO transcript,
            <br />
            <em>searchable.</em>
          </h1>
          <p className="lede" style={{ marginTop: 18 }}>
            Stop scrubbing through hours of video. Ask a question, get a cited answer pulled from the
            indexed archive — every claim links to the exact clip.
          </p>
          <div style={{ marginTop: 28 }}>
            <AskBox compact topics={topicNames} />
          </div>
          {suggestions.length > 0 && (
            <div style={{ marginTop: 16 }}>
              <Suggestions items={suggestions} />
            </div>
          )}
          {topics.length > 0 && (
            <div style={{ marginTop: 28 }}>
              <div className="kicker" style={{ marginBottom: 12 }}>
                Popular topics
              </div>
              <TopicRail topics={topics} limit={7} />
            </div>
          )}
        </div>
        <div className="col gap16">
          <TrendingPanel items={trending} max={trendMax} />
          <ActivityPanel items={activity} nowIndexing={nowIndexing} />
        </div>
      </section>
    </AskProvider>
  );
}
