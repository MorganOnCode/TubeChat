// Server-only BYOK adapters. Imports both SDKs natively:
//   - OpenAI SDK (with a per-preset baseURL) for OpenAI / OpenRouter / OpenCode Zen
//   - native Anthropic SDK for Anthropic
// Never import this from a client component (it would bundle the SDKs to the
// browser). Only the ask route and the byok-test route import it.
import OpenAI from "openai";
import Anthropic from "@anthropic-ai/sdk";
import { PROVIDER_PRESETS, type ByokConfig } from "@/lib/providers";

export type ByokErrorCode =
    | "auth"
    | "rate_limit"
    | "model_not_found"
    | "bad_request"
    | "network"
    | "unknown";

/** A classified BYOK failure. Never carries the user's API key. */
export class ByokError extends Error {
    code: ByokErrorCode;
    providerMessage: string;
    constructor(code: ByokErrorCode, providerMessage: string) {
        super(`byok_${code}`);
        this.name = "ByokError";
        this.code = code;
        this.providerMessage = providerMessage;
    }
}

/** Map an SDK error (OpenAI or Anthropic — both expose `.status`/`.message`) to a
 *  ByokError. Status-based so it works for either SDK. Key never appears in errors. */
function classifyError(err: unknown): ByokError {
    const status = (err as { status?: number })?.status;
    const raw = (err as { message?: string })?.message;
    const providerMessage = typeof raw === "string" ? raw.slice(0, 300) : "Unknown error";
    let code: ByokErrorCode = "unknown";
    if (status === 401 || status === 403) code = "auth";
    else if (status === 404) code = "model_not_found";
    else if (status === 429) code = "rate_limit";
    else if (status === 400) code = "bad_request";
    else if (status === undefined) code = "network";
    return new ByokError(code, providerMessage);
}

function openaiClient(cfg: ByokConfig): OpenAI {
    const preset = PROVIDER_PRESETS[cfg.provider];
    return new OpenAI({ apiKey: cfg.apiKey, baseURL: preset.baseURL });
}

interface JSONArgs {
    system: string;
    user: string;
    maxTokens: number;
    temperature?: number;
}

interface StreamArgs {
    system: string;
    messages: { role: "user" | "assistant"; content: string }[];
    maxTokens: number;
    temperature?: number;
    signal?: AbortSignal;
}

/**
 * Non-streaming "JSON-ish" call for reformulate + followups. Returns the raw
 * assistant text; the caller does the existing tolerant JSON.parse. Best-effort:
 * throws a ByokError on provider failure (callers already try/catch these paths).
 */
export async function byokChatJSON(cfg: ByokConfig, args: JSONArgs): Promise<string> {
    const preset = PROVIDER_PRESETS[cfg.provider];
    try {
        if (preset.sdk === "anthropic") {
            const client = new Anthropic({ apiKey: cfg.apiKey });
            // No response_format on Anthropic — the prompt instructs JSON-only and
            // the caller parses tolerantly. Omit temperature (Opus/Fable 400 on it).
            const r = await client.messages.create({
                model: cfg.model,
                max_tokens: args.maxTokens,
                system: args.system,
                messages: [{ role: "user", content: args.user }],
            });
            return r.content
                .filter((b): b is Anthropic.TextBlock => b.type === "text")
                .map((b) => b.text)
                .join("");
        }
        // OpenAI-compatible path.
        const client = openaiClient(cfg);
        const base = {
            model: cfg.model,
            max_tokens: args.maxTokens,
            temperature: args.temperature,
            messages: [
                { role: "system" as const, content: args.system },
                { role: "user" as const, content: args.user },
            ],
        };
        try {
            const r = await client.chat.completions.create({
                ...base,
                response_format: { type: "json_object" },
            });
            return r.choices?.[0]?.message?.content ?? "";
        } catch (e) {
            // Some OpenAI-compatible providers/models reject response_format — retry plain.
            if (e instanceof OpenAI.BadRequestError) {
                const r = await client.chat.completions.create(base);
                return r.choices?.[0]?.message?.content ?? "";
            }
            throw e;
        }
    } catch (err) {
        throw classifyError(err);
    }
}

/**
 * Streaming synthesis call. Yields text deltas as they arrive, then a final
 * `{ usage }` (total tokens, best-effort — 0 if the provider reports none).
 * Respects the abort signal so a cancelled turn stops the upstream request.
 */
export async function* byokChatStream(
    cfg: ByokConfig,
    args: StreamArgs,
): AsyncGenerator<{ text?: string; usage?: number }> {
    const preset = PROVIDER_PRESETS[cfg.provider];
    try {
        if (preset.sdk === "anthropic") {
            const client = new Anthropic({ apiKey: cfg.apiKey });
            const stream = client.messages.stream(
                {
                    model: cfg.model,
                    max_tokens: args.maxTokens,
                    system: args.system,
                    messages: args.messages,
                },
                { signal: args.signal },
            );
            for await (const event of stream) {
                if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
                    yield { text: event.delta.text };
                }
            }
            const final = await stream.finalMessage();
            yield { usage: (final.usage?.input_tokens ?? 0) + (final.usage?.output_tokens ?? 0) };
            return;
        }
        // OpenAI-compatible path. `system` becomes the first message.
        const client = openaiClient(cfg);
        const completion = await client.chat.completions.create(
            {
                model: cfg.model,
                max_tokens: args.maxTokens,
                temperature: args.temperature,
                messages: [
                    { role: "system" as const, content: args.system },
                    ...args.messages,
                ],
                stream: true,
                // include_usage is OpenAI-specific; other compatible providers reject it.
                ...(cfg.provider === "openai" ? { stream_options: { include_usage: true } } : {}),
            },
            { signal: args.signal },
        );
        let usage = 0;
        for await (const part of completion) {
            const delta = part.choices?.[0]?.delta?.content;
            if (delta) yield { text: delta };
            if (part.usage?.total_tokens) usage = part.usage.total_tokens;
        }
        yield { usage };
    } catch (err) {
        throw classifyError(err);
    }
}

/** Minimal 1-token call used by the "Test connection" endpoint. Returns ok or a
 *  classified error code + message. Never logs/returns the key. */
export async function byokTest(cfg: ByokConfig): Promise<{ ok: true } | { ok: false; code: ByokErrorCode; error: string }> {
    const preset = PROVIDER_PRESETS[cfg.provider];
    try {
        if (preset.sdk === "anthropic") {
            const client = new Anthropic({ apiKey: cfg.apiKey });
            await client.messages.create({
                model: cfg.model,
                max_tokens: 1,
                messages: [{ role: "user", content: "ping" }],
            });
        } else {
            const client = openaiClient(cfg);
            await client.chat.completions.create({
                model: cfg.model,
                max_tokens: 1,
                messages: [{ role: "user", content: "ping" }],
            });
        }
        return { ok: true };
    } catch (err) {
        const e = classifyError(err);
        return { ok: false, code: e.code, error: e.providerMessage };
    }
}
