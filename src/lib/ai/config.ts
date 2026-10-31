import "server-only";
import { z } from "zod";

const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

/** A local inference server such as Ollama (http://localhost:11434/v1) needs no TLS or key. */
function isLoopback(url: string) {
  try {
    return LOOPBACK_HOSTS.has(new URL(url).hostname);
  } catch {
    return false;
  }
}

const aiConfigSchema = z.object({
  baseUrl: z.url().refine((url) => url.startsWith("https://") || (url.startsWith("http://") && isLoopback(url)), "AI_BASE_URL must use HTTPS; plain HTTP is allowed only for a local server"),
  apiKey: z.string().trim(),
  model: z.string().trim().min(1),
}).refine((config) => config.apiKey.length > 0 || isLoopback(config.baseUrl), { message: "AI_API_KEY is required for remote providers", path: ["apiKey"] });

/** Lazy validation keeps credential-free builds working. Never import into client components. */
export function getAiConfig() {
  const parsed = aiConfigSchema.safeParse({ baseUrl: process.env.AI_BASE_URL, apiKey: process.env.AI_API_KEY ?? "", model: process.env.AI_MODEL });
  if (!parsed.success) throw new Error("AI inference is not configured. Set AI_BASE_URL and AI_MODEL (and AI_API_KEY for remote providers) on the server.");
  return parsed.data;
}
