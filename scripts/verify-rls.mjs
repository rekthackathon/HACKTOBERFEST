// Two-user RLS isolation check against the configured Supabase project.
// Usage: node --env-file=.env.local scripts/verify-rls.mjs
// Uses only the public URL and publishable key (never a service-role key, which would bypass RLS).
// Requires email confirmation to be disabled so sign-up returns a session. Prints no tokens or keys.
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
if (!url || !key) {
  console.error("Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY (for example in .env.local).");
  process.exit(2);
}
if (key.includes("service_role") || key.startsWith("sb_secret_")) {
  console.error("Refusing to run with a privileged key: it bypasses RLS and would make this test meaningless.");
  process.exit(2);
}

const options = { auth: { persistSession: false, autoRefreshToken: false } };
const stamp = Date.now();
const domain = process.env.RLS_TEST_EMAIL_DOMAIN ?? "example.com";
let failures = 0;

function check(name, ok, detail) {
  if (!ok) failures += 1;
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${!ok && detail ? ` (${detail})` : ""}`);
}

const syntheticStartup = (name, ownerId) => ({
  owner_id: ownerId,
  name,
  description: "Synthetic startup created by the RLS isolation check.",
  industry: "Testing",
  country: "MY",
  stage: "mvp",
  incorporation_date: null,
  company_size: 3,
  funding_stage: "seed",
});

async function signUp(label) {
  const client = createClient(url, key, options);
  const { data, error } = await client.auth.signUp({ email: `rls-${label}-${stamp}@${domain}`, password: `Rls-${crypto.randomUUID()}` });
  if (error) throw new Error(`Sign-up for user ${label} failed: ${error.message}`);
  if (!data.session || !data.user) throw new Error(`Sign-up for user ${label} returned no session. Disable "Confirm email" for the demo project.`);
  return { client, id: data.user.id };
}

const anon = createClient(url, key, options);
const a = await signUp("a");
const b = await signUp("b");
let aStartupId;
let bStartupId;

try {
  let r = await b.client.from("startups").insert(syntheticStartup("Forged", a.id)).select("id");
  check("B cannot insert a startup owned by A", Boolean(r.error), "insert succeeded");

  r = await b.client.from("startups").insert(syntheticStartup("B startup", b.id)).select("id").single();
  check("B can insert own startup", !r.error && Boolean(r.data), r.error?.message);
  bStartupId = r.data?.id;

  r = await b.client.from("startups").update({ owner_id: a.id }).eq("id", bStartupId).select("id");
  check("B cannot transfer own startup to A", Boolean(r.error) || r.data.length === 0, "ownership changed");

  r = await a.client.from("startups").insert(syntheticStartup("A startup", a.id)).select("id").single();
  check("A can insert own startup", !r.error && Boolean(r.data), r.error?.message);
  aStartupId = r.data?.id;

  r = await a.client.from("startups").select("id, name").eq("owner_id", a.id).single();
  check("A can read own startup after save", !r.error && r.data?.id === aStartupId, r.error?.message);

  r = await b.client.from("startups").select("id").eq("id", aStartupId);
  check("B cannot read A's startup", !r.error && r.data.length === 0, r.error?.message ?? "row visible");

  r = await b.client.from("startups").select("id");
  check("B's unfiltered select returns only B's row", !r.error && r.data.length === 1 && r.data[0].id === bStartupId, r.error?.message ?? `${r.data?.length} rows`);

  r = await b.client.from("startups").update({ name: "Hijacked" }).eq("id", aStartupId).select("id");
  check("B cannot update A's startup", Boolean(r.error) || r.data.length === 0, "row updated");

  r = await b.client.from("startups").delete().eq("id", aStartupId).select("id");
  check("B cannot delete A's startup", Boolean(r.error) || r.data.length === 0, "row deleted");

  r = await a.client.from("startups").select("name").eq("id", aStartupId).single();
  check("A's startup is unchanged", !r.error && r.data?.name === "A startup", r.error?.message ?? "name changed");

  r = await anon.from("startups").select("id");
  check("Anonymous client cannot read startups", Boolean(r.error) || r.data.length === 0, `${r.data?.length} rows visible`);

  r = await anon.from("opportunities").select("id");
  check("Anonymous client can read opportunities", !r.error, r.error?.message);
  if (!r.error) console.log(`INFO opportunities visible: ${r.data.length}`);

  r = await a.client.from("opportunities").insert({
    title: "Forged", description: "Forged", kind: "grant", countries: ["MY"], application_url: "https://example.com",
    source_text: "Forged", evidence: [{ quote: "Forged" }],
  }).select("id");
  check("Authenticated user cannot insert opportunities", Boolean(r.error), "insert succeeded");
} finally {
  if (aStartupId) await a.client.from("startups").delete().eq("id", aStartupId);
  if (bStartupId) await b.client.from("startups").delete().eq("id", bStartupId);
}

console.log(failures === 0 ? "RLS isolation: ALL CHECKS PASSED" : `RLS isolation: ${failures} CHECK(S) FAILED`);
console.log("Note: the two test users remain in Supabase Auth; delete them from the dashboard if needed.");
process.exit(failures === 0 ? 0 : 1);
