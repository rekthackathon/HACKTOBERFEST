import { afterEach, describe, expect, it, vi } from "vitest";
import { getAiConfig } from "@/lib/ai/config";
import { createCompilationService, requestAiText } from "@/lib/ai/compilation";
import { AiProviderError } from "@/lib/ai/gemma";
import { buildOllamaUrl, requestOllamaText, type OllamaConfig } from "@/lib/ai/ollama";
import { MemoryCache } from "@/lib/cache";
import type { CompiledRequirements, Opportunity } from "@/lib/contracts";
import { mockOpportunities } from "@/lib/mocks";

vi.mock("server-only", () => ({}));

const ollamaConfig: OllamaConfig = { provider: "ollama", baseUrl: "http://127.0.0.1:11434", model: "qwen3:8b" };
const opportunity = mockOpportunities[0] as Opportunity;

function modelBody(model = ollamaConfig.model): string {
  return JSON.stringify({
    opportunityId: opportunity.id,
    model,
    compiledAt: "1999-01-01T00:00:00.000Z",
    completeness: "complete",
    requirements: [{
      id: "country",
      kind: "country",
      description: "Based in Malaysia or Singapore",
      allowed: ["MY", "SG"],
      evidence: opportunity.evidence[0],
    }],
    warnings: [],
  });
}

function ollamaEnvelope(content: string, extra: Record<string, unknown> = {}): Record<string, unknown> {
  return { model: ollamaConfig.model, message: { role: "assistant", content }, done: true, ...extra };
}

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("AI provider configuration and selection", () => {
  it("defaults local inference to Ollama Qwen3 8B", () => {
    vi.stubEnv("AI_PROVIDER", "");
    vi.stubEnv("OLLAMA_BASE_URL", "");
    vi.stubEnv("OLLAMA_MODEL", "");
    expect(getAiConfig()).toEqual(ollamaConfig);
  });

  it("preserves explicit Gemma configuration and HTTPS enforcement", () => {
    vi.stubEnv("AI_PROVIDER", "gemma");
    vi.stubEnv("AI_BASE_URL", "https://generativelanguage.googleapis.com");
    vi.stubEnv("AI_API_KEY", "test-key");
    vi.stubEnv("AI_MODEL", "gemma-test");
    expect(getAiConfig()).toEqual({
      provider: "gemma",
      baseUrl: "https://generativelanguage.googleapis.com",
      apiKey: "test-key",
      model: "gemma-test",
    });
    vi.stubEnv("AI_BASE_URL", "http://generativelanguage.googleapis.com");
    expect(() => getAiConfig()).toThrow(/Gemma inference is not configured/);
  });

  it("routes Ollama and Gemma configurations to their respective wire protocols", async () => {
    const fetchStub = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify(ollamaEnvelope('{"ok":true}')), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: '{"ok":true}' }] } }] }), { status: 200 }));
    vi.stubGlobal("fetch", fetchStub);

    await expect(requestAiText(ollamaConfig, "LOCAL_PROMPT")).resolves.toBe('{"ok":true}');
    await expect(requestAiText({ provider: "gemma", baseUrl: "https://generativelanguage.googleapis.com", apiKey: "key", model: "gemma-test" }, "REMOTE_PROMPT")).resolves.toBe('{"ok":true}');

    expect(String(fetchStub.mock.calls[0]?.[0])).toBe("http://127.0.0.1:11434/api/chat");
    expect(String(fetchStub.mock.calls[1]?.[0])).toContain("generativelanguage.googleapis.com/v1beta/models/gemma-test:generateContent");
  });
});

