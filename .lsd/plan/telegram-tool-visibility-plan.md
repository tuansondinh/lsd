# Telegram tool visibility plan

## Goal
Improve Telegram live relay tool messages so they show meaningful execution details, especially exact bash commands.

## Scope
- Keep current compact relay behavior.
- Add per-tool argument formatting on `tool_execution_start`.
- Add richer completion messages on `tool_execution_end`.
- Prioritize `bash`, `read`, `edit`, `write`, `lsp`, and browser tools.

## Plan
1. Add a formatter that maps `{ toolName, args }` to a compact Telegram-safe detail string.
2. Update start messages to include tool details, especially `bash.command`.
3. Update end messages to include result context where safe:
   - `bash`: exit code when available
   - file tools: target path
   - fallback to tool name only when no useful args exist
4. Keep batching behavior but preserve multi-line details.
5. Typecheck, build, and sync the extension.

## Expected result
Telegram tool relay should show messages like:
- `🔧 bash started\n$ git status --short`
- `✅ bash finished (exit 0)\n$ git status --short`
- `🔧 read started\npackage.json`
- `✏️ edit started\nsrc/foo.ts`
