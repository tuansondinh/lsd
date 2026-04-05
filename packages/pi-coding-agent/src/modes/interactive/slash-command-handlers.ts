/**
 * Slash command dispatch and handler implementations extracted from InteractiveMode.
 *
 * The `dispatchSlashCommand` function contains the dispatch logic (routing text
 * to handlers), and individual handler functions implement each command.
 *
 * Handlers that are also invoked from keybindings or other subsystems remain on
 * InteractiveMode and are called through the `SlashCommandContext` interface.
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import type { ThinkingLevel } from "@gsd/pi-agent-core";
import type {
	EditorAction,
	EditorComponent,
	MarkdownTheme,
} from "@gsd/pi-tui";
import {
	type Component,
	Container,
	Markdown,
	Spacer,
	Text,
} from "@gsd/pi-tui";
import { spawn, spawnSync } from "child_process";
import {
	getShareViewerUrl,
} from "../../config.js";
import type { AgentSession } from "../../core/agent-session.js";
import type { AppAction, KeybindingsManager } from "../../core/keybindings.js";
import type { SessionManager } from "../../core/session-manager.js";
import type { SettingsManager } from "../../core/settings-manager.js";
import { copyToClipboard } from "../../utils/clipboard.js";
import { getChangelogPath, parseChangelog } from "../../utils/changelog.js";
import { ArminComponent } from "./components/armin.js";
import { BorderedLoader } from "./components/bordered-loader.js";
import { DynamicBorder } from "./components/dynamic-border.js";
import { BUILTIN_SLASH_COMMANDS } from "../../core/slash-commands.js";
import { appKey, editorKey, formatKeyForDisplay } from "./components/keybinding-hints.js";
import { SelectSubmenu, THINKING_DESCRIPTIONS } from "./components/settings-selector.js";
import { theme } from "./theme/theme.js";

import type { TUI } from "@gsd/pi-tui";

// ---------------------------------------------------------------------------
// Context interface — the subset of InteractiveMode needed by slash commands
// ---------------------------------------------------------------------------

/**
 * Provides slash command handlers with access to the parts of InteractiveMode
 * they need without coupling them to the entire class.
 */
export interface SlashCommandContext {
	// Core objects
	readonly session: AgentSession;
	readonly ui: TUI;
	readonly keybindings: KeybindingsManager;

	// Containers
	readonly chatContainer: Container;
	readonly statusContainer: Container;
	readonly editorContainer: Container;
	readonly headerContainer: Container;
	readonly pendingMessagesContainer: Container;

	// Editor
	readonly editor: EditorComponent;
	readonly defaultEditor: EditorComponent & {
		onEscape?: () => void;
	};

	// Accessors
	readonly sessionManager: SessionManager;
	readonly settingsManager: SettingsManager;

	// Footer
	invalidateFooter(): void;

	// UI helpers
	showStatus(message: string): void;
	showError(message: string): void;
	showWarning(message: string): void;
	showSelector(create: (done: () => void) => { component: Component; focus: Component }): void;
	updateEditorBorderColor(): void;
	getMarkdownThemeWithSettings(): MarkdownTheme;
	requestRender(): void;

	updateTerminalTitle(): void;

	// Methods that stay on InteractiveMode (called from both dispatch and keybindings/events)
	showSettingsSelector(): void;
	showModelsSelector(): Promise<void>;
	handleModelCommand(searchTerm?: string): Promise<void>;
	showUserMessageSelector(): void;
	showTreeSelector(): void;
	showProviderManager(): void;
	runSetupWizard(): Promise<void>;
	cyclePermissionMode(): void;
	handleSandboxCommand(arg?: string): Promise<void>;
	showOAuthSelector(mode: "login" | "logout"): Promise<void>;
	showSessionSelector(): void;
	handleClearCommand(): Promise<void>;
	handleReloadCommand(): Promise<void>;
	handleDebugCommand(): void;
	shutdown(): Promise<void>;

	// For compaction
	executeCompaction(customInstructions?: string, isAuto?: boolean): Promise<unknown>;

