ปรับ Template การพิมพ์เอกสาร A4 สำหรับ ใบกำกับภาษี
ปุ่ม ซ่อนรายละเอียดหน้า Payment Dialog มีการขยับ เมื่ออยู่ใน stage +VAT น่าจะเกี่ยวกับกล่อง รับเงิน/เงินทอน มีการยืดความสูง
เพิ่ม HOTKEY สำหรับ เปิดปิด VAT หน้า Payment Dialog (F1)
SuccessDialog เมื่อบันทึกบิลสำเร็จ ไม่ต้องมีปุ่มพิมพ์ใบเสร็จแล้ว เพราะเราพิมพ์หน้า Payment ไปแล้่ว 
ย้าย badege ค่าเริ่มต้นในหน้า src/pages/Products/EditProduct/index.tsx ไปไว้ชิดขวา
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