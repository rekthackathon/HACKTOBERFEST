import "server-only";
import { z } from "zod";

export const DEFAULT_OLLAMA_BASE_URL = "http://127.0.0.1:11434";
export const DEFAULT_OLLAMA_MODEL = "qwen3:8b";
export const OLLAMA_CLOUD_BASE_URL = "https://ollama.com";
export const DEFAULT_OLLAMA_CLOUD_MODEL = "gemma4:31b";
const LOOPBACK_V4_PATTERN = /^127(?:\.\d{1,3}){3}$/;

function isLoopbackHostname(hostname: string): boolean {
  const normalized = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  return normalized === "localhost"
    || normalized === "::1"
    || (LOOPBACK_V4_PATTERN.test(normalized) && normalized.split(".").every((part) => Number(part) <= 255));
}

export function isTrustedOllamaBaseUrl(value: string): boolean {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return false;
  }
  return isLoopbackHostname(url.hostname)
    && (url.protocol === "http:" || url.protocol === "https:")
    && !url.username
    && !url.password
    && !url.search
    && !url.hash;
}

const gemmaConfigSchema = z.object({
  provider: z.literal("gemma"),
  baseUrl: z.url().refine((url) => url.startsWith("https://"), "AI_BASE_URL must use HTTPS"),
  apiKey: z.string().trim().min(1),
  model: z.string().trim().min(1),
});

const ollamaConfigSchema = z.object({
  provider: z.literal("ollama"),
  baseUrl: z.url().refine(isTrustedOllamaBaseUrl, "OLLAMA_BASE_URL must use a trusted loopback address"),
  model: z.string().trim().min(1),
});

const ollamaCloudConfigSchema = z.object({
  provider: z.literal("ollama-cloud"),
  baseUrl: z.literal(OLLAMA_CLOUD_BASE_URL),
  apiKey: z.string().trim().min(1),
  model: z.string().trim().min(1),
});

export type AiConfig = z.infer<typeof gemmaConfigSchema>
  | z.infer<typeof ollamaConfigSchema>
  | z.infer<typeof ollamaCloudConfigSchema>;

/** Primary provider configuration for the evidence-backed compilation service. */
export function getAiConfig(): AiConfig {
  const provider = process.env.AI_PROVIDER?.trim() || "ollama";
  let candidate: Record<string, unknown>;
  let schema: typeof ollamaConfigSchema | typeof ollamaCloudConfigSchema | typeof gemmaConfigSchema;
  if (provider === "ollama") {
    candidate = {
        provider,
        baseUrl: process.env.OLLAMA_BASE_URL?.trim() || DEFAULT_OLLAMA_BASE_URL,
        model: process.env.OLLAMA_MODEL?.trim() || DEFAULT_OLLAMA_MODEL,
    };
    schema = ollamaConfigSchema;
  } else if (provider === "ollama-cloud") {
    candidate = {
      provider,
      baseUrl: OLLAMA_CLOUD_BASE_URL,
      apiKey: process.env.OLLAMA_API_KEY,
      model: process.env.OLLAMA_CLOUD_MODEL?.trim() || DEFAULT_OLLAMA_CLOUD_MODEL,
    };
    schema = ollamaCloudConfigSchema;
  } else {
    candidate = {
        provider,
        baseUrl: process.env.AI_BASE_URL,
        apiKey: process.env.AI_API_KEY,
        model: process.env.AI_MODEL,
    };
    schema = gemmaConfigSchema;
  }
  const parsed = schema.safeParse(candidate);
  if (!parsed.success) {
    if (provider !== "ollama" && provider !== "ollama-cloud" && provider !== "gemma") {
      throw new Error("AI inference is not configured. AI_PROVIDER must be ollama, ollama-cloud, or gemma.");
    }
    if (provider === "gemma") {
      throw new Error("Gemma inference is not configured. Set HTTPS AI_BASE_URL, AI_API_KEY, and AI_MODEL on the server.");
    }
    if (provider === "ollama-cloud") {
      throw new Error("Ollama Cloud inference is not configured. Set OLLAMA_API_KEY and optionally OLLAMA_CLOUD_MODEL on the server.");
    }
    throw new Error("Ollama inference is not configured. Set a valid OLLAMA_BASE_URL and OLLAMA_MODEL on the server.");
  }
  return parsed.data as AiConfig;
}

const openAiCompatibleConfigSchema = z.object({
  baseUrl: z.url().refine((value) => {
    const url = new URL(value);
    return url.protocol === "https:" || (url.protocol === "http:" && isLoopbackHostname(url.hostname));
  }, "AI_BASE_URL must use HTTPS; plain HTTP is allowed only for a loopback server"),
  apiKey: z.string().trim(),
  model: z.string().trim().min(1),
}).refine((config) => config.apiKey.length > 0 || isLoopbackHostname(new URL(config.baseUrl).hostname), {
  message: "AI_API_KEY is required for remote providers",
  path: ["apiKey"],
});

export type OpenAiCompatibleConfig = z.infer<typeof openAiCompatibleConfigSchema>;

/** Compatibility configuration for the connected MVP's `/v1/chat/completions` compiler. */
export function getOpenAiCompatibleConfig(): OpenAiCompatibleConfig {
  const parsed = openAiCompatibleConfigSchema.safeParse({
    baseUrl: process.env.AI_BASE_URL,
    apiKey: process.env.AI_API_KEY ?? "",
    model: process.env.AI_MODEL,
  });
  if (!parsed.success) {
    throw new Error("AI inference is not configured. Set AI_BASE_URL and AI_MODEL (and AI_API_KEY for remote providers) on the server.");
  }
  return parsed.data;
}
