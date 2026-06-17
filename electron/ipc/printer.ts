import { ipcMain, BrowserWindow, shell, app } from 'electron'
import net from 'net'
import { promises as fs } from 'fs'
import path from 'path'

// ESC/POS constants
const ESC = 0x1b
const GS = 0x1d

// Virtual "Print to PDF" printer sentinel. When the chosen printer_name equals
// this, the print handlers (printer:printHtml / printer:printLabel) export the
// HTML to a true paper-size PDF + open it in the OS viewer instead of spooling
// to a physical device. MUST match PRINT_TO_PDF_VALUE in
// src/lib/print/pdfPrinter.ts (renderer + main are built separately).
const PRINT_TO_PDF = '__print_to_pdf__'

// Write a rendered PDF buffer to a temp file and open it in the OS default
// viewer. Shared by the PDF branch of printHtml / printLabel.
async function savePdfAndOpen(pdf: Buffer, namePrefix: string) {
  const file = path.join(app.getPath('temp'), `${namePrefix}-${Date.now()}.pdf`)
  await fs.writeFile(file, pdf)
  const err = await shell.openPath(file)
  if (err) return { success: false, error: err }
  return { success: true, path: file }
}

function buildReceipt(data: {
  shopName: string
  shopAddress?: string
  shopPhone?: string
  invoiceNo: string
  soldAt: string
  items: Array<{ name: string; unit: string; qty: number; price: number; discount: number; total: number }>
  subtotal: number
  discount: number
  vatEnabled?: boolean
  vat?: number
  total: number
  cashAmount: number
  changeAmount: number
  customerName?: string
}): Buffer {
  const encoder = new TextEncoder()
  const chunks: Uint8Array[] = []

  const push = (text: string) => chunks.push(encoder.encode(text))
  const pushBytes = (...bytes: number[]) => chunks.push(new Uint8Array(bytes))

  // Initialize, set Thai code page
  pushBytes(ESC, 0x40)       // Init
  pushBytes(ESC, 0x74, 0x15) // Code page Thai

  // Center align
  pushBytes(ESC, 0x61, 0x01)
  push(`${data.shopName}\n`)
  if (data.shopAddress) push(`${data.shopAddress}\n`)
  if (data.shopPhone) push(`${data.shopPhone}\n`)
  push('--------------------------------\n')

  // Left align
  pushBytes(ESC, 0x61, 0x00)
  push(`เลขที่: ${data.invoiceNo}\n`)
  push(`วันที่: ${data.soldAt}\n`)
  if (data.customerName) push(`ลูกค้า: ${data.customerName}\n`)
  push('--------------------------------\n')

  for (const item of data.items) {
    const name = item.name.substring(0, 20).padEnd(20, ' ')
    const qty = `${item.qty}`
    const price = item.price.toFixed(2)
    const total = item.total.toFixed(2).padStart(8, ' ')
    push(`${name}\n`)
    push(`  ${qty} x ${price}${total}\n`)
    if (item.discount > 0) push(`  ส่วนลด: -${item.discount.toFixed(2)}\n`)
  }

  push('--------------------------------\n')
  const subStr = data.subtotal.toFixed(2).padStart(8, ' ')
  push(`ยอดรวม:${subStr.padStart(25, ' ')}\n`)
  if (data.discount > 0) {
    const discStr = data.discount.toFixed(2).padStart(8, ' ')
    push(`ส่วนลด:-${discStr.padStart(24, ' ')}\n`)
  }
  // VAT-inclusive breakdown: the total already contains VAT, so we show the
  // pre-tax goods value and the VAT portion split out of it.
  if (data.vatEnabled && (data.vat ?? 0) > 0) {
    const vat = data.vat ?? 0
    const exVatStr = (data.total - vat).toFixed(2).padStart(8, ' ')
    const vatStr = vat.toFixed(2).padStart(8, ' ')
    push(`มูลค่าก่อนภาษี:${exVatStr.padStart(18, ' ')}\n`)
    push(`ภาษีมูลค่าเพิ่ม:${vatStr.padStart(17, ' ')}\n`)
  }

  // Double height for total
  pushBytes(ESC, 0x21, 0x10)
  const totalStr = data.total.toFixed(2).padStart(8, ' ')
  push(`รวมทั้งสิ้น:${totalStr.padStart(21, ' ')}\n`)
  pushBytes(ESC, 0x21, 0x00)

  if (data.cashAmount > 0) {
    push(`รับเงิน:${data.cashAmount.toFixed(2).padStart(24, ' ')}\n`)
    push(`เงินทอน:${data.changeAmount.toFixed(2).padStart(23, ' ')}\n`)
  }

  push('--------------------------------\n')
  // Center
  pushBytes(ESC, 0x61, 0x01)
  push('ขอบคุณที่ใช้บริการ\n')
  push('\n\n\n')

  // Cut
  pushBytes(GS, 0x56, 0x41, 0x10)

  const totalLen = chunks.reduce((a, c) => a + c.length, 0)
  const result = new Uint8Array(totalLen)
  let offset = 0
  for (const chunk of chunks) { result.set(chunk, offset); offset += chunk.length }
  return Buffer.from(result)
}

