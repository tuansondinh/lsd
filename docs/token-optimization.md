# Token Optimization

LSD includes a coordinated token optimization system that can reduce token usage by 40-60% without sacrificing output quality for most workloads. The system has three pillars: **token profiles**, **context compression**, and **complexity-based task routing**.

## Token Profiles

A token profile is a single preference that coordinates model selection, phase skipping, and context compression level. Set it in your preferences:

```yaml
---
version: 1
token_profile: balanced
---
```

Three profiles are available:

### `budget` — Maximum Savings (40-60% reduction)

Optimized for cost-sensitive workflows. Uses cheaper models, skips optional phases, and compresses dispatch context to the minimum needed.

| Dimension | Setting |
|-----------|---------|
| Planning model | Sonnet |
| Execution model | Sonnet |
| Simple task model | Haiku |
| Completion model | Haiku |
| Subagent model | Haiku |
| Milestone research | **Skipped** |
| Slice research | **Skipped** |
| Roadmap reassessment | **Skipped** |
| Context inline level | **Minimal** |

Best for: prototyping, small projects, well-understood codebases, cost-conscious iteration.

### `balanced` — Smart Defaults (default)

The default profile. Keeps the important phases, skips the ones with diminishing returns, and uses standard context compression.

| Dimension | Setting |
|-----------|---------|
| Planning model | User's default |
| Execution model | User's default |
| Simple task model | User's default |
| Completion model | User's default |
| Subagent model | Sonnet |
| Milestone research | Runs |
| Slice research | **Skipped** |
| Roadmap reassessment | Runs |
| Context inline level | **Standard** |

Best for: most projects, day-to-day development.

### `quality` — Full Context (no compression)

Every phase runs. Every context artifact is inlined. No shortcuts.

| Dimension | Setting |
|-----------|---------|
| All models | User's configured defaults |
| All phases | Run |
| Context inline level | **Full** |

Best for: complex architectures, greenfield projects requiring deep research, critical production work.

## Context Compression

Each token profile maps to an **inline level** that controls how much context is pre-loaded into dispatch prompts:

| Profile | Inline Level | What's Included |
|---------|-------------|-----------------|
| `budget` | `minimal` | Task plan, essential prior summaries (truncated). Drops decisions register, requirements, UAT template. |
| `balanced` | `standard` | Task plan, prior summaries, slice plan, roadmap excerpt. Drops some supplementary templates. |
| `quality` | `full` | Everything — all plans, summaries, decisions, requirements, templates, and root files. |

## Complexity-Based Task Routing

LSD classifies each task by complexity and routes it to an appropriate model tier when dynamic routing is enabled. Simple documentation fixes use cheaper models while complex architectural work gets the reasoning power it needs.

> **Prerequisite:** Dynamic routing requires explicit `models` in your preferences. Token profiles set `models` automatically.

> **Ceiling behavior:** When dynamic routing is active, the model configured for each phase acts as a **ceiling**, not a fixed assignment. The router may downgrade to a cheaper model for simpler tasks but never upgrades beyond the configured model.

### How Classification Works

Tasks are classified by analyzing the task plan:

| Signal | Simple | Standard | Complex |
|--------|--------|----------|---------|
| Step count | ≤ 3 | 4-7 | ≥ 8 |
| File count | ≤ 3 | 4-7 | ≥ 8 |
| Description length | < 500 chars | 500-2000 | > 2000 chars |
| Code blocks | — | — | ≥ 5 |
| Signal words | None | Any present | — |

**Signal words** that prevent simple classification: `research`, `investigate`, `refactor`, `migrate`, `integrate`, `complex`, `architect`, `redesign`, `security`, `performance`, `concurrent`, `parallel`, `distributed`, `backward compat`, `migration`, `architecture`, `concurrency`, `compatibility`.

### Unit Type Defaults

Non-task units have built-in tier assignments:

| Unit Type | Default Tier |
|-----------|-------------|
| `complete-slice`, `run-uat` | Light |
| `research-*`, `plan-*`, `execute-task`, `complete-milestone` | Standard |
| `replan-slice`, `reassess-roadmap` | Heavy |

### Budget Pressure

When approaching your budget ceiling, the classifier automatically downgrades tiers:

| Budget Used | Effect |
|------------|--------|
| < 50% | No adjustment |
| 50-75% | Standard → Light |
| 75-90% | Standard → Light |
| > 90% | Everything except Heavy → Light; Heavy → Standard |

## Adaptive Learning (Routing History)

LSD tracks the success and failure of each tier assignment over time and adjusts future classifications accordingly. Data persists in `.lsd/routing-history.json`.

### User Feedback

Use `/gsd rate` to submit feedback on the last completed unit's model tier:

```
/gsd rate over    # model was overpowered — encourage cheaper next time
/gsd rate ok      # model was appropriate — no adjustment
/gsd rate under   # model was too weak — encourage stronger next time
```

Feedback signals are weighted 2× compared to automatic outcomes.

## Prompt Compression

LSD can apply deterministic prompt compression before falling back to section-boundary truncation. This preserves more information when context exceeds the budget.

### Compression Strategy

```yaml
---
version: 1
compression_strategy: compress
---
```

| Strategy | Behavior | Default For |
|----------|----------|------------|
| `truncate` | Drop entire sections at boundaries | `quality` profile |
| `compress` | Apply heuristic text compression first, then truncate if still over budget | `budget` and `balanced` profiles |

Compression removes redundant whitespace, abbreviates verbose phrases, deduplicates repeated content, and removes low-information boilerplate — all deterministically with no LLM calls.

### Context Selection

```yaml
---
version: 1
context_selection: smart
---
```

| Mode | Behavior | Default For |
|------|----------|------------|
| `full` | Inline entire files | `balanced` and `quality` profiles |
| `smart` | Use TF-IDF semantic chunking for large files (>3KB) | `budget` profile |

## Configuration Examples

### Cost-Optimized Setup

```yaml
---
version: 1
token_profile: budget
budget_ceiling: 25.00
models:
  execution_simple: claude-haiku-4-5-20250414
---
```

### Balanced with Custom Models

```yaml
---
version: 1
token_profile: balanced
models:
  planning:
    model: claude-opus-4-6
    fallbacks:
      - openrouter/z-ai/glm-5
  execution: claude-sonnet-4-6
---
```

### Full Quality for Critical Work

```yaml
---
version: 1
token_profile: quality
models:
  planning: claude-opus-4-6
  execution: claude-opus-4-6
---
```

### Per-Phase Overrides

The `token_profile` sets defaults, but explicit preferences always win:

```yaml
---
version: 1
token_profile: budget
phases:
  skip_research: false     # override: keep milestone research
models:
  planning: claude-opus-4-6  # override: use Opus for planning despite budget profile
---
```
