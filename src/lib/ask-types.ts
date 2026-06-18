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
  // Extractive mode (no LLM): the top fused chunks rendered as quote cards.
  // Used as the free-tier serve, the low-confidence fallback, and Phase-0 search.
  | { type: "extracts"; extracts: AskSource[] }
  // Answer-specific follow-up suggestions, generated after the answer finishes
  // (or replayed from cache). Sent after `done`, before the stream closes.
  | { type: "followups"; followups: string[] }
  | { type: "done"; tokensUsed: number; searchQuery: string | null; cached?: boolean; mode?: string }
  | { type: "error"; message: string };

export const STAGE_LABEL: Record<AskStage, string> = {
  searching: "Searching the indexed archive…",
  found: "Found relevant clips",
  reading: "Reading transcripts & ranking…",
  answering: "Synthesizing the answer…",
};
