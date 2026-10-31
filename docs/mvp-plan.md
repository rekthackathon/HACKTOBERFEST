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

The UI in `feature/frontend` commit `32844cb` (`auth-form.tsx`, `startup-profile-form.tsx`) is the starting point. Replace its `TODO (backend)` stubs; don't rebuild the forms.

- `/auth` (`auth-form.tsx`): in `onSubmit`, call `createClient()` from `@/lib/supabase/client`, then `auth.signUp({ email, password })` or `auth.signInWithPassword(...)`. Show `error.message` on failure and redirect to `/startups` on success. Add a sign-out button (`auth.signOut()`). Session cookies are set by `@supabase/ssr`, so the route handlers above see the user automatically. No tokens in localStorage or URLs. Hide or remove "Forgot password" for the demo.
- `/startups` (`startup-profile-form.tsx`): on load, `GET /api/startups/me`. A 404 means an empty form and a 401 means redirect to `/auth`. Save with `PUT /api/startups/me`. Show saved and error states. Reloading the page must show the saved values.
- **The form fields must produce `startupProfileInputSchema`, because the evaluator reads these exact fields:**

  | Contract field | Form change |
  | --- | --- |
  | `name` | keep `name` |
  | `description` (required, max 4000) | use `about`; drop the 500 limit or keep it |
  | `industry` (required, max 120) | make `sectors` a single choice, or send `sectors.join(", ")` |
  | `country` | keep the names as labels, but send ISO codes `BN KH ID LA MY MM PH SG TH TL VN` |
  | `stage` | options `idea`, `prototype`, `mvp`, `growth`, `scale` (labels can be friendly) |
  | `fundingStage` | **new** select: `bootstrapped`, `pre_seed`, `seed`, `series_a`, `series_b_plus`, or "Not sure" which sends `null` |
  | `companySize` | **new** number input (team size); empty sends `null` |
  | `incorporationDate` | **new** date input (`YYYY-MM-DD`); empty sends `null` |
  | `tagline`, `website`, `looking` | no database column; leave them out of the request for the MVP (the strict schema rejects unknown keys) |

  Unknown values must be `null`, never `""` or `0`.
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

### Model: Gemma 4 (decided by the lead, 31 October 2026)

- **Model family:** Google DeepMind Gemma 4, open weights, **Apache 2.0** per the [model card](https://huggingface.co/google/gemma-4-31B-it). Sizes are E2B, E4B, 12B, 26B A4B (MoE) and 31B (dense).
- **Recommended checkpoint:** `google/gemma-4-31B-it` (instruction-tuned, 256K context). It handles rule extraction best of the sizes. `google/gemma-4-26B-A4B-it` is the faster fallback.
- **Provider (the AI owner confirms with one test call before wiring):** OpenRouter's OpenAI-compatible API. Set `AI_BASE_URL=https://openrouter.ai/api/v1` and `AI_MODEL=google/gemma-4-31b-it` ([listing](https://openrouter.ai/google/gemma-4-31b-it)). Avoid the `:free` variant for the demo, because its rate limits are shared. Google AI Studio's OpenAI-compatible endpoint is an alternative; check that it lists the Gemma 4 model before using it.
- **Weights URL:** set `AI_MODEL_WEIGHTS_URL=https://huggingface.co/google/gemma-4-31B-it`. Record the Hugging Face revision hash and the provider model ID in the README.
- **Gemma 4 notes:** it has configurable thinking modes and native system-prompt support. Parse only `choices[0].message.content` and ignore any reasoning fields. If the upstream provider rejects `response_format`, fall back to extracting the first JSON object from the content, then let Zod reject anything malformed.
- An OpenAI-compatible endpoint is only an interface. The demo claim rests on the model card and the provider model ID above.

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
3. API flow: `npm run build; npm start`, then `node --env-file=.env.local scripts/smoke-e2e.mjs http://localhost:3000`, or pass the live URL. It runs sign-up → profile 404 → save → reload → update, a cross-user 404, forged-owner rejection, anonymous 401s, and one Gemma eligibility check per opportunity, with timings. Add `--skip-ai` to skip the model calls.
4. Manual smoke on the live URL: register, log in, save the profile, hard reload and see the values, run eligibility on each seeded opportunity, sign out, and confirm `/api/startups/me` returns 401.

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
| Gemma 4 provider not confirmed | AI | One test call to `google/gemma-4-31b-it`, then set the AI env vars in Vercel and record the revision and provider ID |
| Profile form fields don't match the contract | Frontend | Apply the field mapping in Step 2 |
| Remote migration drift, schema/RLS unverified | Backend | Step 0.1–0.2 |
| Seed data not applied | Backend | Step 0.3 |
| Email confirmation and Site URL | Backend or lead | Step 0.4 |
| Vercel Supabase env not confirmed | Lead (dashboard access) | Step 0.5, redeploy |
| Startup and opportunity routes | Backend | Step 1 |
| Auth, profile, list, and result UI | Frontend | Step 2 |
| Evaluate route | AI | Step 3 |
| RLS script, smoke test, video | DevOps | Step 4 |
| Integration branch deploys live with no protection | Lead | Approve continuing for the hackathon; merges only via PR with CI green |
