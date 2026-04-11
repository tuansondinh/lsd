/**
 * Walks up from a given directory to find the nearest .lsd/ or .gsd/ project
 * state directory. Shared between CLI entry points and the agent runtime.
 */

import { existsSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'

export function resolveProjectStateRoot(basePath: string): string {
  let current = resolve(basePath)
  while (true) {
    const lsdDir = join(current, '.lsd')
    if (existsSync(lsdDir)) return lsdDir
    const legacyDir = join(current, '.gsd')
    if (existsSync(legacyDir)) return legacyDir
    const parent = dirname(current)
    if (parent === current) return join(resolve(basePath), '.lsd')
    current = parent
  }
}
