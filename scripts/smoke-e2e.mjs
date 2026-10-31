// End-to-end API smoke test of the demo flow through the real Next.js routes.
// Usage: node --env-file=.env.local scripts/smoke-e2e.mjs [baseUrl]   (default http://localhost:3000)
// Creates throwaway users with the publishable key only, uses the same cookie session as the browser,
// and deletes their startup rows afterwards. Prints no tokens, keys, or profile contents.
import { createServerClient } from "@supabase/ssr";

const base = (process.argv[2] ?? "http://localhost:3000").replace(/\/+$/, "");
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
if (!url || !key) {
  console.error("Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY.");
  process.exit(2);
}
const runEvaluate = !process.argv.includes("--skip-ai");
let failures = 0;
const check = (name, ok, detail) => {
  if (!ok) failures += 1;
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail ? ` (${detail})` : ""}`);
};

async function session(label) {
  const jar = new Map();
  const client = createServerClient(url, key, {
    cookies: { getAll: () => [...jar].map(([name, value]) => ({ name, value })), setAll: (list) => list.forEach(({ name, value }) => (value ? jar.set(name, value) : jar.delete(name))) },
  });
  const email = `smoke-${label}-${Date.now()}@example.com`;
  const { data, error } = await client.auth.signUp({ email, password: `Smoke-${crypto.randomUUID()}` });
  if (error || !data.session) throw new Error(`Sign-up ${label} failed: ${error?.message ?? "no session (email confirmation on?)"}`);
  const cookie = () => [...jar].map(([name, value]) => `${name}=${value}`).join("; ");
  return { client, cookie };
}

const api = (path, { cookie, method = "GET", body } = {}) => fetch(`${base}${path}`, {
  method,
  headers: { ...(cookie && { cookie }), ...(body !== undefined && { "content-type": "application/json" }) },
  body: body === undefined ? undefined : JSON.stringify(body),
});

const profile = { name: "Smoke Test Sdn Bhd", description: "Synthetic startup for the end-to-end smoke test.", industry: "AI and data", country: "MY", stage: "mvp", incorporationDate: "2024-03-01", companySize: 6, fundingStage: "seed" };

const a = await session("a");
const b = await session("b");
try {
  let r = await api("/api/opportunities");
  const opportunities = r.ok ? (await r.json()).data : [];
  check("GET /api/opportunities is public", r.status === 200, `status ${r.status}, ${opportunities.length} opportunities`);

  r = await api("/api/startups/me");
  check("Anonymous GET /api/startups/me is 401", r.status === 401, `status ${r.status}`);

  r = await api("/api/startups/me", { cookie: a.cookie() });
  check("New user has no profile yet (404)", r.status === 404, `status ${r.status}`);

  r = await api("/api/startups/me", { cookie: a.cookie(), method: "PUT", body: { ...profile, ownerId: "00000000-0000-4000-8000-000000000000" } });
  check("PUT with a forged ownerId is rejected (400)", r.status === 400, `status ${r.status}`);

  r = await api("/api/startups/me", { cookie: a.cookie(), method: "PUT", body: profile });
  check("PUT saves the profile", r.status === 200, `status ${r.status}`);

  r = await api("/api/startups/me", { cookie: a.cookie() });
  const saved = r.ok ? (await r.json()).data : null;
  check("Reload returns the saved profile", r.status === 200 && saved?.name === profile.name && saved?.fundingStage === "seed" && saved?.companySize === 6, `status ${r.status}`);

  r = await api("/api/startups/me", { cookie: a.cookie(), method: "PUT", body: { ...profile, stage: "growth" } });
  check("Second PUT updates the same profile", r.status === 200 && (await r.json()).data?.id === saved?.id, `status ${r.status}`);

  r = await api("/api/startups/me", { cookie: b.cookie() });
  check("Another user cannot see that profile (404)", r.status === 404, `status ${r.status}`);

  r = await api("/api/eligibility/evaluate", { method: "POST", body: { opportunityId: opportunities[0]?.id ?? "a5e40000-0000-4000-8000-000000000001" } });
  check("Anonymous eligibility check is 401", r.status === 401, `status ${r.status}`);

  if (runEvaluate && opportunities.length > 0) {
    for (const opportunity of opportunities) {
      const started = Date.now();
      r = await api("/api/eligibility/evaluate", { cookie: a.cookie(), method: "POST", body: { opportunityId: opportunity.id } });
      const seconds = ((Date.now() - started) / 1000).toFixed(1);
      if (r.ok) {
        const { evaluation, compilation } = (await r.json()).data;
        check(`Eligibility: ${opportunity.title}`, true, `${evaluation.status}, ${evaluation.results.length} rules, ${compilation.completeness}, ${compilation.model}, ${seconds}s`);
      } else {
        const body = await r.json().catch(() => ({}));
        check(`Eligibility: ${opportunity.title}`, false, `status ${r.status} ${body?.error?.code ?? ""}: ${body?.error?.message ?? ""} (${seconds}s)`);
      }
    }
  } else if (opportunities.length === 0) {
    console.log("SKIP eligibility checks: no opportunities (apply docs/demo/seed-opportunities.sql).");
  }
} finally {
  await a.client.from("startups").delete().not("id", "is", null);
  await b.client.from("startups").delete().not("id", "is", null);
}
console.log(failures === 0 ? "SMOKE: ALL CHECKS PASSED" : `SMOKE: ${failures} CHECK(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
