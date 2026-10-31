import { startupProfileInputSchema } from "@/lib/contracts";
import { isSupabaseConfigured } from "@/lib/env/public";
import { ApiRequestError, apiErrorResponse, readJsonBody, toErrorResponse } from "@/lib/http";
import { STARTUP_COLUMNS, toStartupProfile, toStartupWrite, type StartupRow } from "@/lib/supabase/mappers";
import { getAuthContext } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const noStore = { "cache-control": "private, no-store" };

async function requireUser() {
  if (!isSupabaseConfigured()) throw new ApiRequestError("NOT_CONFIGURED", "Accounts are not configured on this deployment.");
  const context = await getAuthContext();
  if (!context) throw new ApiRequestError("UNAUTHORIZED", "Log in to manage your startup profile.");
  return context;
}

export async function GET() {
  try {
    const { supabase, user } = await requireUser();
    const { data, error } = await supabase.from("startups").select(STARTUP_COLUMNS).eq("owner_id", user.id).maybeSingle();
    if (error) throw new ApiRequestError("INTERNAL_ERROR", "The startup profile could not be loaded.");
    if (!data) return apiErrorResponse("NOT_FOUND", "You have not saved a startup profile yet.");
    return Response.json({ data: toStartupProfile(data as StartupRow) }, { headers: noStore });
  } catch (error) {
    return toErrorResponse(error);
  }
}

/** Creates or updates the caller's single startup. Ownership comes from the verified session only. */
export async function PUT(request: Request) {
  try {
    const { supabase, user } = await requireUser();
    const input = await readJsonBody(request, startupProfileInputSchema);
    const { data, error } = await supabase
      .from("startups")
      .upsert({ ...toStartupWrite(input), owner_id: user.id }, { onConflict: "owner_id" })
      .select(STARTUP_COLUMNS)
      .single();
    if (error || !data) throw new ApiRequestError("INTERNAL_ERROR", "The startup profile could not be saved.");
    return Response.json({ data: toStartupProfile(data as StartupRow) }, { headers: noStore });
  } catch (error) {
    return toErrorResponse(error);
  }
}
