import type { NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/proxy";

export async function proxy(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  matcher: ["/auth/:path*", "/dashboard/:path*", "/startups/:path*", "/api/startups/:path*", "/api/eligibility/:path*"],
};
