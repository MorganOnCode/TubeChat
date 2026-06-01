/**
 * Postgres adapter — replaces @supabase/supabase-js end-to-end.
 *
 * The app talks to a self-hosted Postgres (pgvector image) over DATABASE_URL.
 * Helpers preserve the *return shapes* of the old supabase.ts helpers (nested
 * channel / transcript / tags) but drop the `client` argument — callers no
 * longer construct a client.
 */

import postgres from "postgres";
import pgvector from "pgvector/utils";
import type { AskSource } from "./ask-types";

// ---------------------------------------------------------------------------
// Connection (lazy: Next collects route metadata at build time without env)
// ---------------------------------------------------------------------------

declare global {
    // eslint-disable-next-line no-var
    var __tubechatPg: ReturnType<typeof postgres> | undefined;
}

function buildSql(): ReturnType<typeof postgres> {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
        throw new Error("DATABASE_URL is not set. Configure it via docker-compose or .env.");
    }
    return postgres(connectionString, {
        max: 10,
        idle_timeout: 30,
        connect_timeout: 10,
        prepare: false,
        // Return timestamps as strings (like the old Supabase/PostgREST JSON),
        // not JS Date objects — keeps the `string` types honest and avoids
        // `.split('T')` style crashes on top-level timestamp columns.
        types: {
            date: {
                to: 1184,
                from: [1082, 1083, 1114, 1184], // date, time, timestamp, timestamptz
                serialize: (v: unknown) => v as string,
                parse: (v: string) => v,
            },
        },
    });
}

function getSql(): ReturnType<typeof postgres> {
    if (!globalThis.__tubechatPg) {
        globalThis.__tubechatPg = buildSql();
    }
    return globalThis.__tubechatPg;
}

// Proxy: callers use `sql\`...\`` (and sql.begin/json/etc.) but the underlying
// client is constructed lazily on first use.
export const sql = new Proxy(
    function () { /* never called directly */ } as unknown as ReturnType<typeof postgres>,
    {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        apply(_t, _this, args) { return (getSql() as any).apply(null, args); },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        get(_t, prop) { return (getSql() as any)[prop]; },
    }
);

// ---------------------------------------------------------------------------
// Types (mirror the old supabase.ts exports)
// ---------------------------------------------------------------------------

export interface Channel {
    id: string;
    youtube_id: string;
    name: string;
    slug?: string;
    description?: string;
    thumbnail_url?: string;
    subscriber_count?: number;
    video_count?: number;
    created_at: string;
    updated_at: string;
}

export interface Collection {
    id: string;
    name: string;
    slug: string;
    description?: string;
    created_at: string;
}

export interface Video {
    id: string;
    channel_id: string;
    youtube_id: string;
    title: string;
    description?: string;
    published_at?: string;
    duration_seconds?: number;
    thumbnail_url?: string;
    view_count?: number;
    video_type?: string;
    status: "pending" | "processing" | "completed" | "failed";
    created_at: string;
    updated_at: string;
}

export interface Transcript {
    id: string;
    video_id: string;
    raw_text?: string;
    cleaned_text?: string;
    summary?: string;
    source?: "youtube_captions" | "extractor" | "whisper";
    processing_status: "pending" | "processing" | "completed" | "failed";
    created_at: string;
    updated_at: string;
}

export interface Tag {
    id: string;
    name: string;
    created_at: string;
}

export interface VideoWithDetails extends Video {
    channel?: Channel;
    transcript?: Partial<Transcript>;
    tags?: Tag[];
}

export interface ErrorReport {
    id: string;
    video_id: string;
    error_type: "typo" | "missing_content" | "wrong_speaker" | "other";
    description: string;
    timestamp_seconds?: number;
    status: "pending" | "reviewed" | "fixed" | "dismissed";
    created_at: string;
}

export interface SemanticChunk {
    id: string;
    video_id: string;
    content: string;
    start_time: number | null;
    similarity: number;
}

// ---------------------------------------------------------------------------
// pgvector helpers
// ---------------------------------------------------------------------------

