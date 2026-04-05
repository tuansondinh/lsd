# Troubleshooting LSD

## Diagnostic Tools

### Quick Health Check

```bash
lsd doctor
```

Checks:
- Node.js version
- Git configuration
- API keys validity
- Config file syntax
- Extension loading
- Disk space

Fix output immediately if any FAIL.

### Detailed System Info

```bash
lsd forensics
```

Dumps:
- Full config
- Environment variables
- Installed models
- Available extensions
- Session metadata
- Token usage

Use when debugging complex issues.

## Common Issues & Solutions

### "Command not found: lsd"

**Problem:** `lsd` binary not in PATH after install.

**Solutions:**

1. Check npm global bin:
```bash
npm prefix -g
echo $PATH
```

2. Add to PATH if missing:
```bash
# Find bin directory
NPM_BIN=$(npm prefix -g)/bin

# Add to ~/.zshrc or ~/.bashrc
export PATH="$NPM_BIN:$PATH"

# Reload shell
source ~/.zshrc
```

3. Reinstall globally:
```bash
npm uninstall -g lsd-pi
npm install -g lsd-pi@latest
```

### "API key rejected"

**Problem:** Authentication fails with valid-looking key.

**Solutions:**

1. **Verify key format:**
   - Anthropic: starts with `sk-ant-`
   - OpenAI: starts with `sk-`
   - Google: JSON object or API key
   - Check for extra whitespace

2. **Validate permissions:**
   - Visit provider dashboard
   - Check key hasn't expired
   - Verify key has correct scopes

3. **Re-run setup:**
```bash
lsd config
# Follow prompts, re-enter key
```

4. **Try environment variable:**
```bash
ANTHROPIC_API_KEY=sk-ant-... lsd
```

If that works, key is valid — issue is with config file.

### "Session won't resume"

**Problem:** `lsd -c` doesn't load previous session.

**Solutions:**

1. **Check if sessions exist:**
```bash
ls ~/.lsd/sessions/
```

Should show `.json` files with session IDs.

2. **List available sessions:**
```
/sessions list
```

3. **Resume specific session:**
```
/sessions resume <id>
```

4. **Clear and start fresh:**
```bash
lsd -c --clear-history
```

5. **Check disk space:**
```bash
df ~/.lsd/
```

If full, delete old sessions:
```bash
rm ~/.lsd/sessions/old_id.json
```

### "Too much context / token limit exceeded"

**Problem:** Agent complains about context size.

**Solutions:**

1. **Reduce max context:**
```json
{
  "maxContextTokens": 50000
}
```

2. **Use speed token profile:**
```json
{
  "tokenProfile": "speed"
}
```

3. **Clear session history:**
```bash
lsd -c --clear-history
```

4. **Start fresh session:**
```bash
lsd
```

5. **Check file size limits:**
```bash
# List large files in project
find . -type f -size +1M
```

### "Web search not working"

**Problem:** `/web-search` command fails or no results.

**Solutions:**

1. **Verify web search is enabled:**
```json
{
  "enableWebSearch": true,
  "webSearchProvider": "brave"
}
```

2. **Check API key:**
```bash
lsd doctor
```

Should show web search API key status.

3. **Verify provider:**
```json
{
  "webSearchProvider": "brave"  // or "tavily" or "built-in"
}
```

4. **Try built-in search:**
```json
{
  "webSearchProvider": "built-in"
}
```

5. **Check network:**
```bash
curl https://api.search.brave.com/
```

### "Skills not loading"

**Problem:** `/skill lint` says skill not found.

**Solutions:**

1. **Check skill exists:**
```bash
ls ~/.lsd/skills/
ls .lsd/skills/
```

2. **Verify skill is valid:**
```bash
cat ~/.lsd/skills/lint/SKILL.md | head -5
```

Should start with YAML frontmatter.

3. **List available skills:**
```
/skills
```

4. **Load bundled skill instead:**
```
/skill lint
```

If this works, custom skill has an issue.

5. **Check skill syntax:**
Look for YAML errors in SKILL.md.

### "Auto-mode stuck or looping"

**Problem:** Auto-mode won't finish or loops infinitely.

**Solutions:**

1. **Pause execution:**
```bash
Ctrl+C
```

2. **Check what happened:**
```bash
lsd -c
```

View the session to see where it stuck.

3. **View recent output:**
```bash
lsd forensics | tail -100
```

4. **Revert bad changes:**
```bash
git checkout HEAD~1
lsd -c
```

5. **Manual steering:**
Provide explicit guidance when resumed:
```
I was stuck here because X.
Please try Y instead.
```

### "Extension fails to load"

**Problem:** Custom extension throws error.

**Solutions:**

1. **Check extension syntax:**
```bash
node -c .lsd/extensions/my-ext/index.js
```

2. **View error details:**
```bash
lsd forensics
```

Search for "extension" errors.

3. **Test extension in isolation:**
```bash
node -e "require('./.lsd/extensions/my-ext/index.js')"
```

