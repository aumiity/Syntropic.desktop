import type { ReceiptSettings, SaleForPrint, Setting } from '@/types'
import { buildSlipHtml, type SlipMode } from './buildSlipHtml'

type PrintResult = { success: boolean; error?: string }

// Receipts always print on a continuous roll → height is ALWAYS auto (measured
// from content), and copies are ALWAYS 1. Neither is user-tunable; the stored
// paper_height_mm / copies columns are ignored on purpose.
const SLIP_HEIGHT = 'auto' as const
const SLIP_COPIES = 1

async function loadConfig(): Promise<{ shop: Partial<Setting>; settings: ReceiptSettings }> {
  const [shop, settings] = await Promise.all([
    window.api.settings.getShop() as Promise<Partial<Setting>>,
    window.api.settings.getReceiptSettings() as Promise<ReceiptSettings>,
  ])
  return { shop: shop ?? {}, settings }
}

// Print a cash slip / receipt. Pass a preloaded config to avoid a round-trip
// (POS already holds shop + settings); otherwise it fetches them.
export async function printSlip(
  sale: SaleForPrint,
  mode: SlipMode,
  config?: { shop: Partial<Setting>; settings: ReceiptSettings },
): Promise<PrintResult> {
  const { shop, settings } = config ?? await loadConfig()
  const html = await buildSlipHtml(sale, shop, settings, { mode })
  return window.api.printer.printHtml({
    html,
    printerName: settings.printer_name || '',
    paperWidthMm: settings.paper_width_mm || 80,
    heightMm: SLIP_HEIGHT,
    copies: SLIP_COPIES,
  })
}

// Resolve the slip header mode from the bill itself — no manual setting.
// Order matters: voided/return keep their own documents; otherwise a bill that
// recorded VAT (total_vat > 0) prints as an abbreviated tax invoice, and a
// non-VAT bill prints as a plain cash receipt.
export function resolveSlipMode(sale: SaleForPrint): SlipMode {
  if (sale.status === 'voided') return 'void'
  if (sale.sale_type === 'return') return 'return'
  return (sale.total_vat ?? 0) > 0 ? 'abbrevTax' : 'receipt'
}

// Open a PDF preview of the slip (no physical printer needed).
export async function previewSlip(sale: SaleForPrint, mode: SlipMode): Promise<PrintResult> {
  const { shop, settings } = await loadConfig()
  const html = await buildSlipHtml(sale, shop, settings, { mode })
  return window.api.printer.previewHtmlPdf({
    html,
    paperWidthMm: settings.paper_width_mm || 80,
    heightMm: SLIP_HEIGHT,
  })
}

// NOTE: A4-document printing moved to React A4-portrait preview popups (render
// via printDomSheets):
//   - tax invoice → src/components/dialogs/TaxInvoiceBuyerDialog.tsx (+ shared
//     src/components/receipt/taxInvoiceSheet.tsx)
//   - goods receipt → src/components/dialogs/GoodsReceiptPrintDialog.tsx
// The former printTaxInvoice/previewTaxInvoice/printGoodsReceipt/previewGoodsReceipt
// + buildTaxInvoiceHtml/buildGoodsReceiptHtml builders + docConfig/PAGE_MM were removed.
