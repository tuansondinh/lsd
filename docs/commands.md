# Commands Reference

## Session Commands

| Command | Description |
|---------|-------------|
| `/gsd` | Step mode — execute one unit at a time, pause between each |
| `/gsd next` | Explicit step mode (same as `/gsd`) |
| `/gsd auto` | Autonomous mode — research, plan, execute, commit, repeat |
| `/gsd quick` | Execute a quick task with LSD guarantees (atomic commits, state tracking) without full planning overhead |
| `/gsd stop` | Stop auto mode gracefully |
| `/gsd pause` | Pause auto-mode (preserves state, `/gsd auto` to resume) |
| `/gsd steer` | Hard-steer plan documents during execution |
| `/gsd discuss` | Discuss architecture and decisions (works alongside auto mode) |
| `/gsd status` | Progress dashboard |
| `/gsd widget` | Cycle dashboard widget: full / small / min / off |
| `/gsd queue` | Queue and reorder future milestones (safe during auto mode) |
| `/gsd capture` | Fire-and-forget thought capture (works during auto mode) |
| `/gsd triage` | Manually trigger triage of pending captures |
| `/gsd dispatch` | Dispatch a specific phase directly (research, plan, execute, complete, reassess, uat, replan) |
| `/gsd history` | View execution history (supports `--cost`, `--phase`, `--model` filters) |
| `/gsd forensics` | Full-access LSD debugger — structured anomaly detection, unit traces, and LLM-guided root-cause analysis for auto-mode failures |
| `/gsd cleanup` | Clean up LSD state files and stale worktrees |
| `/gsd visualize` | Open workflow visualizer (progress, deps, metrics, timeline) |
| `/gsd export --html` | Generate self-contained HTML report for current or completed milestone |
| `/gsd export --html --all` | Generate retrospective reports for all milestones at once |
| `/gsd update` | Update LSD to the latest version in-session |
| `/gsd knowledge` | Add persistent project knowledge (rule, pattern, or lesson) |
| `/fast` | Toggle service tier for supported models (prioritized API routing) |
| `/gsd rate` | Rate last unit's model tier (over/ok/under) — improves adaptive routing |
| `/gsd changelog` | Show categorized release notes |
| `/gsd logs` | Browse activity logs, debug logs, and metrics |
| `/gsd remote` | Control remote auto-mode |
| `/gsd help` | Categorized command reference with descriptions for all GSD subcommands |

## Configuration & Diagnostics

| Command | Description |
|---------|-------------|
| `/gsd prefs` | Model selection, timeouts, budget ceiling |
| `/gsd mode` | Switch workflow mode (solo/team) with coordinated defaults |
| `/gsd config` | Re-run the provider setup wizard (LLM provider + tool keys) |
| `/gsd keys` | API key manager — list, add, remove, test, rotate, doctor |
| `/gsd doctor` | Runtime health checks with auto-fix |
| `/gsd inspect` | Show SQLite DB diagnostics |
| `/gsd init` | Project init wizard — detect, configure, bootstrap `.lsd/` |
| `/gsd setup` | Global setup status and configuration |
| `/gsd skill-health` | Skill lifecycle dashboard — usage stats, success rates, token trends, staleness warnings |
| `/gsd skill-health <name>` | Detailed view for a single skill |
| `/gsd skill-health --declining` | Show only skills flagged for declining performance |
| `/gsd skill-health --stale N` | Show skills unused for N+ days |
| `/gsd hooks` | Show configured post-unit and pre-dispatch hooks |
| `/gsd run-hook` | Manually trigger a specific hook |
| `/gsd migrate` | Migrate a `.planning` (v1) or `.gsd/` directory to `.lsd/` format |

## Milestone Management

| Command | Description |
|---------|-------------|
| `/gsd new-milestone` | Create a new milestone |
| `/gsd skip` | Prevent a unit from auto-mode dispatch |
| `/gsd undo` | Revert last completed unit |
| `/gsd undo-task` | Reset a specific task's completion state (DB + markdown) |
| `/gsd reset-slice` | Reset a slice and all its tasks (DB + markdown) |
| `/gsd park` | Park a milestone — skip without deleting |
| `/gsd unpark` | Reactivate a parked milestone |
| Discard milestone | Available via `/gsd` wizard → "Milestone actions" → "Discard" |

## Parallel Orchestration

| Command | Description |
|---------|-------------|
| `/gsd parallel start` | Analyze eligibility, confirm, and start workers |
| `/gsd parallel status` | Show all workers with state, progress, and cost |
| `/gsd parallel stop [MID]` | Stop all workers or a specific milestone's worker |
| `/gsd parallel pause [MID]` | Pause all workers or a specific one |
| `/gsd parallel resume [MID]` | Resume paused workers |
| `/gsd parallel merge [MID]` | Merge completed milestones back to main |

See [Parallel Orchestration](./parallel-orchestration.md) for full documentation.

## Workflow Templates

| Command | Description |
|---------|-------------|
| `/gsd start` | Start a workflow template (bugfix, spike, feature, hotfix, refactor, security-audit, dep-upgrade, full-project) |
| `/gsd start resume` | Resume an in-progress workflow |
| `/gsd templates` | List available workflow templates |
| `/gsd templates info <name>` | Show detailed template info |

## Custom Workflows

| Command | Description |
|---------|-------------|
| `/gsd workflow new` | Create a new workflow definition (via skill) |
| `/gsd workflow run <name>` | Create a run and start auto-mode |
| `/gsd workflow list` | List workflow runs |
| `/gsd workflow validate <name>` | Validate a workflow definition YAML |
| `/gsd workflow pause` | Pause custom workflow auto-mode |
| `/gsd workflow resume` | Resume paused custom workflow auto-mode |

## Extensions

