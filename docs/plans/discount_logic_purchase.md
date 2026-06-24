อ่าน CLAUDE.md, PRODUCT.md, docs/claude/business-logic.md, docs/claude/database.md
  และถ้ามีการแตะ UI ให้อ่าน DESIGN.md, docs/claude/ui-theming.md, docs/claude/ui-
  components.md, docs/claude/ui-table-card.md ก่อนแก้

  เป้าหมาย: ปรับ UX/logic ส่วนลดใน src/pages/Purchase/index.tsx ให้แยก “ส่วนลดสินค้า” และ
  “ส่วนลดท้ายบิล” ชัดเจน

  บริบทปัจจุบัน:
  - แถวสินค้าใช้ row.discount = ส่วนลดรายตัว/ส่วนลดสินค้า
  - แถวสินค้าใช้ row.bill_discount = ส่วนลดท้ายบิลที่ถูกกระจายลงแถว
  - row.total คือยอดสุทธิของแถวหลังหักทั้งสองก้อน
  - modal ส่วนลดรายตัวควรแก้เฉพาะ row.discount
  - modal ส่วนลดท้ายบิลควรแก้เฉพาะ row.bill_discount
  - ห้ามทำให้การเปิด modal แล้วกดตกลงค่าเดิม ทำให้ส่วนลดอีกก้อนหาย
  - ตอนบันทึก ต้นทุนจริงยังควรมาจาก row.total / qty เหมือนเดิม
  - purchase_receipts.discount_amount ควรเก็บ “รวมส่วนลดทั้งหมด” = ส่วนลดสินค้า + ส่วนลดท้ายบิล

  สิ่งที่ต้องแก้:
  1. ใน footer summary ด้านล่างของตาราง Purchase ให้แยกบรรทัดส่วนลดเป็น:
     - ราคารวมก่อนลด
     - ส่วนลดสินค้า
     - ส่วนลดท้ายบิล
     - รวมส่วนลด
     - มูลค่ารวมทั้งหมด
     โดย:
     - ส่วนลดสินค้า = sum(parseFloat(row.discount) || 0)
     - ส่วนลดท้ายบิล = sum(parseFloat(row.bill_discount ?? '0') || 0)
     - รวมส่วนลด = สองก้อนรวมกัน
     - แสดงเฉพาะบรรทัดส่วนลดที่มีค่า > 0 แต่ถ้ามีทั้งสองก้อน ให้แสดงทั้งสองก้อนและรวมส่วนลด

  2. คอลัมน์ตารางควรสื่อว่าเป็น “ส่วนลดรวม” ของแถวนั้น หรือถ้าจะคงคำว่า “ส่วนลด” ต้องมี tooltip ชัดเจน:
     - สินค้า X · ท้ายบิล Y
     - ตัวเลขในคอลัมน์ = row.discount + row.bill_discount

  3. modal ส่วนลดรายตัว:
     - เมื่อเปิดจากคอลัมน์แถว ให้ initialDiscount เป็นเฉพาะ row.discount ไม่ใช่รวม bill_discount
     - กดตกลงต้องแก้เฉพาะ row.discount
     - ห้ามล้าง row.bill_discount โดยไม่จำเป็น
     - หลังเปลี่ยน row.discount ต้องคำนวณ row.total ใหม่เป็น:
       qty * cost_price - row.discount - row.bill_discount
     - ถ้าส่วนลดรวมของแถวเกิน gross ของแถว ให้ cap หรือ toast error อย่างเหมาะสม

  4. modal ส่วนลดท้ายบิล:
     - แสดง/แก้เฉพาะยอดรวม row.bill_discount ทั้งบิล
     - เปิด modal ให้ seed จาก sum(row.bill_discount) ปัจจุบัน ไม่ใช่ค่าจำ stale
     - กดตกลงต้องกระจายเฉพาะ bill_discount ใหม่ตามสัดส่วนฐานก่อนหักท้ายบิล
     - ไม่แตะ row.discount
     - ไม่ทำให้ส่วนลดรายตัวหาย

  5. การคำนวณฐานส่วนลดท้ายบิล:
     - ฐานกระจายของแต่ละแถวควรเป็นยอดหลังหักส่วนลดสินค้า แต่ก่อนหักส่วนลดท้ายบิล:
       base = qty * cost_price - row.discount
     - หรือถ้าต้อง reconstruct จาก state ปัจจุบัน ให้ใช้:
       base = row.total + row.bill_discount
     - ต้องกันการ stack ซ้ำเมื่อเปิด modal แล้วกดตกลงค่าเดิม

  6. ตอน save:
     - discount_amount ต้องส่งเป็นรวมส่วนลดทั้งหมด ไม่ใช่เฉพาะท้ายบิล
     - items.cost_price ยังต้องส่งเป็น row.total / qty เพื่อให้ต้นทุนจริงหลังส่วนลดถูกบันทึกเหมือนเดิม

  7. ตรวจสอบด้วย scenario นี้:
     - สินค้า 1 แถว gross 100
     - ใส่ส่วนลดสินค้า 5 → แถวเหลือ 95
     - ใส่ส่วนลดท้ายบิล 10 → แถวเหลือ 85
     - footer ต้องแสดง:
       ราคารวมก่อนลด 100
       ส่วนลดสินค้า -5
       ส่วนลดท้ายบิล -10
       รวมส่วนลด -15
       มูลค่ารวมทั้งหมด 85
     - เปิด modal ส่วนลดสินค้าแล้วกดตกลงโดยไม่แก้ ต้องยังเหลือ 85 และ footer ยังเป็น 5/10/15
     - เปิด modal ส่วนลดท้ายบิลแล้วกดตกลงโดยไม่แก้ ต้องยังเหลือ 85 และ footer ยังเป็น 5/10/15

  ข้อกำหนด:
  - ใช้ semantic color tokens เท่านั้น
  - ใช้ ui primitives เดิม
  - อย่าแตะ unrelated files
  - อย่า revert user changes
  - รัน verification ที่เหมาะสม เช่น npx vite build หรือ script ที่ repo มี