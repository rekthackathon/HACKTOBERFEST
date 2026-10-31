/**
 * Manually invoked local Ollama integration test. It is excluded from the
 * normal Vitest include, so npm run check never starts or contacts Ollama.
 *
 * Prerequisites:
 *   ollama pull qwen3:8b
 *   ollama serve
 *
 * Run:
 *   RUN_OLLAMA_LIVE=1 npx vitest run --config tests/vitest.live.config.ts tests/ollama.live.ts
 *
 * OLLAMA_BASE_URL and OLLAMA_MODEL may override the loopback/default model.
 * The production client still enforces a loopback URL.
 */
import { describe, expect, it } from "vitest";

const LIVE_GUARD = process.env.RUN_OLLAMA_LIVE === "1";

describe.skipIf(!LIVE_GUARD)("local Ollama Qwen3 compilation (manual)", () => {
  it("compiles a synthetic opportunity through the real local provider", async () => {
    process.env.AI_PROVIDER = "ollama";
    process.env.OLLAMA_BASE_URL ||= "http://127.0.0.1:11434";
    process.env.OLLAMA_MODEL ||= "qwen3:8b";

    const [{ createCompilationService }, { mockOpportunities }] = await Promise.all([
      import("@/lib/ai/compilation"),
      import("@/lib/mocks"),
    ]);
    const opportunity = mockOpportunities[0];
    const outcome = await createCompilationService().compile(opportunity);

    if (outcome.status === "failed") {
      throw new Error(`Live Ollama compilation failed safely: ${outcome.failure.code}: ${outcome.failure.message}`);
    }
    expect(outcome.value.opportunityId).toBe(opportunity.id);
    expect(outcome.value.model).toBe(process.env.OLLAMA_MODEL);
    expect(outcome.value.requirements.length).toBeGreaterThan(0);
    console.log(`Ollama live compilation: ${outcome.status}; model=${outcome.value.model}; completeness=${outcome.value.completeness}; requirements=${outcome.value.requirements.length}`);
  });
});
