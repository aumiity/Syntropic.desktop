import { ipcMain } from 'electron'
import { getDb } from '../db'
import dayjs from 'dayjs'

// Dev-only handlers. Trigger from DevTools console:
//   await window.api.dev.seedTestStock()
// Marker prefixes ('TEST-', 'GR-TEST-', 'LOT-TEST-') let us wipe + re-seed
// without touching real data.
export function registerDevHandlers() {
  ipcMain.handle('dev:seedTestStock', () => {
    const db = getDb()

    const NAME_TEMPLATES = [
      'Paracetamol 500mg', 'Ibuprofen 400mg', 'Amoxicillin 500mg',
      'Loratadine 10mg', 'Omeprazole 20mg', 'Metformin 500mg',
      'Amlodipine 5mg', 'Simvastatin 20mg', 'Diphenhydramine 25mg',
      'Hydroxyzine 10mg', 'Vitamin C 1000mg', 'Vitamin D 1000IU',
      'Calcium 600mg', 'Aspirin 81mg', 'Cetirizine 10mg',
      'Diclofenac Gel 1%', 'Ranitidine 150mg', 'Salbutamol Inhaler',
      'Prednisolone 5mg', 'Atorvastatin 20mg',
    ]

    const rand = (min: number, max: number) =>
      Math.floor(Math.random() * (max - min + 1)) + min
    const pick = <T,>(arr: T[]): T => arr[rand(0, arr.length - 1)]

    // ---- Phase 0: Pre-flight checks ----
    const cats = db.prepare(`SELECT id FROM product_categories WHERE is_disabled = 0`)
      .all().map((r: any) => r.id) as number[]
    const drugTypes = db.prepare(`SELECT id FROM drug_types WHERE is_disabled = 0`)
      .all().map((r: any) => r.id) as number[]
    const units = db.prepare(`SELECT id, name FROM item_units`)
      .all() as Array<{ id: number; name: string }>
    const suppliers = db.prepare(`SELECT id FROM suppliers WHERE is_disabled = 0`)
      .all().map((r: any) => r.id) as number[]

    if (cats.length === 0) throw new Error('ไม่มี product_categories — รัน seed หลักก่อน')
    if (units.length === 0) throw new Error('ไม่มี item_units — รัน seed หลักก่อน')
    if (suppliers.length === 0) throw new Error('ไม่มี suppliers — รัน seed หลักก่อน')

    // ---- Phase 1: Wipe existing TEST-* data ----
    // Block if any sale references a TEST lot — would orphan FEFO trace.
    const usedTestLots = (db.prepare(`
      SELECT COUNT(*) as c FROM sale_item_lots sil
      JOIN product_lots pl ON pl.id = sil.lot_id
      WHERE pl.lot_number GLOB 'LOT-TEST-*'
    `).get() as any).c
    if (usedTestLots > 0) {
      throw new Error(`พบ ${usedTestLots} sale_item_lots อ้างถึง lot ทดสอบ — ลบข้อมูลขายก่อน หรือ void invoices ที่เกี่ยวข้อง`)
    }

    const wipe = db.transaction(() => {
      const testProductIds = db.prepare(`SELECT id FROM products WHERE code GLOB 'TEST-*'`)
        .all().map((r: any) => r.id) as number[]

      if (testProductIds.length === 0) return 0

      const ph = testProductIds.map(() => '?').join(',')
      db.prepare(`DELETE FROM stock_movements WHERE product_id IN (${ph})`).run(...testProductIds)
      db.prepare(`DELETE FROM lot_cost_logs WHERE product_id IN (${ph})`).run(...testProductIds)
      db.prepare(`DELETE FROM price_logs WHERE product_id IN (${ph})`).run(...testProductIds)
      db.prepare(`DELETE FROM purchase_receipt_items WHERE invoice_no GLOB 'GR-TEST-*'`).run()
      db.prepare(`DELETE FROM product_lots WHERE lot_number GLOB 'LOT-TEST-*'`).run()
      db.prepare(`DELETE FROM purchase_receipts WHERE invoice_no GLOB 'GR-TEST-*'`).run()
      db.prepare(`DELETE FROM product_units WHERE product_id IN (${ph})`).run(...testProductIds)
      db.prepare(`DELETE FROM product_labels WHERE product_id IN (${ph})`).run(...testProductIds)
      db.prepare(`DELETE FROM products WHERE code GLOB 'TEST-*'`).run()
      return testProductIds.length
    })
    const wipedCount = wipe()

    // ---- Phase 2: Generate 1000 products ----
    const insProduct = db.prepare(`
      INSERT INTO products (
        barcode, code, trade_name, name_for_print,
        category_id, drug_type_id, is_stock_item,
        price_retail, price_wholesale1, price_wholesale2, cost_price,
        unit_id,
        has_vat, reorder_point, safety_stock,
        is_antibiotic, is_fda9, is_fda10, is_fda11, is_fda13,
        search_keywords, note
      ) VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)
    const insReceipt = db.prepare(`
      INSERT INTO purchase_receipts
        (invoice_no, supplier_id, supplier_invoice_no, order_date,
         payment_type, due_date, is_paid, paid_date, note,
         discount_amount, surcharge_amount, status, created_at)
      VALUES (?, ?, ?, ?, 'cash', NULL, 1, ?, '', 0, 0, 'completed', ?)
    `)
    const insReceiptItem = db.prepare(`
      INSERT INTO purchase_receipt_items
        (invoice_no, product_id, lot_id, lot_number, manufactured_date, expiry_date,
         cost_price, sell_price, qty, note, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, '', ?)
    `)
    const insLot = db.prepare(`
      INSERT INTO product_lots
        (product_id, supplier_id, lot_number, manufactured_date, expiry_date,
         cost_price, sell_price, qty_received, qty_on_hand, qty_reserved,
         invoice_no, supplier_invoice_no, order_date,
         payment_type, is_paid, paid_date, is_closed, is_cancelled, note, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, 'cash', 1, ?, 0, 0, '', ?)
    `)
    const insMove = db.prepare(`
      INSERT INTO stock_movements
        (product_id, lot_id, movement_type, ref_type, ref_id,
         qty_change, qty_before, qty_after, unit_cost, note, created_by, created_at)
      VALUES (?, ?, 'receive', 'purchase_receipt', NULL, ?, 0, ?, ?, '', NULL, ?)
    `)

    const today = dayjs()

    const generate = db.transaction(() => {
      // 2a. Products + base units
      const productIds: number[] = []
      const productCosts: number[] = []
      const productPrices: number[] = []

      for (let i = 1; i <= 1000; i++) {
        const seq = String(i).padStart(4, '0')
        const template = pick(NAME_TEMPLATES)
        const trade_name = `[ทดสอบ] ${template} #${seq}`
        const code = `TEST-${seq}`
        const barcode = `999${String(i).padStart(10, '0')}`

        const cost = rand(5, 200)
        const markup = 1.3 + Math.random() * 1.2
        const retail = Math.round(cost * markup)
        const ws1 = Math.round(cost * (1.1 + Math.random() * 0.3))

        const result = insProduct.run(
          barcode, code, trade_name, template,
          pick(cats), pick(drugTypes),
          retail, ws1, 0, cost,
          pick(units).id, // unit_id (base unit, lives directly on products)
          0, // has_vat
          rand(10, 100), // reorder_point
          rand(5, 50),   // safety_stock
          Math.random() < 0.15 ? 1 : 0, // is_antibiotic ~15%
          0, 0, 0, 0, // is_fda9/10/11/13 (all off for test data)
          template.split(' ')[0].toLowerCase(),
          'auto-generated test data',
        )
        const productId = result.lastInsertRowid as number
        productIds.push(productId)
        productCosts.push(cost)
        productPrices.push(retail)
      }

      // 2b. 10 GRs × 100 line items each
      for (let g = 1; g <= 10; g++) {
        const grNo = `GR-TEST-${String(g).padStart(3, '0')}`
        const receiveDate = today.subtract(10 - g, 'day').format('YYYY-MM-DD')
        const supplierId = pick(suppliers)

        insReceipt.run(grNo, supplierId, `INV-MOCK-${grNo}`, receiveDate, receiveDate, receiveDate)

        for (let j = 0; j < 100; j++) {
          const idx = (g - 1) * 100 + j
          const productId = productIds[idx]
          const cost = productCosts[idx]
          const retail = productPrices[idx]

          // Expiry distribution:
          // - 10% near-expiry (30-89 days)  → triggers expiry-warning UI
          // - 90% normal (180 days - 3 years)
          const daysAhead = idx % 10 === 0 ? rand(30, 89) : rand(180, 1095)
          const expiry = today.add(daysAhead, 'day').format('YYYY-MM-DD')
          const manufactured = today.subtract(rand(30, 360), 'day').format('YYYY-MM-DD')

          // Stock distribution:
          // - 5% out of stock (qty_on_hand = 0) → triggers "หมดสต็อก" badge
          // - 95% in stock (50-500 units)
          const qtyReceived = rand(50, 500)
          const qtyOnHand = idx % 20 === 0 ? 0 : qtyReceived

          const lotNo = `LOT-TEST-${String(idx + 1).padStart(4, '0')}`

          const lotResult = insLot.run(
            productId, supplierId, lotNo, manufactured, expiry,
            cost, retail, qtyReceived, qtyOnHand,
            grNo, `INV-MOCK-${grNo}`, receiveDate,
            receiveDate, // paid_date
            receiveDate, // created_at
          )
          const lotId = lotResult.lastInsertRowid as number

          insReceiptItem.run(
            grNo, productId, lotId, lotNo, manufactured, expiry,
            cost, retail, qtyReceived, receiveDate,
          )

          insMove.run(productId, lotId, qtyReceived, qtyReceived, cost, receiveDate)
        }
      }
    })

    generate()

    return {
      wiped: wipedCount,
      products: 1000,
      grs: 10,
      lots: 1000,
      message: `เสร็จแล้ว — ลบของเก่า ${wipedCount} ชิ้น, สร้างใหม่ 1000 ชนิด, 10 GR (100/บิล)`,
    }
  })
}
