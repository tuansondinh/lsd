import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

function makeAccount(id: string, accessToken: string) {
	return {
		id,
		accountId: `${id}-account`,
		refreshToken: `${id}-refresh`,
		accessToken,
		expiresAt: Date.now() + 60 * 60 * 1000,
		addedAt: Date.now(),
		disabled: false,
	};
}

test("codex rotate sync requires auth reload before usage-limit rotation sees new credentials", async () => {
	const agentDir = mkdtempSync(join(tmpdir(), "lsd-codex-rotate-"));
	const previousAgentDir = process.env.LSD_CODING_AGENT_DIR;
	process.env.LSD_CODING_AGENT_DIR = agentDir;

	try {
		const [{ syncAccountsToAuth }, { AuthStorage }] = await Promise.all([
			import("../resources/extensions/codex-rotate/sync.ts"),
			import("@gsd/pi-coding-agent"),
		]);

		const authPath = join(agentDir, "auth.json");
		const authStorage = AuthStorage.create(authPath);
		const sessionId = "sess-codex-retry";

		const primary = makeAccount("primary", "codex-primary-token");
		const secondary = makeAccount("secondary", "codex-secondary-token");

		const synced = await syncAccountsToAuth([primary, secondary]);
		assert.equal(synced, true);

		// Regression guard: codex-rotate writes auth.json directly, so the live
		// AuthStorage instance stays stale until explicitly reloaded.
		assert.equal(authStorage.getCredentialsForProvider("openai-codex").length, 0);

		authStorage.reload();
		assert.equal(authStorage.getCredentialsForProvider("openai-codex").length, 2);

		const firstKey = await authStorage.getApiKey("openai-codex", sessionId);
		assert.equal(firstKey, "codex-primary-token");

		const hasAlternate = authStorage.markUsageLimitReached("openai-codex", sessionId, {
			errorType: "quota_exhausted",
		});
		assert.equal(hasAlternate, true);

		const retriedKey = await authStorage.getApiKey("openai-codex", sessionId);
		assert.equal(retriedKey, "codex-secondary-token");
	} finally {
		if (previousAgentDir === undefined) {
			delete process.env.LSD_CODING_AGENT_DIR;
		} else {
			process.env.LSD_CODING_AGENT_DIR = previousAgentDir;
		}
		rmSync(agentDir, { recursive: true, force: true });
	}
});
