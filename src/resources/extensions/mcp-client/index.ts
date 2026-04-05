/**
 * MCP Client Extension — Native MCP server integration for pi
 *
 * Provides on-demand access to MCP servers configured in project files
 * (.mcp.json, .lsd/mcp.json, with legacy .gsd/mcp.json fallback) using the
 * @modelcontextprotocol/sdk Client directly — no external CLI dependency
 * required.
 *
 * Three tools:
 *   mcp_servers   — List available MCP servers from config files
 *   mcp_discover  — Get tool signatures for a specific server (lazy connect)
 *   mcp_call      — Call a tool on an MCP server (lazy connect)
 */

import type { ExtensionAPI, ExtensionCommandContext } from "@gsd/pi-coding-agent";
import {
    truncateHead,
    DEFAULT_MAX_BYTES,
    DEFAULT_MAX_LINES,
    formatSize,
} from "@gsd/pi-coding-agent";
import { Text } from "@gsd/pi-tui";
import { Type } from "@sinclair/typebox";
import { Client } from "@modelcontextprotocol/sdk/client";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";

// ─── Types ────────────────────────────────────────────────────────────────────

interface McpServerConfig {
    name: string;
    transport: "stdio" | "http" | "unknown";
    command?: string;
    args?: string[];
    env?: Record<string, string>;
    url?: string;
    headers?: Record<string, string>;
    cwd?: string;
    enabled: boolean;
    sourcePath?: string;
}

interface McpToolSchema {
    name: string;
    description: string;
    inputSchema?: Record<string, unknown>;
}

interface ManagedConnection {
    client: Client;
    transport: StdioClientTransport | StreamableHTTPClientTransport;
}

interface McpState {
    disabledServers: string[];
}

// ─── Connection Manager ───────────────────────────────────────────────────────

const connections = new Map<string, ManagedConnection>();
let configCache: McpServerConfig[] | null = null;
const toolCache = new Map<string, McpToolSchema[]>();

const MCP_STATE_PATH = join(process.cwd(), ".lsd", "mcp-state.json");

function normalizeServerName(name: string): string {
    return name.trim().toLowerCase();
}

function getServerStatePath(): string {
    return MCP_STATE_PATH;
}

function readMcpState(): McpState {
    const statePath = getServerStatePath();
    try {
        if (!existsSync(statePath)) return { disabledServers: [] };
        const raw = readFileSync(statePath, "utf-8");
        const parsed = JSON.parse(raw) as Partial<McpState>;
        return {
            disabledServers: Array.isArray(parsed.disabledServers)
                ? parsed.disabledServers.filter((value): value is string => typeof value === "string")
                : [],
        };
    } catch {
        return { disabledServers: [] };
    }
}

function writeMcpState(state: McpState): void {
    const statePath = getServerStatePath();
    mkdirSync(dirname(statePath), { recursive: true });
    writeFileSync(statePath, `${JSON.stringify({
        disabledServers: Array.from(new Set(state.disabledServers.map(normalizeServerName))).sort(),
    }, null, 2)}\n`, "utf-8");
}

async function closeServerConnection(name: string): Promise<void> {
    const existing = connections.get(name);
    if (!existing) {
        toolCache.delete(name);
        return;
    }

    try {
        await existing.client.close();
    } catch {
        // Best-effort cleanup
    }

    connections.delete(name);
    toolCache.delete(name);
}

async function setServerEnabled(name: string, enabled: boolean): Promise<{ canonicalName: string; changed: boolean }> {
    const config = getServerConfig(name);
    if (!config) throw new Error(`Unknown MCP server: "${name}". Use /mcp list to see available servers.`);

    const state = readMcpState();
    const normalized = normalizeServerName(config.name);
    const current = new Set(state.disabledServers.map(normalizeServerName));
    const wasEnabled = !current.has(normalized);

    if (enabled) current.delete(normalized);
    else current.add(normalized);

    writeMcpState({ disabledServers: Array.from(current) });
    configCache = null;

    if (!enabled) await closeServerConnection(config.name);

    return { canonicalName: config.name, changed: wasEnabled !== enabled };
}

