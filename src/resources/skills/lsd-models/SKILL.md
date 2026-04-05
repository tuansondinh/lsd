---
name: lsd-models
description: List available LLM models and their capabilities. Bundled skill always available. Use this skill to discover which models are available, check their context windows, and choose the right model for your subagent or session. Shows provider, model ID, name, context window, max output tokens, and whether reasoning is supported.
---

# LSD Models — Available Models Reference

Lists all LLM models available in your LSD setup, including their capabilities and specifications.

## Quick Usage

<objective>Show available models and help choose the right one for your task</objective>

<quick_start>
To list all available models:

**From CLI:**
```bash
lsd --list-models
```

**From LSD session:**
You're reading this skill! Ask me:
- "What models do I have available?"
- "Which model should I use for X?"
- "Show me fast models"
- "Which model has the biggest context?"
</quick_start>

<process>
1. Get list of available models (requires API keys configured)
2. Each model shows:
   - **provider** — Claude, GPT, Gemini, etc.
   - **model** — Model ID (e.g., `claude-opus`)
   - **name** — Display name
   - **context** — Context window size
   - **max-out** — Max output tokens
   - **thinking** — Has reasoning capability (yes/no)

3. Use model ID in subagent or session calls
</process>

<success_criteria>
You can:
- List all available models
- Filter/search for specific models
- Understand context window and output token limits
- Choose appropriate model for your task
- Use model ID in subagent or /model commands
</success_criteria>

---

## CLI Usage

### List All Models

```bash
lsd --list-models
```

Output example:
```
provider    model              name                                context  max-out  thinking
anthropic   claude-opus        Claude 3.5 Opus                     200K     4K       yes
anthropic   claude-sonnet      Claude 3.5 Sonnet                   200K     4K       yes
anthropic   claude-haiku       Claude 3.5 Haiku                    200K     4K       no
openai      gpt-4-turbo        GPT-4 Turbo                         128K     4K       no
openai      gpt-4o             GPT-4o                              128K     4K       no
openai      gpt-4o-mini        GPT-4o Mini                         128K     4K       no
google      gemini-2-flash     Gemini 2.0 Flash                    1M       8K       no
ollama      neural-chat       Neural Chat 7B (local)               4K       2K       no
```

### Search for Specific Model

```bash
lsd --list-models claude
```

Shows only models matching "claude":
```
provider    model              name                                context  max-out  thinking
anthropic   claude-opus        Claude 3.5 Opus                     200K     4K       yes
anthropic   claude-sonnet      Claude 3.5 Sonnet                   200K     4K       yes
anthropic   claude-haiku       Claude 3.5 Haiku                    200K     4K       no
```

### Filter by Provider

```bash
lsd --list-models openai
```

### Filter by Capability

```bash
lsd --list-models "200K"
```

Shows models with 200K context window.

---

## Understanding the Columns

### provider
Which LLM provider the model comes from:
- **anthropic** — Claude models
- **openai** — GPT models
- **google** — Gemini models
- **github** — GitHub Copilot
- **ollama** — Local/self-hosted models
- **custom** — Custom provider or proxy

### model
The model identifier used in commands and config:

```bash
# Use in CLI
lsd --model claude-opus

# Use in subagent
subagent(agent: "planner", model: "claude-opus", task: "...")

# Use in settings.json
{
  "defaultModel": "claude-opus"
}
```

### name
Human-readable model name.

### context
Context window size (how much text the model can see):
- **4K** — Small, fast, cheap (fitting 1 file)
- **8K** — Standard, good balance (fitting 2-3 files)
- **32K** — Large, slower (fitting a module)
- **100K+** — Huge, expensive (fitting entire codebase)

Use **larger context** for:
- Complex features (more code understanding)
- Refactoring (need to see dependencies)
- Analysis (broader perspective)

Use **smaller context** for:
- Quick edits (just one file)
- Speed (faster responses)
- Cost (cheaper API calls)

### max-out
Maximum output tokens (how much the model can write):
- **2K** — Short responses
- **4K** — Normal responses
- **8K** — Long responses, code generation
- **16K+** — Very long outputs

Larger is almost always better (you pay only for what you use).

### thinking
Whether model supports extended reasoning:
- **yes** — Can use "thinking mode" for complex problems
- **no** — Direct answer only

Use thinking models for:
- Hard problems (math, logic, debugging)
- Decisions (choosing architecture)
- Analysis (finding root causes)

Thinking slows down responses but improves quality.

---

## Choosing the Right Model

### For Speed → Use Fast Models

**Fast & Cheap:**
```bash
lsd --model gpt-4o-mini
lsd --model claude-haiku
```

Good for:
- Quick edits
- Auto-mode (time-sensitive)
- High token volume

### For Quality → Use Capable Models

**Best Quality:**
```bash
lsd --model claude-opus
lsd --model gpt-4-turbo
```

Good for:
- Architecture decisions
- Complex refactoring
- Difficult bugs

### For Context → Use Large Context Windows

**Maximum Context:**
```bash
lsd --model gemini-2-flash    # 1M context!
lsd --model claude-opus       # 200K
```

Good for:
- Large codebases
- Full project understanding
- Many files at once

### For Reasoning → Use Thinking Models

**With Extended Thinking:**
```bash
lsd --model claude-opus       # supports thinking
```

