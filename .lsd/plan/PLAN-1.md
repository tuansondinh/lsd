# Plan #1: Auto-install LSP Language Servers via Onboarding

Plan ID: #1
Generated: 2026-04-02
Platform: CLI (Node.js)
Status: complete

## Problem

The LSP tool provides ~100x token savings for code navigation, but **none of the 53 language servers in `defaults.json` are bundled with lsd**. They only work if the user happens to have them installed globally. Most users silently run in degraded mode (grep instead of LSP) and never know.

## Approach

Add an optional "Language Server Setup" step to the onboarding wizard (`/setup`). The user chooses which servers to install — we auto-detect which ones are relevant based on what's already on the system and what projects they'll likely work with. The most common server (`typescript-language-server`) gets special attention since JS/TS is the dominant use case.

## Key Design Decisions

1. **Opt-in during onboarding** — never silently install binaries
2. **Detect what's already installed** — skip servers the user already has
3. **Detect what's relevant** — only offer servers for languages the user likely uses (based on project markers in cwd, or common defaults)
4. **Install via npm/pip/brew** — use the package manager already available on the system
5. **Persist the user's preference** — store in settings so `/setup` re-run shows current state
6. **Non-blocking** — if install fails, log a warning and continue; never crash boot

## Phases

1. [x] Phase 1: LSP server install utility + settings integration — complexity: standard
   - Create `src/lsp-install.ts` utility module with:
     - `detectMissingServers(cwd: string)` — cross-reference `defaults.json` rootMarkers against cwd, then check which commands are missing from PATH via `resolveCommand()`
     - `detectInstalledServers(cwd: string)` — inverse: which servers are already available
     - `installServer(name: string)` — install map: server name → install command (e.g. `typescript-language-server` → `npm install -g typescript-language-server`, `pyright` → `pip install pyright`, etc.)
     - `getInstallCommand(name: string)` — returns the install command string without executing (for display purposes)
   - Define the install command mapping as a const record:
     ```
     typescript-language-server → npm i -g typescript-language-server typescript
     pyright-langserver → pip install pyright (or npm i -g pyright)
     gopls → go install golang.org/x/tools/gopls@latest
     rust-analyzer → rustup component add rust-analyzer
     bash-language-server → npm i -g bash-language-server
     yaml-language-server → npm i -g yaml-language-server
     vscode-json-language-server → npm i -g vscode-langservers-extracted
     vscode-html-language-server → npm i -g vscode-langservers-extracted
     vscode-css-language-server → npm i -g vscode-langservers-extracted
     ```
   - Add `lspAutoInstall?: boolean` and `lspInstalledServers?: string[]` fields to settings schema in `settings-manager.ts`
   - Spawn installs with `execFile` / `spawn` and capture stdout/stderr for error reporting

2. [x] Phase 2: Onboarding wizard integration — complexity: standard
   - Add `runLspStep(p, pc, settingsManager)` function in `src/onboarding.ts`
   - Insert it into the `runOnboarding()` flow after the budget model step and before the summary
   - Flow:
     1. Call `detectMissingServers(cwd)` to find relevant but missing servers
     2. If none missing → skip with log "All detected language servers are installed ✓"
     3. If missing → show a `p.multiselect()` with the missing servers, pre-selecting `typescript-language-server` if it's in the list
     4. Each option shows: server name, what languages it covers, install command
     5. On confirm → run installs with a spinner per server
     6. Report success/failure per server
     7. Save installed list to settings
   - Add LSP status line to the summary section:
     - `✓ Language servers: typescript-language-server, pyright (2 installed)`
     - `↷ Language servers: skipped`
   - Handle edge cases:
     - `npm` not available → skip npm-based servers, warn
     - `pip` not available → skip pip-based servers, warn
     - Install timeout (30s per server)
     - User cancels mid-install

3. [x] Phase 3: Improve LSP status messaging when servers are missing — complexity: simple
   - When `lsp status` detects missing servers for the current project, append:
     `"Run /setup to install missing language servers, or install manually: npm i -g typescript-language-server"`
   - When a file-specific LSP action returns "No language server found", include the specific install command for that file type
   - Update `lsp.md` description to mention the `/setup` install option

## Acceptance Criteria

- Running `/setup` on a machine without `typescript-language-server` shows the LSP step
- User can select which servers to install via multiselect
- `typescript-language-server` installs successfully via the wizard
- Skipping the step works cleanly (no errors, recorded in summary)
- Re-running `/setup` shows already-installed servers as "keep current"
- `lsp status` shows helpful install instructions when servers are missing
- No existing onboarding steps are broken or reordered incorrectly
- Install failures are caught and reported gracefully (don't crash the wizard)

## Files to Modify

- `src/lsp-install.ts` — **new** — install utility
- `src/onboarding.ts` — add `runLspStep()`, wire into `runOnboarding()`
- `packages/pi-coding-agent/src/core/settings-manager.ts` — add LSP settings fields
- `packages/pi-coding-agent/src/core/lsp/index.ts` — improve "no server found" messages
- `packages/pi-coding-agent/src/core/lsp/lsp.md` — mention `/setup` for missing servers

## Out of Scope

- Bundling language servers as npm dependencies of lsd (too heavy)
- Auto-installing without user consent
- Supporting every server in defaults.json (focus on top ~8 most common)
- Project-local installs (always global — language servers are developer tools)
