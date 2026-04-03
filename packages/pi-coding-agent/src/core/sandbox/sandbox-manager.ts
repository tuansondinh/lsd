import { resolve } from "node:path";
import {
	getPermissionMode,
	requestNetworkApproval,
	type NetworkApprovalDecision,
	type PermissionMode,
} from "../tool-approval.js";
import type { SettingsManager } from "../settings-manager.js";
import { buildBwrapArgs, detectBwrap, preflightBwrap } from "./linux-sandbox.js";
import { buildSeatbeltArgs, buildSeatbeltProfile, detectSandboxExec, preflightSandboxExec } from "./macos-sandbox.js";
import {
	DEFAULT_READ_ONLY_SUBPATHS,
	permissionModeToSandboxPolicy,
	type SandboxConfig,
	type SandboxExecutionPlan,
	type SandboxPolicy,
} from "./sandbox-policy.js";

export interface SandboxCommandOptions {
	shell: string;
	shellArgs: string[];
	cwd: string;
	permissionMode?: PermissionMode;
	networkModeOverride?: "allow" | "deny" | "ask";
}

export interface SandboxAvailability {
	available: boolean;
	reason?: string;
	version?: string | null;
	installHint?: string;
}

export class SandboxNetworkDeniedError extends Error {
	constructor(message = "Network access denied for sandboxed bash command.") {
		super(message);
		this.name = "SandboxNetworkDeniedError";
	}
}

export class SandboxManager {
	private availabilityPromise?: Promise<SandboxAvailability>;
	private networkAccessApprovedForSession = false;

	constructor(private settingsManager: SettingsManager) {}

	getSandboxConfig(): SandboxConfig {
		const settings = this.settingsManager.getSandboxSettings();
		const envDisabled = process.env.PI_NO_SANDBOX === "1";
		const envPolicy = process.env.PI_SANDBOX;
		const envNetworkEnabled = process.env.PI_SANDBOX_NETWORK === "1";
		const envNetworkMode = process.env.PI_SANDBOX_NETWORK_MODE;
		const networkMode =
			envNetworkMode === "allow" || envNetworkMode === "ask" || envNetworkMode === "deny"
				? envNetworkMode
				: settings.networkMode ?? (settings.networkEnabled === true ? "allow" : settings.networkEnabled === false ? "deny" : "ask");
		return {
			enabled: envDisabled ? false : (settings.enabled ?? (process.platform === "linux" || process.platform === "darwin")),
			autoAllowBashIfSandboxed: settings.autoAllowBashIfSandboxed ?? true,
			writableRoots: settings.writableRoots ?? [],
			readOnlySubpaths: settings.readOnlySubpaths ?? [...DEFAULT_READ_ONLY_SUBPATHS],
			networkEnabled: envNetworkEnabled || networkMode === "allow",
			networkMode,
		};
	}

	getSandboxPolicy(permissionMode: PermissionMode = getPermissionMode()): SandboxPolicy {
		const config = this.getSandboxConfig();
		if (!config.enabled) return "none";
		const envPolicy = process.env.PI_SANDBOX;
		if (envPolicy === "none") return "none";
		if (envPolicy === "workspace-write" || envPolicy === "auto") return "workspace-write";
		return permissionModeToSandboxPolicy(permissionMode);
	}

	async isAvailable(): Promise<boolean> {
		return (await this.getAvailability()).available;
	}

	async getAvailability(): Promise<SandboxAvailability> {
		if (!this.availabilityPromise) {
			this.availabilityPromise = this.detectAvailability();
		}
		return this.availabilityPromise;
	}

	private async detectAvailability(): Promise<SandboxAvailability> {
		if (process.platform === "linux") {
			const detected = detectBwrap();
			if (!detected.available || !detected.path) {
				return {
					available: false,
					reason: "bubblewrap (bwrap) not found",
					installHint: this.getInstallHint(),
				};
			}
			if (!preflightBwrap(process.cwd(), detected.path)) {
				return {
					available: false,
					reason: "bubblewrap preflight failed",
					version: detected.version,
					installHint: this.getInstallHint(),
				};
			}
			return { available: true, version: detected.version };
		}

		if (process.platform === "darwin") {
			if (!detectSandboxExec()) {
				return {
					available: false,
					reason: "sandbox-exec not found",
					installHint: this.getInstallHint(),
				};
			}
			if (!preflightSandboxExec(process.cwd())) {
				return {
					available: false,
					reason: "sandbox-exec preflight failed",
					installHint: this.getInstallHint(),
				};
			}
			return { available: true };
		}

		return {
			available: false,
			reason: `unsupported platform: ${process.platform}`,
			installHint: this.getInstallHint(),
		};
	}

