import "server-only";

import { z } from "zod";
import { isTrustedOllamaBaseUrl, OLLAMA_CLOUD_BASE_URL, type AiConfig } from "@/lib/ai/config";
import { AiProviderError, MAX_MODEL_OUTPUT_TOKENS } from "@/lib/ai/gemma";

export type OllamaConfig = Extract<AiConfig, { provider: "ollama" }>;
export type OllamaCloudConfig = Extract<AiConfig, { provider: "ollama-cloud" }>;

const DEFAULT_TIMEOUT_MS = 60_000;
const DEFAULT_CLOUD_TIMEOUT_MS = 45_000;
const DEFAULT_MAX_RESPONSE_BYTES = 512 * 1024;

const ollamaResponseSchema = z.object({
  model: z.string().trim().min(1),
  message: z.object({
    role: z.literal("assistant"),
    content: z.string(),
  }),
  done: z.literal(true),
});

/** Builds the fixed Ollama chat endpoint and rejects public, credentialed, or ambiguous URLs. */
export function buildOllamaUrl(baseUrl: string): string {
  let url: URL;
  try {
    url = new URL(baseUrl);
  } catch {
    throw new AiProviderError("NOT_CONFIGURED", "OLLAMA_BASE_URL is not a valid URL.");
  }
  if (!isTrustedOllamaBaseUrl(baseUrl)) {
    throw new AiProviderError("NOT_CONFIGURED", "OLLAMA_BASE_URL must use a trusted loopback address.");
  }
  // The provider API path is fixed; callers cannot redirect requests to an
  // arbitrary loopback service path through configuration.
  url.pathname = "/api/chat";
  return url.toString();
}

/** Ollama Cloud is intentionally pinned to its official HTTPS chat endpoint. */
export function buildOllamaCloudUrl(baseUrl: string): string {
  if (baseUrl !== OLLAMA_CLOUD_BASE_URL) {
    throw new AiProviderError("NOT_CONFIGURED", "Ollama Cloud must use the official HTTPS endpoint.");
  }
  return `${OLLAMA_CLOUD_BASE_URL}/api/chat`;
}

function concatBytes(chunks: Uint8Array[], total: number): Uint8Array {
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

type OllamaMessages = {
  empty: string;
  timeout: string;
  unreadable: string;
  oversized: string;
  unavailable: string;
  status: string;
  invalidJson: string;
  invalidEnvelope: string;
};

const LOCAL_MESSAGES: OllamaMessages = {
  empty: "The local AI service returned an empty response.",
  timeout: "The local AI service request timed out.",
  unreadable: "The local AI service response could not be read.",
  oversized: "The local AI service response exceeds the allowed size.",
  unavailable: "The local AI service is unavailable.",
  status: "The local AI service returned an error status.",
  invalidJson: "The local AI service response was not valid JSON.",
  invalidEnvelope: "The local AI service response was not the expected shape.",
};

const CLOUD_MESSAGES: OllamaMessages = {
  empty: "Ollama Cloud returned an empty response.",
  timeout: "The Ollama Cloud request timed out.",
  unreadable: "The Ollama Cloud response could not be read.",
  oversized: "The Ollama Cloud response exceeds the allowed size.",
  unavailable: "Ollama Cloud is unavailable.",
  status: "Ollama Cloud returned an error status.",
  invalidJson: "The Ollama Cloud response was not valid JSON.",
  invalidEnvelope: "The Ollama Cloud response was not the expected shape.",
};

async function readResponseText(body: ReadableStream<Uint8Array> | null, maxBytes: number, signal: AbortSignal, messages: OllamaMessages): Promise<string> {
  const reader = body?.getReader();
  if (!reader) throw new AiProviderError("AI_UNAVAILABLE", messages.empty);
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    let result: Awaited<ReturnType<typeof reader.read>>;
    try {
      result = await reader.read();
    } catch {
      if (signal.aborted) throw new AiProviderError("AI_UNAVAILABLE", messages.timeout);
      throw new AiProviderError("AI_UNAVAILABLE", messages.unreadable);
    }
    if (result.done) break;
    total += result.value.byteLength;
    if (total > maxBytes) {
      void reader.cancel();
      throw new AiProviderError("AI_UNAVAILABLE", messages.oversized);
    }
    chunks.push(result.value);
  }
  return new TextDecoder().decode(concatBytes(chunks, total));
}

async function requestOllamaChat(options: { config: OllamaConfig | OllamaCloudConfig; prompt: string; timeoutMs?: number; maxResponseBytes?: number }): Promise<string> {
  const { config, prompt } = options;
  const cloud = config.provider === "ollama-cloud";
  const timeoutMs = options.timeoutMs ?? (cloud ? DEFAULT_CLOUD_TIMEOUT_MS : DEFAULT_TIMEOUT_MS);
  const maxResponseBytes = options.maxResponseBytes ?? DEFAULT_MAX_RESPONSE_BYTES;
  const messages = cloud ? CLOUD_MESSAGES : LOCAL_MESSAGES;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    let response: Response;
    try {
      response = await fetch(cloud ? buildOllamaCloudUrl(config.baseUrl) : buildOllamaUrl(config.baseUrl), {
        method: "POST",
        signal: controller.signal,
        redirect: "error",
        headers: {
          "content-type": "application/json",
          ...(cloud ? { authorization: `Bearer ${config.apiKey}` } : {}),
        },
        body: JSON.stringify({
          model: config.model,
          messages: [{ role: "user", content: prompt }],
          stream: false,
          format: "json",
          think: false,
          options: { temperature: 0, num_predict: MAX_MODEL_OUTPUT_TOKENS },
        }),
      });
    } catch {
      if (controller.signal.aborted) throw new AiProviderError("AI_UNAVAILABLE", messages.timeout);
      throw new AiProviderError("AI_UNAVAILABLE", messages.unavailable);
    }
    if (cloud && (response.status === 401 || response.status === 403)) {
      throw new AiProviderError("AI_UNAVAILABLE", "Ollama Cloud authentication failed.");
    }
    if (!response.ok) {
      throw new AiProviderError("AI_UNAVAILABLE", messages.status);
    }
    const responseText = await readResponseText(response.body, maxResponseBytes, controller.signal, messages);
    let payload: unknown;
    try {
      payload = JSON.parse(responseText);
    } catch {
      throw new AiProviderError("AI_UNAVAILABLE", messages.invalidJson);
    }
    const parsed = ollamaResponseSchema.safeParse(payload);
    if (!parsed.success || parsed.data.model !== config.model) {
      throw new AiProviderError("AI_UNAVAILABLE", messages.invalidEnvelope);
    }
    return parsed.data.message.content;
  } finally {
    clearTimeout(timer);
  }
}

/** Calls local Ollama once and returns only the assistant message text from a validated response envelope. */
export function requestOllamaText(options: { config: OllamaConfig; prompt: string; timeoutMs?: number; maxResponseBytes?: number }): Promise<string> {
  return requestOllamaChat(options);
}

/** Calls the official Ollama Cloud chat API with a server-side Bearer credential. */
export function requestOllamaCloudText(options: { config: OllamaCloudConfig; prompt: string; timeoutMs?: number; maxResponseBytes?: number }): Promise<string> {
  return requestOllamaChat(options);
}
