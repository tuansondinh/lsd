import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { delimiter, join } from 'node:path'

const GSD_RTK_PATH_ENV = 'GSD_RTK_PATH'
const GSD_RTK_DISABLED_ENV = 'GSD_RTK_DISABLED'
const GSD_RTK_REWRITE_TIMEOUT_MS_ENV = 'GSD_RTK_REWRITE_TIMEOUT_MS'
const RTK_TELEMETRY_DISABLED_ENV = 'RTK_TELEMETRY_DISABLED'
const RTK_REWRITE_TIMEOUT_MS = 5_000

function isTruthy(value) {
  if (!value) return false
  const normalized = value.trim().toLowerCase()
  return normalized === '1' || normalized === 'true' || normalized === 'yes'
}

function getRewriteTimeoutMs(env = process.env) {
  const configured = Number.parseInt(env[GSD_RTK_REWRITE_TIMEOUT_MS_ENV] ?? '', 10)
  if (Number.isFinite(configured) && configured > 0) return configured
  return RTK_REWRITE_TIMEOUT_MS
}

export function isRtkEnabled(env = process.env) {
  return !isTruthy(env[GSD_RTK_DISABLED_ENV])
}

export function buildRtkEnv(env = process.env) {
  return {
    ...env,
    [RTK_TELEMETRY_DISABLED_ENV]: '1',
  }
}

function getManagedRtkDir(env = process.env) {
  return join(env.GSD_HOME || join(homedir(), '.lsd'), 'agent', 'bin')
}

function getRtkBinaryName(platform = process.platform) {
  return platform === 'win32' ? 'rtk.exe' : 'rtk'
}

function getPathValue(env) {
  const pathKey = Object.keys(env).find((key) => key.toLowerCase() === 'path')
  return pathKey ? env[pathKey] : env.PATH
}

function resolvePathCandidates(pathValue) {
  if (!pathValue) return []
  return pathValue
    .split(delimiter)
    .map((part) => part.trim())
    .filter(Boolean)
}

function resolveSystemRtkPath(pathValue, platform = process.platform) {
  const candidates = platform === 'win32'
    ? ['rtk.exe', 'rtk.cmd', 'rtk.bat', 'rtk']
    : ['rtk']

  for (const dir of resolvePathCandidates(pathValue)) {
    for (const candidate of candidates) {
      const fullPath = join(dir, candidate)
      if (existsSync(fullPath)) return fullPath
    }
  }

  return null
}

export function resolveRtkBinaryPath(options = {}) {
  const env = options.env ?? process.env
  const platform = options.platform ?? process.platform

  const explicitPath = options.binaryPath ?? env[GSD_RTK_PATH_ENV]
  if (explicitPath && existsSync(explicitPath)) return explicitPath

  const managedDir = getManagedRtkDir(env)
  const managedPath = join(managedDir, getRtkBinaryName(platform))
  if (existsSync(managedPath)) return managedPath
  if (platform === 'win32') {
    const managedCmd = join(managedDir, 'rtk.cmd')
    if (existsSync(managedCmd)) return managedCmd
  }

  return resolveSystemRtkPath(options.pathValue ?? getPathValue(env), platform)
}

export function rewriteCommandWithRtk(command, options = {}) {
  const env = options.env ?? process.env

  if (!command.trim()) return command
  if (!isRtkEnabled(env)) return command

  const binaryPath = options.binaryPath ?? resolveRtkBinaryPath({ env })
  if (!binaryPath) return command

  const run = options.spawnSyncImpl ?? spawnSync
  const result = run(binaryPath, ['rewrite', command], {
    encoding: 'utf-8',
    env: buildRtkEnv(env),
    stdio: ['ignore', 'pipe', 'ignore'],
    timeout: getRewriteTimeoutMs(env),
    shell: /\.(cmd|bat)$/i.test(binaryPath),
  })

  if (result.error) return command
  if (result.status !== 0 && result.status !== 3) return command

  const rewritten = (result.stdout ?? '').trimEnd()
  return rewritten || command
}