function readConfigs(): McpServerConfig[] {
    if (configCache) return configCache;

    const state = readMcpState();
    const disabled = new Set(state.disabledServers.map(normalizeServerName));

    const servers: McpServerConfig[] = [];
    const seen = new Set<string>();
    const configPaths = [
        join(process.cwd(), ".mcp.json"),
        join(process.cwd(), ".lsd", "mcp.json"),
        join(process.cwd(), ".gsd", "mcp.json"),
    ];

    for (const configPath of configPaths) {
        try {
            if (!existsSync(configPath)) continue;
            const raw = readFileSync(configPath, "utf-8");
            const data = JSON.parse(raw) as Record<string, unknown>;
            const mcpServers = (data.mcpServers ?? data.servers) as
                | Record<string, Record<string, unknown>>
                | undefined;
            if (!mcpServers || typeof mcpServers !== "object") continue;

            for (const [name, config] of Object.entries(mcpServers)) {
                const normalizedName = normalizeServerName(name);
                if (seen.has(normalizedName)) continue;
                seen.add(normalizedName);

                const hasCommand = typeof config.command === "string";
                const hasUrl = typeof config.url === "string";
                const transport: McpServerConfig["transport"] = hasCommand
                    ? "stdio"
                    : hasUrl
                        ? "http"
                        : "unknown";

                servers.push({
                    name,
                    transport,
                    enabled: !disabled.has(normalizedName),
                    sourcePath: configPath,
                    ...(hasCommand && {
                        command: config.command as string,
                        args: Array.isArray(config.args) ? (config.args as string[]) : undefined,
                        env: config.env && typeof config.env === "object"
                            ? (config.env as Record<string, string>)
                            : undefined,
                        cwd: typeof config.cwd === "string" ? config.cwd : undefined,
                    }),
                    ...(hasUrl && {
                        url: config.url as string,
                        headers: config.headers && typeof config.headers === "object"
                            ? (config.headers as Record<string, string>)
                            : undefined,
                    }),
                });
            }
        } catch {
            // Non-fatal — config file may not exist or be malformed
        }
    }

    configCache = servers;
    return servers;
}

function getServerConfig(name: string): McpServerConfig | undefined {
    const trimmed = name.trim();
    const normalized = normalizeServerName(trimmed);
    return readConfigs().find((s) =>
        s.name === trimmed ||
        normalizeServerName(s.name) === normalized,
    );
}

function getCanonicalServerName(name: string): string {
    return getServerConfig(name)?.name ?? name.trim();
}

/** Resolve ${VAR} references in string values against process.env. */
function resolveString(value: string): string {
    return value.replace(/\$\{([^}]+)\}/g, (_match, varName) => process.env[varName] ?? "");
}

/** Resolve ${VAR} references in env/header values against process.env. */
function resolveStringMap(values: Record<string, string>): Record<string, string> {
    const resolved: Record<string, string> = {};
    for (const [key, value] of Object.entries(values)) {
        resolved[key] = typeof value === "string" ? resolveString(value) : value;
    }
    return resolved;
}

async function getOrConnect(name: string, signal?: AbortSignal): Promise<Client> {
    const config = getServerConfig(name);
    if (!config) throw new Error(`Unknown MCP server: "${name}". Use mcp_servers to list available servers.`);
    if (!config.enabled) throw new Error(`Server "${config.name}" is disabled. Use /mcp enable ${config.name}.`);

    // Always use config.name as the canonical cache key so that variant
    // casing / whitespace still hits the same connection.
    const existing = connections.get(config.name);
    if (existing) return existing.client;

    const client = new Client({ name: "gsd", version: "1.0.0" });
    let transport: StdioClientTransport | StreamableHTTPClientTransport;

    if (config.transport === "stdio" && config.command) {
        transport = new StdioClientTransport({
            command: config.command,
            args: config.args,
            env: config.env ? { ...process.env, ...resolveStringMap(config.env) } as Record<string, string> : undefined,
            cwd: config.cwd,
            stderr: "pipe",
        });
    } else if (config.transport === "http" && config.url) {
        const resolvedUrl = resolveString(config.url);
        transport = new StreamableHTTPClientTransport(new URL(resolvedUrl), {
            requestInit: config.headers ? { headers: resolveStringMap(config.headers) } : undefined,
        });
    } else {
        throw new Error(`Server "${config.name}" has unsupported transport: ${config.transport}`);
    }

    await client.connect(transport, { signal, timeout: 30000 });
    connections.set(config.name, { client, transport });
    return client;
}

