# LSD Token Management & Context Budget Architecture

**Comprehensive mapping of context window usage, token counting, allocation, and safety mechanisms.**

---

## Executive Summary

LSD employs a **distributed token management model** across ~12+ independent subsystems rather than a single unified BudgetManager. Each extension and tool implements domain-specific context budgeting strategies with conservative safety margins (typically 20%), hard caps, and adaptive truncation.

**Key Principle:** Context allocation is *negotiated locally* by each subsystem based on its use case, with global safety mechanisms enforcing hard limits (200 lines, 25KB for memory; 10k tokens max for docs; output truncation to 50KB/2000 lines).

---

## 1. MODEL-SPECIFIC CONTEXT WINDOW DEFINITIONS

### File: `src/resources/extensions/claude-code-cli/models.ts`

**Three Claude models with fixed context and output limits:**

```typescript
export const CLAUDE_CODE_MODELS = [
  {
    id: "claude-opus-4-6",
    contextWindow: 1_000_000,      // 1M tokens
    maxTokens: 128_000,            // 128k output limit
  },
  {
    id: "claude-sonnet-4-6",
    contextWindow: 1_000_000,      // 1M tokens
    maxTokens: 64_000,             // 64k output limit
  },
  {
    id: "claude-haiku-4-5",
    contextWindow: 200_000,        // 200k tokens (smallest)
    maxTokens: 64_000,             // 64k output limit
  },
];
```

**Line numbers:** Lines 14-42  
**Key properties:** `contextWindow`, `maxTokens`  
**Usage:** Referenced by CLI to determine available context and output token budgets for each model.

---

## 2. TOKEN COUNTING & FORMATTING UTILITIES

### File: `src/resources/extensions/shared/format-utils.ts`

**Human-readable token count display:**

```typescript
export function formatTokenCount(count: number): string {
  if (count < 1000) return `${count}`;
  if (count < 1_000_000) return `${(count / 1000).toFixed(1)}k`;
  return `${(count / 1_000_000).toFixed(2)}M`;
}
```

**Line numbers:** Lines 23-28  
**Key function:** `formatTokenCount()`  
**Usage:** Displays token counts in logs, UI, and user messages across all extensions.

**Note:** Token counting logic itself relies on the core library `@gsd/pi-coding-agent`:
- `estimateTokens(text)` — rough estimate using `Math.ceil(text.length / 4)` chars-to-tokens ratio
- `truncateHead()` — truncate from beginning while respecting line/byte limits
- `truncateTail()` — truncate from end (for output buffering)

---

## 3. CONTEXT ALLOCATION & BUDGETING STRATEGIES

### 3.1 Search & Read Tool: `src/resources/extensions/search-the-web/tool-llm-context.ts`

**Client-side token budgeting with 80% conservative margin:**

```typescript
export function budgetContent(
  results: TavilyResult[],
  maxTokens: number,
  threshold: number,
): { grounding: LLMContextSnippet[]; sources: Record<string, LLMContextSource>; estimatedTokens: number } {
  // Use 80% of maxTokens as effective budget (conservative to avoid overshoot)
  const effectiveBudget = Math.floor(maxTokens * 0.8);
  const perResultBudget = Math.max(1, Math.floor(effectiveBudget / filtered.length));
  
  // Truncate per-result to stay within budget
  const maxChars = budget * 4;  // ~4 chars per token
  if (text.length > maxChars) {
    text = text.slice(0, maxChars);
  }
}
```

**Line numbers:**  
- Function definition: Lines 64–117
- 80% safety margin: Line 81
- Per-result budgeting: Lines 82–83
- Content truncation: Lines 101–104

**Key parameters:**
- `maxTokens` — caller-requested token limit (default 8192, configurable)
- `threshold` — minimum relevance score (0–1) for inclusion
- `estimatedTokens` — return value with total token usage

**Allocation strategy:**
1. Filter search results by relevance score threshold (strict/balanced/lenient)
2. Sort by score (highest relevance first)
3. Use 80% of maxTokens as effective budget
4. Distribute budget equally across filtered results
5. Truncate each result's content (chars → tokens at 4:1 ratio)
6. Stop when effective budget exhausted

