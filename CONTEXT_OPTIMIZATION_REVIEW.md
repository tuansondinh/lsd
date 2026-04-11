# LSD Context & System Prompt Optimization Review

_April 11, 2026_

---

## Executive Summary

The full-profile system prompt currently pushes **~16–20k tokens** of system prompt text + **~8–10k tokens** of tool schemas through the API on every request. With 90 extension tools + 15 core tools = **105 tools total**, the "full" profile loads massive schema payloads that the model rarely needs. The "balanced" profile is minimal at 12 tools — there's a clear gap for a middle tier.

Key findings:
1. **61 browser tools** dominate the tool count (58% of all extension tools)
2. **111 promptGuideline items** (~2,800 tokens) are injected into the system prompt
3. **3 search tools overlap** (search-the-web, google_search, search_and_read) — plus native web_search on Anthropic
4. **async_bash and bg_shell overlap** significantly in purpose
5. **No third profile** exists between 12 tools (balanced) and 105 tools (full)
6. Memory system prompt is ~1,900 tokens even for users with zero memories

---

## 1. Context Budget Breakdown (Full Profile)

| Section | Est. Tokens | % of Total | Notes |
|---------|----------:|---:|-------|
| **Tool schemas** (105 tools: name + description + JSON params) | ~8,000–10,000 | 40–50% | Sent via API `tools` param, not in system prompt text |
| **Extension promptGuidelines** (111 items) | ~2,800 | 14% | Injected into system prompt body |
| **Core guidelines** (system-prompt.ts) | ~650 | 3% | Conditional on active tools |
| **Memory system prompt** (instructions + types + format) | ~1,500 | 8% | Always present even with 0 memories |
| **MEMORY.md content** | ~800 | 4% | Varies; capped at 200 lines / 25KB |
| **Skills block** (14 skills) | ~1,200 | 6% | Names + descriptions + paths |
| **Project context** (LSD.md files) | ~500 | 3% | 2 files in this project |
| **Mac tools context block** | ~400 | 2% | Always injected on macOS |
| **LSP decision table** | ~250 | 1% | Markdown table |
| **Role header + tool list** | ~300 | 2% | |
| **Footer** (date + cwd) | ~30 | <1% | |
| **Total system prompt** | **~16,000–18,000** | | |
| **Total with tool schemas** | **~24,000–28,000** | | |

---

## 2. Tool Inventory & Analysis

### 2.1 All 105 Tools by Category

| Category | Count | Notes |
|----------|------:|-------|
| **Browser** | 61 | 7,029 lines of source |
| **Core (pi-coding-agent)** | 15 | read, bash, edit, write, grep, find, ls, lsp + hashline + PTY |
| **Mac** | 12 | macOS-only, Accessibility API |
| **Search** | 4 | web_search (native), search-the-web, google_search, search_and_read |
| **Background jobs** | 4 | async_bash, await_job, cancel_job, bg_shell |
| **MCP** | 3 | mcp_servers, mcp_discover, mcp_call |
| **Subagent** | 2 | subagent, await_subagent |
| **Context7** | 2 | resolve_library, get_library_docs |
| **Misc** | 2 | tool_search, tool_enable |
| **Other** | 3 | ask_user_questions, secure_env_collect, discover_configs |

### 2.2 Browser Tools — Full List (61 Tools)

The browser subsystem registers 61 tools. Many are highly specialized:

**Core browser (essential for any browser work):**
- `browser_navigate`, `browser_click`, `browser_type`, `browser_screenshot`
- `browser_scroll`, `browser_key_press`, `browser_evaluate`
- `browser_find`, `browser_wait_for`, `browser_close`

**Mid-tier browser (useful for common tasks):**
- `browser_go_back`, `browser_go_forward`, `browser_reload`
- `browser_hover`, `browser_select_option`, `browser_set_checked`
- `browser_get_accessibility_tree`, `browser_get_page_source`
- `browser_get_console_logs`, `browser_get_network_logs`
- `browser_assert`, `browser_batch`
- `browser_fill_form`, `browser_analyze_form`
- `browser_upload_file`, `browser_drag`