| Command | Description |
|---------|-------------|
| `/gsd extensions list` | List all extensions and their status |
| `/gsd extensions enable <id>` | Enable a disabled extension |
| `/gsd extensions disable <id>` | Disable an extension |
| `/gsd extensions info <id>` | Show extension details |

## Git & Worktrees

| Command | Description |
|---------|-------------|
| `/worktree` (`/wt`) | Git worktree lifecycle — create, switch, merge, remove |

```bash
lsd -w               # create/resume worktree session
lsd worktree list
lsd worktree merge NAME
lsd worktree clean
lsd worktree remove NAME
```

## Session Management

| Command | Description |
|---------|-------------|
| `/clear` | Start a new session (alias for `/new`) |
| `/exit` | Graceful shutdown — saves session state before exiting |
| `/kill` | Kill LSD process immediately |
| `/model` | Switch the active model |
| `/login` | Log in to an LLM provider |
| `/settings` | Open interactive settings, including theme selection, main accent presets, Codex rotate, cache timer, pin-last-prompt, and RTK toggles |
| `/hotkeys` | Show the full keyboard shortcut reference |
| `/cache-timer` | Toggle the footer cache elapsed-time indicator |
| `/thinking` | Toggle thinking level during sessions |
| `/voice` | Toggle real-time speech-to-text (macOS, Linux) |
| `/usage` | Show built-in token/cost usage reports from LSD session history |
| `/memories` | View persistent memory store for current project |
| `/remember <text>` | Save a fact to persistent memory |
| `/forget <topic>` | Remove a memory by topic |

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Ctrl+Alt+G` | Toggle dashboard overlay |
| `Ctrl+Alt+V` | Toggle voice transcription |
| `Ctrl+Alt+B` | Show background shell processes |
| `Ctrl+V` / `Alt+V` | Paste image from clipboard (screenshot → vision input) |
| `Escape` | Pause auto mode (preserves conversation) |

> **Note:** In terminals without Kitty keyboard protocol support (macOS Terminal.app, JetBrains IDEs), slash-command fallbacks are shown instead of `Ctrl+Alt` shortcuts.
>
> **Tip:** If `Ctrl+V` is intercepted by your terminal (e.g. Warp), use `Alt+V` instead for clipboard image paste.

## CLI Flags

| Flag | Description |
|------|-------------|
| `lsd` | Start a new interactive session |
| `lsd --continue` (`-c`) | Resume the most recent session for the current directory |
| `lsd --model <id>` | Override the default model for this session |
| `lsd --print "msg"` (`-p`) | Single-shot prompt mode (no TUI) |
| `lsd --mode <text\|json\|rpc\|mcp>` | Output mode for non-interactive use |
| `lsd --list-models [search]` | List available models and exit |
| `lsd --worktree` (`-w`) [name] | Start session in a git worktree (auto-generates name if omitted) |
| `lsd --no-session` | Disable session persistence |
| `lsd --extension <path>` | Load an additional extension (can be repeated) |
| `lsd --append-system-prompt <text>` | Append text to the system prompt |
| `lsd --tools <list>` | Comma-separated list of tools to enable |
| `lsd --version` (`-v`) | Print version and exit |
| `lsd --help` (`-h`) | Print help and exit |
| `lsd sessions` | Interactive session picker — list all saved sessions for the current directory and choose one to resume |
| `lsd --debug` | Enable structured JSONL diagnostic logging |
| `lsd config` | Set up global API keys (saved to `~/.lsd/agent/auth.json`, applies to all projects) |
| `lsd update` | Update LSD to the latest version |
| `lsd headless new-milestone` | Create a new milestone from a context file (headless — no TUI required) |

## Headless Mode

`lsd headless` runs commands without a TUI — designed for CI, cron jobs, and scripted automation. It spawns a child process in RPC mode, auto-responds to interactive prompts, detects completion, and exits with meaningful exit codes.

```bash
# Run auto mode (default)
lsd headless

# Run a single unit
lsd headless next

# With timeout for CI
lsd headless --timeout 600000 auto

# Force a specific phase
lsd headless dispatch plan

# Create a new milestone from a context file and start auto mode
lsd headless new-milestone --context brief.md --auto

# Create a milestone from inline text
lsd headless new-milestone --context-text "Build a REST API with auth"

# Pipe context from stdin
echo "Build a CLI tool" | lsd headless new-milestone --context -
```

| Flag | Description |
|------|-------------|
| `--timeout N` | Overall timeout in milliseconds (default: 300000 / 5 min) |
| `--max-restarts N` | Auto-restart on crash with exponential backoff (default: 3). Set 0 to disable |
| `--json` | Stream all events as JSONL to stdout |
| `--model ID` | Override the model for the headless session |
| `--context <file>` | Context file for `new-milestone` (use `-` for stdin) |
| `--context-text <text>` | Inline context text for `new-milestone` |
| `--auto` | Chain into auto-mode after milestone creation |

**Exit codes:** `0` = complete, `1` = error or timeout, `2` = blocked.

Any `/gsd` subcommand works as a positional argument — `lsd headless status`, `lsd headless doctor`, `lsd headless dispatch execute`, etc.

## MCP Server Mode

`lsd --mode mcp` runs LSD as a [Model Context Protocol](https://modelcontextprotocol.io) server over stdin/stdout. This exposes all LSD tools to external AI clients — Claude Desktop, VS Code Copilot, and any MCP-compatible host.

```bash
lsd --mode mcp
```

## Export

`/gsd export` generates reports of milestone work.

```bash
# Generate HTML report for the active milestone
/gsd export --html

# Generate retrospective reports for ALL milestones at once
/gsd export --html --all
```

Reports are saved to `.lsd/reports/` with a browseable `index.html`.
