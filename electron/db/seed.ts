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
  // username MUST be set: a UNIQUE index on users(username) exists after the
  // migration, so two seed rows with the default '' would collide.
  db.prepare(`INSERT OR IGNORE INTO users (name, first_name, username, email, password, role) VALUES (?, ?, ?, ?, ?, ?)`).run(
    'Staff Test', 'Staff Test', 'STAFF', 'staff@syntropic.local', 'staff', 'staff'
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

  // Starter usage presets — idempotent (keyed on the stable SEED_* code), so this
  // back-fills existing DBs too. Lookup ids are resolved from the lookup CODES
  // seeded just above (a NULL @x_code subquery yields NULL → that FK stays empty).
  // These mirror the old hardcoded 1x1..1hs shortcuts but now set REAL usage
  // fields; the owner can edit/delete them freely afterwards.
  const insPreset = db.prepare(`
    INSERT OR IGNORE INTO label_presets (code, name, dosage_id, frequency_id, timing_id, label_time_id, advice_id, sort_order)
    VALUES (@code, @name,
      (SELECT id FROM label_dosages        WHERE code=@dosage_code),
      (SELECT id FROM label_frequencies    WHERE code=@frequency_code),
      (SELECT id FROM label_meal_relations WHERE code=@meal_code),
      (SELECT id FROM label_times          WHERE code=@time_code),
      NULL, @sort)`)
  const STARTER_PRESETS = [
    { code: 'SEED_1x1', name: '1x1', dosage_code: '0003', frequency_code: '01', meal_code: null, time_code: null, sort: 1 },
    { code: 'SEED_1x2', name: '1x2', dosage_code: '0003', frequency_code: '02', meal_code: null, time_code: null, sort: 2 },
    { code: 'SEED_1x3', name: '1x3', dosage_code: '0003', frequency_code: '03', meal_code: null, time_code: null, sort: 3 },
    { code: 'SEED_1x4', name: '1x4', dosage_code: '0003', frequency_code: '04', meal_code: null, time_code: null, sort: 4 },
    { code: 'SEED_1pc', name: '1pc', dosage_code: '0003', frequency_code: null, meal_code: '02', time_code: null, sort: 5 },
    { code: 'SEED_1hs', name: '1hs', dosage_code: '0003', frequency_code: null, meal_code: null, time_code: '0005', sort: 6 },
  ]
  db.transaction(() => { for (const p of STARTER_PRESETS) insPreset.run(p) })()

  // Only seed the rest if tables are empty
  const userCount = (db.prepare(`SELECT COUNT(*) as c FROM users WHERE email = 'admin@syntropic.local'`).get() as { c: number }).c
  if (userCount > 0) return

  // Default admin user
  db.prepare(`INSERT INTO users (name, first_name, username, email, password, role) VALUES (?, ?, ?, ?, ?, ?)`).run(
    'ผู้ดูแลระบบ', 'ผู้ดูแลระบบ', 'ADMIN', 'admin@syntropic.local', 'admin', 'admin'
  )

  // Default settings — blank shop identity on purpose: setup_completed defaults
  // to 0, so the first-run setup wizard fires and forces the operator to enter a
  // real shop name/address/phone (a pre-filled placeholder name would let them
  // click straight past the required-field validation).
  db.prepare(`INSERT INTO settings (shop_name, shop_address, shop_phone) VALUES (?, ?, ?)`).run(
    '', '', ''
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

  // Expense categories — seeded once (only when the table is empty) so an
  // operator who renames/removes them doesn't get them re-added on restart.
  const expCount = db.prepare(`SELECT COUNT(*) AS c FROM expense_categories`).get() as { c: number }
  if (expCount.c === 0) {
    const insExp = db.prepare(`INSERT INTO expense_categories (name, sort_order) VALUES (?, ?)`)
    ;['ค่าเช่า', 'ค่าน้ำ', 'ค่าไฟ', 'เงินเดือน/ค่าแรง', 'ค่าการตลาด', 'ค่าขนส่ง', 'ค่าอุปกรณ์', 'ภาษี/ค่าธรรมเนียม', 'อื่นๆ']
      .forEach((name, i) => insExp.run(name, i + 1))
  }

  // Item units — superset of what's referenced by seeded products (32 names from
  // the Hygeia Item export) plus a handful of common ones we want available
  // even on a minimal install. INSERT OR IGNORE = safe to re-run.
  const units = [
      'กระปุก', 'กระป๋อง', 'กล่อง', 'ก้อน', 'ขวด', 'ชุด', 
      'ซอง', 'ตลับ', 'ชิ้น', 'ม้วน', 'ยูนิต', 'ลัง', 'หลอด', 
     'ห่อ', 'อัน', 'แกลลอน', 'แคปซูล', 'แผง', 'แพ็ค', 
      'แพ็คสิบ', 'แพ็คหก', 'แพ็คโหล', 'เม็ด', 'แอมป์', 'เครื่อง'
  ]
  const insUnit = db.prepare(`INSERT OR IGNORE INTO item_units (name) VALUES (?)`)
  for (const name of units) insUnit.run(name)

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

  // Default label settings (singleton). `INSERT OR IGNORE DEFAULT VALUES` does
  // NOT enforce singleton-ness here — `id INTEGER PRIMARY KEY AUTOINCREMENT`
  // never collides on insert, so OR IGNORE never fires. NOT EXISTS is the only
  // pattern that's actually idempotent across launches.
  db.prepare(`INSERT INTO label_settings (id) SELECT 1 WHERE NOT EXISTS (SELECT 1 FROM label_settings)`).run()

  // Default receipt/slip settings (singleton) — same NOT EXISTS idempotency.
  db.prepare(`INSERT INTO receipt_settings (id) SELECT 1 WHERE NOT EXISTS (SELECT 1 FROM receipt_settings)`).run()

  // General customer (catch-all). Walk-in is modelled as this real row, never
  // a NULL customer_id — see the walk-in invariant in CLAUDE.md.
  db.prepare(`INSERT OR IGNORE INTO customers (code, full_name) VALUES (?, ?)`).run('C0000', 'ลูกค้าทั่วไป')

  // Backfill: legacy sales written before the C0000-everywhere change stored
  // walk-in as customer_id = NULL. Re-point them at C0000 so report
  // joins/group-by are uniform. Idempotent + cheap (no-op once clean); runs
  // every launch because it must heal pre-existing DBs, not just fresh ones.
  db.prepare(`
    UPDATE sales SET customer_id = (SELECT id FROM customers WHERE code = 'C0000')
    WHERE customer_id IS NULL
  `).run()

  // Suppliers
  const insSupplier = db.prepare(`INSERT OR IGNORE INTO suppliers (code, name) VALUES (?, ?)`)
  const suppliers = [
    ['S0001', 'VMDRUG'],
    ['S0002', 'DRUG CENTER'],
    ['S0003', 'WELLEKPHARMA'],
    ['S0004', 'FORTE'],
    ['S0005', 'LIKHIT'],
    ['S0006', 'THAI NAKORN PATANA'],
    ['S0007', 'MACRO PHAR'],
    ['S0008', 'MASALAB'],
  ]
  for (const [code, name] of suppliers) insSupplier.run(code, name)

  // Products — seeded from Hygeia Item export (docs/Item.xlsx →
  // seed-data/products.ts via scripts/gen-products.py). Temporary dev seed
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
      is_disabled, is_hidden, is_stock_item, is_drug,
      tmt_id, note, reorder_point, safety_stock
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `)
  const nz = (v: string) => (v ? v : null)
  db.transaction(() => {
    // Running P#### codes — same sequence/format as products:create, so
    // seeded and user-created products share one continuous code space.
    let codeSeq = 0
    for (const p of PRODUCTS) {
      const [
        trade_name, name_for_print, search_keywords,
        barcode, barcode2, barcode3, barcode4,
        unit_name, cost_price, price_retail, price_wholesale1, price_wholesale2,
        is_disabled, is_hidden, is_stock_item, is_drug,
        tmt_id, note, reorder_point, safety_stock,
      ] = p
      const code = `P${String(++codeSeq).padStart(4, '0')}`
      insProduct.run(
        code, trade_name, nz(name_for_print), nz(search_keywords),
        nz(barcode), nz(barcode2), nz(barcode3), nz(barcode4),
        unitMap.get(unit_name) ?? fallbackUnitId,
        cost_price, price_retail, price_wholesale1, price_wholesale2,
        is_disabled, is_hidden, is_stock_item, is_drug,
        nz(tmt_id), nz(note),
        reorder_point > 0 ? reorder_point : null,
        safety_stock > 0 ? safety_stock : null,
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
