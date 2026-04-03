# Migration

## From GSD (`.gsd/` directories)

If you have projects using the GSD format (`.gsd/` directories), LSD is compatible. The `.lsd/` directory is the preferred project config dir, but LSD can work with existing `.gsd/` state.

To migrate a `.gsd/` project to `.lsd/`:

```bash
/gsd migrate
```

Or specify a path:

```bash
/gsd migrate ~/projects/my-old-gsd-project
```

## From LSD v1 (`.planning` directories)

If you have projects with `.planning` directories from the original LSD v1, you can migrate them to the current format.

## Running the Migration

```bash
# From within the project directory
/gsd migrate

# Or specify a path
/gsd migrate ~/projects/my-old-project
```

## What Gets Migrated

The migration tool:

- Parses your old `PROJECT.md`, `ROADMAP.md`, `REQUIREMENTS.md`, phase directories, plans, summaries, and research
- Maps phases → slices, plans → tasks, milestones → milestones
- Preserves completion state (`[x]` phases stay done, summaries carry over)
- Consolidates research files into the new structure
- Shows a preview before writing anything
- Optionally runs an agent-driven review of the output for quality assurance

## Supported Formats

The migration handles various v1 format variations:

- Milestone-sectioned roadmaps with `<details>` blocks
- Bold phase entries
- Bullet-format requirements
- Decimal phase numbering
- Duplicate phase numbers across milestones

## Requirements

Migration works best with a `ROADMAP.md` file for milestone structure. Without one, milestones are inferred from the `phases/` directory.

## Post-Migration

After migrating, verify the output with:

```
/gsd doctor
```

This checks `.lsd/` integrity and flags any structural issues.

## Naming and Compatibility

LSD evolved from GSD and some internals still use `/gsd` command names for compatibility. The project state directory is `.lsd/` (with `.gsd/` supported for legacy projects). User config lives at `~/.lsd/`.

When updating docs or onboarding material, prefer:

- **LSD** for the product name
- **`lsd`** for the CLI command
- **`.lsd/`** for project state
- **`~/.lsd/`** for global state
