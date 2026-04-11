# Token Management: Quick Reference Guide

**Fast lookup for token allocation, limits, and safety mechanisms.**

---

## Model Context Windows

```
Claude Opus 4.6    → 1M tokens  (128k max output)
Claude Sonnet 4.6  → 1M tokens  (64k max output)
Claude Haiku 4.5   → 200k tokens (64k max output)
```

**Config file:** `src/resources/extensions/claude-code-cli/models.ts` (lines 14–42)

---

## Hard Limits (Always Enforced)

| Component | Limit | File | Line |
|-----------|-------|------|------|
| MEMORY.md (context) | 200 lines + 25KB | `memory/index.ts` | 24–25 |
| Output (any tool) | 2000 lines + 50KB | core library | N/A |
| Search budget | 15 unique queries/session | `search-the-web/index.ts` | N/A |
| Concurrent subagents | 8 parallel tasks | `subagent/index.ts` | 47 |
| Context7 docs | 10k tokens max | `context7/index.ts` | 160 |

---

## Safety Margins (Conservative Allocations)

| System | Margin | Strategy | File | Line |
|--------|--------|----------|------|------|
| Search budgeting | 80% of max | Use 80% effective budget, reserve 20% | `tool-llm-context.ts` | 81 |
| Memory injection | Hard caps | Dual truncate (lines, then bytes) | `memory/index.ts` | 31–47 |
| Subagent models | $budget_model | Use cheap model for scouts | `subagent/` | N/A |

---

## Token Counting

**Formula:** `Math.ceil(chars / 4)` (rough: ~4 characters per token)

**Function:** `estimateTokens()` from `@gsd/pi-coding-agent` (core library)

**Display:** `formatTokenCount()` in `src/resources/extensions/shared/format-utils.ts` (lines 23–28)

**Examples:**
- 1000 tokens → `"1.0k"`
- 1,500,000 tokens → `"1.50M"`

---

## Caching Strategies

### Search Results (`tool-llm-context.ts`, line 56)
- **Type:** LRU with TTL
- **Max entries:** 50
- **TTL:** 10 minutes (600,000 ms)
- **Purge interval:** 1 minute
- **Cache key:** `normalizeQuery(query) + "|t:${maxTokens}|u:${maxUrls}|th:${threshold}|c:${count}|p:${provider}"`

### Context7 Docs (`context7/index.ts`, line 71)
- **Type:** Simple Map (session-scoped)
- **Max entries:** Unlimited (until session ends)
- **TTL:** None (session lifetime)
- **Cache key:** `"${libraryId}::${query ?? ''}::${tokens}"`

### RTK Savings (`rtk-session-stats.ts`, line 94)
- **Type:** Memoized binary spawn
- **Max entries:** 1 (global)
- **TTL:** 15 seconds
- **Timeout:** 5 seconds per spawn

---

## Truncation Patterns

### Pattern 1: Front-Preserve (Search Results)
```typescript
import { truncateHead } from "@gsd/pi-coding-agent";

const truncation = truncateHead(output, {
  maxLines: 2000,
  maxBytes: 50_000,
});
```
**Keeps:** Beginning of content  
**Trims:** End of content

### Pattern 2: Rear-Preserve (Build Logs)
```typescript
import { truncateTail } from "@gsd/pi-coding-agent";

const truncation = truncateTail(output, {
  maxLines: 2000,
  maxBytes: 50_000,
});
```
**Keeps:** End of content (errors, final output)  
**Trims:** Beginning (older logs)

### Pattern 3: Adaptive Snippets (Search)
```typescript
function snippetsPerResult(resultCount: number): number {
  if (resultCount <= 2) return 5;
  if (resultCount <= 4) return 3;
  if (resultCount <= 6) return 2;
  if (resultCount <= 8) return 1;
  return 0; // 9+ results: descriptions only
}
```
**File:** `search-the-web/format.ts` (lines 14–22)

---

## Context Injection Points

