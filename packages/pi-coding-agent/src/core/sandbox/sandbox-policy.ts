import type { PermissionMode } from "../tool-approval.js";

export type SandboxPolicy = "none" | "workspace-write";

export interface SandboxConfig {
	enabled: boolean;
	autoAllowBashIfSandboxed: boolean;
	writableRoots: string[];
	readOnlySubpaths: string[];
	networkEnabled: boolean;
	networkMode: "allow" | "ask" | "deny";
}

export interface SandboxExecutionPlan {
	program: string;
	args: string[];
	sandboxed: boolean;
	policy: SandboxPolicy;
}

export function permissionModeToSandboxPolicy(mode: PermissionMode): SandboxPolicy {
	switch (mode) {
		case "plan":
			return "none";
		case "danger-full-access":
			return "workspace-write";
		case "accept-on-edit":
		case "auto":
			return "workspace-write";
		default:
			return "none";
	}
}

export const DEFAULT_READ_ONLY_SUBPATHS = [
	".gsd",
	".claude",
	"node_modules/.cache",
];
