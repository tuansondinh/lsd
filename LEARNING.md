# LSD — Developer Onboarding Guide

Welcome to LSD. This guide will take you from zero to productive contributor.

---

## What is LSD?

**LSD** (Looks Sort of Done) is a standalone AI coding-agent CLI. Think of it as your personal AI pair programmer that lives in the terminal. It talks to LLMs (Claude, GPT, Gemini, etc.), reads and writes code, runs shell commands, automates browsers, and manages persistent memory across sessions.

It's built on top of the **Pi SDK** — an open-source agent framework. LSD adds branding, extensions, a memory system, worktree support, and a rich interactive TUI on top of Pi's core agent loop.

**Key facts:**
- npm package: `lsd-pi`, binary: `lsd`
- Written in TypeScript (ES2022, strict mode, ESM)
- Monorepo: `packages/` holds the core engine, `src/` holds the LSD layer
- Node.js >= 22 required
- ~20 bundled extensions, ~15 bundled skills

---

## Architecture in 60 Seconds

```
User types: lsd
     ↓
dist/loader.js     ← Fast-path checks (version, help), sets env vars
     ↓
src/cli.ts         ← Parses args, routes to mode (TUI, headless, print, etc.)
     ↓
src/resource-loader.ts  ← Syncs extensions/skills to ~/.lsd/agent/
     ↓
pi-coding-agent    ← Core agent session (from packages/)
     ↓
pi-ai              ← LLM provider abstraction (Anthropic, OpenAI, Gemini...)
     ↓
pi-tui             ← Terminal UI renderer
```

There are two layers you need to understand:

| Layer | Where | What it does |
|-------|-------|-------------|
| **LSD layer** | `src/` | CLI entry, extensions, memory, onboarding, branding, worktrees |
| **Core engine** | `packages/` | Agent loop, LLM providers, TUI renderer, tool execution |

**Rule of thumb:** If you're adding a user-facing feature, it goes in `src/`. If you're fixing the agent loop or a provider, it's in `packages/`.

---

## Repository Map

```
lsd/
├── src/                          # ← YOU'LL SPEND MOST TIME HERE
│   ├── loader.ts                 # Entry point (env setup, fast-path --version/--help)
│   ├── cli.ts                    # Main CLI router (subcommands, mode dispatch)
│   ├── headless.ts               # Headless orchestrator (CI/automation mode)
│   ├── onboarding.ts             # First-run setup wizard
│   ├── resource-loader.ts        # Syncs bundled resources to ~/.lsd/agent/
│   ├── extension-discovery.ts    # Finds extension entry points
│   ├── extension-registry.ts     # Extension enable/disable state
│   ├── worktree-cli.ts           # Git worktree management
│   ├── app-paths.ts              # Path constants (~/.lsd, agent dir, etc.)
│   ├── shared-paths.ts           # Walks up to find .lsd/ project root
│   ├── shared-preferences.ts     # PREFERENCES.md YAML parser
│   └── resources/
│       ├── extensions/           # ~20 bundled extensions
│       │   ├── memory/           # Persistent memory across sessions
│       │   ├── browser-tools/    # Playwright automation
│       │   ├── subagent/         # Background subagent system
│       │   ├── claude-code-cli/  # Claude provider via SDK
│       │   ├── codex-rotate/     # Multi-account OAuth rotation
│       │   ├── remote-questions/ # Telegram/Discord/Slack relay
│       │   ├── bg-shell/         # Background shell processes
│       │   ├── search-the-web/   # Brave/Tavily/Google web search
│       │   └── ...
│       └── skills/               # Bundled skills (review, test, lint, etc.)
│
├── packages/                     # ← CORE ENGINE (vendored, rarely touch)
│   ├── pi-coding-agent/          # Agent session, built-in tools, RPC, TUI
│   ├── pi-ai/                    # LLM provider abstraction layer
│   ├── pi-tui/                   # Terminal UI renderer
│   ├── pi-agent-core/            # Base agent primitives
│   ├── native/                   # Rust binaries (fd, rg wrappers)
│   ├── rpc-client/               # JSON-RPC client for headless mode
│   ├── mcp-server/               # MCP server implementation
│   └── daemon/                   # Background daemon process
│
├── dist/                         # Compiled output (npm run build)
├── docs/                         # User-facing documentation
├── pkg/                          # Shim: piConfig + theme assets
└── scripts/                      # Build, release, postinstall helpers
```

---

## The Startup Flow

Every `lsd` invocation follows this path:

### 1. `loader.ts` — Bootstrap (runs before anything else)

```
Check --version/--help → fast exit
Check Node >= 22 and git → fail fast with clear error
Set env vars (PI_PACKAGE_DIR, LSD_VERSION, etc.)
Discover bundled extensions → set LSD_BUNDLED_EXTENSION_PATHS
Link workspace packages (@gsd/* symlinks)
Dynamic import → cli.ts
```

**Key insight:** loader.ts runs synchronously before any heavy imports. It's the gatekeeper.

