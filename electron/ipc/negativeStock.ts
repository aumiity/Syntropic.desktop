import { ipcMain } from 'electron'
import { getDb } from '../db'
import { recomputeAvgCost, propagateCostToBundles } from '../db/pricing'

// Negative-stock reconciliation.
//
// Background: deductFefo() in pos.ts allows oversell — when all open lots are
// exhausted it writes a single sale_item_lots row with lot_id=NULL holding the
// unfulfilled remainder. These NULL markers are the "queue" this module manages.
//
// Two operations:
//   - reconcile: walk current open lots FEFO and consume the marker (writes
//     real stock_movements, replaces the NULL row with one row per lot consumed).
//   - dismiss: mark the NULL row is_cancelled = 1 (operator decided not to
//     deduct — e.g. the actual stock was already counted somewhere else).
//
// HARD invariants:
//   - Every stock_movements INSERT carries product_id (NOT NULL). Column order
//     matches pos.ts:42-46 / purchase.ts:190-194 exactly.
//   - FEFO query excludes is_cancelled lots (audit fix).
//   - We do NOT auto-close lots whose qty_on_hand hits 0 — matches deductFefo()
//     semantics; lot lifecycle is owned by adjustStock/updateLot.
//   - Voided sales are excluded by every query (status='completed'); voidSale
//     also cancels NULL markers so they don't ghost the queue.
//   - Float-safe: use EPS instead of `remaining == 0` for marker upkeep.

const EPS = 1e-9

interface MarkerRow {
  id: number
  sale_item_id: number
  product_id: number
  qty: number
  sale_id: number
  invoice_no: string
  status: string
}

function loadMarker(db: any, id: number): MarkerRow {
  const row = db.prepare(`
    SELECT sil.id, sil.sale_item_id, sil.product_id, sil.qty,
           si.sale_id, s.invoice_no, s.status
      FROM sale_item_lots sil
      JOIN sale_items si ON si.id = sil.sale_item_id
      JOIN sales      s  ON s.id  = si.sale_id
     WHERE sil.id = ?
       AND sil.lot_id IS NULL
       AND sil.is_cancelled = 0
  `).get(id) as MarkerRow | undefined
  if (!row) throw new Error('ไม่พบรายการสต๊อกติดลบ (อาจถูกจัดการไปแล้ว)')
  if (row.status !== 'completed') throw new Error('บิลนี้ถูกยกเลิกแล้ว ไม่สามารถจัดการได้')
  return row
}

