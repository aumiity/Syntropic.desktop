// Silent-print the already-rendered A4 preview sheets (no OS dialog).
//
// WHY serialize the live DOM instead of building HTML from scratch: the on-screen
// preview is already paginated by JS measurement against the app's real fonts +
// CSS. Re-rendering it as a separate HTML string would use different metrics and
// the pre-computed page breaks / filler counts would no longer fit. Cloning the
// live `.a4-sheet` nodes + inlining the app's own stylesheets guarantees the
// print is pixel-identical to the preview.
//
// WHY not window.print() / webContents.print({silent:false}): Electron ships
// without Chromium's print-preview, so both surface "This app doesn't support
// print preview". The silent printer:printHtml path (hidden window →
// webContents.print({silent:true})) is the proven one (receipts/labels/tax
// invoices use it) and prints straight to the configured printer.
import { buildPrintFontFaceCss, getAppThaiFont } from './fonts'

// Parse a page-range string ("1-3, 5") into sorted 1-based page numbers, clamped
// to [1, max]. Empty / unparseable → 'all'. Used by the ขย. report toolbars so
// the operator can reprint a single damaged sheet.
export function parsePageSelection(input: string, max: number): number[] | 'all' {
  const s = input.trim()
  if (!s) return 'all'
  const out = new Set<number>()
  for (const part of s.split(',')) {
    const p = part.trim()
    if (!p) continue
    const range = p.match(/^(\d+)\s*-\s*(\d+)$/)
    if (range) {
      let a = +range[1], b = +range[2]
      if (a > b) [a, b] = [b, a]
      for (let i = a; i <= b; i++) if (i >= 1 && i <= max) out.add(i)
    } else if (/^\d+$/.test(p)) {
      const n = +p
      if (n >= 1 && n <= max) out.add(n)
    }
  }
  return out.size ? Array.from(out).sort((a, b) => a - b) : 'all'
}

// Read every same-origin stylesheet's text. Cross-origin sheets (e.g. a CDN
// font) throw on cssRules access — skipped. The app's own CSS (Tailwind, tokens,
// @media print) is same-origin in both dev (<style> tags) and a built app
// (bundled <link>), so the cloned sheets keep their exact look.
function collectAppCss(): string {
  return Array.from(document.styleSheets)
    .map(sheet => {
      try { return Array.from((sheet as CSSStyleSheet).cssRules).map(r => r.cssText).join('\n') }
      catch { return '' }
    })
    .join('\n')
}

export interface PrintDomResult { success: boolean; error?: string }

// Clone the chosen .a4-sheet nodes inside `docSelector`, wrap them in a
// standalone HTML doc (app CSS inlined + Thai font embedded + print overrides),
// and spool it silently to `printerName` (''=OS default). pages = 'all' or a
// 1-based list (see parsePageSelection).
export async function printDomSheets(opts: {
  docSelector: string
  pages?: number[] | 'all'
  printerName: string
  copies?: number
}): Promise<PrintDomResult> {
  const doc = document.querySelector(opts.docSelector)
  if (!doc) return { success: false, error: 'ไม่พบเนื้อหาที่จะพิมพ์' }
  const allSheets = Array.from(doc.querySelectorAll('.a4-sheet')) as HTMLElement[]
  if (allSheets.length === 0) return { success: false, error: 'ไม่มีหน้าให้พิมพ์' }

  const chosen = (!opts.pages || opts.pages === 'all')
    ? allSheets
    : opts.pages.map(n => allSheets[n - 1]).filter(Boolean)
  if (chosen.length === 0) return { success: false, error: 'ไม่มีหน้าที่เลือก (ตรวจเลขหน้าอีกครั้ง)' }

  const font = getAppThaiFont()
  const fontCss = await buildPrintFontFaceCss(font)
  const appCss = collectAppCss()
  const sheetsHtml = chosen.map(s => s.outerHTML).join('')

  // Overrides come AFTER the app CSS so they win. They neutralize the screen-only
  // `.a4-doc { position:absolute }` print rule (unreliable for multi-page) and
  // pin each sheet to an exact A4-landscape page so one sheet = one printed page.
  const html = `<!doctype html><html><head><meta charset="utf-8">
<style>${fontCss}</style>
<style>${appCss}</style>
<style>
  @page { size: A4 landscape; margin: 0; }
  html, body { margin: 0 !important; padding: 0 !important; background: #fff !important; }
  .a4-doc { position: static !important; inset: auto !important; display: block !important; gap: 0 !important; margin: 0 !important; padding: 0 !important; overflow: visible !important; }
  .a4-sheet { width: 297mm !important; height: 210mm !important; margin: 0 !important; box-shadow: none !important; border-radius: 0 !important; break-inside: avoid; break-after: page; page-break-after: always; }
  .a4-sheet:last-child { break-after: auto; page-break-after: auto; }
</style>
</head><body><div class="a4-doc">${sheetsHtml}</div></body></html>`

  return window.api.printer.printHtml({
    html,
    printerName: opts.printerName,
    paperWidthMm: 297,
    heightMm: 210,
    copies: Math.max(1, opts.copies ?? 1),
  })
}
