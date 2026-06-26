---
name: recharts_focus_outline
description: คลิกกราฟ recharts แล้วมีกรอบเหลือง (accent) = focus outline ของ root <svg>; แก้ที่ index.css แล้ว
metadata:
  type: reference
---

**อาการ:** คลิกที่กราฟ (recharts) แล้วมี "กรอบเหลือง" ครอบพื้นที่กราฟ/การ์ด

**สาเหตุ:** recharts (เวอร์ชันที่ใช้ = 3.8.1) ใส่ `tabIndex` ที่ root `<svg>` (RootSurface) → พอคลิก svg โดน focus → เบราว์เซอร์วาด focus outline; สีดันไปตรงกับ `--accent` (43 100% 64% = #F5C24A เหลือง) เลยเห็นเป็นกรอบเหลือง ไม่ใช่ ring/border ของการ์ด

**แก้แล้ว (DONE 2026-06-26):** เพิ่ม rule ใน `src/index.css` (นอก `@layer`, ก่อน `@layer utilities`):
```css
.recharts-wrapper:focus,
.recharts-wrapper:focus-visible,
.recharts-surface:focus,
.recharts-surface:focus-visible { outline: none; }
```
ครอบทุกกราฟทั้งแอป (Sales finance + Dashboard) — กราฟไม่ได้ใช้คีย์บอร์ดเลื่อนเลยปิด outline ได้

**How to apply ถ้าเจออีก:** อาการ "กรอบเหลืองตอนคลิก/โฟกัส" element อื่น ๆ ที่ไม่ใช่ recharts ให้สงสัย focus outline เริ่มต้นของเบราว์เซอร์ที่ไปหยิบสี accent มา — เช็คว่า element นั้นมี `tabIndex`/โฟกัสได้ไหม แล้วปิด `outline` เฉพาะจุด (อย่าปิด global `*:focus` ทั้งแอป จะกระทบ a11y). เจ้าของบอกว่าเจออาการนี้อีกหลายที่ — ถ้าเจอจะแจ้งเพิ่ม. ดู [[feedback_invalid_border_only]] · [[feedback_border_over_ring]]