### 2. `cli.ts` — Mode Router

```
Parse CLI args → route to the right mode:
  lsd                    → Interactive TUI (default)
  lsd --print "..."      → Single-shot print mode
  lsd --mode rpc         → JSON-RPC server
  lsd --mode mcp         → MCP server
  lsd headless auto      → Headless orchestrator
  lsd config             → Setup wizard
  lsd sessions           → Session picker
  lsd worktree list      → Worktree management
  lsd update             → Self-update
```

For interactive mode, cli.ts:
1. Runs onboarding if first launch
2. Syncs resources (`initResources`)
3. Creates the agent session (`createAgentSession`)
4. Starts the TUI (`InteractiveMode.run()`)

### 3. Headless Mode (two-process architecture)

```
Parent (headless.ts)          Child (lsd --mode rpc)
  ├─ Spawns RPC child          ├─ Agent session + extensions
  ├─ Sends prompt              ├─ Runs agent loop
  ├─ Auto-responds to UI       ├─ Emits events (tool calls, text, etc.)
  ├─ Streams progress          └─ Handles tool execution
  └─ Exits with status code
```

---

## The Extension System

Extensions are the primary way LSD adds features. Every extension is a TypeScript file that exports a default function receiving an `ExtensionAPI`:

```typescript
// src/resources/extensions/my-extension/index.ts
import type { ExtensionAPI } from '@gsd/pi-coding-agent'

export default function(pi: ExtensionAPI) {
  // Hook into lifecycle events
  pi.on('session_start', async (event, ctx) => { /* ... */ })
  pi.on('before_agent_start', async (event) => {
    return { systemPrompt: event.systemPrompt + '\nExtra instructions' }
  })

  // Register slash commands
  pi.registerCommand('my-cmd', {
    description: 'Does something',
    handler: async (args, ctx) => { /* ... */ }
  })

  // Register LLM-callable tools
  pi.registerTool({
    name: 'my_tool',
    description: '...',
    schema: { /* JSON schema */ },
    handler: async (input) => { return { content: [{ type: 'text', text: 'done' }] } }
  })
}
```

### Extension Loading Pipeline

```
src/resources/extensions/     (bundled in the repo)
         ↓ initResources()
~/.lsd/agent/extensions/      (synced on every launch if version changed)
         ↓ discoverExtensionEntryPaths()
         ↓ filter via registry.json (enabled/disabled)
         ↓ sortExtensionPaths() (topological order)
         ↓ DefaultResourceLoader.reload()
         ↓ jiti compiles .ts → runtime JS (no build step!)
         ↓ export default(pi: ExtensionAPI) called
Agent session ready
```

### Key extension lifecycle events (in order):

1. `session_start` — session initialized
2. `before_agent_start` — can modify system prompt
3. `tool_call` — can block tool execution
4. `turn_end` — agent finished one turn
5. `session_shutdown` — session ending

---

## The Memory System

The memory extension (`src/resources/extensions/memory/`) gives the agent persistent knowledge across sessions:

```
~/.lsd/projects/<project>/memory/
  ├── MEMORY.md              ← Index file (always loaded, max 200 lines)
  ├── user_prefs.md          ← Individual memory files
  ├── feedback_testing.md    ← User corrections
  └── project_architecture.md ← Architecture decisions
```

**Memory types:** `user`, `feedback`, `project`, `reference`

**Auto-extract:** On session shutdown, a background worker scans the conversation and saves new memories. Controlled by `budgetSubagentModel` in settings.

---

## Key Concepts

### Configuration Hierarchy

```
~/.lsd/agent/auth.json        ← API keys (modified by /login)
~/.lsd/agent/settings.json    ← UI/model preferences (modified by /settings)
~/.lsd/agent/models.json      ← Custom model definitions
~/.lsd/PREFERENCES.md         ← Global preferences (YAML frontmatter)
.lsd/PREFERENCES.md           ← Project-level preference overrides
.lsd/LSD.md or lsd.md         ← Project instructions (injected into system prompt)
CLAUDE.md                      ← Claude Code compatible instructions
~/.lsd/extensions/registry.json ← Extension enable/disable state
```

### Sessions

Sessions persist the full conversation history. Stored in `~/.lsd/sessions/<encoded-cwd>/` where the directory name is the CWD with slashes replaced by dashes (e.g. `--Users-you-myproject--`).

### Worktrees

Git worktrees for isolated parallel work. `lsd -w` creates a worktree, `lsd worktree merge` squash-merges it back. State lives in `.lsd/worktrees/`.

### Operating Modes

| Mode | TTY Required | Use Case |
|------|-------------|----------|
| Interactive | Yes | Daily coding |
| Print (`--print`) | No | One-shot queries |
| RPC (`--mode rpc`) | No | Subagent communication |
| MCP (`--mode mcp`) | No | External AI clients |
| Headless | No | CI/CD, automation |

---

## Development Workflow

### Build & Run

