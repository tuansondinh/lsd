# CI/CD Pipeline Guide

## Overview

LSD uses a three-stage promotion pipeline that automatically moves merged PRs through **Dev → Test → Prod** environments using npm dist-tags.

```
PR merged to main
        │
        ▼
   ┌─────────┐    ci.yml passes (build, test, typecheck)
   │   DEV   │    → publishes lsd-pi@<version>-dev.<sha> with @dev tag
   └────┬────┘
        ▼ (automatic if green)
   ┌─────────┐    CLI smoke tests + LLM fixture replay
   │  TEST   │    → promotes to @next tag
   └────┬────┘    → pushes Docker image as :next
        ▼ (manual approval required)
   ┌─────────┐    optional real-LLM integration tests
   │  PROD   │    → promotes to @latest tag
   └─────────┘    → creates GitHub Release
```

## For Contributors: Testing Your PR Before It Ships

### Install the Dev Build

Every merged PR is immediately installable:

```bash
# Latest dev build (bleeding edge, every merged PR)
npx lsd-pi@dev

# Test candidate (passed smoke + fixture tests)
npx lsd-pi@next

# Stable production release
npx lsd-pi@latest    # or just: npx lsd-pi
```

### Using Docker

```bash
# Test candidate
docker run --rm -v $(pwd):/workspace ghcr.io/lsd-build/lsd-pi:next --version

# Stable
docker run --rm -v $(pwd):/workspace ghcr.io/lsd-build/lsd-pi:latest --version
```

### Checking if a Fix Landed

1. Find the PR's merge commit SHA (first 7 chars)
2. Check if it's in `@dev`: `npm view lsd-pi@dev version`
   - If the version ends in `-dev.<your-sha>`, your PR is in dev
3. Check if it promoted to `@next`: `npm view lsd-pi@next version`
4. Check if it's in production: `npm view lsd-pi@latest version`

## For Maintainers

### Pipeline Workflows

| Workflow | File | Trigger | Purpose |
|----------|------|---------|---------|
| CI | `ci.yml` | PR + push to main | Build, test, typecheck — **gate for all promotions** |
| Release Pipeline | `pipeline.yml` | After CI succeeds on main | Three-stage promotion |
| Native Binaries | `build-native.yml` | `v*` tags | Cross-compile platform binaries |
| Dev Cleanup | `cleanup-dev-versions.yml` | Weekly | Unpublish `-dev.` versions older than 30 days |
| AI Triage | `triage.yml` | New issues + PRs | Automated classification via Claude Haiku |

### Gating Tests

The pipeline only triggers after `ci.yml` passes. Key gating tests include:

- **Unit tests** (`npm run test:unit`) — includes dispatch loop regression tests that exercise the full `deriveState → resolveDispatch → idempotency` chain without an LLM
- **Integration tests** (`npm run test:integration`)
- **Extension typecheck** (`npm run typecheck:extensions`)
- **Package validation** (`npm run validate-pack`)
- **Smoke tests** (`npm run test:smoke`) — run post-build against the local binary and the globally-installed `@dev` package
- **Fixture tests** (`npm run test:fixtures`) — replay recorded LLM conversations without hitting real APIs
- **Live regression tests** (`npm run test:live-regression`) — run against the installed binary in the Test stage

### Docs-Only PR Detection

CI automatically detects when a PR contains only documentation changes (`.md` files and `docs/` content). When docs-only:

- **Skipped:** `build`, `windows-portability` (no code to compile or test)
- **Still runs:** `lint` (secret scanning), `docs-check` (prompt injection scan)

### Prompt Injection Scan

The `docs-check` job runs a prompt injection scan on every PR that touches markdown files. It scans documentation prose (excluding fenced code blocks) for patterns that could manipulate LLM behavior when docs are ingested as context:

- System prompt markers
- Role/instruction overrides
- Hidden HTML directives
- Tool call injection patterns
- Invisible Unicode sequences that hide directives

Content inside fenced code blocks is excluded — patterns in code examples are expected and legitimate.

**False positives:** Add exceptions to `.prompt-injection-scanignore`.

### Approving a Prod Release

1. A version reaches the Test stage automatically
2. In GitHub Actions, the `prod-release` job will show "Waiting for review"
3. Click **Review deployments** → select `prod` → **Approve**
4. The version is promoted to `@latest` and a GitHub Release is created

### Rolling Back a Release

If a broken version reaches production:

```bash
# Roll back npm
npm dist-tag add lsd-pi@<previous-good-version> latest
```

For `@dev` or `@next` rollbacks, the next successful merge will overwrite the tag automatically.

### GitHub Configuration Required

| Setting | Value |
|---------|-------|
| Environment: `dev` | No protection rules |
| Environment: `test` | No protection rules |
| Environment: `prod` | Required reviewers: maintainers |
| Secret: `NPM_TOKEN` | All environments |
| Secret: `ANTHROPIC_API_KEY` | Prod environment only |
| Secret: `OPENAI_API_KEY` | Prod environment only |

## LLM Fixture Tests

The fixture system records and replays LLM conversations without hitting real APIs (zero cost).

### Running Fixture Tests

```bash
npm run test:fixtures
```

### Recording New Fixtures

```bash
# Set your API key, then record
GSD_FIXTURE_MODE=record GSD_FIXTURE_DIR=./tests/fixtures/recordings \
  node --experimental-strip-types tests/fixtures/record.ts
```

Fixtures are JSON files in `tests/fixtures/recordings/`. Each one captures a conversation's request/response pairs and replays them by turn index.

### When to Re-Record

Re-record fixtures when:
- Provider wire format changes
- Tool definitions change (affects request shape)
- System prompt changes (may cause turn count mismatch)

## Version Strategy

| Tag | Published | Format | Who uses it |
|-----|-----------|--------|-------------|
| `@dev` | Every merged PR | `x.y.z-dev.a3f2c1b` | Developers verifying fixes |
| `@next` | Auto-promoted from dev | Same version | Early adopters, beta testers |
| `@latest` | Manually approved | Same version | Production users |

Old `-dev.` versions are cleaned up weekly (30-day retention).

## Local Development Build

```bash
# Clone and build
npm install
npm run build
npm link

# Run tests
npm test

# Run the dev CLI
npm run gsd
```
