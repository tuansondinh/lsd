# LSD Commands Reference

## CLI Commands

### Main Commands

**Start interactive session:**
```bash
lsd
```

**One-shot execution (non-interactive):**
```bash
lsd --print "what does app.ts do?"
lsd --print "write a quick sort function"
```

**Auto-mode (autonomous execution):**
```bash
lsd -a "implement dark mode"
lsd --auto "fix all linting errors"
```

**Isolated worktree (safe branching):**
```bash
lsd -w
lsd --worktree
```

**Resume last session:**
```bash
lsd -c
lsd --continue
```

**Configuration wizard:**
```bash
lsd config
```

**Show help:**
```bash
lsd -h
lsd --help
```

**Show version:**
```bash
lsd --version
```

### Diagnostic Commands

**Health check:**
```bash
lsd doctor
```

Checks:
- Node.js version
- Git setup
- API keys validity
- Config file integrity
- Extension loading

**Detailed diagnostics:**
```bash
lsd forensics
```

Dumps:
- Full config
- Installed extensions
- Available models
- Session metadata
- Environment variables

## Slash Commands (In-Session)

Slash commands are available in interactive mode and some auto-mode contexts.

### Help & Info

**Show available commands:**
```
/help
```

**Show command help:**
```
/help <command>
/help skill
/help subagent
```

**Show available skills:**
```
/skills
```

**Show available models:**
```
/models
```

### Skills

**Load a skill:**
```
/skill <name>
/skill lint
/skill react-best-practices
/skill accessibility
```

Skill provides specialized guidance. See `references/skills.md` for all bundled skills.

### Subagents

**List background subagents:**
```
/subagents list
/subagents
```

**Wait for background work to finish:**
```
/subagents wait
/subagents wait sa_xxxxx    # Wait for specific job
```

**Cancel a background job:**
```
/subagents cancel sa_xxxxx
```

**View job output:**
```
/subagents output sa_xxxxx
```

**Get job details:**
```
/subagents info sa_xxxxx
```

### Sessions

**List sessions:**
```
/sessions
/sessions list
```

**Resume a session:**
```
/sessions resume <id>
```

**Delete a session:**
```
/sessions delete <id>
```

**Show current session info:**
```
/sessions info
```

### LSD System

**Run diagnostics:**
```
/lsd doctor
```

**Detailed system info:**
```
/lsd forensics
```

**Clear cache:**
```
/lsd clear-cache
```

**Check syntax:**
```
/lsd validate
```

## Keyboard Shortcuts

**Universal:**
- `Ctrl+C` — Abort current operation or exit
- `Ctrl+D` — Exit without saving (if prompted)

**In Interactive Mode:**
- `Tab` — Auto-complete commands
- `Ctrl+L` — Clear screen
- `Ctrl+R` — Reverse search through history
- `Ctrl+K` — Open command palette (if available)
- `Ctrl+B` — Move foreground subagent to background

**Editor (if enabled):**
- `Ctrl+A` — Select all
- `Ctrl+X` — Cut
- `Ctrl+C` — Copy
- `Ctrl+V` — Paste
- `Ctrl+Z` — Undo

**Navigation:**
- `PageUp` / `PageDown` — Scroll through history
- `Home` — Jump to start of input
- `End` — Jump to end of input

## CLI Flags & Options

### Execution Mode

```bash
-a, --auto              # Auto mode (autonomous)
-p, --print             # One-shot mode (no session)
-c, --continue          # Resume last session
-w, --worktree          # Use isolated git worktree
```

### Input/Output

```bash
--print <prompt>        # Execute prompt and exit
--file <path>           # Read prompt from file
--output <format>       # Output format: json, markdown, text
--quiet                 # Suppress progress output
--verbose               # Verbose logging
```

### Configuration

```bash
--model <name>          # Override default model
--provider <name>       # Override LLM provider
--permission-mode <m>   # Override permission mode
--cwd <path>            # Set working directory
--config <path>         # Use custom config file
```

### Session Management

```bash
--session <id>          # Use specific session ID
--session-name <name>   # Name for new session
--clear-history         # Start fresh (no history)
--no-save               # Don't persist session
```

### Advanced

```bash
--json-mode             # Force JSON output from agent
--no-color              # Disable colored output
--debug                 # Enable debug logging
--trace                 # Full execution trace
--profile               # Show performance metrics
```

## Environment Variables

**Provider & Auth:**
```bash
LSD_API_KEY             # Primary API key
ANTHROPIC_API_KEY       # Claude API key
OPENAI_API_KEY          # OpenAI API key
GOOGLE_API_KEY          # Google API key
```

**Behavior:**
```bash
LSD_PERMISSION_MODE     # interactive|audited|auto
LSD_AUTO_MODE           # true|false
LSD_OFFLINE             # true|false (no web search)
LSD_SKIP_SETUP          # true|false (skip wizard)
```

**Configuration:**
```bash
LSD_HOME                # Override ~/.lsd/
LSD_CONFIG_DIR          # Custom config directory
LSD_DEBUG               # Enable debug mode
LSD_LOG_LEVEL           # trace|debug|info|warn|error
```

**Performance:**
```bash
LSD_CACHE_DIR           # Custom cache location
LSD_MAX_CONTEXT_TOKENS  # Override token limit
LSD_NO_COLOR            # Disable colored output
```

## Command Composition

### Piping Between Commands

LSD doesn't use Unix pipes, but commands can reference previous results:

```
/skill lint               # Load linting skill
<make edit>
/skill lint               # Re-run linting on new code
```

### Running Multiple Commands

In auto-mode or with scripts:
```bash
lsd -a "
1. Lint the code
2. Run tests
3. Fix any errors
4. Commit changes
"
```

### Conditional Execution

Not directly supported, but use `/subagents` for orchestration:
```
subagent(agent: "planner", task: "plan the feature")
subagent(agent: "worker", task: "implement: {previous}")
```

## Common Workflows

**Fix all linting errors:**
```bash
lsd --print "use the lint skill to find and fix all issues"
```

**Review code against best practices:**
```bash
lsd --print "
Load react-best-practices skill.
Review src/components/Button.tsx for violations.
"
```

**Auto-solve a problem:**
```bash
lsd -a "add dark mode support to the UI"
```

**Work safely in isolation:**
```bash
lsd -w
<make changes>
git checkout main
```

## Exiting LSD

**In interactive mode:**
- Type `exit` or press `Ctrl+C`

**Discard changes:**
- Press `Ctrl+D` when prompted

**Save & exit:**
- Normal exit saves session automatically

**Clear session history:**
```bash
lsd -c --clear-history
```
