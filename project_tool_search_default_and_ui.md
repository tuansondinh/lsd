---
name: project_tool_search_default_and_ui
description: Tool search (lazy loading) defaults to on and must be visible/functional in the /settings UI.
type: project
---

- The `toolSearch` setting (dynamic/lazy tool loading) is enabled by default to reduce context overhead.
- The setting is exposed in the `/settings` menu as "Tool search".
- The implementation must ensure the UI row is properly inserted in the settings list and wired to apply changes to the active tool set immediately without requiring a restart when toggled.
