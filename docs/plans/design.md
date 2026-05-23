# Responsive Width Strategy — SCRAPPED

**สถานะ: ยกเลิกโปรเจกต์** (2026-05-23)

User ลองดูแล้วไม่ชอบทั้ง 2 pattern ที่เสนอ — เลือก **ปล่อยยืดเต็มจอตามเดิม** ไม่ cap ฟอร์ม

---

## สรุปสิ่งที่เกิดขึ้น

1. Audit เจอว่าหน้าฟอร์มส่วนใหญ่ปล่อยยืดเต็มจอ (ไม่มี `max-w-`) → เสนอ refactor
2. ลอง implement **ทาง A** (Cap ชิดซ้าย `max-w-Nxl` ไม่มี `mx-auto`) ที่ Settings 2 ไฟล์
3. User บอก "ไม่เข้าใจ ผลออกมาเหมือนเว็บไหม?" → อธิบาย concept "cap + กลาง"
4. ลอง **ทาง B** (Cap + กลาง `max-w-Nxl mx-auto`) → user feedback: **"ไม่สวย ขอเหมือนเดิม"**
5. ยืนยัน: เลือก "ยืดเต็มจอ ไม่ cap เลย" → revert ทั้งหมด

---

## เหตุผลที่ scrap

User preference: ฟอร์มยืดเต็มจอดูดีกว่าสำหรับเขา ทั้งที่ industry standard (Linear, Notion, Stripe) จะ cap+กลาง

ไม่ใช่เรื่องผิด — เป็น taste/preference ที่ valid และเป็น final decision

---

## State หลัง revert

ทุกไฟล์กลับเป็น state ก่อนเริ่ม session:
- `Settings/ShopTab.tsx` → `<div className="pt-4">` (ยืดเต็ม, ตามเดิม)
- `Settings/LabelSettingsTab.tsx` → `<div className="grid grid-cols-2 gap-4 pt-4">` (ยืดเต็ม, ตามเดิม)
- `Settings/SalesTab.tsx` → `<div className="max-w-3xl pt-4 space-y-4">` (เดิม cap `max-w-3xl` อยู่แล้ว — **ยังเหลือ cap นี้**, ไม่ได้แตะ; ถ้าอยากเอาออกด้วย แจ้งได้)

ไม่ได้แก้ EditProduct / EditBundle เลย

---

## บทเรียน (ถ้าจะ revisit อนาคต)

- User taste ชอบ "เนื้อหากระจายเต็มจอ" ไม่ใช่ "centered article style"
- อย่าเสนอ refactor UI ขนาดใหญ่โดยไม่ implement ตัวอย่างเล็กให้ดูก่อน
- Industry standard ไม่ใช่ universal truth — ขึ้นกับ context และ user preference
- ถ้าจะ revisit: ต้องเริ่มจากปัญหาที่ user รู้สึก ไม่ใช่ปัญหาที่ผม assume
