import type { AskEvent } from "./ask-types";

export interface AskRequest {
  question: string;
  history?: { role: "user" | "assistant"; content: string }[];
  videoId?: string;
  channelId?: string;
}

/**
 * POST /api/ask and dispatch each newline-delimited JSON event to `onEvent`.
 * Throws on a non-OK response or aborted/failed stream.
 */
export async function streamAsk(
  body: AskRequest,
  onEvent: (e: AskEvent) => void,
  signal?: AbortSignal,
): Promise<void> {
  const res = await fetch("/api/ask", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal,
  });
  if (!res.ok || !res.body) {
    throw new Error(`Request failed: ${res.status}`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = "";

  const flush = (line: string) => {
    const trimmed = line.trim();
    if (!trimmed) return;
    try {
      onEvent(JSON.parse(trimmed) as AskEvent);
    } catch {
      /* ignore malformed line */
    }
  };

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    let idx = buf.indexOf("\n");
    while (idx !== -1) {
      flush(buf.slice(0, idx));
      buf = buf.slice(idx + 1);
      idx = buf.indexOf("\n");
    }
  }
  flush(buf);
}
