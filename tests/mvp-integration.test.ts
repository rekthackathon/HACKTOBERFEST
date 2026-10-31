import { afterEach, describe, expect, it, vi } from "vitest";
import { evaluateEligibility } from "@/lib/eligibility";
import { toOpportunity, toStartupProfile, toStartupWrite, type OpportunityRow, type StartupRow } from "@/lib/supabase/mappers";

vi.mock("server-only", () => ({}));

const { buildCompilation, compileOpportunity, extractJsonObject } = await import("@/lib/ai/compile");

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

// Synthetic fixtures only.
const startupRow: StartupRow = {
  id: "11111111-1111-4111-8111-111111111111",
  owner_id: "22222222-2222-4222-8222-222222222222",
  name: "Synthetic Labs",
  description: "Synthetic startup for tests.",
  industry: "Testing",
  country: "MY",
  stage: "mvp",
  incorporation_date: null,
  company_size: 4,
  funding_stage: "seed",
  created_at: "2026-10-31T05:00:00.123456+00:00",
  updated_at: "2026-10-31T05:00:00+00:00",
};

const sourceText = "Applicants must be based in Malaysia.\nApplicants must have fewer than 50 employees.\nThe company must be less than seven (7) years old at the point of application.";

const opportunityRow: OpportunityRow = {
  id: "33333333-3333-4333-8333-333333333333",
  title: "Synthetic Grant",
  description: "Synthetic programme for tests.",
  kind: "grant",
  countries: ["MY"],
  deadline: null,
  application_url: "https://example.com/programme",
  source_text: sourceText,
  evidence: [{ sourceUrl: "https://example.com/programme", quote: "Applicants must be based in Malaysia.", locator: "Eligibility", retrievedAt: "2026-10-31T04:58:00Z" }],
  is_mock: false,
};

const startup = toStartupProfile(startupRow);
const opportunity = toOpportunity(opportunityRow);

describe("database mappers", () => {
  it("normalises Postgres offsets to UTC and maps snake_case to the contract", () => {
    expect(startup.createdAt).toBe("2026-10-31T05:00:00.123Z");
    expect(startup).toMatchObject({ ownerId: startupRow.owner_id, fundingStage: "seed", companySize: 4, incorporationDate: null });
  });

  it("never writes an owner from client input", () => {
    const write = toStartupWrite({ name: "A", description: "B", industry: "C", country: "SG", stage: "idea", incorporationDate: null, companySize: null, fundingStage: null });
    expect(write).not.toHaveProperty("owner_id");
    expect(write).toMatchObject({ country: "SG", funding_stage: null });
  });
});

describe("compilation verification", () => {
  it("keeps verified supported rules and evaluates them deterministically", () => {
    const compilation = buildCompilation(opportunity, {
      completeness: "complete",
      requirements: [
        { kind: "country", allowed: ["MY"], description: "Based in Malaysia", quote: "Applicants must be based in Malaysia.", locator: "Eligibility" },
        { kind: "company_size_max", maximum: 49, description: "Fewer than 50 employees", quote: "Applicants must have fewer than 50 employees." },
      ],
      warnings: [],
    }, "test-model");
    expect(compilation.completeness).toBe("complete");
    expect(compilation.requirements.map(r => r.kind)).toEqual(["country", "company_size_max"]);
    expect(compilation.requirements[0].evidence.sourceUrl).toBe(opportunity.applicationUrl);
    expect(evaluateEligibility(startup, compilation).status).toBe("potentially_eligible");
    expect(evaluateEligibility({ ...startup, country: "SG" }, compilation).status).toBe("ineligible");
  });

  it("drops rules whose quote is not in the source and forces review", () => {
    const compilation = buildCompilation(opportunity, {
      completeness: "complete",
      requirements: [
        { kind: "country", allowed: ["MY"], description: "Based in Malaysia", quote: "Applicants must be based in Malaysia." },
        { kind: "country", allowed: ["SG"], description: "Invented", quote: "Applicants must be based in Singapore." },
      ],
      warnings: [],
    }, "test-model");
    expect(compilation.requirements).toHaveLength(1);
    expect(compilation.completeness).toBe("partial");
    expect(compilation.warnings[0]).toMatch(/discarded/);
    expect(evaluateEligibility(startup, compilation).status).toBe("needs_review");
  });

  it("turns uncheckable or malformed rules with verified quotes into needs-review", () => {
    const compilation = buildCompilation(opportunity, {
      completeness: "complete",
      requirements: [
        { kind: "company_age_max", description: "Under 7 years old", quote: "The company must be less than seven (7) years old at the point of application." },
        { kind: "country", allowed: ["Malaysia"], description: "Bad code", quote: "Applicants must be based in Malaysia." },
      ],
      warnings: [],
    }, "test-model");
    expect(compilation.requirements.map(r => r.kind)).toEqual(["unsupported", "unsupported"]);
    expect(evaluateEligibility(startup, compilation).status).toBe("needs_review");
  });

  it("extracts JSON from fenced or reasoning-prefixed content and rejects non-JSON", () => {
    expect(extractJsonObject("<think>{draft}</think>```json\n{\"a\":1}\n```")).toEqual({ a: 1 });
    expect(() => extractJsonObject("no json here")).toThrow(/did not return JSON/);
  });
});