### Before-Agent-Start (Memory)
```typescript
pi.on('before_agent_start', async (event) => {
  const prompt = buildMemoryPrompt(memoryDir, entrypointContent);
  return {
    systemPrompt: event.systemPrompt + '\n\n' + prompt,
  };
});
```
**File:** `memory/index.ts` (lines 74–86)  
**Effect:** Injects truncated MEMORY.md into system prompt

### Context Compact (Bg-Shell)
```typescript
pi.on('session_compact', async () => {
  buildProcessStateAlert("Context was compacted.");
});
```
**File:** `bg-shell/bg-shell-lifecycle.ts` (lines 61–63)  
**Effect:** Queues alerts to re-inject process state after context reset

---

## Safety Warnings

### Memory Too Large
```
> WARNING: MEMORY.md is too large. Only part was loaded. Keep index entries concise.
```
**Trigger:** Exceeds 200 lines OR 25KB  
**File:** `memory/index.ts` (lines 49–51)

### Docs Truncated
```
[Truncated: showing 125/2000 lines (18.5k of 50.0k bytes). Use a more specific query to reduce output size.]
```
**Trigger:** Exceeds 2000 lines OR 50KB  
**File:** `context7/index.ts` (lines 233–237)

### Search Budget Exhausted
```
Search budget exhausted: You've used your 15 unique search queries this session.
```
**Trigger:** 16th unique query in session  
**File:** `search-the-web/` (loop guard)

---

## Commands for Users

### `/context`
Show current context usage and breakdown.

**Example output:**
```
Context Window
  Model:           claude/claude-opus-4-6
  Window:          1,000,000 tokens
  Used:            147,384 tokens (estimated)
  Free:            852,616 tokens
  [██░░░░░░░░░░░░░░░░] 15%

System Prompt
  Characters:      12,480
  Est. tokens:     ~3,120
  ...
```

**File:** `slash-commands/context.ts` (lines 1–180)

### `/context full`
Show per-tool and per-skill token allocation (sorted by size).

---

## API Patterns for Extension Authors

### Allocate Tokens for a Tool
```typescript
// In tool parameters
maxTokens: Type.Optional(
  Type.Number({
    minimum: 500,
    maximum: 10000,
    default: 5000,
    description: "Max tokens to use",
  })
),

// In execute()
const tokens = Math.min(Math.max(params.maxTokens ?? 5000, 500), 10000);
const budget = Math.floor(tokens * 0.8);  // 80% safety margin
```

### Estimate Content Tokens
```typescript
import { estimateTokens } from "@gsd/pi-coding-agent";

const tokens = estimateTokens(text);
```

### Truncate Output Safely
```typescript
import { truncateHead, DEFAULT_MAX_LINES, DEFAULT_MAX_BYTES } from "@gsd/pi-coding-agent";

const truncation = truncateHead(output, {
  maxLines: DEFAULT_MAX_LINES,  // 2000
  maxBytes: DEFAULT_MAX_BYTES,  // 50KB
});

let content = truncation.content;
if (truncation.truncated) {
  content += `\n\n[Truncated: ${truncation.outputLines}/${truncation.totalLines} lines]`;
}
```

### Format Token Counts
```typescript
import { formatTokenCount } from "../shared/format-utils.js";

console.log(formatTokenCount(1234));   // "1.2k"
console.log(formatTokenCount(1500000)); // "1.50M"
```

---

## Debugging Token Usage

### Check System Prompt Size
```bash
lsd --show-system-prompt | wc -c
# Divide by 4 for rough token count
```

### Monitor Context in Real-Time
```
lsd
# Then in session:
/context
# Show full breakdown:
/context full
```

### Check Memory.md Truncation
```
/memories
# Look for "(stored)" note if any memories were skipped
```

### View Active Tools & Schemas
```
lsd --list-tools
# Shows registered tools and their schema sizes
```

---

## Common Issues & Solutions

