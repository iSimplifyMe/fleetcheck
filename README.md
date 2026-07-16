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
| `sst-secret-fallback` | all (sst) | security | app secrets in `sst.config.ts` read as `process.env.X \|\| ""` / `?? ""` or hardcoded, instead of `sst.Secret` (infra vars — `AWS_*`, `CLOUDFLARE_*`, `CF_ZONE_*`, `GITHUB_*` — and public-by-design `NEXT_PUBLIC_*` / `*_PUBLISHABLE_KEY` / `*_URL` are allowlisted) |
| `ahpra-schema-guard` | listed repos | security | new `Review` / `AggregateRating` schema on AU medical sites beyond the pinned per-repo baseline (AHPRA National Law s133) |
| `next-cve` | next | security | Next.js versions below 16.2.6 — the May 2026 advisory batch floor (CVE-2026-45109 middleware/proxy bypass; includes CVE-2026-44578 SSRF, patched 16.2.5) |
| `opennext-version-pin` | next | error | Next 16+ deployed via `sst.aws.Nextjs` without an `openNextVersion` pin ≥ 4.0.2 (the `/_next/image` 500 incident) |
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
- uses: iSimplifyMe/fleetcheck@<full-commit-sha>   # pin to a SHA, not a branch
  with:
    fail-on: error   # security|error fail the build; warnings do not
```

The action checks the current repo and exits non-zero at or above `fail-on`.

**Pin the action to a full commit SHA**, not `@main` or a tag: branch and tag
refs are mutable, so an unpinned reference runs whatever the ref points to at
build time (supply-chain exposure). Bump the SHA deliberately when upgrading.

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
and the `fix` PR flow. An optional `path` overrides the working-tree
directory when it differs from `name` (relative paths resolve under
`--root`, e.g. `anitapatelmd` → `anita-patel-md`).

### Per-repo check settings

A repo entry may carry a `settings` object, keyed by check id:

```json
{
  "name": "signature-dentistry",
  "slug": "iSimplifyMe/signature-dentistry",
  "settings": { "ahpra-schema-guard": { "baseline": 1 } }
}
```

A repo can also ship its own settings in a `.fleetcheckrc.json` at its root
(same shape, `{ "<check-id>": { … } }`). The repo-local file wins over the
fleet config entry — it is what the single-repo GitHub Action mode reads,
since that mode never sees `fleet.config.json`.

`ahpra-schema-guard.baseline` pins the approved count of existing
`Review`/`AggregateRating` schema occurrences; anything above it fails.

## secret-scan suppressions

Suppressions are **value/shape-based, never path-based** — a real credential
in a test file still fires. What is suppressed (calibrated on the 2026-07-16
fleet baseline's six false positives):

- fixture tokens whose delimited segments say so (`xoxb-test-token`;
  segments: test/fake/dummy/example/sample/placeholder/redacted). AWS, Stripe,
  Cloudflare, and GitHub key bodies contain no delimiters, so they can never
  be value-suppressed;
- private-key `-----BEGIN…-----` markers that provably hold no key: the END
  marker on the same line with < 64 chars between (single-line test fixtures),
  or the marker immediately followed by a backtick or ellipsis (doc prose);
- an explicit escape for anything else:

  ```
  // fleetcheck-ignore-next-line: documented example token, rotated 2026-05-01
  const example = "cfut_…";
  ```

  The reason after the directive is **required** — a bare
  `fleetcheck-ignore-next-line` is inert and the finding still fires.

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
