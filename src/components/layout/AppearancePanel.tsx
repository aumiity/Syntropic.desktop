import React from 'react'
import { useThemeStore, type ThemeMode } from '@/stores/themeStore'
import { ACCENT_PRESETS, HIGHLIGHT_PRESETS } from '@/lib/accent-presets'
import { TAILWIND_FAMILIES, SHADES, swatchColor } from '@/lib/tailwind-palette'

interface Props {
  onClose: () => void
}

const MODE_CARDS: { mode: ThemeMode; label: string }[] = [
  { mode: 'light', label: 'สว่าง' },
  { mode: 'auto', label: 'อัตโนมัติ' },
  { mode: 'dark', label: 'มืด' },
]

export function AppearancePanel({ onClose }: Props) {
  const { mode, accentKey, highlightKey, customColorKey,
          setMode, setAccent, setHighlight, setCustomColor, resetAccent } = useThemeStore()

  return (
    <div className="flex flex-col gap-5 p-4 w-72 bg-card border border-border rounded-xl shadow-xl text-foreground text-sm">
      <div className="font-semibold text-foreground">รูปลักษณ์</div>

      {/* ── Section 1 — Mode ───────────────────────────────────────────────── */}
      <div>
        <div className="text-xs text-muted-foreground mb-2">โหมด</div>
        <div className="flex gap-2">
          {MODE_CARDS.map(({ mode: m, label }) => {
            const active = mode === m
            return (
              <button
                key={m}
                onClick={() => setMode(m)}
                className={`flex flex-col items-center gap-1.5 flex-1 rounded-xl border px-1.5 py-2 text-xs font-medium transition-all
                  ${active
                    ? 'bg-primary text-primary-foreground border-primary ring-2 ring-primary/30'
                    : 'bg-muted border-border text-muted-foreground hover:bg-surface-hover'
                  }`}
              >
                {/* Preview thumbnail */}
                <div className={`w-full h-8 rounded-lg overflow-hidden border
                  ${active ? 'border-primary-soft-border' : 'border-border'}`}>
                  {m === 'light' && (
                    <div className="w-full h-full bg-white" />
                  )}
                  {m === 'dark' && (
                    <div className="w-full h-full bg-neutral-900" />
                  )}
                  {m === 'auto' && (
                    <div className="w-full h-full flex">
                      <div className="w-1/2 h-full bg-white" />
                      <div className="w-1/2 h-full bg-neutral-900" />
                    </div>
                  )}
                </div>
                <span>{label}</span>
              </button>
            )
          })}
        </div>
      </div>

      {/* ── Section 2 — Accent color ───────────────────────────────────────── */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <div className="text-xs text-muted-foreground">สีธีม</div>
          <button
            onClick={() => resetAccent()}
            className="text-xs text-muted-foreground hover:text-foreground transition-colors underline-offset-2 hover:underline"
          >
            คืนค่าเริ่มต้น
          </button>
        </div>
        <div className="flex flex-wrap gap-2.5">
          {ACCENT_PRESETS.map(p => (
            <button
              key={p.key}
              title={p.label}
              onClick={() => setAccent(p.key)}
              style={{ background: p.displayColor }}
              className={`w-7 h-7 rounded-full transition-all
                ${accentKey === p.key
                  ? 'ring-2 ring-offset-2 ring-primary scale-110'
                  : 'hover:scale-110'
                }`}
            />
          ))}
          <button
            title="กำหนดเอง"
            onClick={() => setAccent('custom')}
            className={`w-7 h-7 rounded-full border-2 border-dashed border-border transition-all text-xs text-muted-foreground flex items-center justify-center
              ${accentKey === 'custom'
                ? 'ring-2 ring-offset-2 ring-primary scale-110'
                : 'hover:scale-110'
              }`}
          >
            +
          </button>
        </div>
        {accentKey === 'custom' && (
          <div className="mt-2 max-h-48 overflow-y-auto scrollbar-thin space-y-0.5">
            {TAILWIND_FAMILIES.map(family => (
              <div key={family.key} className="flex items-center gap-1">
                <span className="w-9 shrink-0 text-[10px] text-muted-foreground">{family.label.slice(0, 6)}</span>
                {SHADES.map(shade => {
                  const colorKey = `${family.key}:${shade}`
                  const selected = customColorKey === colorKey
                  return (
                    <button
                      key={shade}
                      onClick={() => setCustomColor(family.key, shade)}
                      style={{ background: swatchColor(family, shade) }}
                      className={`w-5 h-5 rounded-sm cursor-pointer transition-all
                        ${selected
                          ? 'ring-1 ring-offset-1 ring-primary scale-110'
                          : 'hover:scale-110'
                        }`}
                    />
                  )
                })}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Section 3 — Highlight color ────────────────────────────────────── */}
      <div>
        <div className="text-xs text-muted-foreground mb-2">สีไฮไลต์</div>
        <div className="flex gap-2.5">
          {HIGHLIGHT_PRESETS.map(p => (
            <button
              key={p.key}
              title={p.label}
              onClick={() => setHighlight(p.key)}
              style={p.color ? { background: p.color } : undefined}
              className={`w-6 h-6 rounded-full border transition-all flex items-center justify-center
                ${p.color ? 'border-border' : 'bg-muted border-border'}
                ${highlightKey === p.key
                  ? 'ring-2 ring-offset-1 ring-primary scale-110'
                  : 'hover:scale-110'
                }`}
            >
              {!p.color && (
                <span className="text-foreground-subtle text-[9px] font-bold">A</span>
              )}
            </button>
          ))}
        </div>
      </div>

      <button
        onClick={onClose}
        className="text-xs text-muted-foreground hover:text-foreground transition-colors text-right"
      >
        ปิด
      </button>
    </div>
  )
}
