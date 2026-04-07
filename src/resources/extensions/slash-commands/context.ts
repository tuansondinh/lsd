import type { AgentMessage } from "@gsd/pi-agent-core";
import { estimateTokens } from "@gsd/pi-coding-agent";
import type { ExtensionAPI, ExtensionCommandContext } from "@gsd/pi-coding-agent";

function estimateTextTokens(text: string): number {
    return Math.ceil(text.length / 4);
}

function countMatches(text: string, pattern: RegExp): number {
    return (text.match(pattern) ?? []).length;
}

export default function contextCommand(pi: ExtensionAPI) {
    pi.registerCommand("context", {
        description: "Show current context window usage and breakdown",
        async handler(args: string, ctx: ExtensionCommandContext) {
            const showFull = args.trim() === "full";

            // ── Gather data ──────────────────────────────────────────────────

            const systemPrompt = ctx.getSystemPrompt();
            const contextUsage = ctx.getContextUsage();
            const model = ctx.model;
            const allTools = pi.getAllTools();
            const activeToolNames = new Set(pi.getActiveTools());
            const commands = pi.getCommands();
            const usageTotals = ctx.sessionManager.getUsageTotals();

            let branch: any[] = [];
            try {
                branch = ctx.sessionManager.getBranch();
            } catch {
                // Ignore if getBranch fails
            }

            // ── System Prompt ────────────────────────────────────────────────

            const systemPromptChars = systemPrompt.length;
            const systemPromptTokens = estimateTextTokens(systemPrompt);
            const skillsBlockMatch = systemPrompt.match(/<available_skills>[\s\S]*?<\/available_skills>/);
            const skillsBlock = skillsBlockMatch?.[0] ?? "";
            const skillsContextTokens = estimateTextTokens(skillsBlock);
            const visibleSkillCount = skillsBlock ? countMatches(skillsBlock, /<skill>/g) : 0;
            const projectContextMatch = systemPrompt.match(/# Project Context[\s\S]*?(?=\n\nThe following skills provide specialized instructions|\nCurrent date and time:|$)/);
            const projectContextBlock = projectContextMatch?.[0] ?? "";
            const projectContextTokens = estimateTextTokens(projectContextBlock);
            const projectContextFileCount = projectContextBlock ? countMatches(projectContextBlock, /^## /gm) : 0;
            const footerMatch = systemPrompt.match(/\nCurrent date and time:[\s\S]*$/);
            const footerBlock = footerMatch?.[0] ?? "";
            const footerTokens = estimateTextTokens(footerBlock);
            const nonSkillSystemPromptTokens = Math.max(0, systemPromptTokens - skillsContextTokens);

            // ── Tools ────────────────────────────────────────────────────────

            const totalToolsCount = allTools.length;
            const activeToolsCount = activeToolNames.size;

            const toolSizes = allTools.map((t) => {
                const nameLen = t.name?.length ?? 0;
                const descLen = t.description?.length ?? 0;
                const schemaLen = JSON.stringify(t.parameters ?? {}).length;
                const totalChars = nameLen + descLen + schemaLen;
                const isActive = activeToolNames.has(t.name ?? "");
                const tokens = Math.ceil(totalChars / 4);
                return {
                    name: t.name ?? "(unnamed)",
                    totalChars,
                    tokens,
                    descTokens: Math.ceil(descLen / 4),
                    schemaTokens: Math.ceil((nameLen + schemaLen) / 4),
                    isActive,
                };
            });

            const activeSchemaBytes = toolSizes
                .filter((t) => t.isActive)
                .reduce((sum, t) => sum + t.totalChars, 0);
            const registeredSchemaBytes = toolSizes.reduce((sum, t) => sum + t.totalChars, 0);

            const activeToolsTokens = Math.ceil(activeSchemaBytes / 4);
            const registeredToolsTokens = Math.ceil(registeredSchemaBytes / 4);

            const largestActiveTools = toolSizes
                .filter((t) => t.isActive)
                .sort((a, b) => b.tokens - a.tokens)
                .slice(0, 5);

            // ── Slash Commands ───────────────────────────────────────────────

            const extensionCount = commands.filter((c) => c.source === "extension").length;
            const skillCount = commands.filter((c) => c.source === "skill").length;
            const promptCount = commands.filter((c) => c.source === "prompt").length;

            // ── Messages ─────────────────────────────────────────────────────

            const userMessageCount = branch.filter((e: any) => e.type === "message" && e.message?.role === "user").length;
            const assistantMessageCount = branch.filter(
                (e: any) => e.type === "message" && e.message?.role === "assistant",
            ).length;
            const toolMessageCount = branch.filter((e: any) => e.type === "tool").length;

            let historyTokens = 0;
            for (const entry of branch) {
                if (entry.type === "message" && entry.message) {
                    historyTokens += estimateTokens(entry.message as AgentMessage);
                }
            }

            // ── Context Window ───────────────────────────────────────────────

            const modelStr = model ? `${model.provider}/${model.id}` : "(none selected)";
            const windowSize = model?.contextWindow ?? null;
            const usedTokens = contextUsage?.tokens ?? null;
            const percentUsed = contextUsage?.percent ?? null;

            const fallbackUsedTokens = systemPromptTokens + activeToolsTokens + historyTokens;
            const effectiveUsedTokens = usedTokens ?? fallbackUsedTokens;
            const estimatedLabel = usedTokens === null ? " (estimated)" : "";

            const freeTokens = windowSize !== null ? windowSize - effectiveUsedTokens : null;
            const effectivePercent = percentUsed ?? (windowSize !== null ? (effectiveUsedTokens / windowSize) * 100 : null);

            // ── Render ───────────────────────────────────────────────────────

            const lines: string[] = [];

            lines.push("Context Window");
            lines.push(`  Model:           ${modelStr}`);

            if (windowSize !== null) {
                lines.push(`  Window:          ${windowSize.toLocaleString()} tokens`);
                lines.push(`  Used:            ${effectiveUsedTokens.toLocaleString()} tokens${estimatedLabel}`);
                lines.push(`  Free:            ${freeTokens?.toLocaleString() ?? "unknown"} tokens`);

                if (effectivePercent !== null) {
                    const barWidth = 20;
                    const filledCount = Math.round((effectivePercent / 100) * barWidth);
                    const emptyCount = barWidth - filledCount;
                    const bar = "█".repeat(filledCount) + "░".repeat(emptyCount);
                    const percentStr = effectivePercent.toFixed(0);
                    lines.push(`  [${bar}] ${percentStr}%`);
                }
            } else {
                lines.push("  Window:          unknown");
            }

            lines.push("");

            lines.push("System Prompt");
            lines.push(`  Characters:      ${systemPromptChars.toLocaleString()}`);
            lines.push(`  Est. tokens:     ~${systemPromptTokens.toLocaleString()}`);
            lines.push(`  Base + other:    ~${nonSkillSystemPromptTokens.toLocaleString()} tok`);
            if (skillsBlock) {
                lines.push(`  Skills Context:  ${visibleSkillCount} listed · ~${skillsContextTokens.toLocaleString()} tok`);
                lines.push("                   names, descriptions, and paths only — not full skill bodies");
            } else {
                lines.push("  Skills Context:  none");
            }
            if (projectContextBlock) {
                lines.push(`  Project Context: ${projectContextFileCount} file${projectContextFileCount === 1 ? "" : "s"} · ~${projectContextTokens.toLocaleString()} tok`);
            }
            if (footerBlock) {
                lines.push(`  Footer:          ~${footerTokens.toLocaleString()} tok`);
            }
            lines.push("");

            lines.push(`Tools                    ${activeToolsCount} active / ${totalToolsCount} registered`);
            lines.push(`  Active schema bytes:   ${activeSchemaBytes.toLocaleString()}`);
            lines.push(`  Est. tokens:           ~${activeToolsTokens.toLocaleString()}`);
            if (activeToolsCount !== totalToolsCount) {
                lines.push(`  Registered total:      ${registeredSchemaBytes.toLocaleString()} bytes · ~${registeredToolsTokens.toLocaleString()} tok`);
            }

            if (largestActiveTools.length > 0) {
                lines.push("  Largest active tools:");
                for (const tool of largestActiveTools) {
                    const name = tool.name.padEnd(20);
                    lines.push(`    ${name}  ~${tool.tokens.toLocaleString()} tok`);
                }
            }

            lines.push("");

            lines.push(`Slash Commands           ${extensionCount} extension · ${skillCount} skill · ${promptCount} prompt`);
            lines.push("");

            lines.push(`Messages                 user ${userMessageCount} · assistant ${assistantMessageCount} · tool ${toolMessageCount}`);
            lines.push(`  Est. tokens (history): ~${historyTokens.toLocaleString()}`);

            const inputStr = usageTotals.input.toLocaleString();
            const outputStr = usageTotals.output.toLocaleString();
            const cacheReadStr = usageTotals.cacheRead.toLocaleString();
            const cacheWriteStr = usageTotals.cacheWrite.toLocaleString();
            lines.push(`  LLM-reported totals:   in ${inputStr}  out ${outputStr}  cache-r ${cacheReadStr}  cache-w ${cacheWriteStr}`);

            lines.push("");
            lines.push(showFull ? "Full breakdown below." : "Run /context full for per-tool and per-skill breakdowns.");

            if (showFull) {
                lines.push("");
                lines.push("Tools (full)");
                lines.push("  NAME                          ACTIVE  ~TOK   DESC TOK  SCHEMA TOK");

                const sortedTools = [...toolSizes].sort((a, b) => b.tokens - a.tokens);

                for (const tool of sortedTools) {
                    const name = tool.name.padEnd(30);
                    const activeMarker = tool.isActive ? "●" : " ";
                    const tokStr = tool.tokens.toString().padStart(5);
                    const descStr = tool.descTokens.toString().padStart(8);
                    const schemaStr = tool.schemaTokens.toString().padStart(10);
                    lines.push(`  ${name}  ${activeMarker}    ${tokStr}   ${descStr}    ${schemaStr}`);
                }

                if (skillsBlock) {
                    const skillEntries = Array.from(
                        skillsBlock.matchAll(/<skill>\s*<name>([\s\S]*?)<\/name>\s*<description>([\s\S]*?)<\/description>\s*<location>([\s\S]*?)<\/location>\s*<\/skill>/g),
                    ).map((match) => {
                        const name = match[1]?.trim() ?? "(unknown)";
                        const description = match[2]?.trim() ?? "";
                        const location = match[3]?.trim() ?? "";
                        return {
                            name,
                            tokens: estimateTextTokens(match[0] ?? ""),
                            descTokens: estimateTextTokens(description),
                            pathTokens: estimateTextTokens(location),
                        };
                    }).sort((a, b) => b.tokens - a.tokens);

                    lines.push("");
                    lines.push("Skills (full)");
                    lines.push("  NAME                          ~TOK   DESC TOK  PATH TOK");
                    for (const skill of skillEntries) {
                        const name = skill.name.padEnd(30);
                        const tokStr = skill.tokens.toString().padStart(5);
                        const descStr = skill.descTokens.toString().padStart(8);
                        const pathStr = skill.pathTokens.toString().padStart(8);
                        lines.push(`  ${name}  ${tokStr}   ${descStr}   ${pathStr}`);
                    }
                }
            }

            const content = lines.join("\n");

            pi.sendMessage({
                customType: "context:report",
                content,
                display: true,
            });
        },
    });
}
