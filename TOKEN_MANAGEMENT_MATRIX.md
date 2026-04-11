# Token Management: Component Matrix & Data Flow

**Visual mapping of how context allocation flows through LSD extensions.**

---

## 1. COMPONENT INTERACTION MATRIX

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    CONTEXT BUDGET ALLOCATION FLOW                           │
└─────────────────────────────────────────────────────────────────────────────┘

                    ┌──────────────────────────────────┐
                    │   Model Definition               │
                    │  (contextWindow, maxTokens)      │
                    │                                  │
                    │  - Opus: 1M ctxt, 128k max out  │
                    │  - Sonnet: 1M ctxt, 64k max out │
                    │  - Haiku: 200k ctxt, 64k max out│
                    └────────────────┬─────────────────┘
                                     │
                    ┌────────────────▼─────────────────┐
                    │  System Prompt Context           │
                    │  (~8-10k tokens total)           │
                    │                                  │
                    │  ├─ Base instructions (2.1k)     │
                    │  ├─ Skills metadata (1.0k)       │
                    │  ├─ Project context (0.4k)       │
                    │  ├─ Memory: MEMORY.md (6k max)   │
                    │  └─ Date/footer (0.1k)           │
                    └────────────────┬─────────────────┘
                                     │
         ┌───────────────────────────┼───────────────────────────┐
         │                           │                           │
    ┌────▼────┐             ┌────────▼────────┐           ┌──────▼──────┐
    │  Tools  │             │  Message        │           │  Subagents  │
    │ Schemas │             │  History        │           │ (isolated)  │
    │         │             │                 │           │             │
    │ ~3.5k   │             │ 70k–200k        │           │ Each:       │
    │ tokens  │             │ (grows until    │           │ 50k–1M      │
    │ (active)│             │  compacted)     │           │ context     │
    └────┬────┘             └────────┬────────┘           └──────┬──────┘
         │                           │                          │
         └──────────────────┬────────┴──────────────────────────┘
                            │
                    ┌───────▼────────────┐
                    │  TOTAL BUDGET      │
                    │  Used: 100k–350k   │
                    │  Free: 650k–900k   │
                    └────────────────────┘
```

---

## 2. ALLOCATION BY SUBSYSTEM

### Subsystem Layout

```
MEMORY EXTENSION
├─ Input: User-provided notes/prompts
├─ Storage: ~/.lsd/memory/<project>/
├─ Injection: before_agent_start event
├─ Limits: 200 lines + 25KB
├─ Warning: "MEMORY.md too large" footer
└─ Recovery: Full state preserved in files

SEARCH-THE-WEB
├─ Input: User query string
├─ API: Brave, Tavily, or Ollama
├─ Caching: 10-minute LRU (50 entries max)
├─ Allocation: budgetContent() with 80% margin
├─ Truncation: Per-result + total output
├─ Snippets: Adaptive (5→0 based on count)
└─ Budget Guard: 15 unique queries/session

CONTEXT7 (DOCS)
├─ Input: Library name + optional topic
├─ API: context7.com/api/v2
├─ Caching: Session-long (cleared on shutdown)
├─ Default Budget: 5,000 tokens
├─ Max Budget: 10,000 tokens
├─ Truncation: 2000 lines + 50KB guard
└─ Auth: Optional CONTEXT7_API_KEY

BROWSER-TOOLS
├─ Input: Navigation, clicks, screenshots
├─ Output: HTML source, screenshots, accessibility trees
├─ Truncation: 50KB / 2000 lines (via truncateHead)
├─ Temp Files: Overflow to disk if too large
└─ Caching: None (stateful, interactive)

BG-SHELL
├─ Input: Background process management
├─ State: Alive process list + status
├─ Injection: before_agent_start (after compact)
├─ Recovery: Process state alerts queue
└─ Tracking: Detailed status summary per process

SUBAGENT
├─ Input: Task + agent name
├─ Isolation: Separate pi process (clean slate)
├─ Models: Can use cheap model ($budget_model)
├─ Concurrency: 8 parallel tasks max
├─ Output: Captured as structured JSON
└─ Linking: Parent-child session relationships

SLASH-COMMANDS (/context)
├─ Input: User runs /context [full]
├─ Output: Usage breakdown (basic or detailed)
├─ Metrics: Lines, bytes, tokens per component
├─ Visualization: Progress bar (█░ format)
└─ Cache Info: Cached vs fresh tool results
```

---

## 3. TOKEN FLOW DIAGRAM

```
User Input
    │
    ▼
┌──────────────────────────┐
│ Agent Turn Begins        │
│ - Load system prompt     │
│ - Inject memory          │
│ - List active tools      │
│ - Fetch message history  │
└────────────┬─────────────┘
             │
             ▼
