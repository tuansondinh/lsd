# Configuration Guide

## Configuration Files

LSD uses two levels of configuration:

**User config** (`~/.lsd/`):
```
~/.lsd/
├── settings.json         # LLM provider, permissions, preferences
├── models.json          # Custom model definitions
├── auth/                # OAuth tokens, API keys
├── sessions/            # Chat history, persisted sessions
├── skills/              # User-installed custom skills
└── agents/              # User-installed custom agents
```

**Project config** (`.lsd/`):
```
.lsd/
├── settings.json        # Project-specific overrides
├── models.json          # Project-specific models
├── skills/              # Project-local skills
├── agents/              # Project-local agents
└── extensions/          # Project-local extensions
```

Project config overrides user config for that project only.

## settings.json

Main configuration file. Created during setup.

### Minimal Example

```json
{
  "provider": "anthropic",
  "defaultPermissionMode": "interactive",
  "enableWebSearch": true,
  "webSearchProvider": "brave"
}
```

### Full Options

```json
{
  "provider": "anthropic|openai|google|github|ollama|custom",
  "defaultPermissionMode": "interactive|audited|auto",
  "apiKey": "sk-...",
  
  "enableWebSearch": true,
  "webSearchProvider": "brave|tavily|built-in",
  "webSearchApiKey": "...",
  
  "remoteQuestions": {
    "enabled": true,
    "provider": "telegram|discord|slack",
    "token": "...",
    "chatId": "..."
  },
  
  "git": {
    "defaultBranch": "main",
    "autoCommit": true,
    "commitTemplate": "automated: {task}"
  },
  
  "tokenProfile": "balanced|speed|quality|custom",
  "maxContextTokens": 100000,
  "costBudget": 50,
  "costBudgetPeriod": "day|week|month",
  
  "skills": {
    "autoLoad": ["lint", "test"],
    "preferSystem": true
  },
  
  "extensions": {
    "enabled": true,
    "paths": ["~/.lsd/extensions", ".lsd/extensions"]
  },
  
  "ui": {
    "theme": "dark|light|auto",
    "colorScheme": "default|solarized|one-dark",
    "showTokenCount": true,
    "compactMode": false
  },
  
  "performance": {
    "cacheResponses": true,
    "compressionLevel": 1,
    "maxConcurrentRequests": 5
  }
}
```

### Key Settings

**Provider & Auth:**
```json
{
  "provider": "anthropic",
  "apiKey": "sk-ant-..."  // Or use env var ANTHROPIC_API_KEY
}
```

**Permission Mode:**
```json
{
  "defaultPermissionMode": "interactive"
  // interactive: ask before every change (safest)
  // audited: execute and show diffs
  // auto: execute without asking
}
```

**Web Search:**
```json
{
  "enableWebSearch": true,
  "webSearchProvider": "brave",
  "webSearchApiKey": "..."
}
```

**Remote Questions:**
```json
{
  "remoteQuestions": {
    "enabled": true,
    "provider": "discord",
    "token": "...",
    "channelId": "..."
  }
}
```

## models.json

Define custom or override models.

### Custom Ollama Model

```json
{
  "providers": {
    "ollama": {
      "baseUrl": "http://localhost:11434",
      "models": {
        "neural-chat": {
          "name": "neural-chat:7b",
          "contextWindow": 4096,
          "costPer1k": { "input": 0, "output": 0 }
        }
      }
    }
  }
}
```

### Custom OpenAI-Compatible Provider

```json
{
  "providers": {
    "together": {
      "baseUrl": "https://api.together.xyz/v1",
      "apiKey": "${TOGETHER_API_KEY}",
      "models": {
        "llama": {
          "id": "meta-llama/Llama-3-70b-chat-hf",
          "contextWindow": 8192,
          "costPer1k": { "input": 0.0009, "output": 0.0009 }
        }
      }
    }
  }
}
```

### Proxy Setup

```json
{
  "providers": {
    "anthropic": {
      "baseUrl": "http://localhost:3000/anthropic",
      "apiKey": "${ANTHROPIC_API_KEY}"
    }
  }
}
```

## Environment Variables

Override any setting with env vars:

```bash
# Authentication
ANTHROPIC_API_KEY=sk-ant-...
OPENAI_API_KEY=sk-...
GOOGLE_API_KEY=...

# Behavior
LSD_PERMISSION_MODE=auto
LSD_AUTO_MODE=true
LSD_OFFLINE=false

# Configuration
LSD_HOME=~/.lsd
LSD_CONFIG_DIR=~/.lsd
LSD_PROVIDER=anthropic

# Performance
LSD_MAX_CONTEXT_TOKENS=100000
LSD_CACHE_DIR=~/.lsd/cache

# Debugging
LSD_DEBUG=true
LSD_LOG_LEVEL=debug
LSD_TRACE=true
```