describe("Ollama client", () => {
  it("restricts the endpoint to loopback addresses", () => {
    expect(buildOllamaUrl("http://localhost:11434/")).toBe("http://localhost:11434/api/chat");
    expect(buildOllamaUrl("http://[::1]:11434")).toBe("http://[::1]:11434/api/chat");
    expect(() => buildOllamaUrl("http://192.168.1.10:11434")).toThrowError(AiProviderError);
    expect(() => buildOllamaUrl("https://ollama.example.com")).toThrowError(AiProviderError);
    expect(() => buildOllamaUrl("http://user:pass@127.0.0.1:11434")).toThrowError(AiProviderError);
  });

  it("posts a bounded non-streaming JSON chat with thinking disabled", async () => {
    const fetchStub = vi.fn().mockResolvedValue(new Response(JSON.stringify(ollamaEnvelope(modelBody())), { status: 200 }));
    vi.stubGlobal("fetch", fetchStub);
    await expect(requestOllamaText({ config: ollamaConfig, prompt: "PROMPT" })).resolves.toBe(modelBody());

    const init = fetchStub.mock.calls[0]?.[1] as RequestInit;
    const body = JSON.parse(String(init.body));
    expect(init.method).toBe("POST");
    expect(body).toMatchObject({ model: "qwen3:8b", stream: false, format: "json", think: false });
    expect(body.messages).toEqual([{ role: "user", content: "PROMPT" }]);
    expect(body.options.num_predict).toBeGreaterThan(0);
  });

  it("rejects malformed envelopes and oversized responses", async () => {
    vi.stubGlobal("fetch", vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ message: { role: "assistant", content: "{}" }, done: true }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify(ollamaEnvelope("x".repeat(128))), { status: 200 })));
    await expect(requestOllamaText({ config: ollamaConfig, prompt: "PROMPT" })).rejects.toMatchObject({ code: "AI_UNAVAILABLE" });
    await expect(requestOllamaText({ config: ollamaConfig, prompt: "PROMPT", maxResponseBytes: 32 })).rejects.toMatchObject({ code: "AI_UNAVAILABLE" });
  });

  it("returns safe errors when Ollama is unavailable", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("connect ECONNREFUSED 127.0.0.1:11434 secret detail")));
    const error = await requestOllamaText({ config: ollamaConfig, prompt: "PROMPT" }).catch((caught: unknown) => caught);
    expect(error).toMatchObject({ code: "AI_UNAVAILABLE", message: "The local AI service is unavailable." });
    expect((error as Error).message).not.toContain("ECONNREFUSED");
  });

  it("aborts a request at the configured timeout", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("fetch", vi.fn((_url: string, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => reject(new Error("aborted")));
    })));
    const pending = requestOllamaText({ config: ollamaConfig, prompt: "PROMPT", timeoutMs: 500 });
    const assertion = expect(pending).rejects.toMatchObject({ code: "AI_UNAVAILABLE", message: "The local AI service request timed out." });
    await vi.advanceTimersByTimeAsync(600);
    await assertion;
  });
});

describe("Ollama compilation", () => {
  it("compiles a successful Ollama chat response through existing validation and evidence grounding", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify(ollamaEnvelope(modelBody())), { status: 200 })));
    const outcome = await createCompilationService({ config: () => ollamaConfig, nowIso: () => "2026-10-31T00:00:00.000Z" }).compile(opportunity);
    expect(outcome.status).toBe("compiled");
    if (outcome.status !== "compiled") throw new Error("Expected compilation success.");
    expect(outcome.value).toMatchObject({ opportunityId: opportunity.id, model: "qwen3:8b", compiledAt: "2026-10-31T00:00:00.000Z" });
    expect(outcome.value.requirements[0]?.kind).toBe("country");
  });

  it("rejects malformed model-generated JSON without caching it", async () => {
    const fetchStub = vi.fn().mockResolvedValue(new Response(JSON.stringify(ollamaEnvelope("not json")), { status: 200 }));
    vi.stubGlobal("fetch", fetchStub);
    const service = createCompilationService({ config: () => ollamaConfig });
    expect((await service.compile(opportunity)).status).toBe("failed");
    expect((await service.compile(opportunity)).status).toBe("failed");
    expect(fetchStub).toHaveBeenCalledTimes(2);
  });

  it("isolates cache entries by provider even when the model identifier is identical", async () => {
    const sharedCache = new MemoryCache<CompiledRequirements>({ ttlMs: 60_000, maxEntries: 10 });
    const gemmaSameModel = { provider: "gemma" as const, baseUrl: "https://generativelanguage.googleapis.com", apiKey: "key", model: ollamaConfig.model };
    let ollamaRequests = 0;
    let gemmaRequests = 0;
    const ollamaService = createCompilationService({
      config: () => ollamaConfig,
      cache: sharedCache,
      request: async () => { ollamaRequests += 1; return modelBody(); },
    });
    const gemmaService = createCompilationService({
      config: () => gemmaSameModel,
      cache: sharedCache,
      request: async () => { gemmaRequests += 1; return modelBody(); },
    });

    expect((await ollamaService.compile(opportunity)).status).toBe("compiled");
    expect((await gemmaService.compile(opportunity)).status).toBe("compiled");
    expect((await ollamaService.compile(opportunity)).status).toBe("cache_hit");
    expect((await gemmaService.compile(opportunity)).status).toBe("cache_hit");
    expect({ ollamaRequests, gemmaRequests, entries: sharedCache.size }).toEqual({ ollamaRequests: 1, gemmaRequests: 1, entries: 2 });
  });
});
