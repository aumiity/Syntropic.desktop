ปรับ Template การพิมพ์เอกสาร A4 สำหรับ ใบกำกับภาษี
ปรับโครงสร้างสีสำหรับ DARK MODE ใหม่ทั้งหมด



สรุปสิ่งที่ทำ
ไฟล์ใหม่ — AddProductWizard.tsx

Wizard แบบ Timeline แนวตั้ง 4 step (เลือกสินค้า+หน่วย → Lot/วันหมดอายุ → จำนวน/ต้นทุน → ราคาขาย/กำไร+ยืนยัน)
คืนค่า ReceiptRow กลับให้หน้า Purchase, รองรับทั้งโหมด เพิ่ม และ แก้ไข
ล็อกความสูง h-[600px] ตาม invariant, Enter = ถัดไป/ยืนยัน, Esc = ปิด, คลิกหมายเลข step กระโดดได้
มี hint FEFO, คำนวณต้นทุน/รวมแบบ live, การ์ดสรุปก่อนยืนยัน
ย้าย type ReceiptRow/ProductUnitOption/emptyRow มาไว้ที่นี่แล้ว export (กันนิยามซ้ำ + circular import)
แก้ไข — index.tsx

ตารางเป็น read-only — คลิกแถวหรือปุ่มดินสอ = เปิด wizard แก้ไข, ปุ่มถังขยะ = ลบ
ปุ่ม "เพิ่มสินค้า" (CTA หลัก) เปิด wizard, เอา "เพิ่มแถว" + popover toggle ออก
ตารางเริ่มว่าง + มี empty state พร้อมปุ่มเพิ่ม
เก็บไว้ครบ: paste import, ปรับยอดท้ายบิล, sidebar/payment/VAT, และ handleSave (logic FEFO/lot/payload ไม่แตะเลย)
Backup: index.rowmode.bak.tsx

2 เรื่องที่หนูอยากเรียนให้พี่ทราบตรง ๆ
ราคาขายใน wizard (v1) ตั้งแค่ราคาของบิลรับนี้ — หนู ตัด การ push ราคาใหม่เข้า product master (ผ่าน products.updatePrice + manager override + ประวัติราคา) ที่ price modal เดิมทำ ออกไปก่อน เพื่อเลี่ยง modal ซ้อน modal ถ้าพี่อยากได้คืน บอกได้ หนูใส่ useManagerOverride ตอนยืนยันให้ได้ค่ะ
โค้ดเก่ายังค้างแบบ dead (ไม่ถูกเรียก, ไม่พัง): unit-picker modal + price modal + helper เดิม ยังอยู่ใน index.tsx รอลบทีหลังเมื่อพี่มั่นใจว่า wizard ใช้งานได้จริง
อยากให้หนูเปิดแอป (npm run electron:dev) ทดสอบจริงให้เลยไหมคะ หรือพี่จะลองเองก่อน แล้วบอกหนูว่าจะจูนตรงไหน — โดยเฉพาะเรื่องราคาขาย v1 ว่าจะเอาแบบไหนค่ะ


 ทำเสร็จแล้ว — tsc ผ่านสะอาดทั้ง renderer + electron

  Backend
  - electron/db/schema.ts — ตาราง label_presets ใหม่
  - electron/db/schema.ts — ตาราง label_presets ใหม่
  - electron/ipc/settings.ts — map LOOKUP_KINDS + 7 handler (generic คุม 5 ตาราง, allow-list ตาม
  kind เท่านั้น)
  - electron/preload.ts + preload.d.ts — 7 method
  - electron/db/seed.ts — seed preset ตั้งต้น 1x1..1hs (idempotent)

  Frontend
  - src/types/index.ts — LabelPreset
  - src/components/label/LabelFormDialog.tsx — chip preset แทนปุ่มลัดเดิม + restrict mode
  - src/components/dialogs/LabelPresetDialog.tsx — ใหม่ (สร้าง/แก้ preset, มี restrict mode)
  - src/components/dialogs/LookupDeleteDialog.tsx — ใหม่ ("จัดการฉลาก" โชว์ผลกระทบ + แก้รายตัว/ทั้งหมด +
  ลบ)
  - src/pages/Settings/LabelLookupTab.tsx + LabelPresetTab.tsx — ใหม่ (2 แท็บ)
  - src/pages/Settings/ProductMgmtTab.tsx — wire 2 แท็บ (วิธีใช้ยา / preset วิธีใช้)

  บั๊กที่เจอ-แก้ระหว่างทาง: comment ใน schema เผลอใส่ backtick รอบ code → ปิด template literal (TS1005)
  แก้แล้ว · preset row ใน impact dialog ต้องโหลด full row ก่อนแก้ (กัน save partial ลบ field อื่นทิ้ง) —
  กันไว้แล้ว

  เหลือ: ทดสอบในแอปจริง

  ขั้นนี้ต้อง restart Electron ให้ main โหลดใหม่ (schema/settings/seed เป็น main process — vite
  hot-reload ไม่หยิบให้ เหมือนเคส VAT เมื่อกี้) แล้วลองที่ ตั้งค่า > หมวดหมู่และประเภท > วิธีใช้ยา / preset วิธีใช้:
  - เพิ่ม/แก้ lookup, ลบตัวที่ไม่มีใครใช้, ลบตัวที่ถูกใช้ → ดู dialog ผลกระทบ → แก้รายตัว/ย้ายทั้งหมด → ลบ
  - สร้าง preset แล้วเปิดฟอร์มฉลาก (หน้าสินค้า/POS) กด chip preset ดูว่าเซ็ต 5 ช่อง + ชื่อครบ