Good for:
- Debugging complex issues
- Architectural decisions
- Novel problems

### For Cost Control → Use Small Models

**Cheapest Options:**
```bash
lsd --model gpt-4o-mini
lsd --model claude-haiku
lsd --model ollama:neural-chat   # free if local
```

Good for:
- Budget constraints
- High-volume work
- Testing/development

---

## Using Models in LSD

### Set Default Model (Session)

```bash
lsd --model claude-opus
```

Uses Claude Opus for this session.

### Set Default Model (Config)

In `~/.lsd/settings.json`:
```json
{
  "defaultModel": "claude-opus"
}
```

Or project override (`.lsd/settings.json`):
```json
{
  "defaultModel": "gpt-4-turbo"
}
```

### Use Specific Model in Subagent

```typescript
subagent({
  agent: "planner",
  task: "plan the feature",
  model: "claude-opus"    // Use this specific model
})
```

### Use Specific Model in One-Shot

```bash
lsd --print "analyze this code" --model gpt-4-turbo
```

### Use Specific Model in Auto-Mode

```bash
lsd -a "implement dark mode" --model claude-opus
```

---

## Model Comparison

### Budget Profile (Speed + Cost)

```bash
lsd --model gpt-4o-mini
```

- Fast: ~1-2 sec per call
- Cheap: ~$0.01 per 1K tokens
- Context: 128K (good)
- Good for: Quick tasks, development

### Balanced Profile

```bash
lsd --model claude-sonnet
```

- Medium: ~2-3 sec per call
- Cost: ~$0.01 per 1K tokens (input)
- Context: 200K (great)
- Good for: Daily work, production

### Quality Profile (Power)

```bash
lsd --model claude-opus
```

- Slower: ~3-4 sec per call
- Expensive: ~$0.015 per 1K tokens
- Context: 200K (great)
- Thinking: Yes
- Good for: Complex problems, decisions

### Maximum Context

```bash
lsd --model gemini-2-flash
```

- Speed: Fast
- Cost: Cheap
- Context: 1M (massive!)
- Good for: Huge codebases, full understanding

---

## Common Questions

### "What if I don't have a model configured?"

Error: `No models available. Set API keys in environment variables.`

**Solution:**
1. Run `lsd config`
2. Add API key for at least one provider
3. Check with `lsd --list-models`

### "Can I use multiple models?"

Yes! Set default in config, override per-session:

```bash
lsd                              # Uses default
lsd --model gpt-4-turbo          # Override for this session
```

Or per-subagent:

```typescript
subagent({ agent: "planner", model: "claude-opus" })
subagent({ agent: "worker", model: "gpt-4o-mini" })
```

### "Which model is best for my project?"

Depends on your priorities:

| Priority | Model |
|----------|-------|
| Speed | gpt-4o-mini |
| Quality | claude-opus |
| Context | gemini-2-flash |
| Balance | claude-sonnet |
| Cost | gpt-4o-mini |
| Reasoning | claude-opus |

**Default recommendation:** `claude-sonnet` (balance of quality, speed, and cost)

### "Can I use local models?"

Yes! If configured with Ollama:

```bash
lsd --list-models ollama
lsd --model ollama:neural-chat
```

Or custom provider in `models.json`.

### "How many tokens will this cost?"

Estimate:
- Context used: ~60-80% of your file size
- Output generated: ~0.5-1x the input size

Example: 10K input tokens + 4K output tokens

```
claude-opus:   (10K × $0.003) + (4K × $0.015) = $0.09
gpt-4-turbo:   (10K × $0.01) + (4K × $0.03) = $0.22
gpt-4o-mini:   (10K × $0.0001) + (4K × $0.0004) = $0.003
```

---

## Tips & Tricks

### Fast Prototyping

```bash
lsd -a "rough idea" --model gpt-4o-mini
# Quick iteration, low cost
```

### Production Work

```bash
lsd "important decision" --model claude-opus
# Better quality, will cost more
```

### Large Codebases

```bash
lsd "understand this module" --model gemini-2-flash
# 1M context means fewer token limits
```

### Budget-Conscious

```bash
# In ~/.lsd/settings.json
{
  "defaultModel": "gpt-4o-mini",
  "costBudget": 50,
  "costBudgetPeriod": "day"
}
```

### Quality-First

```bash
# In ~/.lsd/settings.json
{
  "defaultModel": "claude-opus",
  "tokenProfile": "quality"
}
```

---

## See Also

- `lsd-guide` skill → `references/configuration.md` — Full config reference
- `lsd --list-models` — CLI command to list models
- `~/.lsd/models.json` — Define custom models
- `~/.lsd/settings.json` — Set default model

---

## Model Availability

Models listed depends on:
1. ✅ API keys configured in `~/.lsd/settings.json` or env vars
2. ✅ Provider access (paid plan for some providers)
3. ✅ Custom models in `~/.lsd/models.json`
4. ✅ Ollama running (for local models)

To add more models:

1. **Configure API key:**
   ```bash
   lsd config
   ```

2. **Add custom model:**
   ```json
   {
     "providers": {
       "ollama": {
         "baseUrl": "http://localhost:11434",
         "models": {
           "llama": {
             "name": "llama2:70b",
             "contextWindow": 4096
           }
         }
       }
     }
   }
   ```

3. **Verify it shows up:**
   ```bash
   lsd --list-models
   ```
