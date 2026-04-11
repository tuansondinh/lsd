# Extension Security Remediation Plan

**Generated:** April 10, 2026  
**Scope:** 3 Critical, 8 High, 15 Medium, 12 Low severity issues  
**Total Extensions Affected:** 18 of 27 (67%)  

---

## PHASE 1: CRITICAL ISSUES (Week 1)

### 1.1 Fix Shell Injection in bg-shell

**File:** `src/resources/extensions/bg-shell/bg-shell-tool.ts:312-315`

**Current Code:**
```typescript
case "send": {
    if (!params.id) { ... }
    if (params.input === undefined) { ... }
    const bg = processes.get(params.id);
    if (!bg) { ... }
    if (!bg.alive) { ... }
    try {
        bg.proc.stdin?.write(params.input + "\n");  // ← VULNERABLE
```

**Remediation:**
```typescript
case "send": {
    if (!params.id) { ... }
    if (params.input === undefined) { ... }
    const bg = processes.get(params.id);
    if (!bg) { ... }
    if (!bg.alive) { ... }
    
    // Validate and escape input
    if (params.input.length > 100000) {
        return {
            content: [{ type: "text", text: "Error: input too large (max 100KB)" }],
            isError: true,
            details: undefined as unknown,
        };
    }
    
    try {
        // For shell sessions, write safely
        bg.proc.stdin?.write(params.input + "\n");
        // DO NOT use this for arbitrary command injection
        // The input is meant for interactive stdin, not shell parsing
        return {
            content: [{ type: "text", text: `Sent input to process ${bg.id}` }],
            details: { action: "send", process: getInfo(bg) },
        };
    } catch (err) {
        return {
            content: [{ type: "text", text: `Error writing to stdin: ${err instanceof Error ? err.message : String(err)}` }],
            isError: true,
            details: undefined as unknown,
        };
    }
}
```

**Testing:**
```bash
# Test 1: Normal input
bg_shell send id="<id>" input="hello"

# Test 2: Input with special characters (should be passed as-is, not interpreted)
bg_shell send id="<id>" input="$(whoami)"  # Should send literal string, not execute

# Test 3: Long input rejection
bg_shell send id="<id>" input="<100KB+ string>"  # Should return error
```

**Review Checklist:**
- [ ] Add input length validation
- [ ] Document that `send` is for interactive stdin, not command injection
- [ ] Add integration test for shell special characters

---

### 1.2 Fix Command Injection in aws-auth

**File:** `src/resources/extensions/aws-auth/index.ts:100-101`

**Current Code:**
```typescript
async function runRefresh(
    command: string,
    notify: (msg: string, level: "info" | "warning" | "error") => void,
): Promise<boolean> {
    notify("Refreshing AWS credentials...", "info");
    try {
        await new Promise<void>((resolve, reject) => {
            const child = exec(command, { timeout: 120_000, env: { ...process.env } });  // ← VULNERABLE
```

**Remediation:**
```typescript
// Add at top of file
const AWS_SSO_CMD_RE = /^aws\s+(sso\s+)?(login|logout)(?:\s+--profile\s+[\w\-_.]+)?(?:\s+--region\s+[\w\-_.]+)?$/;

/** Validate AWS refresh command format. */
function validateAwsAuthRefreshCommand(command: string): { valid: boolean; error?: string } {
    const trimmed = command.trim();
    
    // Only allow 'aws sso login' or 'aws login' with optional flags
    if (!AWS_SSO_CMD_RE.test(trimmed)) {
        return {
            valid: false,
            error: "Command must match: aws [sso] [login|logout] [--profile NAME] [--region REGION]",
        };
    }
    
    // Reject command chaining
    if (/[&;|`$(){}\\]/.test(trimmed)) {
        return {
            valid: false,
            error: "Command chaining not allowed",
        };
    }
    
    return { valid: true };
}

