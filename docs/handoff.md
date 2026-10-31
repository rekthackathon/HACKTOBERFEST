# Integration and demo handoff

| Team member | Next work | Acceptance |
| --- | --- | --- |
| Frontend | Auth/profile forms, real opportunity API, eligibility evidence UI | Loading/error/empty states; no fictional records presented as real |
| Backend | Apply isolated migration, implement authenticated profile CRUD and read-only opportunity routes | Real two-user ownership tests; anonymous writes denied; forged owner input rejected |
| AI | Verify Qwen checkpoint/license/provider, implement bounded source-to-JSON extraction and exact quote checks | Actual hosted inference; missing/unsupported evidence => needs review; provider failure tests |
| DevOps lead | Authenticate GitHub, PR integration, Supabase/Vercel setup, hosted checks, release approval | CI passes; preview verified; main protected; explicit production approval |

## Submission acceptance

- Public repository, MIT code license, setup guide and description.
- Name exact Qwen checkpoint, weights link/revision/license and provider model ID.
- Show source text, extracted rule, source quote, deterministic evaluation and needs-review behavior.
- Replace demo fixtures with sourced opportunities; preserve official application links and dates.
- Demonstrate two independent users cannot modify each other's startup records.
- Record a video under three minutes: problem, discovery, startup profile, real eligibility extraction, evidence/result, open-weight architecture.
- Submit before 15:00 Asia/Kuala_Lumpur on 31 October 2026.

## Foundation limitations

No real inference or product CRUD/auth UI is implemented. Hosted CI, RLS execution and Vercel readiness must be verified after authenticated service configuration. A local passing build does not establish production readiness.

Dependency audit on 31 October 2026: production dependencies have zero reported vulnerabilities; the development lint toolchain reports 16 moderate advisories from minimatch dependency paths. ESLint 9 is pinned for compatibility with the current Next.js React/import/accessibility plugins; ESLint 10 currently produces peer conflicts. Review upstream fixes before upgrading; do not run a forced audit downgrade.
