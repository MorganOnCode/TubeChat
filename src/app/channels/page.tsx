import type { Metadata } from "next";
import "@/styles/channels.css";
import { getChannelCards } from "@/lib/channels";
import { ChannelsIndexClient } from "@/components/channels/ChannelsIndexClient";

export const revalidate = 300;

export const metadata: Metadata = {
  title: "Channels — tubechat",
  description: "Browse the UFO, UAP & NHI research channels indexed by tubechat. Ask across one or all.",
};

function topicFiltersFrom(channels: { topics: string[] }[]): string[] {
  const counts = new Map<string, number>();
  for (const c of channels) {
    for (const t of c.topics) counts.set(t, (counts.get(t) ?? 0) + 1);
  }
  const top = [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 7)
    .map(([t]) => t);
  return ["All", ...top];
}

export default async function ChannelsPage() {
  const channels = await getChannelCards();
  const totalVideos = channels.reduce((sum, c) => sum + c.videoCount, 0);
  const topicFilters = topicFiltersFrom(channels);

  return (
    <ChannelsIndexClient
      channels={channels}
      topicFilters={topicFilters}
      totalVideos={totalVideos}
    />
  );
}
