// Client-safe BYOK provider catalog — types + the fixed preset table ONLY.
// NO SDK value imports here, so this module is safe to import from client
// components (the ModelSettings UI, AskProvider). The server-side adapters that
// actually call the SDKs live in `providers.server.ts`.
//
// Providers are a fixed enum and their base URLs are server-side constants, so
// users never supply an arbitrary URL — there is no SSRF surface. User input is
// only: provider id (enum) + model (string) + api key (string).

export type ByokProviderId = "openai" | "anthropic" | "openrouter" | "opencode-zen";

/** Which SDK code path serves a provider. */
export type ByokSdk = "openai" | "anthropic";

export interface ByokConfig {
    provider: ByokProviderId;
    model: string;
    apiKey: string;
}

export interface ProviderPreset {
    id: ByokProviderId;
    label: string;
    sdk: ByokSdk;
    /** undefined → OpenAI SDK default endpoint; set for the OpenAI-compatible gateways. */
    baseURL?: string;
    suggestedModels: string[];
    /** Where the user gets an API key. */
    keyUrl: string;
    /** Short hint about the key format, shown in the UI. */
    keyHint: string;
}

export const PROVIDER_PRESETS: Record<ByokProviderId, ProviderPreset> = {
    openai: {
        id: "openai",
        label: "OpenAI",
        sdk: "openai",
        baseURL: undefined,
        suggestedModels: ["gpt-4o", "gpt-4o-mini", "gpt-4.1", "gpt-4.1-mini"],
        keyUrl: "https://platform.openai.com/api-keys",
        keyHint: "starts with sk-…",
    },
    anthropic: {
        id: "anthropic",
        label: "Anthropic",
        sdk: "anthropic",
        baseURL: undefined,
        suggestedModels: ["claude-opus-4-8", "claude-sonnet-4-6", "claude-haiku-4-5"],
        keyUrl: "https://console.anthropic.com/settings/keys",
        keyHint: "starts with sk-ant-…",
    },
    openrouter: {
        id: "openrouter",
        label: "OpenRouter",
        sdk: "openai",
        baseURL: "https://openrouter.ai/api/v1",
        suggestedModels: ["openai/gpt-4o", "anthropic/claude-sonnet-4.5", "google/gemini-2.5-pro"],
        keyUrl: "https://openrouter.ai/keys",
        keyHint: "starts with sk-or-…",
    },
    "opencode-zen": {
        id: "opencode-zen",
        label: "OpenCode Zen",
        sdk: "openai",
        baseURL: "https://opencode.ai/zen/v1",
        suggestedModels: ["claude-sonnet-4", "gpt-5", "qwen3-coder"],
        keyUrl: "https://opencode.ai/auth",
        keyHint: "from opencode.ai/auth",
    },
};

export const BYOK_PROVIDER_IDS = Object.keys(PROVIDER_PRESETS) as ByokProviderId[];

/** Runtime validation shared by the ask route and the test endpoint. Returns a
 *  cleaned ByokConfig or a reason string. Never echoes the key. */
export function validateByok(input: unknown): { ok: true; config: ByokConfig } | { ok: false; reason: string } {
    if (!input || typeof input !== "object") return { ok: false, reason: "Missing config" };
    const { provider, model, apiKey } = input as Record<string, unknown>;
    if (typeof provider !== "string" || !(provider in PROVIDER_PRESETS)) {
        return { ok: false, reason: "Unknown provider" };
    }
    if (typeof model !== "string" || model.trim().length === 0) {
        return { ok: false, reason: "Model is required" };
    }
    if (typeof apiKey !== "string" || apiKey.trim().length === 0) {
        return { ok: false, reason: "API key is required" };
    }
    return {
        ok: true,
        config: { provider: provider as ByokProviderId, model: model.trim().slice(0, 200), apiKey: apiKey.trim() },
    };
}