export function registerNegativeStockHandlers() {
  // List of outstanding negative-stock markers. Joined with current open-lot
  // sum so the UI can show "ตัดได้กี่ชิ้น" without a second round-trip.
  ipcMain.handle('negativeStock:list', () => {
    const db = getDb()
    return db.prepare(`
      SELECT sil.id,
             sil.sale_item_id,
             sil.product_id,
             sil.qty,
             si.sale_id,
             s.invoice_no,
             s.sold_at,
             COALESCE(cust.full_name, 'ลูกค้าทั่วไป') AS customer_name,
             p.code  AS product_code,
             p.trade_name,
             u.name  AS unit_name,
             (SELECT COALESCE(SUM(qty_on_hand), 0)
                FROM product_lots
               WHERE product_id   = sil.product_id
                 AND is_closed    = 0
                 AND is_cancelled = 0
             ) AS available_stock
        FROM sale_item_lots sil
        JOIN sale_items si  ON si.id  = sil.sale_item_id
        JOIN sales      s   ON s.id   = si.sale_id
        JOIN products   p   ON p.id   = sil.product_id
        LEFT JOIN item_units u    ON u.id    = p.unit_id
        LEFT JOIN customers  cust ON cust.id = s.customer_id
       WHERE sil.lot_id      IS NULL
         AND sil.is_cancelled = 0
         AND si.is_cancelled  = 0
         AND s.status         = 'completed'
       ORDER BY s.sold_at ASC, sil.id ASC
    `).all()
  })

  // Lightweight count for the sidebar badge.
  ipcMain.handle('negativeStock:count', () => {
    const db = getDb()
    const r = db.prepare(`
      SELECT COUNT(*) AS c
        FROM sale_item_lots sil
        JOIN sale_items si ON si.id = sil.sale_item_id
        JOIN sales      s  ON s.id  = si.sale_id
       WHERE sil.lot_id      IS NULL
         AND sil.is_cancelled = 0
         AND si.is_cancelled  = 0
         AND s.status         = 'completed'
    `).get() as { c: number }
    return r.c
  })

  // FEFO-deduct a marker against current open lots.
  //
  // Outcomes:
  //   - Full reconcile: marker row is DELETEd; one new sale_item_lots row per
  //     lot consumed; stock_movements rows logged; product_lots.qty_on_hand
  //     decreased.
  //   - Partial reconcile: marker.qty decremented to the remaining amount; same
  //     side effects for whatever could be consumed.
  //   - Nothing available: throws (UI disables the button when available_stock
  //     <= 0, but we defend at the boundary too).
  ipcMain.handle('negativeStock:reconcile', (_e, payload: { id: number; userId: number }) => {
    const db = getDb()
    const run = db.transaction(() => {
      const marker = loadMarker(db, payload.id)

      const lots = db.prepare(`
        SELECT * FROM product_lots
         WHERE product_id   = ?
           AND qty_on_hand  > 0
           AND is_closed    = 0
           AND is_cancelled = 0
         ORDER BY CASE WHEN expiry_date IS NULL
                       THEN '9999-99-99' ELSE expiry_date END ASC
      `).all(marker.product_id) as any[]

      if (lots.length === 0) {
        throw new Error('ไม่มีสต๊อกพร้อมตัด — ต้องรับสินค้าก่อน')
      }

      let remaining = marker.qty
      let deductedTotal = 0

      for (const lot of lots) {
        if (remaining <= EPS) break
        const deduct = Math.min(lot.qty_on_hand, remaining)
        const qtyBefore = lot.qty_on_hand

        db.prepare(`UPDATE product_lots SET qty_on_hand = qty_on_hand - ? WHERE id = ?`)
          .run(deduct, lot.id)

        db.prepare(`
          INSERT INTO sale_item_lots (sale_item_id, lot_id, product_id, qty)
          VALUES (?, ?, ?, ?)
        `).run(marker.sale_item_id, lot.id, marker.product_id, deduct)

        db.prepare(`
          INSERT INTO stock_movements
            (product_id, lot_id, movement_type, ref_type, ref_id,
             qty_change, qty_before, qty_after, unit_cost, note, created_by)
          VALUES (?, ?, 'sale', 'sale', ?, ?, ?, ?, ?, ?, ?)
        `).run(
          marker.product_id, lot.id, marker.sale_id,
          -deduct, qtyBefore, qtyBefore - deduct, lot.cost_price,
          `ตัดสต๊อคย้อนหลัง: ${marker.invoice_no}`, payload.userId,
        )

        remaining -= deduct
        deductedTotal += deduct
      }

      // Marker upkeep — epsilon-safe.
      if (remaining <= EPS) {
        db.prepare(`DELETE FROM sale_item_lots WHERE id = ?`).run(marker.id)
        remaining = 0
      } else {
        db.prepare(`UPDATE sale_item_lots SET qty = ? WHERE id = ?`).run(remaining, marker.id)
      }

      // Defensive recompute. We do NOT auto-close lots here, so the weighted
      // avg pool typically won't shift — but qty_received composition can
      // matter for callers that rely on it being stamped consistently.
      recomputeAvgCost(db, marker.product_id)
      propagateCostToBundles(db, marker.product_id)

      return {
        success: true,
        deducted_qty: deductedTotal,
        remaining_qty: remaining,
      }
    })
    return run()
  })

  // Dismiss — cancel the marker without consuming any stock. Writes an audit
  // movement row (qty_change = 0, lot_id = NULL) so the action is visible in
  // the product's stock history.
  ipcMain.handle('negativeStock:dismiss', (_e, payload: { id: number; userId: number }) => {
    const db = getDb()
    const run = db.transaction(() => {
      const marker = loadMarker(db, payload.id)

      db.prepare(`UPDATE sale_item_lots SET is_cancelled = 1 WHERE id = ?`).run(marker.id)

      db.prepare(`
        INSERT INTO stock_movements
          (product_id, lot_id, movement_type, ref_type, ref_id,
           qty_change, qty_before, qty_after, unit_cost, note, created_by)
        VALUES (?, NULL, 'sale', 'sale', ?, 0, 0, 0, 0, ?, ?)
      `).run(
        marker.product_id, marker.sale_id,
        'ลบรายการขายติดลบโดยไม่ตัดสต๊อค', payload.userId,
      )

      return { success: true }
    })
    return run()
  })
}
