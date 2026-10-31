# ASEAN Startup Gateway

A professional discovery gateway for ASEAN founders, startups, investors, and ecosystem organisations. Built for Hacktoberfest Hack Day KL 2026, Problem Statement 2, Category B.

The planned AI feature compiles programme requirements using a published **Qwen open-weight model**, validates the result with Zod, and evaluates supported rules deterministically. It must return potentially eligible, ineligible, or needs review with original evidence. A model's unsupported assumptions are never eligibility requirements. DigitalOcean is optional and is not required by this architecture.

## Current scope

This is the DevOps foundation, not the completed hackathon product. It includes a responsive fictional discovery preview, Next.js 16 / React / TypeScript, Tailwind v4 and a shadcn-compatible Button, Supabase SSR helpers, schema/RLS setup, shared contracts, conservative rule evaluation, mock fixtures, CI, and team agent instructions. Authentication forms, database CRUD routes, real opportunity ingestion, and hosted Qwen extraction are next-phase work. No live AI calls occur yet; AI integration is necessary before claiming a working open-weight AI submission.

## Local setup

Use Node.js 24 (see .nvmrc) and npm. From the repository root:

```sh
npm ci
npm run dev
```

Open http://localhost:3000. The demo and `/api/health` work without credentials. To connect services, copy `.env.example` to `.env.local` and fill values locally. Never commit the latter. See [Supabase setup](docs/supabase.md) before enabling live data.

```sh
npm run check
npm run build
npm start
```

`check` runs ESLint, Next route type generation + TypeScript, Vitest, and a production build. Build does not need cloud secrets. CI uses npm ci and runs the same checks independently. `/api/health` indicates process availability, not cloud readiness.

## Architecture

```text
src/app/                 App Router pages and server Route Handlers
src/components/          UI and shadcn-compatible primitives
src/lib/contracts/       Zod schemas and inferred shared types
src/lib/mocks/           Fictional development fixtures
src/lib/eligibility/     Pure deterministic rule evaluator
src/lib/ai/              Server-only provider configuration; extraction handoff
src/lib/supabase/        Browser, server, session and identity helpers
src/lib/env/             Lazy environment validation
supabase/migrations/     Database schema, grants and RLS
tests/                   Contract, rule and configuration tests
.github/workflows/       Secret-free validation
.codex/agents/           Frontend, backend and AI specialist instructions
docs/                    API contracts, service setup, deployment and handoff
```

Flow: official source → Qwen extraction (to implement) → Zod + evidence verification → deterministic evaluator → reviewed UI result. The evaluator does not execute model output. [Contracts and endpoint plan](docs/api-contracts.md) define integration boundaries.

## Team workflow

Read [AGENTS.md](AGENTS.md). Branches: `feature/frontend`, `feature/backend`, `feature/ai-engine`, and `chore/devops-setup`. Each developer branches from reviewed main once it exists, owns separate paths, and opens a PR. DevOps coordinates contract changes and integration. Current Codex supports standalone project agent TOML files; older clients can follow AGENTS.md directly. No model/provider override is imposed.

## Deployment

Use [the deployment runbook](docs/deployment.md). Vercel Git integration handles feature previews. Production Git deployment for main is disabled in vercel.json until the lead approves a release. No production deployment is performed by CI. Configure branch rules and deployment checks separately; repository files alone do not enable hosted protections.

## Open-weight AI qualification

Select a specific published Qwen checkpoint whose model card/license permits the use, then record its weights URL, revision, license, inference provider, and provider model ID. Do not assume a hosted alias proves which weights run. An OpenAI-compatible API is an interface, not evidence that its model has published weights. The AI engineer must demonstrate actual source extraction through the selected model and include evidence-backed results and failure handling before submission. Model weights retain their own licenses; MIT covers this repository's original code.

## Submission

Before 3 PM MYT, 31 October 2026: verify public repository and MIT license, working application or local instructions, project description, real open-weight AI demonstration, and a demo video under three minutes. See [handoff checklist](docs/handoff.md).

## References

- [Next.js installation](https://nextjs.org/docs/app/getting-started/installation)
- [Supabase SSR](https://supabase.com/docs/guides/auth/server-side/creating-a-client)
- [Codex subagents](https://learn.chatgpt.com/docs/agent-configuration/subagents)
- [Vercel Git deployments](https://vercel.com/docs/git)

## License

[MIT](LICENSE).