**Advanced browser (rarely needed, high context cost):**
- `browser_snapshot_refs`, `browser_click_ref`, `browser_fill_ref`, `browser_hover_ref`, `browser_get_ref` — ref-based interaction (5 tools)
- `browser_find_best`, `browser_act` — semantic intent (2 tools)
- `browser_diff`, `browser_verify` — verification (2 tools)
- `browser_list_pages`, `browser_switch_page`, `browser_close_page` — multi-tab (3 tools)
- `browser_list_frames`, `browser_select_frame` — iframe handling (2 tools)
- `browser_mock_route`, `browser_block_urls`, `browser_clear_routes` — network mocking (3 tools)
- `browser_save_state`, `browser_restore_state` — persistence (2 tools)
- `browser_emulate_device`, `browser_set_viewport` — responsive (2 tools)
- `browser_trace_start`, `browser_trace_stop`, `browser_export_har` — tracing (3 tools)
- `browser_timeline`, `browser_session_summary`, `browser_debug_bundle` — session introspection (3 tools)
- `browser_save_pdf` — PDF export (1 tool)
- `browser_extract` — structured data extraction (1 tool)
- `browser_visual_diff` — pixel comparison (1 tool)
- `browser_zoom_region` — region screenshot (1 tool)
- `browser_generate_test` — codegen (1 tool)
- `browser_action_cache` — cache management (1 tool)
- `browser_check_injection` — security (1 tool)
- `browser_get_dialog_logs` — dialog inspection (1 tool)

### 2.3 Tools That Could Be Consolidated or Removed

#### Overlap: `async_bash` / `await_job` / `cancel_job` vs `bg_shell`

Both provide background command execution. `bg_shell` is strictly more capable:
- `bg_shell start` → replaces `async_bash`
- `bg_shell output` → replaces `await_job`
- `bg_shell kill` → replaces `cancel_job`

**Recommendation:** Consider whether both are needed in the same profile. For the middle profile, include only `bg_shell`.

#### Overlap: `search-the-web` vs `google_search` vs native `web_search`

Three search backends exist:
- `search-the-web` — Brave Search API (custom tool)
- `google_search` — Google via Gemini (custom tool)
- `search_and_read` — Brave + auto-read (custom tool)
- Native `web_search` — Anthropic's built-in (auto-injected on Anthropic, disables custom search tools)

On Anthropic, all custom search tools are disabled when native search is active (see `CUSTOM_SEARCH_TOOL_NAMES` in `native-search.ts`). So for Anthropic users, `search-the-web`, `google_search`, and `search_and_read` are dead weight in the tool registry.

