import type { ReactNode } from 'react'

// A4 landscape at 96dpi: 297mm × 210mm = 1123 × 794 CSS px. Keeping the on-screen
// sheet at exactly these dimensions means one sheet maps 1:1 to one printed page
// (see the @media print block in src/index.css, which uses @page margin:0 so the
// sheet's own padding becomes the page margin). The official ขย. forms (9/10/11)
// all render on this surface.
export const A4 = { W: 1123, H: 794, PAD_X: 40, PAD_Y: 32 } as const

// A4 PORTRAIT at 96dpi: 210mm × 297mm = 794 × 1123 CSS px. Same padding as the
// landscape sheet. Used by portrait documents (ใบรับสินค้า / GR, and later the
// tax invoice). The ขย. registers stay landscape via the `A4` const above.
export const A4_PORTRAIT = { W: 794, H: 1123, PAD_X: 40, PAD_Y: 32 } as const

// Inner content box once the sheet padding is removed.
export const A4_CONTENT_W = A4.W - A4.PAD_X * 2   // 1043
export const A4_CONTENT_H = A4.H - A4.PAD_Y * 2   // 730
export const A4P_CONTENT_W = A4_PORTRAIT.W - A4_PORTRAIT.PAD_X * 2   // 714
export const A4P_CONTENT_H = A4_PORTRAIT.H - A4_PORTRAIT.PAD_Y * 2   // 1059

// Footer (page number) reserved height — fixed (one line) so it never shifts the
// measured body height. Matches the h-6 footer rendered by <A4Sheet>.
export const FOOTER_H = 24

// Slack subtracted from the per-page body budget so sub-pixel rounding between the
// hidden measuring pass and the real render never overflows the fixed-height sheet
// (which clips with overflow-hidden). Pure safety margin.
export const PACK_SAFETY = 6

// One A4 sheet: fixed-size flex column with a repeated header, a clipped body, and
// a centered "หน้า X / Y" footer. The body is `overflow-hidden` on purpose — the
// caller's pagination guarantees content fits, and the clip is the last line of
// defense against an off-by-a-pixel measurement.
export function A4Sheet({
  header, children, pageNo, pageCount, orientation = 'landscape',
}: {
  header: ReactNode
  children: ReactNode
  pageNo: number
  pageCount: number
  // 'landscape' (default) = the ขย. registers + EnvLog (1123×794). 'portrait' =
  // GR / tax invoice (794×1123). Default landscape keeps every existing prop-less
  // caller byte-identical.
  orientation?: 'portrait' | 'landscape'
}) {
  const dims = orientation === 'portrait' ? A4_PORTRAIT : A4
  return (
    <div
      className="a4-sheet bg-card text-foreground mx-auto flex flex-col overflow-hidden"
      // Official ขย. documents are locked to Sarabun — on the preview AND the
      // print (the print bakes these computed styles, so the font carries over).
      // boxShadow matches the receipt/label/document preview depth (DocumentSettingsTab);
      // it never prints — printDomSheets forces box-shadow:none and doesn't bake it.
      style={{
        width: dims.W,
        height: dims.H,
        padding: `${dims.PAD_Y}px ${dims.PAD_X}px`,
        fontFamily: "'Sarabun Print', sans-serif",
        boxShadow: '0 4px 5px rgb(0 0 0 / 0.20), 0 12px 14px rgb(0 0 0 / 0.16)',
      }}
    >
      <div className="shrink-0">{header}</div>
      <div className="flex-1 min-h-0 overflow-hidden">{children}</div>
      <div className="shrink-0 flex items-end justify-center text-xs text-foreground-subtle" style={{ height: FOOTER_H }}>
        หน้า {pageNo} / {pageCount}
      </div>
    </div>
  )
}
