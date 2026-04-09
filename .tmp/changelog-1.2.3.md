## [1.2.3] - 2026-04-09

### Fixed
- **tools**: honor the full tool profile at startup by activating the fully loaded registry, including extension-registered tools like `subagent`
- **subagents**: improve scout/subagent routing guidance and redirect mistaken `Skill("scout")` calls toward the `subagent` tool