┌──────────────────────────┐
│ Agent Responds           │
│ - Calls tool(s)          │
└────────────┬─────────────┘
             │
    ┌────────┴────────┬─────────────┬──────────────┐
    │                 │             │              │
    ▼                 ▼             ▼              ▼
┌─────────┐    ┌────────────┐  ┌─────────┐  ┌──────────┐
│  Search │    │ Context7   │  │ Memory  │  │ Browser  │
│  Query  │    │   Lookup   │  │ Save    │  │  Action  │
└────┬────┘    └─────┬──────┘  └────┬────┘  └────┬─────┘
     │               │              │            │
     ▼               ▼              ▼            ▼
┌──────────────┐ ┌─────────┐   ┌─────────┐  ┌────────┐
│ Cache Hit?   │ │ Cache   │   │ Write   │  │ Snap   │
│ (80% budget) │ │ Hit?    │   │ to file │  │ shot   │
└──┬─────┬─────┘ └────┬────┘   └────┬────┘  └───┬────┘
   │yes  │no         │ yes/no       │ file      │
   │     │           │              │          │
   └─┬───┴───┐       │              │          │
     │       │       │              │          │
     ▼       ▼       ▼              ▼          ▼
  ┌────────────────────────────────────────────┐
  │ Tool Result Buffering                      │
  │ - Estimate tokens                          │
  │ - Apply truncation (2000 lines / 50KB)     │
  │ - Cache if applicable                      │
  │ - Return with "truncated" flag if needed   │
  └────────────┬─────────────────────────────┘
               │
               ▼
         ┌──────────────┐
         │ Agent Sees   │
         │ Result       │
         │ (safe size)  │
         └──────┬───────┘
                │
         ┌──────▼─────────────────┐
         │ Agent Continues        │
         │ - May call more tools  │
         │ - Or formulate response│
         │ - Uses /context to     │
         │   check capacity       │
         └──────┬─────────────────┘
                │
                ▼
         ┌──────────────┐
         │ Turn Ends    │
         │ Message      │
         │ saved to     │
         │ history      │
         └──────────────┘
                │
                ▼
         ┌──────────────────────────┐
         │ on(turn_end) Hooks       │
         │ - Memory auto-dream?     │
         │ - RTK gains update?      │
         │ - Cleanup subagents?     │
         └──────────────────────────┘
```

---

## 4. MEMORY LIFECYCLE

```
Session Startup
    │
    ▼
┌─────────────────────────────────┐
│ session_start Event             │
│ - Create ~/.lsd/memory/<proj>/  │
│ - Create MEMORY.md if missing   │
└────────────┬────────────────────┘
             │
             ▼
    ┌────────────────────┐
    │ Each Agent Turn:   │
    │ before_agent_start │
    │ Event              │
    └────────┬───────────┘
             │
    ┌────────▼──────────────────┐
    │ Load MEMORY.md            │
    │ Truncate: 200 lines (first)
    │ Truncate: 25KB (then)     │
    │ Add warning if truncated  │
    └────────┬──────────────────┘
             │
             ▼
    ┌────────────────────────────┐
    │ Build Memory Prompt        │
    │ - Add to system prompt     │
    │ - Inject before agent call │
    └────────┬───────────────────┘
             │
             ▼
    ┌────────────────────┐
    │ Agent Runs         │
    │ - Can read memory  │
    │ - Can use /remember
    │ - Can use /forget  │
    │ - Can use /dream   │
    └────────┬───────────┘
             │
             ▼
    ┌────────────────────────┐
    │ turn_end Event         │
    │ - Check auto-dream     │
    │ - Maybe start worker   │
    └────────┬───────────────┘
             │
             ▼
    ┌────────────────────────┐
    │ session_shutdown       │
    │ - Fire-and-forget      │
    │   auto-extract worker  │
    │ - Consolidates memories│
    └────────────────────────┘

[Auto-Dream Process]
    ├─ Triggered: If thresholds met
    │  (time elapsed, session count)
    │
    ├─ Runs: Background worker process
    │  env: LSD_MEMORY_DREAM=1
    │
    ├─ Reads: All memory files
    │
    ├─ Actions:
    │  - Merge related memories
    │  - Archive old memories
    │  - Update MEMORY.md pointers
    │
    └─ Result: Smaller MEMORY.md
       (fits in context better)
```

---

## 5. CONTEXT COMPACTION FLOW

```
Agent Context Becomes Tight (>90% used)
    │
    ▼
User Requests Compaction (/compact, tree nav, etc.)
    │
    ▼
┌────────────────────────────────┐
│ session_compact Event          │
│ (or session_tree, session_switch)
└────────┬──────────────────────┘
         │
         ▼
┌────────────────────────────────┐
│ LLM Loses All Context          │
│ (history trimmed, state reset) │
└────────┬──────────────────────┘
         │
         ▼
