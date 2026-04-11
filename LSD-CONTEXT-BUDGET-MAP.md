# LSD Context Budget & Token Management System — Complete Mapping

## Overview

LSD implements a **distributed context and token management system** across multiple subsystems. Rather than a single "BudgetManager" class, context tracking is spread across:

1. **Model Configuration** — static context window / max tokens per model
2. **Token Counting Utilities** — runtime token estimation for formatting and display
3. **Context Injection & Reporting** — `/context` command + footer widgets
4. **Content Truncation & Prioritization** — adaptive snippet budgets, safe truncation
5. **Search/Documentation APIs** — client-side token budgeting for external content
6. **Memory System** — truncation limits for persistent memory index
7. **Background Processes** — context re-injection after compaction events
8. **Subagent Isolation** — per-subagent context budgets + model selection

---

## 1. Model Configuration & Context Windows

### Core Files

#### `src/resources/extensions/claude-code-cli/models.ts`
- **Purpose:** Defines Claude models with context window and max token limits
- **Classes/Functions:**
  - `CLAUDE_CODE_MODELS` — array of model definitions
- **Key Data:**
  ```typescript
  {
    id: "claude-opus-4-6",
    contextWindow: 1_000_000,        // 1M tokens
    maxTokens: 128_000,               // Max output
  }
  {
    id: "claude-sonnet-4-6",
    contextWindow: 1_000_000,
    maxTokens: 64_000,
  }
  {
    id: "claude-haiku-4-5",
    contextWindow: 200_000,
    maxTokens: 64_000,
  }
  ```
- **Responsibilities:**
  - Define model capabilities (context size, max output tokens)
  - Cost definitions (zero-cost for Claude Code subscriptions)
  - Input modality support (text, image)
  - Reasoning capability flags

#### `src/resources/extensions/slash-commands/context.ts`
- **Purpose:** Provides `/context` command to display runtime context window usage
- **Functions:**
  - `contextCommand()` — main command handler
  - `estimateTextTokens()` — rough token estimation (1 token per 4 chars)
  - `countMatches()` — count regex matches for skill/section analysis
- **Tracks:**
  - System prompt token count and breakdown (skills, project context, footer)
  - Active tools token usage
  - Message history token count
  - Current model window size and usage percentage
- **Display Features:**
  - Context usage bar (█░░ visualization)
  - Breakdown by component (system prompt, tools, history)
  - Top 5 largest active tools
  - Free tokens remaining

#### `src/onboarding.ts`
- **Context Window Definition:**
  - Fallback model: `contextWindow: 128000, maxTokens: 16384`
  - Used during onboarding when no model is fully configured

---

## 2. Token Counting Utilities

### Core Files

#### `src/resources/extensions/shared/format-utils.ts`
- **Purpose:** Pure formatting utilities for tokens and durations
- **Key Functions:**
  - **`formatTokenCount(count: number): string`**
    - Formats token counts as human-readable: `1.5k`, `1.50M`
    - Threshold: <1k (raw), <1M (k), ≥1M (M)
  - **`truncateWithEllipsis(text: string, maxLength: number): string`**
    - Truncates string to `maxLength` chars, replaces last char with `…`
  - **`formatDuration(ms: number): string`**
    - Formats milliseconds as compact duration: `123ms`, `1m 23s`, `1h 2m`
  - **`sparkline(values: number[]): string`**
    - Renders Unicode sparkline from numeric values
  - **`stripAnsi(s: string): string`**
    - Removes ANSI escape sequences for token counting

#### `src/resources/extensions/slash-commands/context.ts` (continued)
- **`estimateTokens(message: AgentMessage): number`**
  - Imported from `@gsd/pi-coding-agent` (upstream library)
  - Estimates tokens for structured message objects (text + tool_use blocks)

#### `src/resources/extensions/search-the-web/tool-llm-context.ts`
- **`estimateTokens(text: string): number`**
  - Local implementation: ~4 chars per token for English text
  - Used for token budgeting in LLM Context API responses

---

## 3. Context Allocation & Budgeting

### Core Files

