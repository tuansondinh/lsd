# Subagents — Isolated Agent Processes

## What Are Subagents?

Subagents are **isolated agent processes** with separate context windows and execution environments. Each subagent:
- Runs in its own process with separate memory
- Can execute independently (foreground or background)
- Has its own session context
- Can run in parallel with other subagents
- Completes and announces results

## When to Use Subagents

| Use Case | Example | Mode |
|----------|---------|------|
| **Parallel work** | Plan + implement simultaneously | background |
| **Delegation** | Ask a specialist to handle one task | background |
| **Context isolation** | Each subagent needs fresh perspective | background |
| **Large features** | Break into independent subtasks | background |
| **Team workflows** | Different agents for different roles | background |

## Foreground vs Background

### Foreground Subagent

Blocks the main session. Used for small, sequential tasks.

```
subagent(agent: "reviewer", task: "review this PR")

← Waits here for result
```

Rarely used. Prefer background for better UX.

### Background Subagent

Non-blocking. Main session continues immediately.

```
subagent(agent: "formatter", task: "lint the code", background: true)

← Returns immediately with job ID
✓ Main session continues

<Later>
/subagents wait sa_xxxxx
← Waits for job to complete
```

## Running Subagents

### Simple Background Subagent

```typescript
subagent({
  agent: "worker",
  task: "implement the login form"
})
```

Returns immediately with job ID like `sa_a1b2c3d4`.

### With Custom Working Directory

```typescript
subagent({
  agent: "builder",
  task: "build the Docker image",
  cwd: "./docker"
})
```

### With Model Override

```typescript
subagent({
  agent: "planner",
  task: "plan the feature",
  model: "claude-opus"  // Use specific model
})
```

## Managing Background Subagents

### List Running Jobs

```
/subagents list
```

Output:
```
Running background subagents:
  sa_a1b2c3d4 — formatter (linting code, 5s)
  sa_f5e6d7c8 — builder (building project, 12s)

Completed (last hour):
  sa_x9y8z7w6 — reviewer (code review, ✓ 2m 14s)
```

### Wait for Completion

```
/subagents wait
```

Blocks until any running subagent finishes. Or wait for specific job:

```
/subagents wait sa_a1b2c3d4
```

### View Job Output

```
/subagents output sa_a1b2c3d4
```

Shows job's final summary, errors, and execution time.

### Get Job Details

```
/subagents info sa_a1b2c3d4
```

Shows:
- Status (running/completed/failed/cancelled)
- Agent name
- Task
- Start time, elapsed time
- Model used
- Exit code, stderr, stdout

### Cancel a Job

```
/subagents cancel sa_a1b2c3d4
```

Stops the job immediately. It can't be resumed.

## Parallel Orchestration

Run multiple subagents at once:

```typescript
subagent({
  tasks: [
    { agent: "designer", task: "design the UI wireframes" },
    { agent: "backend", task: "create database schema" },
    { agent: "frontend", task: "build React components" }
  ]
})
```

All three run simultaneously. Main session continues.

## Chained Subagents

Run subagents sequentially, passing results between them:

```typescript
subagent({
  chain: [
    {
      agent: "planner",
      task: "plan the feature"
    },
    {
      agent: "designer",
      task: "design based on plan: {previous}"
    },
    {
      agent: "builder",
      task: "implement from design: {previous}"
    }
  ]
})
```

`{previous}` is replaced with the prior subagent's output.

## Agents (Subagent Types)

Agents are specialized persona that subagents can use:

| Agent | Specialty | Use For |
|-------|-----------|---------|
| `planner` | Architecture, design, decomposition | Planning features |
| `worker` | Implementation, coding | Building code |
| `reviewer` | Code quality, bugs, standards | Review PRs, audit |
| `builder` | Builds, deploys, infrastructure | DevOps, setup |
| `scout` | Research, discovery, context | Finding information |

Create custom agents in `.lsd/agents/`.

## Real-World Workflows

### Example 1: Parallel Feature Development

```
Main session: Plan the sprint

/subagents list
  (checking if parallel work is running)

User delegates to background subagents:
  - Frontend team: UI components
  - Backend team: API endpoints
  - QA: Test suite

Main session: coordinate

/subagents wait
  (waits for all to finish)

Result: Feature complete in parallel time
```

### Example 2: Code Review Pipeline

```
1. User uploads a PR

subagent({
  agent: "reviewer",
  task: "review the PR for code quality",
  background: true
})
← Returns sa_xxxxx immediately

2. Main session continues

3. Later, check results

/subagents output sa_xxxxx
```

### Example 3: Nightly CI/CD

```bash
# Runs auto, background, detached
lsd -a "
/subagents run-all-tests
" &

# Main process exits, background jobs continue
# Results reported via webhook/email
```

## Subagent Announcement

When a background subagent completes, LSD announces it:

```
✓ Background subagent sa_a1b2c3d4 (formatter, 14s)
> Linting code in src/

ESLint found 3 errors in src/app.ts:
  - Line 45: Unused variable 'temp'
  - Line 67: Missing semicolon
  - Line 89: Prefer const over let
```

Announcement includes:
- Job ID
- Agent name
- Elapsed time
- Task (preview)
- Summary (first 300 chars)
- Model used

You can continue your main session while reading the announcement.

## Foreground Subagent Control

Move a foreground subagent to background:

```
Ctrl+B
```

Useful when a foreground task is taking too long.

Returns:
```
Moved worker to background as sa_a1b2c3d4.
```

## Troubleshooting Subagents

### "Job never completes"

```
/subagents info sa_xxxxx

→ Shows if still running or if hung
```

If stuck:
```
/subagents cancel sa_xxxxx
```

### "Can't spawn more subagents"

```
Maximum concurrent background subagents reached (10).
Use /subagents cancel <id> to free a slot.
```

Solution:
```
/subagents list
/subagents cancel sa_old_job
```

### "Output not showing"

If you miss the announcement, view it:
```
/subagents output sa_xxxxx
```

Or check log:
```
/subagents info sa_xxxxx
```

## Performance Considerations

**Pros:**
- Parallel execution saves time
- Context isolation prevents crosstalk
- Independent failures don't block main session
- Better for team workflows

**Cons:**
- Subagent can't access main session memory/context
- Some duplication of effort (each has own context)
- Token cost higher (multiple agents) but parallelism saves wall-clock time

## Best Practices

1. **Use background, not foreground** — Better UX
2. **Wait explicitly** — Use `/subagents wait` to block when needed
3. **Monitor progress** — Check `/subagents list` occasionally
4. **Use chains for dependencies** — Sequential when order matters
5. **Use parallel for independence** — Simultaneous when possible
6. **Name agents meaningfully** — "frontend", "backend", not "agent1"
7. **Keep tasks focused** — Small, well-defined subtasks work best

## See Also

- `references/parallel-orchestration.md` — Advanced parallel workflows
- `references/auto-mode.md` — How auto-mode uses subagents
- `references/commands.md` — `/subagents` command reference
