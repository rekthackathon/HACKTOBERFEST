import { afterEach, describe, expect, it, vi } from "vitest";
import type { CompiledRequirements } from "@/lib/contracts";
import {
  AiProviderError,
  buildCompilationPrompt,
  buildGemmaUrl,
  parseModelJson,
  requestGemmaText,
} from "@/lib/ai/gemma";
import { createCompilationService, createCompilationRateLimiter, type CompilationOutcome, type CompilationServiceDeps } from "@/lib/ai/compilation";
import { mockOpportunities } from "@/lib/mocks";
import { opportunitySchema, type Opportunity } from "@/lib/contracts";

// The modules mark themselves server-only; tests run under plain Node resolution.
vi.mock("server-only", () => ({}));

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const config = { provider: "gemma" as const, baseUrl: "https://generativelanguage.googleapis.com", apiKey: "test-only-key", model: "gemma-4-test-model" };
const FIXED_NOW_ISO = "2026-03-01T12:00:00.000Z";

const opportunity: Opportunity = mockOpportunities[0] as Opportunity;
const secondOpportunity: Opportunity = opportunitySchema.parse({ ...opportunity, id: "00000000-0000-4000-8000-000000000009" });

/** Builds a model output body in the raw JSON wire format the provider would return. */
function modelBody(current: Opportunity, extra: Record<string, unknown> = {}): string {
  return JSON.stringify({
    opportunityId: current.id,
    model: config.model,
    compiledAt: "1999-01-01T00:00:00.000Z",
    completeness: "complete",
    requirements: [
      { id: "country", kind: "country", description: "Based in Malaysia or Singapore", allowed: ["MY", "SG"], evidence: current.evidence[0] },
    ],
    warnings: ["All conditions were represented."],
    ...extra,
  });
}

type CompilationRecord = { prompt: string; responseText: string };
function createRecordingDeps(responses: string[]): { deps: Partial<CompilationServiceDeps>; records: CompilationRecord[] } {
  const records: CompilationRecord[] = [];
  const deps: Partial<CompilationServiceDeps> = {
    config: () => config,
    nowIso: () => FIXED_NOW_ISO,
    async request(requestConfig, prompt) {
      expect(requestConfig).toEqual(config);
      const responseText = responses[records.length] ?? responses[responses.length - 1] ?? "{}";
      records.push({ prompt, responseText });
      return responseText;
    },
  };
  return { deps, records };
}

function expectFailure(outcome: CompilationOutcome, code: string): { failure: { message: string; retryAfterSeconds?: number } } {
  if (outcome.status !== "failed") throw new Error(`Expected failure, received ${outcome.status}.`);
  expect(outcome.failure.code).toBe(code);
  return outcome;
}

function expectCompiled(outcome: CompilationOutcome): { value: CompiledRequirements } {
  if (outcome.status !== "compiled") throw new Error(`Expected compiled, received ${outcome.status}.`);
  return outcome;
}

function expectCacheHit(outcome: CompilationOutcome): { value: CompiledRequirements } {
  if (outcome.status !== "cache_hit") throw new Error(`Expected cache_hit, received ${outcome.status}.`);
  return outcome;
}

