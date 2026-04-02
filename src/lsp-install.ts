/**
 * LSP server install utility.
 *
 * Provides detection and installation helpers for language servers.
 * Used by the onboarding wizard to surface missing servers and
 * guide users through installing them.
 */

import { spawn } from 'node:child_process'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { hasRootMarkers, resolveCommand } from '@gsd/pi-coding-agent'

// Load defaults.json via a path relative to this file's compiled output location.
// We use createRequire + a resolved path to avoid touching the package exports map.
const __dirname = dirname(fileURLToPath(import.meta.url))
const _require = createRequire(import.meta.url)
const DEFAULTS = _require(
  resolve(__dirname, '../packages/pi-coding-agent/dist/core/lsp/defaults.json')
) as Record<
  string,
  {
    command?: string
    fileTypes?: string[]
    rootMarkers?: string[]
    [key: string]: unknown
  }
>

// ─── Types ────────────────────────────────────────────────────────────────────

export type PackageManager = 'npm' | 'pip' | 'go' | 'rustup'

export interface LspServerEntry {
  /** The server binary name (matches defaults.json key) */
  name: string
  /** Human-readable display label */
  label: string
  /** File types / languages this server covers */
  fileTypes: string[]
  /** Full install command string */
  installCommand: string
  /** Package manager used */
  packageManager: PackageManager
}

export type LSP_INSTALL_MAP_TYPE = Record<string, LspServerEntry>

// ─── Install map ─────────────────────────────────────────────────────────────

/**
 * Mapping of server name → metadata including install command.
 * Only covers the servers we know how to install automatically.
 */
export const LSP_INSTALL_MAP: LSP_INSTALL_MAP_TYPE = {
  'typescript-language-server': {
    name: 'typescript-language-server',
    label: 'TypeScript / JavaScript',
    fileTypes: ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs'],
    installCommand: 'npm i -g typescript-language-server typescript',
    packageManager: 'npm',
  },
  'pyright-langserver': {
    name: 'pyright-langserver',
    label: 'Python (Pyright)',
    fileTypes: ['.py', '.pyw', '.pyi'],
    installCommand: 'npm i -g pyright',
    packageManager: 'npm',
  },
  'gopls': {
    name: 'gopls',
    label: 'Go',
    fileTypes: ['.go', '.mod', '.sum'],
    installCommand: 'go install golang.org/x/tools/gopls@latest',
    packageManager: 'go',
  },
  'rust-analyzer': {
    name: 'rust-analyzer',
    label: 'Rust',
    fileTypes: ['.rs'],
    installCommand: 'rustup component add rust-analyzer',
    packageManager: 'rustup',
  },
  'bash-language-server': {
    name: 'bash-language-server',
    label: 'Bash / Shell',
    fileTypes: ['.sh', '.bash'],
    installCommand: 'npm i -g bash-language-server',
    packageManager: 'npm',
  },
  'yaml-language-server': {
    name: 'yaml-language-server',
    label: 'YAML',
    fileTypes: ['.yaml', '.yml'],
    installCommand: 'npm i -g yaml-language-server',
    packageManager: 'npm',
  },
  'vscode-json-language-server': {
    name: 'vscode-json-language-server',
    label: 'JSON',
    fileTypes: ['.json', '.jsonc'],
    installCommand: 'npm i -g vscode-langservers-extracted',
    packageManager: 'npm',
  },
  'vscode-html-language-server': {
    name: 'vscode-html-language-server',
    label: 'HTML',
    fileTypes: ['.html', '.htm'],
    installCommand: 'npm i -g vscode-langservers-extracted',
    packageManager: 'npm',
  },
  'vscode-css-language-server': {
    name: 'vscode-css-language-server',
    label: 'CSS / SCSS / Sass',
    fileTypes: ['.css', '.scss', '.sass', '.less'],
    installCommand: 'npm i -g vscode-langservers-extracted',
    packageManager: 'npm',
  },
} as const satisfies LSP_INSTALL_MAP_TYPE

