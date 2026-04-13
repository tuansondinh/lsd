# Todo

- [ ] Check that auto memory really uses budget model
- [ ] Slim down commands / refactor
- [ ] Add reviewer subagent 
- [ ] Add fast mode for Codex/GPT (single toggle that sets model to gpt-5.4-mini, tokenProfile: speed, permissionMode: auto)
- [ ] Reduce large-context CLI lag further: current footer/context-usage cache helps steady-state redraws, but full chat rebuild path still causes spikes on session switch/fork/resume/new session; inspect `packages/pi-coding-agent/src/modes/interactive/interactive-mode.ts` `rebuildChatFromMessages()` and incrementalize `chat-controller.ts` session-state handling
- [ ] Maestro MCP server (configured in `~/.lsd/mcp.json`) is not loaded in sessions — only project-level MCP servers are active; user-level MCP config needs to be picked up at startup so `maestro` server is available as an MCP tool

