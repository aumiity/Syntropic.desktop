import DRUG_GENERIC_NAMES from './seed-data/drug-generic-names';
import LABEL_FREQUENCIES from './seed-data/label-frequencies';
import LABEL_MEAL_RELATIONS from './seed-data/label-meal-relations';
import LABEL_ADVICES from './seed-data/label-advices';
import LABEL_DOSAGES from './seed-data/label-dosages';
import LABEL_TIMES from './seed-data/label-times';
import PRODUCTS from './seed-data/products';
import CUSTOMERS from './seed-data/customers';
export function seedDatabase(db) {
    // Idempotent staff test user — added to every install so audit trail has a non-admin actor
    // until proper login lands. Keyed by unique email.
    db.prepare("INSERT OR IGNORE INTO users (name, email, password, role) VALUES (?, ?, ?, ?)").run('Staff Test', 'staff@syntropic.local', 'staff', 'staff');
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
    var seedTuples = function (sql, rows) {
        var stmt = db.prepare(sql);
        db.transaction(function () { for (var _i = 0, rows_1 = rows; _i < rows_1.length; _i++) {
            var r = rows_1[_i];
            stmt.run.apply(stmt, r);
        } })();
    };
    seedTuples("INSERT OR IGNORE INTO label_frequencies (code, name_th, name_en, name_mm, name_zh, sort_order) VALUES (?, ?, ?, ?, ?, ?)", LABEL_FREQUENCIES);
    seedTuples("INSERT OR IGNORE INTO label_dosages (code, name_th, name_en, name_mm, name_zh, sort_order) VALUES (?, ?, ?, ?, ?, ?)", LABEL_DOSAGES);
    seedTuples("INSERT OR IGNORE INTO label_meal_relations (code, name_th, name_en, name_mm, name_zh, sort_order) VALUES (?, ?, ?, ?, ?, ?)", LABEL_MEAL_RELATIONS);
    seedTuples("INSERT OR IGNORE INTO label_times (code, name_th, name_en, name_mm, name_zh, sort_order) VALUES (?, ?, ?, ?, ?, ?)", LABEL_TIMES);
    seedTuples("INSERT OR IGNORE INTO label_advices (code, name_th, name_en, name_mm, name_zh, sort_order) VALUES (?, ?, ?, ?, ?, ?)", LABEL_ADVICES);
    // Drug generic names (~1400). is_disabled defaults 0; all source rows were active.
    var insGeneric = db.prepare("INSERT OR IGNORE INTO drug_generic_names (name) VALUES (?)");
    db.transaction(function () { for (var _i = 0, DRUG_GENERIC_NAMES_1 = DRUG_GENERIC_NAMES; _i < DRUG_GENERIC_NAMES_1.length; _i++) {
        var n = DRUG_GENERIC_NAMES_1[_i];
        insGeneric.run(n);
    } })();
    // Only seed the rest if tables are empty
    var userCount = db.prepare("SELECT COUNT(*) as c FROM users WHERE email = 'admin@syntropic.local'").get().c;
    if (userCount > 0)
        return;
    // Default admin user
    db.prepare("INSERT INTO users (name, email, password, role) VALUES (?, ?, ?, ?)").run('Admin', 'admin@syntropic.local', 'admin', 'admin');
    // Default settings
    db.prepare("INSERT INTO settings (shop_name, shop_address, shop_phone) VALUES (?, ?, ?)").run('ร้านยา Syntropic', '', '');
    // Product categories
    var categories = [
        ['DRUG', 'ยา', 1],
        ['SUPPLY', 'เวชภัณฑ์', 2],
        ['SUPPLEMENT', 'อาหารเสริม', 3],
        ['HERB', 'สมุนไพร', 4],
        ['CONTRACEPT', 'ยาคุมกำเนิด', 5],
        ['OTHER', 'อื่นๆ', 6],
    ];
    var insCategory = db.prepare("INSERT OR IGNORE INTO product_categories (code, name, sort_order) VALUES (?, ?, ?)");
    for (var _i = 0, categories_1 = categories; _i < categories_1.length; _i++) {
        var _a = categories_1[_i], code = _a[0], name_1 = _a[1], sort = _a[2];
        insCategory.run(code, name_1, sort);
    }
    // Item units — superset of what's referenced by seeded products (32 names from
    // the Hygeia Item export) plus a handful of common ones we want available
    // even on a minimal install. INSERT OR IGNORE = safe to re-run.
    var units = [
        'เม็ด', 'กล่อง', 'แผง', 'ขวด', 'หลอด', 'ซอง',
        'ชิ้น', 'อัน', 'ถุง', 'แคปซูล',
        'ห่อ', 'กระปุก', 'กระป๋อง', 'แพ็ค', 'แพค', 'ม้วน',
        'ตลับ', 'ก้อน', 'ด้าม', 'ชุด', 'เครื่อง', 'แผ่น',
        'ใบ', 'ตัว', 'คู่', 'ขีด', 'เมตร', 'เส้น',
        'ผืน', 'ถ้วย', 'แกลลอน', 'AMP',
    ];
    var insUnit = db.prepare("INSERT OR IGNORE INTO item_units (name) VALUES (?)");
    for (var _b = 0, units_1 = units; _b < units_1.length; _b++) {
        var name_2 = units_1[_b];
        insUnit.run(name_2);
    }
    // Drug types — [code, name_th, is_fda9, is_fda10, is_fda11, is_fda13]
    // is_fda9=1 for all (every drug purchase must be logged in ข.ย.9)
    // is_fda10=1 for controlled/psycho/narcotic (ข.ย.10 sale log)
    // is_fda11=0 default even for DANGEROUS — pharmacist sets per-product per regulation
    var drugTypes = [
        ['GENERAL', 'ยาสามัญประจำบ้าน', 1, 0, 0, 0],
        ['OTC', 'ยาบรรจุเสร็จ ข.ย.2', 1, 0, 0, 0],
        ['DANGEROUS', 'ยาอันตราย', 1, 0, 0, 0],
        ['SPCL_CTRL', 'ยาควบคุมพิเศษ', 1, 1, 0, 0],
        ['PSYCHO_3', 'วัตถุออกฤทธิ์ประเภท 3', 1, 1, 0, 0],
        ['PSYCHO_4', 'วัตถุออกฤทธิ์ประเภท 4', 1, 1, 0, 0],
        ['NARCOTIC_3', 'ยาเสพติดประเภท 3', 1, 1, 0, 0],
    ];
    var insDrugType = db.prepare("INSERT OR IGNORE INTO drug_types (code, name_th, is_fda9, is_fda10, is_fda11, is_fda13) VALUES (?, ?, ?, ?, ?, ?)");
    for (var _c = 0, drugTypes_1 = drugTypes; _c < drugTypes_1.length; _c++) {
        var _d = drugTypes_1[_c], code = _d[0], name_3 = _d[1], fda9 = _d[2], fda10 = _d[3], fda11 = _d[4], fda13 = _d[5];
        insDrugType.run(code, name_3, fda9, fda10, fda11, fda13);
    }
    // Dosage forms
    var dosageForms = [
        ['เม็ด', 'Tablet'], ['แคปซูล', 'Capsule'], ['น้ำเชื่อม', 'Syrup'],
        ['น้ำแขวนตะกอน', 'Suspension'], ['ครีม', 'Cream'], ['ขี้ผึ้ง', 'Ointment'],
        ['เจล', 'Gel'], ['โลชั่น', 'Lotion'], ['ยาฉีด', 'Injection'],
        ['ยาพ่น', 'Inhaler'], ['ยาหยอดตา', 'Eye Drop'], ['ยาหยอดหู', 'Ear Drop'],
        ['ยาเหน็บ', 'Suppository'], ['ผง', 'Powder'], ['แผ่น', 'Patch'],
    ];
    var insDosageForm = db.prepare("INSERT OR IGNORE INTO dosage_forms (name_th, name_en) VALUES (?, ?)");
    for (var _e = 0, dosageForms_1 = dosageForms; _e < dosageForms_1.length; _e++) {
        var _f = dosageForms_1[_e], th = _f[0], en = _f[1];
        insDosageForm.run(th, en);
    }
    // Default label settings
    db.prepare("INSERT OR IGNORE INTO label_settings DEFAULT VALUES").run();
    // General customer (catch-all). Walk-in is modelled as this real row, never
    // a NULL customer_id — see the walk-in invariant in CLAUDE.md.
    db.prepare("INSERT OR IGNORE INTO customers (code, full_name) VALUES (?, ?)").run('C0000', 'ลูกค้าทั่วไป');
    // Backfill: legacy sales written before the C0000-everywhere change stored
    // walk-in as customer_id = NULL. Re-point them at C0000 so report
    // joins/group-by are uniform. Idempotent + cheap (no-op once clean); runs
    // every launch because it must heal pre-existing DBs, not just fresh ones.
    db.prepare("\n    UPDATE sales SET customer_id = (SELECT id FROM customers WHERE code = 'C0000')\n    WHERE customer_id IS NULL\n  ").run();
    // Suppliers
    var insSupplier = db.prepare("INSERT OR IGNORE INTO suppliers (code, name) VALUES (?, ?)");
    var suppliers = [
        ['S0001', 'VMDRUG'],
        ['S0002', 'DRUG CENTER'],
        ['S0003', 'WELLEKPHARMA'],
        ['S0004', 'FORTE'],
        ['S0005', 'LIKHIT'],
    ];
    for (var _g = 0, suppliers_1 = suppliers; _g < suppliers_1.length; _g++) {
        var _h = suppliers_1[_g], code = _h[0], name_4 = _h[1];
        insSupplier.run(code, name_4);
    }
    // Products — seeded from Hygeia Item export (docs/Item.xlsx →
    // seed-data/products.ts via scripts/gen-products.py). Temporary dev seed
    // to test name-matching against real product data; remove the import + this
    // block before compiling a production build.
    //
    // Why inside the fresh-DB guard: products is mutable user data, not reference
    // data. Re-seeding on every launch would clobber edits.
    var unitRows = db.prepare("SELECT id, name FROM item_units").all();
    var unitMap = new Map(unitRows.map(function (r) { return [r.name, r.id]; }));
    var fallbackUnitId = unitMap.get('ชิ้น');
    var insProduct = db.prepare("\n    INSERT INTO products (\n      code, trade_name, name_for_print, search_keywords,\n      barcode, barcode2, barcode3, barcode4,\n      unit_id, cost_price, price_retail, price_wholesale1, price_wholesale2,\n      is_disabled, is_hidden, is_stock_item, has_vat, is_drug,\n      tmt_id, note, reorder_point, safety_stock\n    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)\n  ");
    var nz = function (v) { return (v ? v : null); };
    db.transaction(function () {
        var _a;
        // Running P#### codes — same sequence/format as products:create, so
        // seeded and user-created products share one continuous code space.
        var codeSeq = 0;
        for (var _i = 0, PRODUCTS_1 = PRODUCTS; _i < PRODUCTS_1.length; _i++) {
            var p = PRODUCTS_1[_i];
            var trade_name = p[0], name_for_print = p[1], search_keywords = p[2], barcode = p[3], barcode2 = p[4], barcode3 = p[5], barcode4 = p[6], unit_name = p[7], cost_price = p[8], price_retail = p[9], price_wholesale1 = p[10], price_wholesale2 = p[11], is_disabled = p[12], is_hidden = p[13], is_stock_item = p[14], has_vat = p[15], is_drug = p[16], tmt_id = p[17], note = p[18], reorder_point = p[19], safety_stock = p[20];
            var code = "P".concat(String(++codeSeq).padStart(4, '0'));
            insProduct.run(code, trade_name, nz(name_for_print), nz(search_keywords), nz(barcode), nz(barcode2), nz(barcode3), nz(barcode4), (_a = unitMap.get(unit_name)) !== null && _a !== void 0 ? _a : fallbackUnitId, cost_price, price_retail, price_wholesale1, price_wholesale2, is_disabled, is_hidden, is_stock_item, has_vat, is_drug, nz(tmt_id), nz(note), reorder_point > 0 ? reorder_point : null, safety_stock > 0 ? safety_stock : null);
        }
    })();
    // Customers — seeded from Hygeia Person export (docs/Person.xlsx →
    // docs/Person.json → seed-data/customers.ts via scripts/gen-customers.mjs).
    // Temporary dev seed to test against real customer data; remove the import +
    // this block before compiling a production build. Same fresh-DB-guard
    // rationale as products: customers is mutable user data, not reference data.
    // C0000 ('ลูกค้าทั่วไป') is seeded above; these run C0001…
    var insCustomer = db.prepare("INSERT OR IGNORE INTO customers (code, full_name, id_card, phone, address)\n     VALUES (?, ?, ?, ?, ?)");
    var cz = function (v) { return (v ? v : null); };
    db.transaction(function () {
        for (var _i = 0, CUSTOMERS_1 = CUSTOMERS; _i < CUSTOMERS_1.length; _i++) {
            var _a = CUSTOMERS_1[_i], code = _a[0], full_name = _a[1], id_card = _a[2], phone = _a[3], address = _a[4];
            insCustomer.run(code, full_name, cz(id_card), cz(phone), cz(address));
        }
    })();
}
