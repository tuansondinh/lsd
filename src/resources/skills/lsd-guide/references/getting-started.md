# Getting Started with LSD

## Installation

### Requirements
- **Node.js >= 22** (Node 24 LTS recommended)
- **Git** (for worktrees and version control)
- **macOS, Linux, or Windows**

### Global Install

```bash
npm install -g lsd-pi@latest
```

Verify the installation:
```bash
lsd --version
lsd -h
```

If `lsd` command not found, check npm global bin path:
```bash
npm prefix -g
```

Ensure `$(npm prefix -g)/bin` is on your `$PATH`.

### Local Development Build

For hacking on LSD itself:
```bash
git clone <lsd-repo>
cd lsd
npm install
npm run build
npm link
```

## First Launch

When you run `lsd` for the first time, an interactive setup wizard appears:

1. **LLM Provider** — Choose and authenticate:
   - Anthropic (Claude)
   - OpenAI (GPT-4)
   - Google (Gemini)
   - GitHub Copilot
   - Ollama (local)
   - Custom provider

2. **Web Search** (optional) — Select provider:
   - Brave Search (recommended)
   - Tavily
   - Built-in web search
   - Skip

3. **Remote Questions** (optional) — Configure mobile access:
   - Telegram
   - Discord
   - Slack
   - Skip

4. **Tool API Keys** (optional) — Configure integrations:
   - Context7 (for library docs)
   - Jina Reader (for web content extraction)
   - Groq (for voice transcription)
   - Skip

After setup, you're ready to use LSD!

## Quick Start

### Interactive Session
```bash
lsd
```

Opens the interactive TUI. Type your question or use slash commands.

### One-Shot Execution
```bash
lsd --print "what does this code do?"
lsd --print "fix the bug in auth.ts"
```

Returns answer and exits (no session saved).

### Auto Mode
```bash
lsd -a "implement user authentication"
```

Runs full autonomous execution with crash recovery and manual steering. See `references/auto-mode.md` for details.

### Isolated Worktree
```bash
lsd -w
```

Creates isolated git worktree with own branch. Safer for experiments. See `references/worktrees.md` for details.

### Resume Last Session
```bash
lsd -c
```

Resumes previous chat history and execution context.

## Setup Wizard

To re-run setup or change configuration:
```bash
lsd config
```

This opens the setup wizard again. You can:
- Change LLM provider
- Update API keys
- Configure web search
- Set up remote questions
- Change permission mode
- Enable/disable features

## Permission Modes

LSD has three permission modes controlling how aggressively it acts:

| Mode | Behavior | Use Case |
|------|----------|----------|
| **interactive** | Ask before every file change | Default, safe |
| **audited** | Execute changes, show diffs afterward | Productive, verifiable |
| **auto** | Execute without asking (in auto-mode) | Autonomous workflows |

Set at setup or change anytime:
```bash
lsd config
```

Or set via environment:
```bash
LSD_PERMISSION_MODE=auto lsd -a
```

## First Session Tips

1. **Start simple** — Ask one thing at a time
2. **Use keyboard shortcuts** — See `/help` for list
3. **Load a skill** — `/skill lint` to lint code
4. **Check what's running** — `/subagents list` for background work
5. **Save your work** — Use `git add` and `git commit` within LSD
6. **Resume later** — Run `lsd -c` next time

## Configuration Files

After first run, two config directories exist:

**User config** (`~/.lsd/`):
```
~/.lsd/
├── settings.json         # LLM, permissions, preferences
├── models.json          # Custom model definitions
├── auth/                # OAuth tokens
├── sessions/            # Chat history (persisted)
├── skills/              # User-installed skills
├── agents/              # User-installed agents
└── memory/              # Persistent notes
```

**Project config** (`.lsd/`):
```
.lsd/
├── settings.json        # Project overrides
├── models.json
├── skills/              # Project-local skills
├── agents/              # Project-local agents
├── extensions/          # Project-local extensions
└── plan.md              # Active teams plan
```

## What's Next?

- **Learn the CLI** — See `references/commands.md`
- **Understand auto-mode** — See `references/auto-mode.md`
- **Use skills** — See `references/skills.md`
- **Configure models** — See `references/configuration.md`
- **Explore features** → Quick Navigation in main SKILL.md

## Troubleshooting

**Command not found:**
```bash
npm install -g lsd-pi@latest
npm prefix -g  # Check bin path
```

**API key rejected:**
- Re-run `lsd config`
- Check key has correct permissions on provider dashboard
- Verify no extra whitespace in key

**Session won't resume:**
```bash
lsd -c --clear-history
```

**More help:**
```bash
lsd -h
lsd doctor
lsd forensics
```

See `references/troubleshooting.md` for more solutions.
