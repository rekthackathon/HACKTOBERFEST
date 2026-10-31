import { z } from "zod";

const supabaseEnvironment = z.object({
  url: z.url(),
  publishableKey: z.string().min(1),
});

/** Lazy validation keeps the public foundation usable before cloud provisioning. */
export function getSupabaseEnvironment() {
  const result = supabaseEnvironment.safeParse({
    url: process.env.NEXT_PUBLIC_SUPABASE_URL,
    publishableKey: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  });
  if (!result.success) {
    throw new Error("Configure NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY before using Supabase.");
  }
  return result.data;
}

export function isSupabaseConfigured() {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY);
}