### 3.2 Memory Extension: `src/resources/extensions/memory/index.ts`

**Hard caps on MEMORY.md context injection:**

```typescript
const MAX_ENTRYPOINT_LINES = 200;
const MAX_ENTRYPOINT_BYTES = 25_000;

function truncateEntrypointContent(raw: string): {
	content: string;
	wasTruncated: boolean;
} {
	// Cap 1: line count
	if (lines.length > MAX_ENTRYPOINT_LINES) {
		content = lines.slice(0, MAX_ENTRYPOINT_LINES).join('\n');
		wasTruncated = true;
	}

	// Cap 2: byte size
	if (Buffer.byteLength(content, 'utf-8') > MAX_ENTRYPOINT_BYTES) {
		// Walk backwards to find last newline within budget
		let cutoff = content.length;
		while (Buffer.byteLength(content.slice(0, cutoff), 'utf-8') > MAX_ENTRYPOINT_BYTES) {
			const idx = content.lastIndexOf('\n', cutoff - 1);
			cutoff = idx > 0 ? idx : 0;
		}
		content = content.slice(0, cutoff);
		wasTruncated = true;
	}

	if (wasTruncated) {
		content += '\n\n> WARNING: MEMORY.md is too large. Only part was loaded. Keep index entries concise.';
	}
}
```

**Line numbers:**
- Constants: Lines 24–25
- Truncation function: Lines 27–54
- Line count check: Lines 31–35
- Byte size check: Lines 37–47
- Warning footer: Lines 49–51

**Key details:**
- **Max lines:** 200 lines (prevents excessive history injection)
- **Max bytes:** 25,000 bytes (~6k tokens at 4:1 ratio)
- **Dual truncation:** Line limit first, then byte limit
- **Warning:** Added to content if truncated, alerting the agent that memory was trimmed

### 3.3 Context7 Docs: `src/resources/extensions/context7/index.ts`

**Configurable token budgets with 5k-10k range:**

```typescript
export default function (pi: ExtensionAPI) {
  pi.registerTool({
    name: "get_library_docs",
    parameters: Type.Object({
      libraryId: Type.String({}),
      query: Type.Optional(Type.String({})),
      tokens: Type.Optional(
        Type.Number({
          minimum: 500,
          maximum: 10000,
          default: 5000,  // Default to 5k tokens
          description: "Max tokens of documentation to return (default 5000, max 10000).",
        })
      ),
    }),
    
    async execute(_toolCallId, params, signal, _onUpdate, _ctx) {
      const tokens = Math.min(Math.max(params.tokens ?? 5000, 500), 10000);
      // ...
      // Truncation guard — Context7 already respects token budget
      const truncation = truncateHead(rawText, {
        maxLines: DEFAULT_MAX_LINES,
        maxBytes: DEFAULT_MAX_BYTES,
      });
    }
  });
}
```

**Line numbers:**
- Token parameter definition: Lines 154–163
- Token clamping: Line 187 (`Math.min(Math.max(...))`)
- Truncation guard: Lines 232–236

**Budget ranges:**
- **Default:** 5,000 tokens
- **Minimum:** 500 tokens
- **Maximum:** 10,000 tokens

### 3.4 Search Result Formatting: `src/resources/extensions/search-the-web/format.ts`

**Adaptive snippet budgets based on result count:**

```typescript
function snippetsPerResult(resultCount: number): number {
  if (resultCount <= 2) return 5;   // show all available
  if (resultCount <= 4) return 3;
  if (resultCount <= 6) return 2;
  if (resultCount <= 8) return 1;
  return 0; // 9-10 results: descriptions only
}
```

**Line numbers:** Lines 14–22

**Allocation strategy:**
- **1–2 results:** Up to 5 snippets each (comprehensive)
- **3–4 results:** Up to 3 snippets each
- **5–6 results:** Up to 2 snippets each
- **7–8 results:** Up to 1 snippet each
- **9–10 results:** Descriptions only, no extra snippets

