import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react'
import { buildSlipHtml, type SlipMode } from '@/lib/receipt/buildSlipHtml'
import { resolveSlipMode } from '@/lib/receipt/print'
import type { ReceiptSettings, SaleForPrint, Setting } from '@/types'

// Scalloped "torn paper" bottom edge — a solid rectangle layered over a row of
// repeating radial cut-outs at the bottom. The drop-shadow lives on the WRAPPER
// (not box-shadow) so the shadow follows the jagged alpha edge instead of a
// straight box.
const TORN_MASK: CSSProperties = {
  WebkitMaskImage: 'linear-gradient(#000,#000), radial-gradient(circle 12px at 50% 100%, transparent 12px, #000 12px)',
  WebkitMaskSize: '100% calc(100% - 12px), 10% 12px',
  WebkitMaskPosition: 'top, left bottom',
  WebkitMaskRepeat: 'no-repeat, repeat-x',
  maskImage: 'linear-gradient(#000,#000), radial-gradient(circle 12px at 50% 100%, transparent 12px, #000 12px)',
  maskSize: '100% calc(100% - 12px), 10% 12px',
  maskPosition: 'top, left bottom',
  maskRepeat: 'no-repeat, repeat-x',
}

// ONE slip preview, shared by the Settings receipt designer and the POS payment
// dialog so both pull from a single renderer (buildSlipHtml) and can never
// drift. Rendered through the real print builder in an iframe → WYSIWYG with
// what prints.
//
// `fontFamily` overrides the receipt's configured print font: the POS dialog
// passes the app UI font so the on-screen preview reads in the program's
// typeface; omit it (Settings designer) to honour `settings.font_family` (the
// true thermal font). `zoom` scales the whole paper via transform (true
// magnification — `zoom`/iframe would reflow the inner page to a wider sheet).
export function SlipPreview({
  sale, shop, settings, mode, fontFamily, zoom = 1,
}: {
  sale: SaleForPrint
  shop: Partial<Setting>
  settings: ReceiptSettings
  mode?: SlipMode
  fontFamily?: string
  zoom?: number
}) {
  const [html, setHtml] = useState('')
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const [iframeH, setIframeH] = useState(0)
  const widthMm = settings.paper_width_mm || 80
  const resolvedMode = mode ?? resolveSlipMode(sale)

  useEffect(() => {
    let cancelled = false
    const built = fontFamily ? { ...settings, font_family: fontFamily } : settings
    buildSlipHtml(sale, shop, built, { mode: resolvedMode })
      .then(h => { if (!cancelled) setHtml(h) })
    return () => { cancelled = true }
  }, [sale, shop, settings, fontFamily, resolvedMode])

  // iframes don't auto-size to content; measure the rendered body height and
  // grow the frame so the OUTER container owns the scrollbar. Collapse to 0
  // before measuring (scrollHeight returns max(content, current height), which
  // would otherwise creep taller on every rebuild).
  const fitIframe = useCallback(() => {
    const el = iframeRef.current
    const doc = el?.contentWindow?.document
    if (!el || !doc) return
    el.style.height = '0'
    const h = doc.documentElement.scrollHeight
    el.style.height = `${h + 16}px`
    setIframeH(h)
  }, [])

  // Re-measure after the embedded (base64) fonts apply — that reflow changes the
  // height after the initial load event fires.
  useEffect(() => {
    if (!html) return
    const t = setTimeout(fitIframe, 120)
    return () => clearTimeout(t)
  }, [html, fitIframe])

  return (
    <div
      className="mx-auto"
      style={{ width: `calc(${widthMm}mm * ${zoom})`, height: iframeH ? `${(iframeH + 16) * zoom}px` : 'auto' }}
    >
      <div
        style={{
          transform: `scale(${zoom})`, transformOrigin: 'top left',
          filter: 'drop-shadow(0 4px 5px rgb(0 0 0 / 0.20)) drop-shadow(0 12px 14px rgb(0 0 0 / 0.16))',
        }}
      >
        <iframe
          ref={iframeRef}
          title="receipt-preview"
          srcDoc={html}
          onLoad={fitIframe}
          scrolling="no"
          className="bg-white border-0 block"
          style={{ width: `${widthMm}mm`, height: iframeH ? `${iframeH + 16}px` : 'auto', ...TORN_MASK }}
        />
      </div>
    </div>
  )
}
