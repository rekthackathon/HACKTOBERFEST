# Deployment runbook

## Vercel

1. Sign in and import rekthackathon/HACKTOBERFEST into the intended team. Framework Next.js, root repository directory, Node 24, install npm ci, build npm run build. Confirm no existing project is being replaced.
2. Leave main production Git deployments disabled by vercel.json. Push a reviewed feature branch for a preview. No Vercel credentials are required in GitHub Actions for Git integration.
3. Add public Supabase URL/publishable key to Preview and Production separately. Keep AI_BASE_URL, AI_API_KEY, AI_MODEL and optional AI_MODEL_WEIGHTS_URL server-side. Configure secrets directly in service settings; do not paste them into chats or PRs. AI credentials are not needed until extraction is implemented.
4. Use an isolated Supabase preview project, apply and validate the migration, configure Auth Site URL and exact allowed callback URLs. Avoid broad wildcard auth redirects for untrusted previews. Do not connect unreviewed branches to production data.
5. Verify pages, /api/health, authentication and owner isolation when implemented, and a real evidence extraction using the selected model. The current preview only proves foundation routing and rendering.
6. Require GitHub CI / Validate, PR review, and a main ruleset preventing direct pushes. Configure Vercel deployment checks where available. These settings require repository/team access and are not activated by committing configuration.
7. Only after explicit lead approval, enable production main deployments, confirm the target team/project/commit and production environment, and release the reviewed commit. Do not enable automatic production while preparing the foundation.

Git integration builds previews independently of GitHub CI; a preview build can exist even when tests fail. Review CI before merging or releasing. Keep production protected until the release approval and service checks are complete.

## Environment checklist

| Variable | Scope | Requirement |
| --- | --- | --- |
| NEXT_PUBLIC_SUPABASE_URL | Public | Supabase project URL, paired with key |
| NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY | Public | Publishable key; RLS still required |
| AI_BASE_URL | Server | HTTPS OpenAI-compatible base endpoint |
| AI_API_KEY | Secret server | Inference credential |
| AI_MODEL | Server | Team-selected open-weight model ID available at provider |
| AI_MODEL_WEIGHTS_URL | Server metadata | Published checkpoint/model-card URL |
| SUPABASE_SERVICE_ROLE_KEY | Secret server | Not used/required; avoid provisioning unless reviewed admin task needs it |

No production secrets are needed by CI. No PDF storage bucket is provisioned. Do not enable uploads until limits, private access, and content validation exist.

## Rollback

Before an approved release, record the last known good deployment and migration state. Application rollback must be compatible with the database schema. Prefer additive migrations; do not blindly reverse schema or delete data. Vercel rollback/promotion is a production action requiring lead approval.
