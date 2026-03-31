import { createHash } from "node:crypto";
import { request } from "node:https";
import type { AuthStorage } from "./auth-storage.js";

const MAX_CONCURRENT = 5;

const BUILT_IN_BASH_DENY_PATTERNS = [
	"ssh *",
	"ssh",
	"scp *",
	"sftp *",
	"sftp",
	"curl * | sh",
	"curl * | bash",
	"curl * | zsh",
	"wget * | sh",
	"wget * | bash",
	"wget * | zsh",
	"nc -l *",
	"nc -l",
	"ncat -l *",
	"ncat -l",
	"curl * -d @*/.ssh/*",
	"curl * --data @*/.ssh/*",
	"curl * -d @*/.aws/*",
	"curl * --data @*/.aws/*",
	"sed -i *",
	"sed -i",
	"kill -9 *",
	"kill -9",
	"killall *",
	"killall",
	"sudo *",
	"sudo",
	"rm -rf /",
	"rm -rf /*",
	"dd if=* of=/dev/*",
	"mkfs *",
	"mkfs.*",
	"npm publish",
	"npm publish *",
	"pip publish",
	"pip publish *",
	"twine upload *",
	"git push --force *",
	"git push --force",
	"git push -f *",
	"git push -f",
] as const;

const BUILT_IN_BASH_ALLOW_PATTERNS = [
	"find *",
	"grep *",
	"rg *",
	"ripgrep *",
	"ls",
	"ls *",
	"cat *",
	"head *",
	"tail *",
	"wc *",
	"file *",
	"stat *",
	"echo *",
	"printf *",
	"pwd",
	"env",
	"printenv",
	"printenv *",
	"which *",
	"type *",
	"command *",
	"du *",
	"df *",
	"cd",
	"cd *",
	"xargs *",
	"git status",
	"git status *",
	"git log",
	"git log *",
	"git diff",
	"git diff *",
	"git show",
	"git show *",
	"git branch",
	"git branch *",
	"git remote",
	"git remote *",
	"git blame *",
	"git stash list",
	"git stash list *",
	"npm list",
	"npm list *",
	"npm info *",
	"node --version",
	"npm --version",
	"npx --version",
	"node -v",
	"npm -v",
	"npx -v",
	"tsc --noEmit",
	"tsc --noEmit *",
	"sort *",
	"uniq *",
	"cut *",
	"awk *",
	"sed -n *",
	"less *",
	"more *",
] as const;

export interface ClassifierContext {
	userMessages: string[];
	projectInstructions?: string;
}

export interface ClassifierDecision {
	approved: boolean;
	reason: string;
	source: "rule" | "classifier" | "cache" | "fallback" | "timeout";
}

export interface ClassifierRule {
	toolName: string;
	pattern: string;
	decision: "allow" | "deny";
}

function isOAuthToken(token: string): boolean {
	return token.includes("sk-ant-oat");
}

export class ClassifierService {
	private cache = new Map<string, { approved: boolean; timestamp: number }>();
	private active = 0;
	private queue: Array<() => void> = [];
	private authStorage: AuthStorage;

	constructor(authStorage: AuthStorage) {
		this.authStorage = authStorage;
	}

	evaluateRules(toolName: string, args: any, rules: ClassifierRule[] = []): "allow" | "deny" | null {
		const candidates = this.getMatchCandidates(toolName, args);
		if (candidates.length === 0) return null;

		if (toolName === "bash") {
			for (const pattern of BUILT_IN_BASH_DENY_PATTERNS) {
				for (const text of candidates) {
					if (this.matchPattern(pattern, text)) return "deny";
				}
			}
		}

		for (const rule of rules) {
			if (rule.decision === "deny" && rule.toolName === toolName) {
				for (const text of candidates) {
					if (this.matchPattern(rule.pattern, text)) return "deny";
				}
			}
		}

		for (const rule of rules) {
			if (rule.decision === "allow" && rule.toolName === toolName) {
				if (this.allSubcommandsAllowed(candidates, [rule.pattern])) return "allow";
			}
		}

		if (toolName === "bash") {
			if (this.allSubcommandsAllowed(candidates, BUILT_IN_BASH_ALLOW_PATTERNS)) return "allow";
		}

		return null;
	}

