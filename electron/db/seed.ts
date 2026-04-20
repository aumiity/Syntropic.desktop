import type Database from 'better-sqlite3'

export function seedDatabase(db: Database.Database) {
  // Only seed if tables are empty
  const userCount = (db.prepare('SELECT COUNT(*) as c FROM users').get() as { c: number }).c
  if (userCount > 0) return

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
}
