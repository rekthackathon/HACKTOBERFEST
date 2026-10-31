import { z } from "zod";
import { mockOpportunities } from "@/lib/mocks";
import { isSupabaseConfigured } from "@/lib/env/public";
import { getAuthenticatedUser } from "@/lib/supabase/server";
import { ApiRequestError, createRequestId, readJsonBody, statusForCode } from "@/lib/http";
import { getCompilationRateLimiter, getCompilationService, type CompilationRateLimiter, type CompilationService } from "@/lib/ai/compilation";

/**
 * POST /api/eligibility/compile — contract per docs/api-contracts.md:
 * input is an opportunity UUID, success is `{ data: CompiledRequirements }`,
 * access is authenticated and rate limited. Errors use the shared envelope.
 *
 * Authentication is real server-side Supabase Auth: `getAuthenticatedUser()`
 * verifies the request's session cookies with `supabase.auth.getUser()` on the
 * server and returns the verified user or null. No client header or request
 * field can assert identity.
 *
 * The opportunity (including its source text and evidence) is always loaded on
 * the server; callers may never supply source content or fetch URLs, so the
 * compilation's grounding and cache key cannot be poisoned by request input.
 * The fixture list is the trusted source until authenticated opportunity CRUD
 * (Backend handoff) replaces it.
 */

export const runtime = "nodejs";

const requestBodySchema = z.object({ opportunityId: z.uuid() }).strict();
const MAX_BODY_BYTES = 2_000;
const NO_STORE = { "cache-control": "no-store" } as const;

function errorResponse(code: ApiRequestError["code"], message: string, requestId: string, retryAfterSeconds?: number): Response {
  return Response.json(
    { error: { code, message, requestId } },
    { status: statusForCode(code), headers: retryAfterSeconds === undefined ? NO_STORE : { ...NO_STORE, "retry-after": String(retryAfterSeconds) } },
  );
}

function loadOpportunity(opportunityId: string) {
  return mockOpportunities.find((candidate) => candidate.id === opportunityId) ?? null;
}

export async function POST(request: Request): Promise<Response> {
  const requestId = createRequestId();
  try {
    if (!isSupabaseConfigured()) {
      return errorResponse("NOT_CONFIGURED", "Authentication is not configured on the server.", requestId);
    }
    const user = await getAuthenticatedUser();
    if (user === null) {
      return errorResponse("UNAUTHORIZED", "Sign in to compile eligibility requirements.", requestId);
    }

    const { opportunityId } = await readJsonBody(request, requestBodySchema, { maxBytes: MAX_BODY_BYTES });

    const limiter: CompilationRateLimiter = getCompilationRateLimiter();
    const rate = limiter.check(user.id);
    if (!rate.allowed) {
      return errorResponse("RATE_LIMITED", "Too many compilation requests. Try again later.", requestId, rate.retryAfterSeconds);
    }

    const opportunity = loadOpportunity(opportunityId);
    if (opportunity === null) {
      return errorResponse("NOT_FOUND", "Opportunity not found.", requestId);
    }

    const service: CompilationService = getCompilationService();
    const outcome = await service.compile(opportunity);
    if (outcome.status === "failed") {
      return errorResponse(outcome.failure.code, outcome.failure.message, requestId, outcome.failure.retryAfterSeconds);
    }
    return Response.json({ data: outcome.value }, { headers: NO_STORE });
  } catch (error) {
    if (error instanceof ApiRequestError) {
      return errorResponse(error.code, error.message, requestId);
    }
    return errorResponse("INTERNAL_ERROR", "An internal error occurred.", requestId);
  }
}
