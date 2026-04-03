# LSD Documentation

Welcome to the LSD documentation. This covers everything from getting started to advanced configuration, auto-mode internals, and extending LSD with the Pi SDK.

## User Documentation

| Guide | Description |
|-------|-------------|
| [Getting Started](./getting-started.md) | Installation, first run, and basic usage |
| [Auto Mode](./auto-mode.md) | How autonomous execution works — the state machine, crash recovery, and steering |
| [Commands Reference](./commands.md) | All commands, keyboard shortcuts, and CLI flags |
| [Remote Questions](./remote-questions.md) | Discord, Slack, and Telegram integration for headless auto-mode |
| [Configuration](./configuration.md) | Preferences, model selection, git settings, and token profiles |
| [Custom Models](./custom-models.md) | Add custom providers (Ollama, vLLM, LM Studio, proxies) via models.json |
| [Token Optimization](./token-optimization.md) | Token profiles, context compression, complexity routing, and adaptive learning |
| [Dynamic Model Routing](./dynamic-model-routing.md) | Complexity-based model selection, cost tables, escalation, and budget pressure |
| [Captures & Triage](./captures-triage.md) | Fire-and-forget thought capture during auto-mode with automated triage |
| [Workflow Visualizer](./visualizer.md) | Interactive TUI overlay for progress, dependencies, metrics, and timeline |
| [Cost Management](./cost-management.md) | Budget ceilings, cost tracking, projections, and enforcement modes |
| [Parallel Orchestration](./parallel-orchestration.md) | Run multiple milestones simultaneously with worker isolation and coordination |
| [Working in Teams](./working-in-teams.md) | Unique milestone IDs, `.gitignore` setup, and shared planning artifacts |
| [Skills](./skills.md) | Bundled skills, skill discovery, and custom skill authoring |
| [Migration from GSD](./migration.md) | Migrating from GSD `.gsd/` directories or the original LSD v1 `.planning` format |
| [Troubleshooting](./troubleshooting.md) | Common issues, `/lsd doctor`, `/lsd forensics`, and recovery procedures |
| [VS Code Extension](../vscode-extension/README.md) | Chat participant, sidebar dashboard, and RPC integration for VS Code |

## Architecture & Internals

| Guide | Description |
|-------|-------------|
| [Architecture Overview](./architecture.md) | System design, extension model, state-on-disk, and dispatch pipeline |
| [File System Map](./FILE-SYSTEM-MAP.md) | Annotated map of every source file and subsystem |
| [Native Engine](../native/README.md) | Rust N-API modules for performance-critical operations |
| [ADR-001: Branchless Worktree Architecture](./ADR-001-branchless-worktree-architecture.md) | Decision record for the git worktree architecture |
| [ADR-003: Pipeline Simplification](./ADR-003-pipeline-simplification.md) | Research merged into planning, mechanical completion |
| [ADR-004: Capability-Aware Model Routing](./ADR-004-capability-aware-model-routing.md) | Extend routing from tier/cost selection to task-capability matching |

## Pi SDK Documentation

These guides cover the underlying Pi SDK that LSD is built on. Useful if you want to extend LSD or build your own agent application.

| Guide | Description |
|-------|-------------|
| [What is Pi](./what-is-pi/README.md) | Core concepts — modes, agent loop, sessions, tools, providers |
| [Extending Pi](./extending-pi/README.md) | Building extensions — tools, commands, UI, events, state |
| [Context & Hooks](./context-and-hooks/README.md) | Context pipeline, hook reference, inter-extension communication |
| [Pi UI / TUI](./pi-ui-tui/README.md) | Terminal UI components, theming, keyboard input, rendering |

## Research

| Guide | Description |
|-------|-------------|
| [Building Coding Agents](./building-coding-agents/README.md) | Research notes on agent design — decomposition, context engineering, cost/quality tradeoffs |
