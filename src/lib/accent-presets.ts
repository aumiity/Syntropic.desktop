// All CSS vars managed by the accent system — used by resetAccent to remove overrides
export const ACCENT_VAR_NAMES = [
  '--primary', '--primary-foreground', '--primary-hover',
  '--primary-soft', '--primary-soft-hover', '--primary-soft-border', '--primary-strong',
  '--accent', '--accent-foreground', '--ring',
  '--sidebar', '--sidebar-border', '--sidebar-accent', '--sidebar-accent-foreground',
  '--sidebar-ring', '--sidebar-primary', '--sidebar-primary-foreground',
  '--selection-bg',
] as const

export interface AccentPreset {
  key: string
  label: string
  displayColor: string
  h: number
  s: number
}

export const ACCENT_PRESETS: AccentPreset[] = [
  { key: 'blue',     label: 'น้ำเงิน', displayColor: 'hsl(208 97% 49%)', h: 208, s: 97 },
  { key: 'purple',   label: 'ม่วง',    displayColor: 'hsl(265 85% 55%)', h: 265, s: 85 },
  { key: 'pink',     label: 'ชมพู',    displayColor: 'hsl(330 85% 55%)', h: 330, s: 85 },
  { key: 'red',      label: 'แดง',     displayColor: 'hsl(0 84% 55%)',   h: 0,   s: 84 },
  { key: 'orange',   label: 'ส้ม',     displayColor: 'hsl(25 90% 55%)',  h: 25,  s: 90 },
  { key: 'yellow',   label: 'เหลือง',  displayColor: 'hsl(45 90% 50%)',  h: 45,  s: 90 },
  { key: 'green',    label: 'เขียว',   displayColor: 'hsl(142 71% 40%)', h: 142, s: 71 },
  { key: 'graphite', label: 'เทา',     displayColor: 'hsl(215 15% 50%)', h: 215, s: 15 },
]

export const HIGHLIGHT_PRESETS = [
  { key: 'auto',   label: 'อัตโนมัติ', color: null },
  { key: 'blue',   label: 'น้ำเงิน',   color: 'hsl(208 97% 70% / 0.5)' },
  { key: 'purple', label: 'ม่วง',      color: 'hsl(265 85% 75% / 0.5)' },
  { key: 'pink',   label: 'ชมพู',      color: 'hsl(330 85% 75% / 0.5)' },
  { key: 'green',  label: 'เขียว',     color: 'hsl(142 71% 60% / 0.5)' },
  { key: 'orange', label: 'ส้ม',       color: 'hsl(25 90% 65% / 0.5)'  },
]

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}

function buildVars(h: number, s: number, isDark: boolean, baseL = 49): Record<string, string> {
  const l = (offset: number) => clamp(baseL + offset, 10, 95)
  if (isDark) {
    return {
      '--primary':                   `${h} ${s}% ${baseL}%`,
      '--primary-foreground':        '0 0% 100%',
      '--primary-hover':             `${h} ${s}% ${l(-7)}%`,
      '--primary-strong':            `${h} ${s}% ${l(21)}%`,
      '--primary-soft':              `${h} ${s}% ${l(-31)}%`,
      '--primary-soft-hover':        `${h} ${s}% ${l(-27)}%`,
      '--primary-soft-border':       `${h} ${s}% ${l(-19)}%`,
      '--accent':                    `${h} ${s}% ${l(-29)}%`,
      '--accent-foreground':         `${h} ${s}% ${l(46)}%`,
      '--ring':                      `${h} ${s}% ${baseL}%`,
      '--sidebar-accent':            `${h} ${s}% ${l(6)}%`,
      '--sidebar-accent-foreground': '0 0% 100%',
      '--sidebar-ring':              `${h} ${s}% ${baseL}%`,
      '--sidebar-primary':           `${h} ${s}% ${l(-14)}%`,
      '--sidebar-primary-foreground':'214 32% 91%',
    }
  }
  return {
    '--primary':                   `${h} ${s}% ${baseL}%`,
    '--primary-foreground':        '0 0% 100%',
    '--primary-hover':             `${h} ${s}% ${l(-7)}%`,
    '--primary-strong':            `${h} ${s}% ${l(-14)}%`,
    '--primary-soft':              `${h} ${s}% ${l(46)}%`,
    '--primary-soft-hover':        `${h} ${s}% ${l(41)}%`,
    '--primary-soft-border':       `${h} ${s}% ${l(31)}%`,
    '--accent':                    `${h} ${s}% ${l(46)}%`,
    '--accent-foreground':         `${h} ${s}% ${baseL}%`,
    '--ring':                      `${h} ${s}% ${baseL}%`,
    '--sidebar':                   `${h} ${s}% ${l(-14)}%`,
    '--sidebar-border':            `${h} ${s}% ${l(-21)}%`,
    '--sidebar-accent':            `${h} ${s}% ${baseL}%`,
    '--sidebar-accent-foreground': '0 0% 100%',
    '--sidebar-ring':              `${h} ${s}% ${l(-7)}%`,
    '--sidebar-primary':           `${h} ${s}% ${l(-14)}%`,
    '--sidebar-primary-foreground':`${h} ${s}% ${l(31)}%`,
  }
}

export function getAccentVars(
  accentKey: string,
  customHsl: string,
  isDark: boolean,
): Record<string, string> {
  if (accentKey === 'custom') {
    const m = customHsl.match(/(\d+)\s+(\d+)\s+(\d+)/)
    if (m) return buildVars(parseInt(m[1]), parseInt(m[2]), isDark, parseInt(m[3]))
    return buildVars(208, 97, isDark, 49)
  }
  const preset = ACCENT_PRESETS.find(p => p.key === accentKey) ?? ACCENT_PRESETS[0]
  return buildVars(preset.h, preset.s, isDark)
}
