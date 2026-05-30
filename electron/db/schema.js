export function initializeSchema(db) {
    db.exec("\n    PRAGMA journal_mode = WAL;\n    PRAGMA foreign_keys = ON;\n\n    -- Users / Staff\n    CREATE TABLE IF NOT EXISTS users (\n      id INTEGER PRIMARY KEY AUTOINCREMENT,\n      name TEXT NOT NULL,\n      email TEXT UNIQUE NOT NULL,\n      password TEXT NOT NULL DEFAULT '',\n      role TEXT NOT NULL DEFAULT 'staff',\n      is_disabled INTEGER NOT NULL DEFAULT 0,\n      created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),\n      updated_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))\n    );\n\n    -- Settings\n    CREATE TABLE IF NOT EXISTS settings (\n      id INTEGER PRIMARY KEY AUTOINCREMENT,\n      shop_name TEXT NOT NULL DEFAULT '',\n      shop_address TEXT NOT NULL DEFAULT '',\n      shop_phone TEXT NOT NULL DEFAULT '',\n      shop_license_no TEXT NOT NULL DEFAULT '',\n      shop_tax_id TEXT NOT NULL DEFAULT '',\n      shop_line_id TEXT NOT NULL DEFAULT '',\n      updated_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))\n    );\n\n    -- Product Categories\n    CREATE TABLE IF NOT EXISTS product_categories (\n      id INTEGER PRIMARY KEY AUTOINCREMENT,\n      code TEXT NOT NULL UNIQUE,\n      name TEXT NOT NULL,\n      description TEXT,\n      sort_order INTEGER NOT NULL DEFAULT 0,\n      is_disabled INTEGER NOT NULL DEFAULT 0,\n      created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),\n      updated_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))\n    );\n\n    -- Item Units (base units: Tablet, Box, Bottle, etc.)\n    CREATE TABLE IF NOT EXISTS item_units (\n      id INTEGER PRIMARY KEY AUTOINCREMENT,\n      name TEXT NOT NULL UNIQUE,\n      created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))\n    );\n\n    -- Drug Types (GENERAL, DANGEROUS, etc.)\n    CREATE TABLE IF NOT EXISTS drug_types (\n      id INTEGER PRIMARY KEY AUTOINCREMENT,\n      code TEXT NOT NULL UNIQUE,\n      name_th TEXT NOT NULL,\n      is_fda9  INTEGER NOT NULL DEFAULT 0,\n      is_fda10 INTEGER NOT NULL DEFAULT 0,\n      is_fda11 INTEGER NOT NULL DEFAULT 0,\n      is_fda13 INTEGER NOT NULL DEFAULT 0,\n      is_disabled INTEGER NOT NULL DEFAULT 0,\n      created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),\n      updated_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))\n    );\n\n    -- Dosage Forms (Tablet, Capsule, Syrup, etc.)\n    CREATE TABLE IF NOT EXISTS dosage_forms (\n      id INTEGER PRIMARY KEY AUTOINCREMENT,\n      name_th TEXT NOT NULL,\n      name_en TEXT,\n      is_disabled INTEGER NOT NULL DEFAULT 0,\n      created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))\n    );\n\n    -- Drug Generic Names\n    CREATE TABLE IF NOT EXISTS drug_generic_names (\n      id INTEGER PRIMARY KEY AUTOINCREMENT,\n      name TEXT NOT NULL UNIQUE,\n      is_disabled INTEGER NOT NULL DEFAULT 0,\n      created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))\n    );\n\n    -- Products\n    CREATE TABLE IF NOT EXISTS products (\n      id INTEGER PRIMARY KEY AUTOINCREMENT,\n      barcode TEXT,\n      barcode2 TEXT,\n      barcode3 TEXT,\n      barcode4 TEXT,\n      code TEXT,\n      trade_name TEXT NOT NULL,\n      name_for_print TEXT,\n      category_id INTEGER REFERENCES product_categories(id),\n      is_stock_item INTEGER NOT NULL DEFAULT 1,\n      is_bundle INTEGER NOT NULL DEFAULT 0,\n      is_disabled INTEGER NOT NULL DEFAULT 0,\n      is_hidden INTEGER NOT NULL DEFAULT 0,\n      price_retail REAL NOT NULL DEFAULT 0,\n      price_wholesale1 REAL NOT NULL DEFAULT 0,\n      price_wholesale2 REAL NOT NULL DEFAULT 0,\n      cost_price REAL NOT NULL DEFAULT 0,\n      last_cost_price REAL NOT NULL DEFAULT 0,\n      unit_id INTEGER REFERENCES item_units(id),\n      has_vat INTEGER NOT NULL DEFAULT 0,\n      is_drug INTEGER NOT NULL DEFAULT 0,\n      reorder_point REAL,\n      safety_stock REAL,\n      drug_type_id INTEGER REFERENCES drug_types(id),\n      tmt_id TEXT,\n      is_antibiotic INTEGER NOT NULL DEFAULT 0,\n      indication_note TEXT,\n      side_effect_note TEXT,\n      is_fda9  INTEGER NOT NULL DEFAULT 0,\n      is_fda10 INTEGER NOT NULL DEFAULT 0,\n      is_fda11 INTEGER NOT NULL DEFAULT 0,\n      is_fda13 INTEGER NOT NULL DEFAULT 0,\n      search_keywords TEXT,\n      note TEXT,\n      created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),\n      updated_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))\n    );\n\n    -- Product Unit Variants (non-base units only \u2014 \u0E41\u0E1C\u0E07, \u0E01\u0E25\u0E48\u0E2D\u0E07, ...)\n    -- The base unit lives directly on the products table (products.unit_id).\n    CREATE TABLE IF NOT EXISTS product_units (\n      id INTEGER PRIMARY KEY AUTOINCREMENT,\n      product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,\n      unit_id INTEGER NOT NULL REFERENCES item_units(id),\n      barcode TEXT,\n      qty_per_base REAL NOT NULL DEFAULT 1,\n      price_retail REAL NOT NULL DEFAULT 0,\n      price_wholesale1 REAL NOT NULL DEFAULT 0,\n      price_wholesale2 REAL NOT NULL DEFAULT 0,\n      is_for_sale INTEGER NOT NULL DEFAULT 1,\n      is_for_purchase INTEGER NOT NULL DEFAULT 0,\n      is_disabled INTEGER NOT NULL DEFAULT 0,\n      created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),\n      updated_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))\n    );\n\n    -- Product Bundle Items (recipe for is_bundle=1 products)\n    -- One bundle row in products + N rows here. Stock is derived\n    -- (MIN of component capacities); cost is auto \u03A3(component_cost \u00D7 qty).\n    -- Sale-time FEFO deducts from each component's lots; void/return\n    -- restores via sale_item_lots.product_id (component-tagged).\n    CREATE TABLE IF NOT EXISTS product_bundle_items (\n      id INTEGER PRIMARY KEY AUTOINCREMENT,\n      bundle_id            INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,\n      component_product_id INTEGER NOT NULL REFERENCES products(id),\n      qty_per_bundle       REAL NOT NULL DEFAULT 1,\n      sort_order           INTEGER NOT NULL DEFAULT 0,\n      created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),\n      updated_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),\n      UNIQUE(bundle_id, component_product_id)\n    );\n    CREATE INDEX IF NOT EXISTS idx_pbi_bundle ON product_bundle_items(bundle_id);\n    CREATE INDEX IF NOT EXISTS idx_pbi_component ON product_bundle_items(component_product_id);\n\n    -- Product Lots / Batches\n    CREATE TABLE IF NOT EXISTS product_lots (\n      id INTEGER PRIMARY KEY AUTOINCREMENT,\n      product_id INTEGER NOT NULL REFERENCES products(id),\n      supplier_id INTEGER REFERENCES suppliers(id),\n      lot_number TEXT NOT NULL,\n      manufactured_date TEXT,\n      expiry_date TEXT,\n      cost_price REAL NOT NULL DEFAULT 0,\n      sell_price REAL NOT NULL DEFAULT 0,\n      qty_received REAL NOT NULL DEFAULT 0,\n      qty_on_hand REAL NOT NULL DEFAULT 0,\n      qty_reserved REAL NOT NULL DEFAULT 0,\n      invoice_no TEXT,\n      supplier_invoice_no TEXT,\n      order_date TEXT,\n      payment_type TEXT DEFAULT 'cash',\n      due_date TEXT,\n      is_paid INTEGER NOT NULL DEFAULT 1,\n      paid_date TEXT,\n      is_closed INTEGER NOT NULL DEFAULT 0,\n      closed_at TEXT,\n      is_cancelled INTEGER NOT NULL DEFAULT 0,\n      cancelled_at TEXT,\n      cancel_note TEXT,\n      note TEXT,\n      created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),\n      updated_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),\n      UNIQUE(product_id, lot_number)\n    );\n\n    -- Customers\n    CREATE TABLE IF NOT EXISTS customers (\n      id INTEGER PRIMARY KEY AUTOINCREMENT,\n      code TEXT NOT NULL UNIQUE,\n      full_name TEXT NOT NULL,\n      id_card TEXT,\n      dob TEXT,\n      phone TEXT,\n      address TEXT,\n      chronic_diseases TEXT,\n      is_alert INTEGER NOT NULL DEFAULT 0,\n      alert_note TEXT,\n      is_disabled INTEGER NOT NULL DEFAULT 0,\n      created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),\n      updated_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))\n    );\n\n    -- Drug Allergies (linked to customers)\n    CREATE TABLE IF NOT EXISTS drug_allergies (\n      id INTEGER PRIMARY KEY AUTOINCREMENT,\n      customer_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,\n      generic_name_id INTEGER REFERENCES drug_generic_names(id),\n      drug_name_free TEXT,\n      reaction TEXT,\n      severity TEXT,\n      noted_by INTEGER REFERENCES users(id),\n      noted_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))\n    );\n\n    -- Suppliers\n    CREATE TABLE IF NOT EXISTS suppliers (\n      id INTEGER PRIMARY KEY AUTOINCREMENT,\n      code TEXT NOT NULL UNIQUE,\n      name TEXT NOT NULL,\n      tax_id TEXT,\n      phone TEXT,\n      address TEXT,\n      is_disabled INTEGER NOT NULL DEFAULT 0,\n      created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),\n      updated_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))\n    );\n\n    -- Sales\n    CREATE TABLE IF NOT EXISTS sales (\n      id INTEGER PRIMARY KEY AUTOINCREMENT,\n      invoice_no TEXT NOT NULL UNIQUE,\n      sale_type TEXT NOT NULL DEFAULT 'retail',\n      customer_id INTEGER REFERENCES customers(id),\n      customer_name_free TEXT,\n      sold_by INTEGER REFERENCES users(id),\n      sold_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),\n      age_range TEXT,\n      symptom_note TEXT,\n      subtotal REAL NOT NULL DEFAULT 0,\n      total_discount REAL NOT NULL DEFAULT 0,\n      total_vat REAL NOT NULL DEFAULT 0,\n      total_amount REAL NOT NULL DEFAULT 0,\n      cash_amount REAL NOT NULL DEFAULT 0,\n      card_amount REAL NOT NULL DEFAULT 0,\n      transfer_amount REAL NOT NULL DEFAULT 0,\n      change_amount REAL NOT NULL DEFAULT 0,\n      is_credit INTEGER NOT NULL DEFAULT 0,\n      due_date TEXT,\n      is_fda13_report INTEGER NOT NULL DEFAULT 0,\n      sale_report_note TEXT,\n      status TEXT NOT NULL DEFAULT 'completed',\n      void_reason TEXT,\n      note TEXT,\n      created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),\n      updated_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))\n    );\n\n    -- Sale Items\n    CREATE TABLE IF NOT EXISTS sale_items (\n      id INTEGER PRIMARY KEY AUTOINCREMENT,\n      sale_id INTEGER NOT NULL REFERENCES sales(id) ON DELETE CASCADE,\n      product_id INTEGER NOT NULL REFERENCES products(id),\n      item_name TEXT NOT NULL,\n      unit_name TEXT NOT NULL DEFAULT '',\n      qty REAL NOT NULL DEFAULT 1,\n      unit_price REAL NOT NULL DEFAULT 0,\n      discount REAL NOT NULL DEFAULT 0,\n      unit_vat REAL NOT NULL DEFAULT 0,\n      line_total REAL NOT NULL DEFAULT 0,\n      item_note TEXT,\n      is_cancelled INTEGER NOT NULL DEFAULT 0\n    );\n\n    -- Sale Item Lots (FEFO tracking)\n    CREATE TABLE IF NOT EXISTS sale_item_lots (\n      id INTEGER PRIMARY KEY AUTOINCREMENT,\n      sale_item_id INTEGER NOT NULL REFERENCES sale_items(id) ON DELETE CASCADE,\n      lot_id INTEGER REFERENCES product_lots(id),\n      product_id INTEGER NOT NULL REFERENCES products(id),\n      qty REAL NOT NULL DEFAULT 0,\n      is_cancelled INTEGER NOT NULL DEFAULT 0\n    );\n\n    -- Stock Movements Audit\n    CREATE TABLE IF NOT EXISTS stock_movements (\n      id INTEGER PRIMARY KEY AUTOINCREMENT,\n      product_id INTEGER NOT NULL REFERENCES products(id),\n      lot_id INTEGER REFERENCES product_lots(id),\n      movement_type TEXT NOT NULL,\n      ref_type TEXT,\n      ref_id INTEGER,\n      qty_change REAL NOT NULL DEFAULT 0,\n      qty_before REAL NOT NULL DEFAULT 0,\n      qty_after REAL NOT NULL DEFAULT 0,\n      unit_cost REAL NOT NULL DEFAULT 0,\n      note TEXT,\n      created_by INTEGER REFERENCES users(id),\n      created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))\n    );\n\n    -- Lot cost change history (cost_price edits via products:updateLot)\n    CREATE TABLE IF NOT EXISTS lot_cost_logs (\n      id INTEGER PRIMARY KEY AUTOINCREMENT,\n      lot_id INTEGER NOT NULL REFERENCES product_lots(id) ON DELETE CASCADE,\n      product_id INTEGER NOT NULL REFERENCES products(id),\n      old_cost REAL NOT NULL DEFAULT 0,\n      new_cost REAL NOT NULL DEFAULT 0,\n      note TEXT,\n      created_by INTEGER REFERENCES users(id),\n      created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))\n    );\n    CREATE INDEX IF NOT EXISTS idx_lot_cost_logs_lot ON lot_cost_logs(lot_id, created_at DESC);\n\n    -- Price change history\n    CREATE TABLE IF NOT EXISTS price_logs (\n      id INTEGER PRIMARY KEY AUTOINCREMENT,\n      product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,\n      price_type TEXT NOT NULL DEFAULT 'retail',\n      old_price REAL NOT NULL DEFAULT 0,\n      new_price REAL NOT NULL DEFAULT 0,\n      note TEXT,\n      created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))\n    );\n\n    -- Label Frequencies\n    CREATE TABLE IF NOT EXISTS label_frequencies (\n      id INTEGER PRIMARY KEY AUTOINCREMENT,\n      code TEXT NOT NULL UNIQUE,\n      name_th TEXT NOT NULL,\n      name_en TEXT,\n      name_mm TEXT,\n      name_zh TEXT,\n      sort_order INTEGER NOT NULL DEFAULT 0\n    );\n\n    -- Label Dosages\n    CREATE TABLE IF NOT EXISTS label_dosages (\n      id INTEGER PRIMARY KEY AUTOINCREMENT,\n      code TEXT NOT NULL UNIQUE,\n      name_th TEXT NOT NULL,\n      name_en TEXT,\n      name_mm TEXT,\n      name_zh TEXT,\n      sort_order INTEGER NOT NULL DEFAULT 0\n    );\n\n    -- Label Times\n    CREATE TABLE IF NOT EXISTS label_times (\n      id INTEGER PRIMARY KEY AUTOINCREMENT,\n      code TEXT NOT NULL UNIQUE,\n      name_th TEXT NOT NULL,\n      name_en TEXT,\n      name_mm TEXT,\n      name_zh TEXT,\n      sort_order INTEGER NOT NULL DEFAULT 0\n    );\n\n    -- Label Meal Relations\n    CREATE TABLE IF NOT EXISTS label_meal_relations (\n      id INTEGER PRIMARY KEY AUTOINCREMENT,\n      code TEXT NOT NULL UNIQUE,\n      name_th TEXT NOT NULL,\n      name_en TEXT,\n      name_mm TEXT,\n      name_zh TEXT,\n      sort_order INTEGER NOT NULL DEFAULT 0\n    );\n\n    -- Label Advices\n    CREATE TABLE IF NOT EXISTS label_advices (\n      id INTEGER PRIMARY KEY AUTOINCREMENT,\n      code TEXT NOT NULL UNIQUE,\n      name_th TEXT NOT NULL,\n      name_en TEXT,\n      name_mm TEXT,\n      name_zh TEXT,\n      sort_order INTEGER NOT NULL DEFAULT 0\n    );\n\n    -- Product Labels (Medicine Prescription Labels)\n    CREATE TABLE IF NOT EXISTS product_labels (\n      id INTEGER PRIMARY KEY AUTOINCREMENT,\n      product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,\n      label_name TEXT,\n      dose_qty REAL,\n      dosage_id INTEGER REFERENCES label_dosages(id),\n      frequency_id INTEGER REFERENCES label_frequencies(id),\n      timing_id INTEGER REFERENCES label_meal_relations(id),\n      indication_th TEXT,\n      indication_mm TEXT,\n      indication_zh TEXT,\n      note_th TEXT,\n      note_mm TEXT,\n      note_zh TEXT,\n      is_active INTEGER NOT NULL DEFAULT 1,\n      sort_order INTEGER NOT NULL DEFAULT 0,\n      created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),\n      updated_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))\n    );\n\n    -- Label Settings (print configuration)\n    CREATE TABLE IF NOT EXISTS label_settings (\n      id INTEGER PRIMARY KEY AUTOINCREMENT,\n      width_mm REAL NOT NULL DEFAULT 80,\n      height_mm REAL NOT NULL DEFAULT 50,\n      pad_top REAL NOT NULL DEFAULT 3,\n      pad_right REAL NOT NULL DEFAULT 3,\n      pad_bottom REAL NOT NULL DEFAULT 3,\n      pad_left REAL NOT NULL DEFAULT 3,\n      font_family TEXT NOT NULL DEFAULT 'Sarabun',\n      font_size_shop REAL NOT NULL DEFAULT 8,\n      font_size_product REAL NOT NULL DEFAULT 10,\n      font_size_dosage REAL NOT NULL DEFAULT 9,\n      font_size_small REAL NOT NULL DEFAULT 7,\n      bold_shop INTEGER NOT NULL DEFAULT 0,\n      bold_product INTEGER NOT NULL DEFAULT 1,\n      bold_dosage INTEGER NOT NULL DEFAULT 0,\n      line_spacing REAL NOT NULL DEFAULT 1.2,\n      section_gap REAL NOT NULL DEFAULT 2,\n      printer_name TEXT NOT NULL DEFAULT '',\n      show_shop          INTEGER NOT NULL DEFAULT 1,\n      show_product       INTEGER NOT NULL DEFAULT 1,\n      show_dosage        INTEGER NOT NULL DEFAULT 1,\n      show_indication    INTEGER NOT NULL DEFAULT 1,\n      show_notes         INTEGER NOT NULL DEFAULT 1,\n      show_lot_expiry    INTEGER NOT NULL DEFAULT 1,\n      show_barcode       INTEGER NOT NULL DEFAULT 0,\n      show_header_line   INTEGER NOT NULL DEFAULT 1,\n      show_footer_line   INTEGER NOT NULL DEFAULT 1,\n      offset_x_shop       REAL NOT NULL DEFAULT 0,\n      offset_y_shop       REAL NOT NULL DEFAULT 0,\n      offset_x_product    REAL NOT NULL DEFAULT 0,\n      offset_y_product    REAL NOT NULL DEFAULT 0,\n      offset_x_dosage     REAL NOT NULL DEFAULT 0,\n      offset_y_dosage     REAL NOT NULL DEFAULT 0,\n      offset_x_indication REAL NOT NULL DEFAULT 0,\n      offset_y_indication REAL NOT NULL DEFAULT 0,\n      offset_x_notes      REAL NOT NULL DEFAULT 0,\n      offset_y_notes      REAL NOT NULL DEFAULT 0,\n      offset_x_lot_expiry REAL NOT NULL DEFAULT 0,\n      offset_y_lot_expiry REAL NOT NULL DEFAULT 0,\n      offset_x_barcode    REAL NOT NULL DEFAULT 0,\n      offset_y_barcode    REAL NOT NULL DEFAULT 0,\n      offset_x_header_line REAL NOT NULL DEFAULT 0,\n      offset_y_header_line REAL NOT NULL DEFAULT 0,\n      offset_x_footer_line REAL NOT NULL DEFAULT 0,\n      offset_y_footer_line REAL NOT NULL DEFAULT 0,\n      updated_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))\n    );\n\n    -- POS / Sales Settings (singleton). Columns map 1:1 to SalesTab form keys \u2014\n    -- the IPC upsert builds dynamic SQL from Object.keys(), so any renamed key\n    -- would throw \"no such column\".\n    CREATE TABLE IF NOT EXISTS sales_settings (\n      id INTEGER PRIMARY KEY AUTOINCREMENT,\n      expiry_alert_enabled    INTEGER NOT NULL DEFAULT 1,\n      expiry_warn_months      INTEGER NOT NULL DEFAULT 6,\n      expiry_danger_months    INTEGER NOT NULL DEFAULT 3,\n      expired_alert_enabled   INTEGER NOT NULL DEFAULT 1,\n      low_stock_alert_enabled INTEGER NOT NULL DEFAULT 1,\n      updated_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))\n    );\n\n    -- Purchase receipt headers (GR-level metadata, one row per invoice_no).\n    -- Authoritative source for supplier / payment / dates of a GR.\n    -- product_lots also stores some of these for stock display, but is last-write-wins.\n    CREATE TABLE IF NOT EXISTS purchase_receipts (\n      invoice_no TEXT PRIMARY KEY,\n      supplier_id INTEGER REFERENCES suppliers(id),\n      supplier_invoice_no TEXT,\n      order_date TEXT,\n      payment_type TEXT NOT NULL DEFAULT 'cash',\n      due_date TEXT,\n      is_paid INTEGER NOT NULL DEFAULT 0,\n      paid_date TEXT,\n      note TEXT NOT NULL DEFAULT '',\n      discount_amount REAL NOT NULL DEFAULT 0,\n      surcharge_amount REAL NOT NULL DEFAULT 0,\n      status TEXT NOT NULL DEFAULT 'completed',\n      cancelled_at TEXT,\n      cancelled_by INTEGER REFERENCES users(id),\n      cancel_reason TEXT,\n      created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))\n    );\n\n    -- Purchase receipt line items (immutable receive ledger).\n    -- One row per line per GR. NEVER mutated after insert (except is_cancelled flag).\n    -- Source of truth for \u0E1B\u0E23\u0E30\u0E27\u0E31\u0E15\u0E34\u0E01\u0E32\u0E23\u0E23\u0E31\u0E1A\u0E2A\u0E34\u0E19\u0E04\u0E49\u0E32 history and cancellation.\n    CREATE TABLE IF NOT EXISTS purchase_receipt_items (\n      id INTEGER PRIMARY KEY AUTOINCREMENT,\n      invoice_no TEXT NOT NULL,\n      product_id INTEGER NOT NULL REFERENCES products(id),\n      lot_id INTEGER REFERENCES product_lots(id),\n      lot_number TEXT NOT NULL,\n      manufactured_date TEXT,\n      expiry_date TEXT,\n      cost_price REAL NOT NULL DEFAULT 0,\n      sell_price REAL NOT NULL DEFAULT 0,\n      qty REAL NOT NULL DEFAULT 0,\n      note TEXT,\n      created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))\n    );\n    CREATE INDEX IF NOT EXISTS idx_pri_invoice ON purchase_receipt_items(invoice_no);\n    CREATE INDEX IF NOT EXISTS idx_pri_lot ON purchase_receipt_items(lot_id);\n\n    -- Supplier product alias (Invoice Matcher).\n    -- (supplier_id, normalized supplier_text) -> product_id. Grows from\n    -- human-confirmed first-time matches; after that, instant exact lookup.\n    -- supplier_text is stored normalized (trim, collapse whitespace, uppercase)\n    -- so \"PARA 500\" and \" para  500 \" collide on the same key.\n    CREATE TABLE IF NOT EXISTS supplier_product_alias (\n      id INTEGER PRIMARY KEY AUTOINCREMENT,\n      supplier_id INTEGER NOT NULL REFERENCES suppliers(id) ON DELETE CASCADE,\n      supplier_text TEXT NOT NULL,\n      product_id INTEGER NOT NULL REFERENCES products(id),\n      confidence REAL NOT NULL DEFAULT 1.0,\n      confirmed_by INTEGER REFERENCES users(id),\n      confirmed_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),\n      created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),\n      UNIQUE(supplier_id, supplier_text)\n    );\n    CREATE INDEX IF NOT EXISTS idx_alias_lookup ON supplier_product_alias(supplier_id, supplier_text);\n\n    -- Indexes\n    CREATE INDEX IF NOT EXISTS idx_products_barcode ON products(barcode);\n    CREATE INDEX IF NOT EXISTS idx_products_barcode2 ON products(barcode2);\n    CREATE INDEX IF NOT EXISTS idx_products_barcode3 ON products(barcode3);\n    CREATE INDEX IF NOT EXISTS idx_products_barcode4 ON products(barcode4);\n    CREATE INDEX IF NOT EXISTS idx_products_code ON products(code);\n    CREATE INDEX IF NOT EXISTS idx_product_lots_product ON product_lots(product_id);\n    CREATE INDEX IF NOT EXISTS idx_product_lots_expiry ON product_lots(expiry_date);\n    CREATE INDEX IF NOT EXISTS idx_sales_invoice ON sales(invoice_no);\n    CREATE INDEX IF NOT EXISTS idx_sales_sold_at ON sales(sold_at);\n    -- Reports hot path: every cost/profit aggregate joins sale_items \u2192 sale_item_lots\n    -- per sale. Without these the subquery does a full table scan, killing perf\n    -- once sales count > ~5k (financeSummary, salesPurchaseTrend, topProducts,\n    -- cashierLeaderboard all hit this). Also covers reports:getSale per-bill detail.\n    CREATE INDEX IF NOT EXISTS idx_sale_items_sale ON sale_items(sale_id);\n    CREATE INDEX IF NOT EXISTS idx_sale_items_product ON sale_items(product_id);\n    CREATE INDEX IF NOT EXISTS idx_sale_item_lots_sale_item ON sale_item_lots(sale_item_id);\n    CREATE INDEX IF NOT EXISTS idx_sale_item_lots_lot ON sale_item_lots(lot_id);\n    CREATE INDEX IF NOT EXISTS idx_sale_item_lots_product ON sale_item_lots(product_id);\n    -- Same story for purchase aggregates and history filtering.\n    CREATE INDEX IF NOT EXISTS idx_purchase_receipts_created ON purchase_receipts(created_at);\n    CREATE INDEX IF NOT EXISTS idx_purchase_receipts_supplier ON purchase_receipts(supplier_id);\n    CREATE INDEX IF NOT EXISTS idx_stock_movements_product ON stock_movements(product_id, lot_id);\n    CREATE INDEX IF NOT EXISTS idx_stock_movements_type ON stock_movements(movement_type);\n    CREATE INDEX IF NOT EXISTS idx_stock_movements_created ON stock_movements(created_at);\n    CREATE INDEX IF NOT EXISTS idx_price_logs_product ON price_logs(product_id, created_at DESC);\n  ");
    // Safe column migrations for existing databases
    for (var _i = 0, _a = [
        "ALTER TABLE purchase_receipts ADD COLUMN discount_amount REAL NOT NULL DEFAULT 0",
        "ALTER TABLE purchase_receipts ADD COLUMN surcharge_amount REAL NOT NULL DEFAULT 0",
        "ALTER TABLE product_lots ADD COLUMN is_cancelled INTEGER NOT NULL DEFAULT 0",
        "ALTER TABLE product_lots ADD COLUMN cancelled_at TEXT",
        "ALTER TABLE product_lots ADD COLUMN cancel_note TEXT",
        "ALTER TABLE products DROP COLUMN is_original_drug",
        "ALTER TABLE products DROP COLUMN strength",
        "ALTER TABLE products DROP COLUMN registration_no",
        "ALTER TABLE products DROP COLUMN max_dispense_qty",
        "ALTER TABLE products DROP COLUMN is_sale_control",
        "ALTER TABLE products DROP COLUMN sale_control_qty",
        "ALTER TABLE products DROP COLUMN expiry_alert_days1",
        "ALTER TABLE products DROP COLUMN expiry_alert_days2",
        "ALTER TABLE products DROP COLUMN expiry_alert_days3",
        "ALTER TABLE products DROP COLUMN no_discount",
        "ALTER TABLE products DROP COLUMN dosage_form_id",
        // is_drug: explicit "this product is a drug" flag (Hygeia-style toggle).
        // category is now purely for sorting/filtering; this flag gates the
        // "ข้อมูลยา" section in EditProduct.
        "ALTER TABLE products ADD COLUMN is_drug INTEGER NOT NULL DEFAULT 0",
        // Backfill: anything that already had a drug_type assigned was implicitly a drug.
        "UPDATE products SET is_drug = 1 WHERE drug_type_id IS NOT NULL AND is_drug = 0",
        // is_bundle: marks a product as a "ชุดสินค้า" (kit/bundle). Bundle rows
        // hold no lots (is_stock_item=0); stock derived via product_bundle_items.
        "ALTER TABLE products ADD COLUMN is_bundle INTEGER NOT NULL DEFAULT 0",
        // label_settings: printer choice + per-section visibility + per-section X/Y nudge (mm)
        "ALTER TABLE label_settings ADD COLUMN printer_name TEXT NOT NULL DEFAULT ''",
        "ALTER TABLE label_settings ADD COLUMN show_shop          INTEGER NOT NULL DEFAULT 1",
        "ALTER TABLE label_settings ADD COLUMN show_product       INTEGER NOT NULL DEFAULT 1",
        "ALTER TABLE label_settings ADD COLUMN show_dosage        INTEGER NOT NULL DEFAULT 1",
        "ALTER TABLE label_settings ADD COLUMN show_indication    INTEGER NOT NULL DEFAULT 1",
        "ALTER TABLE label_settings ADD COLUMN show_notes         INTEGER NOT NULL DEFAULT 1",
        "ALTER TABLE label_settings ADD COLUMN show_lot_expiry    INTEGER NOT NULL DEFAULT 1",
        "ALTER TABLE label_settings ADD COLUMN show_barcode       INTEGER NOT NULL DEFAULT 0",
        "ALTER TABLE label_settings ADD COLUMN offset_x_shop       REAL NOT NULL DEFAULT 0",
        "ALTER TABLE label_settings ADD COLUMN offset_y_shop       REAL NOT NULL DEFAULT 0",
        "ALTER TABLE label_settings ADD COLUMN offset_x_product    REAL NOT NULL DEFAULT 0",
        "ALTER TABLE label_settings ADD COLUMN offset_y_product    REAL NOT NULL DEFAULT 0",
        "ALTER TABLE label_settings ADD COLUMN offset_x_dosage     REAL NOT NULL DEFAULT 0",
        "ALTER TABLE label_settings ADD COLUMN offset_y_dosage     REAL NOT NULL DEFAULT 0",
        "ALTER TABLE label_settings ADD COLUMN offset_x_indication REAL NOT NULL DEFAULT 0",
        "ALTER TABLE label_settings ADD COLUMN offset_y_indication REAL NOT NULL DEFAULT 0",
        "ALTER TABLE label_settings ADD COLUMN offset_x_notes      REAL NOT NULL DEFAULT 0",
        "ALTER TABLE label_settings ADD COLUMN offset_y_notes      REAL NOT NULL DEFAULT 0",
        "ALTER TABLE label_settings ADD COLUMN offset_x_lot_expiry REAL NOT NULL DEFAULT 0",
        "ALTER TABLE label_settings ADD COLUMN offset_y_lot_expiry REAL NOT NULL DEFAULT 0",
        "ALTER TABLE label_settings ADD COLUMN offset_x_barcode    REAL NOT NULL DEFAULT 0",
        "ALTER TABLE label_settings ADD COLUMN offset_y_barcode    REAL NOT NULL DEFAULT 0",
        "ALTER TABLE label_settings ADD COLUMN show_header_line    INTEGER NOT NULL DEFAULT 1",
        "ALTER TABLE label_settings ADD COLUMN show_footer_line    INTEGER NOT NULL DEFAULT 1",
        "ALTER TABLE label_settings ADD COLUMN offset_x_header_line REAL NOT NULL DEFAULT 0",
        "ALTER TABLE label_settings ADD COLUMN offset_y_header_line REAL NOT NULL DEFAULT 0",
        "ALTER TABLE label_settings ADD COLUMN offset_x_footer_line REAL NOT NULL DEFAULT 0",
        "ALTER TABLE label_settings ADD COLUMN offset_y_footer_line REAL NOT NULL DEFAULT 0",
    ]; _i < _a.length; _i++) {
        var sql = _a[_i];
        try {
            db.exec(sql);
        }
        catch (_b) { }
    }
    // Migration: drop the vestigial item_units.multiply column. Never read by any
    // business logic — per-product conversion lives in product_units.qty_per_base.
    try {
        db.exec("ALTER TABLE item_units DROP COLUMN multiply");
    }
    catch (_c) { }
    // Ensure a fallback unit exists.
    try {
        db.exec("INSERT OR IGNORE INTO item_units (name) VALUES ('\u0E0A\u0E34\u0E49\u0E19')");
    }
    catch (_d) { }
    // Migration: FDA report columns — drug_types gets boolean flags, products renamed.
    // Order matters: drug_types flags must exist before products backfill uses them.
    for (var _e = 0, _f = [
        // drug_types: add individual boolean flags (replaces khor_yor_report TEXT)
        "ALTER TABLE drug_types ADD COLUMN is_fda9  INTEGER NOT NULL DEFAULT 0",
        "ALTER TABLE drug_types ADD COLUMN is_fda10 INTEGER NOT NULL DEFAULT 0",
        "ALTER TABLE drug_types ADD COLUMN is_fda11 INTEGER NOT NULL DEFAULT 0",
        "ALTER TABLE drug_types ADD COLUMN is_fda13 INTEGER NOT NULL DEFAULT 0",
        // Backfill drug_types from old khor_yor_report column
        "UPDATE drug_types SET is_fda9=1 WHERE khor_yor_report IS NOT NULL AND is_fda9=0",
        "UPDATE drug_types SET is_fda10=1 WHERE khor_yor_report='\u0E02\u0E22.10' AND is_fda10=0",
        "ALTER TABLE drug_types DROP COLUMN khor_yor_report",
        // products: rename is_fda_report → is_fda9, is_fda13_report → is_fda13
        "ALTER TABLE products RENAME COLUMN is_fda_report TO is_fda9",
        "ALTER TABLE products RENAME COLUMN is_fda13_report TO is_fda13",
        // products: add is_fda10 and is_fda11
        "ALTER TABLE products ADD COLUMN is_fda10 INTEGER NOT NULL DEFAULT 0",
        "ALTER TABLE products ADD COLUMN is_fda11 INTEGER NOT NULL DEFAULT 0",
        // Backfill: all drugs must be in ข.ย.9 (purchase report)
        "UPDATE products SET is_fda9=1 WHERE is_drug=1 AND is_fda9=0",
        // Backfill is_fda10/11 from the drug_type (flags set above)
        "UPDATE products SET is_fda10=(SELECT COALESCE(dt.is_fda10,0) FROM drug_types dt WHERE dt.id=products.drug_type_id) WHERE is_drug=1 AND drug_type_id IS NOT NULL",
        "UPDATE products SET is_fda11=(SELECT COALESCE(dt.is_fda11,0) FROM drug_types dt WHERE dt.id=products.drug_type_id) WHERE is_drug=1 AND drug_type_id IS NOT NULL",
    ]; _e < _f.length; _e++) {
        var sql = _f[_e];
        try {
            db.exec(sql);
        }
        catch (_g) { }
    }
    // Migration: split product cost into two roles.
    //   products.cost_price      = weighted-average cost of open lots (recomputed
    //                              by every stock flow — the canonical valuation).
    //   products.last_cost_price = the last cost we actually PAID (display-only:
    //                              "ต้นทุนล่าสุด" reference, prev-cost hint when
    //                              receiving). Never used for profit/COGS —
    //                              reports use the actual lot cost.
    // Backfill from the newest lot whose cost > 0 (free goods don't count as a
    // "cost paid"). Stays 0 for products never paid for (new, or only ever
    // received free) — matches the runtime rule in purchase.ts which skips the
    // last_cost_price write when receiving at cost 0.
    for (var _h = 0, _j = [
        "ALTER TABLE products ADD COLUMN last_cost_price REAL NOT NULL DEFAULT 0",
        "UPDATE products SET last_cost_price = COALESCE((\n        SELECT pl.cost_price FROM product_lots pl\n        WHERE pl.product_id = products.id AND pl.cost_price > 0\n        ORDER BY pl.created_at DESC, pl.id DESC LIMIT 1\n      ), 0)\n      WHERE last_cost_price = 0",
    ]; _h < _j.length; _h++) {
        var sql = _j[_h];
        try {
            db.exec(sql);
        }
        catch (_k) { }
    }
    // Migration: de-dupe drug_generic_names + enforce UNIQUE(name).
    // The table shipped with no UNIQUE on `name`, so seed.ts's
    // `INSERT OR IGNORE ... (name)` never actually ignored anything — every
    // launch re-inserted all ~4253 rows (that seed block runs before the
    // userCount guard, i.e. every boot). DBs that booted N times carry N copies.
    //
    // Order matters: repoint FK refs to the survivor (MIN id per name) BEFORE
    // deleting dups, then create the UNIQUE index (which would itself throw if
    // dups still existed — try/catch + the prior delete make this idempotent).
    for (var _l = 0, _m = [
        // 1. Repoint drug_allergies at the surviving row for its generic name.
        "UPDATE drug_allergies SET generic_name_id = (\n        SELECT MIN(d2.id) FROM drug_generic_names d2\n        WHERE d2.name = (SELECT d1.name FROM drug_generic_names d1\n                         WHERE d1.id = drug_allergies.generic_name_id)\n      ) WHERE generic_name_id IS NOT NULL",
        // 2. Delete every row that isn't the MIN id for its name.
        "DELETE FROM drug_generic_names WHERE id NOT IN (\n        SELECT MIN(id) FROM drug_generic_names GROUP BY name\n      )",
        // 3. Block future dups — now INSERT OR IGNORE works as intended.
        "CREATE UNIQUE INDEX IF NOT EXISTS idx_drug_generic_names_name\n        ON drug_generic_names(name)",
    ]; _l < _m.length; _l++) {
        var sql = _m[_l];
        try {
            db.exec(sql);
        }
        catch (_o) { }
    }
    // Migration: move base unit data BACK into products.
    // Previous design kept base unit as a product_units row with is_base_unit=1 and
    // mirrored prices into it. That created two sources of truth and the inevitable
    // drift bugs. Now: products owns its base unit (unit_id, price_*), and
    // product_units holds only non-base variants.
    //
    // Step 1 (ADD COLUMN) and step 4 (DROP COLUMN) must run outside a transaction
    // (SQLite limitation) and are independently idempotent — try/catch absorbs the
    // "duplicate / missing column" errors on re-runs.
    //
    // Steps 2+3 (backfill + delete base rows) MUST be atomic: if backfill fails
    // mid-way and we still delete base rows, products are stranded with unit_id=NULL
    // and no recovery path. Wrap them in a transaction and add a sanity gate.
    try {
        db.exec("ALTER TABLE products ADD COLUMN unit_id INTEGER REFERENCES item_units(id)");
    }
    catch (_p) { }
    try {
        db.transaction(function () {
            db.exec("\n        UPDATE products\n           SET unit_id = (SELECT pu.unit_id FROM product_units pu\n                           WHERE pu.product_id = products.id AND pu.is_base_unit = 1)\n         WHERE unit_id IS NULL\n      ");
            // Gate: refuse to delete base rows if any product would be left orphaned.
            // (Products that were already orphaned before this migration are excluded
            // from the check via the EXISTS clause — they wouldn't be helped by aborting.)
            var orphans = db.prepare("\n        SELECT COUNT(*) AS c FROM products p\n         WHERE p.unit_id IS NULL\n           AND EXISTS (SELECT 1 FROM product_units pu\n                        WHERE pu.product_id = p.id AND pu.is_base_unit = 1)\n      ").get();
            if (orphans.c > 0)
                throw new Error("Migration aborted: ".concat(orphans.c, " products would lose their base unit"));
            db.exec("DELETE FROM product_units WHERE is_base_unit = 1");
        })();
    }
    catch (_q) { }
    try {
        db.exec("ALTER TABLE product_units DROP COLUMN is_base_unit");
    }
    catch (_r) { }
    // Customers: add is_disabled (mirror suppliers/users soft-disable). Existing
    // is_hidden was the de-facto soft-delete flag; backfill so previously "deleted"
    // customers carry over as disabled under the new flag.
    for (var _s = 0, _t = [
        "ALTER TABLE customers ADD COLUMN is_disabled INTEGER NOT NULL DEFAULT 0",
        "UPDATE customers SET is_disabled = 1 WHERE is_hidden = 1 AND is_disabled = 0",
    ]; _s < _t.length; _s++) {
        var sql = _t[_s];
        try {
            db.exec(sql);
        }
        catch (_u) { }
    }
    // Drop unused columns — UI no longer reads/writes these. Try/catch absorbs
    // "no such column" on re-run. Order matters: customers.is_hidden drop runs
    // AFTER the is_hidden→is_disabled backfill above.
    for (var _v = 0, _w = [
        "ALTER TABLE customers DROP COLUMN hn",
        "ALTER TABLE customers DROP COLUMN hc_uc",
        "ALTER TABLE customers DROP COLUMN hc_gov",
        "ALTER TABLE customers DROP COLUMN hc_sso",
        "ALTER TABLE customers DROP COLUMN other_allergy",
        "ALTER TABLE customers DROP COLUMN food_allergy",
        "ALTER TABLE customers DROP COLUMN warning_note",
        "ALTER TABLE customers DROP COLUMN is_hidden",
        "ALTER TABLE suppliers DROP COLUMN contact_name",
    ]; _v < _w.length; _v++) {
        var sql = _w[_v];
        try {
            db.exec(sql);
        }
        catch (_x) { }
    }
    // Migration: split the sale_return movement type. Voids and genuine customer
    // returns both used to write movement_type='sale_return', distinguished only
    // by ref_type ('sale' = void, 'return' = real return). Promote voids to their
    // own 'sale_void' type so the history/filter can tell them apart. The
    // ref_type predicate makes this exact + idempotent (no rows match on re-run).
    try {
        db.exec("UPDATE stock_movements SET movement_type = 'sale_void' WHERE movement_type = 'sale_return' AND ref_type = 'sale'");
    }
    catch (_y) { }
    // Refresh query-planner stats so the planner picks the new indexes added
    // above on first launch (and on later launches where data has grown).
    // PRAGMA optimize is cheap when stats are fresh — only re-ANALYZEs tables
    // whose stats are stale.
    try {
        db.exec("PRAGMA optimize");
    }
    catch (_z) { }
}