	async classifyToolCall(
		toolName: string,
		args: any,
		context: ClassifierContext,
		options?: { provider?: "anthropic" | "google"; classifierModel?: string; sessionId?: string; rules?: ClassifierRule[] },
	): Promise<ClassifierDecision> {
		const ruleDecision = this.evaluateRules(toolName, args, options?.rules ?? []);
		if (ruleDecision === "allow") {
			return { approved: true, reason: "Matched built-in allow rule", source: "rule" };
		}
		if (ruleDecision === "deny") {
			return { approved: false, reason: "Matched built-in deny rule", source: "rule" };
		}

		const resolved = this.resolveClassifierConfig(options?.provider, options?.classifierModel);
		const argsJson = JSON.stringify(args);
		const latestMessage = context.userMessages.at(-1) ?? "";
		const cacheKey = `${resolved.provider}:${resolved.modelId}:${toolName}:${this.hash(argsJson)}:${this.hash(latestMessage)}`;
		const cached = this.cache.get(cacheKey);
		if (cached && Date.now() - cached.timestamp < 30_000) {
			return { approved: cached.approved, reason: "Cached decision", source: "cache" };
		}

		const apiKey = await this.authStorage.getApiKey(resolved.provider, options?.sessionId);
		if (!apiKey) {
			return {
				approved: false,
				reason: `No ${resolved.provider === "google" ? "Google Gemini" : "Anthropic"} API key`,
				source: "fallback",
			};
		}

		await this.acquireSlot();
		try {
			const approved =
				resolved.provider === "google"
					? await this.callGeminiClassifier(apiKey, resolved.modelId, toolName, argsJson, context)
					: await this.callAnthropicClassifier(apiKey, resolved.modelId, toolName, argsJson, context);
			this.cache.set(cacheKey, { approved, timestamp: Date.now() });
			return {
				approved,
				reason: approved ? "Classifier approved" : "Classifier denied",
				source: "classifier",
			};
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			return {
				approved: false,
				reason: message === "timeout" ? "Classifier timeout" : `Classifier error: ${message}`,
				source: message === "timeout" ? "timeout" : "fallback",
			};
		} finally {
			this.releaseSlot();
		}
	}

	private resolveClassifierConfig(provider?: "anthropic" | "google", classifierModel?: string): { provider: "anthropic" | "google"; modelId: string } {
		let resolvedProvider: "anthropic" | "google" = provider ?? "anthropic";
		let resolvedModelId = resolvedProvider === "google" ? "gemini-3-flash-preview" : "claude-haiku-4-5";

		if (classifierModel) {
			const slashIndex = classifierModel.indexOf("/");
			const modelProvider = slashIndex === -1 ? "" : classifierModel.slice(0, slashIndex);
			const modelId = slashIndex === -1 ? classifierModel : classifierModel.slice(slashIndex + 1);
			if (modelId) {
				if (modelProvider.startsWith("google")) {
					resolvedProvider = "google";
					resolvedModelId = modelId;
				} else if (modelProvider.startsWith("anthropic")) {
					resolvedProvider = "anthropic";
					resolvedModelId = modelId;
				}
			}
		}

		return { provider: resolvedProvider, modelId: resolvedModelId };
	}