┌────────────────────────────────┐
│ Affected Extensions Alert      │
│                                │
│ ├─ bg-shell: "N processes      │
│ │   still running"              │
│ │                               │
│ ├─ subagent: "N subagents      │
│ │   in flight"                  │
│ │                               │
│ └─ memory: "(preserved in       │
│    files, will reload)"         │
└────────┬──────────────────────┘
         │
         ▼
┌────────────────────────────────┐
│ before_agent_start Event       │
│                                │
│ ├─ Inject queued alerts        │
│ ├─ Reload MEMORY.md            │
│ ├─ Rebuild process state list  │
│ └─ Restore bg-shell status     │
└────────┬──────────────────────┘
         │
         ▼
┌────────────────────────────────┐
│ Next Agent Turn Begins         │
│ (With restored state)          │
└────────────────────────────────┘
```

---

## 6. TRUNCATION DECISION TREE

```
Tool produces output (text)
    │
    ▼
Size check:
├─ Lines > 2000? ─────────────────┐
├─ Bytes > 50KB? ─────────────────┤─────────┐
└─ No ────────────────────────────┘         │
                                            │
                                    ┌───────▼──────┐
                                    │ Truncate     │
                                    │ (keep start) │
                                    └───────┬──────┘
                                            │
                                    ┌───────▼──────┐
                                    │ Add notice:  │
                                    │ "Truncated   │
                                    │  X/Y lines"  │
                                    └───────┬──────┘
                                            │
                                    ┌───────▼──────────────────┐
                                    │ Still > limits?          │
                                    │ (edge case)              │
                                    └───────┬──────┬───────────┘
                                            │      │
                                   ┌────────▼──┐ ┌─▼────────────┐
                                   │ Return    │ │ Save to temp │
                                   │ as-is     │ │ file + link  │
                                   └───────────┘ └──────────────┘

Special Cases:
- Search: Also checks token budget (80% margin)
- Memory: Also checks line/byte caps (200/25k)
- Docs: Also checks configured token limit
```

---

## 7. CACHING HIT RATE IMPACT

```
Search Query Execution
    │
    ▼
Normalize query + build cache key
    │
    ├─────────────────────────────────┐
    │                                 │
┌───▼────┐                     ┌──────▼────┐
│ Cache  │                     │ Not in    │
│ Hit?   │                     │ cache     │
│ YES    │                     │           │
└───┬────┘                     └──────┬────┘
    │                                 │
    │ (returned in <10ms)             │ (API call: 200–500ms)
    │                                 │
    ▼                                 ▼
Return cached              ┌──────────────────────┐
snippets + metadata        │ Fetch from API       │
(no API call)              │ - Tavily: ~300ms     │
                           │ - Brave: ~500ms      │
                           │ - Ollama: ~200ms     │
                           └──────────┬───────────┘
                                      │
                            ┌─────────▼────────┐
                            │ budgetContent()  │
                            │ - Filter by score│
                            │ - Allocate 80%   │
                            │ - Truncate items │
                            └─────────┬────────┘
                                      │
                            ┌─────────▼────────┐
                            │ Store in cache   │
                            │ - Key: normalized│
                            │   query          │
                            │ - TTL: 10 min    │
                            │ - LRU: max 50    │
                            └─────────┬────────┘
                                      │
                                      ▼
                                   Return to agent

Typical session:
- 10 searches, 7 cache hits (70%)
- Time saved: 1.5–2.0 seconds
- Token savings: 42k–140k (avoided API calls)
```

---

## 8. MODEL SELECTION & BUDGET ALLOCATION

```
Main Agent (Parent)
├─ Model: User choice (Opus/Sonnet/Haiku)
├─ Context: Full contextWindow (1M or 200k)
├─ Available: ~85–90% for task
└─ Used for: Long-running work, complex reasoning

    │
    ├─────────────────────────────────────┐
    │                                     │
    ▼                                     ▼
Scout Subagent                  Worker Subagent
├─ Model: $budget_model          ├─ Model: Same as parent
│  (typically Haiku: 200k)        │  (Sonnet/Opus)
├─ Context: Limited              ├─ Context: Full
├─ Time: <5 min (fast)           ├─ Time: Unlimited
└─ Cost: Cheap                   └─ Cost: Higher

Parallel vs. Sequential:
Parallel Scouts (4–8 running)
├─ Each: Haiku model
├─ Total cost: 4 × 200k = 800k
├─ Total time: ~2 min
└─ Benefit: Map codebase fast

