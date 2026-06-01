import type { Metadata } from "next";
import "@/styles/timeline.css";
import { TimelineClient } from "@/components/timeline/TimelineClient";

export const metadata: Metadata = {
  title: "Timeline — tubechat",
  description: "Scrub 80 years of UAP history; open any event to pull the matching clips from the archive.",
};

export default function TimelinePage() {
  return <TimelineClient />;
}
