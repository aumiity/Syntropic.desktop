// Shared print helpers for any silent-HTML print path (labels, receipts, tax
// invoices). The hidden print BrowserWindow loads a `data:` URL with its own
// origin, so it can't reach the app's bundled fonts — we inline @font-face with
// base64-embedded TTF data. Without this, print silently falls back to the OS
// default and the output looks nothing like the on-screen preview.
//
// Only fonts with actual TTF files bundled in src/assets/fonts/ are listed —
// guaranteed to render on any OS.
import sarabunRegular from '@/assets/fonts/Sarabun-Regular.ttf?url'
import sarabunBold from '@/assets/fonts/Sarabun-Bold.ttf?url'
import baiJamjureeRegular from '@/assets/fonts/BaiJamjuree-Regular.ttf?url'
import baiJamjureeBold from '@/assets/fonts/BaiJamjuree-Bold.ttf?url'
import anuphanRegular from '@/assets/fonts/Anuphan-Regular.ttf?url'
import sfThonburiRegular from '@/assets/fonts/SF Thonburi Regular.ttf?url'
import sfThonburiBold from '@/assets/fonts/SF Thonburi Bold.ttf?url'
import ibmPlexThaiRegular from '@/assets/fonts/IBMPlexSansThai-Regular.ttf?url'
import ibmPlexThaiBold from '@/assets/fonts/IBMPlexSansThai-Bold.ttf?url'
import ibmPlexThaiLoopedRegular from '@/assets/fonts/IBMPlexSansThaiLooped-Regular.ttf?url'
import ibmPlexThaiLoopedBold from '@/assets/fonts/IBMPlexSansThaiLooped-Bold.ttf?url'
import notoSansThaiVariable from '@/assets/fonts/NotoSansThai-Variable.ttf?url'
// Script-fallback fonts for the label printer — Burmese + Simplified Chinese.
// The bundled Thai/Latin fonts have NO Myanmar/CJK glyphs, so multilingual
// labels would print as tofu boxes. These are embedded ON DEMAND (only when the
// content actually contains those scripts — see buildFallbackFontFaceCss) so a
// Thai-only label never pays the (large) CJK payload.
import notoMyanmarRegular from '@/assets/fonts/NotoSansMyanmar-Regular.ttf?url'
import notoMyanmarBold from '@/assets/fonts/NotoSansMyanmar-Bold.ttf?url'
import notoScRegular from '@/assets/fonts/NotoSansSC-Regular.ttf?url'
import notoScBold from '@/assets/fonts/NotoSansSC-Bold.ttf?url'

interface FontFile { weight: string | number; url: string }

export const FONT_REGISTRY: Record<string, FontFile[]> = {
  // Sarabun is the house default for printed docs (matches the UI Thai font and
  // label_settings). Bundled here so the print window embeds it as base64 and
  // renders identically on Windows AND macOS (where Sarabun isn't a system font).
  'Sarabun':                  [{ weight: 400, url: sarabunRegular }, { weight: 700, url: sarabunBold }],
  'Bai Jamjuree':             [{ weight: 400, url: baiJamjureeRegular }, { weight: 700, url: baiJamjureeBold }],
  'Anuphan':                  [{ weight: '100 700', url: anuphanRegular }],
  'SF Thonburi':              [{ weight: 400, url: sfThonburiRegular }, { weight: 700, url: sfThonburiBold }],
  'IBM Plex Sans Thai':       [{ weight: 400, url: ibmPlexThaiRegular }, { weight: 700, url: ibmPlexThaiBold }],
  'IBM Plex Sans Thai Looped':[{ weight: 400, url: ibmPlexThaiLoopedRegular }, { weight: 700, url: ibmPlexThaiLoopedBold }],
  'Noto Sans Thai':           [{ weight: '100 900', url: notoSansThaiVariable }],
}

export const FONTS = Object.keys(FONT_REGISTRY)

// HTML-escape a string for safe interpolation into print HTML.
export const esc = (s: string) =>
  String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!))

// Fetch one TTF url and inline it as a single @font-face for `family`/`weight`.
async function fontFace(family: string, weight: string | number, url: string): Promise<string> {
  try {
    const resp = await fetch(url)
    const blob = await resp.blob()
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(reader.result as string)
      reader.onerror = () => reject(reader.error)
      reader.readAsDataURL(blob)
    })
    return `@font-face { font-family: '${family}'; src: url('${dataUrl}') format('truetype'); font-weight: ${weight}; font-style: normal; }`
  } catch { return '' }
}

// Cache the (deterministic) base64 @font-face block per family. The TTF→base64
// embed is the expensive part; without this a live preview that rebuilds on
// every keystroke (POS payment dialog) would re-fetch + re-encode the whole TTF
// each time. Result is constant per family, so caching is safe.
const fontFaceCache = new Map<string, string>()

// Build a `@font-face` CSS block for the selected family with each weight's TTF
// base64-embedded so the print HTML (data: URL, separate origin) can resolve it.
export async function buildPrintFontFaceCss(family: string): Promise<string> {
  const cached = fontFaceCache.get(family)
  if (cached !== undefined) return cached
  const files = FONT_REGISTRY[family]
  if (!files) { fontFaceCache.set(family, ''); return '' }
  const faces = await Promise.all(files.map(f => fontFace(family, f.weight, f.url)))
  const css = faces.filter(Boolean).join('\n')
  fontFaceCache.set(family, css)
  return css
}

// Script-fallback font registry — keyed by a detection regex. Kept OUT of
// FONT_REGISTRY because these are content-driven (auto-appended when the text
// needs them), not user-selectable print fonts.
const FALLBACK_FONTS: { family: string; test: RegExp; files: FontFile[] }[] = [
  {
    family: 'Noto Sans Myanmar',
    // Myanmar block (U+1000–109F) + Extended-A (U+AA60–AA7F) + Extended-B (U+A9E0–A9FF)
    test: /[က-႟ꩠ-ꩿꧠ-꧿]/,
    files: [{ weight: 400, url: notoMyanmarRegular }, { weight: 700, url: notoMyanmarBold }],
  },
  {
    family: 'Noto Sans SC',
    // CJK Unified (U+4E00–9FFF) + Ext-A (U+3400–4DBF) + Compatibility Ideographs (U+F900–FAFF)
    test: /[㐀-䶿一-鿿豈-﫿]/,
    files: [{ weight: 400, url: notoScRegular }, { weight: 700, url: notoScBold }],
  },
]

// Scan `text` and embed ONLY the script-fallback fonts whose glyphs actually
// appear. Returns the @font-face CSS plus the family names to append (in order)
// to the print `font-family` stack — so a Burmese/Chinese run falls through the
// Thai/Latin face to the matching Noto face instead of rendering tofu. A
// Thai-only label gets `{ css: '', families: [] }` and stays light.
export async function buildFallbackFontFaceCss(text: string): Promise<{ css: string; families: string[] }> {
  const needed = FALLBACK_FONTS.filter(fb => fb.test.test(text))
  if (needed.length === 0) return { css: '', families: [] }
  const blocks = await Promise.all(
    needed.flatMap(fb => fb.files.map(f => fontFace(fb.family, f.weight, f.url))),
  )
  return { css: blocks.filter(Boolean).join('\n'), families: needed.map(fb => fb.family) }
}
