# LSD Guide Skill

Comprehensive reference to **LSD** (Looks Sort of Done) — covering everything from installation to advanced configuration and internal architecture.

## What's Inside

This skill provides complete documentation on:

- **Getting Started** — Installation, first launch, setup
- **Commands** — CLI commands, slash commands, keyboard shortcuts, flags
- **Auto Mode** — Autonomous execution, state machine, crash recovery
- **Skills** — What skills are, bundled skills, creating custom skills
- **Subagents** — Background/foreground agents, parallel orchestration
- **Configuration** — settings.json, models.json, environment variables
- **Troubleshooting** — Common issues and solutions

## How to Use This Skill

### Load the Skill

```
/skill lsd-guide
```

### Navigation

Ask a question and the skill routes you to the right reference:

```
How do I install LSD?
→ references/getting-started.md

What commands can I run?
→ references/commands.md

How does auto-mode work?
→ references/auto-mode.md

What are subagents?
→ references/subagents.md

How do I configure LSD?
→ references/configuration.md

Something isn't working
→ references/troubleshooting.md
```

### Reference Files

All documentation is organized in `references/`:

| File | Topic |
|------|-------|
| `getting-started.md` | Installation, first run, quick start |
| `commands.md` | All CLI commands, shortcuts, flags |
| `auto-mode.md` | Autonomous execution, state machine |
| `skills.md` | Using and creating skills |
| `subagents.md` | Background agents, orchestration |
| `configuration.md` | All config options explained |
| `troubleshooting.md` | Problems and solutions |

## Quick Reference

### Core Concepts

| Concept | What It Is |
|---------|-----------|
| **Skill** | Packaged capability with prompts + workflows |
| **Subagent** | Isolated agent process, runs background or foreground |
| **Worktree** | Isolated git worktree for safe experimentation |
| **Session** | Chat history and execution context, persisted |
| **Auto-Mode** | Autonomous execution without asking for approval |
| **Extension** | TypeScript module extending LSD with tools/commands |

### Common Commands

```bash
lsd                  # Interactive session
lsd -a "task"        # Auto-mode
lsd -w               # Isolated worktree
lsd -c               # Resume session
lsd config           # Setup wizard
lsd doctor           # Health check
```

### Common Slash Commands

```
/skill <name>        # Load a skill
/skills              # List available skills
/subagents list      # List background jobs
/subagents wait      # Wait for jobs to finish
/lsd doctor          # Health check
/help                # Show help
```

## Installation & Setup

See `references/getting-started.md` for:
- System requirements
- Installation instructions
- First launch walkthrough
- Permission modes
- Initial configuration

## Troubleshooting

Having issues? See `references/troubleshooting.md` for:
- "Command not found"
- "API key rejected"
- "Session won't resume"
- "Extension fails to load"
- And 10+ more common issues

Each includes step-by-step solutions.

## References

### User Guides
- **Getting Started** (`references/getting-started.md`) — Installation and first steps
- **Commands** (`references/commands.md`) — Everything you can run
- **Auto Mode** (`references/auto-mode.md`) — Autonomous execution
- **Skills** (`references/skills.md`) — Using bundled and custom skills
- **Subagents** (`references/subagents.md`) — Parallel agent workflows
- **Configuration** (`references/configuration.md`) — All settings explained
- **Troubleshooting** (`references/troubleshooting.md`) — Problem solving

### Topics Covered

**Core Usage:**
- Interactive CLI
- One-shot execution
- Auto-mode (autonomous)
- Permission modes (interactive/audited/auto)

**Features:**
- Skills (bundled + custom)
- Subagents (background + foreground)
- Worktrees (git isolation)
- Sessions (chat persistence)
- Remote questions (Discord, Slack, Telegram)

**Configuration:**
- API keys and providers
- Token profiles and cost management
- Custom models (Ollama, proxies)
- Preferences and git settings

**Advanced:**
- Parallel orchestration
- Extension development
- Token optimization
- Crash recovery in auto-mode

## Examples

### Basic Interactive Use

```bash
lsd
# Opens interactive TUI
# Type your question
# Use /skill to load specialized guidance
# Use /subagents to check background work
```

### Auto-Mode Feature Development

```bash
lsd -a "implement user authentication
- Create database schema
- Write API endpoints
- Build login/signup UI
- Write tests
- Set up middleware
"
```

### Parallel Feature Work

```
/skill lsd-guide

Tell me how to run subagents in parallel to work on:
- Frontend components
- Backend API
- Test suite
```

### Safe Experimentation

```bash
lsd -w
# Opens in isolated git worktree
# Make changes safely
# Switch back anytime
```

## Learning Path

1. **Start here:** `references/getting-started.md`
2. **Learn commands:** `references/commands.md`
3. **Explore features:** Load skills and read about them
4. **Understand auto-mode:** `references/auto-mode.md`
5. **Configure for your workflow:** `references/configuration.md`
6. **When stuck:** `references/troubleshooting.md`

## Key Files & Directories

**User config** (`~/.lsd/`):
```
~/.lsd/settings.json    # Your preferences
~/.lsd/models.json      # Custom models
~/.lsd/auth/            # API keys
~/.lsd/sessions/        # Chat history
~/.lsd/skills/          # Custom skills
~/.lsd/agents/          # Custom agents
```

**Project config** (`.lsd/`):
```
.lsd/settings.json      # Project overrides
.lsd/skills/            # Project skills
.lsd/agents/            # Project agents
.lsd/extensions/        # Project extensions
```

## Getting Help

Inside LSD:
```
/help
/help <command>
/lsd doctor          # Health check
/lsd forensics       # Detailed diagnostics
```

In this skill:
```
/skill lsd-guide
# Ask any question about LSD
# Skill routes to correct reference
```

## Development

LSD is built on the **Pi SDK**. To extend LSD:

- Create custom skills in `.lsd/skills/`
- Create custom agents in `.lsd/agents/`
- Create extensions in `.lsd/extensions/`

See Pi SDK docs for detailed extension guide.

## License

This skill is part of LSD and covered under the same license as LSD.

## See Also

- **LSD Repository** — https://github.com/vercel/lsd
- **Pi SDK** — The framework LSD is built on
- **Bundled Skills** — Try `/skills` to see what's available
