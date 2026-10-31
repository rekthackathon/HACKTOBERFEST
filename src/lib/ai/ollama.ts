import "server-only";

import { z } from "zod";
import { isTrustedOllamaBaseUrl, type AiConfig } from "@/lib/ai/config";
import { AiProviderError, MAX_MODEL_OUTPUT_TOKENS } from "@/lib/ai/gemma";

export type OllamaConfig = Extract<AiConfig, { provider: "ollama" }>;

const DEFAULT_TIMEOUT_MS = 60_000;
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

function concatBytes(chunks: Uint8Array[], total: number): Uint8Array {
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

async function readResponseText(body: ReadableStream<Uint8Array> | null, maxBytes: number, signal: AbortSignal): Promise<string> {
  const reader = body?.getReader();
  if (!reader) throw new AiProviderError("AI_UNAVAILABLE", "The local AI service returned an empty response.");
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    let result: Awaited<ReturnType<typeof reader.read>>;
    try {
      result = await reader.read();
    } catch {
      if (signal.aborted) throw new AiProviderError("AI_UNAVAILABLE", "The local AI service request timed out.");
      throw new AiProviderError("AI_UNAVAILABLE", "The local AI service response could not be read.");
    }
    if (result.done) break;
    total += result.value.byteLength;
    if (total > maxBytes) {
      void reader.cancel();
      throw new AiProviderError("AI_UNAVAILABLE", "The local AI service response exceeds the allowed size.");
    }
    chunks.push(result.value);
  }
  return new TextDecoder().decode(concatBytes(chunks, total));
}

/** Calls local Ollama once and returns only the assistant message text from a validated response envelope. */
export async function requestOllamaText(options: { config: OllamaConfig; prompt: string; timeoutMs?: number; maxResponseBytes?: number }): Promise<string> {
  const { config, prompt } = options;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const maxResponseBytes = options.maxResponseBytes ?? DEFAULT_MAX_RESPONSE_BYTES;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    let response: Response;
    try {
      response = await fetch(buildOllamaUrl(config.baseUrl), {
        method: "POST",
        signal: controller.signal,
        redirect: "error",
        headers: { "content-type": "application/json" },
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
      if (controller.signal.aborted) throw new AiProviderError("AI_UNAVAILABLE", "The local AI service request timed out.");
      throw new AiProviderError("AI_UNAVAILABLE", "The local AI service is unavailable.");
    }
    if (!response.ok) {
      throw new AiProviderError("AI_UNAVAILABLE", "The local AI service returned an error status.");
    }
    const responseText = await readResponseText(response.body, maxResponseBytes, controller.signal);
    let payload: unknown;
    try {
      payload = JSON.parse(responseText);
    } catch {
      throw new AiProviderError("AI_UNAVAILABLE", "The local AI service response was not valid JSON.");
    }
    const parsed = ollamaResponseSchema.safeParse(payload);
    if (!parsed.success || parsed.data.model !== config.model) {
      throw new AiProviderError("AI_UNAVAILABLE", "The local AI service response was not the expected shape.");
    }
    return parsed.data.message.content;
  } finally {
    clearTimeout(timer);
  }
}
