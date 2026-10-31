# Hackathon MVP integration plan (Option A)

Deadline: **15:00 MYT, 31 October 2026**. Goal: one reliable demo on https://startupgateway.vercel.app.

Demo flow: register → log in → save startup profile → reload profile → browse 3 real, sourced opportunities → run eligibility check with the team-selected open-weight model → show status, per-rule reasons, and original source quotes and links.

## Architecture decision

Everything runs inside the existing Next.js app on Vercel. Route handlers in `src/app/api/` use the existing cookie-based, user-scoped Supabase server client (`src/lib/supabase/server.ts`), so RLS enforces ownership in the database. No service-role key, no CORS, no second deployment.

The FastAPI service in `backend/app/` is **not** in the demo path. It stays in the repo as a reference and for later work. Its endpoint logic is the spec for the route handlers below. Do not deploy it for the demo and do not add a root `Dockerfile` or root `app/` directory.

## Step 0: Supabase and Vercel setup (Backend owner, lead confirms)

1. **Reconcile migrations.** The Supabase GitHub check fails with "Remote migration versions not found in local migrations directory". Run `supabase migration list` against the project, then commit the missing remote migration files to `supabase/migrations/` without editing applied ones.
2. **Verify schema** in the SQL editor:
   ```sql
   select table_name from information_schema.tables where table_schema = 'public';
   select tablename, policyname, cmd, roles from pg_policies where schemaname = 'public' order by 1, 2;
   select table_name, grantee, privilege_type from information_schema.role_table_grants
     where table_schema = 'public' and grantee in ('anon', 'authenticated') order by 1, 2, 3;
   ```
   Expected: `startups` has 4 owner policies and `authenticated` has select/insert/update/delete. `opportunities` has a public read policy, select only for `anon` and `authenticated`, and no write grants.
3. **Seed opportunities:** run `docs/demo/seed-opportunities.sql` once in the SQL editor. It is idempotent and every quote is verified to be an exact substring of `source_text`.
4. **Auth for the demo:** Authentication → Sign In / Providers → Email: enable email/password and **turn off "Confirm email"** for this demo project (no SMTP needed). Authentication → URL Configuration: Site URL `https://startupgateway.vercel.app`, and add `http://localhost:3000` to redirect URLs.
5. **Vercel env** (Project → Settings → Environment Variables, Production and Preview):
   - `NEXT_PUBLIC_SUPABASE_URL` = `https://cvxjlstnhanlgfcwpekq.supabase.co`
   - `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` = the publishable key (`sb_publishable_…`), never the service-role key
   - `AI_BASE_URL`, `AI_API_KEY`, `AI_MODEL`, `AI_MODEL_WEIGHTS_URL`: server-only and not `NEXT_PUBLIC_`, set once the model is chosen
   - Redeploy after changing variables. `NEXT_PUBLIC_` values are inlined at build time.

## Step 1: API routes (Backend owner, `src/app/api/`)

All handlers: `export const dynamic = "force-dynamic"`. Use `getAuthenticatedUser()` and `createClient()` from `@/lib/supabase/server`. Validate input with the shared Zod schemas and `readJsonBody`. Return errors with `apiErrorResponse` and `toErrorResponse` from `@/lib/http`. Never take `ownerId` from the request.

| Route | Behaviour |
| --- | --- |
| `GET /api/startups/me` | 401 if no user. Select the user's row (`.eq("owner_id", user.id).maybeSingle()`). 404 `NOT_FOUND` if none, otherwise `{ data: StartupProfile }` |
| `PUT /api/startups/me` | 401 if no user. Body is `startupProfileInputSchema`. Upsert `{ ...toRow(input), owner_id: user.id }` with `onConflict: "owner_id"`, then `.select().single()` and return `{ data: StartupProfile }`. This creates or updates, so the frontend never chooses between POST and PUT |
| `GET /api/opportunities` | Public. Select all rows and return `{ data: Opportunity[] }` parsed with `opportunitySchema` |