	private async callAnthropicClassifier(
		apiKey: string,
		modelId: string,
		toolName: string,
		argsJson: string,
		context: ClassifierContext,
	): Promise<boolean> {
		const systemPrompt = `You are a security classifier for an autonomous coding agent. Your job is to decide ALLOW or DENY for a pending tool call.

DEFAULT: ALLOW. The user enabled auto mode because they trust the agent. Only deny clear security violations.

ALWAYS ALLOW:
- Any read-only operation: find, grep, ls, cat, head, tail, wc, stat, file, du, df, echo, pwd, env, which, sort, awk, sed -n
- Any git read operation: git status, git log, git diff, git show, git branch, git blame, git remote
- Build/test/lint: npm run *, npx *, tsc, eslint, jest, vitest, cargo, make
- Writing or editing files inside the project directory
- Installing packages: npm install, pip install, cargo add
- Operations clearly implied by the user's recent messages

DENY only these specific violations:
- Deleting files with rm, unlink, rmdir (unless user explicitly said "delete" or "remove" that file)
- Commands outside the project directory targeting system paths (/etc, /usr, /bin, /System, ~/.ssh)
- sudo, su, chmod/chown on system paths
- curl/wget piped directly to sh/bash (arbitrary code execution)
- curl/wget sending local files or env vars to external hosts (e.g. -d @~/.ssh/id_rsa, -d "$(env)")
- ssh, scp, sftp — remote shell/file access is out of scope for a coding agent
- nc/ncat in listen/server mode (-l flag) — reverse shell risk
- kill -9, killall — terminating arbitrary processes
- crontab — modifying scheduled jobs
- dd, mkfs — disk/filesystem writes
- sed -i — in-place file editing that can silently corrupt files; agent should use proper edit tools
- npm publish, pip publish, twine upload — publishing packages requires explicit user action
- git push --force / git push -f — destructive remote history rewrite
- Accessing credential files unrelated to the current task (~/.aws, ~/.ssh/id_rsa, /etc/passwd)
- Commands that clearly contradict the user's stated intent

Use the user's recent messages to judge intent. If the user asked for something and the tool call implements it, ALLOW.

Output exactly one word: ALLOW or DENY.`;

		const userPrompt = this.buildUserPrompt(toolName, argsJson, context);

		return new Promise<boolean>((resolve, reject) => {
			const data = JSON.stringify({
				model: modelId,
				max_tokens: 10,
				system: systemPrompt,
				messages: [{ role: "user", content: userPrompt }],
			});
			const headers: Record<string, string | number> = {
				"Content-Type": "application/json",
				"anthropic-version": "2023-06-01",
				"Content-Length": Buffer.byteLength(data),
			};
			if (isOAuthToken(apiKey)) {
				headers.Authorization = `Bearer ${apiKey}`;
				headers["anthropic-beta"] = "claude-code-20250219,oauth-2025-04-20,fine-grained-tool-streaming-2025-05-14";
				headers["user-agent"] = "claude-cli/2.1.62";
				headers["x-app"] = "cli";
			} else {
				headers["x-api-key"] = apiKey;
			}

			const req = request(
				{ hostname: "api.anthropic.com", port: 443, path: "/v1/messages", method: "POST", headers, timeout: 10_000 },
				(res) => {
					let body = "";
					res.on("data", (chunk) => { body += chunk; });
					res.on("end", () => {
						if (res.statusCode !== 200) {
							reject(new Error(`anthropic ${res.statusCode}: ${body}`));
							return;
						}
						try {
							const parsed = JSON.parse(body);
							const text = parsed?.content?.[0]?.text?.trim?.().toUpperCase?.();
							resolve(text === "ALLOW");
						} catch (error) {
							reject(error);
						}
					});
				},
			);
			req.on("timeout", () => req.destroy(new Error("timeout")));
			req.on("error", reject);
			req.write(data);
			req.end();
		});
	}

