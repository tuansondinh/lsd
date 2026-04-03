# Codex OAuth Rotation Extension - Implementation Summary

## Overview

Implemented a Codex OAuth rotation extension for LSD that manages multiple ChatGPT/Codex OAuth accounts with automatic rotation and background token refresh.

## Implementation Status: Phase 1 (Core) ✅

### Completed Features

1. **Account Store** (`accounts.ts`)
   - CRUD operations for `codex-accounts.json`
   - File permissions set to `chmod 600`
   - Query methods for active accounts, expiring accounts, etc.

2. **Token Sync to auth.json** (`sync.ts`)
   - Uses `FileAuthStorageBackend.withLockAsync()` for atomic updates
   - Writes `openai-codex` credential array with `api_key` type
   - Avoids the `set()` method (which appends duplicates)
   - Maintains stable credential order for index-based backoff
   - Followed by a live `AuthStorage.reload()` in the extension so the running process sees account changes immediately

3. **Background Refresh Timer** (`index.ts`)
   - Runs every 10 minutes
   - Refreshes tokens expiring within 5 minutes
   - Automatically syncs refreshed tokens to auth.json
   - Cleans up on session shutdown

4. **OAuth Flow** (`oauth.ts`)
   - Wraps `loginOpenAICodex()` from `@gsd/pi-ai/oauth`
   - Supports importing from `~/.codex/auth.json`
   - Supports importing from Cockpit Tools
   - Handles token refresh with `refreshOpenAICodexToken()`

5. **Commands** (`commands.ts`)
   - `/codex add` - Start OAuth login flow
   - `/codex list` - Display all accounts
   - `/codex status` - Show rotation state
   - `/codex remove` - Remove account
   - `/codex enable` - Re-enable account
   - `/codex disable` - Disable account
   - `/codex import` - Import from existing auth
   - `/codex import-cockpit` - Import from Cockpit
   - `/codex sync` - Force refresh all tokens

6. **Error Detection / Rotation Path**
   - Quota/rate-limit/auth classification lives in `quota.ts`
   - Same-turn retry and per-credential backoff are performed by core `RetryHandler`
   - The extension's responsibility is to keep `auth.json` and the live in-memory auth state in sync

## File Structure

```
src/resources/extensions/codex-rotate/
├── index.ts                 # Extension entry point, lifecycle hooks
├── accounts.ts              # Account CRUD, token refresh logic
├── oauth.ts                 # OAuth flow wrapper
├── sync.ts                  # auth.json ↔ codex-accounts.json sync
├── commands.ts              # /codex command handlers
├── quota.ts                 # Error detection and backoff integration
├── config.ts                # Extension settings (refresh interval, etc.)
├── types.ts                 # TypeScript types
├── extension-manifest.json  # Extension metadata
└── README.md                # User documentation
```

## Key Design Decisions

### 1. "api_key" Credential Type

Storing Codex access tokens as `type: "api_key"` credentials:
- ✅ Gets full round-robin selection
- ✅ Gets per-credential backoff
- ✅ JWT tokens work as API keys (provider extracts accountId)
- ✅ Avoids multi-OAuth refresh bug

### 2. Background Refresh Strategy

Using a 10-minute interval timer:
- Refreshes tokens when `expiresAt - Date.now() < 5 * 60 * 1000`
- Better UX than lazy refresh (no per-request latency spikes)
- Aligns with how LSD's built-in OAuth refresh works

### 3. Atomic File Updates

Using `FileAuthStorageBackend.withLockAsync()`:
- Prevents race conditions with multiple LSD instances
- Replaces entire credential array (not just updating keys)
- Maintains stable order for index-based backoff
- Requires a follow-up live auth reload in the current process so retry rotation uses the updated credential set

### 4. Session-Sticky Credential Selection

LSD already uses session-sticky selection by default:
- `selectCredentialIndex` hashes sessionId for consistent selection
- Round-robin only kicks in when sticky credential is backed off
- Aligns with Codex's `prompt_cache_key` for better cache hits

## Known Limitations

1. **All accounts exhausted**: When all credentials are backed off, LSD's `areAllCredentialsBackedOff()` returns true. Agent shows a friendly error with estimated wait time.

2. **Token refresh failures**: Accounts with failed refreshes are disabled with a reason. User must re-add them with `/codex add`.

3. **Mixed auth modes**: If user has some accounts via OAuth and manually adds API keys, both coexist in the credentials array.

## Next Steps: Phase 2 (Resilience)

Remaining improvements that could still be added:

1. **Richer `/codex status` diagnostics**
   - Show live backoff / credential-availability state from `AuthStorage`
   - Make it easier to verify when an account was rotated away after a usage-limit hit

2. **External change detection**
   - Could listen for external auth/account file modifications
   - Would re-sync / reload on change detection

3. **Migration helpers**
   - Could add `/codex migrate` to assist users moving from Cockpit
   - Could add validation checks before removing old setup

## Testing

Implemented regression coverage now includes:
- `src/tests/codex-rotate-auth-reload.test.ts`
- Verifies that codex-rotate syncs require a live auth reload for the running process to see the latest credentials
- Verifies `quota_exhausted` backoff on one `openai-codex` credential causes the next retry to select the next credential

Manual smoke test:
1. Add an account: `/codex add`
2. Check status: `/codex status`
3. Add another account: `/codex add`
4. List all: `/codex list`
5. Disable one: `/codex disable 1`
6. Re-enable: `/codex enable 1`
7. Sync all: `/codex sync`

## Security Considerations

1. `codex-accounts.json` stores refresh tokens → always `chmod 600`
2. File locking for concurrent access
3. Refresh tokens are long-lived — handle revocation gracefully
4. Never log access tokens or refresh tokens in plaintext

## References

- Plan document: `.plans/codex-auto-rotate-extension.md`
- AuthStorage: `packages/pi-coding-agent/src/core/auth-storage.ts`
- OAuth utils: `packages/pi-ai/src/utils/oauth/openai-codex.ts`
- Codex provider: `packages/pi-ai/src/providers/openai-codex-responses.ts`
