# Getting Started

## Install

```bash
npm install -g lsd-pi
```

Requires Node.js ≥ 22.0.0 (24 LTS recommended) and Git.

> **`command not found: lsd`?** Your shell may not have npm's global bin directory in `$PATH`. Run `npm prefix -g` to find it, then add `$(npm prefix -g)/bin` to your PATH. See [Troubleshooting](./troubleshooting.md#command-not-found-lsd-after-install) for details.

LSD checks for updates once every 24 hours. When a new version is available, you'll see an interactive prompt at startup with the option to update immediately or skip. You can also update from within a session with `/lsd update` or `lsd update`.

### Set up API keys

Run `lsd config` to set keys globally — they're saved to `~/.lsd/agent/auth.json` and apply to all projects:

```bash
lsd config
```

See [Global API Keys](./configuration.md#global-api-keys-lsd-config) for details on supported keys.

### Set up custom MCP servers

If you want LSD to call local or external MCP servers, add project-local config in `.mcp.json` or `.lsd/mcp.json`.

See [Configuration → MCP Servers](./configuration.md#mcp-servers) for examples and verification steps.

### VS Code Extension

LSD is also available as a VS Code extension. The extension provides:

- **Chat participant** — talk to the agent in VS Code Chat
- **Sidebar dashboard** — connection status, model info, token usage, quick actions
- **Full command palette** — start/stop agent, switch models, export sessions

The CLI (`lsd-pi`) must be installed first — the extension connects to it via RPC.

## First Launch

Run `lsd` in any directory:

```bash
lsd
```

LSD displays a welcome screen showing your version, active model, and available tool keys. On first launch, it runs a setup wizard:

1. **LLM Provider** — select from 20+ providers (Anthropic, OpenAI, Google, OpenRouter, GitHub Copilot, Amazon Bedrock, Azure, and more). OAuth flows handle Claude Max and Copilot subscriptions automatically; otherwise paste an API key.
2. **Tool API Keys** (optional) — Brave Search, Context7, Jina, Slack, Discord, Telegram. Press Enter to skip any.

Re-run the wizard anytime with:

```bash
lsd config
```

## Choose a Model

LSD auto-selects a default model after login. Switch at any time with:

```
/model
```

Or configure per-phase models in preferences — see [Configuration](./configuration.md).

## Ways to Work

### Interactive TUI (default)

The default `lsd` experience is an interactive terminal UI with message history, tool rendering, slash commands, model switching, sessions, background process management, and settings.

```bash
lsd
```

### One-Shot Mode

Run a single prompt and exit — no TUI:

```bash
lsd --print "summarize this repository"
```

### Worktree Mode

Start a session isolated in a git worktree for parallel streams of work:

```bash
lsd -w               # auto-generated name
lsd -w my-feature    # named worktree
```

### Headless Mode

Run without a TUI for CI, scripts, or automation:

```bash
lsd headless
lsd headless next
lsd headless status
```

### Auto Mode

Type `/gsd auto` inside a session and LSD works autonomously — researching, planning, executing, verifying, committing, and advancing through tasks until the milestone is complete.

Auto mode is a **permission mode**, not the center of the product. You can use LSD interactively, cautiously, or autonomously depending on the task.

See [Auto Mode](./auto-mode.md) for full details.

## Project Structure

When using LSD's workflow layer (auto mode), work is organized as:

```
Milestone  →  a shippable version (4-10 slices)
  Slice    →  one demoable vertical capability (1-7 tasks)
    Task   →  one context-window-sized unit of work
```

State lives on disk in `.lsd/`:

```
.lsd/
  PROJECT.md          — what the project is right now
  REQUIREMENTS.md     — requirement contract
  DECISIONS.md        — append-only architectural decisions
  KNOWLEDGE.md        — cross-session rules and lessons
  STATE.md            — quick-glance status
  milestones/
    M001/
      M001-ROADMAP.md
      M001-CONTEXT.md
      slices/
        S01/
          S01-PLAN.md
          S01-SUMMARY.md
          tasks/
            T01-PLAN.md
```

For interactive-only use, `.lsd/` is used only for session state and configuration — no milestone directories are created.

## Resume a Session

```bash
lsd --continue    # or lsd -c
```

Resumes the most recent session for the current directory.

To browse and pick from all saved sessions:

```bash
lsd sessions
```

## Next Steps

- [Auto Mode](./auto-mode.md) — deep dive into autonomous execution
- [Configuration](./configuration.md) — model selection, timeouts, budgets
- [Commands Reference](./commands.md) — all commands and shortcuts
- [Skills](./skills.md) — extend the agent with domain-specific knowledge

## Troubleshooting

### `lsd` command not found after install

**Cause:** npm's global bin directory isn't in your shell's `$PATH`.

**Fix:**

```bash
npm prefix -g
# Output: /opt/homebrew (Apple Silicon) or /usr/local (Intel Mac)

echo 'export PATH="$(npm prefix -g)/bin:$PATH"' >> ~/.zshrc
source ~/.zshrc
```

**Workaround:** Run `npx lsd-pi` or `$(npm prefix -g)/bin/lsd` directly.
