import React, { useState, useEffect } from 'react'
import { cn } from '@/lib/utils'
import { PageHeader } from '@/components/layout/PageHeader'
import { useToast } from '@/components/ui/toast'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import tailwindColors from 'tailwindcss/colors'

// ─── Types ────────────────────────────────────────────────────────

type ColorTokenRow = {
  token: string
  light: string
  dark: string
}

type SelectedPaletteColor = {
  family: string
  shade: string
  hex: string
  hsl: string
}

const CSS_PALETTE_FAMILIES = [
  'slate', 'gray', 'zinc', 'neutral', 'stone',
  'red', 'orange', 'amber', 'yellow', 'lime',
  'green', 'emerald', 'teal', 'cyan', 'sky',
  'blue', 'indigo', 'violet', 'purple', 'fuchsia',
  'pink', 'rose',
] as const

const CSS_PALETTE_SHADES = ['50', '100', '200', '300', '400', '500', '600', '700', '800', '900', '950'] as const

// Font option values are stored quoted so they substitute directly into
// font-family lists (e.g. `var(--font-latin), var(--font-thai), sans-serif`).
const LATIN_FONTS: Array<{ value: string; label: string }> = [
  { value: "'Inter'", label: 'Inter' },
  { value: "'Google Sans'", label: 'Google Sans' },
  { value: "'SF Thonburi'", label: 'SF Thonburi' },
  { value: "'IBM Plex Sans Thai'", label: 'IBM Plex Sans Thai' },
  { value: "'Noto Sans Thai'", label: 'Noto Sans Thai' },
  { value: "'Bai Jamjuree'", label: 'Bai Jamjuree' },
  { value: "'Anuphan'", label: 'Anuphan' },
]

const THAI_FONTS: Array<{ value: string; label: string }> = [
  { value: "'Sarabun'", label: 'Sarabun' },
  { value: "'IBM Plex Sans Thai'", label: 'IBM Plex Sans Thai' },
  { value: "'IBM Plex Sans Thai Looped'", label: 'IBM Plex Sans Thai Looped' },
  { value: "'Noto Sans Thai'", label: 'Noto Sans Thai' },
  { value: "'Noto Sans Thai Looped'", label: 'Noto Sans Thai Looped' },
  { value: "'SF Thonburi'", label: 'SF Thonburi' },
  { value: "'Bai Jamjuree'", label: 'Bai Jamjuree' },
  { value: "'Anuphan'", label: 'Anuphan' },
]

const LATIN_SAMPLE = 'The quick brown fox · 0123456789'
const THAI_SAMPLE = 'ขมิ้นชัน 300 มก. · กขฃคฅฆง'

// ─── Helpers ──────────────────────────────────────────────────────

function toCssColor(value: string) {
  const v = value.trim()
  if (!v) return null
  if (/^\d+(\.\d+)?\s+\d+(\.\d+)?%\s+\d+(\.\d+)?%$/i.test(v)) return `hsl(${v})`
  if (/^(#|rgb\(|rgba\(|hsl\(|hsla\(|oklch\(|oklab\(|lch\(|lab\(|color-mix\(|var\()/i.test(v)) return v
  return null
}

function hexToHslTriplet(hex: string) {
  const clean = hex.replace('#', '')
  const normalized = clean.length === 3
    ? clean.split('').map(c => c + c).join('')
    : clean
  if (!/^[0-9a-f]{6}$/i.test(normalized)) return null

  const r = parseInt(normalized.slice(0, 2), 16) / 255
  const g = parseInt(normalized.slice(2, 4), 16) / 255
  const b = parseInt(normalized.slice(4, 6), 16) / 255

  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  let h = 0
  let s = 0
  const l = (max + min) / 2

  if (max !== min) {
    const d = max - min
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
    switch (max) {
      case r: h = (g - b) / d + (g < b ? 6 : 0); break
      case g: h = (b - r) / d + 2; break
      case b: h = (r - g) / d + 4; break
    }
    h /= 6
  }

  return `${Math.round(h * 360)} ${Math.round(s * 100)}% ${Math.round(l * 100)}%`
}

function FontCard({
  label, sample, fontFamily, isActive, onClick,
}: {
  label: string
  sample: string
  fontFamily: string
  isActive: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'w-full rounded-lg border p-3 text-left transition-all',
        isActive
          ? 'border-primary ring-2 ring-primary/30 bg-primary/5'
          : 'border-border hover:border-foreground/40 bg-card',
      )}
    >
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-[11px] text-muted-foreground">{label}</span>
        {isActive && <span className="text-[10px] font-semibold text-primary">● ใช้งาน</span>}
      </div>
      <div className="text-base text-foreground" style={{ fontFamily }}>{sample}</div>
    </button>
  )
}

