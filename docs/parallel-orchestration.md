# Parallel Milestone Orchestration

Run multiple milestones simultaneously in isolated git worktrees. Each milestone gets its own worker process, its own branch, and its own context window — while a coordinator tracks progress, enforces budgets, and keeps everything in sync.

> **Status:** Behind `parallel.enabled: false` by default. Opt-in only — zero impact to existing users.

## Quick Start

1. Enable parallel mode in your preferences:

```yaml
---
parallel:
  enabled: true
  max_workers: 2
---
```

2. Start parallel execution:

```
/gsd parallel start
```

LSD scans your milestones, checks dependencies and file overlap, shows an eligibility report, and spawns workers for eligible milestones.

3. Monitor progress:

```
/gsd parallel status
```

4. Stop when done:

```
/gsd parallel stop
```

## How It Works

### Architecture

```
┌─────────────────────────────────────────────────────────┐
│  Coordinator (your LSD session)                         │
│                                                         │
│  Responsibilities:                                      │
│  - Eligibility analysis (deps + file overlap)           │
│  - Worker spawning and lifecycle                        │
│  - Budget tracking across all workers                   │
│  - Signal dispatch (pause/resume/stop)                  │
│  - Session status monitoring                            │
│  - Merge reconciliation                                 │
│                                                         │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐              │
│  │ Worker 1 │  │ Worker 2 │  │ Worker 3 │  ...          │
│  │ M001     │  │ M003     │  │ M005     │              │
│  └──────────┘  └──────────┘  └──────────┘              │
│       │              │              │                   │
│       ▼              ▼              ▼                   │
│  .lsd/worktrees/ .lsd/worktrees/ .lsd/worktrees/        │
│  M001/           M003/           M005/                  │
└─────────────────────────────────────────────────────────┘
```

### Worker Isolation

Each worker is a separate `lsd` process with complete isolation:

| Resource | Isolation Method |
|----------|-----------------|
| **Filesystem** | Git worktree — each worker has its own checkout |
| **Git branch** | `milestone/<MID>` — one branch per milestone |
| **State derivation** | `GSD_MILESTONE_LOCK` env var — `deriveState()` only sees the assigned milestone |
| **Context window** | Separate process — each worker has its own agent sessions |
| **Metrics** | Each worktree has its own `.lsd/metrics.json` |
| **Crash recovery** | Each worktree has its own `.lsd/auto.lock` |

### Coordination

Workers and the coordinator communicate through file-based IPC:

- **Session status files** (`.lsd/parallel/<MID>.status.json`) — workers write heartbeats, the coordinator reads them
- **Signal files** (`.lsd/parallel/<MID>.signal.json`) — coordinator writes signals, workers consume them
- **Atomic writes** — write-to-temp + rename prevents partial reads

## Eligibility Analysis

Before starting parallel execution, LSD checks which milestones can safely run concurrently.

### Rules

1. **Not complete** — Finished milestones are skipped
2. **Dependencies satisfied** — All `dependsOn` entries must have status `complete`
3. **File overlap check** — Milestones touching the same files get a warning (but are still eligible)

### Example Report

```
# Parallel Eligibility Report

## Eligible for Parallel Execution (2)

- **M002** — Auth System
  All dependencies satisfied.
- **M003** — Dashboard UI
  All dependencies satisfied.

## Ineligible (2)

- **M001** — Core Types
  Already complete.
- **M004** — API Integration
  Blocked by incomplete dependencies: M002.

## File Overlap Warnings (1)

- **M002** <-> **M003** — 2 shared file(s):
  - `src/types.ts`
  - `src/middleware.ts`
```

File overlaps are warnings, not blockers.

## Configuration

```yaml
---
parallel:
  enabled: false            # Master toggle (default: false)
  max_workers: 2            # Concurrent workers (1-4, default: 2)
  budget_ceiling: 50.00     # Aggregate cost limit in dollars (optional)
  merge_strategy: "per-milestone"  # "per-slice" or "per-milestone"
  auto_merge: "confirm"            # "auto", "confirm", or "manual"
---
```

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| `enabled` | boolean | `false` | Master toggle |
| `max_workers` | number (1-4) | `2` | Maximum concurrent worker processes |
| `budget_ceiling` | number | none | Aggregate cost ceiling in USD across all workers |
| `merge_strategy` | string | `"per-milestone"` | When to merge: `"per-slice"` or `"per-milestone"` |
| `auto_merge` | string | `"confirm"` | How merge-back is handled: `"auto"`, `"confirm"`, or `"manual"` |

## Commands

| Command | Description |
|---------|-------------|
| `/gsd parallel start` | Analyze eligibility, confirm, and start workers |
| `/gsd parallel status` | Show all workers with state, units completed, and cost |
| `/gsd parallel stop` | Stop all workers (sends SIGTERM) |
| `/gsd parallel stop M002` | Stop a specific milestone's worker |
| `/gsd parallel pause` | Pause all workers (finish current unit, then wait) |
| `/gsd parallel pause M002` | Pause a specific worker |
| `/gsd parallel resume` | Resume all paused workers |
| `/gsd parallel resume M002` | Resume a specific worker |
| `/gsd parallel merge` | Merge all completed milestones back to main |
| `/gsd parallel merge M002` | Merge a specific milestone back to main |

## Merge Reconciliation

When milestones complete, their worktree changes need to merge back to main.

### Conflict Handling

1. `.lsd/` state files (STATE.md, metrics.json, etc.) — **auto-resolved** by accepting the milestone branch version
2. Code conflicts — **stop and report**. The merge halts, showing which files conflict. Resolve manually and retry with `/gsd parallel merge <MID>`.

## Budget Management

When `budget_ceiling` is set, the coordinator tracks aggregate cost across all workers. When the ceiling is reached, the coordinator signals workers to stop.

## File Layout

```
.lsd/
├── parallel/                    # Coordinator ↔ worker IPC
│   ├── M002.status.json
│   ├── M002.signal.json
│   ├── M003.status.json
│   └── M003.signal.json
├── worktrees/                   # Git worktrees (one per milestone)
│   ├── M002/
│   │   ├── .lsd/
│   │   └── src/
│   └── M003/
└── ...
```

Both `.lsd/parallel/` and `.lsd/worktrees/` are gitignored — they're runtime-only coordination files.

## Troubleshooting

### "Parallel mode is not enabled"

Set `parallel.enabled: true` in your preferences file.

### "No milestones are eligible for parallel execution"

All milestones are either complete or blocked by dependencies. Check `/gsd queue` to see milestone status.

### Worker crashed — how to recover

1. Run `/gsd doctor --fix` to clean up stale sessions
2. Run `/gsd parallel status` to see current state
3. Re-run `/gsd parallel start` to spawn new workers for remaining milestones

### Merge conflicts after parallel completion

1. Run `/gsd parallel merge` to see which milestones have conflicts
2. Resolve conflicts in the worktree at `.lsd/worktrees/<MID>/`
3. Retry with `/gsd parallel merge <MID>`

### Workers seem stuck

Check if budget ceiling was reached: `/gsd parallel status` shows per-worker costs. Increase `parallel.budget_ceiling` or remove it to continue.
