---
name: date-input-validation-contract
description: สัญญาการ validate ของ DateInput — invalid คืน '', เตือนกรอบแดง (รวมตอน blur), required เช็ค !value เองที่ parent
metadata:
  type: feedback
---

**2026-06-16** — `src/components/ui/date-input.tsx` มีสัญญา validate 3 ชั้น ห้ามถอยกลับ (codified เป็นกฏ #12 ใน `docs/claude/ui-theming.md`):

1. **`onChange` คืน ISO เมื่อ valid เท่านั้น; อย่างอื่น (พิมพ์ค้าง / ครบ 10 ตัวแต่ไม่ใช่วันจริงเช่น `99/99/9999` / ว่าง) คืน `''`.** ค่าที่ commit มีแค่ "ISO ถูกต้อง" หรือ "ว่าง" → ค่ามั่วไม่ไหลลง DB. (เดิมคืนเฉพาะตอนว่าง → เลขมั่วทิ้ง parent ไว้ที่ค่า default/ค่าเก่า แล้วผ่าน submit เงียบ ๆ)
2. **กรอบแดง** (`aria-invalid` → `border-destructive` ใน `input.tsx:31`) โชว์เมื่อ: `rawInvalid` (มีข้อความค้าง && ไม่ใช่วันสมบูรณ์) && (**ไม่ได้ focus อยู่** ‖ ครบ 10 ตัว). อิง state `focused` (onFocus/onBlur) — **ไม่ใช่** flag `blurred` ที่ reset ทุกคีย์ (เคยเป็นบั๊ก: พิมพ์ตกตัวแล้วกดบันทึกเร็ว ๆ กรอบแดงไม่ขึ้น). caller's onFocus/onBlur merge ต่อผ่าน `?.(e)`. **ห้ามใส่ข้อความ error ใต้ช่อง** — ดัน layout field สูงคงที่ ทำ UI เสีย ใช้กรอบแดงอย่างเดียว (ผู้ใช้ขอเอง).
3. **invalid = `''` ⇒ ช่อง required ต้องเช็ค `!value` เองที่ parent ตอน submit** (DateInput ไม่ block submit ให้ — ปุ่มบันทึกอยู่ในแต่ละฟอร์ม ไม่มีคอขวดกลาง).

**2026-06-16 (update) — กรณีลืมกรอกต้องมีกรอบแดง + toast ระบุชื่อช่อง:** ข้อความรวม `'รูปแบบวันที่ไม่ถูกต้อง'` แบบเดิม + กรอบแดงในตัว **ไม่พอ** เพราะ `rawInvalid` ต้องมี text ก่อน → ช่องว่าง (ลืมกรอก) ไม่มีกรอบแดงเลย ผู้ใช้ต้องไล่หาช่องเอง (ผู้ใช้ร้องเรียน). แก้: เพิ่ม prop **`error?: boolean`** ใน `date-input.tsx` (`invalid = (rawInvalid && …) || !!error`) ให้ parent บังคับกรอบแดงได้, parent ล้างตอน `onChange`. ฟอร์มเก็บ flag ทุกช่องที่ขาด → ติดกรอบแดง **ทุกช่อง**พร้อมกัน + toast ระบุชื่อช่อง `กรุณาระบุ<ชื่อช่อง · …>ให้ถูกต้อง`. ref: `Purchase/index.tsx` (`dateErrors` state, ช่อง order/receive/due/paid). ยังคงกรอบแดงอย่างเดียว ไม่มีข้อความใต้ช่อง. (จอแก้ไข `Manage/Purchases` ยังใช้แบบรวมเดิม — apply pattern เดียวกันถ้าผู้ใช้เจอปัญหาซ้ำ)

**Why:** ผู้ใช้พบว่ากรอกเลขมั่วในช่องวันที่แล้ว "ผ่าน" — เพราะ primitive validate แค่สายตา แต่ไม่ส่ง invalid state ให้ parent. การพิมพ์ตกตัวในช่อง optional ทำให้วันหมดอายุหายเงียบ (กระทบ FEFO).

**How to apply:** แตะ DateInput/ฟอร์มวันที่ → คงสัญญา 3 ข้อ. ช่องใหม่ที่ required → เพิ่ม `if (!value) { toast(...); return }` ตอน submit. ช่อง optional (สินค้าไม่มี exp, `manufactured_date`, `dob`, `paidDate` ตอนยังไม่ชำระ) จงใจไม่เช็ค. เส้นแบ่ง = "ธุรกิจอนุญาตให้เว้นว่างไหม" ไม่ใช่ "เป็นช่องวันที่ไหม".

**สถานะ required ปัจจุบัน (audit 2026-06-16):** บังคับ = `expense_date`, `effectiveDate`(VAT), `vatDate`, GR `orderDate`/`receiveDate`, `dueDate`(เครดิต), `paidDate`(เมื่อติ๊กชำระ) ทั้งจอสร้าง `Purchase/index` + แก้ไข `Manage/Purchases`, `AddProductWizard.expiry_date` (gate ผ่าน `stepValid`), `AdjustStockDialog.newLotExpiry`(ล็อตใหม่), `PurchaseIntake.r.expiry`. เว้นว่างได้ = `LotsTab.expiry_date`(ตั้งใจมาแก้), `manufactured_date` ทุกที่, `dob`.

เกี่ยวข้อง: [[feedback_read_doc_before_ui_edit]] · กฏ display วันที่ = `DD/MM/YYYY` ผ่าน `formatDate()` (กฏ #11 ui-theming.md).
