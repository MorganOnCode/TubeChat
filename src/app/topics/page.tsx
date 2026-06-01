import type { Metadata } from "next";
import "@/styles/topics.css";
import { sql } from "@/lib/db";
import { getTopics } from "@/lib/topics-data";
import { TopicsIndexClient } from "@/components/topics/TopicsIndexClient";

export const revalidate = 300;

export const metadata: Metadata = {
  title: "Topics — tubechat",
  description: "Browse the themes tubechat has clustered across the UFO/UAP archive.",
};

async function getSegmentCount(): Promise<number> {
  try {
    const [r] = await sql<{ c: number }[]>`SELECT COUNT(*)::int AS c FROM transcript_chunks`;
    return r?.c ?? 0;
  } catch {
    return 0;
  }
}

export default async function TopicsPage() {
  const [topics, segments] = await Promise.all([getTopics(), getSegmentCount()]);
  return <TopicsIndexClient topics={topics} segments={segments} />;
}