	// Bash execution
	handleBashCommand(command: string, options?: { excludeFromContext?: boolean; displayCommand?: string; loginShell?: boolean }): Promise<void>;
}

// ---------------------------------------------------------------------------
// Dispatch
// ---------------------------------------------------------------------------

/**
 * Routes a slash command string to the appropriate handler.
 *
 * @returns `true` if the text was handled as a slash command (caller should
 *          not process it further), `false` otherwise.
 */
export async function dispatchSlashCommand(
	text: string,
	ctx: SlashCommandContext,
): Promise<boolean> {
	if (text === "/help" || text.startsWith("/help ")) {
		const arg = text.startsWith("/help ") ? text.slice(6).trim() : undefined;
		showHelpCommand(arg, ctx);
		return true;
	}
	if (text === "/settings") {
		ctx.showSettingsSelector();
		return true;
	}
	if (text === "/scoped-models") {
		await ctx.showModelsSelector();
		return true;
	}
	if (text === "/model" || text.startsWith("/model ")) {
		const searchTerm = text.startsWith("/model ") ? text.slice(7).trim() : undefined;
		await ctx.handleModelCommand(searchTerm);
		return true;
	}
	if (text.startsWith("/export")) {
		await handleExportCommand(text, ctx);
		return true;
	}
	if (text === "/share") {
		await handleShareCommand(ctx);
		return true;
	}
	if (text === "/copy") {
		handleCopyCommand(ctx);
		return true;
	}
	if (text === "/name" || text.startsWith("/name ")) {
		handleNameCommand(text, ctx);
		return true;
	}
	if (text === "/session") {
		handleSessionCommand(ctx);
		return true;
	}
	if (text === "/changelog") {
		handleChangelogCommand(ctx);
		return true;
	}
	if (text === "/hotkeys") {
		showHotkeys(ctx);
		return true;
	}
	if (text === "/fork") {
		ctx.showUserMessageSelector();
		return true;
	}
	if (text === "/tree") {
		ctx.showTreeSelector();
		return true;
	}
	if (text === "/provider") {
		ctx.showProviderManager();
		return true;
	}
	if (text === "/config" || text === "/setup") {
		await ctx.runSetupWizard();
		return true;
	}
	if (text === "/permission") {
		ctx.cyclePermissionMode();
		return true;
	}
	if (text === "/sandbox" || text.startsWith("/sandbox ")) {
		const arg = text.startsWith("/sandbox ") ? text.slice(9).trim() : undefined;
		await ctx.handleSandboxCommand(arg);
		return true;
	}
	if (text === "/login") {
		await ctx.showOAuthSelector("login");
		return true;
	}
	if (text === "/logout") {
		await ctx.showOAuthSelector("logout");
		return true;
	}
	if (text === "/new") {
		await ctx.handleClearCommand();
		return true;
	}
	if (text === "/compact" || text.startsWith("/compact ")) {
		const customInstructions = text.startsWith("/compact ") ? text.slice(9).trim() : undefined;
		await handleCompactCommand(customInstructions, ctx);
		return true;
	}
	if (text === "/reload") {
		await ctx.handleReloadCommand();
		return true;
	}
	if (text === "/thinking" || text.startsWith("/thinking ")) {
		const arg = text.startsWith("/thinking ") ? text.slice(10).trim() : undefined;
		handleThinkingCommand(arg, ctx);
		return true;
	}
	if (text === "/edit-mode" || text.startsWith("/edit-mode ")) {
		const arg = text.startsWith("/edit-mode ") ? text.slice(11).trim() : undefined;
		handleEditModeCommand(arg, ctx);
		return true;
	}
	if (text === "/debug") {
		ctx.handleDebugCommand();
		return true;
	}
	if (text === "/arminsayshi") {
		handleArminSaysHi(ctx);
		return true;
	}
	if (text === "/resume") {
		ctx.showSessionSelector();
		return true;
	}
	if (text === "/quit") {
		await ctx.shutdown();
		return true;
	}
	if (text === "/terminal" || text.startsWith("/terminal ")) {
		const command = text.startsWith("/terminal ") ? text.slice(10).trim() : "";
		if (!command) {
			ctx.showWarning("Usage: /terminal <command>  (e.g. /terminal ping -c3 1.1.1.1)");
			return true;
		}
		// Run in the user's login shell ($SHELL -l -c) so PATH additions
		// and env vars from shell profiles (.zprofile/.profile) are available.
		// Note: shell aliases are not loaded (requires -i which has side effects).
		await ctx.handleBashCommand(command, { loginShell: true });
		return true;
	}

	return false;
}

