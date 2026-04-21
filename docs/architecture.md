# LSD Architecture Documentation

> **For new contributors** — LSD is a branded, extended fork of the `pi` coding agent. The core agent engine lives in the `packages/` workspace. Everything in `src/` is the LSD layer that wraps, brands, and extends that core.
>
> **Quick start?** Read [LEARNING.md](../LEARNING.md) for a developer onboarding guide.

---

## Table of Contents

1. [Big Picture](#big-picture)
2. [Repository Layout](#repository-layout)
3. [Source File Reference](#source-file-reference)
4. [Startup Flow](#startup-flow)
5. [Package Architecture (Core Engine)](#package-architecture-core-engine)
6. [Extension System](#extension-system)
7. [Session & Memory System](#session--memory-system)
8. [Operating Modes](#operating-modes)
9. [Configuration & Preferences](#configuration--preferences)
10. [Worktrees (Isolated Workspaces)](#worktrees-isolated-workspaces)
11. [Key Data Flows](#key-data-flows)

---

## Big Picture

```mermaid
graph TB
    subgraph "What You Installed (lsd-pi npm package)"
        LOADER["dist/loader.js<br/>(entry point)"]
        CLI["src/cli.ts<br/>(arg parsing + mode routing)"]
        SRC["src/<br/>(LSD layer: branding, modes,<br/>extensions, memory, worktrees)"]
    end

    subgraph "Core Engine (packages/ — vendored from pi-mono)"
        PIAGENT["@gsd/pi-coding-agent<br/>(agent session, tools, RPC, TUI)"]
        PIAI["@gsd/pi-ai<br/>(LLM provider abstraction)"]
        PITUI["@gsd/pi-tui<br/>(terminal UI renderer)"]
        PICORE["@gsd/pi-agent-core<br/>(base agent primitives)"]
        NATIVE["@gsd/native<br/>(native binaries: fd, rg)"]
    end

    subgraph "LLM Providers"
        ANTHROPIC["Anthropic (Claude)"]
        OPENAI["OpenAI / OpenAI-compat"]
        GEMINI["Google Gemini"]
        BEDROCK["AWS Bedrock"]
        MISTRAL["Mistral"]
        VERTEX["Vertex AI"]
    end

    subgraph "Filesystem (~/.lsd/)"
        AGENT_DIR["agent/<br/>(extensions, agents, auth.json, models.json)"]
        SESSIONS["sessions/<br/>(per-project session history)"]
        MEMORY["projects/<project>/memory/<br/>(persistent agent memory)"]
        PREFS["PREFERENCES.md<br/>(user config)"]
    end

    USER["User (terminal)"] --> LOADER
    LOADER --> CLI
    CLI --> PIAGENT
    SRC --> PIAGENT
    PIAGENT --> PIAI
    PIAI --> ANTHROPIC & OPENAI & GEMINI & BEDROCK & MISTRAL & VERTEX
    PIAGENT --> PITUI
    PIAGENT --> PICORE
    PIAGENT <--> AGENT_DIR
    CLI <--> SESSIONS
    SRC <--> MEMORY
    SRC <--> PREFS
```

---

## Repository Layout

```
lsd/
├── src/                        # LSD layer (TypeScript source)
│   ├── loader.ts               # Entry point: env setup, workspace linking, boots cli.ts
│   ├── cli.ts                  # Main CLI: arg parsing, mode routing, session init
│   ├── headless.ts             # Headless/auto mode orchestrator (spawns RPC child)
│   ├── onboarding.ts           # First-run setup wizard
│   ├── resource-loader.ts      # Syncs bundled resources to ~/.lsd/agent/
│   ├── extension-discovery.ts  # Scans directories for extension entry points
│   ├── extension-registry.ts   # Extension manifest types, enable/disable state
│   ├── app-paths.ts            # ~/.lsd path constants (appRoot, agentDir, sessionsDir)
│   ├── shared-paths.ts         # Walks up to find .lsd/ project root
│   ├── shared-preferences.ts   # PREFERENCES.md YAML parser + merge logic
│   ├── worktree-cli.ts         # Git worktree subcommand + -w flag
│   ├── welcome-screen.ts       # Branded welcome banner
│   ├── mcp-server.ts           # --mode mcp MCP server entry
│   ├── cli-theme.ts            # Accent color helpers
│   ├── lsd-brand.ts            # Brand color constants
│   ├── rtk.ts                  # RTK shell command compression bootstrap
│   ├── tool-bootstrap.ts       # fd/rg managed binary setup
│   ├── models-resolver.ts      # models.json path (LSD → pi fallback)
│   ├── tests/                  # Unit and integration tests
│   └── resources/
│       ├── extensions/         # ~25 bundled extensions (synced to ~/.lsd/agent/extensions/)
│       │   ├── memory/         # Persistent memory system
│       │   ├── browser-tools/  # Playwright browser automation
│       │   ├── subagent/       # Background subagent system
│       │   ├── claude-code-cli/# Claude provider via Anthropic SDK
│       │   ├── codex-rotate/   # Multi-account OAuth rotation
│       │   ├── remote-questions/# Slack/Discord/Telegram question routing
│       │   ├── bg-shell/       # Background shell process management
│       │   ├── search-the-web/ # Brave/Tavily/Jina web search
│       │   ├── mac-tools/      # macOS native UI automation
│       │   └── ...             # context7, google-search, usage, voice, etc.
│       └── skills/             # Bundled skills (review, test, lint, etc.)
│
├── packages/                   # Core engine workspace packages (vendored from pi-mono)
│   ├── pi-coding-agent/        # Agent session, built-in tools, RPC, TUI shell
│   ├── pi-ai/                  # LLM provider abstraction layer
│   ├── pi-tui/                 # Terminal UI renderer
│   ├── pi-agent-core/          # Base agent primitives
│   ├── native/                 # Native binaries (fd, rg wrappers)
│   ├── rpc-client/             # JSON-RPC client for headless mode
│   ├── mcp-server/             # MCP server implementation
│   └── daemon/                 # Background daemon process
│
├── dist/                       # Compiled output (TypeScript → JS)
│   ├── loader.js               # Compiled loader (npm bin entry)
│   ├── cli.js                  # Compiled CLI
│   └── resources/              # Copied extension + agent + skill resources
│
├── pkg/                        # Shim: piConfig + theme assets (no src/)
│                               # Lets pi read LSD branding without its own entry point
├── docs/                       # User-facing documentation
├── scripts/                    # Build, release, postinstall helpers
├── LEARNING.md                 # Developer onboarding guide
├── CONTRIBUTING.md             # Contribution guidelines
└── VISION.md                   # Project philosophy
```

---

## Source File Reference

Every file in `src/` with its responsibility:

| File | Purpose |
|------|---------|
| `loader.ts` | Entry point. Fast-path `--version`/`--help`, env setup, workspace linking, boots `cli.ts` |
| `cli.ts` | Main CLI. Arg parsing, mode routing (TUI/headless/print/RPC/MCP), session init |
| `headless.ts` | Headless orchestrator. Spawns RPC child, auto-responds to UI, streams progress |
| `headless-events.ts` | Event classification (terminal signals, blocked/cancelled detection, exit codes) |
| `headless-types.ts` | Type definitions for headless output formats (`HeadlessJsonResult`, `OutputFormat`) |
| `headless-ui.ts` | Progress formatting for headless stderr (tool calls, thinking, text streaming) |
| `headless-answers.ts` | Pre-supplied answer injection for headless (answer file parsing + auto-response) |
| `headless-context.ts` | Context loading for headless (`--context` file/stdin + project bootstrapping) |
| `app-paths.ts` | Path constants: `appRoot` (`~/.lsd`), `agentDir`, `sessionsDir`, `authFilePath` |
| `shared-paths.ts` | Walks up from cwd to find `.lsd/` or `.gsd/` project state root |
| `shared-preferences.ts` | PREFERENCES.md YAML frontmatter parser (global + project merge) |
| `project-sessions.ts` | Per-directory session path encoding (cwd → safe filesystem path) |
| `extension-discovery.ts` | Scans directories for extension entry points (package.json → index.ts/js fallback) |
| `extension-registry.ts` | Extension manifest types, registry persistence, enable/disable state |
| `resource-loader.ts` | Syncs bundled resources to `~/.lsd/agent/`, builds `DefaultResourceLoader` |
| `models-resolver.ts` | Resolves `models.json` path (LSD → pi fallback for migration) |
| `onboarding.ts` | First-run setup wizard (LLM provider auth, tool keys, search provider) |
| `onboarding-llm.ts` | LLM provider options and budget model configuration for onboarding |
| `welcome-screen.ts` | Branded two-panel welcome banner shown on interactive session start |
| `worktree-cli.ts` | Git worktree subcommands (list, merge, clean, remove) and `-w` flag |
| `worktree-name-gen.ts` | Generates random adjective-noun worktree names |
| `rtk.ts` | RTK shell command compression bootstrap (download, install, PATH setup) |
| `tool-bootstrap.ts` | Ensures `fd` and `rg` managed binaries are available in `~/.lsd/agent/bin/` |
| `mcp-server.ts` | MCP server entry (`--mode mcp`), exposes LSD tools to external AI clients |
| `cli-theme.ts` | Accent color helpers, reads from active theme for CLI output |
| `lsd-brand.ts` | Brand color constants (yellow/blue/pink) and ANSI rendering helpers |
| `logo.ts` | ASCII art logo rendering |
| `help-text.ts` | `--help` output and subcommand help text |
| `startup-timings.ts` | Lightweight perf timing utility (opt-in via `GSD_STARTUP_TIMING=1`) |
| `startup-model-validation.ts` | Validates configured model exists after extensions register their models |
| `pi-migration.ts` | Migrates credentials from `~/.pi/` to `~/.lsd/` on first run |
| `update-check.ts` | Non-blocking update check with cached result |
| `update-cmd.ts` | `lsd update` command — runs `npm install -g lsd-pi@latest` |
| `wizard.ts` | Shared wizard utilities (env key loading, provider detection) |
| `codex-rotate-settings.ts` | Checks if Codex multi-account rotation is enabled |
| `bedrock-auth.ts` | AWS Bedrock credential storage and validation |
| `bundled-extension-paths.ts` | Serializes/deserializes extension paths for env var passing |
| `bundled-resource-path.ts` | Resolves bundled resource file paths from package root |

### Bundled Extensions (`src/resources/extensions/`)

| Extension | Purpose |
|-----------|---------|
| `memory/` | Persistent memory system (MEMORY.md index, auto-extract, dream consolidation) |
| `browser-tools/` | Full Playwright browser automation (screenshots, forms, assertions, navigation) |
| `subagent/` | Background subagent system (scout, worker, parallel/chain execution) |
| `claude-code-cli/` | Claude provider via Anthropic SDK (streaming, partial builder) |
| `codex-rotate/` | Multi-account ChatGPT/Codex OAuth rotation (round-robin, auto-refresh) |
| `remote-questions/` | Relay agent questions to Telegram, Discord, or Slack |
| `bg-shell/` | Background shell process management (persistent sessions, readiness detection) |
| `search-the-web/` | Web search (Brave, Tavily, native) + page fetch (Jina) |
| `context7/` | Context7 library documentation lookup |
| `mac-tools/` | macOS native UI automation via Accessibility APIs |
| `usage/` | Token usage tracking and reporting (`/usage` command) |
| `usage-tips/` | Contextual usage tips and cost-saving suggestions |
| `voice/` | Voice input (macOS Swift, Linux Groq) |
| `async-jobs/` | Async bash execution with job management |
| `cache-timer/` | Prompt cache countdown display in footer |
| `ttsr/` | Tool-to-system-prompt rules engine |
| `mcp-client/` | MCP server client integration |
| `universal-config/` | Discovers config files from other AI tools (Claude, Cursor, etc.) |
| `cmux/` | Terminal multiplexer integration |
| `slash-commands/` | Built-in slash commands (audit, plan, clear, context, tools) |
| `google-search/` | Google-backed web search via Gemini |
| `shared/` | Shared utilities (UI helpers, formatters, preference readers, tests) |

---

## Startup Flow

Every `lsd` invocation starts at `dist/loader.js` and follows this path:

```mermaid
flowchart TD
    A["User runs: lsd [args]"] --> B["dist/loader.js\n(fast-path: --version, --help)"]
    B --> C{Node ≥ 22?\ngit available?}
    C -->|No| FAIL["Exit with clear error message"]
    C -->|Yes| D["Set env vars:\nPI_PACKAGE_DIR, LSD_VERSION,\nGSD_BIN_PATH, NODE_PATH, etc."]
    D --> E["Scan bundled extensions\n(discoverExtensionEntryPaths)\nWrite to LSD_BUNDLED_EXTENSION_PATHS"]
    E --> F["Link workspace packages\n(packages/ → node_modules/@gsd/)"]
    F --> G["await import('./cli.js')"]

    G --> H["cli.ts: parseCliArgs(argv)"]
    H --> I{Subcommand?}

    I -->|"update"| UPDATE["runUpdate() → npm install -g"]
    I -->|"sessions"| SESSIONS["List + pick session\nSet cliFlags.continue"]
    I -->|"headless / auto"| HEADLESS["runHeadless()\n(separate flow)"]
    I -->|"worktree"| WT["handleList/Merge/Clean/Remove"]
    I -->|"config"| ONBOARD["runOnboarding()"]
    I -->|"--print / --mode"| PRINT["Print/RPC/MCP mode\n(single-shot, no TUI)"]
    I -->|"[interactive]"| INTERACTIVE

    INTERACTIVE --> J["initResources(agentDir)\nSync extensions/agents to ~/.lsd/agent/"]
    J --> K["buildResourceLoader(agentDir)\nLoad + filter extensions"]
    K --> L["createAgentSession(\n  authStorage, modelRegistry,\n  settingsManager, sessionManager,\n  resourceLoader\n)"]
    L --> M["validateConfiguredModel()"]
    M --> N["new InteractiveMode(session)"]
    N --> O["interactiveMode.run()\n(hands control to pi-coding-agent TUI)"]
```

---

## Package Architecture (Core Engine)

The `packages/` directory contains the vendored core — you rarely need to touch these unless fixing a core bug.

```mermaid
graph LR
    subgraph "@gsd/pi-coding-agent (the main engine)"
        SESSION["createAgentSession()"]
        TOOLS["Built-in Tools\n(Read, Write, Bash, Grep,\nFind, LSP, Browser, etc.)"]
        RESLOADER["DefaultResourceLoader\n(loads extensions)"]
        SESSIONMGR["SessionManager\n(persist/resume turns)"]
        AUTHMGR["AuthStorage\n(API keys in auth.json)"]
        MODELREG["ModelRegistry\n(available models list)"]
        SETTINGS["SettingsManager\n(settings.json)"]
        INTERACT["InteractiveMode\n(TUI event loop)"]
        PRINTMODE["runPrintMode()\n(single-shot)"]
        RPCMODE["runRpcMode()\n(JSON-RPC server)"]
        RPCCLIENT["RpcClient\n(headless child comms)"]
    end

    subgraph "@gsd/pi-ai"
        PROVIDERS["Provider adapters:\nAnthropic, OpenAI, Gemini,\nBedrock, Vertex, Mistral"]
        MODELREG2["Model metadata\n(context windows, capabilities)"]
    end

    subgraph "@gsd/pi-tui"
        RENDERER["ANSI terminal renderer\nMarkdown, code blocks,\ntool call display"]
    end

    subgraph "@gsd/pi-agent-core"
        AGENTLOOP["Agent turn loop\n(send → stream → tools → repeat)"]
        EXTAPI["ExtensionAPI\n(pi.on, pi.registerCommand, etc.)"]
    end

    SESSION --> TOOLS
    SESSION --> RESLOADER
    SESSION --> SESSIONMGR
    SESSION --> AUTHMGR
    SESSION --> MODELREG
    SESSION --> SETTINGS
    INTERACT --> SESSION
    PRINTMODE --> SESSION
    RPCMODE --> SESSION
    MODELREG --> PROVIDERS
    INTERACT --> RENDERER
    SESSION --> AGENTLOOP
    RESLOADER --> EXTAPI
```

---

## Extension System

Extensions are TypeScript/JavaScript modules that hook into the agent lifecycle. They are the primary way LSD adds features on top of the core engine.

### How extensions are discovered and loaded

```mermaid
flowchart LR
    subgraph "Source: src/resources/extensions/"
        BUNDLED["Bundled extensions\n(memory, browser-tools,\nmac-tools, context7, etc.)"]
    end

    subgraph "Sync to ~/.lsd/agent/extensions/"
        SYNCED["initResources() copies\nsrc/resources/ → ~/.lsd/agent/\non every launch if version changed"]
    end

    subgraph "Discovery"
        DISCOVER["discoverExtensionEntryPaths(dir)\n1. Top-level .ts/.js → entry\n2. Subdirs: check package.json pi.extensions\n   or fall back to index.ts/index.js"]
        REGISTRY["loadRegistry()\n~/.lsd/extensions/registry.json\nstores enabled/disabled state"]
        FILTER["Filter by:\n- registry.entries[id].enabled\n- manifest.defaultEnabled\n- Special gates (codexRotateEnabled)"]
    end

    subgraph "Loading"
        RESLOADER2["DefaultResourceLoader.reload()\nCompiles extensions via jiti\n(TypeScript → runtime, no build step)"]
        EXTAPI2["ExtensionAPI injected\ninto each extension's\ndefault export function"]
    end

    BUNDLED --> SYNCED --> DISCOVER
    DISCOVER --> REGISTRY --> FILTER --> RESLOADER2 --> EXTAPI2
```

### Extension anatomy

Every extension is a TypeScript file that exports a default function:

```typescript
// src/resources/extensions/my-extension/index.ts
import type { ExtensionAPI } from '@gsd/pi-coding-agent'

export default function myExtension(pi: ExtensionAPI) {
  // Hook into lifecycle events
  pi.on('session_start', async (event, ctx) => { /* ... */ })
  pi.on('before_agent_start', async (event) => {
    // Can modify the system prompt
    return { systemPrompt: event.systemPrompt + '\nExtra instructions...' }
  })
  pi.on('turn_end', async (event, ctx) => { /* ... */ })
  pi.on('tool_call', async (event, ctx) => {
    // Can block tool calls
    return { block: true, reason: 'Not allowed' }
  })

  // Register slash commands
  pi.registerCommand('my-command', {
    description: 'Does something useful',
    handler: async (args, ctx) => {
      pi.sendUserMessage('Hello from my extension!')
    }
  })

  // Register custom tools the LLM can call
  pi.registerTool({ name: 'my_tool', description: '...', schema: {}, handler: async (input) => { /* ... */ } })

  // Send UI messages
  pi.sendMessage({ customType: 'my:event', content: 'text', display: true })
}
```

### Extension manifest (optional)

```json
// extension-manifest.json
{
  "id": "my-extension",
  "name": "My Extension",
  "version": "1.0.0",
  "description": "Does cool things",
  "tier": "bundled",      // "core" (cannot disable) | "bundled" | "community"
  "requires": { "platform": "*" },
  "provides": {
    "tools": ["my_tool"],
    "commands": ["my-command"]
  },
  "defaultEnabled": true
}
```

### Lifecycle event order

```mermaid
sequenceDiagram
    participant User
    participant CLI as cli.ts
    participant RL as ResourceLoader
    participant EXT as Extensions
    participant Agent as Agent Core
    participant LLM

    CLI->>RL: reload() — load all enabled extensions
    RL->>EXT: call default export(pi) for each extension
    CLI->>Agent: createAgentSession()
    Agent->>EXT: emit session_start
    User->>Agent: sends message
    Agent->>EXT: emit before_agent_start (can modify system prompt)
    Agent->>LLM: send messages + system prompt
    LLM-->>Agent: stream response
    loop Tool calls
        Agent->>EXT: emit tool_call (can block)
        Agent->>Agent: execute tool
    end
    LLM-->>Agent: final text response
    Agent->>EXT: emit turn_end
    Agent->>User: display response
    Note over Agent,EXT: On shutdown:
    Agent->>EXT: emit session_shutdown
```

---

## Session & Memory System

### Sessions

Sessions persist the full conversation history so you can resume where you left off.

```mermaid
graph TD
    CWD["Current working directory\n(e.g. /Users/you/myproject)"] --> ENCODE["Encode to safe path:\n--Users-you-myproject--"]
    ENCODE --> SESSDIR["~/.lsd/sessions/--Users-you-myproject--/\n(one JSON file per session)"]
    SESSDIR --> SM["SessionManager modes:\n• create() — new session\n• continueRecent() — resume latest\n• open(path) — specific session\n• inMemory() — no persistence"]
```

**CLI flags for session control:**
- `lsd` — creates a new session
- `lsd -c` / `lsd --continue` — resumes the most recent session for this directory
- `lsd sessions` — interactive session picker

### Memory System

The memory extension gives the agent persistent memory across sessions, stored as plain Markdown files.

```mermaid
graph TD
    subgraph "Memory Storage (~/.lsd/projects/<encoded-cwd>/memory/)"
        MEMMD["MEMORY.md\n(index file, always loaded into context)"]
        FILES["Individual memory files\n(user_prefs.md, feedback_testing.md, etc.)"]
    end

    subgraph "Memory Lifecycle"
        SS["session_start\n→ ensureMemoryDir()\n→ create MEMORY.md if missing"]
        BAS["before_agent_start\n→ read MEMORY.md (max 200 lines / 25KB)\n→ inject into system prompt"]
        TE["turn_end\n→ maybeStartAutoDream()\n(background consolidation)"]
        SHUT["session_shutdown\n→ extractMemories() (background)\n→ auto-extract new memories from transcript"]
    end

    subgraph "Memory Types"
        USER["user — preferences, habits"]
        FEEDBACK["feedback — corrections, praise"]
        PROJECT["project — architecture decisions"]
        REFERENCE["reference — facts, links, docs"]
    end

    SS --> MEMMD
    BAS --> MEMMD
    MEMMD --> USER & FEEDBACK & PROJECT & REFERENCE
    TE --> DREAM["Dream worker\n(background LLM pass\nto consolidate + prune memories)"]
    SHUT --> EXTRACT["Extract worker\n(background LLM pass\nto save new memories from session)"]
```

**Memory frontmatter format:**
```markdown
---
name: User prefers tabs
description: User explicitly stated tab indent preference in TypeScript
type: user
---

User prefers tabs (not spaces) in TypeScript files.
**Why:** Stated directly: "always use tabs".
**How to apply:** Set tab indentation when writing or editing TypeScript.
```

---

## Operating Modes

LSD has four distinct operating modes depending on how it's invoked:

```mermaid
graph LR
    subgraph "Interactive (default)"
        TTY["TTY detected"] --> TUI["Full TUI\n(pi-tui renderer)\nReal-time streaming,\ntool calls, slash commands"]
    end

    subgraph "Print / Single-shot"
        PRINT2["lsd --print 'message'\nlsd --mode text 'message'\nlsd --mode json 'message'"] --> SINGLE["Single turn\nNo TUI\nOutput to stdout"]
    end

    subgraph "RPC (headless child)"
        RPC["lsd --mode rpc"] --> RPCSERVER["JSON-RPC server\nover stdin/stdout\nUsed by headless orchestrator"]
    end

    subgraph "MCP Server"
        MCP["lsd --mode mcp"] --> MCPSERVER["MCP protocol server\nExposes LSD tools\nto MCP clients"]
    end

    subgraph "Headless / Auto"
        AUTO["lsd auto\nlsd headless auto"] --> ORCH["Headless orchestrator:\n1. Spawn RPC child process\n2. Send /lsd auto prompt\n3. Auto-respond to UI requests\n4. Stream progress to stderr\n5. Exit with structured result"]
    end
```

### Headless mode deep-dive

The headless mode is how CI/CD and programmatic use works. It's a two-process architecture:

```mermaid
sequenceDiagram
    participant CALLER as Caller (script/CI)
    participant ORCH as Headless Orchestrator (parent)
    participant CHILD as RPC Child (lsd --mode rpc)
    participant LLM as LLM Provider

    CALLER->>ORCH: lsd headless auto [args]
    ORCH->>CHILD: spawn(lsd --mode rpc)
    ORCH->>CHILD: client.init() — v2 protocol handshake
    ORCH->>CHILD: client.prompt("/lsd auto")
    loop Agent loop
        CHILD->>LLM: send messages
        LLM-->>CHILD: stream response + tool calls
        CHILD->>ORCH: emit events (tool_execution_start, message_update, etc.)
        ORCH->>CALLER: forward as JSONL (if --json) or format to stderr
    end
    CHILD->>ORCH: emit extension_ui_request (questions, notifications)
    ORCH->>CHILD: handleExtensionUIRequest() — auto-answer
    CHILD->>ORCH: emit terminal notification "Auto-mode stopped..."
    ORCH->>CALLER: exit 0 (success) / 10 (blocked) / 1 (error)
```

---

## Configuration & Preferences

### Config file hierarchy

```mermaid
graph TD
    SETTINGS["~/.lsd/agent/settings.json\n(SettingsManager)\nDefault model, provider, permission mode,\nscoped models, quiet startup, etc."]
    PREFS_GLOBAL["~/.lsd/PREFERENCES.md\n(YAML frontmatter)\nExperimental features, remote_questions,\nsearch_provider, subagent preferences"]
    PREFS_PROJECT[".lsd/PREFERENCES.md\n(per-project)\nOverrides global preferences"]
    AUTH["~/.lsd/agent/auth.json\n(AuthStorage)\nAPI keys for all providers"]
    MODELS["~/.lsd/agent/models.json\n(ModelRegistry)\nCustom model definitions\n(falls back to ~/.pi/agent/models.json)"]
    REGISTRY["~/.lsd/extensions/registry.json\n(ExtensionRegistry)\nEnabled/disabled state per extension"]
    LSDMD["~/.lsd/LSD.md + .lsd/LSD.md\n(Context injection)\nProject-specific instructions\ninjected into system prompt"]

    SETTINGS -->|"merged at startup"| SESSION2["Agent Session"]
    PREFS_GLOBAL -->|"deep merge"| PREFS_EFFECTIVE["Effective Preferences"]
    PREFS_PROJECT -->|"overrides global"| PREFS_EFFECTIVE
    PREFS_EFFECTIVE --> SESSION2
    AUTH --> SESSION2
    MODELS --> SESSION2
    REGISTRY -->|"filter extensions"| SESSION2
    LSDMD -->|"injected into system prompt"| SESSION2
```

### Environment variables

| Variable | Purpose |
|---|---|
| `LSD_HOME` / `GSD_HOME` | Override `~/.lsd` base directory |
| `LSD_VERSION` / `GSD_VERSION` | Current version string |
| `LSD_BIN_PATH` / `GSD_BIN_PATH` | Path to the `lsd` binary (for child processes) |
| `PI_PACKAGE_DIR` | Points pi's config resolver to `pkg/` (LSD branding) |
| `PI_NO_SANDBOX` | Disable sandbox |
| `PI_SANDBOX` | Set sandbox level (`none`, `workspace-write`, `auto`) |
| `GSD_HEADLESS` | Tell extensions we're in headless mode |
| `LSD_BUNDLED_EXTENSION_PATHS` | Serialized list of extension entry paths |
| `GSD_RTK_DISABLED` | Disable RTK shell command compression |
| `NODE_COMPILE_CACHE` | V8 bytecode cache dir (Node 22+) |

---

## Worktrees (Isolated Workspaces)

Worktrees let you run the agent on an isolated git branch without affecting your main working tree.

```mermaid
graph TD
    A["lsd -w [name]"] --> B{Name provided?}
    B -->|No| GEN["generateWorktreeName()\n(adjective-noun combo)"]
    B -->|Yes| USE["Use provided name"]
    GEN --> CREATE
    USE --> CREATE["git worktree add\n.lsd/worktrees/<name>\nwt/<name> branch"]
    CREATE --> BANNER["Print merge instructions\ncd into worktree path\nRe-launch lsd in that directory"]

    subgraph "Worktree commands"
        LIST["lsd worktree list\n→ show all active worktrees\nwith change stats"]
        MERGE["lsd worktree merge <name>\n→ git merge wt/<name> into current branch\n→ remove worktree"]
        CLEAN["lsd worktree clean\n→ remove all merged/empty worktrees"]
        REMOVE["lsd worktree remove <name>\n→ force remove a specific worktree"]
    end
```

**Worktree storage:** `.lsd/worktrees/<name>/` (inside the project's `.lsd/` state directory)

---

## Key Data Flows

### How a user message becomes an LLM response

```mermaid
sequenceDiagram
    participant U as User
    participant TUI as TUI (pi-tui)
    participant AGENT as Agent Loop (pi-agent-core)
    participant EXT as Extensions
    participant TOOLS as Tool Executor
    participant LLM as LLM (pi-ai)

    U->>TUI: types message + Enter
    TUI->>AGENT: submit(message)
    AGENT->>EXT: before_agent_start (extensions can modify system prompt)
    AGENT->>LLM: POST /messages (system prompt + conversation history)
    LLM-->>AGENT: stream: thinking tokens
    LLM-->>AGENT: stream: text tokens
    LLM-->>AGENT: stream: tool_use block(s)
    loop For each tool call
        AGENT->>EXT: tool_call (extensions can block)
        AGENT->>TOOLS: execute(toolName, input)
        TOOLS-->>AGENT: tool result
        AGENT->>LLM: POST /messages (append tool result)
        LLM-->>AGENT: stream next response
    end
    AGENT->>EXT: turn_end
    AGENT->>TUI: render final response
    TUI->>U: display output
```

### How extensions are linked to the agent session

```mermaid
flowchart TD
    BUILD["buildResourceLoader(agentDir)"] --> SCAN["discoverExtensionEntryPaths(\n  ~/.lsd/agent/extensions/\n)"]
    SCAN --> FILTER2["Filter via registry.json\n(enabled/disabled)"]
    FILTER2 --> SORT["sortExtensionPaths()\n(topological: deps load first)"]
    SORT --> RESLOADER3["DefaultResourceLoader\nwith filtered paths"]
    RESLOADER3 --> CREATE2["createAgentSession(resourceLoader)"]
    CREATE2 --> JITI["jiti compiles each .ts extension\nat runtime (no build step needed!)"]
    JITI --> CALLEXT["call export default(pi: ExtensionAPI)\nfor each extension"]
    CALLEXT --> HOOKS["Extensions register:\n- Event hooks (pi.on)\n- Commands (pi.registerCommand)\n- Tools (pi.registerTool)"]
    HOOKS --> SESSION3["Session is now fully configured\nand ready for InteractiveMode.run()"]
```

### Auth and model resolution

```mermaid
flowchart LR
    AUTH2["auth.json\n(API keys stored here\nafter onboarding wizard)"] --> AUTHMGR2["AuthStorage\n(read/write keys\nsecurely)"]
    AUTHMGR2 --> MODELREG3["ModelRegistry\n(filters available models\nbased on which keys exist)"]
    MODELS2["models.json\n(~/.lsd/agent/ or ~/.pi/agent/)"] --> MODELREG3
    MODELREG3 --> PIAI2["@gsd/pi-ai\nProvider adapters\n(Anthropic, OpenAI, Gemini,\nBedrock, Vertex, Mistral)"]
    SETTINGS2["SettingsManager\nsettings.json\n(default model + provider)"] --> SESSION4["Session picks\nactive model at startup"]
    MODELREG3 --> SESSION4
```

---

## Glossary

| Term | Meaning |
|---|---|
| **pi** | The upstream open-source coding agent that LSD is forked from |
| **pi-coding-agent** | The core workspace package (`@gsd/pi-coding-agent`) — session, tools, TUI |
| **pi-ai** | The LLM abstraction layer (`@gsd/pi-ai`) — handles all provider APIs |
| **Extension** | A TypeScript module in `resources/extensions/` that hooks into the agent lifecycle |
| **ResourceLoader** | The class that discovers, compiles (via jiti), and loads extensions |
| **Session** | A persistent conversation thread, stored in `~/.lsd/sessions/` |
| **agentDir** | `~/.lsd/agent/` — where extensions, auth, models, and binaries live |
| **appRoot** | `~/.lsd/` — top-level LSD data directory |
| **Headless mode** | Running without a TUI; parent process spawns an RPC child and communicates via JSON-RPC |
| **RPC child** | `lsd --mode rpc` — a silent agent subprocess that receives prompts and emits events over stdin/stdout |
| **RTK** | Shell command compression tool (optional, opt-in) |
| **jiti** | TypeScript runtime compiler — allows extensions to be loaded as `.ts` without a build step |
| **Worktree** | An isolated git working tree (`git worktree`) for running the agent on a separate branch |
| **Dream** | Background memory consolidation pass — the agent reviews and prunes its own memory files |
| **PREFERENCES.md** | User config file (YAML frontmatter) for experimental features and provider settings |
| **registry.json** | `~/.lsd/extensions/registry.json` — tracks which extensions are enabled or disabled |
