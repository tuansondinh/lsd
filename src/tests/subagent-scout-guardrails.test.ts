import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = join(fileURLToPath(import.meta.url), "..", "..", "..");

// ── Discovery-time scout tool sanitization ──────────────────────────────

test("discoverAgents sanitizes scout tools to the fixed read-only set", () => {
	const src = readFileSync(
		join(projectRoot, "src", "resources", "extensions", "subagent", "agents.ts"),
		"utf-8",
	);

	assert.ok(src.includes('const SCOUT_ALLOWED_TOOLS = ["read", "lsp", "grep", "find", "ls"]'),
		"defines SCOUT_ALLOWED_TOOLS constant");
	assert.ok(src.includes('const scout = agentMap.get("scout")'),
		"looks up scout in the merged agent map");
	assert.ok(src.includes('scout.tools = [...SCOUT_ALLOWED_TOOLS]'),
		"overwrites scout tools with the fixed safe set");
	assert.ok(src.includes("scout is always read-only"),
		"comment documents the scout policy");
});

test("bundled scout.md declares only read-only tools", () => {
	const bundledScout = readFileSync(
		join(projectRoot, "src", "resources", "agents", "scout.md"),
		"utf-8",
	);

	assert.ok(
		bundledScout.includes("tools: read, lsp, grep, find, ls"),
		"bundled scout frontmatter declares only read-only tools",
	);
	assert.ok(!bundledScout.includes("bash"), "bundled scout does not reference bash");
});