#### `src/resources/extensions/search-the-web/tool-llm-context.ts`
- **Purpose:** Client-side token budgeting for external documentation APIs
- **Key Function: `budgetContent()`**
  - **Inputs:**
    - `results: TavilyResult[]` — search results to budget
    - `maxTokens: number` — caller-requested token limit
    - `threshold: number` — minimum score (0–1) for inclusion
  - **Algorithm:**
    - Filters results by score threshold (strict=0.7, balanced=0.5, lenient=0.3)
    - Sorts by relevance score (descending)
    - Allocates effective budget: `maxTokens * 0.8` (20% safety margin)
    - Distributes per-result budget equally: `effectiveBudget / resultCount`
    - Truncates each result text to per-result char limit (tokens × 4)
    - Returns grounding snippets + source metadata + estimated tokens
  - **Responsibilities:**
    - Prevent context overflow from large result sets
    - Prioritize high-relevance content
    - Track estimated token usage for transparency
- **Integration Points:**
  - **Tavily**: Uses raw_content (advanced search depth) with client budgeting
  - **Ollama**: Converts web_search results to Tavily-compatible format
  - **Brave**: Server-side budgeting (no client budget function needed)

#### `src/resources/extensions/subagent/configured-model.ts`
- **Purpose:** Resolve per-subagent model configuration
- **Function: `resolveConfiguredSubagentModel()`**
  - Resolves `$budget_model` placeholder to actual model
  - Falls back through: settings → preferences → undefined
  - Normalizes model IDs to `provider/id` format
- **Responsibilities:**
  - Allow delegated agents to use cheaper "budget" models
  - Isolate subagent context budgets from parent agent

#### `src/resources/extensions/subagent/index.ts` (excerpt)
- **Constants:**
  - `MAX_PARALLEL_TASKS = 8` — limit parallel subagent executions
  - `MAX_CONCURRENCY = 4` — limit concurrent task execution
  - `DEFAULT_AWAIT_SUBAGENT_TIMEOUT_SECONDS = 120` — default timeout
- **Context Isolation:**
  - Each subagent spawns separate `pi` process with isolated context
  - Session files tracked separately per subagent
  - Process cleanup on parent session shutdown

---

## 4. Truncation & Prioritization Logic

### Core Files

#### `src/resources/extensions/search-the-web/format.ts`
- **Purpose:** Token-efficient output formatting for search results
- **Adaptive Snippet Budget:**
  - **`snippetsPerResult(resultCount: number): number`**
    - 1–2 results: 5 snippets each
    - 3–4 results: 3 snippets each
    - 5–6 results: 2 snippets each
    - 7–8 results: 1 snippet each
    - 9+ results: descriptions only (0 snippets)
  - Ensures total output stays roughly constant regardless of result count
- **Functions:**
  - `formatSearchResults()` — formats search results with adaptive snippets
  - `formatPageContent()` — formats fetched page content
  - `formatLLMContext()` — formats LLM Context API responses with sources

#### `src/resources/extensions/search-the-web/tool-fetch-page.ts`
- **Purpose:** Extract clean markdown from URLs with truncation
- **Truncation Strategy:**
  - Uses upstream `truncateHead(output, { maxLines: DEFAULT_MAX_LINES, maxBytes: DEFAULT_MAX_BYTES })`
  - If content exceeds limits, write full output to temp file + reference
  - Returns truncated display content + file path for full content
- **Source Selection:**
  - Primary: Jina Reader API (strips images, collapses whitespace)
  - Fallback: Direct HTML fetch with crude text extraction
  - JSON passthrough: Raw JSON returned unmodified
- **Selector Support:**
  - Optional `selector` parameter for Jina's X-Target-Selector
  - Extracts specific CSS selectors from pages (e.g., `main`, `article`)

#### `src/resources/extensions/memory/index.ts`
- **Truncation for Memory Index:**
  - **`MAX_ENTRYPOINT_LINES = 200`** — line count cap for MEMORY.md
  - **`MAX_ENTRYPOINT_BYTES = 25_000`** — byte size cap (~6k tokens)
  - **Function: `truncateEntrypointContent()`**
    - Applies both caps (line count first, then bytes)
    - Walks backwards to find last newline within budget
    - Appends warning footer if truncated
  - **Purpose:** Prevent memory index from dominating context window

#### `src/resources/extensions/memory/auto-extract.ts`
- **Truncation in Transcript Building:**
  - **`buildTranscriptSummary(entries: any[]): string`**
    - Extracts text-only messages (skips tool_use / tool_result blocks)
    - Truncates individual messages to 2000 chars
    - Skips empty messages
  - **Purpose:** Build manageable conversation transcript for extraction agent

#### `src/resources/extensions/context7/index.ts`
- **Token Budgeting:**
  - Default: `maxTokens: 8192` for documentation fetch
  - User can override: minimum 1024, maximum 10000
  - Cache key includes maxTokens parameter (different sizes = different cache entries)