### Problem: "MEMORY.md is too large"
**Cause:** MEMORY.md exceeds 200 lines or 25KB  
**Solution:**
1. Run `/memories` to see all saved memories
2. Remove old/stale memories with `/forget <topic>`
3. Or run `/dream` to consolidate memories

### Problem: Search output truncated
**Cause:** Too many snippets or long documents  
**Solution:**
1. Use `threshold:'strict'` to filter for relevance
2. Reduce `maxUrls` parameter
3. Use more specific search query

### Problem: Context window full (99%)
**Cause:** System prompt, tools, and history accumulated  
**Solution:**
1. Run `/context` to see breakdown
2. Look for largest tools via `/context full` and disable unused ones
3. Use `/compact` command to trim message history

### Problem: Subagent context starved
**Cause:** Parent agent ate all context before spawning subagent  
**Solution:**
1. Use smaller model for parent (`--model haiku`)
2. Or use budget subagent model for reconnaissance
3. Configure `budget_model` in agent settings

---

## Token Budgets by Use Case

### Quick Lookup (Scout/Recon)
- **Model:** Haiku (200k context)
- **Available:** ~120k for actual work
- **Typical use:** Map files, find hotspots

### Standard Task (Worker)
- **Model:** Sonnet (1M context)
- **Available:** ~900k for actual work
- **Typical use:** Implement features, fix bugs

### Complex Task (Reasoning)
- **Model:** Opus (1M context)
- **Available:** ~900k for actual work
- **Typical use:** Architecture design, code review

### Web Research
- **Search budget:** 8k tokens (default)
- **Effective budget:** 6.4k tokens (80% margin)
- **Snippets:** 5→1 per result (adaptive)

### Documentation Lookup
- **Doc budget:** 5k tokens (default, configurable)
- **Max budget:** 10k tokens
- **Effective:** Stays under 2000 lines or 50KB

---

## Performance Metrics

### Token Overhead (Typical Session)

| Component | Tokens | % of Budget |
|-----------|--------|-------------|
| System Prompt (base) | 2,100 | 0.2% |
| Skills metadata | 980 | 0.1% |
| Project context | 400 | 0.04% |
| Memory (MEMORY.md) | 1,500 | 0.15% |
| Tools schemas (active) | 3,500 | 0.35% |
| **Subtotal system** | ~8,480 | ~0.85% |
| **Message history** | 70,000–200,000 | 7–20% |
| **Free space** | 700,000–925,000 | 70–92% |

### Caching Benefits

| Cache | Hit Rate | Time Saved | Token Savings |
|-------|----------|-----------|---|
| Search (10 min TTL) | ~30% (typical) | 300–500ms | 6k–20k per hit |
| Context7 (session) | ~50% (typical) | 100–200ms | 2k–10k per hit |
| RTK (15s window) | ~80% (typical) | 5s per hit | N/A (meta) |

---

## Files at a Glance

| Purpose | File | Key Lines |
|---------|------|-----------|
| Model configs | `claude-code-cli/models.ts` | 14–42 |
| Token formatting | `shared/format-utils.ts` | 23–28 |
| Search budgeting | `search-the-web/tool-llm-context.ts` | 64–117 |
| Memory limits | `memory/index.ts` | 24–25, 31–47 |
| Context7 budget | `context7/index.ts` | 160, 187 |
| Context reporting | `slash-commands/context.ts` | 1–180 |
| Bg-shell recovery | `bg-shell/bg-shell-lifecycle.ts` | 41–72 |
| Subagent isolation | `subagent/index.ts` | 47, 70–90 |
| RTK tracking | `shared/rtk-session-stats.ts` | 60–100 |

---

## References

- **Full architecture:** See `TOKEN_MANAGEMENT_ARCHITECTURE.md`
- **Core library:** `@gsd/pi-coding-agent` (truncation, token estimation)
- **LSD guide:** `src/resources/skills/lsd-guide/` (user documentation)
- **Extension skeleton:** `src/resources/skills/create-lsd-extension/` (patterns)

