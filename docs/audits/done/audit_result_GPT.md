  # Audit: Negative-Stock Reconciliation Plan

  ## Summary

  แผนโดยรวมใช้ฐานข้อมูลเดิมได้จริง และ deductFefo() รองรับ oversell ด้วย
  sale_item_lots.lot_id IS NULL อยู่แล้ว แต่ยังมีจุดที่ควรแก้ก่อน implement
  เพราะมีความเสี่ยงทำให้ IPC พัง, badge/count ค้าง, หรือ reconcile ไม่ตรงกับ stock
  semantics ปัจจุบัน

  แนะนำบันทึก audit เป็น docs/audits/negative-stock-reconciliation-audit.md

  ## Findings

  - Critical: stock_movements insert ใน reconcile/dismiss ขาด product_id
      - schema กำหนด stock_movements.product_id INTEGER NOT NULL
      - ตัวอย่าง SQL ในแผนระบุ insert columns เริ่มที่ movement_type ทำให้ runtime fail
        แน่นอน
      - ต้องใส่ product_id เสมอ และใส่ lot_id เป็น lot จริงใน reconcile, NULL ใน
        dismiss
  - Critical: void sale จะทิ้ง NULL markers ค้าง
      - reports:voidSale ตอนนี้ restore/cancel เฉพาะ sil.lot_id IS NOT NULL
      - ถ้าขายติดลบแล้ว void ก่อน reconcile, negativeStock:count/list ตามแผนจะยังนับ
        marker ของบิลที่ voided
      - ต้องเพิ่ม logic ใน voidSale ให้ UPDATE sale_item_lots SET is_cancelled = 1
        สำหรับ NULL markers ของ sale นั้น หรือให้ทุก negative-stock query join sales แล้ว
        filter s.status = 'completed'
      - แนะนำทำทั้งสอง: cancel marker ตอน void และ query เฉพาะ completed เพื่อกัน
        legacy data
  - High: reconcile plan พูดเรื่อง is_closed ไม่ตรงกับ POS FEFO ปัจจุบัน
      - deductFefo() ตั้งใจไม่ auto-close lot ที่ qty เหลือ 0
      - แผนบอกว่า qty_on_hand อาจ toggle is_closed แล้วจึง recompute cost แต่ pseudo-
        code ไม่ได้ toggle จริง
      - ต้องตัดสินใจให้ชัด: v1 ควร match behavior เดิมของ deductFefo() คือไม่ auto-close
        lot และไม่อ้างว่า recompute เพราะ is_closed เปลี่ยน
      - ถ้าจะเปลี่ยนเป็น auto-close ต้องแก้ POS FEFO ด้วย ไม่ควรให้ reconcile มี semantics
        ต่างจาก sale ปกติ
  - High: FEFO/open-lot queries ควร exclude cancelled lots
      - แผนใช้ product_lots WHERE product_id = ? AND qty_on_hand > 0 AND is_closed
        = 0
      - stock handlers หลายจุดใน products.ts ใช้ is_cancelled = 0 ด้วย
      - เพิ่ม AND is_cancelled = 0 ใน negativeStock:list.available_stock และ
        reconcile FEFO query
  - Medium: ใช้ remaining == 0 กับ REAL qty เสี่ยงจาก floating precision
      - qty อาจมาจาก qty * qty_per_base
      - ใช้ epsilon เช่น remaining <= 1e-9 และ normalize remaining เป็น 0 ก่อน delete
        marker
      - ไฟล์จริง src/components/layout/Sidebar.tsx label คือ /manage = “ประวัติ & สต็อก”
      - ระบุ target เป็น nav item to: '/manage' แทนการอ้างชื่อเมนู
  - Medium: Badge refresh store ควรถูกล็อกเป็น required
      - Sidebar เป็น component stable และไม่ remount ตาม route
      - แนะนำเลือก Zustand store เป็น decision เดียว ไม่ปล่อย Option A/B
      - store ควรมี count, refresh(), และ hydrate once on mount; เรียก refresh หลัง
        POS save, Purchase save, reconcile, dismiss, และ voidSale

  ## Required Plan Fixes

  - แก้ negativeStock:reconcile ให้ insert stock_movements ด้วย columns:
    product_id, lot_id, movement_type, ref_type, ref_id, qty_change, qty_before,
    qty_after, unit_cost, note, created_by
  - แก้ negativeStock:dismiss ให้ insert audit movement ด้วย product_id, lot_id =
    NULL, qty_change = 0
  - เพิ่ม handling สำหรับ voided sales:
    reports:voidSale ต้อง cancel NULL markers หรือ negative-stock query ต้อง filter
    s.status = 'completed'; แนะนำทำทั้งคู่
  - เพิ่ม is_cancelled = 0 ใน product lot availability/reconcile queries
  - ใช้ epsilon สำหรับ partial/full reconcile
  - ล็อก sidebar badge implementation เป็น Zustand store และ target /manage item
  - ปรับคำอธิบาย recompute/is_closed ให้ตรงกับ behavior ที่เลือก

  ## Test Additions

  - ขายติดลบแล้ว void sale ก่อน reconcile: badge ต้องลดลง และหน้า negative-stock
    ต้องไม่แสดงรายการนั้น
  - Reconcile full: marker หาย, lot ลด, movement มี product_id/lot_id ถูกต้อง
  - Reconcile partial ด้วย decimal qty: marker เหลือค่าถูกต้อง ไม่มีเศษ floating แปลก ๆ
  - Dismiss: marker is_cancelled = 1, inventory ไม่เปลี่ยน, audit movement insert
    สำเร็จ
  - Cancelled lot ที่มี qty_on_hand > 0 ต้องไม่ถูกใช้ reconcile
  - Badge refresh หลัง POS save, Purchase save, reconcile, dismiss, และ voidSale

  ## Assumptions

  - v1 จะคง POS silent oversell ตามแผนเดิม
  - v1 จะไม่เพิ่ม schema/table ใหม่
  - Reconcile จะ match current deductFefo() semantics คือไม่ auto-close lot ตอน qty
    เหลือ 0 เว้นแต่มีแผนแยกแก้ stock lifecycle ทั้งระบบ