# Extension Files Inventory

## Summary Statistics
- **Total extensions:** 27 top-level directories
- **Total .ts files:** 160
- **Large files (>500 lines):** 22
- **Medium files (200-500 lines):** 67
- **Small files (<200 lines):** 71

---

## EXTENSION INVENTORY

### 1. **ask-user-questions** (1 file, ~395 lines)
- **ask-user-questions.ts** — 395 lines

### 2. **async-jobs** (7 .ts files, ~1,164 lines total)
Background job management system.
- async-bash-tool.ts — 276 lines
- job-manager.ts — 209 lines
- await-tool.test.ts — 195 lines
- async-bash-timeout.test.ts — 122 lines
- await-tool.ts — 166 lines
- index.ts — 153 lines
- cancel-job-tool.ts — 43 lines

### 3. **aws-auth** (1 file, ~144 lines)
- **index.ts** — 144 lines

### 4. **bg-shell** (11 .ts files, ~3,817 lines total) [LARGE]
Comprehensive background shell management system.
- **bg-shell-tool.ts** — **977 lines** ⭐
- bg-shell-lifecycle.ts — **358 lines**
- **overlay.ts** — **441 lines**
- **process-manager.ts** — **423 lines**
- bg-shell-command.ts — 242 lines
- types.ts — 276 lines
- output-formatter.ts — 262 lines
- interaction.ts — 200 lines
- readiness-detector.ts — 126 lines
- utilities.ts — 78 lines
- index.ts — 54 lines

### 5. **browser-tools** (29 .ts files, ~10,698 lines total) [LARGEST EXTENSION]
Extensive browser automation and testing framework.

**Core Files:**
- **core.ts** — **1,196 lines** ⭐ LARGEST
- **utils.ts** — **660 lines**
- state.ts — **408 lines**
- lifecycle.ts — 270 lines
- refs.ts — 264 lines
- capture.ts — 199 lines
- settle.ts — 197 lines
- evaluate-helpers.ts — 184 lines
- index.ts — 163 lines

**Tools Subdirectory (20 files):**
- **tools/interaction.ts** — **865 lines**
- **tools/forms.ts** — **801 lines**
- **tools/intent.ts** — **614 lines**
- **tools/refs.ts** — **541 lines**
- **tools/inspection.ts** — **492 lines**
- tools/session.ts — 400 lines
- tools/assertions.ts — 342 lines
- tools/pages.ts — 303 lines
- tools/codegen.ts — 274 lines
- tools/wait.ts — 247 lines
- tools/network-mock.ts — 244 lines
- tools/navigation.ts — 232 lines
- tools/extract.ts — 229 lines
- tools/action-cache.ts — 216 lines
- tools/injection-detect.ts — 221 lines
- tools/visual-diff.ts — 209 lines
- tools/state-persistence.ts — 202 lines
- tools/device.ts — 183 lines
- tools/verify.ts — 117 lines
- tools/zoom.ts — 104 lines
- tools/screenshot.ts — 101 lines
- tools/pdf.ts — 92 lines

### 6. **cache-timer** (1 file, ~141 lines)
- **index.ts** — 141 lines

### 7. **claude-code-cli** (8 .ts files, ~1,083 lines total)
CLI integration and streaming adapter.
- **stream-adapter.ts** — **403 lines**
- partial-builder.ts — 270 lines
- sdk-types.ts — 149 lines
- stream-adapter.test.ts — 128 lines
- partial-builder.test.ts — 133 lines
- models.ts — 42 lines
- readiness.ts — 30 lines
- index.ts — 28 lines

### 8. **cmux** (1 file, ~461 lines)
- **index.ts** — **461 lines**

### 9. **codex-rotate** (8 .ts files, ~1,165 lines total)
Model rotation and quota management system.
- commands.ts — **368 lines**
- oauth.ts — 234 lines
- sync.ts — 133 lines
- accounts.ts — 141 lines
- quota.ts — 128 lines
- index.ts — 129 lines
- types.ts — 29 lines
- config.ts — 21 lines
- logger.ts — 11 lines

### 10. **context7** (1 file, ~435 lines)
- **index.ts** — **435 lines**

### 11. **get-secrets-from-user** (1 file, ~585 lines)
- **get-secrets-from-user.ts** — **585 lines**

### 12. **google-search** (1 file, ~474 lines)
- **index.ts** — **474 lines**

### 13. **gsd** (1 .ts file, ~61 lines)
Test helpers for GSD.
- **tests/test-helpers.ts** — 61 lines

### 14. **mac-tools** (1 file, ~852 lines)
macOS application automation via Accessibility APIs.
- **index.ts** — **852 lines**

**Additional files (not .ts):**
- swift-cli/Package.swift
- swift-cli/Sources/main.swift
- swift-cli/.gitignore

