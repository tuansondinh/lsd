/**
 * Codex OAuth Rotation Extension
 *
 * Manages multiple ChatGPT/Codex OAuth accounts with automatic rotation
 * and background token refresh.
 */

import type { ExtensionAPI } from "@gsd/pi-coding-agent";
import { getAllAccounts, updateAccount, getAccountsNeedingRefresh } from "./accounts.js";
import { syncAccountsToAuth } from "./sync.js";
import { registerCodexCommand } from "./commands.js";
import { REFRESH_INTERVAL_MS } from "./config.js";
import { logCodexRotateError } from "./logger.js";

let refreshTimer: NodeJS.Timeout | null = null;

/**
 * Refresh all accounts that need it
 */
async function refreshExpiringAccounts(): Promise<void> {
	try {
		const accountsNeedingRefresh = getAccountsNeedingRefresh();

		if (accountsNeedingRefresh.length === 0) {
			return;
		}

		const { refreshAccountToken } = await import("./oauth.js");
		let successCount = 0;
		let failCount = 0;

		for (const account of accountsNeedingRefresh) {
			try {
				const refreshed = await refreshAccountToken(account);
				updateAccount(account.id, refreshed);
				successCount++;
			} catch (error) {
				failCount++;
				logCodexRotateError(`Failed to refresh account ${account.id}:`, error);
				// Disable the account if refresh fails
				updateAccount(account.id, {
					disabled: true,
					disabledReason: `Token refresh failed: ${error instanceof Error ? error.message : String(error)}`,
				});
			}
		}

		if (successCount > 0) {
			// Sync refreshed accounts to auth.json
			const allAccounts = getAllAccounts();
			await syncAccountsToAuth(allAccounts);
		}

		if (failCount > 0 && successCount === 0) {
			logCodexRotateError(`Failed to refresh ${failCount} account(s)`);
		}
	} catch (error) {
		logCodexRotateError("Error in refresh task:", error);
	}
}

/**
 * Start the background refresh timer
 */
function startRefreshTimer(): void {
	if (refreshTimer) {
		clearInterval(refreshTimer);
	}

	refreshTimer = setInterval(() => {
		void refreshExpiringAccounts();
	}, REFRESH_INTERVAL_MS);
}

/**
 * Stop the background refresh timer
 */
function stopRefreshTimer(): void {
	if (refreshTimer) {
		clearInterval(refreshTimer);
		refreshTimer = null;
	}
}

/**
 * Main extension entry point
 */
export default function CodexRotateExtension(pi: ExtensionAPI) {

	// Register commands
	registerCodexCommand(pi);

	// Session start hook
	pi.on("session_start", async (_event) => {
		const accounts = getAllAccounts();

		if (accounts.length === 0) {
			return;
		}

		// Refresh any expiring accounts immediately
		await refreshExpiringAccounts();

		// Sync to auth.json
		await syncAccountsToAuth(getAllAccounts());

		// Start background refresh timer
		startRefreshTimer();
	});

	// Session shutdown hook
	pi.on("session_shutdown", () => {
		stopRefreshTimer();
	});

	// Agent end hook intentionally omitted.
	// Credential backoff + same-turn retry now lives in the core RetryHandler,
	// which knows the actual credential index used for the current session.
}
