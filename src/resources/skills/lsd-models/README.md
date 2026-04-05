# LSD Models Skill

Discover and choose the right LLM model for your task in LSD.

## Quick Start

Load the skill:
```
/skill lsd-models
```

Then ask questions like:
- "What models do I have available?"
- "Which model is fastest?"
- "Which model has the biggest context window?"
- "How much will this cost?"

## CLI Usage

List all available models:
```bash
lsd --list-models
```

Search for a specific model:
```bash
lsd --list-models claude
lsd --list-models openai
lsd --list-models 200K
```

## What This Skill Covers

- **Listing Models** — See all available models with `lsd --list-models`
- **Understanding Specs** — Context window, max output tokens, thinking capability
- **Choosing Models** — Speed vs quality vs cost tradeoffs
- **Using Models** — Setting default model, per-subagent overrides
- **Model Comparison** — Budget, balanced, quality, and maximum context profiles
- **Cost Estimation** — Approximate pricing for different models
- **Local Models** — Using Ollama and custom providers
- **Configuration** — `~/.lsd/models.json` and `settings.json`

## Model Specs at a Glance

| Model | Provider | Context | Speed | Cost | Thinking |
|-------|----------|---------|-------|------|----------|
| Claude Opus | Anthropic | 200K | Medium | High | ✅ |
| Claude Sonnet | Anthropic | 200K | Fast | Medium | ✅ |
| Claude Haiku | Anthropic | 200K | Very Fast | Low | ❌ |
| GPT-4 Turbo | OpenAI | 128K | Medium | High | ❌ |
| GPT-4o | OpenAI | 128K | Medium | Medium | ❌ |
| GPT-4o Mini | OpenAI | 128K | Very Fast | Very Low | ❌ |
| Gemini 2.0 Flash | Google | 1M | Very Fast | Very Low | ❌ |

## Common Use Cases

### "I want this done fast"
```bash
lsd --model gpt-4o-mini
lsd --model claude-haiku
```

### "I need high quality"
```bash
lsd --model claude-opus
lsd --model gpt-4-turbo
```

### "I need to see a lot of code"
```bash
lsd --model gemini-2-flash      # 1M context
lsd --model claude-opus         # 200K context
```

### "I'm on a budget"
```bash
lsd --model gpt-4o-mini
lsd --model claude-haiku
```

### "I need to solve a hard problem"
```bash
lsd --model claude-opus --thinking
lsd --model gpt-4-turbo
```

## Using Models with Subagents

Choose which model a subagent should use:

```typescript
// Use specific model for this subagent
subagent({
  agent: "planner",
  task: "plan the feature",
  model: "claude-opus"
})

// Different model for different agent
subagent({
  agent: "formatter",
  task: "lint the code",
  model: "gpt-4o-mini"  // faster, cheaper
})
```

## Setting Default Model

**For a session:**
```bash
lsd --model claude-opus
```

**In config:**
```json
{
  "defaultModel": "claude-opus"
}
```

**Project override:**
```bash
# In .lsd/settings.json
{
  "defaultModel": "gpt-4-turbo"
}
```

## Key Columns Explained

**provider** — Which company provides the model (Anthropic, OpenAI, Google, etc.)

**model** — The identifier to use in commands and config

**name** — Human-readable name

**context** — How much text the model can read at once
- Larger = better for understanding big codebases
- Smaller = faster and cheaper
- Use L for numbers (e.g., 200K = 200,000 tokens)

**max-out** — Maximum tokens the model can generate
- Larger = can write more code
- Most useful output is measured in 1-4K tokens

**thinking** — Extended reasoning capability
- Slower but better at solving hard problems
- Useful for debugging, architecture decisions

## Examples

### Quick lint check
```bash
lsd --model gpt-4o-mini --print "lint src/app.ts"
```
Fast, cheap, good for simple tasks.

### Complex refactoring
```bash
lsd --model claude-opus --print "refactor auth.ts to dependency injection"
```
More capable, understands context better.

### Understanding large module
```bash
lsd --model gemini-2-flash --print "explain how this payment system works"
```
1M context window = read entire module at once.

### Auto-mode feature
```bash
lsd -a "implement dark mode" --model claude-sonnet
```
Balanced choice for autonomous work.

## FAQ

### "How do I know if I have a model available?"

```bash
lsd --list-models
```

If empty, configure an API key:
```bash
lsd config
```

### "What if I don't specify a model?"

Uses `defaultModel` from settings, or the first available model.

### "Can I use models I don't have API keys for?"

No. You need:
1. API key from provider
2. Enough credits/quota in account
3. Key configured in `~/.lsd/settings.json` or environment

### "How much do models cost?"

Varies widely:
- **GPT-4o Mini** — ~$0.0001 per 1K input tokens
- **Claude Haiku** — ~$0.008 per 1K input tokens
- **Claude Opus** — ~$0.015 per 1K input tokens
- **GPT-4 Turbo** — ~$0.01 per 1K input tokens

See provider pricing page for exact rates.

### "Which model should I use for my project?"

**Recommendation:** Start with **Claude Sonnet**
- Great balance of quality, speed, and cost
- 200K context (handles most codebases)
- Fast enough for real-time feedback
- Reasonable costs for production use

### "Can I mix models?"

Yes! Use different models for different subagents:

```typescript
subagent({
  tasks: [
    { agent: "planner", model: "claude-opus" },      // High quality planning
    { agent: "worker", model: "gpt-4o-mini" },       // Fast implementation
    { agent: "reviewer", model: "claude-sonnet" }    // Balanced review
  ]
})
```

## Configuration Reference

### Set default model in settings

```json
{
  "provider": "anthropic",
  "defaultModel": "claude-sonnet"
}
```

### Add custom model in models.json

```json
{
  "providers": {
    "ollama": {
      "baseUrl": "http://localhost:11434",
      "models": {
        "neural-chat": {
          "name": "neural-chat:7b",
          "contextWindow": 4096,
          "maxTokens": 2048,
          "costPer1k": {
            "input": 0,
            "output": 0
          }
        }
      }
    }
  }
}
```

## Next Steps

1. **List your models:** `lsd --list-models`
2. **Load this skill:** `/skill lsd-models`
3. **Ask a question:** "Which model should I use for...?"
4. **Set default model:** Update `~/.lsd/settings.json`
5. **Use in subagent:** `model: "..."`

## See Also

- `lsd-guide` skill — Full LSD documentation
- `lsd --list-models` — CLI command to list models
- `~/.lsd/models.json` — Define custom models
- `~/.lsd/settings.json` — Configuration reference
