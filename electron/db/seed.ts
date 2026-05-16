import type Database from 'better-sqlite3'
import DRUG_GENERIC_NAMES from './seed-data/drug-generic-names'
import LABEL_FREQUENCIES from './seed-data/label-frequencies'
import LABEL_MEAL_RELATIONS from './seed-data/label-meal-relations'
import LABEL_ADVICES from './seed-data/label-advices'
import LABEL_DOSAGES from './seed-data/label-dosages'
import LABEL_TIMES from './seed-data/label-times'
import PRODUCTS from './seed-data/products'
import CUSTOMERS from './seed-data/customers'

export function seedDatabase(db: Database.Database) {
  // Idempotent staff test user — added to every install so audit trail has a non-admin actor
  // until proper login lands. Keyed by unique email.
  db.prepare(`INSERT OR IGNORE INTO users (name, email, password, role) VALUES (?, ?, ?, ?)`).run(
    'Staff Test', 'staff@syntropic.local', 'staff', 'staff'
  )

  // Label lookups + drug generic names — sourced from docs/*.json via
  // scripts/gen-seed-data.mjs (see electron/db/seed-data/*.ts). Columns are
  // already mapped to our schema by the generator; advices/dosages/times have
  // a `code` synthesized from the source id (the export had none, schema needs
  // it NOT NULL UNIQUE).
  //
  // MUST run BEFORE the "fresh DB" guard below: this block is fully idempotent
  // (INSERT OR IGNORE in a transaction), so it runs on every launch and back-
  // fills existing databases with new/expanded reference data. Putting it after
  // the guard means an already-seeded DB never receives later data additions.
  const seedTuples = (
    sql: string,
    rows: [string, string, string, string, string, number][]
  ) => {
    const stmt = db.prepare(sql)
    db.transaction(() => { for (const r of rows) stmt.run(...r) })()
  }

  seedTuples(`INSERT OR IGNORE INTO label_frequencies (code, name_th, name_en, name_mm, name_zh, sort_order) VALUES (?, ?, ?, ?, ?, ?)`, LABEL_FREQUENCIES)
  seedTuples(`INSERT OR IGNORE INTO label_dosages (code, name_th, name_en, name_mm, name_zh, sort_order) VALUES (?, ?, ?, ?, ?, ?)`, LABEL_DOSAGES)
  seedTuples(`INSERT OR IGNORE INTO label_meal_relations (code, name_th, name_en, name_mm, name_zh, sort_order) VALUES (?, ?, ?, ?, ?, ?)`, LABEL_MEAL_RELATIONS)
  seedTuples(`INSERT OR IGNORE INTO label_times (code, name_th, name_en, name_mm, name_zh, sort_order) VALUES (?, ?, ?, ?, ?, ?)`, LABEL_TIMES)
  seedTuples(`INSERT OR IGNORE INTO label_advices (code, name_th, name_en, name_mm, name_zh, sort_order) VALUES (?, ?, ?, ?, ?, ?)`, LABEL_ADVICES)

  // Drug generic names (~1400). is_disabled defaults 0; all source rows were active.
  const insGeneric = db.prepare(`INSERT OR IGNORE INTO drug_generic_names (name) VALUES (?)`)
  db.transaction(() => { for (const n of DRUG_GENERIC_NAMES) insGeneric.run(n) })()

  // Only seed the rest if tables are empty
  const userCount = (db.prepare(`SELECT COUNT(*) as c FROM users WHERE email = 'admin@syntropic.local'`).get() as { c: number }).c
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

  // Item units — superset of what's referenced by seeded products (32 names from
  // the Hygeia Item export) plus a handful of common ones we want available
  // even on a minimal install. INSERT OR IGNORE = safe to re-run.
  const units = [
    ['เม็ด', 1], ['กล่อง', 1], ['แผง', 1], ['ขวด', 1], ['หลอด', 1], ['ซอง', 1],
    ['ชิ้น', 1], ['อัน', 1], ['ถุง', 1], ['แคปซูล', 1],
    ['ห่อ', 1], ['กระปุก', 1], ['กระป๋อง', 1], ['แพ็ค', 1], ['แพค', 1], ['ม้วน', 1],
    ['ตลับ', 1], ['ก้อน', 1], ['ด้าม', 1], ['ชุด', 1], ['เครื่อง', 1], ['แผ่น', 1],
    ['ใบ', 1], ['ตัว', 1], ['คู่', 1], ['ขีด', 1], ['เมตร', 1], ['เส้น', 1],
    ['ผืน', 1], ['ถ้วย', 1], ['แกลลอน', 1], ['AMP', 1],
  ]
  const insUnit = db.prepare(`INSERT OR IGNORE INTO item_units (name, multiply) VALUES (?, ?)`)
  for (const [name, mul] of units) insUnit.run(name, mul)

  // Drug types — [code, name_th, is_fda9, is_fda10, is_fda11, is_fda13]
  // is_fda9=1 for all (every drug purchase must be logged in ข.ย.9)
  // is_fda10=1 for controlled/psycho/narcotic (ข.ย.10 sale log)
  // is_fda11=0 default even for DANGEROUS — pharmacist sets per-product per regulation
  const drugTypes: [string, string, number, number, number, number][] = [
    ['GENERAL',    'ยาสามัญประจำบ้าน',         1, 0, 0, 0],
    ['OTC',        'ยาบรรจุเสร็จ ข.ย.2',        1, 0, 0, 0],
    ['DANGEROUS',  'ยาอันตราย',                  1, 0, 0, 0],
    ['SPCL_CTRL',  'ยาควบคุมพิเศษ',             1, 1, 0, 0],
    ['PSYCHO_3',   'วัตถุออกฤทธิ์ประเภท 3',     1, 1, 0, 0],
    ['PSYCHO_4',   'วัตถุออกฤทธิ์ประเภท 4',     1, 1, 0, 0],
    ['NARCOTIC_3', 'ยาเสพติดประเภท 3',           1, 1, 0, 0],
  ]
  const insDrugType = db.prepare(`INSERT OR IGNORE INTO drug_types (code, name_th, is_fda9, is_fda10, is_fda11, is_fda13) VALUES (?, ?, ?, ?, ?, ?)`)
  for (const [code, name, fda9, fda10, fda11, fda13] of drugTypes) insDrugType.run(code, name, fda9, fda10, fda11, fda13)

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

  // Default label settings
  db.prepare(`INSERT OR IGNORE INTO label_settings DEFAULT VALUES`).run()

  // General customer (catch-all)
  db.prepare(`INSERT OR IGNORE INTO customers (code, full_name) VALUES (?, ?)`).run('C0000', 'ลูกค้าทั่วไป')

  // Suppliers
  const insSupplier = db.prepare(`INSERT OR IGNORE INTO suppliers (code, name) VALUES (?, ?)`)
  const suppliers = [
    ['S0001', 'VMDRUG'],
    ['S0002', 'DRUG CENTER'],
    ['S0003', 'WELLEKPHARMA'],
    ['S0004', 'FORTE'],
    ['S0005', 'LIKHIT'],
  ]
  for (const [code, name] of suppliers) insSupplier.run(code, name)

  // Products — seeded from Hygeia Item export (docs/Item.xlsx → docs/Item.json
  // → seed-data/products.ts via scripts/gen-seed-data.mjs). Temporary dev seed
  // to test name-matching against real product data; remove the import + this
  // block before compiling a production build.
  //
  // Why inside the fresh-DB guard: products is mutable user data, not reference
  // data. Re-seeding on every launch would clobber edits.
  const unitRows = db.prepare(`SELECT id, name FROM item_units`).all() as { id: number, name: string }[]
  const unitMap = new Map(unitRows.map((r) => [r.name, r.id]))
  const fallbackUnitId = unitMap.get('ชิ้น')!
  const insProduct = db.prepare(`
    INSERT INTO products (
      code, trade_name, name_for_print, search_keywords,
      barcode, barcode2, barcode3, barcode4,
      unit_id, cost_price, price_retail, price_wholesale1, price_wholesale2,
      is_disabled, is_hidden, is_stock_item, has_vat, is_drug,
      tmt_id, note, reorder_point
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `)
  const nz = (v: string) => (v ? v : null)
  db.transaction(() => {
    for (const p of PRODUCTS) {
      const [
        code, trade_name, name_for_print, search_keywords,
        barcode, barcode2, barcode3, barcode4,
        unit_name, cost_price, price_retail, price_wholesale1, price_wholesale2,
        is_disabled, is_hidden, is_stock_item, has_vat, is_drug,
        tmt_id, note, reorder_point,
      ] = p
      insProduct.run(
        nz(code), trade_name, nz(name_for_print), nz(search_keywords),
        nz(barcode), nz(barcode2), nz(barcode3), nz(barcode4),
        unitMap.get(unit_name) ?? fallbackUnitId,
        cost_price, price_retail, price_wholesale1, price_wholesale2,
        is_disabled, is_hidden, is_stock_item, has_vat, is_drug,
        nz(tmt_id), nz(note),
        reorder_point > 0 ? reorder_point : null,
      )
    }
  })()

  // Customers — seeded from Hygeia Person export (docs/Person.xlsx →
  // docs/Person.json → seed-data/customers.ts via scripts/gen-customers.mjs).
  // Temporary dev seed to test against real customer data; remove the import +
  // this block before compiling a production build. Same fresh-DB-guard
  // rationale as products: customers is mutable user data, not reference data.
  // C0000 ('ลูกค้าทั่วไป') is seeded above; these run C0001…
  const insCustomer = db.prepare(
    `INSERT OR IGNORE INTO customers (code, full_name, id_card, phone, address)
     VALUES (?, ?, ?, ?, ?)`,
  )
  const cz = (v: string) => (v ? v : null)
  db.transaction(() => {
    for (const [code, full_name, id_card, phone, address] of CUSTOMERS) {
      insCustomer.run(code, full_name, cz(id_card), cz(phone), cz(address))
    }
  })()
}