```bash
npm install              # Install dependencies
npm run build            # Build everything (TypeScript + native + workspace packages)
npm link                 # Make `lsd` available globally (points to your dev build)
lsd                      # Run your dev build
```

### After Editing Source

```bash
npm run build            # Rebuild (TypeScript → dist/)
lsd                      # The global binary runs from dist/, not src/
```

**Important:** `lsd` runs the compiled `dist/` output, not the TypeScript source. You MUST rebuild after changes.

### Run Tests

```bash
npm test                 # All tests
npm run test:smoke       # Quick validation
```

### Useful Debug Flags

```bash
GSD_STARTUP_TIMING=1 lsd       # Print startup timing breakdown
LSD_HOME=/tmp/test-lsd lsd     # Use a different home directory
lsd --list-models               # Show available models
lsd --model <id>                # Override model
```

---

## Codebase Navigation Cheatsheet

| "I want to..." | Look at... |
|---|---|
| Add a new CLI subcommand | `src/cli.ts` (add a new `if (cliFlags.messages[0] === 'xyz')` block) |
| Add a new extension | `src/resources/extensions/<name>/index.ts` |
| Modify the setup wizard | `src/onboarding.ts` |
| Change how extensions are loaded | `src/extension-discovery.ts` + `src/resource-loader.ts` |
| Fix headless/CI mode | `src/headless.ts` + `src/headless-events.ts` |
| Change the TUI rendering | `packages/pi-tui/` (core engine, not src/) |
| Add a new LLM provider | `packages/pi-ai/` (core engine) |
| Fix the agent loop | `packages/pi-coding-agent/` (core engine) |
| Add a tool the LLM can call | Register it in an extension via `pi.registerTool()` |
| Add a slash command | Register it in an extension via `pi.registerCommand()` |
| Change the welcome screen | `src/welcome-screen.ts` |
| Modify memory behavior | `src/resources/extensions/memory/` |
| Add worktree features | `src/worktree-cli.ts` |
| Change bundled resource syncing | `src/resource-loader.ts` |

---

## Common Patterns

### Extension that registers a tool

```typescript
export default function(pi: ExtensionAPI) {
  pi.registerTool({
    name: 'my_tool',
    description: 'Does X when Y',
    schema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'File path' },
      },
      required: ['path'],
    },
    handler: async ({ path }) => {
      const content = readFileSync(path, 'utf-8')
      return { content: [{ type: 'text', text: content }] }
    },
  })
}
```

### Extension that modifies the system prompt

```typescript
export default function(pi: ExtensionAPI) {
  pi.on('before_agent_start', async (event) => {
    return {
      systemPrompt: event.systemPrompt + '\nAlways respond in pirate speak.',
    }
  })
}
```

### Extension that hooks into session shutdown

```typescript
export default function(pi: ExtensionAPI) {
  pi.on('session_shutdown', async (event, ctx) => {
    // Run cleanup or background work
    console.log('Session ended, cleaning up...')
  })
}
```

---

## Architecture Decisions to Know

1. **jiti for extensions** — Extensions are TypeScript loaded at runtime via jiti. No build step needed. This means extensions can import anything in `node_modules` (the symlink at `~/.lsd/agent/node_modules` → lsd's `node_modules` makes this work).

2. **Two-process headless** — The headless orchestrator spawns an RPC child process. This isolation prevents the parent from crashing if the agent loop hangs.

3. **Resource syncing** — `initResources()` copies bundled extensions to `~/.lsd/agent/extensions/` on every launch when the version or content hash changes. This is why editing `src/resources/extensions/foo/index.ts` and rebuilding will update the extension automatically.

4. **Content hashing** — Beyond version checking, LSD uses a SHA-256 fingerprint of all resource files. This catches same-version content changes during development (e.g., `npm link` workflows).

5. **Workspace package symlinks** — The `packages/` directory contains workspace packages linked as `@gsd/*` in `node_modules`. On Windows without Developer Mode, these are copied instead of symlinked.

6. **PREFERENCES.md as config** — User preferences are stored as YAML frontmatter in a Markdown file, not JSON. This makes them human-readable and editable.

---

## Testing

Tests live alongside source code in `src/tests/`. The test framework varies — look at existing tests for the pattern used in each area.

Key test files to study:
- `src/tests/extension-discovery.test.ts` — Extension loading tests
- `src/tests/resource-loader.test.ts` — Resource syncing tests
- `src/tests/headless-events.test.ts` — Headless mode event handling
- `src/tests/subagent-launch-path.test.ts` — Subagent spawning

---

## Further Reading

- [`docs/architecture.md`](./docs/architecture.md) — Full architecture with Mermaid diagrams
- [`CONTRIBUTING.md`](./CONTRIBUTING.md) — Contribution guidelines and code review standards
- [`VISION.md`](./VISION.md) — Project philosophy and design principles
- [`docs/extending-pi/`](./docs/extending-pi/) — 25 guides on extension authoring