**Rationale:** Keeps total output roughly constant regardless of result count, preventing context overflow on many-result queries.

---

## 4. TRUNCATION & PRIORITIZATION LOGIC

### 4.1 Core Truncation Functions (from `@gsd/pi-coding-agent`)

Used throughout LSD:
- `truncateHead(text, { maxLines, maxBytes })` — preserve beginning, trim end
- `truncateTail(text, { maxLines, maxBytes })` — preserve end, trim beginning (for logs)
- `DEFAULT_MAX_LINES = 2000` — hard cap on output lines
- `DEFAULT_MAX_BYTES = 50_000` — hard cap on output bytes (50KB)

**Impact locations:**
- Search result display: Truncated to display limits
- Page content extraction: Truncated before returning to agent
- Documentation: Truncated guard in Context7
- Browser tools output: Truncated to 50KB/2000 lines

### 4.2 Search Result Truncation: `src/resources/extensions/search-the-web/tool-llm-context.ts`

```typescript
// Truncation guard — show full content, then add notice if truncated
const truncation = truncateHead(output, { maxLines: DEFAULT_MAX_LINES, maxBytes: DEFAULT_MAX_BYTES });
let content = truncation.content;
if (truncation.truncated) {
  const tempFile = await (pi as any).writeTempFile(output, { prefix: "llm-context-" });
  content += `\n\n[Truncated. Full content: ${tempFile}]`;
}
```

**Line numbers:** Lines 281–289, 378–385

**Strategy:**
1. Format full output (no truncation yet)
2. Truncate to safe limits
3. If truncated, save full content to temp file and provide reference link
4. Agent can access full content via temp file if needed

### 4.3 Memory Prioritization: `src/resources/extensions/memory/index.ts`

**Before-agent-start injection (line 74–86):**
```typescript
pi.on('before_agent_start', async (event) => {
  if (!memoryCwd) return;

  const entrypoint = getMemoryEntrypoint(memoryCwd);
  let entrypointContent = '';
  try {
    entrypointContent = readFileSync(entrypoint, 'utf-8');
  } catch {
    // File may have been deleted between session_start and now
  }

  if (entrypointContent.trim()) {
    const { content } = truncateEntrypointContent(entrypointContent);
    entrypointContent = content;
  }

  const prompt = buildMemoryPrompt(memoryDir, entrypointContent);

  return {
    systemPrompt: event.systemPrompt + '\n\n' + prompt,
  };
});
```

**Priority:** Memory is injected into system prompt BEFORE agent starts, ensuring:
1. Memory is *always available* to the agent
2. Truncated MEMORY.md takes precedence over other system prompt sections if space is tight
3. Full memory dir is accessible for dynamic lookups during the turn

---

## 5. CONTEXT WINDOW MANAGEMENT: PER-MODEL CONFIGURATION

### File: `src/resources/extensions/claude-code-cli/models.ts`

**Model definitions with context + output limits:**

| Model | Context Window | Max Output | Use Case |
|-------|---|---|---|
| Claude Opus 4.6 | 1M tokens | 128k tokens | Complex, long-context tasks |
| Claude Sonnet 4.6 | 1M tokens | 64k tokens | Balanced speed/capability |
| Claude Haiku 4.5 | 200k tokens | 64k tokens | Budget-constrained scouts |

**Additional configuration locations:**
- `src/cli.ts` line 397–398: Displays context/max token info in CLI help
- Tests validate model definitions: `src/tests/extension-model-validation.test.ts` line 31–32

### Subagent Model Resolution: `src/resources/extensions/subagent/configured-model.ts`

Subagents can use a **dedicated budget model** (`$budget_model`) that is cheaper/faster than the main model for reconnaissance tasks. Configuration:
- `src/onboarding.ts` line 268–270: Prompts user to choose budget model
- `src/onboarding.ts` line 331: Confirms budget model selection

