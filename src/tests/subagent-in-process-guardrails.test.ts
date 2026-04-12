import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = join(fileURLToPath(import.meta.url), "..", "..", "..");

test("in-process subagent runner binds extensions and enforces nested guardrails", () => {
    const src = readFileSync(
        join(projectRoot, "src", "resources", "extensions", "subagent", "in-process-runner.ts"),
        "utf-8",
    );

    assert.ok(src.includes("export const MAX_IN_PROCESS_SUBAGENT_DEPTH = 3;"), "defines hard depth cap");
    assert.ok(src.includes("export const MAX_ACTIVE_DESCENDANTS = 8;"), "defines active descendant cap");
    assert.ok(src.includes("await session.bindExtensions({});"), "binds extension lifecycle for in-process sessions");
    assert.ok(src.includes("NESTED_EXTENSION_TOOL_ALLOWLIST"), "defines nested extension allowlist");
    assert.ok(src.includes("session.setActiveToolsByName(resolvedActiveToolNames);"), "applies resolved restricted active tools");
    assert.ok(
        src.includes("cannot spawn another subagent with the same name as itself"),
        "enforces same-name recursion ban",
    );
    assert.ok(src.includes("abortDescendantTree(sessionId);"), "aborts descendant tree when parent aborts");
    assert.ok(src.includes("Subagent ancestry:"), "injects ancestry context into nested prompt");
});

test("subagent tool rejects nested background launches and tracks ancestry", () => {
    const src = readFileSync(join(projectRoot, "src", "resources", "extensions", "subagent", "index.ts"), "utf-8");

    assert.ok(src.includes("const inProcessSubagentAncestryBySessionId = new Map<string, string[]>()"), "tracks in-process ancestry per session");
    assert.ok(
        src.includes("Nested background subagent launches are not supported yet"),
        "rejects nested background mode with clear error",
    );
    assert.ok(src.includes("buildChildAncestry"), "builds ancestry chain for child sessions");
    assert.ok(src.includes("invokingSessionId,"), "passes invoking parent session id into in-process runs");
    assert.ok(src.includes("currentAncestry,"), "passes ancestry chain into in-process runs");
});