	getInstallHint(): string | undefined {
		if (process.platform === "linux") {
			return "Install bubblewrap (bwrap), e.g. apt install bubblewrap, dnf install bubblewrap, or pacman -S bubblewrap.";
		}
		if (process.platform === "darwin") {
			return "sandbox-exec is provided by macOS. If unavailable or failing, verify the host macOS version and local sandbox restrictions.";
		}
		return "Sandboxing is only supported on Linux (bubblewrap) and macOS (sandbox-exec).";
	}

	private isLikelyNetworkCommand(command: string): boolean {
		return /\b(curl|wget|ssh|scp|sftp|rsync|ping|traceroute|dig|nslookup|host|telnet|nc|ncat|ftp|httpie)\b|\bgit\s+(clone|fetch|pull|push|ls-remote)\b|\b(npm|pnpm|yarn|bun)\s+(install|add|update|upgrade|publish|dlx|create)\b|\bpip(?:3)?\s+install\b|\bpoetry\s+(add|install|update|publish)\b|\bcargo\s+(install|search|publish|update)\b|\bgo\s+(get|install)\b|\bdocker\s+(pull|push|login|buildx)\b/i.test(command);
	}

	private async resolveNetworkModeForCommand(
		command: string,
		override?: "allow" | "deny" | "ask",
	): Promise<{ networkMode: "allow" | "deny" | "ask"; approvalDecision?: NetworkApprovalDecision }> {
		const config = this.getSandboxConfig();
		const networkMode = override ?? config.networkMode;
		if (networkMode !== "ask") {
			return { networkMode };
		}
		if (!this.isLikelyNetworkCommand(command)) {
			return { networkMode: "deny" };
		}
		if (this.networkAccessApprovedForSession) {
			return { networkMode: "allow", approvalDecision: "allow-session" };
		}
		const approvalDecision = await requestNetworkApproval({
			command,
			message: "This bash command appears to need network access. Allow network for this command?",
		});
		if (approvalDecision === "allow-session") {
			this.networkAccessApprovedForSession = true;
		}
		if (approvalDecision === "deny") {
			throw new SandboxNetworkDeniedError();
		}
		return {
			networkMode: "allow",
			approvalDecision,
		};
	}

	async shouldAutoAllowToolCall(toolName: string): Promise<boolean> {
		if (toolName !== "bash") return false;
		const config = this.getSandboxConfig();
		if (!config.autoAllowBashIfSandboxed) return false;
		if (this.getSandboxPolicy() === "none") return false;
		return this.isAvailable();
	}

	async shouldAutoAllowDirectBash(): Promise<boolean> {
		const config = this.getSandboxConfig();
		if (!config.autoAllowBashIfSandboxed) return false;
		if (this.getSandboxPolicy() === "none") return false;
		return this.isAvailable();
	}

	async getExecutionPlan(command: string, options: SandboxCommandOptions): Promise<SandboxExecutionPlan> {
		const policy = this.getSandboxPolicy(options.permissionMode);
		if (policy === "none" || !(await this.isAvailable())) {
			return {
				program: options.shell,
				args: [...options.shellArgs, command],
				sandboxed: false,
				policy: "none",
			};
		}

		const config = this.getSandboxConfig();
		const networkResolution = await this.resolveNetworkModeForCommand(command, options.networkModeOverride);
		const effectiveConfig = {
			...config,
			networkMode: networkResolution.networkMode,
			networkEnabled: networkResolution.networkMode === "allow",
		};
		if (process.platform === "linux") {
			const detected = detectBwrap();
			if (detected.available && detected.path) {
				return {
					program: detected.path,
					args: buildBwrapArgs(command, resolve(options.cwd), options.shell, options.shellArgs, effectiveConfig),
					sandboxed: true,
					policy,
				};
			}
		}

		if (process.platform === "darwin" && detectSandboxExec()) {
			const profile = buildSeatbeltProfile(resolve(options.cwd), effectiveConfig);
			return {
				program: "/usr/bin/sandbox-exec",
				args: buildSeatbeltArgs(command, options.shell, options.shellArgs, profile),
				sandboxed: true,
				policy,
			};
		}

		return {
			program: options.shell,
			args: [...options.shellArgs, command],
			sandboxed: false,
			policy: "none",
		};
	}
}