**Purpose:** Allows parallel scouts to run on lightweight models (e.g., Haiku) while main agent uses full capability (e.g., Opus or Sonnet).

---

## 6. WARNINGS & ADAPTIVE BEHAVIOR: SAFETY MECHANISMS

### 6.1 Memory Truncation Warning: `src/resources/extensions/memory/index.ts`

```typescript
if (wasTruncated) {
  content +=
    '\n\n> WARNING: MEMORY.md is too large. Only part was loaded. Keep index entries concise.';
}
```

**Line numbers:** Lines 49–51

**When triggered:** MEMORY.md exceeds 200 lines OR 25KB  
**Effect:** Warning footer appended to MEMORY.md content, visible to agent  
**Mitigation:** Agent can respond by archiving or consolidating old memories

### 6.2 Context7 Truncation Notice: `src/resources/extensions/context7/index.ts`

```typescript
if (truncation.truncated) {
  finalText +=
    `\n\n[Truncated: showing ${truncation.outputLines}/${truncation.totalLines} lines` +
    ` (${formatSize(truncation.outputBytes)} of ${formatSize(truncation.totalBytes)}).` +
    ` Use a more specific query to reduce output size.]`;
}
```

**Line numbers:** Lines 233–237

**When triggered:** Doc content exceeds 2000 lines or 50KB  
**Effect:** Truncation notice with line/byte counts appended  
**Mitigation:** User can refine query (`tokens=` parameter) for more focused results

### 6.3 Search Budget Guard: `src/resources/extensions/search-the-web/index.ts`

**Per-session search limit prevents loop guards:**
- Max 15 unique searches per session (prevents infinite search loops)
- `errorKind: "budget_exhausted"` on 16th unique query
- Session-scoped: Resets on new session

**Related test:** `src/tests/search-loop-guard.test.ts` lines 268–300

### 6.4 Memory Auto-Dream: Consolidation & Archival

**Lines 100–108 (turn_end hook):**
```typescript
pi.on('turn_end', async (_event, ctx) => {
  if (!memoryCwd) return;
  const result = maybeStartAutoDream(ctx);
  if (result.started) {
    pi.sendMessage({
      customType: 'memory:auto-dream',
      content: result.message,
      display: true,
    });
  }
});
```

**Purpose:** Periodically consolidates memories to prevent MEMORY.md from growing unbounded.  
**Triggers:** Based on thresholds (time elapsed, session count).  
**Mechanism:** Spawns background consolidation worker that merges memories, archives old ones.

### 6.5 Context7 Rate Limiting & Auth

**Line 200–210:**
```typescript
pi.on("session_start", async (_event, ctx) => {
  if (!getApiKey()) {
    ctx.ui.notify(
      "Context7: No CONTEXT7_API_KEY set. Using free tier (1000 req/month limit). " +
      "Set CONTEXT7_API_KEY for higher limits.",
      "warning",
    );
  }
});
```

**Safety:** Warns users of rate-limit exposure without API key.

---

## 7. CONTEXT USAGE REPORTING & VISUALIZATION

### File: `src/resources/extensions/slash-commands/context.ts`

**`/context` command provides comprehensive usage breakdown:**

```typescript
export default function contextCommand(pi: ExtensionAPI) {
  pi.registerCommand("context", {
    description: "Show current context window usage and breakdown",
    async handler(args: string, ctx: ExtensionCommandContext) {
      // Gather data
      const systemPrompt = ctx.getSystemPrompt();
      const contextUsage = ctx.getContextUsage();
      const model = ctx.model;
      
      // Compute breakdowns
      const systemPromptTokens = estimateTextTokens(systemPrompt);
      const activeToolsTokens = Math.ceil(activeSchemaBytes / 4);
      const historyTokens = /* sum of message tokens */;
      
      // Calculate free space
      const windowSize = model?.contextWindow ?? null;
      const freeTokens = windowSize !== null ? windowSize - effectiveUsedTokens : null;
      const effectivePercent = (effectiveUsedTokens / windowSize) * 100;
      
      // Render usage bar
      const barWidth = 20;
      const filledCount = Math.round((effectivePercent / 100) * barWidth);
      const bar = "█".repeat(filledCount) + "░".repeat(emptyCount);
    }
  });
}
```