Sequential Workers (1 running)
├─ Each: Opus/Sonnet
├─ Total cost: 1 × 1M
├─ Total time: 10+ min
└─ Benefit: Complex work
```

---

## 9. TOOL SIZE DISTRIBUTION (EXAMPLE)

```
100 tools registered
├─ 25 active tools (in this session)
│
├─ Active tool sizes:
│  ├─ browser_screenshot: ~800 tok
│  ├─ browser_click: ~600 tok
│  ├─ lsp (code nav): ~500 tok
│  ├─ bash: ~400 tok
│  ├─ write (file): ~350 tok
│  ├─ read (file): ~300 tok
│  ├─ subagent: ~900 tok (largest)
│  ├─ search-the-web: ~700 tok
│  └─ (17 more): ~5.5k total
│
├─ Subtotal active: ~10k tokens
│  (~1% of 1M context)
│
└─ Registered but inactive:
   ├─ 75 tools not loaded
   ├─ ~15k tokens NOT in context
   └─ Benefit: Smaller prompt, faster inference

Optimization: Disable unused tools
- Remove 10 tools → save ~2k tokens
- Enable only needed ones at session start
```

---

## 10. SESSION STATS SUMMARY

```
Session Start
├─ System prompt: 8–10k tokens
├─ Tools: 3–10k tokens
└─ Memory: 0–6k tokens
   Total: 11–26k tokens

Turn 1
├─ Message: 2k tokens
├─ Tool call: 1–5k tokens
└─ Running total: 15–36k tokens

Turn 2–10 (typical work)
├─ Each turn: 3–10k tokens (messages + tool calls)
├─ Running total: 50–130k tokens
└─ Capacity used: 5–13%

Turn 11–50 (longer session)
├─ History grows: 100–200k tokens
├─ Capacity used: 10–20%
└─ Free space: 800–900k tokens

Turn 51+ (very long session)
├─ History: 150–300k tokens
├─ Approaching limit? Compact
├─ After compact: Reset to 15–40k
└─ Restart work

Trigger points:
- 90% used: Warning (agent aware via /context)
- 95% used: Compact (automatic or manual)
- 99%+ used: Blocked (agent cannot proceed)
```

---

## 11. SAFETY MARGIN CALCULATION

```
Search Query (8k token budget)

Step 1: Get effective budget
  ├─ maxTokens = 8000
  ├─ margin = 0.8 (80% margin = 20% reserve)
  └─ effectiveBudget = 8000 × 0.8 = 6400 tokens

Step 2: Distribute across results
  ├─ Filtered results: 5
  ├─ perResultBudget = 6400 / 5 = 1280 tokens per result
  └─ maxChars = 1280 × 4 = 5120 chars per result

Step 3: Truncate each result
  ├─ Result 1: 15k chars → truncate to 5.1k
  ├─ Result 2: 8k chars → keep as-is
  ├─ Result 3: 20k chars → truncate to 5.1k
  ├─ Result 4: 3k chars → keep as-is
  └─ Result 5: 10k chars → truncate to 5.1k

Step 4: Estimate total
  ├─ Actual tokens used: 6200 (95% of 6400 budget)
  ├─ Reserved for safety: 200 tokens
  └─ Total window used: 6400 / 8000 = 80%

Result:
  ✓ Always stays under 8k tokens
  ✓ 20% buffer = no overflow
  ✓ Quality: Results are truncated but complete
```

---

## 12. DECISION FLOWCHART FOR EXTENSION AUTHORS

```
Building a new tool?
    │
    ▼
Does it produce variable-length output?
├─ YES ──────────────────┐
└─ NO → Skip truncation  │
                         │
                    ┌────▼────┐
                    │ Add      │
                    │ maxBytes │
                    │ param?   │
                    └────┬────┘
                         │ YES
                    ┌────▼────────────────────┐
                    │ Set ranges:             │
                    │ - min: 1000 (1KB)       │
                    │ - max: 50000 (50KB)     │
                    │ - default: 20000 (20KB) │
                    └────┬───────────────────┘
                         │
                    ┌────▼──────────────────────┐
                    │ In execute():              │
                    │ import {truncateHead}      │
                    │ from "@gsd/..."            │
                    │                            │
                    │ const truncation =         │
                    │   truncateHead(output, {   │
                    │     maxLines: 2000,        │
                    │     maxBytes: params.bytes │
                    │   })                       │
                    │                            │
                    │ let content =              │
                    │   truncation.content       │
                    │ if (truncation.truncated) {
                    │   content += "[Truncated]" │
                    │ }                          │
                    └────┬──────────────────────┘
                         │
                    ┌────▼──────────────────┐
                    │ Return:                │
                    │ {                      │
                    │   content: [           │
                    │     { type: "text",    │
                    │       text: content }  │
                    │   ],                   │
                    │   details: {...}       │
                    │ }                      │
                    └────────────────────────┘

Special cases:
- Search results? Use budgetContent() instead
- Memory? Check 200 lines + 25KB limits
- Docs? Check configured maxTokens
- Browser? Always truncate output
```

---

This matrix shows how all token management pieces interact. Use it as a reference when understanding context pressure points or designing new extensions.

