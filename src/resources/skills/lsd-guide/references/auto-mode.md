# Auto Mode — Autonomous Execution

## What Is Auto Mode?

Auto mode runs the agent **autonomously without asking for confirmation**. It executes code changes, runs commands, and makes decisions — all while you're away or focused on other things.

Start auto-mode with:
```bash
lsd -a "implement dark mode"
lsd --auto "fix all TypeScript errors"
```

## State Machine

Auto-mode runs through discrete states with clear decision points:

```
START
  ↓
[Executing Agent]
  ├─→ Crash or ERROR
  │   ├─ Attempt auto-recovery (compile, lint, test)
  │   └─ If recovery fails → MANUAL_STEERING_NEEDED
  ├─→ Subtask → PARALLEL_WORK or SEQUENTIAL_NEXT
  ├─→ Success → COMPLETION
  ├─→ Uncertain → MANUAL_STEERING_NEEDED
  └─→ Timeout → CHECKPOINT & PAUSE

[MANUAL_STEERING_NEEDED]
  ├─ User provides feedback
  └─ Resume execution

[COMPLETION]
  ├─ Run final tests
  ├─ Commit changes
  └─ Report results

END
```

## Crash Recovery

When the agent encounters an error:

1. **Identify the error** — Compile error? Test failure? Missing file?
2. **Attempt auto-recovery:**
   - Run `npm run build` or equivalent
   - Run tests to find root cause
   - Suggest fixes
3. **If recovery succeeds** → Continue execution
4. **If recovery fails** → Pause and request manual steering

Example recovery flow:
```
❌ TypeScript compilation failed
  → Auto-fix common errors (imports, unused vars)
  → Re-run compile
  → If still failing, ask user for guidance
```

## Manual Steering

When the agent is uncertain or recovery failed, it pauses and asks for help:

```
⚠️  Not sure how to proceed. 

The test failed with a timeout. Should I:
1. Increase timeout to 5000ms
2. Refactor the async logic
3. Skip this test and continue
```

You can:
- **Answer the question** — Provide explicit guidance
- **Give a command** — `/skill lint` to load help
- **Retry** — Run `/retry` to attempt again
- **Continue anyway** — Tell it to skip and move on

## Auto Mode vs Interactive Mode

| Aspect | Interactive | Auto |
|--------|-------------|------|
| **When you ask** | Agent pauses, asks | Agent decides |
| **File changes** | Requires approval | Executes immediately |
| **Errors** | Shows error, stops | Attempts recovery |
| **Uncertainty** | Asks for clarification | Uses heuristics, sometimes asks |
| **Time** | Real-time | Can run overnight |
| **Control** | Full (every step) | Partial (steering only) |
| **Best for** | Learning, careful work | Production, automation |

## Configuration

### Set Default Mode

In `~/.lsd/settings.json`:
```json
{
  "defaultPermissionMode": "auto"
}
```

Or at runtime:
```bash
LSD_PERMISSION_MODE=auto lsd -a
```

### Permission Modes

**interactive** (default)
- Ask before every change
- Requires explicit approval
- No file changes without permission

**audited**
- Execute changes
- Show diffs afterward
- Allows corrections

**auto**
- Execute without asking
- Only pause for genuine uncertainty
- Recovery attempts automatic

## Common Auto-Mode Workflows

### 1. Full Feature Implementation

```bash
lsd -a "add user authentication system
- Implement login/signup pages
- Create database schema
- Add authentication middleware
- Write tests
"
```

Expected: Hours to complete, with occasional steering needed.

### 2. Bug Fixing

```bash
lsd -a "fix the infinite loop in sync.ts
- Identify root cause
- Apply fix
- Run tests to verify
- Check for similar issues
"
```

Expected: Minutes, minimal steering.

### 3. Refactoring

```bash
lsd -a "refactor auth.ts to use dependency injection
- Extract dependencies
- Update imports
- Update tests
- Verify no regressions
"
```

Expected: Moderate steering if type errors occur.

### 4. Optimization

```bash
lsd -a "optimize database queries in user.service.ts
- Find N+1 queries
- Add indexes where needed
- Batch requests
- Measure improvement
"
```

Expected: Some steering for database decisions.

## Checkpoint & Resume

Long auto-mode runs create checkpoints:

```bash
lsd -a "big task"

# After 2 hours, it checkpoints and pauses
# Run later to resume:

lsd -c
```

The session resumes exactly where it left off with full history.

## Parallel Work

Auto-mode can orchestrate parallel tasks:

```bash
lsd -a "
Phase 1 (parallel):
- Frontend: implement UI components
- Backend: create API endpoints
- Tests: write test suite

Phase 2 (sequential):
- Integration: connect frontend to backend
- E2E: test full workflow
- Deploy: push to staging
"
```

See `references/parallel-orchestration.md` for details.

## When to Use Auto Mode

**Good use cases:**
- ✅ Well-defined tasks ("add login form")
- ✅ Known solutions ("refactor to TypeScript")
- ✅ Automated workflows (CI/CD, nightly jobs)
- ✅ Large features with clear steps
- ✅ Repetitive work (linting, testing)

**Avoid auto-mode for:**
- ❌ Ambiguous goals ("make it better")
- ❌ Novel/research problems ("invent new algorithm")
- ❌ Subjective design ("beautiful UI")
- ❌ External dependencies ("call third-party API")

## Monitoring Auto Mode

### Check Status

```bash
lsd -a "task"     # Runs in background
lsd -c            # Check progress
```

### View Live Progress

Auto-mode outputs progress in real-time:
```
🔄 Implementing auth system...
  ├─ Created schema
  ├─ Wrote middleware
  ├─ ✅ Login handler
  ├─ ⏳ Signup handler (in progress)
  └─ Tests: pending
```

### Pause & Resume

```bash
Ctrl+C    # Pause (saves checkpoint)
lsd -c    # Resume from checkpoint
```

### Cancel Completely

```bash
lsd -c --clear-history    # Cancel & clear history
```

## Troubleshooting Auto Mode

### "Stuck in Recovery Loop"

If auto-mode keeps failing at the same point:

1. **Pause** — Press `Ctrl+C`
2. **Resume & steer** — Run `lsd -c` and provide guidance
3. **Manual mode** — Switch to interactive to see all context

### "Wrong Decision Made"

If auto-mode made a bad choice:

1. **Pause** — Press `Ctrl+C`
2. **Revert** — `git checkout HEAD~1` to undo
3. **Resume** — Run `lsd -c` and steer differently

### "Silent Failure"

If auto-mode exits without error but didn't complete:

```bash
lsd doctor         # Health check
lsd forensics      # Detailed diagnostics
lsd -c             # Check what happened
```

## Advanced: Custom Recovery Logic

For complex projects, customize recovery behavior:

In `.lsd/settings.json`:
```json
{
  "autoModeRecovery": {
    "maxRetries": 3,
    "retryDelay": 5000,
    "failFast": false,
    "testCommand": "npm test",
    "lintCommand": "npm run lint"
  }
}
```

## Best Practices

1. **Start small** — Try auto-mode on simple tasks first
2. **Monitor progress** — Check back occasionally
3. **Set realistic goals** — "Add button" not "redesign UI"
4. **Provide context** — Include relevant files in prompt
5. **Use checkpoints** — Save progress regularly
6. **Have recovery plan** — Know how to revert if needed
7. **Read steering requests** — Auto-mode asks for good reasons

## See Also

- `references/permissions.md` — Permission modes in detail
- `references/troubleshooting.md` — Debugging auto-mode issues
- `references/parallel-orchestration.md` — Parallel task execution