**Line numbers:** Lines 1–180 (full command)

**Sections reported:**

1. **Context Window** (lines 88–100)
   - Model name
   - Total window size
   - Used tokens
   - Free tokens
   - Visual progress bar (█░░░░░░░░░░░░░░░░░░)
   - Percent used

2. **System Prompt** (lines 103–113)
   - Character count
   - Est. tokens
   - Base + other tokens
   - Skills context breakdown
   - Project context file count
   - Footer tokens

3. **Tools** (lines 115–125)
   - Active count
   - Registered count
   - Schema byte counts
   - Est. tokens
   - Largest 5 active tools by token size

4. **Slash Commands** (line 127)
   - Extension commands count
   - Skill commands count
   - Prompt commands count

5. **Messages** (lines 129–133)
   - User message count
   - Assistant message count
   - Tool message count
   - History token estimate
   - LLM-reported token totals (input, output, cache-read, cache-write)

6. **Full Breakdown** (`/context full`, lines 135–180)
   - Per-tool token allocation (sorted by size)
   - Per-skill token allocation (sorted by size)

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
  Base + other:    ~2,100 tok
  Skills Context:  15 listed · ~980 tok
  Project Context: 2 files · ~40 tok
```

---

## 8. BACKGROUND PROCESS STATE INJECTION: CONTEXT RECOVERY

### File: `src/resources/extensions/bg-shell/bg-shell-lifecycle.ts`

**Compaction awareness: Rebuilds process state after context resets:**

```typescript
function buildProcessStateAlert(reason: string): void {
  const alive = Array.from(processes.values()).filter(p => p.alive);
  if (alive.length === 0) return;

  const processSummaries = alive.map(p => {
    const portInfo = p.ports.length > 0 ? ` :${p.ports.join(",")}` : "";
    const urlInfo = p.urls.length > 0 ? ` ${p.urls[0]}` : "";
    const errInfo = p.recentErrors.length > 0 ? ` (${p.recentErrors.length} errors)` : "";
    const groupInfo = p.group ? ` [${p.group}]` : "";
    return `  - id:${p.id} "${p.label}" [${p.processType}] status:${p.status} uptime:${formatUptime(...)}${portInfo}${urlInfo}${errInfo}${groupInfo}`;
  }).join("\n");

  pendingAlerts.push(
    `${reason} ${alive.length} background process(es) are still running:\n${processSummaries}\nUse bg_shell digest/output/kill with these IDs.`
  );
}

// Hook into context resets
pi.on("session_compact", async () => {
  buildProcessStateAlert("Context was compacted.");
});

pi.on("before_agent_start", async (_event, _ctx) => {
  // Inject process status overview and any pending alerts
  const alerts = pendingAlerts.splice(0);
  // ... injects into systemPrompt
});
```

**Line numbers:**
- Build alert: Lines 41–57
- Compact hook: Lines 61–63
- Before-agent hook: Lines 68–72

**Purpose:** When context is compacted (truncated), the agent loses memory of running processes. This hook:
1. Detects context compaction/tree navigation/session switch
2. Captures status of all alive processes
3. Queues alerts for next agent turn
4. Injects full process state into system prompt

**Effect:** Agent remains aware of background servers even after context reset.

---

## 9. RTK TOKEN SAVINGS TRACKING: `src/resources/extensions/shared/rtk-session-stats.ts`

**Aggregates token savings from RTK (Rust Token Kit) compiler caching:**

```typescript
export interface RtkGainSummary {
  totalCommands: number;
  totalInput: number;
  totalOutput: number;
  totalSaved: number;
  avgSavingsPct: number;
  totalTimeMs: number;
  avgTimeMs: number;
}