- **Truncation:**
  - Uses `truncateHead(output, { maxLines: DEFAULT_MAX_LINES, maxBytes: DEFAULT_MAX_BYTES })`
  - If truncated, writes full output to temp file + reference

---

## 5. Safety Mechanisms & Adaptive Strategies

### Core Files

#### `src/resources/extensions/search-the-web/tool-llm-context.ts`
- **Safety Margins:**
  - Effective budget: `maxTokens * 0.8` (conservative 20% safety margin)
  - Per-result budget distribution: equal allocation to prevent one result dominating
- **Error Classification:**
  - Maps HTTP errors to user-friendly categories: `auth_error`, `plan_error`, `rate_limit`, etc.
  - Brave API plan errors provide upgrade guidance
- **Retry & Rate Limit Handling:**
  - `fetchWithRetryTimed()` with exponential backoff (max 2 retries)
  - Returns `RateLimitInfo` for monitoring and backoff
- **Caching:**
  - `LRUTTLCache` with 50-entry max, 10-minute TTL
  - Provider-prefixed cache keys (tavily, brave, ollama separate)

#### `src/resources/extensions/search-the-web/tool-fetch-page.ts`
- **Cache Safety:**
  - `LRUTTLCache`: 30-entry max, 15-minute TTL
  - Per-URL (with optional selector) + offset caching
- **Fallback Chain:**
  - Primary: Jina Reader (best parsing)
  - Fallback: Direct HTML fetch (slower but more compatible)
  - JSON/PDF special handling
- **Timeout Handling:**
  - Jina: 20 second timeout
  - Direct: 15 second timeout
  - Graceful error messages if timeout exceeded

#### `src/resources/extensions/bg-shell/bg-shell-lifecycle.ts`
- **Context Re-injection After Compaction:**
  - Detects `session_compact`, `session_tree`, `session_switch` events
  - Builds process state alert with current running processes
  - Injects before next `before_agent_start` so LLM knows about alive processes
  - Prevents loss of background process state after context reset
- **Process Status Tracking:**
  - Status icons: `●` (ready), `●` (error), `●` (starting)
  - Error badges: `err:N` count
  - Port/URL info for debugging

#### `src/resources/extensions/memory/index.ts`
- **Adaptive Truncation:**
  - Line count cap: 200 lines
  - Byte cap: 25KB (~6k tokens)
  - Flexible: apply whichever triggers first
  - Warning footer when truncated

---

## 6. Model-Specific Configuration

### Files

#### `src/resources/extensions/claude-code-cli/models.ts`
- Defines 3 Claude models with specific context/output capabilities
- Cost model: zero-cost (subscription-based)
- Reasoning: all models marked as reasoning-capable

#### `src/resources/extensions/subagent/configured-model.ts`
- Per-subagent model configuration via `$budget_model` placeholder
- Allows agents to specify cheaper alternative models

#### `src/cli.ts` / `src/onboarding.ts`
- Initial model setup during onboarding
- Fallback to 128k context, 16k max tokens if not specified

---

## 7. Context Usage Reporting & Monitoring

### Core Files

#### `src/resources/extensions/shared/rtk-session-stats.ts`
- **Purpose:** Token savings tracking for RTK (runtime knowledge) gains
- **Data Structures:**
  - `RtkGainSummary` — aggregate session statistics (commands, tokens, time)
  - `RtkSessionSavings` — per-session delta from baseline
- **Functions:**
  - `readCurrentRtkGainSummary()` — query RTK binary for current savings
  - `ensureRtkSessionBaseline()` — establish baseline for session start
  - `getRtkSessionSavings()` — compute savings since baseline
  - `clearRtkSessionBaseline()` — remove session tracking
  - `formatRtkSavingsLabel()` — format savings for footer display
- **Caching:**
  - Baseline sessions stored in `rtk-session-baselines.json`
  - Max 200 baseline sessions, LRU-trimmed
  - 15-second cache TTL for in-flight baseline queries
- **Baseline Logic:**
  - If session counters decrease (RTK reset), treat as new session
  - Otherwise compute delta from baseline

#### `src/resources/extensions/slash-commands/context.ts`
- **Context Reporting Command:**
  - `/context` — display full breakdown
  - `/context full` — detailed tool sizes
- **Metrics Tracked:**
  - System prompt: total tokens + breakdown (skills, project context, footer)
  - Tools: active count, registered count, total tokens, top 5 largest
  - History: message count + estimated tokens
  - Model: context window, used/free tokens, usage percentage
  - Slash commands: extension, skill, prompt count
