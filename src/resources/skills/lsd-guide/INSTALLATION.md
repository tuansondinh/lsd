# Installing the LSD Guide Skill

This skill is ready to use immediately!

## Quick Start

The skill is already installed at:
```
.lsd/skills/lsd-guide/
```

Load it anytime in LSD:
```
/skill lsd-guide
```

## Installation Locations

The skill is currently installed as **project-local** (this project only).

### To Make Available User-Wide

Copy the skill to your user skills directory:

```bash
cp -r .lsd/skills/lsd-guide ~/.lsd/skills/lsd-guide
```

Now you can use it in any project:
```bash
cd ~/any-other-project
lsd
# Then: /skill lsd-guide
```

## Verifying Installation

Check that the skill is discoverable:

```bash
lsd
/skills
```

Should list `lsd-guide` among available skills.

Or load it directly:
```bash
/skill lsd-guide
```

Should load without errors.

## What You Get

✅ **Getting Started** — Installation, setup, first run
✅ **Commands** — All CLI commands and shortcuts
✅ **Auto Mode** — Autonomous execution guide
✅ **Skills** — Using bundled and custom skills
✅ **Subagents** — Background agent workflows
✅ **Configuration** — Complete settings reference
✅ **Troubleshooting** — 15+ common issues with solutions

Total: 62 KB of comprehensive LSD documentation in 7 reference files.

## Using the Skill

### Interactive Navigation

```
/skill lsd-guide

Ask any question:
- "How do I install LSD?"
- "What commands can I run?"
- "How does auto-mode work?"
- "What are subagents?"
- "How do I configure LSD?"
- "Something isn't working"

Skill automatically routes to the right reference!
```

### Direct Reference Access

View specific references:
- `references/getting-started.md`
- `references/commands.md`
- `references/auto-mode.md`
- `references/skills.md`
- `references/subagents.md`
- `references/configuration.md`
- `references/troubleshooting.md`

### Reading the Files

Reference files are readable markdown, so you can also:

```bash
# Read directly
cat .lsd/skills/lsd-guide/references/commands.md

# Search for topic
grep -r "worktree" .lsd/skills/lsd-guide/references/
```

## Files Included

```
.lsd/skills/lsd-guide/
├── SKILL.md                    # Router + navigation
├── README.md                   # Skill overview
├── INSTALLATION.md             # This file
├── metadata.json               # Skill metadata
└── references/
    ├── getting-started.md      # (4.6 KB) Installation, setup
    ├── commands.md             # (6.4 KB) CLI commands
    ├── auto-mode.md            # (7.0 KB) Autonomous execution
    ├── skills.md               # (7.0 KB) Skills guide
    ├── subagents.md            # (7.2 KB) Background agents
    ├── configuration.md        # (8.4 KB) Config reference
    └── troubleshooting.md      # (8.8 KB) Problem solving
```

## Updating the Skill

The skill files are plain markdown. You can:

1. **Add new references** — Create `.md` files in `references/`
2. **Update existing content** — Edit any `.md` file directly
3. **Modify routing** — Edit the `<routing>` section in `SKILL.md`

After editing, reload in LSD:
```
/skill lsd-guide
```

## Troubleshooting Installation

### "Skill not found"

Check it exists:
```bash
ls -la .lsd/skills/lsd-guide/
```

Should show:
```
SKILL.md
README.md
INSTALLATION.md
metadata.json
references/
```

### "Error loading skill"

Check SKILL.md syntax (YAML frontmatter):
```bash
head -5 .lsd/skills/lsd-guide/SKILL.md
```

Should start with:
```yaml
---
name: lsd-guide
description: ...
---
```

### "References not loading"

Check reference files exist:
```bash
ls .lsd/skills/lsd-guide/references/
```

Should show all 7 `.md` files.

## Next Steps

1. **Load the skill:**
   ```
   /skill lsd-guide
   ```

2. **Ask a question:**
   - "How do I use auto-mode?"
   - "What's a subagent?"
   - "How do I configure models?"

3. **Read references:**
   - Browse `references/` directory
   - Look for topic of interest
   - Read markdown directly if preferred

4. **Share the skill:**
   ```bash
   cp -r .lsd/skills/lsd-guide ~/.lsd/skills/lsd-guide
   ```

Enjoy learning LSD! 🚀