async function closeAll(): Promise<void> {
    const closing = Array.from(connections.entries()).map(async ([name, conn]) => {
        try {
            await conn.client.close();
        } catch {
            // Best-effort cleanup
        }
        connections.delete(name);
    });
    await Promise.allSettled(closing);
    toolCache.clear();
}

async function reloadMcpState(): Promise<void> {
    await closeAll();
    configCache = null;
}

// ─── Formatters ───────────────────────────────────────────────────────────────

function formatServerList(servers: McpServerConfig[]): string {
    if (servers.length === 0) return "No MCP servers configured. Add servers to .mcp.json or .lsd/mcp.json.";

    const lines: string[] = ["MCP servers\n"];

    for (const s of servers) {
        const connected = connections.has(s.name) ? "yes" : "no";
        const cached = toolCache.get(s.name);
        const tools = cached ? String(cached.length) : "unknown";
        lines.push(`${s.name}`);
        lines.push(`  enabled: ${s.enabled ? "yes" : "no"}`);
        lines.push(`  connected: ${connected}`);
        lines.push(`  transport: ${s.transport}`);
        lines.push(`  tools: ${tools}`);
        if (s.sourcePath) lines.push(`  source: ${basename(s.sourcePath)}`);
        lines.push("");
    }

    lines.push("Hints:");
    lines.push("  /mcp inspect <server>");
    lines.push("  /mcp enable <server>");
    lines.push("  /mcp disable <server>");
    lines.push("  /mcp reload");
    lines.push("");
    lines.push("Tool flow:");
    lines.push("  mcp_servers → mcp_discover(server) → mcp_call(server, tool, args)");
    return lines.join("\n");
}

function formatToolList(serverName: string, tools: McpToolSchema[]): string {
    const lines: string[] = [`${serverName} — ${tools.length} tools:\n`];

    for (const tool of tools) {
        lines.push(`## ${tool.name}`);
        if (tool.description) lines.push(tool.description);
        if (tool.inputSchema) {
            lines.push("```json");
            lines.push(JSON.stringify(tool.inputSchema, null, 2));
            lines.push("```");
        }
        lines.push("");
    }

    lines.push(`Call with: mcp_call(server="${serverName}", tool="<tool_name>", args={...})`);
    return lines.join("\n");
}

function formatMcpCommandHelp(): string {
    return [
        "MCP commands:",
        "  /mcp",
        "  /mcp list",
        "  /mcp inspect <server>",
        "  /mcp enable <server>",
        "  /mcp disable <server>",
        "  /mcp reload",
    ].join("\n");
}

async function handleMcpCommand(args: string, ctx: ExtensionCommandContext): Promise<void> {
    const trimmed = args.trim();
    const parts = trimmed.split(/\s+/).filter(Boolean);
    const subcommand = parts[0] ?? "list";

    if (subcommand === "list") {
        ctx.ui.notify(formatServerList(readConfigs()), "info");
        return;
    }

    if (subcommand === "inspect") {
        const target = parts.slice(1).join(" ").trim();
        if (!target) {
            ctx.ui.notify("Usage: /mcp inspect <server>", "warning");
            return;
        }

        const config = getServerConfig(target);
        if (!config) {
            ctx.ui.notify(`Unknown MCP server: ${target}`, "warning");
            return;
        }

        const canonicalName = config.name;
        const cached = toolCache.get(canonicalName);
        if (cached) {
            ctx.ui.notify(formatToolList(canonicalName, cached), "info");
            return;
        }

        try {
            const client = await getOrConnect(canonicalName);
            const result = await client.listTools(undefined, { timeout: 30000 });
            const tools: McpToolSchema[] = (result.tools ?? []).map((tool) => ({
                name: tool.name,
                description: tool.description ?? "",
                inputSchema: tool.inputSchema as Record<string, unknown> | undefined,
            }));
            toolCache.set(canonicalName, tools);
            ctx.ui.notify(formatToolList(canonicalName, tools), "info");
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            ctx.ui.notify(`Failed to inspect ${canonicalName}: ${message}`, "error");
        }
        return;
    }

    if (subcommand === "enable" || subcommand === "disable") {
        const target = parts.slice(1).join(" ").trim();
        if (!target) {
            ctx.ui.notify(`Usage: /mcp ${subcommand} <server>`, "warning");
            return;
        }

        try {
            const enabled = subcommand === "enable";
            const result = await setServerEnabled(target, enabled);
            const action = enabled ? "enabled" : "disabled";
            const changeText = result.changed ? action : `already ${action}`;
            ctx.ui.notify(`MCP server ${result.canonicalName} ${changeText}.`, "info");
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            ctx.ui.notify(message, "error");
        }
        return;
    }

    if (subcommand === "reload") {
        await reloadMcpState();
        const servers = readConfigs();
        ctx.ui.notify(`Reloaded MCP config — ${servers.length} server(s) available.`, "info");
        return;
    }

    if (subcommand === "help") {
        ctx.ui.notify(formatMcpCommandHelp(), "info");
        return;
    }

    ctx.ui.notify(`Unknown /mcp subcommand: ${subcommand}\n\n${formatMcpCommandHelp()}`, "warning");
}

