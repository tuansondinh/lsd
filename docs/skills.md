# Skills

Skills are specialized instruction sets that LSD loads when the task matches. They provide domain-specific guidance for the LLM — coding patterns, framework idioms, testing strategies, and tool usage.

Skills follow the open [Agent Skills standard](https://agentskills.io/) and are **not LSD-specific** — they work with Claude Code, OpenAI Codex, Cursor, GitHub Copilot, Windsurf, and 40+ other agents.

## Skill Directories

LSD reads skills from two locations, in priority order:

| Location | Scope | Description |
|----------|-------|-------------|
| `~/.lsd/skills/` | Global | Preferred LSD-global skills directory |
| `.lsd/skills/` (project root) | Project | Recommended project-local skills directory |

Global skills take precedence over project skills when names collide.

## Installing Skills

Skills are installed via the [skills.sh CLI](https://skills.sh):

```bash
# Interactive — choose skills and target agents
npx skills add dpearson2699/swift-ios-skills

# Install specific skills non-interactively
npx skills add dpearson2699/swift-ios-skills --skill swift-concurrency --skill swiftui-patterns -y

# Install all skills from a repo
npx skills add dpearson2699/swift-ios-skills --all

# Check for updates
npx skills check

# Update installed skills
npx skills update
```

### Available Skill Packs

**Swift (any Swift project — `Package.swift` or `.xcodeproj` detected):**
- **SwiftUI** — layout, navigation, animations, gestures, Liquid Glass
- **Swift Core** — Swift language, concurrency, Codable, Charts, Testing, SwiftData

**iOS (only when `.xcodeproj` targets `iphoneos`):**
- **iOS App Frameworks** — App Intents, Widgets, StoreKit, MapKit, Live Activities
- **iOS Data Frameworks** — CloudKit, HealthKit, MusicKit, WeatherKit, Contacts
- **iOS AI & ML** — Core ML, Vision, on-device AI, speech recognition
- **iOS Engineering** — networking, security, accessibility, localization, Instruments
- **iOS Hardware** — Bluetooth, CoreMotion, NFC, PencilKit, RealityKit
- **iOS Platform** — CallKit, EnergyKit, HomeKit, SharePlay, PermissionKit

**Web:**
- **React & Web Frontend** — React best practices, web design, composition patterns
- **React Native** — cross-platform mobile patterns
- **Frontend Design & UX** — frontend design, accessibility

**Languages:**
- **Rust** — Rust patterns and best practices
- **Python** — Python patterns and best practices
- **Go** — Go patterns and best practices

**General:**
- **Document Handling** — PDF, DOCX, XLSX, PPTX creation and manipulation

## Skill Discovery

The `skill_discovery` preference controls how LSD finds skills during auto mode:

| Mode | Behavior |
|------|----------|
| `auto` | Skills are found and applied automatically |
| `suggest` | Skills are identified but require confirmation (default) |
| `off` | No skill discovery |

## Skill Preferences

Control which skills are used via preferences:

```yaml
---
version: 1
always_use_skills:
  - debug-like-expert
prefer_skills:
  - frontend-design
avoid_skills:
  - security-docker
skill_rules:
  - when: task involves Clerk authentication
    use: [clerk]
  - when: frontend styling work
    prefer: [frontend-design]
---
```

### Resolution Order

Skills can be referenced by:
1. **Bare name** — e.g., `frontend-design` → scans `~/.lsd/skills/` and project `.lsd/skills/`
2. **Absolute path** — e.g., `/Users/you/.lsd/skills/my-skill/SKILL.md`
3. **Directory path** — e.g., `~/custom-skills/my-skill` → looks for `SKILL.md` inside

Global skills (`~/.lsd/skills/`) take precedence over project skills (`.lsd/skills/`).

## Custom Skills

Create your own skills by adding a directory with a `SKILL.md` file:

```
~/.lsd/skills/my-skill/
  SKILL.md           — instructions for the LLM
  references/        — optional reference files
```

The `SKILL.md` file contains instructions the LLM follows when the skill is active. Reference files can be loaded by the skill instructions as needed.

### Project-Local Skills

Place skills in `.lsd/skills/` for repo-local workflows:

```
.lsd/skills/my-skill/
  SKILL.md
```

## Bundled Skills

LSD ships with a rich set of bundled skills in `src/resources/skills/`:

| Skill | Description |
|-------|-------------|
| `accessibility` | WCAG 2.1 accessibility auditing |
| `agent-browser` | Browser automation guidance |
| `best-practices` | Modern web development security and code quality |
| `code-optimizer` | Deep performance auditing across 14 domains |
| `core-web-vitals` | LCP, INP, CLS optimization |
| `create-lsd-extension` | LSD extension scaffolding |
| `create-skill` | Skill authoring guidance |
| `create-workflow` | Workflow YAML definition |
| `debug-like-expert` | Methodical debugging protocol |
| `frontend-design` | Production-grade frontend interface creation |
| `github-workflows` | GitHub Actions CI/CD |
| `lint` | Code linting and formatting |
| `make-interfaces-feel-better` | UI polish and micro-interactions |
| `react-best-practices` | React/Next.js performance optimization |
| `review` | Code review for security, performance, bugs |
| `teams-plan` | Orchestrated multi-phase feature planning |
| `test` | Test generation and framework detection |
| `userinterface-wiki` | UI/UX best practices (11 categories, 200+ rules) |
| `web-design-guidelines` | Interface guidelines compliance review |
| `web-quality-audit` | Performance, accessibility, SEO audit |

## Skill Lifecycle Management

LSD tracks skill performance across auto-mode sessions.

### Skill Health Dashboard

```
/gsd skill-health              # overview table
/gsd skill-health rust-core    # detailed view for one skill
/gsd skill-health --stale 30   # skills unused for 30+ days
/gsd skill-health --declining  # skills with falling success rates
```

### Staleness Detection

Skills unused for a configurable number of days are flagged as stale:

```yaml
---
skill_staleness_days: 60   # default: 60, set to 0 to disable
---
```

Stale skills are excluded from automatic matching but remain invokable explicitly.