## Permission Modes

### Interactive (Safest)

```json
{
  "defaultPermissionMode": "interactive"
}
```

Behavior:
- Agent shows proposed changes
- **Requires explicit approval** before executing
- Safe for learning and experiments
- Takes longer (back-and-forth)

### Audited (Productive)

```json
{
  "defaultPermissionMode": "audited"
}
```

Behavior:
- Agent executes changes immediately
- Shows diffs and results **after** execution
- Allows corrections
- Good balance of speed and safety

### Auto (Fast)

```json
{
  "defaultPermissionMode": "auto"
}
```

Behavior:
- Agent executes without asking
- Only pauses for genuine uncertainty
- Best for auto-mode and automation
- Requires trust in agent

## Tokens & Cost Management

### Token Profile

Choose a profile for automatic trade-offs:

```json
{
  "tokenProfile": "balanced"
}
```

Options:
- **speed** — Minimize tokens, use smaller models
- **balanced** — Default, medium tokens
- **quality** — Maximize quality, use larger models, more retries
- **custom** — Define your own thresholds

### Cost Budget

Enforce spending limits:

```json
{
  "costBudget": 50,
  "costBudgetPeriod": "day"
}
```

When budget is reached, LSD:
1. Switches to cheaper models
2. Reduces context size
3. Disables web search
4. Asks for manual approval

### Max Context Tokens

Limit context window:

```json
{
  "maxContextTokens": 100000
}
```

Default is model's max. Set lower to:
- Reduce costs
- Speed up responses
- Test with limited context

## Skills & Extensions

### Auto-Load Skills

Load skills automatically at session start:

```json
{
  "skills": {
    "autoLoad": ["lint", "test", "accessibility"]
  }
}
```

### Enable/Disable Extensions

```json
{
  "extensions": {
    "enabled": true,
    "paths": [
      "~/.lsd/extensions",
      ".lsd/extensions"
    ]
  }
}
```

## Git Configuration

```json
{
  "git": {
    "defaultBranch": "main",
    "autoCommit": true,
    "commitTemplate": "automated: {task}",
    "pullBeforeWork": true
  }
}
```

## UI Configuration

```json
{
  "ui": {
    "theme": "dark",
    "colorScheme": "one-dark",
    "showTokenCount": true,
    "compactMode": false,
    "fontSize": 12,
    "lineHeight": 1.5
  }
}
```

## Reconfiguring Settings

**Re-run setup wizard:**
```bash
lsd config
```

Walks through each setting interactively.

**Edit manually:**
```bash
# Edit user config
vim ~/.lsd/settings.json

# Edit project config
vim .lsd/settings.json
```

**Verify config:**
```bash
lsd doctor    # Health check
lsd forensics # Dump full config
```

## Project-Specific Overrides

In `.lsd/settings.json`, override user settings for this project only:

```json
{
  "provider": "openai",
  "apiKey": "sk-...",
  "defaultPermissionMode": "auto"
}
```

Now when running in this project:
```bash
lsd
```

Uses OpenAI + auto mode instead of user defaults.

## Common Patterns

### Development Setup

```json
{
  "defaultPermissionMode": "interactive",
  "tokenProfile": "quality",
  "skills": {
    "autoLoad": ["lint", "test"]
  }
}
```

### Production Auto-Mode

```json
{
  "defaultPermissionMode": "audited",
  "tokenProfile": "speed",
  "costBudget": 100,
  "costBudgetPeriod": "day"
}
```

### Offline Development

```json
{
  "enableWebSearch": false,
  "LSD_OFFLINE": true
}
```

### Cost-Conscious Setup

```json
{
  "provider": "ollama",
  "tokenProfile": "speed",
  "maxContextTokens": 8192,
  "costBudget": 5,
  "costBudgetPeriod": "day"
}
```

## Troubleshooting Config

### "Config not loading"

```bash
lsd forensics | grep settings
```

Check:
1. Valid JSON syntax
2. File exists and is readable
3. No circular references

### "Wrong settings being used"

Check precedence:
```bash
lsd forensics

# Order (highest to lowest priority):
# 1. Environment variables
# 2. Project config (.lsd/settings.json)
# 3. User config (~/.lsd/settings.json)
# 4. Defaults
```

### "API key rejected"

```bash
lsd doctor
```

Checks API key validity, permissions, quota.

## See Also

- `references/getting-started.md` — Initial setup
- `references/custom-models.md` — Advanced model configuration
- `references/token-optimization.md` — Token tuning
- `references/cost-management.md` — Budget and cost control
