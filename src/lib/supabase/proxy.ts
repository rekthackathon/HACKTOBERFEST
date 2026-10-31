import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { getSupabaseEnvironment, isSupabaseConfigured } from "@/lib/env/public";

export async function updateSession(request: NextRequest) {
  // This is only session refresh. Protected handlers must authenticate independently.
  if (!isSupabaseConfigured()) return NextResponse.next({ request });
  const { url, publishableKey } = getSupabaseEnvironment();
  let response = NextResponse.next({ request });
  const supabase = createServerClient(url, publishableKey, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll(values, headers) {
        values.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        values.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        Object.entries(headers).forEach(([name, value]) => response.headers.set(name, value));
      },
    },
  });
  await supabase.auth.getClaims();
  // Never allow a CDN to cache responses that carry user session cookies.
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}
