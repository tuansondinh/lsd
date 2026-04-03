# Troubleshooting

## `/gsd doctor`

The built-in diagnostic tool validates `.lsd/` (or `.gsd/`) integrity:

```
/gsd doctor
```

It checks:
- File structure and naming conventions
- Roadmap ↔ slice ↔ task referential integrity
- Completion state consistency
- Git worktree health
- Stale lock files and orphaned runtime records

## Common Issues

### Auto mode loops on the same unit

**Symptoms:** The same unit (e.g., `research-slice` or `plan-slice`) dispatches repeatedly.

**Causes:**
- Stale cache after a crash — the in-memory file listing doesn't reflect new artifacts
- The LLM didn't produce the expected artifact file

**Fix:** Run `/gsd doctor` to repair state, then resume with `/gsd auto`. If the issue persists, check that the expected artifact file exists on disk.

### Auto mode stops with "Loop detected"

**Cause:** A unit failed to produce its expected artifact twice in a row.

**Fix:** Check the task plan for clarity. If the plan is ambiguous, refine it manually, then `/gsd auto` to resume.

### `command not found: lsd` after install

**Symptoms:** `npm install -g lsd-pi` succeeds but `lsd` isn't found.

**Cause:** npm's global bin directory isn't in your shell's `$PATH`.

**Fix:**

```bash
# Find where npm installed the binary
npm prefix -g

# Add the bin directory to your PATH if missing
echo 'export PATH="$(npm prefix -g)/bin:$PATH"' >> ~/.zshrc
source ~/.zshrc
```

**Workaround:** Run `npx lsd-pi` or `$(npm prefix -g)/bin/lsd` directly.

**Common causes:**
- **Homebrew Node** — `/opt/homebrew/bin` should be in PATH but sometimes isn't if Homebrew init is missing
- **Version manager (nvm, fnm, mise)** — global bin is version-specific; ensure your version manager initializes in your shell config

### `npm install -g lsd-pi` fails

**Common causes:**
- Node.js version too old — requires ≥ 22.0.0
- `postinstall` hangs on Linux (Playwright `--with-deps` triggering sudo)

### Provider errors during auto mode

**Symptoms:** Auto mode pauses with a provider error (rate limit, server error, auth failure).

| Error type | Auto-resume? | Delay |
|-----------|-------------|-------|
| Rate limit (429, "too many requests") | ✅ Yes | retry-after header or 60s |
| Server error (500, 502, 503, "overloaded") | ✅ Yes | 30s |
| Auth/billing ("unauthorized", "invalid key") | ❌ No | Manual resume |

For permanent errors, configure fallback models:

```yaml
models:
  execution:
    model: claude-sonnet-4-6
    fallbacks:
      - openrouter/minimax/minimax-m2.5
```

### Budget ceiling reached

**Symptoms:** Auto mode pauses with "Budget ceiling reached."

**Fix:** Increase `budget_ceiling` in preferences, or switch to `budget` token profile to reduce per-unit cost, then resume with `/gsd auto`.

### Stale lock file

**Symptoms:** Auto mode won't start, says another session is running.

**Fix:** LSD automatically detects stale locks — if the owning PID is dead, the lock is cleaned up on the next `/gsd auto`. If automatic recovery fails, delete the lock files manually:

```bash
rm -f .lsd/auto.lock
```

### Git merge conflicts

**Symptoms:** Worktree merge fails on `.lsd/` files.

**Fix:** LSD auto-resolves conflicts on `.lsd/` runtime files. For content conflicts in code files, the LLM is given an opportunity to resolve them. If that fails, manual resolution is needed.

## MCP Client Issues

### `mcp_servers` shows no configured servers

**Common causes:**
- No `.mcp.json` or `.lsd/mcp.json` file exists in the current project
- The config file is malformed JSON
- The server is configured in a different project directory than where you launched LSD