async function runRefresh(
    command: string,
    notify: (msg: string, level: "info" | "warning" | "error") => void,
): Promise<boolean> {
    // Validate command format
    const validation = validateAwsAuthRefreshCommand(command);
    if (!validation.valid) {
        notify(`Invalid AWS refresh command: ${validation.error}`, "error");
        return false;
    }
    
    notify("Refreshing AWS credentials...", "info");
    try {
        // Parse command safely using execFile instead of exec
        const parts = command.trim().split(/\s+/);
        const bin = parts[0];  // Should be 'aws'
        const args = parts.slice(1);
        
        if (bin !== "aws") {
            notify("AWS refresh command must start with 'aws'", "error");
            return false;
        }
        
        await new Promise<void>((resolve, reject) => {
            const child = execFile("aws", args, { 
                timeout: 120_000, 
                env: { ...process.env },
                maxBuffer: 1024 * 1024,  // 1MB limit for output
            });
            
            const onData = (data: Buffer | string) => {
                const text = data.toString();
                const urlMatch = text.match(/https?:\/\/\S+/);
                if (urlMatch) {
                    notify(`Open this URL if the browser didn't launch: ${urlMatch[0]}`, "warning");
                }
                const codeMatch = text.match(/code[:\s]+([A-Z]{4}-[A-Z]{4})/i);
                if (codeMatch) {
                    notify(`Verification code: ${codeMatch[1]}`, "info");
                }
            };
            
            child.stdout?.on("data", onData);
            child.stderr?.on("data", onData);
            
            child.on("close", (code) => {
                if (code === 0) resolve();
                else reject(new Error(`AWS refresh failed with code ${code}`));
            });
            
            child.on("error", reject);
        });
        
        notify("AWS credentials refreshed successfully ✓", "info");
        return true;
    } catch (error) {
        // ... rest of error handling ...
    }
}
```

**Add imports:**
```typescript
import { execFile } from "node:child_process";
```

**Testing:**
```typescript
// tests/aws-auth.test.ts
import { describe, test, expect } from "node:test";
import { validateAwsAuthRefreshCommand } from "./index.js";

describe("AWS Auth Validation", () => {
    test("accepts valid aws sso login", () => {
        const result = validateAwsAuthRefreshCommand("aws sso login --profile myprofile");
        expect(result.valid).toBe(true);
    });
    
    test("rejects command chaining", () => {
        const result = validateAwsAuthRefreshCommand("aws sso login; rm -rf /");
        expect(result.valid).toBe(false);
        expect(result.error).toContain("chaining");
    });
    
    test("rejects subshells", () => {
        const result = validateAwsAuthRefreshCommand("aws sso login $(whoami)");
        expect(result.valid).toBe(false);
    });
    
    test("rejects exec redirection", () => {
        const result = validateAwsAuthRefreshCommand("aws sso login > /etc/passwd");
        expect(result.valid).toBe(false);
    });
});
```

**Deployment:**
- [ ] Add validation unit tests
- [ ] Update SETTINGS.md documentation with command format
- [ ] Test with various shell escaping attempts
- [ ] Add security note to extension docs

---

### 1.3 Document XSS Intent in browser-tools

**File:** `src/resources/extensions/browser-tools/tools/inspection.ts:193-225`

**Action:** Add explicit security documentation

```typescript
/**
 * Execute arbitrary JavaScript in browser context.
 * 
 * ⚠️ SECURITY NOTE: This tool allows execution of arbitrary JavaScript code.
 * By design, this is necessary for browser automation but represents an
 * attack vector if the expression parameter is controlled by untrusted input.
 * 
 * Mitigations:
 * - Only invoke this tool with expressions generated by the agent itself
 * - Never pass user input directly as the expression parameter
 * - Consider using safer alternatives (browser_find, browser_evaluate_safe)
 *   for common use cases
 * 
 * Similar to browser console — powerful but dangerous if misused.
 */
