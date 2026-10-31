# Supabase integration handoff

## Runtime foundation

Set `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` in `.env.local` and the corresponding Vercel environment. Both are public project configuration; do not put a service-role key in either field. No service-role key is needed by these helpers.

`src/lib/supabase/client.ts` creates the browser client. `server.ts` creates a cookie-scoped server client and exposes `getAuthenticatedUser()`, which verifies the user with Supabase Auth. Every protected Route Handler must check this result and derive ownership from the returned user ID; never accept an owner ID from the request as authorization.

`src/proxy.ts` refreshes sessions on the planned auth, dashboard, startup, and eligibility routes. Missing credentials allow public foundation pages to work; this does not grant access to protected operations. The proxy is a refresh mechanism, not an access-control boundary. Call the server authentication helper in every protected operation, and avoid caching personalized responses. Add new protected paths to its matcher as development expands.

## Cloud configuration

1. Provision a Supabase development project near the Vercel region; keep preview data separate from production.
2. Enable email/password Auth and retain email confirmation for production. Configure a working SMTP provider before relying on production confirmation mail.
3. Set Auth Site URL and an explicit allowed redirect for local development (`http://localhost:3000/auth/callback`) and each trusted preview/production callback. Implement that callback before enabling the full sign-up flow. Avoid permissive production wildcards.
4. Apply and test the reviewed foundation migration on a disposable local database first, then development. Production migration and release require DevOps lead approval.
5. Verify Data API grants and RLS together. Supabase's 2026 Data API changes require explicit table grants; policy definitions alone are insufficient.
6. Keep storage disabled until uploads are implemented. Before enabling uploads, add a private bucket, owner policies, a byte limit and accepted MIME types, then validate file signatures on the server.

## Verification gate before backend integration

The CLI-generated migration `supabase/migrations/20261031025937_foundation.sql` defines profiles, owner-private startups, public-read opportunities, and public-read compiled requirements. Database columns use snake_case; map them explicitly to the camelCase Zod contracts in Route Handlers. Programme facts and compilations have no end-user write grants or write policies; only a reviewed admin ingestion process may create them. JSON evidence and requirements must also pass the shared Zod schemas before insertion and after retrieval. Publishing startup profiles for networking will require a deliberate field-level privacy design and a reviewed new migration.

This migration was authored as a reviewable foundation without a running database and has not been applied. Each user owns at most one startup, matching the planned `/api/startups/me` contract. Generate database TypeScript types after applying it to development. Do not treat the JSON shape constraints as a replacement for Zod validation.

Use two separate users and an anonymous client. Confirm each user can create/read/update/delete their own startup and cannot read, edit, delete, or transfer ownership of the other user's private startup. Confirm users cannot write opportunity or compiled-requirement records, while permitted public opportunity reads work. Test INSERT and UPDATE ownership checks as well as SELECT and DELETE. Do not use a service-role client in these tests because it bypasses RLS.

Live Auth and RLS checks require a configured project or local Supabase with Docker. They are not verified by the environment unit tests or a successful Next.js build. The backend developer must complete these checks before connecting real user data.

## References checked

- [Supabase SSR clients and Next.js proxy](https://supabase.com/docs/guides/auth/server-side/creating-a-client?framework=nextjs)
- [Supabase Row Level Security](https://supabase.com/docs/guides/database/postgres/row-level-security)
- [Supabase changelog](https://supabase.com/changelog) — checked 31 October 2026; use Node 22 or newer and explicit Data API grants.
