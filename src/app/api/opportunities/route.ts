import { opportunitySchema, type Opportunity } from "@/lib/contracts";
import { isSupabaseConfigured } from "@/lib/env/public";
import { ApiRequestError, toErrorResponse } from "@/lib/http";
import { OPPORTUNITY_COLUMNS, toOpportunity, type OpportunityRow } from "@/lib/supabase/mappers";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/** Public, read-only list of curated (non-fictional) opportunities. */
export async function GET() {
  try {
    if (!isSupabaseConfigured()) throw new ApiRequestError("NOT_CONFIGURED", "Opportunities are not configured on this deployment.");
    const supabase = await createClient();
    const { data, error } = await supabase.from("opportunities").select(OPPORTUNITY_COLUMNS).eq("is_mock", false).order("title");
    if (error) throw new ApiRequestError("INTERNAL_ERROR", "Opportunities could not be loaded.");
    // Rows that fail the shared contract are excluded rather than shown unverified.
    const opportunities = (data as OpportunityRow[]).flatMap((row): Opportunity[] => {
      try {
        return [opportunitySchema.parse(toOpportunity(row))];
      } catch {
        return [];
      }
    });
    return Response.json({ data: opportunities }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    return toErrorResponse(error);
  }
}