/** Serialise a JS number[] embedding to pgvector wire format '[1,2,...]'. */
export function toVectorLiteral(arr: number[]): string {
    return pgvector.toSql(arr);
}

/** Semantic search over transcript_chunks (replaces the match_transcript_chunks RPC). */
export async function matchTranscriptChunks(
    embedding: number[],
    matchThreshold: number,
    matchCount: number
): Promise<SemanticChunk[]> {
    if (!embedding.length) return [];
    const vec = toVectorLiteral(embedding);
    return await sql<SemanticChunk[]>`
        SELECT * FROM match_transcript_chunks(${vec}::vector, ${matchThreshold}, ${matchCount})
    `;
}

// ---------------------------------------------------------------------------
// App helpers (used by pages + /api routes). No `client` argument.
// ---------------------------------------------------------------------------

const tagsAgg = (alias = "v") => sql`
    COALESCE(
      (SELECT jsonb_agg(to_jsonb(tg) ORDER BY tg.name)
         FROM video_tags vt JOIN tags tg ON tg.id = vt.tag_id
        WHERE vt.video_id = ${sql(alias)}.id),
      '[]'::jsonb
    )
`;

/** Paginated completed-video list with channel + summary + tags. */
export async function getVideos(options: {
    limit?: number;
    offset?: number;
    channelId?: string;
} = {}): Promise<VideoWithDetails[]> {
    const { limit = 20, offset = 0, channelId } = options;
    return await sql<VideoWithDetails[]>`
        SELECT
            v.*,
            to_jsonb(c) AS channel,
            CASE WHEN t.video_id IS NULL THEN NULL
                 ELSE jsonb_build_object('summary', t.summary) END AS transcript,
            ${tagsAgg()} AS tags
        FROM videos v
        LEFT JOIN channels c    ON c.id       = v.channel_id
        LEFT JOIN transcripts t ON t.video_id = v.id
        WHERE v.status = 'completed'
          ${channelId ? sql`AND v.channel_id = ${channelId}` : sql``}
        ORDER BY v.published_at DESC NULLS LAST
        LIMIT ${limit} OFFSET ${offset}
    `;
}

/** Single completed video by YouTube ID, full transcript + tags. */
export async function getVideoByYoutubeId(youtubeId: string): Promise<VideoWithDetails | null> {
    const rows = await sql<VideoWithDetails[]>`
        SELECT
            v.*,
            to_jsonb(c) AS channel,
            to_jsonb(t) AS transcript,
            ${tagsAgg()} AS tags
        FROM videos v
        LEFT JOIN channels c    ON c.id       = v.channel_id
        LEFT JOIN transcripts t ON t.video_id = v.id
        WHERE v.youtube_id = ${youtubeId} AND v.status = 'completed'
        LIMIT 1
    `;
    return rows[0] ?? null;
}

/** Keyword search: ILIKE on title/description UNION FTS on transcript raw_text. */
export async function searchVideos(
    query: string,
    options: { limit?: number; offset?: number } = {}
): Promise<VideoWithDetails[]> {
    const { limit = 20, offset = 0 } = options;
    const q = query.trim();
    if (!q) return [];
    const like = `%${q}%`;

    return await sql<VideoWithDetails[]>`
        WITH hits AS (
            SELECT v.id FROM videos v
            WHERE v.status = 'completed'
              AND (v.title ILIKE ${like} OR v.description ILIKE ${like})
            UNION
            SELECT t.video_id AS id
            FROM transcripts t
            JOIN videos v ON v.id = t.video_id AND v.status = 'completed'
            WHERE to_tsvector('english', COALESCE(t.raw_text, ''))
                  @@ websearch_to_tsquery('english', ${q})
        )
        SELECT
            v.*,
            to_jsonb(c) AS channel,
            CASE WHEN t.video_id IS NULL THEN NULL
                 ELSE jsonb_build_object('summary', t.summary, 'cleaned_text', t.cleaned_text) END AS transcript,
            ${tagsAgg()} AS tags
        FROM hits
        JOIN videos v           ON v.id       = hits.id
        LEFT JOIN channels c    ON c.id       = v.channel_id
        LEFT JOIN transcripts t ON t.video_id = v.id
        ORDER BY v.published_at DESC NULLS LAST
        LIMIT ${limit} OFFSET ${offset}
    `;
}

