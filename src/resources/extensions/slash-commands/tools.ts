import { Type } from "@sinclair/typebox";
import { getAgentDir, SettingsManager, type ExtensionAPI, type ExtensionCommandContext } from "@gsd/pi-coding-agent";

type ToolSummary = {
    name: string;
    description: string;
    active: boolean;
    score: number;
};

function getSettingsManager(): SettingsManager {
    return SettingsManager.create(process.cwd(), getAgentDir());
}

function isHashlineMode(activeToolNames: string[]): boolean {
    return activeToolNames.includes("hashline_read") || activeToolNames.includes("hashline_edit");
}

function getCoreToolNames(activeToolNames: string[]): string[] {
    return isHashlineMode(activeToolNames)
        ? ["hashline_read", "bash", "lsp", "tool_search", "tool_enable"]
        : ["read", "bash", "lsp", "tool_search", "tool_enable"];
}

function getFullDefaultToolNames(activeToolNames: string[]): string[] {
    return isHashlineMode(activeToolNames)
        ? ["hashline_read", "bash", "hashline_edit", "write", "lsp", "pty_start", "pty_send", "pty_read", "pty_wait", "pty_resize", "pty_kill"]
        : ["read", "bash", "edit", "write", "lsp", "pty_start", "pty_send", "pty_read", "pty_wait", "pty_resize", "pty_kill"];
}

function scoreTool(query: string, tool: { name?: string; description?: string }): number {
    const name = (tool.name ?? "").toLowerCase();
    const description = (tool.description ?? "").toLowerCase();
    const terms = query.toLowerCase().trim().split(/\s+/).filter(Boolean);
    if (terms.length === 0) return 0;

    let score = 0;
    for (const term of terms) {
        if (name === term) score += 10;
        if (name.startsWith(term)) score += 6;
        if (name.includes(term)) score += 4;
        if (description.includes(term)) score += 2;
    }

    if (query.includes("browser") && name.startsWith("browser_")) score += 3;
    if (query.includes("mac") && name.startsWith("mac_")) score += 3;
    if (query.includes("search") && (name.includes("search") || description.includes("search"))) score += 2;
    if (query.includes("context") && description.includes("context")) score += 2;
    return score;
}

function findMatchingTools(pi: ExtensionAPI, query: string, limit = 8): ToolSummary[] {
    const active = new Set(pi.getActiveTools());
    return pi
        .getAllTools()
        .map((tool) => ({
            name: tool.name ?? "(unnamed)",
            description: tool.description ?? "",
            active: active.has(tool.name ?? ""),
            score: scoreTool(query, tool),
        }))
        .filter((tool) => tool.score > 0)
        .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name))
        .slice(0, limit);
}

function renderToolSearchResults(query: string, results: ToolSummary[]): string {
    if (results.length === 0) {
        return `No tools matched "${query}".`;
    }

    const lines = [`Tool search for: ${query}`, ""];
    for (const tool of results) {
        lines.push(`- ${tool.name}${tool.active ? " (active)" : ""} — ${tool.description}`);
    }
    lines.push("");
    lines.push("Use tool_enable with exact tool names to activate them.");
    return lines.join("\n");
}

