import test from "node:test";
import assert from "node:assert/strict";
import stripAnsi from "strip-ansi";

import { McpManagerComponent, type McpManagerCallbacks, type McpManagerServerInfo } from "../mcp-manager-component.js";

function createTheme() {
	return {
		fg: (_color: string, text: string) => text,
		bold: (text: string) => text,
	} as any;
}

function createCallbacks(overrides?: Partial<McpManagerCallbacks> & { servers?: McpManagerServerInfo[] }) {
	let servers = overrides?.servers ?? [];
	let closed = false;
	let renderCount = 0;
	const callbacks: McpManagerCallbacks = {
		getServers: () => servers,
		onToggle: async () => null,
		onInspect: async () => "",
		onReconnect: async () => null,
		onClose: () => {
			closed = true;
		},
		requestRender: () => {
			renderCount += 1;
		},
		...overrides,
	};
	return {
		callbacks,
		getClosed: () => closed,
		getRenderCount: () => renderCount,
		setServers: (next: McpManagerServerInfo[]) => {
			servers = next;
		},
	};
}

test("McpManagerComponent renders server list", () => {
	const { callbacks } = createCallbacks({
		servers: [{
			name: "alpha",
			enabled: true,
			connected: true,
			transport: "stdio",
			toolCount: 3,
			sourceLabel: "project",
		}],
	});
	const component = new McpManagerComponent(callbacks, createTheme());
	const rendered = stripAnsi(component.render(100).join("\n"));
	assert.match(rendered, /MCP Servers/);
	assert.match(rendered, /alpha/);
	assert.match(rendered, /3 tools/);
});

test("McpManagerComponent toggles and refreshes latest server state", async () => {
	const state: McpManagerServerInfo = {
		name: "alpha",
		enabled: true,
		connected: true,
		transport: "stdio",
		toolCount: 2,
		sourceLabel: "project",
	};
	const harness = createCallbacks({
		servers: [state],
		onToggle: async () => {
			const next = { ...state, enabled: false, connected: false, toolCount: 0 };
			harness.setServers([next]);
			return next;
		},
	});
	const component = new McpManagerComponent(harness.callbacks, createTheme());
	await (component as any).handleToggle();
	const rendered = stripAnsi(component.render(100).join("\n"));
	assert.match(rendered, /disabled/);
	assert.match(rendered, /0 tools/);
});

test("McpManagerComponent inspects tools and switches mode", async () => {
	const { callbacks } = createCallbacks({
		servers: [{
			name: "alpha",
			enabled: true,
			connected: true,
			transport: "stdio",
			toolCount: 2,
			sourceLabel: "project",
		}],
		onInspect: async () => "alpha — 2 tools\n\n## search\nFind stuff",
	});
	const component = new McpManagerComponent(callbacks, createTheme());
	await (component as any).handleInspect();
	assert.equal(component.getMode(), "inspect");
	const rendered = stripAnsi(component.render(100).join("\n"));
	assert.match(rendered, /MCP Tools · alpha/);
	assert.match(rendered, /## search/);
});

test("McpManagerComponent reconnect refreshes server details", async () => {
	const current: McpManagerServerInfo = {
		name: "alpha",
		enabled: true,
		connected: false,
		transport: "stdio",
		toolCount: 0,
		sourceLabel: "project",
	};
	const harness = createCallbacks({
		servers: [current],
		onReconnect: async () => {
			const next = { ...current, connected: true, toolCount: 4 };
			harness.setServers([next]);
			return next;
		},
	});
	const component = new McpManagerComponent(harness.callbacks, createTheme());
	await (component as any).handleReconnect();
	const rendered = stripAnsi(component.render(100).join("\n"));
	assert.match(rendered, /4 tools/);
	assert.match(rendered, /connected/);
});

test("McpManagerComponent closes on escape in list mode", () => {
	const harness = createCallbacks({
		servers: [{
			name: "alpha",
			enabled: true,
			connected: true,
			transport: "stdio",
			toolCount: 1,
			sourceLabel: "project",
		}],
	});
	const component = new McpManagerComponent(harness.callbacks, createTheme());
	component.handleInput("\x1b");
	assert.equal(harness.getClosed(), true);
});
