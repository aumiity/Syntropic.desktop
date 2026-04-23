import type Database from 'better-sqlite3'

export function seedDatabase(db: Database.Database) {
  // Only seed if tables are empty
  const userCount = (db.prepare('SELECT COUNT(*) as c FROM users').get() as { c: number }).c
  if (userCount > 0) {
    seedMockProducts(db)
    return
  }

  // Default admin user
  db.prepare(`INSERT INTO users (name, email, password, role) VALUES (?, ?, ?, ?)`).run(
    'Admin', 'admin@syntropic.local', 'admin', 'admin'
  )

  // Default settings
  db.prepare(`INSERT INTO settings (shop_name, shop_address, shop_phone) VALUES (?, ?, ?)`).run(
    'ร้านยา Syntropic', '', ''
  )

  // Product categories
  const categories = [
    ['DRUG', 'ยา', 1],
    ['SUPPLY', 'เวชภัณฑ์', 2],
    ['SUPPLEMENT', 'อาหารเสริม', 3],
    ['HERB', 'สมุนไพร', 4],
    ['CONTRACEPT', 'ยาคุมกำเนิด', 5],
    ['OTHER', 'อื่นๆ', 6],
  ]
  const insCategory = db.prepare(`INSERT OR IGNORE INTO product_categories (code, name, sort_order) VALUES (?, ?, ?)`)
  for (const [code, name, sort] of categories) insCategory.run(code, name, sort)

  // Item units
  const units = [
    ['เม็ด', 1], ['กล่อง', 1], ['แผง', 1], ['ขวด', 1], ['หลอด', 1], ['ซอง', 1],
    ['ชิ้น', 1], ['อัน', 1], ['ถุง', 1], ['แคปซูล', 1],
  ]
  const insUnit = db.prepare(`INSERT OR IGNORE INTO item_units (name, multiply) VALUES (?, ?)`)
  for (const [name, mul] of units) insUnit.run(name, mul)

  // Drug types
  const drugTypes = [
    ['GENERAL', 'ยาสามัญประจำบ้าน', null],
    ['DANGEROUS', 'ยาอันตราย', 'ยอ.'],
    ['SPCL_CTRL', 'ยาควบคุมพิเศษ', 'ยค.'],
    ['PSYCHO_4', 'วัตถุออกฤทธิ์ประเภท 4', 'วอ.4'],
    ['NARCOTIC_3', 'ยาเสพติดประเภท 3', 'นส.3'],
    ['OTC', 'ยาที่ไม่ต้องมีใบสั่งแพทย์', null],
  ]
  const insDrugType = db.prepare(`INSERT OR IGNORE INTO drug_types (code, name_th, khor_yor_report) VALUES (?, ?, ?)`)
  for (const [code, name, report] of drugTypes) insDrugType.run(code, name, report)

  // Dosage forms
  const dosageForms = [
    ['เม็ด', 'Tablet'], ['แคปซูล', 'Capsule'], ['น้ำเชื่อม', 'Syrup'],
    ['น้ำแขวนตะกอน', 'Suspension'], ['ครีม', 'Cream'], ['ขี้ผึ้ง', 'Ointment'],
    ['เจล', 'Gel'], ['โลชั่น', 'Lotion'], ['ยาฉีด', 'Injection'],
    ['ยาพ่น', 'Inhaler'], ['ยาหยอดตา', 'Eye Drop'], ['ยาหยอดหู', 'Ear Drop'],
    ['ยาเหน็บ', 'Suppository'], ['ผง', 'Powder'], ['แผ่น', 'Patch'],
  ]
  const insDosageForm = db.prepare(`INSERT OR IGNORE INTO dosage_forms (name_th, name_en) VALUES (?, ?)`)
  for (const [th, en] of dosageForms) insDosageForm.run(th, en)

  // Label frequencies
  const frequencies = [
    ['OD', 'วันละ 1 ครั้ง', 'Once daily', '', '', 1],
    ['BD', 'วันละ 2 ครั้ง', 'Twice daily', '', '', 2],
    ['TDS', 'วันละ 3 ครั้ง', 'Three times daily', '', '', 3],
    ['QDS', 'วันละ 4 ครั้ง', 'Four times daily', '', '', 4],
    ['Q6H', 'ทุก 6 ชั่วโมง', 'Every 6 hours', '', '', 5],
    ['Q8H', 'ทุก 8 ชั่วโมง', 'Every 8 hours', '', '', 6],
    ['Q12H', 'ทุก 12 ชั่วโมง', 'Every 12 hours', '', '', 7],
    ['PRN', 'เมื่อมีอาการ', 'When required', '', '', 8],
    ['STAT', 'ทันที', 'Immediately', '', '', 9],
    ['HS', 'ก่อนนอน', 'At bedtime', '', '', 10],
    ['AM', 'ตอนเช้า', 'In the morning', '', '', 11],
    ['PM', 'ตอนเย็น', 'In the evening', '', '', 12],
  ]
  const insFreq = db.prepare(`INSERT OR IGNORE INTO label_frequencies (code, name_th, name_en, name_mm, name_zh, sort_order) VALUES (?, ?, ?, ?, ?, ?)`)
  for (const f of frequencies) insFreq.run(...f)

  // Label dosages
  const dosages = [
    ['HALF', '½ เม็ด', '½ tablet', '', '', 1],
    ['ONE', '1 เม็ด', '1 tablet', '', '', 2],
    ['ONE_HALF', '1½ เม็ด', '1½ tablets', '', '', 3],
    ['TWO', '2 เม็ด', '2 tablets', '', '', 4],
    ['THREE', '3 เม็ด', '3 tablets', '', '', 5],
    ['FOUR', '4 เม็ด', '4 tablets', '', '', 6],
    ['5ML', '5 มล.', '5 ml', '', '', 7],
    ['10ML', '10 มล.', '10 ml', '', '', 8],
    ['15ML', '15 มล.', '15 ml', '', '', 9],
    ['1PUFF', '1 พ่น', '1 puff', '', '', 10],
    ['2PUFFS', '2 พ่น', '2 puffs', '', '', 11],
    ['APPLY', 'ทาบางๆ', 'Apply thinly', '', '', 12],
  ]
  const insDosage = db.prepare(`INSERT OR IGNORE INTO label_dosages (code, name_th, name_en, name_mm, name_zh, sort_order) VALUES (?, ?, ?, ?, ?, ?)`)
  for (const d of dosages) insDosage.run(...d)

  // Label meal relations
  const mealRelations = [
    ['BEFORE', 'ก่อนอาหาร', 'Before meal', '', '', 1],
    ['AFTER', 'หลังอาหาร', 'After meal', '', '', 2],
    ['WITH', 'พร้อมอาหาร', 'With meal', '', '', 3],
    ['BETWEEN', 'ระหว่างมื้ออาหาร', 'Between meals', '', '', 4],
    ['EMPTY', 'ขณะท้องว่าง', 'On empty stomach', '', '', 5],
    ['ANY', 'เมื่อใดก็ได้', 'Anytime', '', '', 6],
  ]
  const insMeal = db.prepare(`INSERT OR IGNORE INTO label_meal_relations (code, name_th, name_en, name_mm, name_zh, sort_order) VALUES (?, ?, ?, ?, ?, ?)`)
  for (const m of mealRelations) insMeal.run(...m)

  // Label advices
  const advices = [
    ['NO_DRIVE', 'ห้ามขับรถ', 'Do not drive', '', '', 1],
    ['NO_ALCOHOL', 'ห้ามดื่มแอลกอฮอล์', 'No alcohol', '', '', 2],
    ['PLENTY_WATER', 'ดื่มน้ำมากๆ', 'Drink plenty of water', '', '', 3],
    ['FULL_COURSE', 'รับประทานให้ครบ', 'Complete full course', '', '', 4],
    ['REFRIGERATE', 'เก็บในตู้เย็น', 'Keep refrigerated', '', '', 5],
    ['SHAKE_WELL', 'เขย่าก่อนใช้', 'Shake well before use', '', '', 6],
    ['EXTERNAL_ONLY', 'ใช้ภายนอกเท่านั้น', 'External use only', '', '', 7],
    ['KEEP_DARK', 'เก็บในที่มืด', 'Keep away from light', '', '', 8],
  ]
  const insAdvice = db.prepare(`INSERT OR IGNORE INTO label_advices (code, name_th, name_en, name_mm, name_zh, sort_order) VALUES (?, ?, ?, ?, ?, ?)`)
  for (const a of advices) insAdvice.run(...a)

  // Default label settings
  db.prepare(`INSERT OR IGNORE INTO label_settings DEFAULT VALUES`).run()

  // General customer (catch-all)
  db.prepare(`INSERT OR IGNORE INTO customers (code, full_name) VALUES (?, ?)`).run('C0000', 'ลูกค้าทั่วไป')

  seedMockProducts(db)
}

