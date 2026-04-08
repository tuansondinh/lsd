import { getAgentDir, type ExtensionAPI, type ExtensionCommandContext } from "@gsd/pi-coding-agent";
import { existsSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

const STARTER_CONTENT = `# Project Context

## Overview
- Add a short description of this project and its purpose.

## Commands
- Build:
- Test:
- Lint:

## Conventions
- Add coding conventions, architecture notes, and review expectations.
`;

function ensureFile(filePath: string): "created" | "exists" {
    if (existsSync(filePath)) {
        return "exists";
    }
    writeFileSync(filePath, STARTER_CONTENT, "utf-8");
    return "created";
}

export default function initCommand(pi: ExtensionAPI) {
    pi.registerCommand("init", {
        description: "Initialize global and project LSD.md files if they do not exist",
        async handler(_args: string, ctx: ExtensionCommandContext) {
            const globalPath = resolve(getAgentDir(), "..", "LSD.md");
            const projectPath = join(ctx.cwd, "LSD.md");

            const globalStatus = ensureFile(globalPath);
            const projectStatus = ensureFile(projectPath);

            await ctx.reload();

            const lines = ["Initialized LSD.md files", ""];
            lines.push(`Global:  ${globalStatus === "created" ? "created" : "exists"}  ${globalPath}`);
            lines.push(`Project: ${projectStatus === "created" ? "created" : "exists"}  ${projectPath}`);

            if (globalStatus === "exists" && projectStatus === "exists") {
                lines.push("");
                lines.push("Nothing changed.");
            }

            pi.sendMessage({
                customType: "init:report",
                content: lines.join("\n"),
                display: true,
            });
        },
    });
}