// Wait for webfonts + images + layout to settle before snapshotting/printing a
// `data:` URL page. Without this Electron may capture the default font or
// pre-layout sizing (same race the label handlers guard against).
const WAIT_FOR_RENDER_JS = `
  (async () => {
    if (document.fonts && document.fonts.ready) { try { await document.fonts.ready } catch {} }
    try { await Promise.all([...document.images].map(img => img.decode().catch(() => {}))) } catch {}
    await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)))
    if (window.__labelFitReady) { try { await window.__labelFitReady } catch {} }
  })()
`

// Measure the rendered content height (px) → mm, clamped to a sane range with a
// small bottom bleed. Used for continuous-roll slips where the page height is
// not known ahead of time (1 CSS px = 1/96 inch).
async function measureContentHeightMm(wc: Electron.WebContents): Promise<number> {
  const px = await wc.executeJavaScript(
    `Math.ceil(document.documentElement.getBoundingClientRect().height)`
  ) as number
  const mm = (px * 25.4) / 96
  return Math.min(2000, Math.max(40, Math.ceil(mm) + 3))
}

export function registerPrinterHandlers() {
  ipcMain.handle('printer:printReceipt', async (_e, data: any) => {
    try {
      const buffer = buildReceipt(data)
      // Send to printer via TCP (default ESC/POS network printer)
      await new Promise<void>((resolve, reject) => {
        const client = new net.Socket()
        const host = data.printerHost ?? '192.168.1.100'
        const port = data.printerPort ?? 9100
        client.connect(port, host, () => {
          client.write(buffer, () => {
            client.destroy()
            resolve()
          })
        })
        client.on('error', reject)
        setTimeout(() => { client.destroy(); reject(new Error('timeout')) }, 5000)
      })
      return { success: true }
    } catch (err: any) {
      return { success: false, error: err.message }
    }
  })

  ipcMain.handle('printer:listPrinters', async (event) => {
    return await event.sender.getPrintersAsync()
  })

  // Print the calling window's visible content through the OS print dialog.
  // The renderer can't call window.print() (Electron has no Chromium
  // print-preview → "This app doesn't support print preview"); routing through
  // webContents.print({ silent:false }) opens the real system dialog instead,
  // which gives printer + page-range + copies selection for free. The page's
  // own @media print CSS (hide chrome, A4 sheets, break-after:page) is honored.
  // Used by the A4 official reports (ขย.9/10/11) — monthly, occasional, and the
  // operator needs to pick pages (reprint a single damaged sheet).
  ipcMain.handle('printer:printVisible', async (event, opts?: { landscape?: boolean }) => {
    return await new Promise<{ success: boolean; error?: string }>((resolve) => {
      try {
        event.sender.print(
          {
            silent: false,
            printBackground: true,
            landscape: opts?.landscape ?? true,
            pageSize: 'A4',
            margins: { marginType: 'none' },
          },
          (success, failureReason) => resolve({ success, error: success ? undefined : failureReason }),
        )
      } catch (e: any) {
        resolve({ success: false, error: e?.message ?? String(e) })
      }
    })
  })

  ipcMain.handle('printer:printLabel', async (_e, args: {
    html: string
    printerName: string
    paperWidthMm: number
    paperHeightMm: number
  }) => {
    if (!(args.paperWidthMm > 0) || !(args.paperHeightMm > 0)) {
      return { success: false, error: 'invalid paper size' }
    }
    const w = new BrowserWindow({ show: false, webPreferences: { offscreen: false } })
    try {
      await w.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(args.html))
      // Wait for webfonts + layout before printing, otherwise Electron may
      // snapshot the page with the default font or pre-layout sizing.
      await w.webContents.executeJavaScript(`
        (async () => {
          if (document.fonts && document.fonts.ready) { try { await document.fonts.ready } catch {} }
          await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)))
          // Auto shrink-to-fit runs in the page (LABEL_FIT_SCRIPT); wait for it
          // so the snapshot captures the fitted layout, not the pre-fit overflow.
          if (window.__labelFitReady) { try { await window.__labelFitReady } catch {} }
        })()
      `)
      // Virtual "Print to PDF" printer: export the same label HTML to a PDF and
      // open it instead of spooling to a device (mirrors previewLabelPdf).
      if (args.printerName === PRINT_TO_PDF) {
        const pdf = await w.webContents.printToPDF({
          printBackground: true,
          preferCSSPageSize: true,
          pageSize: { width: Math.round(args.paperWidthMm * 1000), height: Math.round(args.paperHeightMm * 1000) },
          margins: { top: 0, bottom: 0, left: 0, right: 0 },
        })
        return await savePdfAndOpen(pdf, 'label')
      }
      await new Promise<void>((resolve, reject) => {
        w.webContents.print({
          silent: true,
          deviceName: args.printerName || undefined,
          // Electron pageSize uses microns (1 mm = 1000 µm).
          pageSize: { width: Math.round(args.paperWidthMm * 1000), height: Math.round(args.paperHeightMm * 1000) },
          margins: { marginType: 'none' },
          printBackground: false,
          color: false,
        }, (success, failureReason) => success ? resolve() : reject(new Error(failureReason)))
      })
      return { success: true }
    } catch (e: any) {
      return { success: false, error: e.message }
    } finally {
      w.destroy()
    }
  })

  // Render the same label HTML to a PDF (true paper-size page) and open it in
  // the OS default viewer — a "what will actually print" preview that doesn't
  // need a physical label printer attached.
  ipcMain.handle('printer:previewLabelPdf', async (_e, args: {
    html: string
    paperWidthMm: number
    paperHeightMm: number
  }) => {
    if (!(args.paperWidthMm > 0) || !(args.paperHeightMm > 0)) {
      return { success: false, error: 'invalid paper size' }
    }
    const w = new BrowserWindow({ show: false, webPreferences: { offscreen: false } })
    try {
      await w.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(args.html))
      // Wait for webfonts + layout before snapshotting, otherwise the PDF may
      // capture the default font or pre-layout sizing (same race as printLabel).
      await w.webContents.executeJavaScript(`
        (async () => {
          if (document.fonts && document.fonts.ready) { try { await document.fonts.ready } catch {} }
          await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)))
          // Auto shrink-to-fit runs in the page (LABEL_FIT_SCRIPT); wait for it
          // so the snapshot captures the fitted layout, not the pre-fit overflow.
          if (window.__labelFitReady) { try { await window.__labelFitReady } catch {} }
        })()
      `)
      // preferCSSPageSize honors the @page { size } rule in the HTML; pageSize
      // (microns) is the fallback for engines that ignore it.
      const pdf = await w.webContents.printToPDF({
        printBackground: true,
        preferCSSPageSize: true,
        pageSize: {
          width: Math.round(args.paperWidthMm * 1000),
          height: Math.round(args.paperHeightMm * 1000),
        },
        margins: { top: 0, bottom: 0, left: 0, right: 0 },
      })
      const file = path.join(app.getPath('temp'), `label-preview-${Date.now()}.pdf`)
      await fs.writeFile(file, pdf)
      const err = await shell.openPath(file)
      if (err) return { success: false, error: err }
      return { success: true, path: file }
    } catch (e: any) {
      return { success: false, error: e.message }
    } finally {
      w.destroy()
    }
  })

  // Generic silent HTML print for receipts/slips/tax invoices. Same mechanism
  // as printLabel (render HTML in a hidden window → webContents.print silent)
  // but supports continuous-roll auto height and N copies.
  //   heightMm = 'auto' (default) → measure content, set a tall single page
  //   heightMm = number          → fixed page (fallback for thermal drivers
  //                                 that reject custom long pages)
  ipcMain.handle('printer:printHtml', async (_e, args: {
    html: string
    printerName: string
    paperWidthMm: number
    heightMm?: number | 'auto'
    copies?: number
  }) => {
    if (!(args.paperWidthMm > 0)) return { success: false, error: 'invalid paper width' }
    const w = new BrowserWindow({ show: false, webPreferences: { offscreen: false } })
    try {
      await w.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(args.html))
      await w.webContents.executeJavaScript(WAIT_FOR_RENDER_JS)

      const heightMm = (args.heightMm == null || args.heightMm === 'auto')
        ? await measureContentHeightMm(w.webContents)
        : args.heightMm
      if (!(heightMm > 0)) return { success: false, error: 'invalid paper height' }

      // Virtual "Print to PDF" printer: export to a PDF + open it instead of
      // spooling (copies are irrelevant for a single exported file).
      if (args.printerName === PRINT_TO_PDF) {
        const pdf = await w.webContents.printToPDF({
          printBackground: true,
          preferCSSPageSize: true,
          pageSize: { width: Math.round(args.paperWidthMm * 1000), height: Math.round(heightMm * 1000) },
          margins: { top: 0, bottom: 0, left: 0, right: 0 },
        })
        return await savePdfAndOpen(pdf, 'print')
      }

      const copies = Math.max(1, Math.min(20, Math.floor(args.copies ?? 1)))
      for (let i = 0; i < copies; i++) {
        // Sequential — wait for each job to be spooled before the next, so the
        // driver doesn't drop/merge concurrent jobs.
        await new Promise<void>((resolve, reject) => {
          w.webContents.print({
            silent: true,
            deviceName: args.printerName || undefined,
            pageSize: { width: Math.round(args.paperWidthMm * 1000), height: Math.round(heightMm * 1000) },
            margins: { marginType: 'none' },
            printBackground: true,
            color: false,
          }, (success, failureReason) => success ? resolve() : reject(new Error(failureReason)))
        })
      }
      return { success: true }
    } catch (e: any) {
      return { success: false, error: e.message }
    } finally {
      w.destroy()
    }
  })

  // Render receipt/tax-invoice HTML to a PDF and open it — "what will print"
  // preview without a physical printer. pageFormat ('A4'/'A5') for full tax
  // invoices; otherwise width + auto/fixed height like a slip.
  ipcMain.handle('printer:previewHtmlPdf', async (_e, args: {
    html: string
    paperWidthMm?: number
    heightMm?: number | 'auto'
    pageFormat?: 'A4' | 'A5'
  }) => {
    const w = new BrowserWindow({ show: false, webPreferences: { offscreen: false } })
    try {
      await w.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(args.html))
      await w.webContents.executeJavaScript(WAIT_FOR_RENDER_JS)

      let pdfOpts: Electron.PrintToPDFOptions
      if (args.pageFormat) {
        // Page margin is baked into the HTML body padding, so use zero PDF
        // margins to avoid double margins.
        pdfOpts = {
          printBackground: true,
          preferCSSPageSize: true,
          pageSize: args.pageFormat,
          margins: { top: 0, bottom: 0, left: 0, right: 0 },
        }
      } else {
        const widthMm = args.paperWidthMm && args.paperWidthMm > 0 ? args.paperWidthMm : 80
        const heightMm = (args.heightMm == null || args.heightMm === 'auto')
          ? await measureContentHeightMm(w.webContents)
          : args.heightMm
        pdfOpts = {
          printBackground: true,
          preferCSSPageSize: true,
          pageSize: { width: Math.round(widthMm * 1000), height: Math.round(heightMm * 1000) },
          margins: { top: 0, bottom: 0, left: 0, right: 0 },
        }
      }
      const pdf = await w.webContents.printToPDF(pdfOpts)
      const file = path.join(app.getPath('temp'), `receipt-preview-${Date.now()}.pdf`)
      await fs.writeFile(file, pdf)
      const err = await shell.openPath(file)
      if (err) return { success: false, error: err }
      return { success: true, path: file }
    } catch (e: any) {
      return { success: false, error: e.message }
    } finally {
      w.destroy()
    }
  })

  ipcMain.handle('printer:openCashDrawer', async (_e, data: { host?: string; port?: number }) => {
    try {
      const host = data.host ?? '192.168.1.100'
      const port = data.port ?? 9100
      // ESC/POS cash drawer open: ESC p 0 25 250
      const cmd = Buffer.from([ESC, 0x70, 0x00, 0x19, 0xfa])
      await new Promise<void>((resolve, reject) => {
        const client = new net.Socket()
        client.connect(port, host, () => { client.write(cmd, () => { client.destroy(); resolve() }) })
        client.on('error', reject)
        setTimeout(() => { client.destroy(); reject(new Error('timeout')) }, 3000)
      })
      return { success: true }
    } catch (err: any) {
      return { success: false, error: err.message }
    }
  })
}