// ---------------------------------------------------------------------------
// Individual command handlers
// ---------------------------------------------------------------------------

async function handleExportCommand(text: string, ctx: SlashCommandContext): Promise<void> {
	const parts = text.split(/\s+/);
	const outputPath = parts.length > 1 ? parts[1] : undefined;

	try {
		const filePath = await ctx.session.exportToHtml(outputPath);
		ctx.showStatus(`Session exported to: ${filePath}`);
	} catch (error: unknown) {
		ctx.showError(`Failed to export session: ${error instanceof Error ? error.message : "Unknown error"}`);
	}
}

async function handleShareCommand(ctx: SlashCommandContext): Promise<void> {
	// Check if gh is available and logged in
	try {
		const authResult = spawnSync("gh", ["auth", "status"], { encoding: "utf-8" });
		if (authResult.status !== 0) {
			ctx.showError("GitHub CLI is not logged in. Run 'gh auth login' first.");
			return;
		}
	} catch {
		ctx.showError("GitHub CLI (gh) is not installed. Install it from https://cli.github.com/");
		return;
	}

	// Export to a temp file
	const tmpFile = path.join(os.tmpdir(), "session.html");
	try {
		await ctx.session.exportToHtml(tmpFile);
	} catch (error: unknown) {
		ctx.showError(`Failed to export session: ${error instanceof Error ? error.message : "Unknown error"}`);
		return;
	}

	// Show cancellable loader, replacing the editor
	const loader = new BorderedLoader(ctx.ui, theme, "Creating gist...");
	ctx.editorContainer.clear();
	ctx.editorContainer.addChild(loader);
	ctx.ui.setFocus(loader);
	ctx.requestRender();

	const restoreEditor = () => {
		loader.dispose();
		ctx.editorContainer.clear();
		ctx.editorContainer.addChild(ctx.editor);
		ctx.ui.setFocus(ctx.editor);
		try {
			fs.unlinkSync(tmpFile);
		} catch {
			// Ignore cleanup errors
		}
	};

	// Create a secret gist asynchronously
	let proc: ReturnType<typeof spawn> | null = null;

	loader.onAbort = () => {
		proc?.kill();
		restoreEditor();
		ctx.showStatus("Share cancelled");
	};

	try {
		const result = await new Promise<{ stdout: string; stderr: string; code: number | null }>((resolve) => {
			proc = spawn("gh", ["gist", "create", "--public=false", tmpFile]);
			let stdout = "";
			let stderr = "";
			proc.stdout?.on("data", (data) => {
				stdout += data.toString();
			});
			proc.stderr?.on("data", (data) => {
				stderr += data.toString();
			});
			proc.on("close", (code) => resolve({ stdout, stderr, code }));
		});

		if (loader.signal.aborted) return;

		restoreEditor();

		if (result.code !== 0) {
			const errorMsg = result.stderr?.trim() || "Unknown error";
			ctx.showError(`Failed to create gist: ${errorMsg}`);
			return;
		}

		// Extract gist ID from the URL returned by gh
		// gh returns something like: https://gist.github.com/username/GIST_ID
		const gistUrl = result.stdout?.trim();
		const gistId = gistUrl?.split("/").pop();
		if (!gistId) {
			ctx.showError("Failed to parse gist ID from gh output");
			return;
		}

		// Create the preview URL
		const previewUrl = getShareViewerUrl(gistId);
		ctx.showStatus(`Share URL: ${previewUrl}\nGist: ${gistUrl}`);
	} catch (error: unknown) {
		if (!loader.signal.aborted) {
			restoreEditor();
			ctx.showError(`Failed to create gist: ${error instanceof Error ? error.message : "Unknown error"}`);
		}
	}
}

