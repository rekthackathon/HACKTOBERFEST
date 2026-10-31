import { z } from "zod";
import { compileOpportunity } from "@/lib/ai/compile";
import { evaluateEligibility } from "@/lib/eligibility";
import { isSupabaseConfigured } from "@/lib/env/public";
import { ApiRequestError, apiErrorResponse, readJsonBody, toErrorResponse } from "@/lib/http";
import { OPPORTUNITY_COLUMNS, STARTUP_COLUMNS, toOpportunity, toStartupProfile, type OpportunityRow, type StartupRow } from "@/lib/supabase/mappers";
import { getAuthContext } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const bodySchema = z.object({ opportunityId: z.uuid() }).strict();

/** Evaluates the caller's own saved startup against a stored opportunity; never accepts either from the client. */
export async function POST(request: Request) {
  try {
    if (!isSupabaseConfigured()) throw new ApiRequestError("NOT_CONFIGURED", "Accounts are not configured on this deployment.");
    const context = await getAuthContext();
    if (!context) throw new ApiRequestError("UNAUTHORIZED", "Log in to check eligibility.");
    const { supabase, user } = context;
    const { opportunityId } = await readJsonBody(request, bodySchema, { maxBytes: 1024 });

    const [startupResult, opportunityResult] = await Promise.all([
      supabase.from("startups").select(STARTUP_COLUMNS).eq("owner_id", user.id).maybeSingle(),
      supabase.from("opportunities").select(OPPORTUNITY_COLUMNS).eq("id", opportunityId).maybeSingle(),
    ]);
    if (startupResult.error || opportunityResult.error) throw new ApiRequestError("INTERNAL_ERROR", "Eligibility data could not be loaded.");
    if (!startupResult.data) return apiErrorResponse("NOT_FOUND", "Save your startup profile before checking eligibility.");
    if (!opportunityResult.data) return apiErrorResponse("NOT_FOUND", "Opportunity not found.");

    const startup = toStartupProfile(startupResult.data as StartupRow);
    const opportunity = toOpportunity(opportunityResult.data as OpportunityRow);
    const compilation = await compileOpportunity(opportunity);
    const evaluation = evaluateEligibility(startup, compilation);
    return Response.json({ data: { evaluation, compilation } }, { headers: { "cache-control": "private, no-store" } });
  } catch (error) {
    return toErrorResponse(error);
  }
}