**Fix:**
- Add the server to `.mcp.json` or `.lsd/mcp.json`
- Verify the file parses as JSON
- Re-run `mcp_servers(refresh=true)`

### `mcp_discover` times out

**Common causes:**
- The server process starts but never completes the MCP handshake
- The server is waiting on an unavailable dependency or backend service

**Fix:**
- Run the configured command directly outside LSD to confirm the server starts
- Check that any backend URLs or required services are reachable

### `mcp_discover` reports connection closed

**Common causes:**
- Wrong executable path or script path
- Missing runtime dependency
- The server crashes before responding

**Fix:**
- Verify `command` and `args` paths are correct and absolute
- Run the command manually to catch import/runtime errors

### Local stdio server works manually but not in LSD

**Common causes:**
- The server depends on shell state that LSD doesn't inherit
- Required environment variables exist in your shell but not in the MCP config

**Fix:**
- Use absolute paths for `command` and script arguments
- Set required environment variables in the MCP config's `env` block

## Recovery Procedures

### Reset auto mode state

```bash
rm .lsd/auto.lock
rm .lsd/completed-units.json
```

Then `/gsd auto` to restart from current disk state.

### Reset routing history

If adaptive model routing is producing bad results, clear the routing history:

```bash
rm .lsd/routing-history.json
```

### Full state rebuild

```
/gsd doctor
```

Doctor rebuilds `STATE.md` from plan and roadmap files on disk and fixes detected inconsistencies.

## LSP (Language Server Protocol)

### "LSP isn't available in this workspace"

LSD auto-detects language servers based on project files (e.g. `package.json` → TypeScript, `Cargo.toml` → Rust, `go.mod` → Go).

**Check status:**
```
lsp status
```

**Common fixes:**

| Project type | Install command |
|-------------|-----------------|
| TypeScript/JavaScript | `npm install -g typescript-language-server typescript` |
| Python | `pip install pyright` or `pip install python-lsp-server` |
| Rust | `rustup component add rust-analyzer` |
| Go | `go install golang.org/x/tools/gopls@latest` |

After installing, run `lsp reload` to restart detection without restarting LSD.

## Notifications

### Notifications not appearing on macOS

**Cause:** LSD uses `osascript display notification` as a fallback on macOS. This command is attributed to your terminal app. If that app doesn't have notification permissions in System Settings → Notifications, macOS silently drops the notification.

**Fix (recommended):** Install `terminal-notifier`:

```bash
brew install terminal-notifier
```

LSD automatically prefers `terminal-notifier` when available.

**Verify:**
```bash
terminal-notifier -title "LSD" -message "working!" -sound Glass
```

## iTerm2-Specific Issues

### Ctrl+Alt shortcuts trigger the wrong action

**Cause:** iTerm2's default Left Option Key setting is "Normal", which swallows the Alt modifier for Ctrl+Alt key combinations.

**Fix:** In iTerm2, go to **Profiles → Keys → General** and set **Left Option Key** to **Esc+**.

## Windows-Specific Issues

### LSP returns ENOENT on Windows (MSYS2/Git Bash)

**Cause:** The `which` command in MSYS2/Git Bash returns POSIX paths that Node.js `spawn()` can't resolve.

**Fix:** Use `where.exe` on Windows. Ensure you're on a recent version of LSD.

### EBUSY errors during builds

**Cause:** Antivirus, indexers, or editors can briefly lock files as LSD performs atomic renames.

**Fix:** Re-run the operation; most transient lock races clear quickly. Close tools that may be holding the file open.

## Getting Help

- **GitHub Issues:** Check the project's GitHub Issues for known problems
- **Dashboard:** `Ctrl+Alt+G` or `/gsd status` for real-time diagnostics
- **Forensics:** `/gsd forensics` for structured post-mortem analysis of auto-mode failures
- **Session logs:** `.lsd/activity/` contains JSONL session dumps for crash forensics