### 15. **mcp-client** (2 .ts files, ~804 lines total)
MCP server client implementation.
- **index.ts** — **749 lines**
- tests/server-name-spaces.test.ts — 55 lines

### 16. **memory** (13 .ts files, ~3,445 lines total) [LARGE]
Persistent memory and knowledge management system.
- **dream.ts** — **1,274 lines** ⭐ LARGEST SINGLE FILE
- auto-extract.ts — **537 lines**
- index.ts — 384 lines
- tests/memory-scan.test.ts — 244 lines
- tests/auto-extract.test.ts — 222 lines
- tests/dream.test.ts — 206 lines
- memory-recall.ts — 186 lines
- memory-scan.ts — 118 lines
- memory-types.ts — 106 lines
- tests/memory-paths.test.ts — 89 lines
- memory-age.ts — 43 lines
- memory-paths.ts — 55 lines
- tests/memory-age.test.ts — 60 lines

### 17. **remote-questions** (16 .ts files, ~3,152 lines total) [LARGE]
Remote question handling and multi-platform messaging (Slack, Discord, Telegram).
- **telegram-live-relay.ts** — **1,105 lines**
- remote-command.ts — **421 lines**
- format.ts — **315 lines**
- manager.ts — 184 lines
- discord-adapter.ts — 148 lines
- slack-adapter.ts — 141 lines
- telegram-adapter.ts — 141 lines
- accounts.ts — 141 lines
- config.ts — 126 lines
- telegram-update-stream.ts — 116 lines
- types.ts — 102 lines
- index.ts — 107 lines
- notify.ts — 90 lines
- store.ts — 85 lines
- http-client.ts — 76 lines
- status.ts — 35 lines
- mod.ts — 16 lines

### 18. **search-the-web** (12 .ts files, ~3,439 lines total) [LARGE]
Web search integration with multiple providers.
- **tool-search.ts** — **677 lines**
- **tool-llm-context.ts** — **608 lines**
- **tool-fetch-page.ts** — **589 lines**
- format.ts — **258 lines**
- http.ts — **238 lines**
- native-search.ts — 231 lines
- provider.ts — 142 lines
- url-utils.ts — 125 lines
- tavily.ts — 116 lines
- command-search-provider.ts — 101 lines
- cache.ts — 78 lines
- index.ts — 64 lines

### 19. **shared** (21 .ts files, ~3,521 lines total) [LARGE]
Shared utilities, UI components, and configuration.
- **interview-ui.ts** — **777 lines**
- **ui.ts** — **401 lines**
- rtk-session-stats.ts — **249 lines**
- next-action-ui.ts — 212 lines
- tests/ask-user-freetext.test.ts — 217 lines
- tests/custom-ui-fallbacks.test.ts — 193 lines
- confirm-ui.ts — 133 lines
- secrets-manifest.ts — 130 lines
- rtk.ts — 138 lines
- preferences.ts — 123 lines
- frontmatter.ts — 117 lines
- debug-logger.ts — 102 lines
- format-utils.ts — 99 lines
- tests/format-utils.test.ts — 155 lines
- sanitize.ts — 55 lines
- layout-utils.ts — 49 lines
- mod.ts — 31 lines
- terminal.ts — 28 lines
- path-display.ts — 19 lines
- env-utils.ts — 18 lines
- paths.ts — 15 lines

### 20. **slash-commands** (7 .ts files, ~1,577 lines total)
CLI slash command handlers.
- **plan.ts** — **932 lines**
- context.ts — **252 lines**
- tools.ts — 224 lines
- audit.ts — 88 lines
- init.ts — 55 lines
- index.ts — 16 lines
- clear.ts — 10 lines

### 21. **subagent** (13 .ts files, ~4,713 lines total) [VERY LARGE]
Subagent orchestration and worker management.
- **index.ts** — **2,596 lines** ⭐ LARGEST FILE IN CODEBASE
- isolation.ts — **503 lines**
- background-job-manager.ts — 240 lines
- agent-switcher-component.ts — 228 lines
- agent-switcher-model.ts — 160 lines
- agents.ts — 157 lines
- approval-proxy.ts — 118 lines
- worker-registry.ts — 100 lines
- model-resolution.ts — 63 lines
- background-types.ts — 58 lines
- background-runner.ts — 77 lines
- launch-helpers.ts — 42 lines
- configured-model.ts — 16 lines

### 22. **ttsr** (3 .ts files, ~700 lines total)
Tool-triggered system rules management.
- **ttsr-manager.ts** — **456 lines**
- index.ts — 168 lines
- rule-loader.ts — 76 lines

