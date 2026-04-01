/**
 * Shared LSD block-letter ASCII logo.
 *
 * Single source of truth — imported by:
 *   - scripts/postinstall.js (via dist/logo.js)
 *   - src/loader.ts (via ./logo.js)
 */

/** Raw logo segments — no ANSI codes, no leading newline. */
export const GSD_LOGO_SEGMENTS: readonly (readonly [string, string, string])[] = [
  ['  ██╗     ', '███████╗', '██████╗ '],
  ['  ██║     ', '██╔════╝', '██╔══██╗'],
  ['  ██║     ', '███████╗', '██║  ██║'],
  ['  ██║     ', '╚════██║', '██║  ██║'],
  ['  ███████╗', '███████║', '██████╔╝'],
  ['  ╚══════╝', '╚══════╝', '╚═════╝ '],
]

/** Raw logo lines — no ANSI codes, no leading newline. */
export const GSD_LOGO: readonly string[] = GSD_LOGO_SEGMENTS.map(parts => parts.join(''))

export interface LogoColorizers {
  l: (s: string) => string
  s: (s: string) => string
  d: (s: string) => string
}

/** Render the logo with distinct colors for L, S, and D. */
export function renderBrandedLogo(colors: LogoColorizers): string {
  return [
    '',
    ...GSD_LOGO_SEGMENTS.map(([l, s, d]) => colors.l(l) + colors.s(s) + colors.d(d)),
    '',
  ].join('\n')
}

/**
 * Render the logo block with a color function applied to each line.
 *
 * @param color — e.g. `(s) => `\x1b[36m${s}\x1b[0m`` or picocolors.cyan
 * @returns Ready-to-write string with leading/trailing newlines.
 */
export function renderLogo(color: (s: string) => string): string {
  return '\n' + GSD_LOGO.map(color).join('\n') + '\n'
}