export function readCurrentRtkGainSummary(env: NodeJS.ProcessEnv = process.env): RtkGainSummary | null {
  // Spawn rtk binary, get gain summary, cache result for 15s
  const binaryPath = resolveRtkBinaryPath({ env });
  
  // Cache with 15s TTL to avoid excessive spawning
  if (
    cachedSummary &&
    cachedSummary.binaryPath === binaryPath &&
    Date.now() - cachedSummary.at < CURRENT_SUMMARY_TTL_MS  // 15s
  ) {
    return cachedSummary.summary;
  }
  
  const result = spawnSync(binaryPath, ["gain", "--all", "--format", "json"], {
    timeout: CURRENT_SUMMARY_TIMEOUT_MS,  // 5s timeout
  });
}

export function formatRtkSavingsLabel(savings: RtkSessionSavings | null | undefined): string | null {
  if (!savings) return null;
  if (savings.commands <= 0) return "rtk: waiting for shell usage";
  if (savings.inputTokens <= 0 && savings.outputTokens <= 0) {
    return `rtk: active (${savings.commands} cmd${savings.commands === 1 ? "" : "s"})`;
  }
  return `rtk: ${formatTokenCount(savings.savedTokens)} saved (${Math.round(savings.savingsPct)}%)`;
}
```

**Line numbers:**
- Type definitions: Lines 16–28
- Summary reader: Lines 60–100
- Formatting: Lines 248–255

**Cache strategy:**
- **TTL:** 15,000 ms (15 seconds)
- **Timeout:** 5,000 ms (spawning RTK binary)
- **Cache key:** Binary path (changes invalidate cache)

**Display:** Shows cumulative token savings as `rtk: 2.5k saved (15%)` in session stats.

---

## 10. SUBAGENT CONTEXT ISOLATION: `src/resources/extensions/subagent/index.ts`

**Each subagent gets isolated context window:**

```typescript
const MAX_PARALLEL_TASKS = 8;
const MAX_CONCURRENCY = 4;
const DEFAULT_AWAIT_SUBAGENT_TIMEOUT_SECONDS = 120;

/**
 * Subagent Tool - Delegate tasks to specialized agents
 *
 * Spawns a separate `pi` process for each subagent invocation,
 * giving it an isolated context window.
 *
 * Supports three modes:
 *   - Single: { agent: "name", task: "..." }
 *   - Parallel: { tasks: [{ agent: "name", task: "..." }, ...] }
 *   - Chain: { chain: [{ agent: "name", task: "... {previous} ..." }, ...] }
 */
```

**Line numbers:** Lines 1–55 (overview)

**Key constraints:**
- **MAX_PARALLEL_TASKS:** 8 concurrent subagent tasks max
- **MAX_CONCURRENCY:** 4 concurrent tasks (internal execution concurrency)
- **TIMEOUT:** 120 seconds default (configurable per call)

**Context isolation mechanism:**
1. Each subagent spawns in separate `pi` process
2. Parent session state NOT passed to child (clean slate)
3. Subagent has full context window for its task
4. Output captured as structured JSON (or text)
5. Results returned to parent via tool result

**Models:**
- Subagents can use cheaper models (e.g., Haiku for scouts)
- Configured via `$budget_model` placeholder
- Resolved at launch time via `resolveSubagentModel()`

**Session linking:** `src/resources/extensions/subagent/index.ts` lines 70–90
```typescript
interface AgentSessionLink {
  id: string;
  agentName: string;
  task: string;
  parentSessionFile: string;
  subagentSessionFile: string;
  createdAt: number;
  updatedAt: number;
  state: AgentSessionState;
}
```

Maintains parent-child session relationships so subagent context can be audited.

---

## 11. CACHING STRATEGIES: AVOID REDUNDANT API CALLS

### 11.1 Search Result Cache: `src/resources/extensions/search-the-web/tool-llm-context.ts`

```typescript
// LLM Context cache: max 50 entries, 10-minute TTL
const contextCache = new LRUTTLCache<CachedLLMContext>({ max: 50, ttlMs: 600_000 });
contextCache.startPurgeInterval(60_000);