pi.registerTool({
    name: "browser_evaluate",
    // ... rest of tool definition ...
```

**Update tool prompt guidelines:**
```typescript
promptGuidelines: [
    "browser_evaluate executes arbitrary JavaScript — only use with agent-generated expressions.",
    "Never pass user input directly to browser_evaluate. Use browser_find or browser_get_accessibility_tree instead.",
    "For safe DOM inspection, use browser_get_page_source or browser_find — they don't execute code.",
],
```

**Deployment:**
- [ ] Update documentation with security note
- [ ] Add prompt guidelines warning
- [ ] Consider adding optional `allowedExpressions` allowlist in future

---

## PHASE 2: HIGH-SEVERITY ISSUES (Week 2)

### 2.1 Fix Memory Leak in voice extension

**File:** `src/resources/extensions/voice/index.ts:285-300`

**Current Code:**
```typescript
function startRecognizer(
    onPartial: (text: string) => void,
    onFinal: (text: string) => void,
    onError: (msg: string) => void,
    onReady: () => void,
) {
    if (IS_LINUX) {
        recognizerProcess = spawn(linuxPython(), [PYTHON_SCRIPT], {
            stdio: ["pipe", "pipe", "pipe"],
        });
    } else {
        recognizerProcess = spawn(RECOGNIZER_BIN, [], { stdio: ["pipe", "pipe", "pipe"] });
    }
    const rl = readline.createInterface({ input: recognizerProcess.stdout! });
    rl.on("line", (line: string) => {
        // ... line handling ...
    });
    recognizerProcess.on("error", (err) => onError(err.message));
    recognizerProcess.on("exit", () => { recognizerProcess = null; });  // ← Missing cleanup
}
```

**Remediation:**
```typescript
function startRecognizer(
    onPartial: (text: string) => void,
    onFinal: (text: string) => void,
    onError: (msg: string) => void,
    onReady: () => void,
) {
    let recognizerProcess: ChildProcess | null = null;
    let rl: readline.Interface | null = null;
    
    if (IS_LINUX) {
        recognizerProcess = spawn(linuxPython(), [PYTHON_SCRIPT], {
            stdio: ["pipe", "pipe", "pipe"],
        });
    } else {
        recognizerProcess = spawn(RECOGNIZER_BIN, [], { stdio: ["pipe", "pipe", "pipe"] });
    }
    
    rl = readline.createInterface({ input: recognizerProcess.stdout! });
    
    rl.on("line", (line: string) => {
        if (line === "READY") { onReady(); return; }
        if (line.startsWith("PARTIAL:")) onPartial(line.slice(8));
        else if (line.startsWith("FINAL:")) onFinal(line.slice(6));
        else if (line.startsWith("ERROR:")) onError(line.slice(6));
    });
    
    const cleanup = () => {
        if (rl) {
            rl.close();
            rl = null;
        }
        if (recognizerProcess) {
            recognizerProcess.kill("SIGTERM");
            recognizerProcess = null;
        }
    };
    
    recognizerProcess.on("error", (err) => {
        onError(err.message);
        cleanup();
    });
    
    recognizerProcess.on("exit", () => {
        cleanup();
    });
    
    // Return cleanup function for manual termination
    return cleanup;
}

async function runVoiceSession(ctx: ExtensionContext): Promise<void> {
    return new Promise<void>((resolve) => {
        const cleanup = startRecognizer(
            (text) => { ctx.ui.setEditorText(text); },
            (text) => { ctx.ui.setEditorText(text); },
            (msg) => ctx.ui.notify(`Voice: ${msg}`, "error"),
            () => {},
        );
        
        // ... existing code ...
        
        ctx.ui.custom<void>(
            (_tui, _theme, _kb, done) => ({
                render(): string[] { return []; },
                handleInput(data: string) {
                    if (isKeyRelease(data)) return;
                    if (matchesKey(data, Key.escape) || matchesKey(data, Key.enter)) {
                        cleanup();  // ← Explicit cleanup on exit
                        active = false;
                        setVoiceFooter(ctx, false);
                        done();
                    }
                },
                invalidate() {},
            }),
            { overlay: true, overlayOptions: { anchor: "bottom-center", width: "100%" } },
        ).then(() => resolve());
    });
}
```

**Testing:**
```typescript
test("readline interface cleaned up on process exit", async () => {
    const cleanup = startRecognizer(...);
    // Simulate process exit
    recognizerProcess?.emit("exit");
    // Wait for cleanup
    await new Promise(r => setTimeout(r, 100));
    // Verify readline is closed
    expect(rl.closed).toBe(true);
});
```

**Deployment:**
- [ ] Add cleanup function return value
- [ ] Test long-running voice sessions don't leak memory
- [ ] Monitor file descriptor count in tests

---

### 2.2 Fix Event Listener Cleanup in browser-tools

**File:** `src/resources/extensions/browser-tools/lifecycle.ts:148-156`

**Remediation:** Track and deregister all page listeners on close

```typescript
// In state.ts, add:
const pageListeners = new Map<Page, Array<() => void>>();

export function registerPageListener(page: Page, remove: () => void): void {
    if (!pageListeners.has(page)) {
        pageListeners.set(page, []);
    }
    pageListeners.get(page)!.push(remove);
}

export function removePageListeners(page: Page): void {
    const listeners = pageListeners.get(page);
    if (listeners) {
        for (const remove of listeners) {
            remove();
        }
        pageListeners.delete(page);
    }
}

// In lifecycle.ts, update attachPageListeners:
export function attachPageListeners(p: Page, pageId: number): void {
    const pendingMap = getPendingCriticalRequestsByPage();
    pendingMap.set(p, 0);

    const consoleLogs = getConsoleLogs();
    const networkLogs = getNetworkLogs();
    const dialogLogs = getDialogLogs();

    // Console messages
    const onConsole = (msg: any) => {
        logPusher(consoleLogs, {
            type: msg.type(),
            text: msg.text(),
            timestamp: Date.now(),
            url: p.url(),
            pageId,
        });
    };
    p.on("console", onConsole);
    registerPageListener(p, () => p.off("console", onConsole));

    // ... repeat pattern for all other listeners ...
    
    // Page close handler — removes page from registry and handles active fallback
    const onClose = () => {
        try {
            removePageListeners(p);
            registryRemovePage(pageRegistry, pageId);
        } catch {
            // Page already removed
        }
    };
    p.on("close", onClose);
    registerPageListener(p, () => p.off("close", onClose));
}
```

**Deployment:**
- [ ] Add listener tracking to state management
- [ ] Test page removal properly deregisters listeners
- [ ] Verify memory consumption stable over long sessions

---

### 2.3 Fix Header Injection in mcp-client

**File:** `src/resources/extensions/mcp-client/index.ts:189-190, 255`

**Remediation:**
```typescript
// Add validation function
function validateHeaders(headers: Record<string, string> | undefined): Record<string, string> {
    if (!headers) return {};
    
    const HEADER_NAME_RE = /^[!#$%&'*+\-.0-9A-Z^_`a-z|~]+$/;
    const result: Record<string, string> = {};
    
    for (const [key, value] of Object.entries(headers)) {
        // Validate header name
        if (!HEADER_NAME_RE.test(key)) {
            throw new Error(`Invalid HTTP header name: "${key}" contains forbidden characters`);
        }
        
        // Validate header value — no CRLF injection
        if (/[\r\n]/.test(value)) {
            throw new Error(`Invalid HTTP header value for "${key}": contains newlines`);
        }
        
        // Reasonable size limits
        if (key.length > 1000) {
            throw new Error(`HTTP header name too long: "${key}"`);
        }
        if (value.length > 10000) {
            throw new Error(`HTTP header value too long for "${key}"`);
        }
        
        result[key] = value;
    }
    
    return result;
}

// Update getOrConnect:
async function getOrConnect(name: string, signal?: AbortSignal): Promise<Client> {
    const config = getServerConfig(name);
    if (!config) throw new Error(`Unknown MCP server: "${name}".`);
    if (!config.enabled) throw new Error(`Server "${config.name}" is disabled.`);

    const existing = connections.get(config.name);
    if (existing) return existing.client;

    const client = new Client({ name: "lsd", version: "1.0.0" });
    let transport: StdioClientTransport | StreamableHTTPClientTransport;

    if (config.transport === "stdio" && config.command) {
        transport = new StdioClientTransport({
            command: config.command,
            args: config.args,
            env: config.env ? { ...process.env, ...resolveStringMap(config.env) } : undefined,
            cwd: config.cwd,
            stderr: "pipe",
        });
    } else if (config.transport === "http" && config.url) {
        const resolvedUrl = resolveString(config.url);
        const validatedHeaders = validateHeaders(config.headers);  // ← Add validation
        
        transport = new StreamableHTTPClientTransport(new URL(resolvedUrl), {
            requestInit: validatedHeaders ? { headers: validatedHeaders } : undefined,
        });
    } else {
        throw new Error(`Server "${config.name}" has unsupported transport: ${config.transport}`);
    }

    await client.connect(transport, { signal, timeout: 30000 });
    connections.set(config.name, { client, transport });
    return client;
}
```

**Testing:**
```typescript
test("rejects CRLF in header value", () => {
    expect(() => validateHeaders({ "X-Custom": "value\r\nX-Injected: evil" })).toThrow();
});

test("rejects invalid header names", () => {
    expect(() => validateHeaders({ "X@Custom": "value" })).toThrow();
});
```

**Deployment:**
- [ ] Add validation unit tests
- [ ] Document supported header format in config schema
- [ ] Add error message to config error handling

---

## PHASE 3: MEDIUM-SEVERITY ISSUES (Week 3-4)

### 3.1 Refactor subagent/index.ts (2,596 lines)

**Target Structure:**
```
subagent/
  ├── index.ts (200 lines) — Extension registration and entry point
  ├── orchestration.ts (600 lines) — Task delegation and chain logic
  ├── worker.ts (500 lines) — Worker execution and status tracking
  ├── isolation.ts (300 lines) — Filesystem isolation for background jobs
  ├── approval.ts (400 lines) — Approval UI and workflow
  ├── models.ts (200 lines) — Model resolution and configuration
  ├── background-job-manager.ts (already separate)
  ├── types.ts (200 lines) — Shared types
  └── tests/ (new)
      ├── orchestration.test.ts
      ├── worker.test.ts
      └── isolation.test.ts
```

**Effort:** 2-3 days  
**Review Checklist:**
- [ ] Extract `orchestration.ts` — all task chaining and delegation logic
- [ ] Extract `worker.ts` — worker registry, status tracking, execution
- [ ] Extract `approval.ts` — approval UI and proxy logic
- [ ] Extract `models.ts` — model resolution from context/config
- [ ] Add unit tests for each module
- [ ] Verify no cyclic imports

---

### 3.2 Update .gsd → .lsd References (31+ occurrences)

**Priority Files:**
1. `browser-tools/tools/state-persistence.ts:9, 20` — User-visible paths
2. `browser-tools/tools/visual-diff.ts:9, 19` — User-visible paths
3. `shared/rtk.ts` — All `GSD_RTK_*` env vars
4. `memory/auto-extract.ts` — CLI detection
5. `aws-auth/index.ts` — Settings file documentation
6. `voice/linux-ready.ts` — User instructions

**Approach:**

```bash
# Phase 1: Code paths (breaking changes, need migration)
find src/resources/extensions -name "*.ts" \
  -exec sed -i 's/\.gsd\/browser-state/.lsd\/browser-state/g' {} \;
find src/resources/extensions -name "*.ts" \
  -exec sed -i 's/\.gsd\/browser-baselines/.lsd\/browser-baselines/g' {} \;

# Phase 2: Env vars (add fallback for compatibility)
# Example: GSD_RTK_PATH → LSD_RTK_PATH with fallback

# Phase 3: Comments and docstrings
find src/resources/extensions -name "*.ts" \
  -exec sed -i 's/~\/.gsd\/agent/~\/.lsd\/agent/g' {} \;
```

**Example Change (shared/rtk.ts):**
```typescript
// Before
const GSD_RTK_PATH_ENV = "GSD_RTK_PATH";
const GSD_RTK_DISABLED_ENV = "GSD_RTK_DISABLED";
const GSD_RTK_REWRITE_TIMEOUT_MS_ENV = "GSD_RTK_REWRITE_TIMEOUT_MS";

// After (with backward compatibility)
const LSD_RTK_PATH_ENV = "LSD_RTK_PATH";
const GSD_RTK_PATH_ENV = "GSD_RTK_PATH";  // Deprecated fallback

export function getRtkPath(env: Record<string, string>): string {
    // Try LSD_RTK_PATH first (new), fall back to GSD_RTK_PATH (old)
    const path = env[LSD_RTK_PATH_ENV] ?? env[GSD_RTK_PATH_ENV];
    if (path) return path;
    return join(env.LSD_HOME || env.GSD_HOME || join(homedir(), ".lsd"), "agent", "bin");
}
```

**Effort:** 1 day  
**Review Checklist:**
- [ ] Migrate all user-facing path strings
- [ ] Add backward-compatibility fallbacks for env vars
- [ ] Update all comments and docstrings
- [ ] Run global find-replace for consistency

---

### 3.3 Extract Shared Error Handling Pattern

**File:** `src/resources/extensions/shared/error-utils.ts` (new)

```typescript
/**
 * Shared error handling utilities for all extensions.
 */

export function getErrorMessage(err: unknown): string {
    if (err instanceof Error) return err.message;
    if (typeof err === "string") return err;
    try {
        return JSON.stringify(err);
    } catch {
        return String(err);
    }
}

export function formatErrorForUser(err: unknown): string {
    const msg = getErrorMessage(err);
    // Truncate very long messages
    return msg.length > 500 ? `${msg.slice(0, 497)}...` : msg;
}

export function isTimeout(err: unknown): boolean {
    const msg = getErrorMessage(err).toLowerCase();
    return /timeout|etimedout|timed out/i.test(msg);
}

export function isCancellation(err: unknown): boolean {
    const msg = getErrorMessage(err).toLowerCase();
    return /cancel|abort|interrupted/i.test(msg);
}
```

**Adoption:**
Replace all occurrences of:
```typescript
const msg = err instanceof Error ? err.message : String(err);
```

With:
```typescript
import { getErrorMessage } from "../shared/error-utils.js";
const msg = getErrorMessage(err);
```

**Effort:** 1 day  
**Refactor Instances:** 15+ files

---

## PHASE 4: LOW-SEVERITY ITEMS (Week 5)

- [ ] Add max-length validation to browser_type text parameter
- [ ] Add CSS selector validation to browser_find
- [ ] Update remaining GSD references in comments
- [ ] Add unit tests for all security-critical extensions
- [ ] Refactor global state in browser-tools into class

---

## TESTING STRATEGY

### Unit Tests (Add to each extension)

```typescript
// tests/security.test.ts
describe("Security", () => {
    describe("Input validation", () => {
        test("rejects oversized inputs", () => { ... });
        test("rejects malicious patterns", () => { ... });
    });
    
    describe("Error handling", () => {
        test("handles network errors gracefully", () => { ... });
        test("no unhandled promise rejections", () => { ... });
    });
});
```

### Integration Tests

- Test bg-shell with various command patterns
- Test aws-auth command validation
- Test mcp-client with various header injection attempts
- Test voice extension memory usage over time

### Manual Testing

1. **Shell Injection Test:**
   ```bash
   lsd bg_shell send id="test" input="$(whoami)"
   # Should send literal string, not execute whoami
   ```

2. **AWS Command Test:**
   ```bash
   # Should fail gracefully
   lsd # with awsAuthRefresh="aws sso login; rm -rf /"
   ```

3. **Memory Leak Test:**
   ```bash
   # Monitor memory usage while running voice extension
   watch -n 1 'ps aux | grep lsd'
   ```

---

## ROLLOUT TIMELINE

| Phase | Duration | Issues | Deployed |
|-------|----------|--------|----------|
| Phase 1: Critical | 1 week | 3 | Week 1 |
| Phase 2: High | 1 week | 8 | Week 2 |
| Phase 3: Medium | 2 weeks | 15 | Week 4 |
| Phase 4: Low | 1 week | 12 | Week 5 |

**Total Timeline:** 5 weeks

---

## SUCCESS CRITERIA

- [ ] All shell injection vectors patched and tested
- [ ] Memory leaks fixed and monitored (no growth after 1 hour)
- [ ] Event listeners properly cleaned up on extension deactivate
- [ ] .gsd → .lsd migration complete with backward compatibility
- [ ] Unit tests added for security-critical paths (>80% coverage)
- [ ] Code review completed by security team
- [ ] All remediation items closed in issue tracker

---

## References

- [OWASP Top 10 - Injection](https://owasp.org/www-project-top-ten/)
- [CWE-78 Improper Neutralization of Special Elements](https://cwe.mitre.org/data/definitions/78.html)
- [Node.js Security Best Practices](https://nodejs.org/en/docs/guides/security/)
- [Playwright Security](https://playwright.dev/docs/security)