// ─── Detection helpers ────────────────────────────────────────────────────────

/**
 * Find all servers from defaults.json whose rootMarkers match files in `cwd`,
 * whose command is NOT resolvable (i.e. missing from PATH), and which we know
 * how to install (present in LSP_INSTALL_MAP).
 *
 * Returns server metadata objects ready for display in the onboarding wizard.
 */
export function detectMissingServers(cwd: string): LspServerEntry[] {
  const missing: LspServerEntry[] = []

  for (const [serverName, serverConfig] of Object.entries(DEFAULTS)) {
    // Only process servers we know how to install
    const installEntry = LSP_INSTALL_MAP[serverName]
    if (!installEntry) continue

    // Check rootMarkers match the cwd
    const rootMarkers = serverConfig.rootMarkers
    if (!rootMarkers || rootMarkers.length === 0) continue
    if (!hasRootMarkers(cwd, rootMarkers)) continue

    // Check if the command is already resolvable
    const command = serverConfig.command
    if (!command) continue
    const resolved = resolveCommand(command, cwd)
    if (resolved !== null) continue // already installed

    missing.push(installEntry)
  }

  return missing
}

/**
 * Inverse of detectMissingServers — returns servers that ARE installed
 * and whose rootMarkers match the cwd.
 */
export function detectInstalledServers(cwd: string): LspServerEntry[] {
  const installed: LspServerEntry[] = []

  for (const [serverName, serverConfig] of Object.entries(DEFAULTS)) {
    // Only process servers we know about
    const installEntry = LSP_INSTALL_MAP[serverName]
    if (!installEntry) continue

    // Check rootMarkers match the cwd
    const rootMarkers = serverConfig.rootMarkers
    if (!rootMarkers || rootMarkers.length === 0) continue
    if (!hasRootMarkers(cwd, rootMarkers)) continue

    // Check if the command IS resolvable
    const command = serverConfig.command
    if (!command) continue
    const resolved = resolveCommand(command, cwd)
    if (resolved === null) continue // not installed

    installed.push(installEntry)
  }

  return installed
}

// ─── Install helpers ──────────────────────────────────────────────────────────

/**
 * Returns the install command string for a server name without executing it.
 * Returns null if the server is not in LSP_INSTALL_MAP.
 */
export function getInstallCommand(name: string): string | null {
  return LSP_INSTALL_MAP[name]?.installCommand ?? null
}

/**
 * Run the install command for the given server name.
 * Resolves with { success: true } on success, or { success: false, error } on failure.
 * Times out after 60 seconds.
 */
export function installServer(name: string): Promise<{ success: boolean; error?: string }> {
  const entry = LSP_INSTALL_MAP[name]
  if (!entry) {
    return Promise.resolve({
      success: false,
      error: `No install command found for server: ${name}`,
    })
  }

  const [cmd, ...args] = entry.installCommand.split(' ')
  if (!cmd) {
    return Promise.resolve({ success: false, error: 'Empty install command' })
  }

  return new Promise((resolve) => {
    const TIMEOUT_MS = 60_000
    let timedOut = false

    const child = spawn(cmd, args, {
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: process.platform === 'win32',
    })

    const stderrChunks: Buffer[] = []
    child.stderr?.on('data', (chunk: Buffer) => stderrChunks.push(chunk))

    const timer = setTimeout(() => {
      timedOut = true
      child.kill('SIGTERM')
      resolve({ success: false, error: `Install timed out after ${TIMEOUT_MS / 1000}s` })
    }, TIMEOUT_MS)

    child.on('close', (code) => {
      clearTimeout(timer)
      if (timedOut) return
      if (code === 0) {
        resolve({ success: true })
      } else {
        const stderr = Buffer.concat(stderrChunks).toString('utf-8').trim()
        resolve({
          success: false,
          error: stderr || `Process exited with code ${code}`,
        })
      }
    })

    child.on('error', (err) => {
      clearTimeout(timer)
      if (timedOut) return
      resolve({ success: false, error: err.message })
    })
  })
}