/** Tag-name search → completed videos carrying a matching tag. */
export async function tagSearchVideos(query: string, limit = 20): Promise<VideoWithDetails[]> {
    const q = query.trim();
    if (!q) return [];
    return await sql<VideoWithDetails[]>`
        WITH hits AS (
            SELECT DISTINCT vt.video_id AS id
            FROM tags tg
            JOIN video_tags vt ON vt.tag_id = tg.id
            WHERE tg.name ILIKE ${`%${q}%`}
        )
        SELECT
            v.*,
            to_jsonb(c) AS channel,
            CASE WHEN t.video_id IS NULL THEN NULL
                 ELSE jsonb_build_object('summary', t.summary, 'cleaned_text', t.cleaned_text) END AS transcript,
            ${tagsAgg()} AS tags
        FROM hits
        JOIN videos v           ON v.id = hits.id AND v.status = 'completed'
        LEFT JOIN channels c    ON c.id       = v.channel_id
        LEFT JOIN transcripts t ON t.video_id = v.id
        ORDER BY v.published_at DESC NULLS LAST
        LIMIT ${limit}
    `;
}

/** Full video details for a set of ids (used to hydrate semantic hits). */
export async function getVideosByIds(ids: string[]): Promise<VideoWithDetails[]> {
    if (!ids.length) return [];
    return await sql<VideoWithDetails[]>`
        SELECT
            v.*,
            to_jsonb(c) AS channel,
            CASE WHEN t.video_id IS NULL THEN NULL
                 ELSE jsonb_build_object('summary', t.summary, 'cleaned_text', t.cleaned_text) END AS transcript,
            ${tagsAgg()} AS tags
        FROM videos v
        LEFT JOIN channels c    ON c.id       = v.channel_id
        LEFT JOIN transcripts t ON t.video_id = v.id
        WHERE v.id IN ${sql(ids)} AND v.status = 'completed'
    `;
}

/** Insert a user error report; returns the inserted row. */
export async function submitErrorReport(report: {
    video_id: string;
    error_type: ErrorReport["error_type"];
    description: string;
    timestamp_seconds?: number;
}): Promise<ErrorReport> {
    const [row] = await sql<ErrorReport[]>`
        INSERT INTO error_reports (video_id, error_type, description, timestamp_seconds)
        VALUES (${report.video_id}, ${report.error_type}, ${report.description}, ${report.timestamp_seconds ?? null})
        RETURNING *
    `;
    return row;
}

/** All tags, alphabetical. */
export async function getAllTags(): Promise<Tag[]> {
    return await sql<Tag[]>`SELECT * FROM tags ORDER BY name`;
}

// ---------------------------------------------------------------------------
// Shared answers (permalinks /a/{id})
// ---------------------------------------------------------------------------

export interface SavedAnswer {
    id: string;
    question: string;
    answer: string;
    sources: AskSource[];
    created_at: string;
}

/** Persist an Ask result and return its id (used by the "Share" action). */
export async function saveAnswer(
    question: string,
    answer: string,
    sources: AskSource[]
): Promise<string> {
    const [row] = await sql<{ id: string }[]>`
        INSERT INTO answers (question, answer, sources)
        VALUES (${question}, ${answer}, ${JSON.stringify(sources)}::jsonb)
        RETURNING id
    `;
    return row.id;
}

/** Fetch a shared answer by id; null on miss or malformed id. */
export async function getAnswer(id: string): Promise<SavedAnswer | null> {
    try {
        const [row] = await sql<SavedAnswer[]>`
            SELECT id, question, answer, sources, created_at
            FROM answers WHERE id = ${id} LIMIT 1
        `;
        return row ?? null;
    } catch {
        return null;
    }
}
