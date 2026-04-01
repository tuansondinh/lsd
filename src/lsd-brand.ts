import chalk from 'chalk'

export const LSD_YELLOW = '#facc15'
export const LSD_BLUE = '#3b82f6'
export const LSD_PINK = '#ec4899'
export const LSD_TEXT = '#f9fafb'

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const normalized = hex.replace('#', '')
  return {
    r: parseInt(normalized.slice(0, 2), 16),
    g: parseInt(normalized.slice(2, 4), 16),
    b: parseInt(normalized.slice(4, 6), 16),
  }
}

export function ansiHex(hex: string): (s: string) => string {
  const { r, g, b } = hexToRgb(hex)
  return (s: string): string => `\x1b[38;2;${r};${g};${b}m${s}\x1b[0m`
}

export const brandAnsi = {
  l: ansiHex(LSD_YELLOW),
  s: ansiHex(LSD_BLUE),
  d: ansiHex(LSD_PINK),
  text: ansiHex(LSD_TEXT),
}

export function brandNameAnsi(): string {
  return (
    brandAnsi.l('L') +
    brandAnsi.text('ucent ') +
    brandAnsi.s('S') +
    brandAnsi.text('oftware ') +
    brandAnsi.d('D') +
    brandAnsi.text('eveloper')
  )
}

export function brandedLsdAnsi(): string {
  return brandAnsi.l('L') + brandAnsi.s('S') + brandAnsi.d('D')
}

export function brandNameChalk(): string {
  return (
    chalk.hex(LSD_YELLOW).bold('L') +
    chalk.hex(LSD_TEXT).bold('ucent ') +
    chalk.hex(LSD_BLUE).bold('S') +
    chalk.hex(LSD_TEXT).bold('oftware ') +
    chalk.hex(LSD_PINK).bold('D') +
    chalk.hex(LSD_TEXT).bold('eveloper')
  )
}
