import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { apiErrorSchema, startupProfileInputSchema } from "@/lib/contracts";
import { ApiRequestError, apiErrorResponse, createRequestId, fetchJsonWithTimeout, readJsonBody, statusForCode, toErrorResponse, type ApiErrorCode } from "@/lib/http";

// The module marks itself server-only; tests run under plain Node resolution.
vi.mock("server-only", () => ({}));

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const statusByCode: Record<ApiErrorCode, number> = {
  VALIDATION_ERROR: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  RATE_LIMITED: 429,
  NOT_CONFIGURED: 503,
  AI_UNAVAILABLE: 503,
  INTERNAL_ERROR: 500,
};

const profileInput = {
  name: "Test Collective",
  description: "Synthetic description used only for contract validation tests.",
  industry: "Testing",
  country: "TL",
  stage: "idea",
  incorporationDate: "2026-01-31",
  companySize: 12,
  fundingStage: "pre_seed",
};

async function expectApiError(promise: Promise<unknown>): Promise<ApiRequestError> {
  const caught: unknown = await promise.then(
    () => { throw new Error("Expected the promise to reject."); },
    (value: unknown) => value,
  );
  expect(caught).toBeInstanceOf(ApiRequestError);
  if (!(caught instanceof ApiRequestError)) throw caught;
  return caught;
}

describe("error envelopes", () => {
  it("maps every supported code to its documented status", () => {
    for (const [code, status] of Object.entries(statusByCode) as [ApiErrorCode, number][]) {
      expect(statusForCode(code)).toBe(status);
      expect(apiErrorResponse(code, "Failure.").status).toBe(status);
    }
  });

  it("returns bodies that conform exactly to apiErrorSchema", async () => {
    const response = apiErrorResponse("RATE_LIMITED", "Too many compile requests.");
    expect(response.headers.get("cache-control")).toContain("no-store");
    const body = await response.json();
    expect(apiErrorSchema.safeParse(body).success).toBe(true);
    expect(body.error).toMatchObject({ code: "RATE_LIMITED", message: "Too many compile requests." });
  });

  it("generates a UUID request id when none is supplied and preserves a caller id", async () => {
    const generated = (await (apiErrorResponse("UNAUTHORIZED", "Sign in required.").json() as Promise<{ error: { requestId: string } }>)).error.requestId;
    expect(z.uuid().safeParse(generated).success).toBe(true);
    const provided = (await (apiErrorResponse("NOT_FOUND", "Opportunity not found.", { requestId: "00000000-0000-4000-8000-000000000009" }).json() as Promise<{ error: { requestId: string } }>)).error.requestId;
    expect(provided).toBe("00000000-0000-4000-8000-000000000009");
  });

  it("replaces an empty message with a safe generic one", async () => {
    const body = await (apiErrorResponse("VALIDATION_ERROR", "   ").json() as Promise<{ error: { message: string } }>);
    expect(body.error.message.length).toBeGreaterThan(0);
    expect(apiErrorSchema.safeParse(body).success).toBe(true);
  });

  it("converts thrown ApiRequestError values and hides unknown failures", async () => {
    const known = toErrorResponse(new ApiRequestError("FORBIDDEN", "Not your startup."));
    expect(known.status).toBe(403);
    const knownBody = await (known.json() as Promise<{ error: { code: string } }>);
    expect(knownBody.error.code).toBe("FORBIDDEN");

    const unknown = toErrorResponse(new Error("internal detail must not leak"));
    expect(unknown.status).toBe(500);
    const body = await (unknown.json() as Promise<{ error: { message: string } }>);
    expect(apiErrorSchema.safeParse(body).success).toBe(true);
    expect(body.error.message).not.toContain("internal detail");
  });
});

describe("request ids", () => {
  it("generates unique UUID-shaped ids", () => {
    const first = createRequestId();
    const second = createRequestId();
    expect(first).not.toBe(second);
    expect(z.uuid().safeParse(first).success).toBe(true);
  });
});