const cacheKey = normalizeQuery(params.query) + `|t:${maxTokens}|u:${maxUrls}|th:${threshold}|c:${count}|p:${provider}`;
const cached = contextCache.get(cacheKey);

if (cached) {
  // Return from cache without API call
  return {
    content: [{ type: "text", text: content }],
    details: { ..., cached: true },
  };
}
```

**Line numbers:** Lines 56–59, 223–234

**Cache properties:**
- **Max entries:** 50 (LRU eviction when full)
- **TTL:** 600,000 ms (10 minutes)
- **Purge interval:** 60,000 ms (1 minute cleanup)
- **Cache key:** Includes query, tokens, URLs, threshold, provider

**Hit reporting:** Details include `cached: true` flag.

### 11.2 Context7 Docs Cache: `src/resources/extensions/context7/index.ts`

```typescript
const searchCache = new Map<string, C7Library[]>();
const docCache = new Map<string, string>();

// Search cache hit
if (searchCache.has(cacheKey)) {
  const cached = searchCache.get(cacheKey)!;
  return {
    content: [{ type: "text", text: formatLibraryList(cached, ...) }],
    details: { ..., cached: true },
  };
}

// Doc cache hit
if (docCache.has(cacheKey)) {
  const cached = docCache.get(cacheKey)!;
  return {
    content: [{ type: "text", text: cached }],
    details: { ..., cached: true },
  };
}
```

**Line numbers:**
- Search cache: Lines 71–82
- Doc cache: Lines 207–217

**Cache properties:**
- **Type:** Simple Map (session-scoped)
- **TTL:** None (lifetime of session)
- **Eviction:** Cleared on `session_shutdown` (line 283)

**Cache keys:**
- Search: `libraryName.toLowerCase().trim()`
- Docs: `${libraryId}::${query ?? ""}::${tokens}`

---

## 12. SUMMARY TABLE: ALLOCATIONS & LIMITS

| System | Max Lines | Max Bytes | Max Tokens | Margin | Hard Cap | Notes |
|--------|-----------|-----------|-----------|--------|----------|-------|
| MEMORY.md | 200 | 25k | ~6k | N/A | Yes | Injected at before_agent_start |
| Context7 docs | 2000 | 50k | 500–10k | N/A | Yes | User-configurable, default 5k |
| Search results | 2000 | 50k | ~8k | 80% | Yes | Per-result truncation, 80% effective budget |
| Search snippets | Adaptive | N/A | N/A | N/A | Soft | 5→0 snippets based on result count |
| Output (any tool) | 2000 | 50k | ~12.5k | N/A | Yes | Applied via truncateHead() |
| Message history | N/A | N/A | N/A | N/A | No | Grows until context compacted |
| System prompt | N/A | N/A | ~3–5k | N/A | No | Grows with skills, memory, project context |
| Tools schema | N/A | N/A | 100–500 | N/A | No | Per-tool, totals ~3–10k active |

---

## 13. ARCHITECTURE DIAGRAM

```
┌─────────────────────────────────────────────────────────────────┐
│                    MODEL (contextWindow, maxTokens)              │
│              Opus/Sonnet: 1M tokens, Haiku: 200k tokens          │
└──────────────────────────┬──────────────────────────────────────┘
                           │
                    ┌──────▼────────┐
                    │   PI Agent    │
                    │   (Main)      │
                    └──────┬────────┘
                           │
        ┌──────────────────┼──────────────────────────┐
        │                  │                          │
        ▼                  ▼                          ▼
    ┌─────────┐      ┌──────────┐           ┌────────────────┐
    │ Memory  │      │ Tools    │           │   Context7     │
    │ Extension│     │ (active) │           │   (Docs, Search)
    │         │      │          │           │                │
    │ MAX:    │      │ 100–500  │           │ Default: 5k    │
    │ 200 ln  │      │ tok/tool │           │ tokens         │
    │ 25KB    │      │          │           │ Max: 10k       │
    └─────────┘      └──────────┘           └────────────────┘
        │                  │
        └──────────────────┼─────────────────────────┐
                           │                         │
              ┌────────────▼────────────┐            │
              │ System Prompt Context   │            │
              │ (~3–5k tokens total)    │            │
              │                         │            │
              │ - Base instructions     │            │
              │ - Skills metadata       │            │
              │ - Memory (MEMORY.md)    │            │
              │ - Project context       │            │
              │ - Date/footer           │            │
              └─────────────────────────┘            │
                                                     │
              ┌──────────────────────────────────────┴──────┐
              │                                             │
        ┌─────▼─────┐      ┌──────────┐      ┌─────────────▼─┐
        │ Message    │      │ Search   │      │ Subagents     │
        │ History    │      │ Budget   │      │ (Isolated)    │
        │            │      │          │      │               │
        │ Grows      │      │ 15 uniq  │      │ MAX: 8 parallel
        │ until      │      │ searches │      │ per session    │
        │ compact    │      │ per      │      │               │
        │            │      │ session  │      │ Each has own   │
        │            │      │          │      │ context window │
        └────────────┘      └──────────┘      └───────────────┘

    ▲ = allocate or inject
    │ = competition for context space