describe("AI provider configuration", () => {
  it("accepts a local Ollama server over HTTP without a key, and sends no Authorization header", async () => {
    vi.stubEnv("AI_BASE_URL", "http://localhost:11434/v1");
    vi.stubEnv("AI_API_KEY", "");
    vi.stubEnv("AI_MODEL", "qwen3:test");
    const { getAiConfig } = await import("@/lib/ai/config");
    expect(getAiConfig()).toMatchObject({ baseUrl: "http://localhost:11434/v1", apiKey: "" });
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      expect(new Headers(init?.headers).has("authorization")).toBe(false);
      return Response.json({ choices: [{ message: { content: "{\"completeness\":\"complete\",\"requirements\":[],\"warnings\":[]}" } }] });
    });
    vi.stubGlobal("fetch", fetchMock);
    const compilation = await compileOpportunity({ ...opportunity, id: "77777777-7777-4777-8777-777777777777" });
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(compilation.model).toBe("qwen3:test");
  });

  it("rejects plain HTTP to remote hosts and remote providers without a key", async () => {
    const { getAiConfig } = await import("@/lib/ai/config");
    vi.stubEnv("AI_MODEL", "m");
    vi.stubEnv("AI_API_KEY", "k");
    vi.stubEnv("AI_BASE_URL", "http://provider.example.com/v1");
    expect(() => getAiConfig()).toThrow(/not configured/);
    vi.stubEnv("AI_BASE_URL", "https://ollama.com/v1");
    vi.stubEnv("AI_API_KEY", "");
    expect(() => getAiConfig()).toThrow(/not configured/);
  });
});

describe("provider failures", () => {
  it("reports missing AI configuration as NOT_CONFIGURED", async () => {
    vi.stubEnv("AI_BASE_URL", "");
    vi.stubEnv("AI_API_KEY", "");
    vi.stubEnv("AI_MODEL", "");
    await expect(compileOpportunity({ ...opportunity, id: "44444444-4444-4444-8444-444444444444" })).rejects.toMatchObject({ code: "NOT_CONFIGURED" });
  });

  it("reports invalid model JSON as AI_UNAVAILABLE without leaking content", async () => {
    vi.stubEnv("AI_BASE_URL", "https://provider.example.com/v1");
    vi.stubEnv("AI_API_KEY", "test-key");
    vi.stubEnv("AI_MODEL", "test-model");
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ choices: [{ message: { content: "secret-ish provider text, not json" } }] })));
    const error = await compileOpportunity({ ...opportunity, id: "55555555-5555-4555-8555-555555555555" }).catch((e: unknown) => e);
    expect(error).toMatchObject({ code: "AI_UNAVAILABLE" });
    expect(String((error as Error).message)).not.toContain("secret-ish");
  });

  it("reports provider HTTP errors as AI_UNAVAILABLE", async () => {
    vi.stubEnv("AI_BASE_URL", "https://provider.example.com/v1");
    vi.stubEnv("AI_API_KEY", "test-key");
    vi.stubEnv("AI_MODEL", "test-model");
    vi.stubGlobal("fetch", vi.fn(async () => new Response("upstream failure", { status: 502 })));
    await expect(compileOpportunity({ ...opportunity, id: "66666666-6666-4666-8666-666666666666" })).rejects.toMatchObject({ code: "AI_UNAVAILABLE" });
  });
});