describe("readJsonBody", () => {
  it("parses and validates a conforming body", async () => {
    const request = new Request("https://gateway.test/api", { method: "POST", body: JSON.stringify(profileInput) });
    const parsed = await readJsonBody(request, startupProfileInputSchema);
    expect(parsed.country).toBe("TL");
  });

  it("rejects a body that fails the schema as a validation error", async () => {
    const request = new Request("https://gateway.test/api", { method: "POST", body: JSON.stringify({ ...profileInput, country: "XX" }) });
    await expect(readJsonBody(request, startupProfileInputSchema)).rejects.toMatchObject({ code: "VALIDATION_ERROR", status: 400 });
  });

  it("rejects malformed JSON without echoing the payload", async () => {
    const request = new Request("https://gateway.test/api", { method: "POST", body: '{"trap":"hunter2"' });
    const error = await expectApiError(readJsonBody(request, z.object({})));
    expect(error.code).toBe("VALIDATION_ERROR");
    expect(error.message).not.toContain("hunter2");
  });

  it("rejects an empty body", async () => {
    const request = new Request("https://gateway.test/api", { method: "POST" });
    await expect(readJsonBody(request, z.object({}))).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
  });

  it("enforces the size cap while streaming and via content-length", async () => {
    const streamRequest = new Request("https://gateway.test/api", { method: "POST", body: "0123456789abcdefg" });
    await expect(readJsonBody(streamRequest, z.object({}), { maxBytes: 8 })).rejects.toMatchObject({ code: "VALIDATION_ERROR", message: expect.stringContaining("exceeds the allowed size") });

    const headerRequest = new Request("https://gateway.test/api", { method: "POST", body: "x" });
    Object.defineProperty(headerRequest, "headers", { value: new Headers({ "content-length": "99999" }) });
    await expect(readJsonBody(headerRequest, z.object({}), { maxBytes: 64 })).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
  });
});

describe("fetchJsonWithTimeout", () => {
  it("rejects non-HTTPS, invalid, and credential-bearing URLs without calling fetch", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    for (const url of ["http://example.com/api", "not a url", "https://user:pass@example.com/api"]) {
      await expect(fetchJsonWithTimeout(url)).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns validated JSON and forwards request headers", async () => {
    const fetchMock = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      void [url, init];
      return new Response(JSON.stringify({ value: 42 }), { headers: { "content-type": "application/json" } });
    });
    vi.stubGlobal("fetch", fetchMock);
    const parsed = await fetchJsonWithTimeout("https://example.com/data", { schema: z.object({ value: z.number() }), headers: { authorization: "Bearer synthetic-test-token" } });
    expect(parsed).toEqual({ value: 42 });
    const init = fetchMock.mock.calls[0]?.[1] as RequestInit | undefined;
    expect(init?.headers).toEqual({ authorization: "Bearer synthetic-test-token" });
  });

  it("returns unvalidated JSON when no schema is supplied", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ anything: true }))));
    const parsed = await fetchJsonWithTimeout<unknown>("https://example.com/data");
    expect(parsed).toEqual({ anything: true });
  });

  it("marks schema violations and non-JSON responses as upstream failures", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ value: "not-a-number" }))));
    await expect(fetchJsonWithTimeout("https://example.com/data", { schema: z.object({ value: z.number() }) })).rejects.toMatchObject({ code: "AI_UNAVAILABLE", message: expect.stringContaining("schema validation") });

    vi.stubGlobal("fetch", vi.fn(async () => new Response("<html>gateway error page</html>", { headers: { "content-type": "text/html" } })));
    const error = await expectApiError(fetchJsonWithTimeout("https://example.com/data"));
    expect(error.code).toBe("AI_UNAVAILABLE");
    expect(error.message).not.toContain("gateway error page");
  });

  it("fails upstream status errors without leaking provider payloads", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response('{"secret":"do-not-leak"}', { status: 500 })));
    const error = await expectApiError(fetchJsonWithTimeout("https://example.com/v1/models"));
    expect(error.code).toBe("AI_UNAVAILABLE");
    expect(error.message).toContain("status 500");
    expect(error.message).not.toContain("do-not-leak");
  });

  it("surfaces abort-driven timeouts as upstream unavailability", async () => {
    vi.stubGlobal("fetch", vi.fn((_url: RequestInfo | URL, init?: RequestInit) => new Promise<Response>((_, reject) => {
      init?.signal?.addEventListener("abort", () => reject(new Error("Aborted.")));
    })));
    await expect(fetchJsonWithTimeout("https://example.com/slow", { timeoutMs: 5 })).rejects.toMatchObject({ code: "AI_UNAVAILABLE", message: expect.stringContaining("timed out") });
  });

  it("turns network failures into upstream errors", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => {
      throw new Error("connection reset");
    }));
    await expect(fetchJsonWithTimeout("https://example.com/api")).rejects.toMatchObject({ code: "AI_UNAVAILABLE", message: expect.stringContaining("Upstream request failed") });
  });

  it("caps responses by declared length and by streamed bytes", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("tiny", { headers: { "content-length": "999999" } })));
    await expect(fetchJsonWithTimeout("https://example.com/stream", { maxBytes: 16 })).rejects.toMatchObject({ code: "AI_UNAVAILABLE", message: expect.stringContaining("exceeds the allowed size") });

    const oversizedStream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array(200).fill(65));
        controller.close();
      },
    });
    vi.stubGlobal("fetch", vi.fn(async () => new Response(oversizedStream, { headers: { "content-type": "application/json" } })));
    await expect(fetchJsonWithTimeout("https://example.com/stream", { maxBytes: 64 })).rejects.toMatchObject({ code: "AI_UNAVAILABLE", message: expect.stringContaining("exceeds the allowed size") });
  });
});