describe("Gemma client", () => {
  describe("buildGemmaUrl", () => {
    it("builds the real Google API URL from a versionless base URL", () => {
      const url = buildGemmaUrl(config.baseUrl, config.model);
      expect(url).toBe(`https://generativelanguage.googleapis.com/v1beta/models/${config.model}:generateContent`);
      expect(url).not.toContain(config.apiKey);
      expect(url.match(/\/v1beta/g)).toHaveLength(1);
    });

    it("does not append a second /v1beta when the base URL includes it", () => {
      const versionedBase = "https://generativelanguage.googleapis.com/v1beta";
      expect(buildGemmaUrl(versionedBase, config.model)).toBe(`${versionedBase}/models/${config.model}:generateContent`);
      expect(buildGemmaUrl(`${versionedBase}/`, config.model)).toBe(`${versionedBase}/models/${config.model}:generateContent`);
      expect(buildGemmaUrl(versionedBase, config.model).match(/\/v1beta/g)).toHaveLength(1);
    });

    it("rejects model identifiers that could alter the URL path", () => {
      expect(() => buildGemmaUrl(config.baseUrl, "gemma../x")).toThrowError(AiProviderError);
      expect(() => buildGemmaUrl(config.baseUrl, "gemma/v1:evil")).toThrowError(AiProviderError);
    });
  });

  describe("buildCompilationPrompt", () => {
    it("fences the untrusted source, demands exact provenance, and lists only the trusted evidence", () => {
      const prompt = buildCompilationPrompt(opportunity, config.model);
      expect(prompt).toContain("<<<PROGRAMME_SOURCE>>>");
      expect(prompt).toContain(opportunity.sourceText);
      expect(prompt).toContain(JSON.stringify(opportunity.id));
      expect(prompt).toContain(JSON.stringify(config.model));
      expect(prompt).toContain('"unsupported"');
      expect(prompt).toContain("character-for-character");
      expect(prompt).toContain(opportunity.evidence[0]?.sourceUrl ?? "!MISSING!");
    });
  });

  describe("parseModelJson", () => {
    it("parses plain and fenced JSON objects and rejects non-objects", () => {
      expect(parseModelJson('{"a":1}')).toEqual({ a: 1 });
      expect(parseModelJson('{"a":1}\n\n')).toEqual({ a: 1 });
      expect(parseModelJson('```json\n{"a":1}\n```')).toEqual({ a: 1 });
      expect(parseModelJson('```\n{"a":1}\n```')).toEqual({ a: 1 });
      expect(() => parseModelJson("no braces here")).toThrowError(AiProviderError);
      expect(() => parseModelJson("[1,2,3]")).toThrowError(AiProviderError);
      expect(() => parseModelJson("null")).toThrowError(AiProviderError);
    });

    it("rejects prose before or around the JSON object", () => {
      expect(() => parseModelJson("Here is the JSON: {\"a\":1}")).toThrowError(AiProviderError);
      expect(() => parseModelJson("{\"a\":1} Hope this helps!")).toThrowError(AiProviderError);
      expect(() => parseModelJson("{\"a\":1}{\"b\":2}")).toThrowError(AiProviderError);
      expect(() => parseModelJson("Sure!\n```json\n{\"a\":1}\n```")).toThrowError(AiProviderError);
      expect(() => parseModelJson("```json\n{\"a\":1}\n```\nDone.")).toThrowError(AiProviderError);
      // Prose inside a fence has the same status as prose outside it.
      expect(() => parseModelJson("```json\nThe result is {\"a\":1}\n```")).toThrowError(AiProviderError);
    });
  });

  describe("requestGemmaText", () => {
    function stubFetch(payload: unknown, status = 200): ReturnType<typeof vi.fn> {
      const stub = vi.fn();
      stub.mockResolvedValueOnce(new Response(JSON.stringify(payload), { status, headers: { "content-type": "application/json" } }));
      vi.stubGlobal("fetch", stub);
      return stub;
    }

    it("posts to generateContent with the key only in the x-goog-api-key header", async () => {
      const stub = stubFetch({ candidates: [{ content: { parts: [{ text: '{"ok":true}' }] } }] });
      const text = await requestGemmaText({ config, prompt: "PROMPT" });
      expect(text).toBe('{"ok":true}');
      const url = String(stub.mock.calls[0][0]);
      const requestInit = stub.mock.calls[0][1] as RequestInit & { headers: Record<string, string>; body: string };
      expect(requestInit.method).toBe("POST");
      expect(requestInit.headers["x-goog-api-key"]).toBe(config.apiKey);
      expect(url.startsWith(config.baseUrl)).toBe(true);
      expect(url).toContain(config.model);
      expect(url).not.toContain(config.apiKey);
      expect(requestInit.body).toContain("PROMPT");
      expect(requestInit.body).not.toContain(config.apiKey);
    });

    it("joins multiple text parts", async () => {
      stubFetch({ candidates: [{ content: { parts: [{ text: '{"a":' }, { text: "1}" }] } }] });
      await expect(requestGemmaText({ config, prompt: "PROMPT" })).resolves.toBe('{"a":1}');
    });

    it("maps HTTP 429 to RATE_LIMITED with a seconds-based Retry-After hint", async () => {
      const stub = vi.fn();
      stub.mockResolvedValueOnce(new Response('{"error":{}}', { status: 429, headers: { "retry-after": "7" } }));
      vi.stubGlobal("fetch", stub);
      await expect(requestGemmaText({ config, prompt: "PROMPT" })).rejects.toMatchObject({ code: "RATE_LIMITED", retryAfterSeconds: 7 });
    });

    it("clamps oversized Retry-After hints and ignores non-numeric ones", async () => {
      vi.stubGlobal("fetch", vi.fn()
        .mockResolvedValueOnce(new Response('{"error":{}}', { status: 429, headers: { "retry-after": "99999" } }))
        .mockResolvedValueOnce(new Response('{"error":{}}', { status: 429 }))
        .mockResolvedValueOnce(new Response('{"error":{}}', { status: 429, headers: { "retry-after": "Fri, 31 Oct 2026 00:00:00 GMT" } })));
      await expect(requestGemmaText({ config, prompt: "PROMPT" })).rejects.toMatchObject({ code: "RATE_LIMITED", retryAfterSeconds: 3600 });
      await expect(requestGemmaText({ config, prompt: "PROMPT" })).rejects.toMatchObject({ code: "RATE_LIMITED", retryAfterSeconds: undefined });
      await expect(requestGemmaText({ config, prompt: "PROMPT" })).rejects.toMatchObject({ code: "RATE_LIMITED", retryAfterSeconds: undefined });
    });

    it("maps provider error statuses and malformed envelopes to AI_UNAVAILABLE", async () => {
      vi.stubGlobal("fetch", vi.fn()
        .mockResolvedValueOnce(new Response('{"error":{}}', { status: 500 }))
        .mockResolvedValueOnce(new Response(JSON.stringify({ unexpected: true }), { status: 200 })));
      await expect(requestGemmaText({ config, prompt: "PROMPT" })).rejects.toMatchObject({ code: "AI_UNAVAILABLE" });
      await expect(requestGemmaText({ config, prompt: "PROMPT" })).rejects.toMatchObject({ code: "AI_UNAVAILABLE" });
    });

    it("never surfaces the provider payload in error messages", async () => {
      const secretPayload = JSON.stringify({ error: "internal provider detail", api_key_hint: config.apiKey });
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(secretPayload, { status: 502 })));
      const caught = await requestGemmaText({ config, prompt: "PROMPT" }).then(
        () => { throw new Error("Expected the request to fail."); },
        (value: unknown) => value,
      );
      expect(caught).toBeInstanceOf(AiProviderError);
      const providerError = caught as AiProviderError;
      expect(providerError.code).toBe("AI_UNAVAILABLE");
      expect(providerError.message).not.toContain(config.apiKey);
      expect(providerError.message).not.toContain("internal provider detail");
    });

    it("bounds the response size", async () => {
      stubFetch({ candidates: [{ content: { parts: [{ text: "x".repeat(64) }] } }] });
      await expect(requestGemmaText({ config, prompt: "PROMPT", maxResponseBytes: 16 })).rejects.toMatchObject({ code: "AI_UNAVAILABLE" });
    });

    it("respects the inference timeout without retries", async () => {
      vi.useFakeTimers();
      const stub: ReturnType<typeof vi.fn> = vi.fn((_url: string, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => reject(new Error("aborted")));
      }));
      vi.stubGlobal("fetch", stub);
      const pending = requestGemmaText({ config, prompt: "PROMPT", timeoutMs: 1_000 });
      const assertion = expect(pending).rejects.toMatchObject({ code: "AI_UNAVAILABLE", message: "The AI provider request timed out." });
      await vi.advanceTimersByTimeAsync(1_500);
      await assertion;
      expect(stub).toHaveBeenCalledTimes(1);
    });
  });
});

