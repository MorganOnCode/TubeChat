/**
 * Server-only retrieval helpers (feat/search-efficiency): Reciprocal Rank Fusion
 * for hybrid (vector + keyword) search, plus the cache-key derivation shared by
 * the ask route and the curated pre-warm script.
 */
import { createHash } from "node:crypto";
import type { SemanticChunk } from "./db";

/** Normalize a question for cache-keying: lowercase, collapse whitespace, drop trailing punctuation. */
export function normalizeQuestion(q: string): string {
    return q.trim().toLowerCase().replace(/\s+/g, " ").replace(/[?!.\s]+$/, "");
}

/** Stable key for the query scope (a single video, a channel, or the whole archive). */
export function scopeKey(scope: { channelId?: string | null; videoId?: string | null }): string {
    if (scope.videoId) return `v:${scope.videoId}`;
    if (scope.channelId) return `c:${scope.channelId}`;
    return "";
}

/** sha256 cache key over (corpus_version, scope, mode, normalized question). */
export function cacheKey(corpusVersion: string, scope: string, mode: string, normalizedQuestion: string): string {
    return createHash("sha256")
        .update(`${corpusVersion}|${scope}|${mode}|${normalizedQuestion}`)
        .digest("hex");
}

/**
 * Contextual prefix prepended to a chunk's text *before embedding* (not displayed).
 * "{channel} — {title} ({date}): {content}" — cheap contextual retrieval that
 * lifts recall for channel/topic-scoped questions. Applied by the re-embed and
 * ingest scripts so every passage embedding carries its provenance.
 */
export function buildEmbedText(
    meta: { channel?: string | null; title?: string | null; publishedAt?: string | null },
    content: string,
): string {
    const date = meta.publishedAt ? new Date(meta.publishedAt).toISOString().slice(0, 10) : "";
    const head = [meta.channel, meta.title].filter(Boolean).join(" — ");
    const prefix = head ? `${head}${date ? ` (${date})` : ""}: ` : "";
    return prefix + content;
}

const RRF_K = 60;

/**
 * Reciprocal Rank Fusion. Merges several ranked chunk lists (e.g. vector top-30 +
 * keyword top-30) into one ranking by summing 1/(k + rank). Dedupes by chunk id,
 * preserving the first-seen chunk object. Returns the top-N fused chunks.
 */
export function rrfFuse(lists: SemanticChunk[][], topN: number): SemanticChunk[] {
    const scores = new Map<string, number>();
    const byId = new Map<string, SemanticChunk>();
    for (const list of lists) {
        list.forEach((hit, i) => {
            scores.set(hit.id, (scores.get(hit.id) ?? 0) + 1 / (RRF_K + i + 1));
            if (!byId.has(hit.id)) byId.set(hit.id, hit);
        });
    }
    return [...scores.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, topN)
        .map(([id]) => byId.get(id))
        .filter((c): c is SemanticChunk => Boolean(c));
}
