---
name: feedback_border_over_ring
description: framed/stat/tinted boxes ใช้ border ทั้งหมด (ไม่ใช่ ring); h-N บนกล่องมีขอบ = ความสูงนอกรวมขอบ (border-box)
metadata:
  type: feedback
---

**มาตรฐานขอบกล่อง framed/stat/tinted — ตั้ง 2026-06-16.**

**Why:** เคยมิกซ์ `border` (กล่อง stat/profit/cost) กับ `ring` (TabStrip toggle) ทำให้ความสูงไม่ตรงกัน 2px แล้วงงตอนวัด (profitBox วัด content ได้ 54 ทั้งที่ตั้ง `h-14`=56). เจ้าของเลือกให้มี **มาตรฐานเดียว = border**.

**How to apply:**
- **กล่องมีกรอบทุกใบใช้ `border` (เช่น `border border-success/30`, `border-border`, `border-amber-strong/25`) — ไม่ใช่ `ring`.** `border` เป็น norm ของแอปอยู่แล้ว (Card/Input/กล่อง tinted) + ทน print/overflow.
- **นิยามความสูง: `h-N` บน element ที่มีขอบ = ความสูง "นอก" รวมขอบแล้ว (เพราะ `box-sizing: border-box` ทั้งแอป, `html { font-size:16px }` → rem=16px).** ขอบ 1px บน+ล่าง กิน 2px เข้าใน → **content = h−2px** เป็นเรื่องปกติ ไม่ใช่บั๊ก. เช่น `h-14` = 56px นอก / 54px content; `h-9` = 36px นอก / 34px content. ตอนวัดให้เลือก element นอกสุด.
- **วาง `h-N` ตรงไหน:** กล่องเดี่ยวที่มีขอบเอง (profitBox/cost box/แถว switch มีกรอบ) → `h-N` อยู่บนตัวกล่องนั้น = นอก h-N. ส่วนแถวใน list `divide-y` (กรอบอยู่ wrapper) → `h-N` อยู่บน "แถว" (แถวไม่มีขอบเอง = วัดได้ h-N พอดี), wrapper บวกขอบนอกอีก ~2px. ดู [[checkbox-row-conventions]].
- **`ring` สงวนไว้เคสเดียว = TabStrip `toggle`** (ปุ่มต้อง `h-full` เต็ม h-9 bar โดยขอบไม่กินความสูง — มี doc กำกับใน `docs/claude/ui-components.md`). อย่าเอา ring ไปใช้กับกล่อง framed อื่น.

เกี่ยวข้อง: [[feedback_invalid_border_only]] (invalid = border แดงอย่างเดียว ไม่ ring ซ้อน), [[checkbox-row-conventions]].
