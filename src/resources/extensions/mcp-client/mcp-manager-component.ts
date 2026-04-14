import type { Theme } from "@gsd/pi-coding-agent";
import { Key, SelectList, type SelectItem, matchesKey, truncateToWidth } from "@gsd/pi-tui";

export interface McpManagerServerInfo {
	name: string;
	enabled: boolean;
	connected: boolean;
	transport: string;
	toolCount: number;
	sourceLabel: string;
}

export interface McpManagerCallbacks {
	getServers: () => McpManagerServerInfo[];
	onToggle: (name: string) => Promise<McpManagerServerInfo | null>;
	onInspect: (name: string) => Promise<string>;
	onReconnect: (name: string) => Promise<McpManagerServerInfo | null>;
	onClose: () => void;
	requestRender: () => void;
}

type ViewMode = "list" | "inspect";

function getSelectListTheme(theme: Theme) {
	return {
		selectedPrefix: (text: string) => theme.fg("accent", text),
		selectedText: (text: string) => theme.fg("accent", text),
		description: (text: string) => theme.fg("muted", text),
		scrollInfo: (text: string) => theme.fg("dim", text),
		noMatch: (text: string) => theme.fg("warning", text),
	};
}

function serversToItems(servers: McpManagerServerInfo[]): SelectItem[] {
	return servers.map((server) => ({
		value: server.name,
		label: server.name,
		description: [
			server.enabled ? "enabled" : "disabled",
			server.transport,
			server.connected ? "● connected" : "○ offline",
			`${server.toolCount} tools`,
			server.sourceLabel || undefined,
		].filter(Boolean).join("  "),
	}));
}

export class McpManagerComponent {
	private readonly theme: Theme;
	private readonly callbacks: McpManagerCallbacks;
	private selectList: SelectList;
	private mode: ViewMode = "list";
	private inspectServerName = "";
	private inspectLines: string[] = [];
	private inspectScrollOffset = 0;
	private statusMessage = "";
	private busy = false;
	private statusTimeout: ReturnType<typeof setTimeout> | null = null;

	constructor(callbacks: McpManagerCallbacks, theme: Theme) {
		this.callbacks = callbacks;
		this.theme = theme;
		this.selectList = new SelectList([], 8, getSelectListTheme(theme));
		this.bindSelectList();
		this.refreshList();
	}

	invalidate(): void {
		this.selectList.invalidate();
	}

	dispose(): void {
		if (this.statusTimeout) {
			clearTimeout(this.statusTimeout);
			this.statusTimeout = null;
		}
	}

	getMode(): ViewMode {
		return this.mode;
	}

	handleInput(data: string): void {
		if (this.mode === "inspect") {
			this.handleInspectInput(data);
			return;
		}

		if (matchesKey(data, Key.escape) || matchesKey(data, Key.ctrl("c"))) {
			this.callbacks.onClose();
			return;
		}

		if (data === "i") {
			void this.handleInspect();
			return;
		}

		if (data === "r") {
			void this.handleReconnect();
			return;
		}

		this.selectList.handleInput(data);
		this.callbacks.requestRender();
	}

	render(width: number): string[] {
		const lines: string[] = [];
		const add = (line = "") => lines.push(truncateToWidth(line, width));
		const divider = this.theme.fg("border", "─".repeat(Math.max(width, 1)));

		add(divider);
		if (this.mode === "inspect") {
			add(
				this.theme.bold(this.theme.fg("toolTitle", ` MCP Tools · ${this.inspectServerName}`)) +
				this.theme.fg("dim", "  esc/q: back  ↑↓/pgup/pgdn/home/end: scroll"),
			);
			add("");

			const bodyHeight = Math.max(8, width > 0 ? 18 : 8);
			const maxOffset = Math.max(0, this.inspectLines.length - bodyHeight);
			this.inspectScrollOffset = Math.max(0, Math.min(this.inspectScrollOffset, maxOffset));
			const visibleLines = this.inspectLines.slice(this.inspectScrollOffset, this.inspectScrollOffset + bodyHeight);
			for (const line of visibleLines) add(line);
			if (visibleLines.length === 0) add(this.theme.fg("dim", "  No tool information"));
			add("");
			add(divider);
			add(this.theme.fg("dim", ` ${this.inspectLines.length} lines`));
			return lines;
		}

		add(
			this.theme.bold(this.theme.fg("toolTitle", " MCP Servers")) +
			this.theme.fg("dim", "  ↑↓ navigate  enter: toggle  i: inspect  r: reconnect  esc: close"),
		);
		add("");
		lines.push(...this.selectList.render(width));
		add("");
		add(divider);
		const servers = this.callbacks.getServers();
		const enabled = servers.filter((server) => server.enabled).length;
		let footer = this.theme.fg("dim", ` ${servers.length} servers · ${enabled} enabled`);
		if (this.busy) footer += this.theme.fg("accent", " · working…");
		if (this.statusMessage) footer += this.theme.fg("accent", ` — ${this.statusMessage}`);
		add(footer);
		return lines;
	}