describe("AI compilation service", () => {
  it("compiles a valid model output and records server provenance", async () => {
    const { deps, records } = createRecordingDeps([modelBody(opportunity)]);
    const service = createCompilationService(deps);
    const outcome = await service.compile(opportunity);
    const { value } = expectCompiled(outcome);
    expect(value.opportunityId).toBe(opportunity.id);
    expect(value.model).toBe(config.model);
    expect(value.compiledAt).toBe(FIXED_NOW_ISO);
    expect(value.requirements[0]?.kind).toBe("country");
    expect(records).toHaveLength(1);
    // Prompt instructs extraction only from the fenced untrusted source text.
    expect(records[0]?.prompt).toContain("untrusted data");
    expect(records[0]?.prompt).toContain(opportunity.sourceText);
    expect(records[0]?.prompt).toContain(JSON.stringify(opportunity.id));
    expect(records[0]?.prompt).toContain(JSON.stringify(config.model));
  });

  it("returns a cache hit for the same opportunity without provider traffic", async () => {
    const { deps, records } = createRecordingDeps([modelBody(opportunity)]);
    const service = createCompilationService(deps);
    expect((await service.compile(opportunity)).status).toBe("compiled");
    const second = await service.compile(opportunity);
    expect(second.status).toBe("cache_hit");
    expect(expectCacheHit(second).value.opportunityId).toBe(opportunity.id);
    expect(records).toHaveLength(1);
  });

  it("never mixes cached results between opportunities with identical source text", async () => {
    const { deps, records } = createRecordingDeps([modelBody(opportunity), modelBody(secondOpportunity)]);
    const service = createCompilationService(deps);
    expect((await service.compile(opportunity)).status).toBe("compiled");
    // Same fixture source text, different opportunity ID: the cached entry must not be reused.
    const second = await service.compile(secondOpportunity);
    expect(second.status).toBe("compiled");
    if (second.status === "compiled") expect(second.value.opportunityId).toBe(secondOpportunity.id);
    const repeatedFirst = await service.compile(opportunity);
    expect(repeatedFirst.status).toBe("cache_hit");
    const repeatedSecond = await service.compile(secondOpportunity);
    expect(repeatedSecond.status).toBe("cache_hit");
    expect(records).toHaveLength(2);
  });

  it("rejects malformed model output and never caches the failure", async () => {
    const { deps, records } = createRecordingDeps(["Not a JSON object at all."]);
    const service = createCompilationService(deps);
    expectFailure(await service.compile(opportunity), "AI_UNAVAILABLE");
    expectFailure(await service.compile(opportunity), "AI_UNAVAILABLE");
    expect(records).toHaveLength(2);
  });

  it("rejects prose-wrapped model output instead of scraping the JSON out of it", async () => {
    const { deps, records } = createRecordingDeps([`Here is what you asked for:\n${modelBody(opportunity)}\nLet me know if you need more.`]);
    const service = createCompilationService(deps);
    expectFailure(await service.compile(opportunity), "AI_UNAVAILABLE");
    // The failure must not poison the cache either.
    expectFailure(await service.compile(opportunity), "AI_UNAVAILABLE");
    expect(records).toHaveLength(2);
  });

  it("rejects output that fails the shared compilation schema", async () => {
    const { deps } = createRecordingDeps([JSON.stringify({ opportunityId: opportunity.id, model: config.model })]);
    const service = createCompilationService(deps);
    expectFailure(await service.compile(opportunity), "AI_UNAVAILABLE");
  });

  it("rejects output that echoes a different opportunity or model", async () => {
    const differentId = JSON.parse(modelBody(opportunity));
    differentId.opportunityId = secondOpportunity.id;
    const differentModel = JSON.parse(modelBody(opportunity));
    differentModel.model = "other-model";
    const { deps, records } = createRecordingDeps([JSON.stringify(differentId), JSON.stringify(differentModel)]);
    const service = createCompilationService(deps);
    expectFailure(await service.compile(opportunity), "AI_UNAVAILABLE");
    expectFailure(await service.compile(secondOpportunity), "AI_UNAVAILABLE");
    expect(records).toHaveLength(2);
  });

  it("keeps supported and unsupported rules with verified evidence unchanged", async () => {
    const withUnsupported = {
      id: "sector",
      kind: "unsupported",
      description: "Sector restriction cannot be evaluated",
      reason: "The source restricts biotech programmes without a supported representation.",
      evidence: opportunity.evidence[0],
    };
    const { deps } = createRecordingDeps([modelBody(opportunity, { requirements: [withUnsupported], completeness: "partial" })]);
    const service = createCompilationService(deps);
    const { value } = expectCompiled(await service.compile(opportunity));
    expect(value.requirements).toHaveLength(1);
    expect(value.requirements[0]?.kind).toBe("unsupported");
    expect(value.completeness).toBe("partial");
    expect(value.warnings.some((warning) => warning.includes("marked unsupported"))).toBe(false);
  });

  it("downgrades requirements with unverified evidence to unsupported and marks the compilation partial", async () => {
    const unverified = {
      id: "country",
      kind: "country",
      description: "Based in Thailand",
      allowed: ["TH"],
      evidence: { sourceUrl: "https://untrusted.example/source", quote: "Open to Thailand only", locator: "Somewhere", retrievedAt: opportunity.evidence[0]?.retrievedAt ?? "" },
    };
    const { deps, records } = createRecordingDeps([modelBody(opportunity, { requirements: [unverified], warnings: [] })]);
    const service = createCompilationService(deps);
    const { value } = expectCompiled(await service.compile(opportunity));
    expect(value.completeness).toBe("partial");
    expect(value.requirements[0]?.kind).toBe("unsupported");
    expect(value.requirements[0]?.evidence.sourceUrl).toBe(opportunity.evidence[0]?.sourceUrl);
    expect(value.warnings.some((warning) => warning.includes("marked unsupported"))).toBe(true);
    // The verifier never invents or fabricates evidence.
    expect(records).toHaveLength(1);
  });

  it("repoints unsupported rules with unverified evidence at a trusted record", async () => {
    const unverifiedUnsupported = {
      id: "check",
      kind: "unsupported",
      description: "Ownership condition unclear",
      reason: "The OR combination cannot be represented.",
      evidence: { sourceUrl: "https://untrusted.example/other", quote: "Foreign ownership applies", locator: "Somewhere", retrievedAt: opportunity.evidence[0]?.retrievedAt ?? "" },
    };
    const { deps } = createRecordingDeps([modelBody(opportunity, { requirements: [unverifiedUnsupported], completeness: "partial" })]);
    const service = createCompilationService(deps);
    const { value } = expectCompiled(await service.compile(opportunity));
    expect(value.requirements[0]?.kind).toBe("unsupported");
    expect(value.requirements[0]?.evidence.sourceUrl).toBe(opportunity.evidence[0]?.sourceUrl);
    expect(value.completeness).toBe("partial");
  });

  it("accepts a fresh quote from the trusted source URL with whitespace differences", async () => {
    const rewrittenQuote = {
      id: "size",
      kind: "company_size_max",
      description: "No more than 20 employees",
      maximum: 20,
      evidence: {
        sourceUrl: opportunity.evidence[0]?.sourceUrl ?? "",
        quote: "Fictional demo programme: startups based in Malaysia or Singapore with no\nmore\nthan 20 employees may apply.",
        locator: "Programme FAQ",
        retrievedAt: opportunity.evidence[0]?.retrievedAt ?? "",
      },
    };
    const { deps } = createRecordingDeps([modelBody(opportunity, { requirements: [rewrittenQuote], warnings: [] })]);
    const service = createCompilationService(deps);
    const { value } = expectCompiled(await service.compile(opportunity));
    expect(value.requirements[0]?.kind).toBe("company_size_max");
    expect(value.warnings.some((warning) => warning.includes("marked unsupported"))).toBe(false);
  });

  it("reports NOT_CONFIGURED when AI settings are absent and never calls the provider", async () => {
    let requests = 0;
    const deps: Partial<CompilationServiceDeps> = {
      config: () => {
        throw new Error("AI inference is not configured. Set AI_BASE_URL, AI_API_KEY, and AI_MODEL on the server.");
      },
      async request() {
        requests += 1;
        return "{}";
      },
    };
    const service = createCompilationService(deps);
    const outcome = expectFailure(await service.compile(opportunity), "NOT_CONFIGURED");
    expect(outcome.failure.retryAfterSeconds).toBeUndefined();
    expect(requests).toBe(0);
  });

  it("rejects oversized source text before contacting the provider", async () => {
    const { deps, records } = createRecordingDeps([modelBody(opportunity)]);
    const service = createCompilationService(deps, { maxSourceChars: 10, maxPromptChars: 96_000 });
    expectFailure(await service.compile(opportunity), "VALIDATION_ERROR");
    expect(records).toHaveLength(0);
  });
});

