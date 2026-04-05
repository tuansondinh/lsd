---
name: lsd-guide
description: Comprehensive guide to LSD — covers installation, CLI usage, configuration, auto-mode, permissions, remote questions, extensions, skills, subagents, worktrees, sessions, and internals. Bundled skill always available to all users. Use this skill whenever you ask about how LSD works, what features are available, or need guidance on using any part of the system.
---

# LSD Guide

Comprehensive reference to **LSD** (Looks Sort of Done) — a standalone coding-agent CLI built on the Pi SDK.

## What LSD Is

LSD is a general-purpose coding agent CLI that combines:
- **Interactive TUI** inspired by Gemini CLI
- **Memory system and permission modes** inspired by Claude Code
- **Sandbox isolation** inspired by Codex
- **Auto mode** — classifier-based autonomous execution with crash recovery
- **Remote questions** — relay agent prompts to Telegram, Discord, or Slack
- **Background subagents, skills, worktrees, sessions, usage tracking**

## Quick Navigation

<objective>Route user to the right documentation based on their question</objective>

**Installation & Setup:**
- Getting started, installation requirements, first launch → `references/getting-started.md`
- Re-running setup, configuring providers → `references/getting-started.md`

**CLI Usage:**
- What commands do I run? → `references/commands.md`
- Keyboard shortcuts, flags, options → `references/commands.md`

**Configuration:**
- API keys, LLM providers, web search → `references/configuration.md`
- Custom models, Ollama, proxies → `references/configuration.md`
- Preferences, git settings, token profiles → `references/configuration.md`

**Core Features:**
- How does auto-mode work? → `references/auto-mode.md`
- Permission modes (interactive, audited, auto) → `references/permissions.md`
- What are skills? How do I use them? → `references/skills.md`
- What are subagents? Background vs foreground → `references/subagents.md`
- Worktrees, git isolation, branches → `references/worktrees.md`
- Sessions, session management, persistence → `references/sessions.md`

**Advanced Topics:**
- Remote questions (Discord, Slack, Telegram) → `references/remote-questions.md`
- Token optimization, complexity routing → `references/token-optimization.md`
- Cost management, budget ceilings → `references/cost-management.md`
- Parallel orchestration, teams → `references/parallel-orchestration.md`

**Architecture & Internals:**
- How is LSD structured? → `references/architecture.md`
- What does the file system layout look like? → `references/file-system-map.md`
- Extending LSD with Pi SDK → `references/extending.md`
- Custom extensions, tools, commands → `references/extending.md`

**Troubleshooting:**
- Something isn't working → `references/troubleshooting.md`
- `/lsd doctor`, `/lsd forensics` → `references/troubleshooting.md`

## Core Concepts at a Glance

| Concept | What It Is | Example Use |
|---------|-----------|-------------|
| **Auto Mode** | Autonomous execution with state machine, crash recovery, manual steering | Run `lsd -a` to solve a problem without prompts |
| **Permission Mode** | Controls how aggressively the agent acts (interactive/audited/auto) | Set via `lsd config` or `LSD_PERMISSION_MODE` env var |
| **Skill** | Reusable capability packaged as prompts + workflows + references | Use `/skill react-best-practices` to review code |
| **Subagent** | Isolated agent process with separate context window, can run in background | Run `subagent(agent: "planner", task: "...")` to plan a feature |
| **Worktree** | Isolated git worktree with own branch, commits, no merge conflicts | Run `lsd -w` to work in isolation before pushing |
| **Session** | Chat history, execution context, persisted to disk, can be resumed | Run `lsd -c` to resume last session |
| **Extension** | TypeScript module that adds tools, commands, UI, or hooks to LSD | Use Pi SDK to build custom integrations |
| **Memory** | Persistent notes about projects, user preferences, context | Auto-saved; queried by agent to understand patterns |
| **Remote Questions** | Relay agent prompts to Telegram/Discord/Slack for mobile responses | Configure in setup, enable auto-mode headless workflows |

## User vs Developer Flows

**As a User (most common):**
```
lsd                      # Interactive chat
lsd --print "..."        # One-shot execution
lsd -a                   # Full auto mode
lsd -w                   # Isolated git worktree
lsd -c                   # Resume session
/skill <name>            # Load a skill
/subagents wait          # Wait for background work
```

**As a Developer:**
```
lsd config               # Setup wizard
~/.lsd/                  # User config directory
.lsd/                    # Project config directory
.lsd/skills/             # Custom skills
.lsd/agents/             # Custom agents
.lsd/extensions/         # Custom extensions
```

## Key Files & Directories

**User Config** (`~/.lsd/`):
- `settings.json` — LLM provider, permissions, preferences
- `models.json` — Custom model definitions (Ollama, proxies, etc.)
- `auth/` — OAuth tokens and API keys
- `sessions/` — Chat history and session state
- `skills/` — User-installed custom skills
- `agents/` — User-installed custom agents
- `memory/` — Persistent notes and project context

**Project Config** (`.lsd/`):
- `settings.json` — Project-specific LLM/permission overrides
- `models.json` — Project-specific model definitions
- `skills/` — Project-local skills
- `agents/` — Project-local agents
- `extensions/` — Project-local extensions
- `plan.md` — Active teams plan (if using `/teams plan`)

**Key Binaries:**
- `npm install -g lsd-pi` → installs as `lsd` command
- `lsd config` → re-run setup wizard
- `lsd -h` → show help
- `lsd doctor` → diagnose issues

## Common Tasks

**Start a new session:**
```bash
lsd
```

**Resume last session:**
```bash
lsd -c
```

**Auto-solve a problem:**
```bash
lsd -a "implement dark mode"
```

**Work in isolated worktree:**
```bash
lsd -w
```

**Run one-shot command:**
```bash
lsd --print "what does this code do?"
```

**Load a skill:**
```
/skill lint
/skill accessibility
/skill react-best-practices
```

**Use a subagent:**
```
subagent(agent: "planner", task: "plan the feature")
```

**Wait for background subagents:**
```
/subagents wait
await_subagent(jobs: ["sa_xxxxx"])
```

**List and manage sessions:**
```
/sessions list
/sessions resume 123
/sessions delete 456
```

**Run a command:**
```
/lsd doctor
/lsd forensics
```

## Success Criteria

You've learned LSD when you can:
- [ ] Run `lsd` and start an interactive session
- [ ] Use `/skill <name>` to load a bundled or custom skill
- [ ] Understand the difference between auto-mode, audited, and interactive
- [ ] Know where to find configuration (`.lsd/` and `~/.lsd/`)
- [ ] Explain what a worktree is and when to use `lsd -w`
- [ ] Understand subagents (background + foreground) and when they're useful
- [ ] Know how to set up remote questions for headless workflows
- [ ] Understand that LSD is built on Pi SDK and can be extended

---

## Documentation Index

All references are in `references/` subdirectory. Read as needed based on your current task or question. Start with `getting-started.md` if new to LSD.