- **Display:**
  - Progress bar visualization
  - Percentage-based usage indicator
  - Truncated vs. full details toggle

---

## 8. Integration Points & Dependencies

### Extension-to-Extension Relationships

```
Shared Utils (format-utils.ts)
├── formatTokenCount() — used by:
│   ├── bg-shell footer display
│   ├── context command output
│   ├── rtk-session-stats labels
│   └── voice extension status
├── truncateWithEllipsis() — used by:
│   └── text truncation utilities
└── formatDuration() — used by:
    └── bg-shell uptime display

Search & Documentation APIs
├── tool-llm-context.ts (budgetContent)
├── tool-fetch-page.ts (truncateHead)
├── format.ts (snippetPerResult)
└── context7 index.ts (token budgeting)

Context Tracking
├── context.ts command (reads contextUsage from ctx)
├── bg-shell-lifecycle.ts (rebuilds state after compaction)
├── memory/index.ts (truncates index to fit context)
└── subagent/index.ts (isolated per-subagent contexts)

Model Configuration
├── configured-model.ts
├── models.ts (Claude definitions)
└── context.ts (displays window sizes)
```

---

## 9. Token Limits & Constants

### Hard Limits

| Component | Limit | Purpose |
|-----------|-------|---------|
| Memory MEMORY.md lines | 200 lines | Index size cap |
| Memory MEMORY.md bytes | 25,000 bytes | Index size cap (~6k tokens) |
| LLM Context results | 50 max entries | Cache size |
| LLM Context TTL | 10 minutes | Cache freshness |
| Page fetch cache | 30 entries | Cache size |
| Page fetch TTL | 15 minutes | Cache freshness |
| RTK baselines | 200 sessions | Store size |
| Subagent parallelism | 8 tasks | Concurrency limit |
| Subagent concurrency | 4 | Actual parallel execution |
| Subagent timeout | 120 seconds | Default await time |

### Soft Budgets

| Component | Budget | Safety Margin |
|-----------|--------|---------------|
| LLM Context (Tavily) | `maxTokens` param | 20% (0.8× effective) |
| Search results snippets | Adaptive per result | Decreases with result count |
| Page fetch truncation | `DEFAULT_MAX_BYTES` | Up to temp file fallback |

### Estimation Formulas

| Formula | Used For |
|---------|----------|
| `text.length / 4` | Quick token estimate (English) |
| `Buffer.byteLength() / 4` | UTF-8 aware token estimate |
| `Math.ceil(chars / 4)` | Conservative rounding |

---

## 10. File Dependency Graph

```
src/resources/extensions/
├── shared/
│   ├── format-utils.ts (token/duration formatting)
│   ├── rtk-session-stats.ts (uses formatTokenCount)
│   └── mod.ts (barrel exports formatTokenCount)
│
├── search-the-web/
│   ├── tool-llm-context.ts (budgetContent, estimateTokens)
│   ├── tool-fetch-page.ts (truncateHead, page extraction)
│   ├── format.ts (snippetPerResult, formatSearchResults)
│   └── tool-search.ts (uses formatSearchResults)
│
├── memory/
│   ├── index.ts (truncateEntrypointContent, context injection)
│   ├── auto-extract.ts (buildTranscriptSummary)
│   └── dream.ts (memory extraction workflow)
│
├── slash-commands/
│   └── context.ts (context window reporting)
│
├── context7/
│   └── index.ts (token budgeting for docs)
│
├── bg-shell/
│   └── bg-shell-lifecycle.ts (process state re-injection)
│
└── subagent/
    ├── configured-model.ts (model resolution)
    └── index.ts (context isolation, process spawning)
```

---

## Summary: System Architecture

**LSD's context budget system is distributed across these key areas:**

1. **Static Configuration** — Model context windows defined per provider/model
2. **Runtime Tracking** — Token estimation utilities for display and monitoring
3. **Adaptive Allocation** — Smart snippet budgets and content truncation
4. **Safety First** — Conservative margins, fallback chains, cache limits
5. **Context Injection** — Preserving state across compaction/tree navigation events
6. **Isolation** — Per-subagent contexts and model selection
7. **Monitoring** — Detailed `/context` command + footer widgets + RTK savings tracking

**No single "BudgetManager" class exists**, but instead, each subsystem (search, memory, documentation, background processes, subagents) implements its own budgeting strategy suited to its domain, coordinated via shared utilities and upstream library functions.
