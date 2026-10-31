import { afterEach, describe, expect, it, vi } from "vitest";
import { getSupabaseEnvironment, isSupabaseConfigured } from "../src/lib/env/public";

afterEach(() => vi.unstubAllEnvs());

describe("Supabase environment", () => {
  it("falls back to the public demo project when env vars are missing", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "");
    expect(isSupabaseConfigured()).toBe(true);
    const env = getSupabaseEnvironment();
    expect(env.url).toBe("https://cvxjlstnhanlgfcwpekq.supabase.co");
    expect(env.publishableKey.startsWith("sb_publishable_")).toBe(true);
  });

  it("validates the URL without revealing a configured key in errors", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "invalid");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "example-key");
    expect(() => getSupabaseEnvironment()).toThrow("Configure NEXT_PUBLIC_SUPABASE_URL");
  });

  it("accepts explicit public project configuration", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "sb_publishable_example");
    expect(getSupabaseEnvironment().url).toBe("https://example.supabase.co");
  });
});