Mapping between database rows and contracts must be explicit. Postgres returns timestamps like `2026-10-31T05:00:00.123+00:00`, which `z.iso.datetime()` rejects, so normalise with `new Date(x).toISOString()`:

```ts
const toProfile = (r: StartupRow): StartupProfile => startupProfileSchema.parse({
  id: r.id, ownerId: r.owner_id, name: r.name, description: r.description, industry: r.industry,
  country: r.country, stage: r.stage, incorporationDate: r.incorporation_date, companySize: r.company_size,
  fundingStage: r.funding_stage, createdAt: new Date(r.created_at).toISOString(), updatedAt: new Date(r.updated_at).toISOString(),
});
const toOpportunity = (r: OpportunityRow): Opportunity => opportunitySchema.parse({
  id: r.id, title: r.title, description: r.description, kind: r.kind, countries: r.countries,
  deadline: r.deadline ? new Date(r.deadline).toISOString() : null, applicationUrl: r.application_url,
  sourceText: r.source_text, evidence: r.evidence, isMock: r.is_mock,
});
```

Tests: mapping round-trip and the 401 path, using synthetic fixtures only.

## Step 2: Frontend (Frontend owner, `src/app/*` pages and `src/components/`)

- `/auth`: email/password form using `createClient()` from `@/lib/supabase/client`, with `auth.signUp` and `auth.signInWithPassword`, plus a sign-out button. Session cookies are set by `@supabase/ssr`, so the route handlers above see the user automatically. No tokens in localStorage or URLs.
- `/startups`: on load, `GET /api/startups/me` (404 means an empty form). The form fields match `startupProfileInputSchema`, and optional fields send `null`, not `""` or `0`. Save with `PUT /api/startups/me`. Show saved and error states. Reloading the page must show the saved values.
- `/opportunities`: fetch `GET /api/opportunities`. Remove mock fixtures from the page. Show title, kind, countries, a description that states when the intake is closed, and the official link.
- An eligibility button on each opportunity calls `POST /api/eligibility/evaluate` with `{ opportunityId }` and needs a signed-in user with a saved profile. Show:
  - the status badge (`potentially_eligible`, `ineligible`, or `needs_review`, labelled "Needs review")
  - each result's outcome and reason
  - the evidence quote in a blockquote, with a link to `evidence.sourceUrl`
  - warnings
  - the model name
  - a "not an application decision" note
  - loading (the model call can take 10–40 s), 401 (prompt login), 404 (prompt to create a profile), and 503 (AI unavailable) states

## Step 3: AI compile and evaluate (AI owner, `src/lib/ai/` and `src/app/api/eligibility/evaluate/route.ts`)

`POST /api/eligibility/evaluate`, body `{ opportunityId: uuid }`. Add `export const maxDuration = 60`.

1. Get the user (401 if missing). Load their startup (404 if missing) and the opportunity (404), both through the user-scoped client, and map them as in Step 1.
2. Compile: look up `MemoryCache` by `compilationCacheKey({ sourceContent: opportunity.sourceText, model, promptVersion })`. On a miss, call `{AI_BASE_URL}/chat/completions` (OpenAI-compatible) with `temperature: 0`, JSON output, a timeout of about 45 s, and bounded output. `fetchJsonWithTimeout` only does GET, so either add a POST/body option or use `fetch` with `AbortSignal.timeout`. Never return or log provider payloads.
3. The prompt treats `sourceText` as untrusted data. Rules may only use the supported kinds. Every rule must quote the source verbatim. Relative ages ("less than 7 years old"), revenue, ownership, IP, team composition, sector, and OR or ambiguous conditions become `unsupported` with a reason. The model must not compute dates.
4. Validate the model JSON (`requirements` array) with `eligibilityRequirementSchema`. Server-side, for each rule:
   - set `evidence.sourceUrl` to `opportunity.applicationUrl`
   - set `evidence.retrievedAt` from the stored evidence
   - **drop any rule whose quote is not an exact substring of `sourceText`**, add a warning, and mark the compilation `partial`

   Build `CompiledRequirements` with `opportunityId`, `model` (from config), `compiledAt`, `completeness`, and `warnings`, then parse with `compiledRequirementsSchema`. Invalid JSON or schema failure returns 503 `AI_UNAVAILABLE`. Never fall back to mock data.