	private bindSelectList(): void {
		this.selectList.onSelect = () => {
			void this.handleToggle();
		};
		this.selectList.onCancel = () => {
			this.callbacks.onClose();
		};
	}

	private refreshList(preferredName?: string): void {
		const currentSelected = preferredName ?? this.selectList.getSelectedItem()?.value;
		this.selectList = new SelectList(
			serversToItems(this.callbacks.getServers()),
			8,
			getSelectListTheme(this.theme),
		);
		this.bindSelectList();
		if (currentSelected) {
			const items = this.callbacks.getServers();
			const index = items.findIndex((item) => item.name === currentSelected);
			if (index >= 0) this.selectList.setSelectedIndex(index);
		}
		this.callbacks.requestRender();
	}

	private setStatus(message: string): void {
		this.statusMessage = message;
		this.callbacks.requestRender();
		if (this.statusTimeout) clearTimeout(this.statusTimeout);
		if (!message) return;
		this.statusTimeout = setTimeout(() => {
			this.statusMessage = "";
			this.callbacks.requestRender();
		}, 3000);
		this.statusTimeout.unref?.();
	}

	private getSelectedName(): string | undefined {
		return this.selectList.getSelectedItem()?.value;
	}

	private async runBusy(task: () => Promise<void>): Promise<void> {
		if (this.busy) return;
		this.busy = true;
		this.callbacks.requestRender();
		try {
			await task();
		} finally {
			this.busy = false;
			this.callbacks.requestRender();
		}
	}

	private async handleToggle(): Promise<void> {
		const name = this.getSelectedName();
		if (!name) return;
		await this.runBusy(async () => {
			this.setStatus(`Toggling ${name}...`);
			const updated = await this.callbacks.onToggle(name);
			this.refreshList(updated?.name ?? name);
			if (updated) {
				this.setStatus(`${updated.name}: ${updated.enabled ? "enabled" : "disabled"}`);
			}
		});
	}

	private async handleInspect(): Promise<void> {
		const name = this.getSelectedName();
		if (!name) return;
		await this.runBusy(async () => {
			this.setStatus(`Loading tools for ${name}...`);
			const text = await this.callbacks.onInspect(name);
			this.inspectServerName = name;
			this.inspectLines = text.split("\n");
			this.inspectScrollOffset = 0;
			this.mode = "inspect";
			this.setStatus("");
		});
	}

	private async handleReconnect(): Promise<void> {
		const name = this.getSelectedName();
		if (!name) return;
		await this.runBusy(async () => {
			this.setStatus(`Reconnecting ${name}...`);
			const updated = await this.callbacks.onReconnect(name);
			this.refreshList(updated?.name ?? name);
			this.setStatus(updated ? `${updated.name}: reconnected` : `${name}: reconnect failed`);
		});
	}

	private handleInspectInput(data: string): void {
		if (matchesKey(data, Key.escape) || data === "q") {
			this.mode = "list";
			this.callbacks.requestRender();
			return;
		}
		const page = 12;
		if (matchesKey(data, Key.up)) this.inspectScrollOffset -= 1;
		else if (matchesKey(data, Key.down)) this.inspectScrollOffset += 1;
		else if (matchesKey(data, Key.pageUp)) this.inspectScrollOffset -= page;
		else if (matchesKey(data, Key.pageDown)) this.inspectScrollOffset += page;
		else if (matchesKey(data, Key.home)) this.inspectScrollOffset = 0;
		else if (matchesKey(data, Key.end)) this.inspectScrollOffset = Number.MAX_SAFE_INTEGER;
		this.callbacks.requestRender();
	}
}