function Section({
  title, path, children, full = false,
}: {
  title: string
  path: string
  children: React.ReactNode
  full?: boolean
}) {
  return (
    <div className={cn(
      'rounded-xl border border-border bg-card overflow-hidden',
      full && 'col-span-full',
    )}>
      <div className="flex items-center justify-between border-b border-border bg-muted/40 px-5 py-3 gap-4">
        <span className="font-semibold text-sm text-foreground">{title}</span>
        <code className="text-[11px] text-muted-foreground bg-muted border border-border/60 px-2 py-0.5 rounded-md shrink-0">
          {path}
        </code>
      </div>
      <div className="p-5 space-y-5">{children}</div>
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────

export default function CSSPage() {
  const { toast } = useToast()

  const [colorRows, setColorRows] = useState<ColorTokenRow[]>([])
  const [isSavingColors, setIsSavingColors] = useState(false)
  const [fontSize, setFontSize] = useState('18px')
  const [isSavingFontSize, setIsSavingFontSize] = useState(false)
  const [selectedPaletteColor, setSelectedPaletteColor] = useState<SelectedPaletteColor | null>(null)
  const [latinFont, setLatinFont] = useState<string>("'Inter'")
  const [thaiFont, setThaiFont] = useState<string>("'Sarabun'")

  useEffect(() => {
    ;(async () => {
      try {
        const [res, currentFontSize, fonts] = await Promise.all([
          window.api.settings.getThemeColors(),
          window.api.settings.getThemeFontSize(),
          window.api.settings.getThemeFonts(),
        ])
        if (fonts?.latin) setLatinFont(fonts.latin)
        if (fonts?.thai) setThaiFont(fonts.thai)
        const rootEntries = Object.entries(res?.root ?? {}) as Array<[string, string]>
        const darkEntries = Object.entries(res?.dark ?? {}) as Array<[string, string]>

        const seen = new Set<string>()
        const orderedTokens: string[] = []
        for (const [token] of rootEntries) { seen.add(token); orderedTokens.push(token) }
        for (const [token] of darkEntries) { if (!seen.has(token)) orderedTokens.push(token) }

        setColorRows(
          orderedTokens.map(token => ({
            token,
            light: res?.root?.[token] ?? res?.dark?.[token] ?? '',
            dark: res?.dark?.[token] ?? res?.root?.[token] ?? '',
          })),
        )
        if (typeof currentFontSize === 'string' && currentFontSize.trim()) {
          setFontSize(currentFontSize.trim())
        }
      } catch {
        toast('โหลดค่าสีจาก index.css ไม่สำเร็จ', 'error')
      }
    })()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const updateColorValue = (token: string, mode: 'light' | 'dark', value: string) => {
    setColorRows(prev => prev.map(row => (
      row.token === token ? { ...row, [mode]: value } : row
    )))
  }

  const saveColorTokens = async () => {
    try {
      setIsSavingColors(true)
      await window.api.settings.saveThemeColors(
        colorRows.map(({ token, light, dark }) => ({ token, light: light.trim(), dark: dark.trim() })),
      )
      toast('บันทึกสีลง src/index.css แล้ว', 'success')
    } catch {
      toast('บันทึกสีไม่สำเร็จ', 'error')
    } finally {
      setIsSavingColors(false)
    }
  }

  // Apply a font choice instantly via CSS variables and persist to index.css.
  // Both vars are sent on every save so the file always contains the full pair.
  const applyFont = async (kind: 'latin' | 'thai', value: string) => {
    const cssVar = kind === 'latin' ? '--font-latin' : '--font-thai'
    document.documentElement.style.setProperty(cssVar, value)
    const nextLatin = kind === 'latin' ? value : latinFont
    const nextThai = kind === 'thai' ? value : thaiFont
    if (kind === 'latin') setLatinFont(value)
    else setThaiFont(value)
    try {
      await window.api.settings.saveThemeFonts({ latin: nextLatin, thai: nextThai })
    } catch {
      toast('บันทึกฟอนต์ไม่สำเร็จ', 'error')
    }
  }

  const saveFontSize = async () => {
    try {
      const value = fontSize.trim()
      if (!/^\d+(\.\d+)?px$/i.test(value)) {
        toast('กรุณาใส่ขนาดฟอนต์เป็น px เช่น 18px', 'error')
        return
      }
      setIsSavingFontSize(true)
      await window.api.settings.saveThemeFontSize(value)
      toast('บันทึกขนาดฟอนต์ลง src/index.css แล้ว', 'success')
    } catch {
      toast('บันทึกขนาดฟอนต์ไม่สำเร็จ', 'error')
    } finally {
      setIsSavingFontSize(false)
    }
  }

  return (
    <div className="flex flex-col h-full px-8 pt-4 pb-4 gap-2">
      <PageHeader title="CSS" />

      <div className="flex-1 overflow-y-auto">
        <div className="grid grid-cols-2 gap-4">
          {/* ── FONTS ── */}
          <Section title="Fonts" path="--font-latin / --font-thai" full>
            <p className="text-xs text-foreground">
              เลือกฟอนต์ Latin และ Thai แยกกัน คลิกเพื่อเปลี่ยนทันที (auto-save ลง <code>src/index.css</code>)
            </p>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">Latin / ตัวเลข</p>
                {LATIN_FONTS.map(font => (
                  <FontCard
                    key={`latin-${font.value}`}
                    label={font.label}
                    sample={LATIN_SAMPLE}
                    fontFamily={`${font.value}, sans-serif`}
                    isActive={latinFont === font.value}
                    onClick={() => applyFont('latin', font.value)}
                  />
                ))}
              </div>
              <div className="space-y-2">
                <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">Thai / ภาษาไทย</p>
                {THAI_FONTS.map(font => (
                  <FontCard
                    key={`thai-${font.value}`}
                    label={font.label}
                    sample={THAI_SAMPLE}
                    fontFamily={`${font.value}, sans-serif`}
                    isActive={thaiFont === font.value}
                    onClick={() => applyFont('thai', font.value)}
                  />
                ))}
              </div>
            </div>
          </Section>

          {/* ── COLOR TOKENS ── */}
          <Section title="Color Tokens (from index.css)" path="src/index.css" full>
            <div className="flex items-center justify-between gap-3">
              <p className="text-xs text-foreground">
                แก้ค่า HSL ได้จากหน้านี้ แล้วกดบันทึกเพื่อเขียนลงไฟล์ <code>src/index.css</code>
              </p>
              <div className="flex items-center gap-2">
                <Input
                  className="h-8 w-24 text-xs"
                  value={fontSize}
                  onChange={e => setFontSize(e.target.value)}
                  placeholder="18px"
                />
                <Button size="sm" variant="outline" onClick={saveFontSize} disabled={isSavingFontSize}>
                  {isSavingFontSize ? 'กำลังบันทึก...' : 'บันทึกขนาดฟอนต์'}
                </Button>
                <Button size="sm" onClick={saveColorTokens} disabled={isSavingColors}>
                  {isSavingColors ? 'กำลังบันทึก...' : 'บันทึกสีลงไฟล์'}
                </Button>
              </div>
            </div>
            <div className="rounded-lg border border-border overflow-hidden">
              <div className="grid grid-cols-[190px_1fr_1fr] bg-muted/40 border-b border-border">
                <div className="px-3 py-2 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">Token</div>
                <div className="px-3 py-2 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">Light (:root)</div>
                <div className="px-3 py-2 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">Dark (.dark)</div>
              </div>
              {colorRows.map(({ token, light, dark }) => {
                const lightPreview = toCssColor(light)
                const darkPreview = toCssColor(dark)
                return (
                  <div key={token} className="grid grid-cols-[190px_1fr_1fr] border-b border-border last:border-b-0 bg-card">
                    <div className="px-3 py-2 flex items-center">
                      <p className="text-[11px] text-foreground">{token}</p>
                    </div>
                    <div className="px-3 py-2">
                      <div
                        className="h-7 rounded-md px-2 flex items-center justify-between"
                        style={{
                          backgroundColor: lightPreview ?? 'hsl(var(--muted))',
                          border: lightPreview ? undefined : '1px dashed hsl(var(--border))',
                        }}
                      >
                        <span className="text-[10px] font-semibold text-foreground">Aa</span>
                        <Input
                          className="h-6 w-40 border-border/70 bg-background/85 text-[10px] text-foreground placeholder:text-muted-foreground"
                          value={light}
                          onChange={e => updateColorValue(token, 'light', e.target.value)}
                        />
                      </div>
                    </div>
                    <div className="px-3 py-2">
                      <div
                        className="h-7 rounded-md px-2 flex items-center justify-between"
                        style={{
                          backgroundColor: darkPreview ?? 'hsl(var(--muted))',
                          border: darkPreview ? undefined : '1px dashed hsl(var(--border))',
                        }}
                      >
                        <span className="text-[10px] leading-none text-foreground">Aa</span>
                        <Input
                          className="h-6 w-40 border-border/70 bg-background/85 text-[10px] text-foreground placeholder:text-muted-foreground"
                          value={dark}
                          onChange={e => updateColorValue(token, 'dark', e.target.value)}
                        />
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>

            <div className="rounded-lg border border-border bg-card p-4">
              <div className="mb-3">
                <p className="text-sm font-semibold text-foreground">Tailwind Full Palette (HSL)</p>
                <p className="text-xs text-muted-foreground">คลิกที่สีเพื่อดูโค้ดสีด้านล่าง</p>
              </div>
              <div className="mt-3 rounded-md border border-border bg-muted/20 p-3">
                {selectedPaletteColor ? (
                  <div className="flex items-center justify-center gap-3 text-xs">
                    <div
                      className="size-8 rounded border border-border shrink-0"
                      style={{ backgroundColor: selectedPaletteColor.hex }}
                    />
                    <p className="font-semibold text-xs text-foreground">{selectedPaletteColor.family}-{selectedPaletteColor.shade}</p>
                    <p className="text-xs text-muted-foreground">{selectedPaletteColor.hex}</p>
                    <p className="text-xs text-muted-foreground">{selectedPaletteColor.hsl}</p>
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground">ยังไม่ได้เลือกสี</p>
                )}
              </div>
              <div className="space-y-2 mt-3">
                <div className="flex items-stretch gap-2 px-2 text-[10px] font-semibold text-muted-foreground uppercase tracking-widest">
                  <span className="text-xs w-16 shrink-0">Family</span>
                  <div className="grid grid-cols-11 gap-1 flex-1 min-w-0">
                    {CSS_PALETTE_SHADES.map(shade => (
                      <span key={`shade-head-${shade}`} className="text-center text-xs">{shade}</span>
                    ))}
                  </div>
                </div>
                <div className="rounded-md border border-border overflow-hidden bg-background divide-y divide-border">
                  {CSS_PALETTE_FAMILIES.map(family => (
                    <div key={family} className="flex items-center gap-2 px-2 py-0.5">
                      <span className="w-16 shrink-0 text-xs font-semibold text-foreground">{family}</span>
                      <div className="grid grid-cols-11 flex-1 min-w-0 gap-0.5">
                        {CSS_PALETTE_SHADES.map(shade => {
                          const hex = (tailwindColors as any)?.[family]?.[shade] as string | undefined
                          if (!hex) {
                            return (
                              <div
                                key={`${family}-${shade}-empty`}
                                className="h-8 w-full rounded border border-transparent"
                                aria-hidden="true"
                              />
                            )
                          }
                          const hslValue = hexToHslTriplet(hex) ?? '-'
                          const isActive =
                            selectedPaletteColor?.family === family &&
                            selectedPaletteColor?.shade === shade
                          return (
                            <button
                              key={`${family}-${shade}`}
                              type="button"
                              onClick={() => setSelectedPaletteColor({ family, shade, hex, hsl: hslValue })}
                              className={cn(
                                'h-8 w-full rounded border transition-all',
                                isActive ? 'border-foreground ring-2 ring-ring/40' : 'border-border hover:border-foreground/40'
                              )}
                              style={{ backgroundColor: hex }}
                              title={`${family}-${shade} | ${hslValue} | ${hex}`}
                            />
                          )
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </Section>
        </div>
      </div>
    </div>
  )
}