function handleCopyCommand(ctx: SlashCommandContext): void {
	const text = ctx.session.getLastAssistantText();
	if (!text) {
		ctx.showError("No agent messages to copy yet.");
		return;
	}

	try {
		copyToClipboard(text);
		ctx.showStatus("Copied last agent message to clipboard");
	} catch (error) {
		ctx.showError(error instanceof Error ? error.message : String(error));
	}
}

function handleNameCommand(text: string, ctx: SlashCommandContext): void {
	const name = text.replace(/^\/name\s*/, "").trim();
	if (!name) {
		const currentName = ctx.sessionManager.getSessionName();
		if (currentName) {
			ctx.chatContainer.addChild(new Spacer(1));
			ctx.chatContainer.addChild(new Text(theme.fg("dim", `Session name: ${currentName}`), 1, 0));
		} else {
			ctx.showWarning("Usage: /name <name>");
		}
		ctx.requestRender();
		return;
	}

	ctx.sessionManager.appendSessionInfo(name);
	ctx.updateTerminalTitle();
	ctx.chatContainer.addChild(new Spacer(1));
	ctx.chatContainer.addChild(new Text(theme.fg("dim", `Session name set: ${name}`), 1, 0));
	ctx.requestRender();
}

function handleSessionCommand(ctx: SlashCommandContext): void {
	const stats = ctx.session.getSessionStats();
	const sessionName = ctx.sessionManager.getSessionName();

	let info = `${theme.bold("Session Info")}\n\n`;
	if (sessionName) {
		info += `${theme.fg("dim", "Name:")} ${sessionName}\n`;
	}
	info += `${theme.fg("dim", "File:")} ${stats.sessionFile ?? "In-memory"}\n`;
	info += `${theme.fg("dim", "ID:")} ${stats.sessionId}\n\n`;
	info += `${theme.bold("Messages")}\n`;
	info += `${theme.fg("dim", "User:")} ${stats.userMessages}\n`;
	info += `${theme.fg("dim", "Assistant:")} ${stats.assistantMessages}\n`;
	info += `${theme.fg("dim", "Tool Calls:")} ${stats.toolCalls}\n`;
	info += `${theme.fg("dim", "Tool Results:")} ${stats.toolResults}\n`;
	info += `${theme.fg("dim", "Total:")} ${stats.totalMessages}\n\n`;
	info += `${theme.bold("Tokens")}\n`;
	info += `${theme.fg("dim", "Input:")} ${stats.tokens.input.toLocaleString()}\n`;
	info += `${theme.fg("dim", "Output:")} ${stats.tokens.output.toLocaleString()}\n`;
	if (stats.tokens.cacheRead > 0) {
		info += `${theme.fg("dim", "Cache Read:")} ${stats.tokens.cacheRead.toLocaleString()}\n`;
	}
	if (stats.tokens.cacheWrite > 0) {
		info += `${theme.fg("dim", "Cache Write:")} ${stats.tokens.cacheWrite.toLocaleString()}\n`;
	}
	info += `${theme.fg("dim", "Total:")} ${stats.tokens.total.toLocaleString()}\n`;

	if (stats.cost > 0) {
		info += `\n${theme.bold("Cost")}\n`;
		info += `${theme.fg("dim", "Total:")} ${stats.cost.toFixed(4)}`;
	}

	ctx.chatContainer.addChild(new Spacer(1));
	ctx.chatContainer.addChild(new Text(info, 1, 0));
	ctx.requestRender();
}

function handleChangelogCommand(ctx: SlashCommandContext): void {
	const changelogPath = getChangelogPath();
	const allEntries = parseChangelog(changelogPath);

	const changelogMarkdown =
		allEntries.length > 0
			? allEntries
					.reverse()
					.map((e) => e.content)
					.join("\n\n")
			: "No changelog entries found.";

	ctx.chatContainer.addChild(new Spacer(1));
	ctx.chatContainer.addChild(new DynamicBorder());
	ctx.chatContainer.addChild(new Text(theme.bold(theme.fg("accent", "What's New")), 1, 0));
	ctx.chatContainer.addChild(new Spacer(1));
	ctx.chatContainer.addChild(new Markdown(changelogMarkdown, 1, 1, ctx.getMarkdownThemeWithSettings()));
	ctx.chatContainer.addChild(new DynamicBorder());
	ctx.requestRender();
}

