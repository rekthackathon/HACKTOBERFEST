import "server-only";
import { z } from "zod";

const aiConfigSchema = z.object({
  baseUrl: z.url().refine((url) => url.startsWith("https://"), "AI_BASE_URL must use HTTPS"),
  apiKey: z.string().trim().min(1),
  model: z.string().trim().min(1),
});

/** Lazy validation keeps credential-free builds working. Never import into client components. */
export function getAiConfig() {
  const parsed = aiConfigSchema.safeParse({ baseUrl: process.env.AI_BASE_URL, apiKey: process.env.AI_API_KEY, model: process.env.AI_MODEL });
  if (!parsed.success) throw new Error("AI inference is not configured. Set AI_BASE_URL, AI_API_KEY, and AI_MODEL on the server.");
  return parsed.data;
}
