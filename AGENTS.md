# ASEAN Startup Gateway agent workflow

This phase establishes a deployable foundation. Do not expand into the full product unless assigned.

## Coordination and ownership

The DevOps lead coordinates three specialists. Assign independent tasks in parallel only with explicit paths. All agents share files: never revert teammates' changes. Ask the lead before modifying another owner's files or shared contracts. Report changed paths, checks, and blockers. Do not commit from specialist tasks.

| Owner | Paths | Branch |
| --- | --- | --- |
| Frontend | src/app pages except api, src/components, public, styles | feature/frontend |
| Backend | backend, src/app/api except AI compilation, src/lib/supabase, src/lib/env, src/proxy.ts, supabase | feature/backend |
| AI | src/lib/ai, src/lib/eligibility, compilation route, associated tests | feature/ai-engine |
| DevOps | root configuration, .github, .codex, shared contracts, mocks, docs | chore/devops-setup |

Tests follow module ownership. Contract changes require lead review before dependent implementation. Startup ownership is set from validated server identity, never request input. The initial bootstrap delegated contract/evaluator creation to the AI specialist; this does not change ongoing ownership.

## Integration rules

- Keep Python code under backend/app. Never create a root app directory: it shadows the Next.js src/app frontend.
- Inspect status and existing work first. Use feature branches and PRs against main.
- Never force push, overwrite others, commit secrets, push directly to main, or deploy production without user approval.
- Preserve API schemas in src/lib/contracts as the source of truth. Infer types from Zod.
- Run npm run check before integration. Keep CI passing and include meaningful tests for security and rule behavior.
- Require PR review and CI / Validate on main through GitHub rulesets. Only the DevOps lead approves production releases.
- No model-generated code execution. Extract only supported declarative rules; missing, unsupported, or unverified requirements need review. Preserve source URLs and exact quotes.
- Server-only AI secrets and privileged Supabase keys. Use authenticated user-scoped clients and RLS for ordinary operations; verify identity server-side.
- No PDF uploads in this foundation. If added: server-enforced size/type limits, content verification, authorization, and private storage.
- Do not log profiles, tokens, prompt contents, or documents. Use synthetic fixtures in tests.

## Handoff

Frontend: replace fictional fixtures with agreed APIs, implement auth/profile forms and loading/error/empty states.
Backend: apply and test migration in an isolated Supabase project, build authenticated CRUD and read-only opportunity APIs.
AI: evaluate open-weight model options with the team; model and provider are not confirmed. Verify the selected checkpoint's license/provider availability, implement bounded extraction with evidence verification, then integrate evaluator.
DevOps: run integration checks, connect Vercel previews, configure protected branches/release approval, prepare submission/demo.
