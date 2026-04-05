# Skills — Reusable Capabilities

## What Are Skills?

Skills are **packaged, reusable capabilities** that provide specialized knowledge or workflows. They combine:
- **Prompts** — Domain expertise
- **References** — Detailed knowledge
- **Workflows** — Step-by-step procedures
- **Templates** — Output structures

Use skills to augment the agent with specialized knowledge.

## Loading Skills

**In interactive mode:**
```
/skill lint
/skill react-best-practices
/skill accessibility
```

**In one-shot mode:**
```bash
lsd --print "use the lint skill to check src/app.ts"
```

**In auto-mode:**
```bash
lsd -a "
use the accessibility skill to audit the website for WCAG violations
"
```

## Bundled Skills

LSD comes with these skills:

| Skill | Purpose |
|-------|---------|
| `lint` | Lint and format code (ESLint, Prettier, Biome) |
| `test` | Generate or run tests (Jest, Vitest, etc.) |
| `review` | Code review for security, performance, quality |
| `accessibility` | WCAG 2.1 audit and improvements |
| `react-best-practices` | React/Next.js performance patterns |
| `react-components` | Convert designs to React components |
| `frontend-design` | Production-grade web UI creation |
| `web-quality-audit` | Performance, SEO, accessibility audit |
| `code-optimizer` | Find performance bottlenecks and anti-patterns |
| `best-practices` | General web development best practices |
| `make-interfaces-feel-better` | UI polish and micro-interactions |
| `gh` | GitHub CLI setup and operations |
| `github-workflows` | GitHub Actions CI/CD workflows |
| `debug-like-expert` | Deep analysis debugging mode |

## Skill Structure

**Simple skill** (single file):
```
skill-name/
└── SKILL.md
```

**Complex skill** (router pattern):
```
skill-name/
├── SKILL.md               # Router & essential principles
├── workflows/             # Step-by-step procedures
│   ├── create-new.md
│   ├── review.md
│   └── fix.md
├── references/            # Domain knowledge
│   ├── patterns.md
│   ├── best-practices.md
│   └── common-errors.md
├── templates/             # Output structures
│   ├── plan.md
│   └── report.md
└── scripts/               # Executable code
    ├── deploy.sh
    └── setup.js
```

## Creating Custom Skills

### Project-Local Skill

Create in `.lsd/skills/my-skill/`:

```bash
mkdir -p .lsd/skills/my-skill
```

Create `SKILL.md`:
```markdown
---
name: my-skill
description: What this skill does and when to use it.
---

# My Skill

<objective>What this skill helps with</objective>

<process>
Step-by-step procedure for using this skill.
</process>

<success_criteria>
How to know it worked.
</success_criteria>
```

### User-Wide Skill

Create in `~/.lsd/skills/my-skill/` for all projects.

### Load Custom Skill

```
/skill my-skill
```

LSD searches in order:
1. Project `.lsd/skills/`
2. User `~/.lsd/skills/`
3. Bundled skills

## Skill Authoring Best Practices

### 1. Clear Name & Description

Bad:
```yaml
name: tool
description: Useful for things
```

Good:
```yaml
name: react-optimization
description: Performance optimization for React components. Use when reviewing React code for render efficiency, bundle size, or runtime performance.
```

### 2. Essential Principles Inline

Keep critical knowledge in SKILL.md, not external files.

```xml
<essential_principles>
- Always use Server Components by default in Next.js
- Client Components needed only for interactivity
- Minimize bundle by code-splitting heavy imports
</essential_principles>
```

### 3. Progressive Disclosure

Put detailed content in `references/` so SKILL.md stays under 500 lines.

SKILL.md:
```xml
<quick_start>
Use this skill when reviewing React/Next.js code for performance issues.
</quick_start>

<process>
1. Load skill: /skill react-best-practices
2. Show me your component
3. I'll identify performance issues
4. Read references/rules/ for context on each violation
</process>
```

### 4. Use XML Tags (No Markdown Headings)

Bad:
```markdown
# Quick Start
## Step 1

Content...
```

Good:
```xml
<quick_start>
Content...
</quick_start>

<step1>
Content...
</step1>
```

## Skill Examples

### Example 1: Simple Linting Skill

```
.lsd/skills/custom-lint/SKILL.md
```

```markdown
---
name: custom-lint
description: Lint TypeScript code for team conventions.
---

<objective>Enforce consistent code style</objective>

<process>
1. Run ESLint with team config
2. Report all violations with file:line
3. Suggest fixes with explanations
</process>

<success_criteria>
All violations reported and fixable violations have suggestions.
</success_criteria>
```

### Example 2: Complex Skill with Workflows

```
.lsd/skills/api-design/
├── SKILL.md
├── workflows/
│   ├── design-new-endpoint.md
│   ├── review-endpoint.md
│   └── migrate-endpoint.md
└── references/
    ├── rest-principles.md
    ├── error-handling.md
    └── versioning.md
```

SKILL.md:
```markdown
---
name: api-design
description: RESTful API design patterns and best practices.
---

<essential_principles>
- Resources are nouns: /users, /posts
- Methods are verbs: GET, POST, PUT, DELETE
- Consistent error format across all endpoints
- Version via URL path: /v1/users
</essential_principles>

<intake>
What do you want to do?
1. Design a new endpoint
2. Review an existing endpoint
3. Migrate an endpoint to v2
</intake>

<routing>
If user chooses 1 → workflows/design-new-endpoint.md
If user chooses 2 → workflows/review-endpoint.md
If user chooses 3 → workflows/migrate-endpoint.md
</routing>
```

## Using Skills Effectively

### Load Early

In complex sessions, load skills at the start:
```
/skill react-best-practices
/skill accessibility
<now ask questions about React performance>
```

### Combine Skills

You can use multiple skills in sequence:
```
/skill lint
<fix linting errors>
/skill test
<ensure tests pass>
/skill react-best-practices
<optimize performance>
```

### Request Specific Rules

If a skill has rules, reference them directly:
```
/skill react-best-practices

Review my component against the "rerender-memo" rule.
```

### Extend with References

When a skill mentions a rule, read the reference:
```
/skill react-best-practices

Show me the async-parallel rule from references/rules/.
```

## Common Skill Workflows

### Code Review with Skills

```
/skill review
/skill react-best-practices
/skill accessibility

Review src/components/Header.tsx
```

### Linting & Formatting

```
/skill lint

Fix all linting errors in src/
```

### Testing

```
/skill test

Generate tests for src/utils/math.ts
```

### Accessibility Audit

```
/skill accessibility

Audit the form at pages/signup.tsx
```

## Where Skills Are Stored

**Bundled skills:**
- `dist/resources/skills/` in the LSD repo

**Project-local:**
- `.lsd/skills/` (highest priority)

**User-wide:**
- `~/.lsd/skills/`

## See Also

- `references/configuration.md` — Configure skill settings
- Pi SDK docs — Build extensions that integrate with skills
- Bundled skill source code — Reference for writing skills
