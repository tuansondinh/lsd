# Telegram next improvements plan

## Goal
Upgrade the Telegram live relay from a basic chat bridge into a more complete remote-control surface for LSD.

## Priority order
1. Real slash-command passthrough
2. Richer tool execution details
3. Streaming assistant updates in Telegram
4. Telegram UX/help/status polish
5. Reliability hardening
6. Tests

---

## 1. Real slash-command passthrough

### Problem
Telegram messages that begin with `/` are currently mostly treated as plain forwarded chat text, except for a few relay-local commands like `/status`, `/disconnect`, and `/help`.

### Target behavior
Support real slash commands from Telegram, including commands like:
- `/clear`
- `/reload`
- `/compact`
- `/model ...`
- `/lsd ...`
- extension slash commands already registered in LSD

### Implementation plan
- Add a runtime API for extensions to execute slash commands directly instead of forwarding them as plain user text.
- Bind that API to the real interactive slash dispatcher in interactive mode.
- In the Telegram relay:
  - keep relay-local commands (`/status`, `/disconnect`, `/help`)
  - route other `/...` messages through the new slash-command execution path
  - if a slash command is unknown, reply in Telegram that it is unknown instead of forwarding it as ordinary chat text

### Acceptance criteria
- Sending `/clear` from Telegram starts a fresh session.
- Sending `/reload` from Telegram reloads runtime resources.
- Sending a known extension command from Telegram executes it.
- Unknown slash commands do not get forwarded to the LLM as normal chat.

---

## 2. Richer tool execution details

### Problem
Telegram currently reports tool calls too vaguely.
Example:
- `bash started`
- `bash finished`

### Target behavior
Show useful per-tool details, especially exact commands and file paths.

### Implementation plan
- Format `tool_execution_start` with tool-specific details:
  - `bash`: exact command
  - `read` / `edit` / `write`: path
  - `lsp`: action + file/query
  - `browser_*`: url/selector/text when relevant
- Format `tool_execution_end` with:
  - status icon
  - exit code for `bash` when available
  - same tool detail reused from start-time args
- Preserve batching to avoid Telegram spam.

### Acceptance criteria
- Telegram shows `$ git status --short` for bash calls.
- Telegram shows file paths for file tools.
- Telegram finish messages preserve context from start messages.

---

## 3. Streaming assistant updates in Telegram

### Problem
Telegram mostly gets final assistant replies, so remote use feels less live.

### Target behavior
Telegram should visibly show that LSD is responding before the final answer lands.

### Implementation plan
- Listen to assistant `message_start`, `message_update`, and `message_end` events.
- Create a draft Telegram message when the assistant starts responding.
- Periodically edit that Telegram message with partial assistant text.
- Finalize the message on `message_end`.
- Fall back to chunked final sends for long outputs.

### Acceptance criteria
- Telegram shows incremental reply progress for assistant messages.
- Final answer is not duplicated.
- Long answers still deliver safely when exceeding Telegram limits.

---

## 4. Telegram UX/help/status polish

### Problem
Telegram help/status output is still sparse and relay-specific.

### Improvements
- Expand `/help` text to explain:
  - relay-local commands
  - slash-command passthrough
  - normal chat behavior
- Improve `/status` to show:
  - connected / awaiting handshake
  - session key
  - current chat id
- Make handshake and connect messages clearer.

### Acceptance criteria
- Telegram help clearly explains available behaviors.
- Status gives enough info to debug connection state remotely.

---

## 5. Reliability hardening

### Problem
Remote usage needs better protection against noisy or flaky conditions.

### Improvements
- Add throttling for partial message edits.
- Prevent duplicate assistant sends when streaming + final send overlap.
- Keep tool event batching bounded.
- Handle Telegram API edit failures gracefully by falling back to normal send.

### Acceptance criteria
- No repeated duplicate replies during streaming.
- Relay remains usable under bursty tool activity.

---

## 6. Tests

### Missing coverage
- Slash-command passthrough
- Unknown slash-command handling
- Tool formatting behavior
- Streaming relay behavior

### Plan
- Add focused tests for formatter helpers first.
- Add integration-style tests for relay command routing where feasible.

### Acceptance criteria
- Core Telegram relay behavior is covered by automated tests.

---

## Execution order for this work session

### Phase A
- Implement slash-command passthrough core plumbing
- Wire relay to use it
- Verify build

### Phase B
- Keep richer tool details in place and expand if needed
- Verify examples manually

### Phase C
- Add assistant streaming updates
- Verify no duplication on final answer

### Phase D
- Improve `/help` and `/status`
- Build and sync extension

### Phase E
- Add or sketch tests if time remains

---

## Deliverables
- Core runtime support for Telegram-triggered slash commands
- Telegram relay with real slash-command execution
- Richer Telegram tool event messages
- Streaming assistant updates in Telegram
- Updated Telegram help/status text
- Successful typecheck/build and extension sync
