// Barcode SVG generator for the `barcode` label section. Returns an inline SVG
// STRING so the same output feeds BOTH render paths: the React preview embeds it
// as an <img> data-URI, and the print HTML embeds it the same way — preview and
// print stay 1:1 (mirrors the LabelPaper / buildLabelHtml split).
//
// Format is auto-detected: 12–13 digits → EAN-13 (typical Thai product codes),
// 8 digits → EAN-8, anything else → CODE128 (custom/internal codes, any ASCII).
// If a numeric value fails its symbology's check digit, we fall back to CODE128
// so a barcode still renders rather than vanishing.
//
// NOTE: uses `document` + `XMLSerializer`, so it only runs in the RENDERER. Both
// callers (LabelPaper, buildLabelHtml) already run there.
import JsBarcode from 'jsbarcode'

function pickFormat(v: string): string {
  if (/^\d{12,13}$/.test(v)) return 'EAN13'
  if (/^\d{8}$/.test(v)) return 'EAN8'
  return 'CODE128'
}

export interface BarcodeOpts {
  /** font-family for the human-readable digits under the bars */
  font?: string
  /** font size (px) for the digits */
  fontSize?: number
  /** show the human-readable digits under the bars (default true) */
  displayValue?: boolean
  /**
   * Render EAN/UPC bars all at the SAME height (no guard-bar "tails" / descenders
   * that EAN normally extends to flank the digit row). Default false keeps the
   * standard look; pass true for a clean full-height bar block. Ignored by CODE128.
   */
  flat?: boolean
  /**
   * true (default) → stretch bars to fill BOTH the pinned width and height
   * (preserveAspectRatio:none). false → keep the barcode's natural aspect, fit it
   * inside the box and CENTER it (xMidYMid meet). Use false when several barcodes
   * of the SAME symbology must look identical: same-length codes then render at an
   * identical natural size instead of being stretched to whatever box they sit in.
   */
  stretch?: boolean
}

export function barcodeSvg(value: string | null | undefined, opts: BarcodeOpts = {}): string {
  const v = (value ?? '').trim()
  if (!v) return ''

  const common = {
    width: 2,
    height: 40,
    margin: 0,
    displayValue: opts.displayValue ?? true,
    flat: opts.flat ?? false,
    fontSize: opts.fontSize ?? 14,
    font: opts.font ?? 'sans-serif',
    background: '#ffffff',
    lineColor: '#000000',
  }

  const render = (format: string, strict: boolean): string | null => {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
    try {
      JsBarcode(svg, v, {
        format,
        ...common,
        // strict: throw on an invalid check digit so we can fall back to CODE128.
        valid: (ok: boolean) => { if (strict && !ok) throw new Error('invalid') },
      })
    } catch {
      return null
    }
    // Give the SVG a VALID viewBox so it scales to the caller's pinned box.
    // JsBarcode sets width/height as e.g. "190px" — STRIP the unit (parseFloat),
    // because a viewBox carrying "px" units is invalid → browsers drop it entirely
    // → the SVG never scales to the box and even two identical EAN-13 codes render
    // at inconsistent sizes. preserveAspectRatio: 'none' stretches to fill both
    // axes; 'xMidYMid meet' keeps the natural aspect and centers (so same-symbology
    // codes come out identical, which is what `stretch:false` callers want).
    const w = parseFloat(svg.getAttribute('width') || '')
    const h = parseFloat(svg.getAttribute('height') || '')
    if (Number.isFinite(w) && Number.isFinite(h)) svg.setAttribute('viewBox', `0 0 ${w} ${h}`)
    svg.setAttribute('preserveAspectRatio', (opts.stretch ?? true) ? 'none' : 'xMidYMid meet')
    return new XMLSerializer().serializeToString(svg)
  }

  const format = pickFormat(v)
  // Try the detected symbology first; if a numeric code fails its check digit,
  // fall back to CODE128 (which encodes any digits without a check requirement).
  return render(format, format !== 'CODE128') ?? render('CODE128', false) ?? ''
}