```

---

## 14. KEY FINDINGS: DISTRIBUTED BUDGET STRATEGY

### No Single BudgetManager
LSD does **not** have a centralized budget allocator. Instead:
- Each extension negotiates its own slice of context
- Safety margins are local (80% for search, 200 lines for memory, etc.)
- Hard caps (2000 lines, 50KB output) prevent overflow
- Global `/context` command provides visibility

### Conservative Margins Build Up
- Search: 80% effective budget (20% reserve)
- Memory: Dual truncation (lines, then bytes)
- Docs: Configurable but capped at 10k tokens
- Output: Hard 2000-line, 50KB limit

### Multi-Layer Truncation
1. **Per-source truncation:** Search results truncated per-snippet
2. **Total output truncation:** All results truncated together
3. **Temp file overflow:** If still too big, save to temp file + reference link

### Cache-Driven Token Savings
- Search results: 10-minute LRU cache (max 50 entries)
- Context7 docs: Session-long cache (cleared on shutdown)
- RTK gains: 15-second cache (avoids binary spawning)

### Context Recovery After Resets
- Memory: Full state preserved in memory files
- Bg-shell: Process state re-injected after compaction
- Subagents: Session links track parent-child relationships

---

## 15. OPTIMIZATION RECOMMENDATIONS

1. **Unified Token Meter:** Add a `TokenMeter` class that wraps all allocations
   - Track cumulative usage across all subsystems
   - Prevent overshoots before they happen
   - File: `src/resources/extensions/shared/token-meter.ts` (new)

2. **Adaptive Safety Margins:** Adjust margins based on remaining capacity
   - 80% → 90% margin if under 20% free
   - File: Extend `budgetContent()` in `tool-llm-context.ts`

3. **Truncation Feedback:** Log when content is truncated, with reason + size
   - Help users understand where context is going
   - File: `src/resources/extensions/slash-commands/context.ts` (extend `/context full`)

4. **Memory Aging:** Archive memories older than N days to prevent bloat
   - Already partially implemented (auto-dream)
   - File: `src/resources/extensions/memory/dream.js` (enhance)

5. **Subagent Context Isolation Limits:** Cap subagent budgets per type
   - Scouts get 50k max context (faster, cheaper)
   - Workers get full context (but run serially)
   - File: `src/resources/extensions/subagent/launch-helpers.ts` (new)

---

## Conclusion

LSD's token management is **intentionally distributed**: each subsystem owns its context budget, applies conservative margins, and reports usage via `/context`. This prevents single points of failure and allows for domain-specific optimization (e.g., snippet budgets for search, LRU caching for docs, line limits for memory).

The safety mechanisms (20–80% margins, hard caps, temp file overflow) work together to keep context under control, even when multiple subsystems compete for space.

**Key insight:** Token management in LSD is not about *preventing* overflow—it's about *controlling* it gracefully through cascading truncation, caching, and visibility.