describe("compilation rate limiter", () => {
  it("allows the configured number of requests per window and then reports Retry-After", () => {
    const limiter = createCompilationRateLimiter({ limit: 2, windowMs: 60_000 });
    const start = Date.parse(FIXED_NOW_ISO);
    expect(limiter.check("user-a", start)).toEqual({ allowed: true });
    expect(limiter.check("user-a", start + 1_000)).toEqual({ allowed: true });
    const blocked = limiter.check("user-a", start + 2_000);
    if (blocked.allowed) throw new Error("Expected the third request to be rate limited.");
    expect(blocked.retryAfterSeconds).toBeGreaterThan(0);
    expect(blocked.retryAfterSeconds).toBeLessThanOrEqual(60);
  });

  it("opens a fresh window after the window elapses and isolates users", () => {
    const limiter = createCompilationRateLimiter({ limit: 1, windowMs: 60_000 });
    const start = Date.parse(FIXED_NOW_ISO);
    expect(limiter.check("user-b", start)).toEqual({ allowed: true });
    const blocked = limiter.check("user-b", start + 1_000);
    if (blocked.allowed) throw new Error("Expected the second request to be rate limited.");
    expect(blocked.retryAfterSeconds).toBe(59);
    expect(limiter.check("user-c", start + 1_000)).toEqual({ allowed: true });
    // A fixed window resets once the full window has elapsed.
    expect(limiter.check("user-b", start + 60_000)).toEqual({ allowed: true });
  });

  it("reports the exact remaining seconds until the next window", () => {
    const limiter = createCompilationRateLimiter({ limit: 1, windowMs: 60_000 });
    const start = Date.parse(FIXED_NOW_ISO);
    expect(limiter.check("user-d", start)).toEqual({ allowed: true });
    const blocked = limiter.check("user-d", start + 59_999);
    if (blocked.allowed) throw new Error("Expected the request to be rate limited.");
    expect(blocked.retryAfterSeconds).toBe(1);
  });
});
