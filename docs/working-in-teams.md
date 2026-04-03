# Working in Teams

LSD supports multi-user workflows where several developers work on the same repository concurrently.

## Setup

### 1. Set Team Mode

The simplest way to configure LSD for team use is to set `mode: team` in your project preferences. This enables unique milestone IDs, push branches, and pre-merge checks in one setting:

```yaml
# .lsd/PREFERENCES.md (project-level, committed to git)
---
version: 1
mode: team
---
```

This is equivalent to manually setting `unique_milestone_ids: true`, `git.push_branches: true`, `git.pre_merge_check: true`, and other team-appropriate defaults. You can still override individual settings on top of `mode: team`.

Alternatively, configure each setting individually without using a mode.

### 2. Configure `.gitignore`

Share planning artifacts (milestones, roadmaps, decisions) while keeping runtime files local:

```bash
# ── LSD: Runtime / Ephemeral (per-developer, per-session) ──────
.lsd/auto.lock
.lsd/completed-units.json
.lsd/STATE.md
.lsd/metrics.json
.lsd/activity/
.lsd/runtime/
.lsd/worktrees/
.lsd/milestones/**/continue.md
.lsd/milestones/**/*-CONTINUE.md
```

**What gets shared** (committed to git):
- `.lsd/PREFERENCES.md` — project preferences
- `.lsd/PROJECT.md` — living project description
- `.lsd/REQUIREMENTS.md` — requirement contract
- `.lsd/DECISIONS.md` — architectural decisions
- `.lsd/milestones/` — roadmaps, plans, summaries, research

**What stays local** (gitignored):
- Lock files, metrics, state cache, runtime records, worktrees, activity logs

### 3. Commit the Preferences

```bash
git add .lsd/PREFERENCES.md
git commit -m "chore: enable LSD team workflow"
```

## `commit_docs: false`

For teams where only some members use LSD, or when company policy requires a clean repo:

```yaml
git:
  commit_docs: false
```

This adds `.lsd/` to `.gitignore` entirely and keeps all artifacts local. The developer gets the benefits of structured planning without affecting teammates who don't use LSD.

## Unique Milestone IDs

In team workflows, each developer should generate milestone IDs with a random suffix to avoid collisions:

```yaml
unique_milestone_ids: true
# Produces: M001-eh88as instead of M001
```

## Parallel Development

Multiple developers can run auto mode simultaneously on different milestones. Each developer:

- Gets their own worktree (`.lsd/worktrees/<MID>/`, gitignored)
- Works on a unique `milestone/<MID>` branch
- Squash-merges to main independently

Milestone dependencies can be declared in `M00X-CONTEXT.md` frontmatter:

```yaml
---
depends_on: [M001-eh88as]
---
```

LSD enforces that dependent milestones complete before starting downstream work.

## Migrating an Existing Project

If you have an existing project with `.lsd/` blanket-ignored:

1. Ensure no milestones are in progress (clean state)
2. Update `.gitignore` to use the selective pattern above
3. Add `unique_milestone_ids: true` to `.lsd/PREFERENCES.md`
4. Optionally rename existing milestones to use unique IDs
5. Commit

## Remote Questions

For headless auto mode in team environments, LSD can route interactive questions to Slack, Discord, or Telegram instead of blocking:

```yaml
remote_questions:
  channel: slack
  channel_id: "C1234567890"
  timeout_minutes: 15
  poll_interval_seconds: 10
```

See [Remote Questions](./remote-questions.md) for setup details.
