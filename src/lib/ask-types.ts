/** Shared client-safe types for the Ask flow (no db imports). */

export interface AskSource {
  videoId: string;
  channelId: string | null;
  title: string;
  channel: string;
  publishedAt: string | null;
  similarity: number;
  snippet: string;
  startSeconds: number | null;
  url: string;
}

export type AskStage = "searching" | "found" | "reading" | "answering";

export type AskEvent =
  | { type: "stage"; stage: AskStage; count?: number }
  | { type: "sources"; sources: AskSource[] }
  | { type: "token"; text: string }
  | { type: "done"; tokensUsed: number; searchQuery: string | null }
  | { type: "error"; message: string };

export const STAGE_LABEL: Record<AskStage, string> = {
  searching: "Searching the indexed archive…",
  found: "Found relevant clips",
  reading: "Reading transcripts & ranking…",
  answering: "Synthesizing the answer…",
};
