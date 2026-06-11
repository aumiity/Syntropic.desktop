import type { DocumentSettings, ReceiptSettings, SaleForPrint, Setting, TaxInvoice } from '@/types'
import { buildSlipHtml, type SlipMode } from './buildSlipHtml'
import { buildTaxInvoiceHtml } from './buildTaxInvoiceHtml'
import { buildGoodsReceiptHtml, type GoodsReceiptForPrint } from './buildGoodsReceiptHtml'

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

// Physical page dimensions (mm) for the supported document page sizes.
const PAGE_MM: Record<'A4' | 'A5', { w: number; h: number }> = {
  A4: { w: 210, h: 297 },
  A5: { w: 148, h: 210 },
}

// A4 documents (tax invoice / goods receipt) share one configured
// printer + copies + page size (document_settings). printer_name '' = OS default
// printer. An explicit non-empty printerName arg still wins, for one-off overrides.
async function docConfig(printerName?: string): Promise<{
  printerName: string; copies: number; paperSize: 'A4' | 'A5'; widthMm: number; heightMm: number
}> {
  const s = (await window.api.settings.getDocumentSettings()) as DocumentSettings | undefined
  const paperSize: 'A4' | 'A5' = s?.paper_size === 'A5' ? 'A5' : 'A4'
  const dims = PAGE_MM[paperSize]
  return {
    printerName: printerName || s?.printer_name || '',
    copies: Math.max(1, Number(s?.copies) || 1),
    paperSize,
    widthMm: dims.w,
    heightMm: dims.h,
  }
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

// Print a full A4 tax invoice. `copy` controls the ต้นฉบับ/สำเนา stamp.
export async function printTaxInvoice(
  sale: SaleForPrint,
  shop: Partial<Setting>,
  tax: TaxInvoice,
  copy: boolean,
  printerName = '',
): Promise<PrintResult> {
  const cfg = await docConfig(printerName)
  const html = await buildTaxInvoiceHtml(sale, shop, tax, { copy, paperSize: cfg.paperSize })
  return window.api.printer.printHtml({ html, printerName: cfg.printerName, paperWidthMm: cfg.widthMm, heightMm: cfg.heightMm, copies: cfg.copies })
}

export async function previewTaxInvoice(
  sale: SaleForPrint,
  shop: Partial<Setting>,
  tax: TaxInvoice,
  copy: boolean,
): Promise<PrintResult> {
  const cfg = await docConfig()
  const html = await buildTaxInvoiceHtml(sale, shop, tax, { copy, paperSize: cfg.paperSize })
  return window.api.printer.previewHtmlPdf({ html, pageFormat: cfg.paperSize })
}

// Goods receipt (ใบรับสินค้า) — A4. Loads shop info itself unless provided.
export async function printGoodsReceipt(
  gr: GoodsReceiptForPrint,
  shop?: Partial<Setting>,
  printerName = '',
): Promise<PrintResult> {
  const s = shop ?? ((await window.api.settings.getShop()) as Partial<Setting>) ?? {}
  const cfg = await docConfig(printerName)
  const html = await buildGoodsReceiptHtml(gr, s, { paperSize: cfg.paperSize })
  return window.api.printer.printHtml({ html, printerName: cfg.printerName, paperWidthMm: cfg.widthMm, heightMm: cfg.heightMm, copies: cfg.copies })
}

export async function previewGoodsReceipt(
  gr: GoodsReceiptForPrint,
  shop?: Partial<Setting>,
): Promise<PrintResult> {
  const s = shop ?? ((await window.api.settings.getShop()) as Partial<Setting>) ?? {}
  const cfg = await docConfig()
  const html = await buildGoodsReceiptHtml(gr, s, { paperSize: cfg.paperSize })
  return window.api.printer.previewHtmlPdf({ html, pageFormat: cfg.paperSize })
}
