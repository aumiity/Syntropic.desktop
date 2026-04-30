export interface TailwindFamily {
  key: string
  label: string
  h: number
  s: number
}

// H and S values used for accent generation when this family is selected.
// Display colors are computed as hsl(h s% SHADE_L[shade]%).
export const TAILWIND_FAMILIES: TailwindFamily[] = [
  { key: 'slate',   label: 'Slate',   h: 215, s: 16 },
  { key: 'gray',    label: 'Gray',    h: 220, s: 9  },
  { key: 'zinc',    label: 'Zinc',    h: 240, s: 4  },
  { key: 'neutral', label: 'Neutral', h: 0,   s: 0  },
  { key: 'stone',   label: 'Stone',   h: 25,  s: 6  },
  { key: 'red',     label: 'Red',     h: 0,   s: 84 },
  { key: 'orange',  label: 'Orange',  h: 25,  s: 90 },
  { key: 'amber',   label: 'Amber',   h: 38,  s: 92 },
  { key: 'yellow',  label: 'Yellow',  h: 48,  s: 96 },
  { key: 'lime',    label: 'Lime',    h: 82,  s: 61 },
  { key: 'green',   label: 'Green',   h: 142, s: 71 },
  { key: 'emerald', label: 'Emerald', h: 152, s: 76 },
  { key: 'teal',    label: 'Teal',    h: 168, s: 76 },
  { key: 'cyan',    label: 'Cyan',    h: 186, s: 94 },
  { key: 'sky',     label: 'Sky',     h: 199, s: 89 },
  { key: 'blue',    label: 'Blue',    h: 217, s: 91 },
  { key: 'indigo',  label: 'Indigo',  h: 239, s: 84 },
  { key: 'violet',  label: 'Violet',  h: 258, s: 90 },
  { key: 'purple',  label: 'Purple',  h: 272, s: 51 },
  { key: 'fuchsia', label: 'Fuchsia', h: 292, s: 84 },
  { key: 'pink',    label: 'Pink',    h: 330, s: 81 },
  { key: 'rose',    label: 'Rose',    h: 350, s: 89 },
]

export const SHADES = [100, 200, 300, 400, 500, 600, 700, 800, 900] as const
export type Shade = typeof SHADES[number]

// Approximate lightness per shade — used only for display color in the picker
export const SHADE_L: Record<number, number> = {
  100: 94,
  200: 87,
  300: 79,
  400: 67,
  500: 53,
  600: 43,
  700: 35,
  800: 27,
  900: 20,
}

export function swatchColor(family: TailwindFamily, shade: number): string {
  return `hsl(${family.h} ${family.s}% ${SHADE_L[shade]}%)`
}

export function shadeLightness(shade: number): number {
  return SHADE_L[shade] ?? 53
}
