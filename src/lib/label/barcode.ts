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
}

export function barcodeSvg(value: string | null | undefined, opts: BarcodeOpts = {}): string {
  const v = (value ?? '').trim()
  if (!v) return ''

  const common = {
    width: 2,
    height: 40,
    margin: 0,
    displayValue: opts.displayValue ?? true,
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
    return new XMLSerializer().serializeToString(svg)
  }

  const format = pickFormat(v)
  // Try the detected symbology first; if a numeric code fails its check digit,
  // fall back to CODE128 (which encodes any digits without a check requirement).
  return render(format, format !== 'CODE128') ?? render('CODE128', false) ?? ''
}
