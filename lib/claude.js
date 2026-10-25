import Anthropic from "@anthropic-ai/sdk";

// An OpenRouter key (sk-or-...) is detected automatically and routed through
// OpenRouter's Anthropic-compatible endpoint. Otherwise the Claude API is used directly.
const orKey = process.env.OPENROUTER_API_KEY || (process.env.ANTHROPIC_API_KEY?.startsWith("sk-or-") ? process.env.ANTHROPIC_API_KEY : "");
export const OPENROUTER = Boolean(orKey);

export const client = OPENROUTER
  ? new Anthropic({ baseURL: process.env.OPENROUTER_BASE_URL || "https://openrouter.ai/api", apiKey: null, authToken: orKey })
  : new Anthropic();
export const MODEL = process.env.CLAUDE_MODEL || (OPENROUTER ? "anthropic/claude-opus-5.5" : "claude-opus-5-5");

// Server-side refusal fallback: if a request is declined, the API re-runs it on a
// fallback model inside the same call. Set USE_FALLBACKS=0 to turn it off.
const fallbackParams =
  process.env.USE_FALLBACKS === "0" ? {} : { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" };

export function stream(params) {
  if (OPENROUTER) {
    // Keep to the core Messages API surface that OpenRouter translates.
    const { output_config, thinking, ...core } = params;
    return client.messages.stream({ model: MODEL, ...core });
  }
  return client.beta.messages.stream({ model: MODEL, ...fallbackParams, ...params });
}

export function textOf(message) {
  return message.content.filter((b) => b.type === "text").map((b) => b.text).join("");
}