export default function toolSearchExtension(pi: ExtensionAPI) {
    pi.registerTool({
        name: "tool_search",
        label: "Tool Search",
        description: "Search available tools by intent or capability. Use this when the needed tool may not be active yet.",
        promptSnippet: "Search available tools by intent or capability",
        promptGuidelines: [
            "When the right tool is unclear or appears unavailable, use tool_search to find relevant tools by intent.",
            "If tool_search returns a tool that is not active, use tool_enable with its exact name before trying to call it.",
            "Prefer keeping the active tool set small in tool-search mode; enable only the tools needed for the current task.",
        ],
        parameters: Type.Object({
            query: Type.String({ description: "What capability you need, e.g. 'browser testing', 'read docs', or 'mac screenshot'" }),
            limit: Type.Optional(Type.Number({ description: "Maximum results to return (default 8, max 20)", minimum: 1, maximum: 20 })),
        }),
        async execute(_toolCallId, params) {
            const results = findMatchingTools(pi, params.query, Math.min(Math.max(params.limit ?? 8, 1), 20));
            return {
                content: [{ type: "text", text: renderToolSearchResults(params.query, results) }],
                details: { query: params.query, count: results.length, results },
            };
        },
    });

    pi.registerTool({
        name: "tool_enable",
        label: "Tool Enable",
        description: "Enable specific tools by exact name for subsequent turns. Use after tool_search or when the user asks to activate a capability.",
        promptSnippet: "Enable specific tools by exact name for subsequent turns",
        promptGuidelines: [
            "Use tool_enable after tool_search when you need a tool that is not currently active.",
            "Enable only the smallest set of tools needed for the task to keep context overhead low.",
        ],
        parameters: Type.Object({
            tools: Type.Array(Type.String({ description: "Exact tool name to enable" }), {
                description: "One or more exact tool names to enable",
                minItems: 1,
            }),
        }),
        async execute(_toolCallId, params) {
            const allToolNames = new Set(pi.getAllTools().map((tool) => tool.name).filter((name): name is string => Boolean(name)));
            const current = pi.getActiveTools();
            const requested = [...new Set(params.tools.map((name) => name.trim()).filter(Boolean))];
            const enabled = requested.filter((name) => allToolNames.has(name));
            const missing = requested.filter((name) => !allToolNames.has(name));
            pi.setActiveTools([...current, ...enabled]);
            return {
                content: [
                    {
                        type: "text",
                        text: [
                            enabled.length > 0 ? `Enabled tools: ${enabled.join(", ")}` : "No matching tools were enabled.",
                            missing.length > 0 ? `Unknown tools: ${missing.join(", ")}` : "",
                        ].filter(Boolean).join("\n"),
                    },
                ],
                details: { enabled, missing, activeCount: pi.getActiveTools().length },
            };
        },
    });

    pi.registerCommand("tools", {
        description: "Toggle lazy tool-search mode",
        handler: async (args: string, _ctx: ExtensionCommandContext) => {
            const input = args.trim();
            const settings = getSettingsManager();
            const currentActive = pi.getActiveTools();
            const toolSearchEnabled = settings.getToolSearch();

            if (!input) {
                pi.sendMessage({
                    customType: "tools:status",
                    content: [
                        `Tool search mode: ${toolSearchEnabled ? "on" : "off"}`,
                        `Active tools: ${currentActive.length}`,
                        currentActive.length > 0 ? currentActive.join(", ") : "(none)",
                        "",
                        "Usage:",
                        "  /tools on   Enable lazy tool-search mode and switch to a small core tool set",
                        "  /tools off  Disable lazy tool-search mode and restore the default tool set",
                    ].join("\n"),
                    display: true,
                });
                return;
            }

            if (["on", "enable", "mode on"].includes(input)) {
                settings.setToolSearch(true);
                const nextActive = getCoreToolNames(currentActive);
                pi.setActiveTools(nextActive);
                pi.sendMessage({
                    customType: "tools:mode",
                    content: `Tool search mode enabled. Active tools reduced to: ${pi.getActiveTools().join(", ")}`,
                    display: true,
                });
                return;
            }

            if (["off", "disable", "mode off"].includes(input)) {
                settings.setToolSearch(false);
                const nextActive = getFullDefaultToolNames(currentActive);
                pi.setActiveTools(nextActive);
                pi.sendMessage({
                    customType: "tools:mode",
                    content: `Tool search mode disabled. Restored default tools: ${pi.getActiveTools().join(", ")}`,
                    display: true,
                });
                return;
            }

            pi.sendMessage({
                customType: "tools:help",
                content: `Unknown /tools subcommand: ${input}\n\nTry /tools, /tools on, or /tools off.`,
                display: true,
            });
        },
    });
}
