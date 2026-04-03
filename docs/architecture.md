# Architecture Overview

LSD is a TypeScript application built on the [Pi SDK](https://github.com/badlogic/pi-mono). It embeds the Pi coding agent and extends it with an optional workflow engine, auto mode state machine, and project management primitives. LSD is a fork of GSD 2, repositioned as a general-purpose coding agent CLI rather than a workflow-centric tool.

## System Structure

```
lsd (CLI binary, package: lsd-pi)
  └─ loader.ts          Sets PI_PACKAGE_DIR, env vars, dynamic-imports cli.ts
      └─ cli.ts         Wires SDK managers, loads extensions, starts InteractiveMode
          ├─ onboarding.ts   First-run setup wizard (LLM provider + tool keys)
          ├─ wizard.ts       Env hydration from stored auth.json credentials
          ├─ app-paths.ts    ~/.lsd/agent/, ~/.lsd/sessions/, auth.json
          ├─ resource-loader.ts  Syncs bundled extensions + agents to ~/.lsd/agent/
          └─ src/resources/
              ├─ extensions/       Bundled tool and command extensions
              ├─ agents/           scout, researcher, worker
              ├─ AGENTS.md         Agent routing instructions
              └─ skills/           bundled skill content

lsd headless              Headless mode — CI/cron orchestration via RPC child process
lsd --mode mcp            MCP server mode — exposes tools over stdin/stdout

vscode-extension/         VS Code extension — chat participant, sidebar dashboard, RPC integration
```

## Key Design Decisions

### State Lives on Disk

`.lsd/` is the sole source of truth for project state. Auto mode reads it, writes it, and advances based on what it finds. No in-memory state survives across sessions. This enables crash recovery, multi-terminal steering, and session resumption.

### Two-File Loader Pattern

`loader.ts` sets all environment variables with zero SDK imports, then dynamically imports `cli.ts` which does static SDK imports. This ensures `PI_PACKAGE_DIR` is set before any SDK code evaluates.

### `pkg/` Shim Directory

`PI_PACKAGE_DIR` points to `pkg/` (not project root) to avoid Pi's theme resolution colliding with LSD's `src/` directory. Contains only `piConfig` and theme assets.

### Always-Overwrite Sync

Bundled extensions and agents are synced to `~/.lsd/agent/` on every launch, not just first run. This means `npm update -g` takes effect immediately.

### Lazy Provider Loading

LLM provider SDKs (Anthropic, OpenAI, Google, etc.) are lazy-loaded on first use rather than imported at startup. This significantly reduces cold-start time — only the provider you actually connect to gets loaded.

### Fresh Session Per Unit

Every dispatch creates a new agent session. The LLM starts with a clean context window containing only the pre-inlined artifacts it needs. This prevents quality degradation from context accumulation.

## Bundled Extensions

LSD ships focused bundled extensions:

| Extension | What It Provides |
|-----------|-----------------|
| **Browser Tools** | Playwright-based browser automation — navigation, forms, screenshots, PDF export, device emulation, visual regression, structured data extraction, route mocking, accessibility tree inspection, and semantic actions |
| **Search the Web** | Brave Search, Tavily, or Jina page extraction |
| **Google Search** | Gemini-powered web search with AI-synthesized answers |
| **Context7** | Up-to-date library/framework documentation |
| **Background Shell** | Long-running process management with readiness detection |
| **Subagent** | Delegated tasks with isolated context windows |
| **Mac Tools** | macOS native app automation via Accessibility APIs |
| **MCP Client** | Native MCP server integration via @modelcontextprotocol/sdk |
| **Voice** | Real-time speech-to-text (macOS, Linux) |
| **Slash Commands** | Custom command creation |
| **LSP** | Language Server Protocol — diagnostics, definitions, references, hover, rename |
| **Ask User Questions** | Structured user input with single/multi-select |
| **Secure Env Collect** | Masked secret collection |
| **Async Jobs** | Background command execution with `async_bash`, `await_job`, `cancel_job` |
| **Remote Questions** | Discord, Slack, and Telegram integration for headless question routing |
| **TTSR** | Tool-triggered system rules — conditional context injection based on tool usage |
| **Universal Config** | Discovery of existing AI tool configurations (Claude Code, Cursor, Windsurf, etc.) |
| **Memory** | Persistent per-project memory — auto-extract, recall, and explicit save/forget |
| **Usage** | Session-based token and cost reporting via `/usage` |
| **GSD Workflow** | Auto mode state machine, milestone orchestration, and workflow commands |

## Bundled Agents

| Agent | Role |
|-------|------|
| **Scout** | Fast codebase recon — compressed context for handoff |
| **Researcher** | Web research — finds and synthesizes current information |
| **Worker** | General-purpose execution in an isolated context window |

## Native Engine

Performance-critical operations use a Rust N-API engine:

- **grep** — ripgrep-backed content search
- **glob** — gitignore-aware file discovery
- **ps** — cross-platform process tree management
- **highlight** — syntect-based syntax highlighting
- **ast** — structural code search via ast-grep
- **diff** — fuzzy text matching and unified diff generation
- **text** — ANSI-aware text measurement and wrapping
- **html** — HTML-to-Markdown conversion
- **image** — decode, encode, resize images
- **fd** — fuzzy file path discovery
- **clipboard** — native clipboard access
- **git** — libgit2-backed git read operations
- **parser** — LSD file parsing and frontmatter extraction

## Dispatch Pipeline

The auto mode dispatch pipeline:

```
1.  Read disk state (STATE.md, roadmap, plans)
2.  Determine next unit type and ID
3.  Classify complexity → select model tier
4.  Apply budget pressure adjustments
5.  Check routing history for adaptive adjustments
6.  Dynamic model routing (if enabled) → select cheapest model for tier
7.  Resolve effective model (with fallbacks)
8.  Check pending captures → triage if needed
9.  Build dispatch prompt (applying inline level compression)
10. Create fresh agent session
11. Inject prompt and let LLM execute
12. On completion: snapshot metrics, verify artifacts, persist state
13. Loop to step 1
```

## Configuration Paths

### User-level

LSD stores global state under:

```
~/.lsd/
  agent/
    auth.json         — API keys and OAuth tokens
    settings.json
    extensions/       — installed extensions
    agents/           — bundled and user agents
  sessions/           — saved session history
  projects/
    <project-hash>/
      memory/         — persistent project memories
```

### Project-level

Per-project state lives in:

```
.lsd/
  PREFERENCES.md      — project preferences
  PROJECT.md          — living project description (workflow mode)
  DECISIONS.md        — architectural decisions
  KNOWLEDGE.md        — cross-session lessons
  STATE.md            — quick-glance status
  milestones/         — milestone/slice/task hierarchy
  reports/            — HTML milestone reports
  activity/           — JSONL session logs
```

Legacy `.gsd/` directories from GSD 2 are also supported.

## Key Modules

| Module | Purpose |
|--------|---------|
| `auto.ts` | Auto-mode state machine and orchestration |
| `auto/session.ts` | `AutoSession` class — all mutable auto-mode state |
| `auto-dispatch.ts` | Declarative dispatch table (phase → unit mapping) |
| `auto-idempotency.ts` | Completed-key checks, skip loop detection |
| `auto-stuck-detection.ts` | Stuck loop recovery and unit retry escalation |
| `auto-start.ts` | Fresh-start bootstrap — git/state init, crash lock detection |
| `auto-post-unit.ts` | Post-unit processing — commit, doctor, state rebuild, hooks |
| `auto-verification.ts` | Post-unit verification gate (lint/test/typecheck with auto-fix retries) |
| `complexity-classifier.ts` | Unit complexity classification (light/standard/heavy) |
| `model-router.ts` | Dynamic model routing with cost-aware selection |
| `routing-history.ts` | Adaptive learning from routing outcomes |
| `captures.ts` | Fire-and-forget thought capture and triage classification |
| `visualizer-overlay.ts` | Workflow visualizer TUI overlay |
| `metrics.ts` | Token and cost tracking ledger |
| `state.ts` | State derivation from disk |
| `session-lock.ts` | OS-level exclusive session locking |
| `preferences.ts` | Preference loading, merging, validation |
| `git-service.ts` | Git operations — commit, merge, worktree sync |
| `memory-extractor.ts` | Extract reusable knowledge from session transcripts |
| `memory-store.ts` | Persistent memory store for cross-session knowledge |