5. Return `{ data: { evaluation: evaluateEligibility(startup, compilation), compilation } }` so the UI can show the model name and rules.
6. Tests with a stubbed provider: a valid extraction, a hallucinated quote being dropped (which gives `needs_review`), invalid JSON (503), and missing config (503).

Expected demo outcomes with the seeded data. Make sure the AI owner sees these. A Malaysian, seed-stage startup:
- **Google SEA:** `needs_review` because the AI-product and team criteria are unsupported. Changing the profile's funding stage to `bootstrapped` gives `ineligible`.
- **Cradle Spark/Sprint:** `needs_review` because age, revenue, and ownership are unsupported. A Singapore startup gives `ineligible` on the country rule.

### Model and provider (decision pending, lead and AI owner)

Choose one open-weight checkpoint served through an OpenAI-compatible API that supports JSON output. Before setting `AI_MODEL`, the AI owner must verify the model is available at the provider and record the weights URL, revision, and license in the README. Candidates to verify, not yet confirmed: gpt-oss-120b or gpt-oss-20b (Apache-2.0), Qwen3 instruct models (Apache-2.0), Llama 3.3 70B Instruct (Llama 3.3 Community License).

## Step 4: Integration checks (DevOps lead)

1. `npm run check` on the integration branch before each merge.
2. Two-user isolation: `node --env-file=.env.local scripts/verify-rls.mjs`. This needs email confirmation off, and it uses the publishable key only. It creates two throwaway users and checks:
   - forged-owner insert is denied
   - ownership transfer is denied
   - cross-user read, update, and delete are denied
   - anonymous startup read is denied
   - public opportunity read works
   - user opportunity insert is denied
   
   It deletes its startup rows afterwards. The test users remain in Auth and can be deleted in the dashboard.
3. Manual smoke on the live URL: register, log in, save the profile, hard reload and see the values, run eligibility on each seeded opportunity, sign out, and confirm `/api/startups/me` returns 401.

## Demo video script (under 3 minutes)

| Time | Show |
| --- | --- |
| 0:00–0:20 | Problem: ASEAN founders lose time decoding programme eligibility |
| 0:20–0:45 | Register and log in on the live site |
| 0:45–1:15 | Create a Malaysian seed-stage startup profile, save, reload to show it persisted |
| 1:15–1:35 | Opportunity list: three real programmes with official links |
| 1:35–2:25 | Run eligibility on Cradle CIP Sprint: model name, extracted rules, "Needs review" with exact quotes and reasons. Change funding stage or country and rerun Google SEA to show "Ineligible" |
| 2:25–2:50 | Architecture: open-weight model extracts → Zod and quote verification → deterministic evaluator; RLS owner isolation |
| 2:50–3:00 | Repo link and MIT license |

## Owners and blockers

| Blocker | Owner | Next action |
| --- | --- | --- |
| Model and provider not chosen | Lead and AI | Decide now, set Vercel AI env vars, record weights and license |
| Remote migration drift, schema/RLS unverified | Backend | Step 0.1–0.2 |
| Seed data not applied | Backend | Step 0.3 |
| Email confirmation and Site URL | Backend or lead | Step 0.4 |
| Vercel Supabase env not confirmed | Lead (dashboard access) | Step 0.5, redeploy |
| Startup and opportunity routes | Backend | Step 1 |
| Auth, profile, list, and result UI | Frontend | Step 2 |
| Evaluate route | AI | Step 3 |
| RLS script, smoke test, video | DevOps | Step 4 |
| Integration branch deploys live with no protection | Lead | Approve continuing for the hackathon; merges only via PR with CI green |
