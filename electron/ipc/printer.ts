import { ipcMain, BrowserWindow, shell, app } from 'electron'
import net from 'net'
import { promises as fs } from 'fs'
import path from 'path'

// ESC/POS constants
const ESC = 0x1b
const GS = 0x1d

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
        })()
      `)
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
