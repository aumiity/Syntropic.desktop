// Silent-print the already-rendered A4 preview sheets (no OS dialog).
//
// HOW: clone the live `.a4-sheet` nodes and bake every element's COMPUTED style
// into an inline `style=""`, then ship that to a hidden print window. Baking
// computed styles (instead of inlining the app's stylesheets) makes the print
// pixel-identical to the on-screen preview — same fonts, same measured
// pagination — while carrying NO app CSS rules, so nothing from @media print /
// Tailwind can re-flow the tables (an earlier full-stylesheet inline collapsed
// the column widths into a stray grid). Every cell ends up with an explicit px
// width, so the table can't collapse.
//
// WHY not window.print() / webContents.print({silent:false}): Electron ships
// without Chromium's print-preview, so both surface "This app doesn't support
// print preview". The silent printer:printDocument path (hidden window →
// webContents.print({silent:true})) is the proven one and prints straight to the
// configured printer; landscape is forced there (orientation is per-document).
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

// Recursively copy every computed CSS property from each source element onto the
// matching cloned element as an inline style. The clone tree mirrors the source
// (cloneNode(true)), so children line up by index. cssText is empty for computed
// styles in Chromium, so iterate the property list instead.
function bakeComputedStyles(src: Element, dst: Element) {
  const cs = getComputedStyle(src)
  let style = ''
  for (let i = 0; i < cs.length; i++) {
    const prop = cs.item(i)
    style += `${prop}:${cs.getPropertyValue(prop)};`
  }
  dst.setAttribute('style', style)
  const sc = src.children
  const dc = dst.children
  for (let i = 0; i < sc.length && i < dc.length; i++) bakeComputedStyles(sc[i], dc[i])
}

export interface PrintDomResult { success: boolean; error?: string }

// Clone the chosen .a4-sheet nodes inside `docSelector`, bake their computed
// styles inline, wrap them in a standalone HTML doc (Thai font embedded), and
// spool it silently — landscape A4 — to `printerName` (''=OS default).
// pages = 'all' or a 1-based list (see parsePageSelection).
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

  const fontCss = await buildPrintFontFaceCss(getAppThaiFont())

  const sheetsHtml = chosen.map(src => {
    const clone = src.cloneNode(true) as HTMLElement
    bakeComputedStyles(src, clone)
    return clone.outerHTML
  }).join('')

  // No app stylesheet is shipped — the baked inline styles already carry the full
  // look. These few rules only pin each sheet to one exact A4-landscape page.
  const html = `<!doctype html><html><head><meta charset="utf-8">
<style>${fontCss}</style>
<style>
  @page { size: A4 landscape; margin: 0; }
  html, body { margin: 0; padding: 0; background: #fff; }
  .a4-sheet { width: 297mm !important; height: 210mm !important; margin: 0 !important; box-shadow: none !important; overflow: hidden; break-inside: avoid; break-after: page; page-break-after: always; }
  .a4-sheet:last-child { break-after: auto; page-break-after: auto; }
</style>
</head><body>${sheetsHtml}</body></html>`

  // pageFormat 'A4' + landscape:true forces the job landscape regardless of the
  // printer's portrait default (the shared A4 printer is set up portrait for tax
  // invoices) — orientation is per-document, not per-printer.
  return window.api.printer.printDocument({
    html,
    printerName: opts.printerName,
    pageFormat: 'A4',
    landscape: true,
    copies: Math.max(1, opts.copies ?? 1),
  })
}