	private async callGeminiClassifier(
		apiKey: string,
		modelId: string,
		toolName: string,
		argsJson: string,
		context: ClassifierContext,
	): Promise<boolean> {
		const systemPrompt = `You are a security classifier for an autonomous coding agent. Decide ALLOW or DENY for a pending tool call.

DEFAULT: ALLOW. The user enabled auto mode because they trust the agent. Only deny clear security violations.

ALLOW:
- Read-only commands
- Git read commands
- Build/test/lint commands
- Writing/editing files inside the project
- Commands clearly requested by the user

DENY:
- rm/unlink/rmdir unless the user explicitly asked to delete/remove that file
- system-path modifications (/etc, /usr, /bin, /System, ~/.ssh)
- sudo/su
- curl/wget piped to shell
- exfiltrating local secrets/files
- ssh/scp/sftp
- nc/ncat -l
- kill -9 / killall
- crontab
- dd / mkfs
- sed -i
- npm/pip/twine publish
- git push --force / -f

Output exactly one word: ALLOW or DENY.`;

		const userPrompt = this.buildUserPrompt(toolName, argsJson, context);

		return new Promise<boolean>((resolve, reject) => {
			const data = JSON.stringify({
				system_instruction: { parts: [{ text: systemPrompt }] },
				contents: [{ role: "user", parts: [{ text: userPrompt }] }],
				generationConfig: { temperature: 0, maxOutputTokens: 8 },
			});

			const req = request(
				{
					hostname: "generativelanguage.googleapis.com",
					port: 443,
					path: `/v1beta/models/${encodeURIComponent(modelId)}:generateContent?key=${encodeURIComponent(apiKey)}`,
					method: "POST",
					headers: {
						"Content-Type": "application/json",
						"Content-Length": Buffer.byteLength(data),
					},
					timeout: 10_000,
				},
				(res) => {
					let body = "";
					res.on("data", (chunk) => { body += chunk; });
					res.on("end", () => {
						if (res.statusCode !== 200) {
							reject(new Error(`gemini ${res.statusCode}: ${body}`));
							return;
						}
						try {
							const parsed = JSON.parse(body);
							const text = parsed?.candidates?.[0]?.content?.parts?.[0]?.text?.trim?.().toUpperCase?.();
							resolve(text === "ALLOW");
						} catch (error) {
							reject(error);
						}
					});
				},
			);
			req.on("timeout", () => req.destroy(new Error("timeout")));
			req.on("error", reject);
			req.write(data);
			req.end();
		});
	}

	private buildUserPrompt(toolName: string, argsJson: string, context: ClassifierContext): string {
		const recentMessages = context.userMessages.slice(-10).join("\n\n");
		return `Recent user messages:
${recentMessages || "(none)"}

Project instructions:
${context.projectInstructions || "(none)"}

Tool:
${toolName}

Args JSON:
${argsJson}`;
	}

		private getMatchCandidates(toolName: string, args: any): string[] {
			if (toolName === "bash") {
				const command = typeof args?.command === "string" ? args.command.trim() : "";
				return command ? command.split(/(?:\n|&&|;|\|\|)/).map((part: string) => part.trim()).filter(Boolean) : [];
			}

		const values: string[] = [];
		if (args && typeof args === "object") {
			for (const value of Object.values(args)) {
				if (typeof value === "string") values.push(value);
			}
		}
		return values;
	}

	private matchPattern(pattern: string, text: string): boolean {
		const escaped = pattern
			.replace(/[.+?^${}()|[\]\\]/g, "\\$&")
			.replace(/\*/g, ".*");
		return new RegExp(`^${escaped}$`, "i").test(text.trim());
	}

	private allSubcommandsAllowed(candidates: string[], allowPatterns: readonly string[]): boolean {
		return candidates.every((candidate) =>
			allowPatterns.some((pattern) => this.matchPattern(pattern, candidate)),
		);
	}

	private hash(input: string): string {
		return createHash("sha256").update(input).digest("hex").slice(0, 16);
	}

	private async acquireSlot(): Promise<void> {
		if (this.active < MAX_CONCURRENT) {
			this.active++;
			return;
		}
		await new Promise<void>((resolve) => this.queue.push(resolve));
		this.active++;
	}

	private releaseSlot(): void {
		this.active = Math.max(0, this.active - 1);
		const next = this.queue.shift();
		if (next) next();
	}
}