// ─── Status helper (consumed by /gsd mcp) ─────────────────────────────────────

/**
 * Return the live connection status for a named MCP server.
 * Safe to call even when the server has never been connected.
 */
export function getConnectionStatus(name: string): {
    connected: boolean;
    tools: string[];
    enabled: boolean;
    error?: string;
} {
    const config = getServerConfig(name);
    const canonicalName = config?.name ?? name;
    const conn = connections.get(canonicalName);
    const cached = toolCache.get(canonicalName);
    return {
        connected: !!conn,
        tools: cached ? cached.map((t) => t.name) : [],
        enabled: config?.enabled ?? false,
        error: undefined,
    };
}

// ─── Extension ────────────────────────────────────────────────────────────────

export default function(pi: ExtensionAPI) {
    pi.registerCommand("mcp", {
        description: "Manage MCP servers: /mcp [list|inspect|enable|disable|reload] [server]",
        getArgumentCompletions: (prefix: string) => {
            const subcommands = ["list", "inspect", "enable", "disable", "reload"];
            const parts = prefix.trim().split(/\s+/);
            const first = parts[0] ?? "";

            if (parts.length <= 1) {
                return subcommands
                    .filter((cmd) => cmd.startsWith(first))
                    .map((cmd) => ({ value: cmd, label: cmd }));
            }

            if (["inspect", "enable", "disable"].includes(parts[0] ?? "")) {
                const namePrefix = parts.slice(1).join(" ").trim().toLowerCase();
                return readConfigs()
                    .filter((server) => server.name.toLowerCase().startsWith(namePrefix))
                    .map((server) => ({
                        value: `${parts[0]} ${server.name}`,
                        label: `${server.name} — ${server.enabled ? "enabled" : "disabled"} (${server.transport})`,
                    }));
            }

            return [];
        },
        handler: async (args, ctx) => {
            await handleMcpCommand(args, ctx);
        },
    });

    // ── mcp_servers ──────────────────────────────────────────────────────────

    pi.registerTool({
        name: "mcp_servers",
        label: "MCP Servers",
        description:
            "List all available MCP servers configured in project files (.mcp.json, .lsd/mcp.json, legacy .gsd/mcp.json). " +
            "Shows server names, transport type, and connection status. Use mcp_discover to get full tool schemas for a server.",
        promptSnippet:
            "List available MCP servers from project configuration",
        promptGuidelines: [
            "Call mcp_servers to see what MCP servers are available before trying to use one.",
            "MCP servers provide external integrations (Twitter, Linear, Railway, etc.) via the Model Context Protocol.",
            "After listing, use mcp_discover(server) to get tool schemas, then mcp_call(server, tool, args) to invoke.",
        ],
        parameters: Type.Object({
            refresh: Type.Optional(
                Type.Boolean({ description: "Force refresh the server list (default: use cache)" }),
            ),
        }),

        async execute(_id, params) {
            if (params.refresh) configCache = null;

            const servers = readConfigs();
            return {
                content: [{ type: "text", text: formatServerList(servers) }],
                details: {
                    serverCount: servers.length,
                    enabledCount: servers.filter((server) => server.enabled).length,
                    cached: !params.refresh && configCache !== null,
                },
            };
        },

        renderCall(args, theme) {
            let text = theme.fg("toolTitle", theme.bold("mcp_servers"));
            if (args.refresh) text += theme.fg("warning", " (refresh)");
            return new Text(text, 0, 0);
        },

        renderResult(result, { isPartial }, theme) {
            if (isPartial) return new Text(theme.fg("warning", "Reading MCP config..."), 0, 0);
            const d = result.details as { serverCount: number; enabledCount: number } | undefined;
            return new Text(
                theme.fg("success", `${d?.enabledCount ?? 0}/${d?.serverCount ?? 0} servers enabled`),
                0,
                0,
            );
        },
    });

    // ── mcp_discover ─────────────────────────────────────────────────────────

    pi.registerTool({
        name: "mcp_discover",
        label: "MCP Discover",
        description:
            "Get detailed tool signatures and JSON schemas for a specific MCP server. " +
            "Connects to the server on first call (lazy connection). " +
            "Use this to understand what tools a server provides and what arguments they accept " +
            "before calling them with mcp_call.",
        promptSnippet:
            "Get tool schemas for a specific MCP server before calling its tools",
        promptGuidelines: [
            "Call mcp_discover with a server name to see the full tool signatures before calling mcp_call.",
            "The schemas show required and optional parameters with types and descriptions.",
        ],
        parameters: Type.Object({
            server: Type.String({
                description:
                    "MCP server name (from mcp_servers output), e.g. 'railway', 'twitter-mcp', 'linear'",
            }),
        }),

        async execute(_id, params, signal) {
            try {
                const canonicalServer = getCanonicalServerName(params.server);

                // Return cached tools if available
                const cached = toolCache.get(canonicalServer);
                if (cached) {
                    const text = formatToolList(canonicalServer, cached);
                    const truncation = truncateHead(text, { maxLines: DEFAULT_MAX_LINES, maxBytes: DEFAULT_MAX_BYTES });
                    let finalText = truncation.content;
                    if (truncation.truncated) {
                        finalText += `\n\n[Truncated: ${truncation.outputLines}/${truncation.totalLines} lines (${formatSize(truncation.outputBytes)} of ${formatSize(truncation.totalBytes)})]`;
                    }
                    return {
                        content: [{ type: "text", text: finalText }],
                        details: { server: canonicalServer, toolCount: cached.length, cached: true },
                    };
                }

                const client = await getOrConnect(canonicalServer, signal);
                const result = await client.listTools(undefined, { signal, timeout: 30000 });
                const tools: McpToolSchema[] = (result.tools ?? []).map((t) => ({
                    name: t.name,
                    description: t.description ?? "",
                    inputSchema: t.inputSchema as Record<string, unknown> | undefined,
                }));
                toolCache.set(canonicalServer, tools);

                const text = formatToolList(canonicalServer, tools);
                const truncation = truncateHead(text, { maxLines: DEFAULT_MAX_LINES, maxBytes: DEFAULT_MAX_BYTES });
                let finalText = truncation.content;
                if (truncation.truncated) {
                    finalText += `\n\n[Truncated: ${truncation.outputLines}/${truncation.totalLines} lines (${formatSize(truncation.outputBytes)} of ${formatSize(truncation.totalBytes)})]`;
                }

                return {
                    content: [{ type: "text", text: finalText }],
                    details: { server: canonicalServer, toolCount: tools.length, cached: false },
                };
            } catch (err: unknown) {
                const msg = err instanceof Error ? err.message : String(err);
                throw new Error(`Failed to discover tools for "${params.server}": ${msg}`);
            }
        },

        renderCall(args, theme) {
            let text = theme.fg("toolTitle", theme.bold("mcp_discover "));
            text += theme.fg("accent", args.server);
            return new Text(text, 0, 0);
        },

        renderResult(result, { isPartial }, theme) {
            if (isPartial)
                return new Text(theme.fg("warning", "Discovering tools..."), 0, 0);
            const d = result.details as { server: string; toolCount: number } | undefined;
            return new Text(
                theme.fg("success", `${d?.toolCount ?? 0} tools`) +
                theme.fg("dim", ` · ${d?.server}`),
                0,
                0,
            );
        },
    });

    // ── mcp_call ─────────────────────────────────────────────────────────────

    pi.registerTool({
        name: "mcp_call",
        label: "MCP Call",
        description:
            "Call a tool on an MCP server. Provide the server name, tool name, and arguments. " +
            "Connects to the server on first call (lazy connection). " +
            "Use mcp_discover first to see available tools and their required arguments.",
        promptSnippet: "Call a tool on an MCP server",
        promptGuidelines: [
            "Always use mcp_discover first to understand the tool's parameters before calling mcp_call.",
            "Arguments are passed as a JSON object matching the tool's input schema.",
        ],
        parameters: Type.Object({
            server: Type.String({
                description: "MCP server name, e.g. 'railway', 'twitter-mcp'",
            }),
            tool: Type.String({
                description: "Tool name on that server, e.g. 'railway_list_projects'",
            }),
            args: Type.Optional(
                Type.Object({}, {
                    additionalProperties: true,
                    description:
                        "Tool arguments as key-value pairs matching the tool's input schema",
                }),
            ),
        }),

        async execute(_id, params, signal) {
            try {
                const canonicalServer = getCanonicalServerName(params.server);
                const client = await getOrConnect(canonicalServer, signal);
                const result = await client.callTool(
                    { name: params.tool, arguments: params.args ?? {} },
                    undefined,
                    { signal, timeout: 60000 },
                );

                // Serialize result content to text
                const contentItems = result.content as Array<{ type: string; text?: string }>;
                const raw = contentItems
                    .map((c) => (c.type === "text" ? c.text ?? "" : JSON.stringify(c)))
                    .join("\n");

                const truncation = truncateHead(raw, { maxLines: DEFAULT_MAX_LINES, maxBytes: DEFAULT_MAX_BYTES });
                let finalText = truncation.content;
                if (truncation.truncated) {
                    finalText += `\n\n[Output truncated: ${truncation.outputLines}/${truncation.totalLines} lines (${formatSize(truncation.outputBytes)} of ${formatSize(truncation.totalBytes)})]`;
                }

                return {
                    content: [{ type: "text", text: finalText }],
                    details: {
                        server: canonicalServer,
                        tool: params.tool,
                        charCount: finalText.length,
                        truncated: truncation.truncated,
                    },
                };
            } catch (err: unknown) {
                const msg = err instanceof Error ? err.message : String(err);
                throw new Error(`MCP call failed: ${params.server}.${params.tool}\n${msg}`);
            }
        },

        renderCall(args, theme) {
            let text = theme.fg("toolTitle", theme.bold("mcp_call "));
            text += theme.fg("accent", `${args.server}.${args.tool}`);
            if (args.args && Object.keys(args.args).length > 0) {
                const preview = Object.entries(args.args)
                    .slice(0, 3)
                    .map(([k, v]) => {
                        const val = typeof v === "string" ? v : JSON.stringify(v);
                        return `${k}:${val.length > 30 ? val.slice(0, 30) + "…" : val}`;
                    })
                    .join(" ");
                text += " " + theme.fg("muted", preview);
            }
            return new Text(text, 0, 0);
        },

        renderResult(result, { isPartial, expanded }, theme) {
            if (isPartial) return new Text(theme.fg("warning", "Calling MCP tool..."), 0, 0);

            const d = result.details as {
                server: string;
                tool: string;
                charCount: number;
                truncated: boolean;
            } | undefined;

            let text = theme.fg("success", `✓ ${d?.server}.${d?.tool}`);
            text += theme.fg("dim", ` · ${(d?.charCount ?? 0).toLocaleString()} chars`);
            if (d?.truncated) text += theme.fg("warning", " · truncated");

            if (expanded) {
                const content = result.content[0];
                if (content?.type === "text") {
                    const preview = content.text.split("\n").slice(0, 15).join("\n");
                    text += "\n\n" + theme.fg("dim", preview);
                }
            }

            return new Text(text, 0, 0);
        },
    });

    // ── Lifecycle ─────────────────────────────────────────────────────────────

    pi.on("session_start", async (_event, ctx) => {
        const servers = readConfigs();
        if (servers.length > 0) {
            ctx.ui.notify(`MCP client ready — ${servers.filter((server) => server.enabled).length}/${servers.length} server(s) enabled`, "info");
        }
    });

    pi.on("session_shutdown", async () => {
        await closeAll();
    });

    pi.on("session_switch", async () => {
        await closeAll();
        configCache = null;
    });
}
