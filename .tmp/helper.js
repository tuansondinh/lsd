
const { spawn } = require('node:child_process');
const { appendFileSync, writeFileSync, readFileSync, readdirSync, statSync, existsSync } = require('node:fs');
const { join, delimiter } = require('node:path');

const [cliPath, cwd, tmpPromptPath, auditPath, logPath, memoryDir, instruction, model, userMessageCount, transcriptLength] = process.argv.slice(1);
const startedAt = new Date().toISOString();
let finalized = false;
let completionState = null;
let completionTimer = null;
let hardTimeout = null;
let pendingLogText = '';
const ANSI_PATTERN = /\u001B\[[0-?]*[ -/]*[@-~]/g;
const CACHE_TIMER_RE = /^\[phase\]\s+cache-timer\s*$/;
const SESSION_ENDED_RE = /^\[agent\]\s+Session ended/;
const HEADLESS_STATUS_RE = /^\[headless\]\s+Status:\s+(\w+)\s*$/i;

function stripAnsi(text) {
  return String(text).replace(ANSI_PATTERN, '');
}

function classifyLogLine(rawLine) {
  const stripped = stripAnsi(rawLine).trim();
  if (!stripped) {
    return { stripped, keep: false, completion: null, completionReason: null };
  }
  if (CACHE_TIMER_RE.test(stripped)) {
    return { stripped, keep: false, completion: null, completionReason: null };
  }
  if (SESSION_ENDED_RE.test(stripped)) {
    return { stripped, keep: true, completion: 'finished', completionReason: 'session_end_detected' };
  }
  const headlessStatusMatch = stripped.match(HEADLESS_STATUS_RE);
  if (headlessStatusMatch) {
    const status = String(headlessStatusMatch[1] || '').toLowerCase();
    if (status === 'complete') {
      return { stripped, keep: true, completion: 'finished', completionReason: 'headless_status_complete' };
    }
    return { stripped, keep: true, completion: 'failed', completionReason: 'headless_status_' + status };
  }
  return { stripped, keep: true, completion: null, completionReason: null };
}

function scheduleCompletion(completion, completionReason) {
  if (!completion || completionState || completionTimer) return;
  completionState = { completion, completionReason };
  completionTimer = setTimeout(() => {
    finalize(completion, completion === 'finished' ? 0 : 1, null, completionReason);
    try { child.kill('SIGTERM'); } catch {}
    setTimeout(() => { try { child.kill('SIGKILL'); } catch {} }, 2000).unref();
  }, 1500);
  completionTimer.unref();
}

function flushLogText(text, force = false) {
  pendingLogText += text;
  const parts = pendingLogText.split(/\r?\n/);
  pendingLogText = force ? '' : (parts.pop() ?? '');

  const kept = [];
  for (const rawLine of parts) {
    const classified = classifyLogLine(rawLine);
    if (classified.keep) kept.push(rawLine);
    if (classified.completion) {
      scheduleCompletion(classified.completion, classified.completionReason);
    }
  }

  if (kept.length > 0) appendFileSync(logPath, kept.join('\n') + '\n');
}

function appendLog(chunk) {
  try {
    const text = Buffer.isBuffer(chunk) ? chunk.toString('utf-8') : String(chunk);
    flushLogText(text, false);
  } catch {}
}

function writeAudit(status, extra = []) {
  try {
    writeFileSync(auditPath, [
      'timestamp: ' + new Date().toISOString(),
      'status: ' + status,
      'cwd: ' + cwd,
      'userMessages: ' + userMessageCount,
      'transcriptLength: ' + transcriptLength,
      'cliPath: ' + cliPath,
      'model: ' + (model || 'default'),
      'logPath: ' + logPath,
      ...extra,
    ].join('\n') + '\n', 'utf-8');
  } catch {}
}

function newestMemoryMtime(dir) {
  try {
    const names = readdirSync(dir).filter((name) => !name.startsWith('.'));
    let max = 0;
    for (const name of names) {
      const full = join(dir, name);
      const mtime = statSync(full).mtimeMs;
      if (mtime > max) max = mtime;
    }
    return max;
  } catch {
    return 0;
  }
}

function finalize(status, code, signal, completionReason) {
  if (finalized) return;
  finalized = true;
  if (completionTimer) clearTimeout(completionTimer);
  if (hardTimeout) clearTimeout(hardTimeout);
  const afterMtime = newestMemoryMtime(memoryDir);
  const logText = existsSync(logPath) ? readFileSync(logPath, 'utf-8') : '';
  const saved = afterMtime > beforeMtime;
  const result = saved
    ? 'saved_memory'
    : /nothing worth saving/i.test(logText)
      ? 'nothing_worth_saving'
      : 'no_memory_changes';
  writeAudit(status, [
    'exitCode: ' + String(code),
    'signal: ' + String(signal),
    'result: ' + result,
    'completionReason: ' + completionReason,
  ]);
}

const beforeMtime = newestMemoryMtime(memoryDir);
writeFileSync(logPath, '', 'utf-8');
writeAudit('running', ['startedAt: ' + startedAt]);

const childArgs = [cliPath, 'headless'];
const bundledPaths = Array.from(
  new Set(
    [process.env.GSD_BUNDLED_EXTENSION_PATHS, process.env.LSD_BUNDLED_EXTENSION_PATHS]
      .filter(Boolean)
      .flatMap((value) => String(value).split(delimiter).map((entry) => entry.trim()).filter(Boolean)),
  ),
);
for (const extensionPath of bundledPaths) childArgs.push('--extension', extensionPath);
if (model) childArgs.push('--model', model);
childArgs.push('--bare', '--context', tmpPromptPath, '--context-text', instruction);

const child = spawn(
  process.execPath,
  childArgs,
  { cwd, env: { ...process.env, LSD_MEMORY_EXTRACT: '1' }, stdio: ['ignore', 'pipe', 'pipe'] },
);

hardTimeout = setTimeout(() => {
  finalize('failed', null, 'timeout', completionState?.completionReason ?? 'timeout');
  try { child.kill('SIGTERM'); } catch {}
  setTimeout(() => { try { child.kill('SIGKILL'); } catch {} }, 2000).unref();
}, 120000);
hardTimeout.unref();

child.stdout.on('data', appendLog);
child.stderr.on('data', appendLog);
child.on('error', (err) => {
  appendLog(String(err && err.stack ? err.stack : err) + '\n');
  flushLogText('', true);
  finalize('failed', null, 'spawn_error', String(err && err.message ? err.message : err));
});
child.on('exit', (code, signal) => {
  flushLogText('', true);
  finalize(code === 0 ? 'finished' : 'failed', code, signal, 'child_exit');
});
