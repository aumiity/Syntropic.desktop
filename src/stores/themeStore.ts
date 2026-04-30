import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { getAccentVars, ACCENT_VAR_NAMES } from '@/lib/accent-presets'
import { TAILWIND_FAMILIES, SHADE_L } from '@/lib/tailwind-palette'

export type ThemeMode = 'light' | 'dark' | 'auto'

interface AppearanceStore {
  mode: ThemeMode
  accentKey: string
  customAccentHsl: string
  customColorKey: string
  highlightKey: string

  setMode: (mode: ThemeMode) => void
  setAccent: (key: string) => void
  setCustomAccentHsl: (hsl: string) => void
  setCustomColor: (familyKey: string, shade: number) => void
  setHighlight: (key: string) => void
  resetAccent: () => void
  applyTheme: () => void

  // legacy compat used by other components
  theme: 'light' | 'dark'
  setTheme: (t: 'light' | 'dark') => void
  toggleTheme: () => void
}

function resolveIsDark(mode: ThemeMode): boolean {
  if (mode === 'auto') return window.matchMedia('(prefers-color-scheme: dark)').matches
  return mode === 'dark'
}

let _mediaListener: (() => void) | null = null

function attachAutoListener(store: () => AppearanceStore) {
  if (_mediaListener) return
  const mq = window.matchMedia('(prefers-color-scheme: dark)')
  _mediaListener = () => store().applyTheme()
  mq.addEventListener('change', _mediaListener)
}

function detachAutoListener() {
  if (!_mediaListener) return
  window.matchMedia('(prefers-color-scheme: dark)').removeEventListener('change', _mediaListener)
  _mediaListener = null
}

export const useThemeStore = create<AppearanceStore>()(
  persist(
    (set, get) => ({
      mode: 'dark',
      accentKey: 'blue',
      customAccentHsl: '208 97 49',
      customColorKey: '',
      highlightKey: 'auto',
      theme: 'dark',

      applyTheme() {
        const { mode, accentKey, customAccentHsl, highlightKey } = get()
        const isDark = resolveIsDark(mode)

        document.documentElement.classList.toggle('dark', isDark)

        const vars = getAccentVars(accentKey, customAccentHsl, isDark)
        const root = document.documentElement
        for (const [k, v] of Object.entries(vars)) {
          root.style.setProperty(k, v)
        }

        const primary = vars['--primary']
        const highlightMap: Record<string, string> = {
          blue:   'hsl(208 97% 70% / 0.5)',
          purple: 'hsl(265 85% 75% / 0.5)',
          pink:   'hsl(330 85% 75% / 0.5)',
          green:  'hsl(142 71% 60% / 0.5)',
          orange: 'hsl(25 90% 65% / 0.5)',
        }
        const selBg = highlightKey === 'auto'
          ? `hsl(${primary} / 0.4)`
          : (highlightMap[highlightKey] ?? `hsl(${primary} / 0.4)`)
        root.style.setProperty('--selection-bg', selBg)

        set({ theme: isDark ? 'dark' : 'light' })
      },

      setMode(mode) {
        if (mode === 'auto') {
          attachAutoListener(get)
        } else {
          detachAutoListener()
        }
        set({ mode })
        get().applyTheme()
      },

      setAccent(key) {
        set({ accentKey: key })
        get().applyTheme()
      },

      setCustomAccentHsl(hsl) {
        set({ customAccentHsl: hsl })
        if (get().accentKey === 'custom') get().applyTheme()
      },

      setCustomColor(familyKey, shade) {
        const family = TAILWIND_FAMILIES.find(f => f.key === familyKey)
        if (!family) return
        const l = SHADE_L[shade] ?? 53
        set({ accentKey: 'custom', customAccentHsl: `${family.h} ${family.s} ${l}`, customColorKey: `${familyKey}:${shade}` })
        get().applyTheme()
      },

      setHighlight(key) {
        set({ highlightKey: key })
        get().applyTheme()
      },

      resetAccent() {
        const root = document.documentElement
        for (const name of ACCENT_VAR_NAMES) {
          root.style.removeProperty(name)
        }
        set({ accentKey: 'blue', customAccentHsl: '208 97 49', highlightKey: 'auto' })
        // reapply only dark/light class — CSS file takes over for colors
        const isDark = resolveIsDark(get().mode)
        root.classList.toggle('dark', isDark)
      },

      setTheme(t) { get().setMode(t) },
      toggleTheme() {
        get().setMode(get().theme === 'dark' ? 'light' : 'dark')
      },
    }),
    {
      name: 'appearance-store',
      onRehydrateStorage: () => (state) => {
        if (state?.mode === 'auto') attachAutoListener(() => useThemeStore.getState())
      },
    }
  )
)