interface HelpCommandInfo {
	name: string;
	description?: string;
	source: "builtin" | "extension" | "prompt" | "skill";
	path?: string;
	location?: string;
}

function collectHelpCommands(ctx: SlashCommandContext): HelpCommandInfo[] {
	const builtins: HelpCommandInfo[] = BUILTIN_SLASH_COMMANDS.map((command) => ({
		name: command.name,
		description: command.description,
		source: "builtin",
	}));
	const reserved = new Set(builtins.map((command) => command.name));

	const extensions: HelpCommandInfo[] = (ctx.session.extensionRunner?.getRegisteredCommandsWithPaths() ?? [])
		.filter(({ command }) => !reserved.has(command.name))
		.map(({ command, extensionPath }) => ({
			name: command.name,
			description: command.description,
			source: "extension",
			path: extensionPath,
		}));

	const prompts: HelpCommandInfo[] = ctx.session.promptTemplates.map((template) => ({
		name: template.name,
		description: template.description,
		source: "prompt",
		location: template.source,
		path: template.filePath,
	}));

	const skills = ctx.settingsManager.getEnableSkillCommands()
		? ctx.session.resourceLoader.getSkills().skills.map((skill) => ({
			name: `skill:${skill.name}`,
			description: skill.description,
			source: "skill" as const,
			location: skill.source,
			path: skill.filePath,
		}))
		: [];

	return [...builtins, ...extensions, ...prompts, ...skills].sort((a, b) => a.name.localeCompare(b.name));
}

function showHelpCommand(arg: string | undefined, ctx: SlashCommandContext): void {
	const commands = collectHelpCommands(ctx);
	if (arg) {
		showHelpCommandDetail(arg, commands, ctx);
		return;
	}

	const groups: Array<{ title: string; items: HelpCommandInfo[] }> = [
		{ title: "Built-in", items: commands.filter((command) => command.source === "builtin") },
		{ title: "Extensions", items: commands.filter((command) => command.source === "extension") },
		{ title: "Prompt Templates", items: commands.filter((command) => command.source === "prompt") },
		{ title: "Skills", items: commands.filter((command) => command.source === "skill") },
	].filter((group) => group.items.length > 0);

	const lines = [
		"Commands below are generated from the current session, so they stay up to date after /reload.",
		"",
		...groups.flatMap((group) => [
			`**${group.title}**`,
			"| Command | Description |",
			"|---------|-------------|",
			...group.items.map((command) => `| \`/${command.name}\` | ${command.description ?? "—"} |`),
			"",
		]),
		"Try `/help <command>` for details, for example `/help terminal` or `/help plan`.",
	].filter((line, index, arr) => !(line === "" && arr[index - 1] === ""));

	ctx.chatContainer.addChild(new Spacer(1));
	ctx.chatContainer.addChild(new DynamicBorder());
	ctx.chatContainer.addChild(new Text(theme.bold(theme.fg("accent", "Help")), 1, 0));
	ctx.chatContainer.addChild(new Spacer(1));
	ctx.chatContainer.addChild(new Markdown(lines.join("\n"), 1, 1, ctx.getMarkdownThemeWithSettings()));
	ctx.chatContainer.addChild(new DynamicBorder());
	ctx.requestRender();
}

