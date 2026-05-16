# fleetcheck

Fleet-wide linter for the iSimplifyMe Next.js/SST repo fleet. It encodes the
recurring failure modes that have each cost a production incident — the
`⚡ RULE` entries in the team's memory — plus baseline security checks, as
automated checks that fail in CI instead of in production.

Two ways to use it:

- **Fleet scan** — audit every repo at once, producing a health/security matrix.
- **Single-repo check** — run in one repo's CI via the bundled GitHub Action.

## What it checks

Each check declares whether it applies to every repo or only to Next.js repos
(detected by a `next` dependency).

| Check | Scope | Severity | Catches |
|-------|-------|----------|---------|
| `secret-scan` | all | security | AWS / GitHub / Stripe / Cloudflare / Slack credentials committed to source |
| `next-cve` | next | security | Next.js versions exposed to CVE-2026-44578 (SSRF; patched in 16.2.5) |
| `stale-aws-creds` | all | warning | deploy workflows whose recent runs failed on AWS credential errors |
| `worktrees-gitignore` | all | warning | `.gitignore` missing `.worktrees/` |
| `edge-runtime-og` | next | error | files that import `next/og` and declare the edge runtime |
| `public-dir-collision` | next | error | a `public/<dir>` that collides with an app route (`s3.routes` 403) |
| `dynamic-params` | next | warning | `dynamicParams = false` — verify `generateStaticParams` is exhaustive |
| `jsonld-script` | next | warning | JSON-LD rendered through `next/script` instead of a plain `<script>` |
| `aeo-requirements` | next | info | per-repo summary of pages missing h1 / AtomicAnswer / FAQ schema |
| `blog-schema-spokes` | next | warning | BlogPosting/Article schema on a non-blog route |
| `blog-url-year` | next | warning | year tokens in blog route URLs |
| `eca-template-residue` | next | warning | lorem ipsum / placeholder phone numbers left in shipped copy |

Severity order: `security` > `error` > `warning` > `info`.

## CLI

```bash
npm install        # install dependencies

# Single repo (used by the GitHub Action):
npm run dev -- check [path] [--fail-on <severity>] [--json]

# Whole fleet:
npm run dev -- scan --root <dir> [--repo <name>] [--out <dir>] [--fail-on <sev>]

# Re-render the matrix from a previous scan:
npm run dev -- report [--out <dir>]
```

`scan` reads `fleet.config.json`, resolves each repo at `<root>/<name>`, runs
all applicable checks, and writes to `reports/`:

- `scan.json` — full machine-readable result
- `<repo>.json` — per-repo result
- `fleet-health-matrix.md` — the human-readable matrix

`fix --safe` (build phase 8) opens worktree-based PRs for the safe mechanical
class only: a same-major Next.js CVE patch bump and the `.worktrees/` gitignore
line. It never merges and never deploys.

## GitHub Action

Add to any repo's CI:

```yaml
- uses: actions/checkout@v4
- uses: iSimplifyMe/fleetcheck@main
  with:
    fail-on: error   # security|error fail the build; warnings do not
```

The action checks the current repo and exits non-zero at or above `fail-on`.

## fleet.config.json

```json
{
  "repos": [
    { "name": "<local-dir-name>", "slug": "<org>/<repo>", "skip": false }
  ]
}
```

`name` is the working-tree directory under `--root`; `slug` is the GitHub
`org/repo` (they differ for several repos). `slug` powers `stale-aws-creds`
and the `fix` PR flow.

## Exit codes

`scan`/`check` exit `2` when any finding is at or above `--fail-on`
(`check` defaults to `error`). Set `FLEETCHECK_NO_NETWORK=1` to skip checks
that call the network (`stale-aws-creds`).

## Known gaps

Two memory rules were deliberately left unimplemented — static analysis
produces too many false positives to be useful:

- `await`-after-response on Lambda handlers
- `display: flex` on multi-child `<div>` inside `next/og` ImageResponse

`dependency-audit` (full `npm audit` integration beyond the Next.js CVE) is a
planned enhancement.

fleetcheck scans each repo's **working tree as-is**, on whatever branch it is
checked out on — results can differ from the deployed default branch. The first
fleet scan over-reported `next-cve` because several repos were on stale feature
branches. Scan clean default-branch checkouts for a deployed-state audit; a
`--ref` flag is a planned enhancement.

## Adding a check

A check is a module exporting a `Check`: `{ id, title, severity, appliesTo,
run }`. `run(repo)` returns `Finding[]`. Add the module under
`src/checks/universal/` or `src/checks/next/`, register it in
`src/checks/index.ts`, and add a fixture-backed test under `test/`.

## Development

```bash
npm test           # vitest
npm run build      # tsc -> dist/
```