4. **Check extension exports:**
```javascript
// Must export default function(pi: ExtensionAPI)
export default function(pi) {
  // register tools, commands, etc.
}
```

5. **Restart LSD to reload:**
```bash
lsd
```

### "Out of memory / crash"

**Problem:** LSD process crashes with OOM.

**Solutions:**

1. **Increase Node memory:**
```bash
NODE_OPTIONS=--max-old-space-size=4096 lsd
```

2. **Reduce max context:**
```json
{
  "maxContextTokens": 30000
}
```

3. **Close other applications:**
Free up system memory.

4. **Clear cache:**
```bash
rm -rf ~/.lsd/cache
lsd doctor
```

5. **Check for large sessions:**
```bash
du -sh ~/.lsd/sessions/*
```

Delete very large session files.

### "Git worktree error"

**Problem:** `lsd -w` fails or behaves oddly.

**Solutions:**

1. **Check git status:**
```bash
git status
```

Must be in a git repository.

2. **Clean up old worktrees:**
```bash
git worktree list
git worktree prune
```

3. **Remove stale worktree:**
```bash
git worktree remove -f path/to/worktree
```

4. **Try manual worktree:**
```bash
git worktree add ../lsd-work
cd ../lsd-work
lsd
```

### "Model not found"

**Problem:** Specified model doesn't exist.

**Solutions:**

1. **List available models:**
```
/models
```

2. **Check model in config:**
```bash
lsd forensics | grep -A 10 "models"
```

3. **Verify custom model definition:**
```json
{
  "providers": {
    "ollama": {
      "models": {
        "neural-chat": {  // Must exist locally
          "name": "neural-chat:7b"
        }
      }
    }
  }
}
```

4. **Fallback to default:**
```bash
lsd --model gpt-4
```

### "Subagent never completes"

**Problem:** Background subagent runs forever.

**Solutions:**

1. **Check job status:**
```
/subagents info sa_xxxxx
```

2. **Check output so far:**
```
/subagents output sa_xxxxx
```

3. **Cancel and retry:**
```
/subagents cancel sa_xxxxx
```

4. **Check disk space:**
```bash
df ~/.lsd/
```

5. **Check for infinite loops:**
```
/subagents output sa_xxxxx | tail -20
```

Look for repeating patterns.

## Performance Issues

### "LSD is slow"

**Solutions:**

1. **Use speed profile:**
```json
{
  "tokenProfile": "speed"
}
```

2. **Reduce context:**
```json
{
  "maxContextTokens": 30000
}
```

3. **Disable web search:**
```json
{
  "enableWebSearch": false
}
```

4. **Check system resources:**
```bash
top
```

5. **Close other applications:**

### "Responses take too long"

**Solutions:**

1. **Try a faster model:**
```bash
lsd --model gpt-4-turbo
```

2. **Check network:**
```bash
ping api.anthropic.com
```

3. **Check API quotas:**
Visit provider dashboard.

4. **Use local model:**
```bash
lsd --model ollama:neural-chat
```

## Configuration Issues

### "Settings not applying"

**Solutions:**

1. **Check config precedence:**
Environment vars > Project config > User config > Defaults

2. **Verify JSON syntax:**
```bash
node -e "console.log(require('~/.lsd/settings.json'))"
```

3. **Restart LSD:**
```bash
lsd
```

4. **Check for typos:**
Common: `Provider` vs `provider`, `tokenProfile` vs `TokenProfile`

### "Project config not loading"

**Solutions:**

1. **Verify `.lsd/settings.json` exists:**
```bash
cat .lsd/settings.json
```

2. **Check validity:**
```bash
node -e "console.log(require('./.lsd/settings.json'))"
```

3. **Run from project root:**
```bash
cd /path/to/project
lsd
```

## Getting Help

**Quick diagnosis:**
```bash
lsd doctor
```

**Detailed info:**
```bash
lsd forensics > debug.log
# Share debug.log for support
```

**Check logs:**
```bash
tail -f ~/.lsd/logs/  # if exists
```

**Ask for help:**
- GitHub Issues
- Discord community
- Stack Overflow tag: `lsd-pi`

## Emergency Recovery

### "Completely broken, need fresh start"

```bash
# Backup old config
mv ~/.lsd ~/.lsd.backup

# Start fresh
lsd config

# Or restore specific files
cp ~/.lsd.backup/settings.json ~/.lsd/
```

### "Can't restart LSD"

Kill any hanging processes:
```bash
pkill -f "node.*lsd"
pkill -f "lsd-cli"
```

Then restart:
```bash
lsd
```

### "Restore from backup"

```bash
# List backups
ls -la ~/.lsd.backup*

# Restore specific version
cp -r ~/.lsd.backup ~/.lsd
```

## See Also

- `references/getting-started.md` — Installation help
- `references/configuration.md` — Config reference
- `references/commands.md` — Command reference
- `/lsd doctor` — Automated health check