function seedMockProducts(db: Database.Database) {
  const productCount = (db.prepare('SELECT COUNT(*) as c FROM products').get() as { c: number }).c
  if (productCount > 0) return

  const getCatId = (code: string) =>
    (db.prepare('SELECT id FROM product_categories WHERE code = ?').get(code) as { id: number })?.id
  const getDosageId = (nameEn: string) =>
    (db.prepare('SELECT id FROM dosage_forms WHERE name_en = ?').get(nameEn) as { id: number })?.id
  const getDrugTypeId = (code: string) =>
    (db.prepare('SELECT id FROM drug_types WHERE code = ?').get(code) as { id: number })?.id
  const getUnitId = (name: string) =>
    (db.prepare('SELECT id FROM item_units WHERE name = ?').get(name) as { id: number })?.id

  const catDrug = getCatId('DRUG')
  const catSupply = getCatId('SUPPLY')
  const catSupplement = getCatId('SUPPLEMENT')
  const catHerb = getCatId('HERB')
  const catContracept = getCatId('CONTRACEPT')

  const dfTablet = getDosageId('Tablet')
  const dfCapsule = getDosageId('Capsule')
  const dfSyrup = getDosageId('Syrup')
  const dfCream = getDosageId('Cream')
  const dfOintment = getDosageId('Ointment')
  const dfGel = getDosageId('Gel')
  const dfLotion = getDosageId('Lotion')
  const dfSuspension = getDosageId('Suspension')
  const dfInhaler = getDosageId('Inhaler')
  const dfEyeDrop = getDosageId('Eye Drop')
  const dfPowder = getDosageId('Powder')

  const dtGeneral = getDrugTypeId('GENERAL')
  const dtDangerous = getDrugTypeId('DANGEROUS')
  const dtOTC = getDrugTypeId('OTC')

  const unitTablet = getUnitId('เม็ด')
  const unitBox = getUnitId('กล่อง')
  const unitBottle = getUnitId('ขวด')
  const unitTube = getUnitId('หลอด')
  const unitSachet = getUnitId('ซอง')
  const unitCapsule = getUnitId('แคปซูล')
  const unitPiece = getUnitId('ชิ้น')

  const insProduct = db.prepare(`
    INSERT INTO products (
      barcode, trade_name, name_for_print, category_id, dosage_form_id, unit_id,
      price_retail, price_wholesale1, cost_price,
      drug_type_id, strength, is_stock_item, search_keywords
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)
  `)

  const insLot = db.prepare(`
    INSERT INTO product_lots (
      product_id, lot_number, expiry_date, cost_price, sell_price,
      qty_received, qty_on_hand, invoice_no, payment_type
    ) VALUES (?, ?, ?, ?, ?, ?, ?, 'GR-20260101-001', 'cash')
  `)

  const products: [string, string, string, number|null, number|null, number|null, number, number, number, number|null, string|null, string|null][] = [
    // [barcode, trade_name, name_for_print, cat, dosageForm, unit, retail, ws1, cost, drugType, strength, keywords]
    ['8850001001', 'พาราเซตามอล 500 มก.', 'Paracetamol 500mg', catDrug, dfTablet, unitTablet, 5, 3.5, 2, dtGeneral, '500 mg', 'para,tylenol,ไทลีนอล'],
    ['8850001002', 'ไอบูโพรเฟน 400 มก.', 'Ibuprofen 400mg', catDrug, dfTablet, unitTablet, 8, 6, 4, dtDangerous, '400 mg', 'ibu,brufen'],
    ['8850001003', 'อะม็อกซิซิลลิน 500 มก.', 'Amoxicillin 500mg', catDrug, dfCapsule, unitCapsule, 12, 9, 6, dtDangerous, '500 mg', 'amox,amoxil'],
    ['8850001004', 'ลอราทาดีน 10 มก.', 'Loratadine 10mg', catDrug, dfTablet, unitTablet, 10, 7.5, 5, dtOTC, '10 mg', 'claritin,คลาริติน,antihistamine'],
    ['8850001005', 'ออมีพราโซล 20 มก.', 'Omeprazole 20mg', catDrug, dfCapsule, unitCapsule, 15, 11, 7, dtDangerous, '20 mg', 'losec,โลเซค,กรดไหลย้อน'],
    ['8850001006', 'เมทโฟร์มิน 500 มก.', 'Metformin 500mg', catDrug, dfTablet, unitTablet, 6, 4.5, 3, dtDangerous, '500 mg', 'glucophage,กลูโคเฟจ,เบาหวาน'],
    ['8850001007', 'แอมโลดิปีน 5 มก.', 'Amlodipine 5mg', catDrug, dfTablet, unitTablet, 8, 6, 4, dtDangerous, '5 mg', 'norvasc,ความดัน'],
    ['8850001008', 'ซิมวาสแตติน 20 มก.', 'Simvastatin 20mg', catDrug, dfTablet, unitTablet, 12, 9, 6, dtDangerous, '20 mg', 'zocor,ไขมัน,cholesterol'],
    ['8850001009', 'ไดเฟนไฮดรามีน 25 มก.', 'Diphenhydramine 25mg', catDrug, dfTablet, unitTablet, 5, 3.5, 2.5, dtGeneral, '25 mg', 'benadryl,แก้แพ้,นอนหลับ'],
    ['8850001010', 'ไฮดรอกซีซีน 10 มก.', 'Hydroxyzine 10mg', catDrug, dfTablet, unitTablet, 7, 5, 3.5, dtDangerous, '10 mg', 'atarax,คัน,แพ้'],
    ['8850001011', 'ยาน้ำแก้ไอ Robitussin', 'Robitussin Cough Syrup', catDrug, dfSyrup, unitBottle, 89, 65, 45, dtOTC, null, 'cough,ไอ,expectorant'],
    ['8850001012', 'ยาน้ำธาตุน้ำแดง', 'Antacid Suspension', catDrug, dfSuspension, unitBottle, 35, 25, 18, dtGeneral, null, 'กรด,ท้องเฟ้อ,antacid'],
    ['8850001013', 'โคลไตรมาโซล ครีม 1%', 'Clotrimazole Cream 1%', catDrug, dfCream, unitTube, 45, 33, 22, dtOTC, '1%', 'fungal,เชื้อรา,canesten'],
    ['8850001014', 'เบตาเมทาโซน ครีม 0.1%', 'Betamethasone Cream 0.1%', catDrug, dfCream, unitTube, 38, 28, 18, dtDangerous, '0.1%', 'steroid,แก้อักเสบ,คัน'],
    ['8850001015', 'มิวพิโรซิน ขี้ผึ้ง 2%', 'Mupirocin Ointment 2%', catDrug, dfOintment, unitTube, 95, 70, 50, dtDangerous, '2%', 'bactroban,แผลติดเชื้อ'],
    ['8850001016', 'ไดโคลฟีแนค เจล 1%', 'Diclofenac Gel 1%', catDrug, dfGel, unitTube, 75, 55, 38, dtOTC, '1%', 'voltaren,ปวดกล้ามเนื้อ,ข้อ'],
    ['8850001017', 'ยาตาน้ำเกลือ 0.9%', 'Normal Saline Eye Drop', catDrug, dfEyeDrop, unitBottle, 25, 18, 12, dtGeneral, '0.9%', 'ตา,น้ำตาเทียม,saline'],
    ['8850001018', 'คาลาไมน์ โลชั่น', 'Calamine Lotion', catDrug, dfLotion, unitBottle, 55, 40, 28, dtGeneral, null, 'ผด,ผื่น,คัน,calamine'],
    ['8850001019', 'ORS ผงน้ำตาลเกลือแร่ส้ม', 'ORS Orange Sachet', catDrug, dfPowder, unitSachet, 5, 3.5, 2, dtGeneral, null, 'เกลือแร่,ท้องเสีย,ors'],
    ['8850001020', 'ซาลบิวทามอล ยาพ่น 100mcg', 'Salbutamol Inhaler 100mcg', catDrug, dfInhaler, unitPiece, 185, 140, 100, dtDangerous, '100 mcg', 'ventolin,หืด,asthma,พ่น'],
    ['8850001021', 'วิตามินซี 1000 มก. ฟู่', 'Vitamin C 1000mg Effervescent', catSupplement, dfTablet, unitBox, 120, 90, 65, null, '1000 mg', 'vit c,ascorbic,ภูมิคุ้มกัน'],
    ['8850001022', 'วิตามินรวม เด็ก', 'Children Multivitamin', catSupplement, dfTablet, unitBox, 180, 135, 95, null, null, 'multivit,เด็ก,children'],
    ['8850001023', 'แคลเซียม 600 + D3', 'Calcium 600mg + D3', catSupplement, dfTablet, unitBox, 220, 165, 120, null, '600 mg', 'calcium,กระดูก,bone'],
    ['8850001024', 'ฟ้าทะลายโจร 500 มก.', 'Andrographis 500mg', catHerb, dfCapsule, unitBox, 95, 70, 50, null, '500 mg', 'andrographis,ฟ้าทะลาย,ไข้หวัด'],
    ['8850001025', 'ขมิ้นชัน 300 มก.', 'Turmeric 300mg', catHerb, dfCapsule, unitBox, 85, 62, 42, null, '300 mg', 'turmeric,curcumin,ขมิ้น'],
    ['8850001026', 'ยาคุมกำเนิด Diane-35', 'Diane-35', catContracept, dfTablet, unitBox, 280, 210, 160, dtDangerous, null, 'diane,คุมกำเนิด,contraceptive'],
    ['8850001027', 'ถุงยางอนามัย Durex 3s', 'Durex Classic 3s', catSupply, null, unitBox, 65, 48, 35, null, null, 'condom,ถุงยาง,durex'],
    ['8850001028', 'แอลกอฮอล์ 70% 450 มล.', 'Alcohol 70% 450ml', catSupply, null, unitBottle, 45, 33, 22, null, '70%', 'แอลกอฮอล์,ล้างแผล,alcohol'],
    ['8850001029', 'ผ้าก๊อซ 4x4 นิ้ว (100 ชิ้น)', 'Gauze 4x4 inch 100pcs', catSupply, null, unitBox, 120, 90, 65, null, null, 'ก๊อซ,ผ้าพันแผล,gauze'],
    ['8850001030', 'เทอร์โมมิเตอร์ดิจิตัล', 'Digital Thermometer', catSupply, null, unitPiece, 350, 260, 190, null, null, 'thermometer,วัดไข้,ดิจิตัล'],
  ]

  const today = new Date()
  const expiry = new Date(today)
  expiry.setFullYear(expiry.getFullYear() + 2)
  const expiryStr = expiry.toISOString().slice(0, 10)

  for (const [i, p] of products.entries()) {
    const [barcode, trade_name, name_for_print, category_id, dosage_form_id, unit_id,
           price_retail, price_wholesale1, cost_price, drug_type_id, strength, keywords] = p

    const result = insProduct.run(
      barcode, trade_name, name_for_print, category_id ?? null, dosage_form_id ?? null,
      unit_id ?? null, price_retail, price_wholesale1, cost_price,
      drug_type_id ?? null, strength, keywords
    )
    const productId = result.lastInsertRowid

    const lotNo = `LOT-MOCK-${String(i + 1).padStart(3, '0')}`
    const qty = 100 + (i * 13) % 400
    insLot.run(productId, lotNo, expiryStr, cost_price, price_retail, qty, qty)
  }
}
