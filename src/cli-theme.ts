/**
 * CLI theme — single source of truth for accent colors used across all CLI
 * output (welcome screen, sessions list, worktree CLI, update prompt, onboarding).
 *
 * Colors are read lazily from active theme via getResolvedThemeColors() so
 * that custom user themes and accent presets propagate to CLI output automatically.
 * Falls back to built-in dark-theme defaults if the theme cannot be loaded.
 */

import { getResolvedThemeColors } from '@gsd/pi-coding-agent'

// ── Theme color resolver ──────────────────────────────────────────────────────
// Not cached — getResolvedThemeColors() reads the globalThis theme instance which
// is updated whenever initTheme() or setTheme() is called (e.g. by cli.ts before
// the welcome screen, or by InteractiveMode when the user changes the accent).

function colors(): Record<string, string> {
  try {
    const resolved = getResolvedThemeColors()
    return resolved ?? { accent: '#4a8cf7', borderAccent: '#4a8cf7', borderMuted: '#1e3a8a' }
  } catch {
    // Theme not yet initialised (first run) — use built-in dark defaults
    return { accent: '#4a8cf7', borderAccent: '#4a8cf7', borderMuted: '#1e3a8a' }
  }
}

// ── Hex accessor (for chalk.hex()) ───────────────────────────────────────────

/** Returns the accent hex color from the active theme (e.g. `'#4a8cf7'`). */
export function accentHex(): string {
  return colors().accent ?? '#4a8cf7'
}

// ── ANSI helpers (for non-chalk contexts: picocolors, renderLogo) ────────────

/** Wrap text in the theme's accent color using raw ANSI 24-bit escapes. */
export const accentAnsi = (s: string): string => {
  const hex = accentHex().replace('#', '')
  const r = parseInt(hex.slice(0, 2), 16)
  const g = parseInt(hex.slice(2, 4), 16)
  const b = parseInt(hex.slice(4, 6), 16)
  return `\x1b[38;2;${r};${g};${b}m${s}\x1b[0m`
}