function showHelpCommandDetail(rawArg: string, commands: HelpCommandInfo[], ctx: SlashCommandContext): void {
	const arg = rawArg.replace(/^\//, "").trim();
	const matches = commands.filter((command) => command.name === arg || command.name.startsWith(`${arg}:`));

	if (matches.length === 0) {
		ctx.showWarning(`No help found for /${arg}. Run /help to see available commands.`);
		return;
	}

	const command = matches[0]!;
	const usage = getHelpUsage(command);
	const lines = [
		`**Command:** \`/${command.name}\``,
		`**Source:** ${formatHelpSource(command)}`,
		`**Description:** ${command.description ?? "No description available."}`,
		`**Usage:** \`${usage}\``,
	];

	if (command.path) {
		lines.push(`**Path:** \`${command.path}\``);
	}

	const examples = getHelpExamples(command);
	if (examples.length > 0) {
		lines.push("", "**Examples**");
		for (const example of examples) {
			lines.push(`- \`${example}\``);
		}
	}

	if (matches.length > 1) {
		lines.push("", "**Related commands**");
		for (const match of matches.slice(1, 6)) {
			lines.push(`- \`/${match.name}\` — ${match.description ?? "No description available."}`);
		}
	}

	ctx.chatContainer.addChild(new Spacer(1));
	ctx.chatContainer.addChild(new DynamicBorder());
	ctx.chatContainer.addChild(new Text(theme.bold(theme.fg("accent", `Help: /${command.name}`)), 1, 0));
	ctx.chatContainer.addChild(new Spacer(1));
	ctx.chatContainer.addChild(new Markdown(lines.join("\n"), 1, 1, ctx.getMarkdownThemeWithSettings()));
	ctx.chatContainer.addChild(new DynamicBorder());
	ctx.requestRender();
}

function formatHelpSource(command: HelpCommandInfo): string {
	switch (command.source) {
		case "builtin":
			return "built-in";
		case "extension":
			return "extension";
		case "prompt":
			return command.location ? `prompt template (${command.location})` : "prompt template";
		case "skill":
			return command.location ? `skill (${command.location})` : "skill";
	}
}

function getHelpUsage(command: HelpCommandInfo): string {
	if (command.source === "prompt" || command.source === "skill") {
		return `/${command.name} [args]`;
	}

	const optionalArgCommands = new Set(["compact", "edit-mode", "help", "model", "name", "sandbox", "thinking"]);
	if (optionalArgCommands.has(command.name)) {
		return `/${command.name} [args]`;
	}
	if (command.name === "terminal") {
		return "/terminal <command>";
	}
	return `/${command.name}`;
}

function getHelpExamples(command: HelpCommandInfo): string[] {
	switch (command.name) {
		case "help":
			return ["/help", "/help terminal", "/help plan"];
		case "model":
			return ["/model", "/model claude"];
		case "thinking":
			return ["/thinking", "/thinking high"];
		case "terminal":
			return ["/terminal git status", "/terminal npm test"];
		case "edit-mode":
			return ["/edit-mode", "/edit-mode hashline"];
		case "sandbox":
			return ["/sandbox", "/sandbox on", "/sandbox off"];
		case "compact":
			return ["/compact", "/compact focus on the API redesign"];
		case "name":
			return ["/name release prep"];
		default:
			return [];
	}
}

// ---------------------------------------------------------------------------
// /hotkeys helpers
// ---------------------------------------------------------------------------

export function capitalizeKey(key: string): string {
	return key
		.split("/")
		.map((k) =>
			k
				.split("+")
				.map((part) => part.charAt(0).toUpperCase() + part.slice(1))
				.join("+"),
		)
		.join("/");
}

export function getAppKeyDisplay(keybindings: KeybindingsManager, action: AppAction): string {
	return capitalizeKey(appKey(keybindings, action));
}

function getEditorKeyDisplay(action: EditorAction): string {
	return capitalizeKey(editorKey(action));
}

export function showHotkeys(ctx: SlashCommandContext): void {
	// Navigation keybindings
	const cursorWordLeft = getEditorKeyDisplay("cursorWordLeft");
	const cursorWordRight = getEditorKeyDisplay("cursorWordRight");
	const cursorLineStart = getEditorKeyDisplay("cursorLineStart");
	const cursorLineEnd = getEditorKeyDisplay("cursorLineEnd");
	const jumpForward = getEditorKeyDisplay("jumpForward");
	const jumpBackward = getEditorKeyDisplay("jumpBackward");
	const pageUp = getEditorKeyDisplay("pageUp");
	const pageDown = getEditorKeyDisplay("pageDown");

	// Editing keybindings
	const submit = getEditorKeyDisplay("submit");
	const newLine = getEditorKeyDisplay("newLine");
	const deleteWordBackward = getEditorKeyDisplay("deleteWordBackward");
	const deleteWordForward = getEditorKeyDisplay("deleteWordForward");
	const deleteToLineStart = getEditorKeyDisplay("deleteToLineStart");
	const deleteToLineEnd = getEditorKeyDisplay("deleteToLineEnd");
	const yank = getEditorKeyDisplay("yank");
	const yankPop = getEditorKeyDisplay("yankPop");
	const undo = getEditorKeyDisplay("undo");
	const tab = getEditorKeyDisplay("tab");

	// App keybindings
	const interrupt = getAppKeyDisplay(ctx.keybindings, "interrupt");
	const clear = getAppKeyDisplay(ctx.keybindings, "clear");
	const exit = getAppKeyDisplay(ctx.keybindings, "exit");
	const suspend = getAppKeyDisplay(ctx.keybindings, "suspend");
	const cycleThinkingLevel = getAppKeyDisplay(ctx.keybindings, "cycleThinkingLevel");
	const cycleModelForward = getAppKeyDisplay(ctx.keybindings, "cycleModelForward");
	const selectModel = getAppKeyDisplay(ctx.keybindings, "selectModel");
	const expandTools = getAppKeyDisplay(ctx.keybindings, "expandTools");
	const toggleThinking = getAppKeyDisplay(ctx.keybindings, "toggleThinking");
	const externalEditor = getAppKeyDisplay(ctx.keybindings, "externalEditor");
	const followUp = getAppKeyDisplay(ctx.keybindings, "followUp");
	const dequeue = getAppKeyDisplay(ctx.keybindings, "dequeue");

	let hotkeys = `
**Navigation**
| Key | Action |
|-----|--------|
| \`Arrow keys\` | Move cursor / browse history (Up when empty) |
| \`${cursorWordLeft}\` / \`${cursorWordRight}\` | Move by word |
| \`${cursorLineStart}\` | Start of line |
| \`${cursorLineEnd}\` | End of line |
| \`${jumpForward}\` | Jump forward to character |
| \`${jumpBackward}\` | Jump backward to character |
| \`${pageUp}\` / \`${pageDown}\` | Scroll by page |

**Editing**
| Key | Action |
|-----|--------|
| \`${submit}\` | Send message |
| \`${newLine}\` | New line${process.platform === "win32" ? " (Ctrl+Enter on Windows Terminal)" : ""} |
| \`${deleteWordBackward}\` | Delete word backwards |
| \`${deleteWordForward}\` | Delete word forwards |
| \`${deleteToLineStart}\` | Delete to start of line |
| \`${deleteToLineEnd}\` | Delete to end of line |
| \`${yank}\` | Paste the most-recently-deleted text |
| \`${yankPop}\` | Cycle through the deleted text after pasting |
| \`${undo}\` | Undo |

**Other**
| Key | Action |
|-----|--------|
| \`${tab}\` | Path completion / accept autocomplete |
| \`${interrupt}\` | Cancel autocomplete / abort streaming |
| \`${clear}\` | Clear editor (first) / exit (second) |
| \`${exit}\` | Exit (when editor is empty) |
| \`${suspend}\` | Suspend to background |
| \`${cycleThinkingLevel}\` | Cycle thinking level |
| \`${cycleModelForward}\` | Cycle models |
| \`${selectModel}\` | Open model selector |
| \`${expandTools}\` | Toggle tool output expansion |
| \`${toggleThinking}\` | Toggle thinking block visibility |
| \`${externalEditor}\` | Edit message in external editor |
| \`${followUp}\` | Queue follow-up message |
| \`${dequeue}\` | Restore queued messages |
| \`Ctrl+V\` | Paste image from clipboard |
| \`/\` | Slash commands |
| \`!\` | Run bash command |
| \`!!\` | Run bash command (excluded from context) |
`;

	// Add extension-registered shortcuts
	const extensionRunner = ctx.session.extensionRunner;
	if (extensionRunner) {
		const shortcuts = extensionRunner.getShortcuts(ctx.keybindings.getEffectiveConfig());
		if (shortcuts.size > 0) {
			hotkeys += `
**Extensions**
| Key | Action |
|-----|--------|
`;
			for (const [key, shortcut] of shortcuts) {
				const description = shortcut.description ?? shortcut.extensionPath;
				const keyDisplay = formatKeyForDisplay(key).replace(/\b\w/g, (c) => c.toUpperCase());
				hotkeys += `| \`${keyDisplay}\` | ${description} |\n`;
			}
		}
	}

	ctx.chatContainer.addChild(new Spacer(1));
	ctx.chatContainer.addChild(new DynamicBorder());
	ctx.chatContainer.addChild(new Text(theme.bold(theme.fg("accent", "Keyboard Shortcuts")), 1, 0));
	ctx.chatContainer.addChild(new Spacer(1));
	ctx.chatContainer.addChild(new Markdown(hotkeys.trim(), 1, 1, ctx.getMarkdownThemeWithSettings()));
	ctx.chatContainer.addChild(new DynamicBorder());
	ctx.requestRender();
}

async function handleCompactCommand(customInstructions: string | undefined, ctx: SlashCommandContext): Promise<void> {
	const entries = ctx.sessionManager.getEntries();
	const messageCount = entries.filter((e) => e.type === "message").length;

	if (messageCount < 2) {
		ctx.showWarning("Nothing to compact (no messages yet)");
		return;
	}

	await ctx.executeCompaction(customInstructions, false);
}

function handleThinkingCommand(arg: string | undefined, ctx: SlashCommandContext): void {
	if (!ctx.session.supportsThinking()) {
		ctx.showStatus("Current model does not support thinking");
		return;
	}

	const availableLevels = ctx.session.getAvailableThinkingLevels();

	if (arg) {
		const level = arg.toLowerCase();
		if (!availableLevels.includes(level as ThinkingLevel)) {
			ctx.showStatus(`Invalid thinking level "${arg}". Available: ${availableLevels.join(", ")}`);
			return;
		}
		ctx.session.setThinkingLevel(level as ThinkingLevel);
		ctx.invalidateFooter();
		ctx.updateEditorBorderColor();
		ctx.showStatus(`Thinking level: ${level}`);
		return;
	}

	showThinkingSelector(ctx, availableLevels);
}

function showThinkingSelector(ctx: SlashCommandContext, availableLevels: readonly ThinkingLevel[]): void {
	ctx.showSelector((done) => {
		const selector = new SelectSubmenu(
			"Thinking Level",
			"Select reasoning depth for thinking-capable models",
			availableLevels.map((level) => ({
				value: level,
				label: level,
				description: THINKING_DESCRIPTIONS[level],
			})),
			ctx.session.thinkingLevel,
			(value) => {
				ctx.session.setThinkingLevel(value as ThinkingLevel);
				ctx.invalidateFooter();
				ctx.updateEditorBorderColor();
				done();
				ctx.showStatus(`Thinking level: ${value}`);
			},
			() => {
				done();
			},
		);
		return { component: selector, focus: selector };
	});
}

function handleEditModeCommand(arg: string | undefined, ctx: SlashCommandContext): void {
	const modes = ["standard", "hashline"] as const;

	if (arg) {
		const mode = arg.toLowerCase();
		if (!modes.includes(mode as typeof modes[number])) {
			ctx.showStatus(`Invalid edit mode "${arg}". Available: standard, hashline`);
			return;
		}
		ctx.session.setEditMode(mode as "standard" | "hashline");
		ctx.showStatus(`Edit mode: ${mode}${mode === "hashline" ? " (LINE#ID anchored edits)" : " (text-match edits)"}`);
		return;
	}

	// Toggle
	const current = ctx.session.editMode;
	const next = current === "standard" ? "hashline" : "standard";
	ctx.session.setEditMode(next);
	ctx.showStatus(`Edit mode: ${next}${next === "hashline" ? " (LINE#ID anchored edits)" : " (text-match edits)"}`);
}

function handleArminSaysHi(ctx: SlashCommandContext): void {
	ctx.chatContainer.addChild(new Spacer(1));
	ctx.chatContainer.addChild(new ArminComponent(ctx.ui));
	ctx.requestRender();
}
