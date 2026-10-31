import { afterEach, describe, expect, it, vi } from "vitest";
import type { OpportunityRow, StartupRow } from "@/lib/supabase/mappers";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/env/public", () => ({ isSupabaseConfigured: vi.fn(() => true) }));
vi.mock("@/lib/supabase/server", () => ({ getAuthContext: vi.fn() }));

const { getAuthContext } = await import("@/lib/supabase/server");
const { POST } = await import("@/app/api/eligibility/evaluate/route");

const userId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const opportunityId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const evidence = {
  sourceUrl: "https://example.com/cloud-programme",
  quote: "Applicants must be based in Malaysia.",
  locator: "Eligibility",
  retrievedAt: "2026-10-31T05:00:00.000Z",
};

const startupRow: StartupRow = {
  id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
  owner_id: userId,
  name: "Cloud Test Labs",
  description: "Synthetic startup used only for route tests.",
  industry: "Testing",
  country: "MY",
  stage: "mvp",
  incorporation_date: null,
  company_size: 4,
  funding_stage: "seed",
  accumulated_revenue_myr: null,
  malaysian_ownership_percent: null,
  malaysian_employee_percent: null,
  largest_external_entity_shareholding_percent: null,
  owns_required_ip_rights: "unknown",
  application_participant_count: null,
  created_at: "2026-10-31T05:00:00.000Z",
  updated_at: "2026-10-31T05:00:00.000Z",
};

const opportunityRow: OpportunityRow = {
  id: opportunityId,
  title: "Cloud Test Programme",
  description: "Synthetic programme used only for route tests.",
  kind: "grant",
  countries: ["MY"],
  deadline: null,
  application_url: evidence.sourceUrl,
  source_text: evidence.quote,
  evidence: [evidence],
  is_mock: false,
};

function queryResult(data: StartupRow | OpportunityRow) {
  const query = {
    select: vi.fn(),
    eq: vi.fn(),
    maybeSingle: vi.fn(async () => ({ data, error: null })),
  };
  query.select.mockReturnValue(query);
  query.eq.mockReturnValue(query);
  return query;
}

function queryError(error: { code: string }) {
  const query = {
    select: vi.fn(),
    eq: vi.fn(),
    maybeSingle: vi.fn(async () => ({ data: null, error })),
  };
  query.select.mockReturnValue(query);
  query.eq.mockReturnValue(query);
  return query;
}

function request(): Request {
  return new Request("http://localhost/api/eligibility/evaluate", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ opportunityId }),
  });
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("POST /api/eligibility/evaluate", () => {
  it("rejects unauthenticated requests before database or provider access", async () => {
    vi.mocked(getAuthContext).mockResolvedValue(null);
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const response = await POST(request());
    expect(response.status).toBe(401);
    expect(await response.json()).toMatchObject({ error: { code: "UNAUTHORIZED" } });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("uses Ollama Cloud, grounds requirements, matches the authenticated startup, and rate limits repeated checks", async () => {
    vi.stubEnv("AI_PROVIDER", "ollama-cloud");
    vi.stubEnv("OLLAMA_API_KEY", "route-cloud-secret");
    vi.stubEnv("OLLAMA_CLOUD_MODEL", "gemma4:31b");

    let startupReads = 0;
    const supabase = {
      from: vi.fn((table: string) => {
        if (table !== "startups") return queryResult(opportunityRow);
        startupReads += 1;
        return startupReads === 1 ? queryError({ code: "42703" }) : queryResult(startupRow);
      }),
    };
    vi.mocked(getAuthContext).mockResolvedValue({ supabase, user: { id: userId } } as never);

    const modelOutput = JSON.stringify({
      opportunityId,
      model: "gemma4:31b",
      compiledAt: "1999-01-01T00:00:00.000Z",
      completeness: "complete",
      requirements: [{
        id: "country",
        kind: "country",
        description: "Based in Malaysia",
        allowed: ["MY"],
        evidence,
      }],
      warnings: [],
    });
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      expect(new Headers(init?.headers).get("authorization")).toBe("Bearer route-cloud-secret");
      expect(String(init?.body)).not.toContain("route-cloud-secret");
      return Response.json({
        model: "gemma4:31b",
        message: { role: "assistant", content: modelOutput },
        done: true,
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    const first = await POST(request());
    expect(first.status).toBe(200);
    const body = await first.json();
    expect(body.data.compilation).toMatchObject({ opportunityId, model: "gemma4:31b", completeness: "complete" });
    expect(body.data.evaluation).toMatchObject({
      startupId: startupRow.id,
      opportunityId,
      status: "potentially_eligible",
    });
    expect(body.data.evaluation.results).toMatchObject([{ requirementId: "country", outcome: "pass" }]);
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(String(fetchMock.mock.calls[0]?.[0])).toBe("https://ollama.com/api/chat");
    expect(startupReads).toBe(2);

    // The shared compilation cache avoids repeat provider traffic, while the
    // route limiter still counts each expensive workflow invocation.
    for (let attempt = 0; attempt < 4; attempt += 1) {
      expect((await POST(request())).status).toBe(200);
    }
    const limited = await POST(request());
    expect(limited.status).toBe(429);
    expect(limited.headers.get("retry-after")).toBeTruthy();
    expect(await limited.json()).toMatchObject({ error: { code: "RATE_LIMITED" } });
    expect(fetchMock).toHaveBeenCalledOnce();
  });
});
