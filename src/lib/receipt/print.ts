import type { QuotationForPrint, ReceiptSettings, SaleForPrint, Setting, TaxInvoice } from '@/types'
import { buildSlipHtml, type SlipMode } from './buildSlipHtml'
import { buildTaxInvoiceHtml } from './buildTaxInvoiceHtml'
import { buildQuotationHtml } from './buildQuotationHtml'

type PrintResult = { success: boolean; error?: string }

// paper_height_mm = 0 → continuous-roll auto height; otherwise a fixed page.
const slipHeight = (s: ReceiptSettings): number | 'auto' =>
  s.paper_height_mm && s.paper_height_mm > 0 ? s.paper_height_mm : 'auto'

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
    heightMm: slipHeight(settings),
    copies: settings.copies || 1,
  })
}

// Open a PDF preview of the slip (no physical printer needed).
export async function previewSlip(sale: SaleForPrint, mode: SlipMode): Promise<PrintResult> {
  const { shop, settings } = await loadConfig()
  const html = await buildSlipHtml(sale, shop, settings, { mode })
  return window.api.printer.previewHtmlPdf({
    html,
    paperWidthMm: settings.paper_width_mm || 80,
    heightMm: slipHeight(settings),
  })
}

// Print a full A4 tax invoice. `copy` controls the ต้นฉบับ/สำเนา stamp.
export async function printTaxInvoice(
  sale: SaleForPrint,
  shop: Partial<Setting>,
  tax: TaxInvoice,
  copy: boolean,
  printerName = '',
): Promise<PrintResult> {
  const html = await buildTaxInvoiceHtml(sale, shop, tax, { copy })
  return window.api.printer.printHtml({ html, printerName, paperWidthMm: 210, heightMm: 297, copies: 1 })
}

export async function previewTaxInvoice(
  sale: SaleForPrint,
  shop: Partial<Setting>,
  tax: TaxInvoice,
  copy: boolean,
): Promise<PrintResult> {
  const html = await buildTaxInvoiceHtml(sale, shop, tax, { copy })
  return window.api.printer.previewHtmlPdf({ html, pageFormat: 'A4' })
}

// Quotation (ใบเสนอราคา) — A4. Loads shop info itself unless provided.
export async function printQuotation(
  quote: QuotationForPrint,
  shop?: Partial<Setting>,
  printerName = '',
): Promise<PrintResult> {
  const s = shop ?? ((await window.api.settings.getShop()) as Partial<Setting>) ?? {}
  const html = await buildQuotationHtml(quote, s)
  return window.api.printer.printHtml({ html, printerName, paperWidthMm: 210, heightMm: 297, copies: 1 })
}

export async function previewQuotation(
  quote: QuotationForPrint,
  shop?: Partial<Setting>,
): Promise<PrintResult> {
  const s = shop ?? ((await window.api.settings.getShop()) as Partial<Setting>) ?? {}
  const html = await buildQuotationHtml(quote, s)
  return window.api.printer.previewHtmlPdf({ html, pageFormat: 'A4' })
}