**Recommendation:** The middle profile should only include `web_search` (which auto-adapts per provider) + `fetch_page`. Skip `search_and_read` (it's just search + fetch combined).

#### Overlap: `browser_find` vs `browser_get_accessibility_tree`

`browser_find` is the cheaper targeted version. `browser_get_accessibility_tree` returns the full tree. Both are useful but the tree is rarely needed when `find` exists.

**Recommendation:** Middle profile includes `browser_find` only. `browser_get_accessibility_tree` available via `tool_enable`.

#### Overlap: `browser_click` vs `browser_click_ref` / `browser_fill_ref` / `browser_hover_ref`

Ref-based tools are an optimization for repeat interactions. They save tokens by caching element references. But they add 5 tools to the context.

**Recommendation:** Middle profile excludes all ref-based tools. Available via `tool_enable`.

---

## 3. Prompt Guidelines Analysis

### 3.1 Top Guideline Contributors

| Extension | Items | Tokens | Notes |
|-----------|------:|-------:|-------|
| bg-shell | 16 | ~468 | Very detailed action-by-action guidance |
| mac-tools | 20 | ~391 | One per tool |
| secure_env_collect | 6 | ~228 | |
| browser assertions | 8 | ~190 | |
| ask_user_questions | 5 | ~158 | |
| mcp-client | 7 | ~155 | |
| subagent | 5 | ~154 | |
| async-jobs | 6 | ~153 | |
| context7 | 6 | ~139 | |
| search tools | 14 | ~322 | Across 3 files |
| slash-commands/tools | 5 | ~124 | |
| **Total** | **111** | **~2,800** | |

### 3.2 Guideline Optimization Opportunities

**bg_shell (16 guidelines, ~468 tokens):** This is the largest single contributor. Many guidelines explain individual action variants (`digest` vs `output` vs `highlights`). Could be compressed into 5–6 guidelines covering the key patterns.

**mac-tools (20 guidelines, ~391 tokens):** One guideline per tool ("Run this first if...", "Use to discover..."). Most are obvious from the tool description itself. Could be cut to 5 essential guidelines.

**async-jobs (6 guidelines, ~153 tokens):** Since `bg_shell` covers the same ground with more detail, these are partially redundant in the full profile.

**Duplication across search tools:** 14 guidelines across 3 files (tool-search.ts, tool-fetch-page.ts, tool-llm-context.ts). Could consolidate to ~6.

---

## 4. Memory System Prompt Cost

The memory injection costs ~1,500 tokens of _instructions_ (types, format, rules, what not to save) before any actual memories. For users with zero memories, this is pure overhead.

**Recommendation:** Consider a lighter memory header when MEMORY.md is empty or doesn't exist. The full formatting instructions could be deferred until the model actually needs to write a memory.

---

## 5. Proposed Third Profile: "Standard"

The gap between balanced (12 tools) and full (105 tools) is extreme. A "standard" profile would cover 90% of real coding sessions.

### Profile Comparison

| Tool | Balanced | Standard | Full |
|------|:--------:|:--------:|:----:|
| **Core** | | | |
| read / hashline_read | ✅ | ✅ | ✅ |
| bash | ✅ | ✅ | ✅ |
| edit / hashline_edit | ✅ | ✅ | ✅ |
| write | ✅ | ✅ | ✅ |
| lsp | ✅ | ✅ | ✅ |
| grep | — | ✅ | ✅ |
| find | — | ✅ | ✅ |
| ls | — | ✅ | ✅ |
| **Background** | | | |
| bg_shell | ✅ | ✅ | ✅ |
| async_bash | — | — | ✅ |
| await_job | — | — | ✅ |
| cancel_job | — | — | ✅ |
| **Search** | | | |
| web_search | — | ✅ | ✅ |
| fetch_page | — | ✅ | ✅ |
| search-the-web | — | — | ✅ |
| search_and_read | — | — | ✅ |
| google_search | — | — | ✅ |
| **Docs** | | | |
| resolve_library | — | ✅ | ✅ |
| get_library_docs | — | ✅ | ✅ |
| **Agent** | | | |
| subagent | ✅ | ✅ | ✅ |
| await_subagent | ✅ | ✅ | ✅ |
| Skill | ✅ | ✅ | ✅ |
| **User interaction** | | | |
| ask_user_questions | ✅ | ✅ | ✅ |
| secure_env_collect | — | ✅ | ✅ |
| **Browser (essential)** | | | |
| browser_navigate | — | ✅ | ✅ |
| browser_click | — | ✅ | ✅ |
| browser_type | — | ✅ | ✅ |
| browser_screenshot | — | ✅ | ✅ |
| browser_scroll | — | ✅ | ✅ |
| browser_key_press | — | ✅ | ✅ |
| browser_evaluate | — | ✅ | ✅ |
| browser_find | — | ✅ | ✅ |
| browser_wait_for | — | ✅ | ✅ |
| browser_close | — | ✅ | ✅ |
| browser_assert | — | ✅ | ✅ |
| browser_batch | — | ✅ | ✅ |
| **Browser (mid-tier)** | — | — | ✅ |
| browser_go_back, go_forward, reload | — | — | ✅ |
| browser_hover, select_option, set_checked | — | — | ✅ |
| browser_get_accessibility_tree | — | — | ✅ |
| browser_get_page_source | — | — | ✅ |
| browser_get_console_logs | — | — | ✅ |
| browser_get_network_logs | — | — | ✅ |
| browser_fill_form, analyze_form | — | — | ✅ |
| browser_upload_file, drag | — | — | ✅ |
| **Browser (advanced, 30+ tools)** | — | — | ✅ |
| **Mac tools (12)** | — | — | ✅ |
| **MCP (3)** | — | — | ✅ |
| **Tool management** | | | |
| tool_search | ✅ | ✅ | ✅ |
| tool_enable | ✅ | ✅ | ✅ |
| **Other** | | | |
| discover_configs | — | — | ✅ |
| PTY tools (6) | — | — | ✅ |
| **Total** | **12** | **~32** | **105** |

### Token Impact Estimate

| Profile | Tool Schemas | Guidelines | Total System Prompt |
|---------|------------:|----------:|-------------------:|
| Balanced | ~1,500 tok | ~600 tok | ~8,000 tok |
| **Standard** | **~4,000 tok** | **~1,500 tok** | **~12,000 tok** |
| Full | ~10,000 tok | ~2,800 tok | ~20,000 tok |

The standard profile saves **~8,000 tokens per request** compared to full, while retaining all commonly-used capabilities.

---

## 6. Specific Optimization Recommendations

### 6.1 Quick Wins (No Behavior Change)

| # | Action | Token Savings | Effort |
|---|--------|------------:|--------|
| 1 | **Compress bg_shell guidelines** from 16 → 6 items | ~200 tok | Low |
| 2 | **Compress mac-tools guidelines** from 20 → 5 items | ~250 tok | Low |
| 3 | **Remove async-jobs guidelines** when bg_shell is active (redundant) | ~150 tok | Low |
| 4 | **Deduplicate search tool guidelines** (14 → 6 items) | ~150 tok | Low |
| 5 | **Slim memory prompt** when no memories exist (skip types/format sections) | ~800 tok | Medium |
| 6 | **Skip mac context block** when no mac tools are active | ~400 tok | Low |

**Total quick-win savings: ~1,950 tokens per request**

### 6.2 Structural Changes

| # | Action | Token Savings | Effort |
|---|--------|------------:|--------|
| 7 | **Add "standard" profile** (32 tools vs 105) | ~6,000 tok | Medium |
| 8 | **Lazy-load browser guidelines** — only inject when browser tools are first used | ~200 tok | Medium |
| 9 | **Conditional skill descriptions** — skip skill block when Skill tool not active | ~1,200 tok | Low |
| 10 | **Compress tool descriptions** — many browser tools have 200+ char descriptions that could be 80 chars | ~2,000 tok | High |

### 6.3 Browser Tool Consolidation Candidates

These tools could potentially be merged to reduce tool count:

| Current | Merge Into | Rationale |
|---------|-----------|-----------|
| `browser_go_back` + `browser_go_forward` | `browser_navigate` (add `direction` param) | Simple navigation variants |
| `browser_list_pages` + `browser_switch_page` + `browser_close_page` | `browser_pages` (action param) | Tab management |
| `browser_list_frames` + `browser_select_frame` | `browser_frames` (action param) | Frame management |
| `browser_trace_start` + `browser_trace_stop` + `browser_export_har` | `browser_trace` (action param) | Trace lifecycle |
| `browser_timeline` + `browser_session_summary` + `browser_debug_bundle` | `browser_debug` (action param) | Debug introspection |
| `browser_save_state` + `browser_restore_state` | `browser_state` (action param) | State persistence |
| `browser_mock_route` + `browser_block_urls` + `browser_clear_routes` | `browser_network` (action param) | Network control |
| `browser_snapshot_refs` + `browser_get_ref` + `browser_click_ref` + `browser_fill_ref` + `browser_hover_ref` | `browser_ref` (action param) | Ref management |

**Potential reduction: 61 → ~40 browser tools** (21 tools consolidated into 8)

> **Note:** Consolidation trades tool count for parameter complexity. The `bg_shell` approach (one tool with `action` enum) works well for related operations. However, each consolidation slightly increases the schema size of the merged tool.

---

## 7. Skills Block Optimization

14 skills × ~85 tokens each = ~1,200 tokens. Each skill entry includes:
- Name, description (up to 1024 chars), file path

**Observations:**
- `code-optimizer` has a 548-char description (largest)
- `create-lsd-extension` and `lsd-guide` have ~300-char descriptions
- Some descriptions list trigger phrases that are rarely useful to the model

**Recommendation:** Cap skill descriptions at 200 chars. The model doesn't need trigger-phrase lists — it matches by semantic intent anyway. Estimated savings: ~300 tokens.

---

## 8. Summary of Potential Savings

| Optimization | Savings | Profile Affected |
|-------------|--------:|-----------------|
| Add standard profile | ~6,000 tok | New default |
| Compress guidelines | ~750 tok | All |
| Slim memory header (no memories) | ~800 tok | All |
| Conditional mac block | ~400 tok | All |
| Cap skill descriptions | ~300 tok | All |
| Browser tool consolidation | ~2,000 tok | Full |
| **Total potential** | **~10,250 tok** | |

At ~$3/M input tokens (Sonnet) and ~60 API calls per session, a 10k token reduction saves **~$1.80/session** or about **$0.60/session** at the more realistic standard-profile level.

The primary benefit is not cost but **model quality** — fewer tools and shorter prompts mean less confusion, fewer hallucinated tool calls, and faster responses.

---

## 9. Implementation Priority

1. **Add "standard" profile** — highest impact, medium effort
2. **Compress bg_shell + mac-tools guidelines** — easy win
3. **Conditional mac context block** — easy win
4. **Slim memory prompt for empty state** — medium effort, recurring savings
5. **Browser tool consolidation** — high effort, do incrementally
6. **Cap skill descriptions** — low effort

---

## Appendix: File Reference

| File | Purpose |
|------|---------|
| `packages/pi-coding-agent/src/core/system-prompt.ts` | Core system prompt builder |
| `src/resources/extensions/slash-commands/tools.ts` | Profile definitions, tool_search, tool_enable |
| `src/resources/extensions/slash-commands/context.ts` | `/context` command, token breakdown |
| `src/resources/extensions/memory/index.ts` | Memory system prompt injection |
| `src/resources/extensions/mac-tools/index.ts` | Mac tools + context block |
| `src/resources/extensions/browser-tools/tools/*.ts` | 61 browser tools |
| `src/resources/extensions/search-the-web/native-search.ts` | Native search gating |
| `src/resources/extensions/bg-shell/bg-shell-tool.ts` | bg_shell (16 guidelines) |
| `src/resources/extensions/async-jobs/` | async_bash, await_job, cancel_job |
