// Shared print helpers for any silent-HTML print path (labels, receipts, tax
// invoices). The hidden print BrowserWindow loads a `data:` URL with its own
// origin, so it can't reach the app's bundled fonts — we inline @font-face with
// base64-embedded TTF data. Without this, print silently falls back to the OS
// default and the output looks nothing like the on-screen preview.
//
// Only fonts with actual TTF files bundled in src/assets/fonts/ are listed —
// guaranteed to render on any OS.
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

interface FontFile { weight: string | number; url: string }

export const FONT_REGISTRY: Record<string, FontFile[]> = {
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

// Build a `@font-face` CSS block for the selected family with each weight's TTF
// base64-embedded so the print HTML (data: URL, separate origin) can resolve it.
export async function buildPrintFontFaceCss(family: string): Promise<string> {
  const files = FONT_REGISTRY[family]
  if (!files) return ''
  const faces = await Promise.all(files.map(async f => {
    try {
      const resp = await fetch(f.url)
      const blob = await resp.blob()
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => resolve(reader.result as string)
        reader.onerror = () => reject(reader.error)
        reader.readAsDataURL(blob)
      })
      return `@font-face { font-family: '${family}'; src: url('${dataUrl}') format('truetype'); font-weight: ${f.weight}; font-style: normal; }`
    } catch { return '' }
  }))
  return faces.filter(Boolean).join('\n')
}
