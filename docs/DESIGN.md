# fleetcheck — Design & Build Plan

**Status:** approved 2026-05-15, autonomous overnight build.
**Owner:** Joe Elstner (iSimplifyMe). Built by Claude Code.

## Purpose

A fleet-wide static linter for the iSimplifyMe repo fleet. It encodes, as
automated checks, the recurring failure modes that have each cost production
incidents (recorded as `⚡ RULE` entries in Joe's memory) plus baseline security
checks. Every failure mode that currently lives only as a note becomes a check
that fails loudly in CI.

Two outputs:
1. A **permanent tool** — CLI + GitHub Action — installable in any repo's CI.
2. A **one-night fleet audit** — definitive health/security matrix + safe-class
   fix PRs.

## The fleet (discovered 2026-05-15)

- 62 local git repos under `~`; 46 in the `isimplifyme` GitHub org.
- Target: ~30 Next.js/SST web repos (all iSM client + marketing sites).
- Non-web repos (apex-mobile/Expo, retell-bridge & agenthub/Python,
  content-pipeline/Shell, nexv-hicaps-bridge/C#) receive **universal checks only**.
- `gh` authed as `DelanoJoey`, scopes include `repo` + `workflow` → PR creation
  available.
- Reconciliation needed: local dir names != org repo names in places
  (`anitapatelmd` vs `anita-patel-md`); org repos `nexv`, `vesper-io`,
  `nexus-reddit-monitor` not cloned locally.

## Architecture

TypeScript + Node ESM (NodeNext). `~/fleetcheck` -> `isimplifyme/fleetcheck` (private).

```
src/
  types.ts            Check / Finding / RepoContext / RepoResult interfaces
  fleet.ts            repo discovery + fleet.config.json loading + classification
  runner.ts           run applicable checks against one repo, collect findings
  checks/
    index.ts          check registry (explicit list)
    universal/        checks that apply to any repo
    next/             checks that apply when `next` is a dependency
  reporters/
    json.ts           per-repo + aggregate JSON
    markdown.ts       the fleet health/security matrix
  fixers/             safe-class auto-fixers (CVE bump, gitignore)
  cli.ts              `scan` / `report` / `fix` subcommands (util.parseArgs)
test/
  fixtures/           per-check fake-repo fixtures
  *.test.ts           vitest, one per check
```

A **check** is a pure-ish module: `{ id, title, severity, appliesTo(repo), run(repo) }`.
Isolated, independently testable. The runner loads `RepoContext` (reads
package.json, detects `next`), runs every check whose `appliesTo` is true, and
catches per-check errors so one failure doesn't abort the repo scan.

## Check catalog

### Universal (any repo)

| id | severity | detection |
|----|----------|-----------|
| `dependency-audit` | security/warning/info | `npm audit --json` parsed; plus explicit `next` version check vs CVE-2026-44578 (`<16.2.5` -> SECURITY). Network; graceful-degrade on failure. |
| `secret-scan` | security | regex over `git ls-files` tracked files: `AKIA...`, private-key blocks, `gho_/ghp_`, `cfut_`, `sk_live_`. |
| `stale-aws-creds` | warning | recent deploy-workflow runs via `gh run list`; failures matching `SecurityToken`/`InvalidClientTokenId`/`ExpiredToken`. Network; skippable. |
| `worktrees-gitignore` | warning | `.worktrees/` absent from `.gitignore`. **Fixable.** |

### Next.js/SST (when `next` is a dependency)

| id | severity | detection |
|----|----------|-----------|
| `edge-runtime-og` | error | file imports `next/og` AND declares `runtime = 'edge'`. |
| `public-dir-collision` | error | `public/<dir>` name collides with an `app/` route segment. |
| `dynamic-params` | warning | `dynamicParams = false` present — flag to verify `generateStaticParams` exhaustive. |
| `jsonld-script` | warning | JSON-LD emitted via `next/script` `<Script>` instead of plain `<script>`. |
| `aeo-requirements` | warning | per `app/**/page.tsx`: missing any of H1 / AtomicAnswer / FAQAccordion / FAQPage schema / BreadcrumbList schema. |
| `blog-schema-spokes` | warning | `BlogPosting`/`Article` schema on a page outside a blog route. |
| `blog-url-year` | warning | route segment / slug matching `20\d\d` under a blog path. |
| `eca-template-residue` | warning | template residue strings in a repo that doesn't own them. |

### Deferred (too noisy to ship as checks)

- `await`-after-response on Lambda — too many false positives from static analysis.
- OG `<div> display:flex` — JSX child-count analysis unreliable.

Listed in README "known gaps."

## Severity model

`security > error > warning > info`. Findings carry their own severity. The
matrix counts findings per severity per repo. CI exit code is nonzero if any
`security` or `error` finding is present (configurable via `--fail-on`).

## Fix policy (Joe-approved 2026-05-15)

Auto-PR **only** the safe mechanical class:
- `next-cve-bump` — same-major patch/minor bump of `next` to the patched
  version. Cross-major bumps -> report only.
- `worktrees-gitignore` — append `.worktrees/` to `.gitignore`.

All fixes: detect package manager, apply, `git worktree add` + feature branch,
commit, `gh pr create`. **Never merged. Never deployed.** Structural findings
-> report only.

## Build plan (= the 11 tracked tasks)

1. Design + plan doc (this file).
2. Scaffold repo (TS, vitest, CLI skeleton, types, runner).
3. Universal checks + tests.
4. Next.js/SST checks + tests.
5. JSON + Markdown reporters.
6. Enumerate + classify fleet -> `fleet.config.json`.
7. Run fleet-wide scan -> health matrix.
8. Safe-class fix PRs (parallel agents, worktree-isolated).
9. GitHub Action wrapper + README.
10. Code review.
11. Morning handoff doc -> `~/claude/handoffs/`.

## Risk controls

- The linter ships nothing — read + report only.
- Fix PRs are branches; never merged, never deployed.
- No CF subdomain changes. No production deploys.
- Fix PRs in existing repos use `git worktree add` per Joe's worktree rule.
- fleetcheck itself is built on `main` directly: brand-new repo, no parallel
  sessions, nothing to protect — the worktree rule targets collision-prone
  existing repos.
