import { z } from "zod";

const supabaseEnvironment = z.object({
  url: z.url(),
  publishableKey: z.string().min(1),
});

// Public demo project defaults. Both values are browser-visible by design (the publishable key is
// not a secret; RLS enforces access). Env vars override them. Never put a service-role key here.
const DEFAULT_SUPABASE_URL = "https://cvxjlstnhanlgfcwpekq.supabase.co";
const DEFAULT_SUPABASE_PUBLISHABLE_KEY = "sb_publishable_kcAqes42FsyNdV15_I8idw_hcuNi0ZU";

function publicSupabaseValues() {
  return {
    url: process.env.NEXT_PUBLIC_SUPABASE_URL || DEFAULT_SUPABASE_URL,
    publishableKey: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || DEFAULT_SUPABASE_PUBLISHABLE_KEY,
  };
}

/** Lazy validation keeps the public foundation usable before cloud provisioning. */
export function getSupabaseEnvironment() {
  const result = supabaseEnvironment.safeParse(publicSupabaseValues());
  if (!result.success) {
    throw new Error("Configure NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY before using Supabase.");
  }
  return result.data;
}

export function isSupabaseConfigured() {
  const { url, publishableKey } = publicSupabaseValues();
  return Boolean(url && publishableKey);
}
