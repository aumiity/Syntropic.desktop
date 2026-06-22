---
name: project_min_ui_canvas_scroll
description: PARKED feature — fixed minimum UI canvas with scrollbars below it (instead of compressing). Approach decided, min-size TBD pending user display research.
metadata:
  type: project
---

**PARKED 2026-06-22 — อย่าเริ่มเชิงรุก** เจ้าของขอจดไว้ก่อน รอหาข้อมูลว่าผู้ใช้ส่วนใหญ่ใช้จอแบบไหน/upscale กันไหม แล้วค่อยเคาะขนาดขั้นต่ำ

## โจทย์
คง UI ขั้นต่ำไว้ (ออกแบบสำหรับโน้ตบุ๊ก 15"). พอย่อหน้าต่างเล็กกว่าขนาดนั้น **UI ไม่หดตาม** แต่โผล่ scrollbar เลื่อน ↕↔ แทน

## สถานะปัจจุบัน (ก่อนทำ)
- `electron/main.ts`: BrowserWindow `minWidth: 1366, minHeight: 800` → OS บล็อกย่อต่ำกว่านี้อยู่แล้ว UI เลยแทบไม่หด
- `src/components/layout/Layout.tsx`: root `relative flex flex-col h-screen overflow-hidden`; TitleBar = `absolute top-0 inset-x-0 h-9 z-50` (ปุ่มควบคุมหน้าต่างเป็น DOM มุมขวา); ใต้ลงมา `flex flex-1 overflow-hidden` → `[Sidebar][main flex-1 overflow-hidden]`; page = `motion.div` (full-width pages = `h-full`, อื่น ๆ = `h-full w-full max-w-7xl mx-auto`)

## การตัดสินใจที่เคาะแล้ว
**เลือกแนวทาง: ตรึง TitleBar + Sidebar, เลื่อนเฉพาะ `<main>`** (Option A)
- TitleBar ตรึงอยู่แล้ว (absolute) → ปุ่ม min/max/close เป็น DOM มุมขวา ห้ามให้ scroll หลุด
- Sidebar ตรึงซ้าย; `<main>` เป็น scroll viewport (`overflow-auto`) + inner wrapper `min-w/min-h`
- หลักการ CSS: outer `overflow-auto` + inner `w-full h-full min-w-[Npx] min-h-[Npx]` → ใหญ่กว่า min เติมเต็ม, เล็กกว่า min คงรูป+scroll

## ⬜ ค้าง: เคาะ "ขนาดขั้นต่ำ" (รอ research จอผู้ใช้)
**กุญแจ: Electron วัดเป็น logical px ไม่ใช่ physical** → ตั้งสเกล 125% พื้นที่ใช้งานเล็กลงตามสเกล

| จอ / สเกล | logical | สูงใช้จริง (หัก taskbar/menu) |
|---|---|---|
| 1080p @100% | 1920×1080 | ~1032 |
| 1080p @125% (15.6" Win ทั่วไป, default) | 1536×864 | ~824 |
| 1080p @150% (13–14" Win, default) | 1280×720 | ~680 |
| 1366×768 native @100% (โน้ตบุ๊กงบ/เก่า) | 1366×768 | ~728 |
| MacBook 15" retina (default) | 1440×900 | ~875 |

**ข้อสรุปสำคัญ: ตัวจำกัดคือ "ความสูง" ไม่ใช่ความกว้าง**
- 1440×900 → **เกินจอ 125% 1080p และ Mac 15" (สูง 900 > 824/875) → scrollbar ตลอดแม้ขยายเต็ม ✗ อย่าใช้**
- min-height ปลอดภัยทุกจอข้างบน (ยกเว้น 150%/1366-native): **≤ 800**; เซฟกว่านั้น ≤ 720
- min-width: 1366 < 1536 พอดี 125% 1080p; 1280 รองรับถึง 150%

**ตัวเลือกที่เสนอ:** 1366×800 (แนะนำ — พอดี 125% 1080p + Mac 15"), 1280×800 (เซฟถึง 150%), 1366×768

**INSIGHT (เจ้าของ 2026-06-22): อย่าสมมติผู้ใช้ตั้ง 100%** — ผู้ใช้ร้านยาเป็นผู้สูงอายุ ตั้ง 100% ตัวเล็กมองไม่เห็น เขา upscale เสมอ (125% เป็นอย่างน้อย, บางคน 150%). ฐานออกแบบ = **125% (1536×864 จาก 1080p)** ไม่ใช่ 100%. นี่คือเหตุผลที่ฟีเจอร์นี้จำเป็น — คนดัน 150% เหลือ 1280×720 < UI → ต้อง scroll แทนบีบจนกดปุ่มไม่โดน. → เคาะ **1366×800** (125%-1080p ใช้เต็มจอ; 150% degrade เป็น scroll)
**คำถามที่ต้องตอบก่อนเคาะ:** มีลูกค้าใช้จอเก่า 1366×768 native ไหม (ถ้ามี → height ต้อง ≤768); จอร้านเจ้าของเอง = 24" 1080p @125% = 1536×864

## ตอนทำจริง (sketch)
1. `electron/main.ts` ลด `minWidth/minHeight` (เช่น 640×480) ให้ย่อได้จริง — เก็บ `<<DECIDED>>` ขนาดไว้เป็น UI min แทน
2. `Layout.tsx`: `<main>` → `overflow-auto`; ใส่ inner wrapper `min-w-[?px] min-h-[?px] w-full h-full`
3. ระวัง full-width pages (POS/purchase/reports) ใช้ `h-full` + internal table scroll — min-h จะทำให้สูงคงที่แล้ว main scroll แทน (ยอมรับได้)
4. ตรวจ POS (จอตัวเอง) ว่าไม่พังเรื่อง refocus/scroll