### 23. **universal-config** (9 .ts files, ~1,961 lines total)
Configuration discovery and scanning across multiple tools.
- **scanners.ts** — **642 lines**
- tests/scanners.test.ts — **456 lines**
- format.ts — 191 lines
- types.ts — 135 lines
- index.ts — 120 lines
- discovery.ts — 104 lines
- tests/discovery.test.ts — 119 lines
- tests/format.test.ts — 127 lines
- tools.ts — 60 lines

### 24. **usage** (1 file, ~585 lines)
- **index.ts** — **585 lines**

### 25. **usage-tips** (1 file, ~16 lines)
- **index.ts** — 16 lines

### 26. **voice** (3 .ts files, ~474 lines total)
Voice/speech recognition integration.
- **index.ts** — **263 lines**
- linux-ready.ts — 87 lines
- tests/linux-ready.test.ts — 124 lines

**Additional files (not .ts):**
- speech-recognizer.py
- speech-recognizer.swift
- .gitignore

---

## TOP 10 LARGEST FILES

| Rank | File | Lines | Extension |
|------|------|-------|-----------|
| 1 | subagent/index.ts | 2,596 | **subagent** |
| 2 | memory/dream.ts | 1,274 | **memory** |
| 3 | browser-tools/core.ts | 1,196 | **browser-tools** |
| 4 | remote-questions/telegram-live-relay.ts | 1,105 | **remote-questions** |
| 5 | bg-shell/bg-shell-tool.ts | 977 | **bg-shell** |
| 6 | slash-commands/plan.ts | 932 | **slash-commands** |
| 7 | browser-tools/tools/interaction.ts | 865 | **browser-tools** |
| 8 | mac-tools/index.ts | 852 | **mac-tools** |
| 9 | browser-tools/tools/forms.ts | 801 | **browser-tools** |
| 10 | shared/interview-ui.ts | 777 | **shared** |

---

## EXTENSION SIZE CATEGORIES

### Extra Large (>2000 lines)
- **subagent** — 4,713 lines (1 massive file + 12 supporting)
- **browser-tools** — 10,698 lines (comprehensive automation suite)

### Large (1000-2000 lines)
- **memory** — 3,445 lines (persistent knowledge system)
- **shared** — 3,521 lines (common utilities & UI)
- **remote-questions** — 3,152 lines (messaging infrastructure)
- **search-the-web** — 3,439 lines (search providers)
- **bg-shell** — 3,817 lines (process management)

### Medium (500-1000 lines)
- **universal-config** — 1,961 lines (config discovery)
- **slash-commands** — 1,577 lines (CLI handlers)
- **codex-rotate** — 1,165 lines (model rotation)
- **claude-code-cli** — 1,083 lines (CLI integration)
- **async-jobs** — 1,164 lines (job management)
- **ttsr** — 700 lines (rule management)

### Small (<500 lines)
- **ask-user-questions** — 395 lines
- **aws-auth** — 144 lines
- **cache-timer** — 141 lines
- **cmux** — 461 lines
- **context7** — 435 lines
- **get-secrets-from-user** — 585 lines
- **google-search** — 474 lines
- **gsd** — 61 lines
- **mcp-client** — 804 lines
- **usage** — 585 lines
- **usage-tips** — 16 lines
- **voice** — 474 lines

---

## FILE STATISTICS BY EXTENSION

**Total extensions:** 27  
**Total .ts files:** 160  
**Total lines:** ~50,900

**Breakdown:**
- Extra Large (>2000 lines): 2 extensions (15,411 lines)
- Large (1000-2000 lines): 5 extensions (17,974 lines)
- Medium (500-1000 lines): 6 extensions (8,660 lines)
- Small (<500 lines): 14 extensions (8,855 lines)

---

## Key Insights

### Largest & Most Complex
1. **browser-tools** (10,698 lines) — Most comprehensive, ~29 files covering browser automation, form handling, assertion, visual testing
2. **subagent** (4,713 lines) — Dominated by single massive file (2,596 lines); critical orchestration logic
3. **bg-shell** (3,817 lines) — Complex process lifecycle, overlay UI, readiness detection
4. **shared** (3,521 lines) — Central utilities; heavy on UI components (interview-ui, ui.ts)
5. **search-the-web** (3,439 lines) — Multi-provider search with tool context & fetching

### Refactoring Candidates
- **subagent/index.ts** (2,596 lines) — Exceeds recommended single-file size; consider modularization
- **memory/dream.ts** (1,274 lines) — Core logic; monitor for further growth
- **browser-tools/core.ts** (1,196 lines) — Main browser abstraction; well-contained but large

### Test Coverage
- memory: 5 test files (821 lines)
- shared: 3 test files (565 lines)
- browser-tools: 2 test files
- universal-config: 3 test files (702 lines)
- async-jobs: 2 test files (317 lines)
