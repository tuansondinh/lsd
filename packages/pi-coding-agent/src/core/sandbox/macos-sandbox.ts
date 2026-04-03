import { existsSync, realpathSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import type { SandboxConfig } from "./sandbox-policy.js";

export function detectSandboxExec(): boolean {
	return existsSync("/usr/bin/sandbox-exec");
}

export function preflightSandboxExec(cwd: string): boolean {
	const profile = buildSeatbeltProfile(cwd, {
		enabled: true,
		autoAllowBashIfSandboxed: true,
		writableRoots: [],
		readOnlySubpaths: [".git"],
		networkEnabled: false,
		networkMode: "deny",
	});
	const result = spawnSync("/usr/bin/sandbox-exec", ["-p", profile, "/bin/sh", "-c", "true"], {
		cwd,
		stdio: "ignore",
	});
	return result.status === 0;
}

function sbplAllowSubpathWrite(path: string): string {
	return `(allow file-write* (subpath "${path}"))`;
}

function sbplDenySubpathWrite(path: string): string {
	return `(deny file-write* (subpath "${path}"))`;
}

function getWritableRoots(cwd: string, config: SandboxConfig): string[] {
	const candidates = [resolve(cwd), "/tmp", ...config.writableRoots.map((root) => resolve(root))];
	const roots = new Set<string>();

	for (const candidate of candidates) {
		roots.add(candidate);
		try {
			roots.add(realpathSync(candidate));
		} catch {
			// Ignore non-existent or non-resolvable paths; keep the logical path entry.
		}
	}

	return [...roots];
}

export function buildSeatbeltProfile(cwd: string, config: SandboxConfig): string {
	const writableRoots = getWritableRoots(cwd, config);
	const lines = [
		"(version 1)",
		"(deny default)",
		"(import \"system.sb\")",
		"(allow process-exec)",
		"(allow process-fork)",
		"(allow signal (target self))",
		"(allow sysctl-read)",
		"(allow file-read*)",
		...writableRoots.map(sbplAllowSubpathWrite),
		sbplAllowSubpathWrite("/dev/null"),
		sbplAllowSubpathWrite("/dev/ptmx"),
	];

	if (config.networkEnabled) {
		lines.push("(allow network*)");
	} else {
		lines.push("(deny network*)");
	}

	for (const root of writableRoots) {
		for (const subpath of config.readOnlySubpaths) {
			lines.push(sbplDenySubpathWrite(resolve(root, subpath)));
		}
	}

	return lines.join("\n");
}

export function buildSeatbeltArgs(command: string, shell: string, shellArgs: string[], profile: string): string[] {
	return ["-p", profile, shell, ...shellArgs, command];
}
