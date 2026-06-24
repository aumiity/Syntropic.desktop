export function initializeSchema(db) {
    db.exec("\n    PRAGMA journal_mode = WAL;\n    PRAGMA foreign_keys = ON;\n\n    -- Users / Staff\n    CREATE TABLE IF NOT EXISTS users (\n      id INTEGER PRIMARY KEY AUTOINCREMENT,\n      name TEXT NOT NULL,\n      first_name TEXT NOT NULL DEFAULT '',\n      last_name TEXT NOT NULL DEFAULT '',\n      username TEXT,\n      phone TEXT,\n      email TEXT UNIQUE NOT NULL,\n      password TEXT NOT NULL DEFAULT '',\n      role TEXT NOT NULL DEFAULT 'staff',\n      is_disabled INTEGER NOT NULL DEFAULT 0,\n      recovery_code_hash TEXT,\n      failed_attempts INTEGER NOT NULL DEFAULT 0,\n      locked_until TEXT,\n      recovery_failed_attempts INTEGER NOT NULL DEFAULT 0,\n      recovery_locked_until TEXT,\n      created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),\n      updated_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))\n    );\n\n    -- Settings\n    CREATE TABLE IF NOT EXISTS settings (\n      id INTEGER PRIMARY KEY AUTOINCREMENT,\n      shop_name TEXT NOT NULL DEFAULT '',\n      shop_address TEXT NOT NULL DEFAULT '',\n      shop_phone TEXT NOT NULL DEFAULT '',\n      shop_license_no TEXT NOT NULL DEFAULT '',\n      shop_tax_id TEXT NOT NULL DEFAULT '',\n      shop_line_id TEXT NOT NULL DEFAULT '',\n      shop_postcode TEXT NOT NULL DEFAULT '',\n      setup_completed INTEGER NOT NULL DEFAULT 0,\n      setup_completed_at TEXT,\n      vat_registered_date TEXT,\n      updated_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))\n    );\n\n    -- Product Categories\n    CREATE TABLE IF NOT EXISTS product_categories (\n      id INTEGER PRIMARY KEY AUTOINCREMENT,\n      code TEXT NOT NULL UNIQUE,\n      name TEXT NOT NULL,\n      description TEXT,\n      sort_order INTEGER NOT NULL DEFAULT 0,\n      is_disabled INTEGER NOT NULL DEFAULT 0,\n      created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),\n      updated_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))\n    );\n\n    -- Item Units (base units: Tablet, Box, Bottle, etc.)\n    CREATE TABLE IF NOT EXISTS item_units (\n      id INTEGER PRIMARY KEY AUTOINCREMENT,\n      name TEXT NOT NULL UNIQUE,\n      created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))\n    );\n\n    -- Drug Types (GENERAL, DANGEROUS, etc.)\n    CREATE TABLE IF NOT EXISTS drug_types (\n      id INTEGER PRIMARY KEY AUTOINCREMENT,\n      code TEXT NOT NULL UNIQUE,\n      name_th TEXT NOT NULL,\n      is_fda9  INTEGER NOT NULL DEFAULT 0,\n      is_fda10 INTEGER NOT NULL DEFAULT 0,\n      is_fda11 INTEGER NOT NULL DEFAULT 0,\n      is_fda13 INTEGER NOT NULL DEFAULT 0,\n      is_disabled INTEGER NOT NULL DEFAULT 0,\n      created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),\n      updated_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))\n    );\n\n    -- Dosage Forms (Tablet, Capsule, Syrup, etc.)\n    CREATE TABLE IF NOT EXISTS dosage_forms (\n      id INTEGER PRIMARY KEY AUTOINCREMENT,\n      name_th TEXT NOT NULL,\n      name_en TEXT,\n      is_disabled INTEGER NOT NULL DEFAULT 0,\n      created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))\n    );\n\n    -- Drug Generic Names\n    CREATE TABLE IF NOT EXISTS drug_generic_names (\n      id INTEGER PRIMARY KEY AUTOINCREMENT,\n      name TEXT NOT NULL UNIQUE,\n      is_disabled INTEGER NOT NULL DEFAULT 0,\n      created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))\n    );\n\n    -- Products\n    CREATE TABLE IF NOT EXISTS products (\n      id INTEGER PRIMARY KEY AUTOINCREMENT,\n      barcode TEXT,\n      barcode2 TEXT,\n      barcode3 TEXT,\n      barcode4 TEXT,\n      code TEXT,\n      trade_name TEXT NOT NULL,\n      name_for_print TEXT,\n      category_id INTEGER REFERENCES product_categories(id),\n      is_stock_item INTEGER NOT NULL DEFAULT 1,\n      is_bundle INTEGER NOT NULL DEFAULT 0,\n      is_disabled INTEGER NOT NULL DEFAULT 0,\n      -- DEAD COLUMN: \u0E44\u0E21\u0E48\u0E21\u0E35 query \u0E44\u0E2B\u0E19\u0E01\u0E23\u0E2D\u0E07 products.is_hidden \u0E40\u0E25\u0E22 (UI \u0E16\u0E39\u0E01\u0E16\u0E2D\u0E14\u0E41\u0E25\u0E49\u0E27) \u2014 is_disabled\n      -- \u0E04\u0E23\u0E2D\u0E1A\u0E04\u0E25\u0E38\u0E21\u0E17\u0E38\u0E01\u0E40\u0E04\u0E2A; \u0E23\u0E2D DROP \u0E17\u0E35\u0E40\u0E14\u0E35\u0E22\u0E27\u0E15\u0E2D\u0E19 schema cleanup. \u0E14\u0E39 docs/refine_schema.md\n      is_hidden INTEGER NOT NULL DEFAULT 0,\n      price_retail REAL NOT NULL DEFAULT 0,\n      price_wholesale1 REAL NOT NULL DEFAULT 0,\n      price_wholesale2 REAL NOT NULL DEFAULT 0,\n      cost_price REAL NOT NULL DEFAULT 0,\n      last_cost_price REAL NOT NULL DEFAULT 0,\n      unit_id INTEGER REFERENCES item_units(id),\n      default_qty REAL NOT NULL DEFAULT 1,\n      is_drug INTEGER NOT NULL DEFAULT 0,\n      reorder_point REAL,\n      safety_stock REAL,\n      drug_type_id INTEGER REFERENCES drug_types(id),\n      tmt_id TEXT,\n      is_antibiotic INTEGER NOT NULL DEFAULT 0,\n      indication_note TEXT,\n      side_effect_note TEXT,\n      is_fda9  INTEGER NOT NULL DEFAULT 0,\n      is_fda10 INTEGER NOT NULL DEFAULT 0,\n      is_fda11 INTEGER NOT NULL DEFAULT 0,\n      is_fda13 INTEGER NOT NULL DEFAULT 0,\n      search_keywords TEXT,\n      note TEXT,\n      created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),\n      updated_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))\n    );\n\n    -- Product Unit Variants (non-base units only \u2014 \u0E41\u0E1C\u0E07, \u0E01\u0E25\u0E48\u0E2D\u0E07, ...)\n    -- The base unit lives directly on the products table (products.unit_id).\n    CREATE TABLE IF NOT EXISTS product_units (\n      id INTEGER PRIMARY KEY AUTOINCREMENT,\n      product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,\n      unit_id INTEGER NOT NULL REFERENCES item_units(id),\n      barcode TEXT,\n      qty_per_base REAL NOT NULL DEFAULT 1,\n      price_retail REAL NOT NULL DEFAULT 0,\n      price_wholesale1 REAL NOT NULL DEFAULT 0,\n      price_wholesale2 REAL NOT NULL DEFAULT 0,\n      is_for_sale INTEGER NOT NULL DEFAULT 1,\n      -- DEAD COLUMN (2026-06-12): purchase/sale unit split dropped. Receiving now\n      -- shows every enabled unit; only is_for_sale is honored (POS picker). Kept to\n      -- avoid an immediate migration \u2014 DROP in the pre-release schema cleanup.\n      -- See docs/refine_schema.md\n      is_for_purchase INTEGER NOT NULL DEFAULT 1,\n      is_disabled INTEGER NOT NULL DEFAULT 0,\n      created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),\n      updated_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))\n    );\n\n    -- Product Bundle Items (recipe for is_bundle=1 products)\n    -- One bundle row in products + N rows here. Stock is derived\n    -- (MIN of component capacities); cost is auto \u03A3(component_cost \u00D7 qty).\n    -- Sale-time FEFO deducts from each component's lots; void/return\n    -- restores via sale_item_lots.product_id (component-tagged).\n    CREATE TABLE IF NOT EXISTS product_bundle_items (\n      id INTEGER PRIMARY KEY AUTOINCREMENT,\n      bundle_id            INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,\n      component_product_id INTEGER NOT NULL REFERENCES products(id),\n      qty_per_bundle       REAL NOT NULL DEFAULT 1,\n      sort_order           INTEGER NOT NULL DEFAULT 0,\n      created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),\n      updated_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),\n      UNIQUE(bundle_id, component_product_id)\n    );\n    CREATE INDEX IF NOT EXISTS idx_pbi_bundle ON product_bundle_items(bundle_id);\n    CREATE INDEX IF NOT EXISTS idx_pbi_component ON product_bundle_items(component_product_id);\n\n    -- Product Lots / Batches\n    CREATE TABLE IF NOT EXISTS product_lots (\n      id INTEGER PRIMARY KEY AUTOINCREMENT,\n      product_id INTEGER NOT NULL REFERENCES products(id),\n      supplier_id INTEGER REFERENCES suppliers(id),\n      lot_number TEXT NOT NULL,\n      manufactured_date TEXT,\n      expiry_date TEXT,\n      cost_price REAL NOT NULL DEFAULT 0,\n      sell_price REAL NOT NULL DEFAULT 0,\n      qty_received REAL NOT NULL DEFAULT 0,\n      qty_on_hand REAL NOT NULL DEFAULT 0,\n      qty_reserved REAL NOT NULL DEFAULT 0,\n      invoice_no TEXT,\n      supplier_invoice_no TEXT,\n      order_date TEXT,\n      payment_type TEXT DEFAULT 'cash',\n      due_date TEXT,\n      is_paid INTEGER NOT NULL DEFAULT 1,\n      paid_date TEXT,\n      is_closed INTEGER NOT NULL DEFAULT 0,\n      closed_at TEXT,\n      is_cancelled INTEGER NOT NULL DEFAULT 0,\n      cancelled_at TEXT,\n      cancel_note TEXT,\n      note TEXT,\n      created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),\n      updated_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),\n      UNIQUE(product_id, lot_number)\n    );\n\n    -- Customers\n    CREATE TABLE IF NOT EXISTS customers (\n      id INTEGER PRIMARY KEY AUTOINCREMENT,\n      code TEXT NOT NULL UNIQUE,\n      full_name TEXT NOT NULL,\n      id_card TEXT,\n      dob TEXT,\n      phone TEXT,\n      address TEXT,\n      branch TEXT,\n      chronic_diseases TEXT,  -- RENAME COLUMN -> 'note' (repurposed as free-form customer note 2026-06-23; rename at schema refine \u2014 see docs/refine_schema.md #6)\n      is_alert INTEGER NOT NULL DEFAULT 0,\n      alert_note TEXT,\n      is_disabled INTEGER NOT NULL DEFAULT 0,\n      created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),\n      updated_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))\n    );\n\n    -- Drug Allergies (linked to customers)\n    CREATE TABLE IF NOT EXISTS drug_allergies (\n      id INTEGER PRIMARY KEY AUTOINCREMENT,\n      customer_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,\n      generic_name_id INTEGER REFERENCES drug_generic_names(id),\n      drug_name_free TEXT,\n      reaction TEXT,\n      severity TEXT,\n      noted_by INTEGER REFERENCES users(id),\n      noted_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))\n    );\n\n    -- Suppliers\n    CREATE TABLE IF NOT EXISTS suppliers (\n      id INTEGER PRIMARY KEY AUTOINCREMENT,\n      code TEXT NOT NULL UNIQUE,\n      name TEXT NOT NULL,\n      tax_id TEXT,\n      phone TEXT,\n      address TEXT,\n      is_disabled INTEGER NOT NULL DEFAULT 0,\n      created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),\n      updated_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))\n    );\n\n    -- Sales\n    CREATE TABLE IF NOT EXISTS sales (\n      id INTEGER PRIMARY KEY AUTOINCREMENT,\n      invoice_no TEXT NOT NULL UNIQUE,\n      sale_type TEXT NOT NULL DEFAULT 'retail',\n      customer_id INTEGER REFERENCES customers(id),\n      customer_name_free TEXT,\n      sold_by INTEGER REFERENCES users(id),\n      sold_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),\n      age_range TEXT,\n      symptom_note TEXT,\n      subtotal REAL NOT NULL DEFAULT 0,\n      total_discount REAL NOT NULL DEFAULT 0,\n      total_vat REAL NOT NULL DEFAULT 0,\n      total_amount REAL NOT NULL DEFAULT 0,\n      cash_amount REAL NOT NULL DEFAULT 0,\n      card_amount REAL NOT NULL DEFAULT 0,\n      transfer_amount REAL NOT NULL DEFAULT 0,\n      change_amount REAL NOT NULL DEFAULT 0,\n      is_credit INTEGER NOT NULL DEFAULT 0,\n      due_date TEXT,\n      is_fda13_report INTEGER NOT NULL DEFAULT 0,\n      sale_report_note TEXT,\n      status TEXT NOT NULL DEFAULT 'completed',\n      void_reason TEXT,\n      note TEXT,\n      created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),\n      updated_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))\n    );\n\n    -- Sale Items\n    CREATE TABLE IF NOT EXISTS sale_items (\n      id INTEGER PRIMARY KEY AUTOINCREMENT,\n      sale_id INTEGER NOT NULL REFERENCES sales(id) ON DELETE CASCADE,\n      product_id INTEGER NOT NULL REFERENCES products(id),\n      item_name TEXT NOT NULL,\n      unit_name TEXT NOT NULL DEFAULT '',\n      qty REAL NOT NULL DEFAULT 1,\n      unit_price REAL NOT NULL DEFAULT 0,\n      discount REAL NOT NULL DEFAULT 0,\n      unit_vat REAL NOT NULL DEFAULT 0,\n      line_total REAL NOT NULL DEFAULT 0,\n      item_note TEXT,\n      is_cancelled INTEGER NOT NULL DEFAULT 0\n    );\n\n    -- Sale Item Lots (FEFO tracking)\n    CREATE TABLE IF NOT EXISTS sale_item_lots (\n      id INTEGER PRIMARY KEY AUTOINCREMENT,\n      sale_item_id INTEGER NOT NULL REFERENCES sale_items(id) ON DELETE CASCADE,\n      lot_id INTEGER REFERENCES product_lots(id),\n      product_id INTEGER NOT NULL REFERENCES products(id),\n      qty REAL NOT NULL DEFAULT 0,\n      is_cancelled INTEGER NOT NULL DEFAULT 0\n    );\n\n    -- Stock Movements Audit\n    CREATE TABLE IF NOT EXISTS stock_movements (\n      id INTEGER PRIMARY KEY AUTOINCREMENT,\n      product_id INTEGER NOT NULL REFERENCES products(id),\n      lot_id INTEGER REFERENCES product_lots(id),\n      movement_type TEXT NOT NULL,\n      ref_type TEXT,\n      ref_id INTEGER,\n      qty_change REAL NOT NULL DEFAULT 0,\n      qty_before REAL NOT NULL DEFAULT 0,\n      qty_after REAL NOT NULL DEFAULT 0,\n      unit_cost REAL NOT NULL DEFAULT 0,\n      note TEXT,\n      created_by INTEGER REFERENCES users(id),\n      created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))\n    );\n\n    -- Lot cost change history (cost_price edits via products:updateLot)\n    CREATE TABLE IF NOT EXISTS lot_cost_logs (\n      id INTEGER PRIMARY KEY AUTOINCREMENT,\n      lot_id INTEGER NOT NULL REFERENCES product_lots(id) ON DELETE CASCADE,\n      product_id INTEGER NOT NULL REFERENCES products(id),\n      old_cost REAL NOT NULL DEFAULT 0,\n      new_cost REAL NOT NULL DEFAULT 0,\n      note TEXT,\n      created_by INTEGER REFERENCES users(id),\n      created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))\n    );\n    CREATE INDEX IF NOT EXISTS idx_lot_cost_logs_lot ON lot_cost_logs(lot_id, created_at DESC);\n\n    -- Price change history\n    CREATE TABLE IF NOT EXISTS price_logs (\n      id INTEGER PRIMARY KEY AUTOINCREMENT,\n      product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,\n      price_type TEXT NOT NULL DEFAULT 'retail',\n      old_price REAL NOT NULL DEFAULT 0,\n      new_price REAL NOT NULL DEFAULT 0,\n      note TEXT,\n      created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))\n    );\n\n    -- Label Frequencies\n    CREATE TABLE IF NOT EXISTS label_frequencies (\n      id INTEGER PRIMARY KEY AUTOINCREMENT,\n      code TEXT NOT NULL UNIQUE,\n      name_th TEXT NOT NULL,\n      name_en TEXT,\n      name_mm TEXT,\n      name_zh TEXT,\n      sort_order INTEGER NOT NULL DEFAULT 0\n    );\n\n    -- Label Dosages\n    CREATE TABLE IF NOT EXISTS label_dosages (\n      id INTEGER PRIMARY KEY AUTOINCREMENT,\n      code TEXT NOT NULL UNIQUE,\n      name_th TEXT NOT NULL,\n      name_en TEXT,\n      name_mm TEXT,\n      name_zh TEXT,\n      sort_order INTEGER NOT NULL DEFAULT 0\n    );\n\n    -- Label Times\n    CREATE TABLE IF NOT EXISTS label_times (\n      id INTEGER PRIMARY KEY AUTOINCREMENT,\n      code TEXT NOT NULL UNIQUE,\n      name_th TEXT NOT NULL,\n      name_en TEXT,\n      name_mm TEXT,\n      name_zh TEXT,\n      sort_order INTEGER NOT NULL DEFAULT 0\n    );\n\n    -- Label Meal Relations\n    CREATE TABLE IF NOT EXISTS label_meal_relations (\n      id INTEGER PRIMARY KEY AUTOINCREMENT,\n      code TEXT NOT NULL UNIQUE,\n      name_th TEXT NOT NULL,\n      name_en TEXT,\n      name_mm TEXT,\n      name_zh TEXT,\n      sort_order INTEGER NOT NULL DEFAULT 0\n    );\n\n    -- Label Advices\n    CREATE TABLE IF NOT EXISTS label_advices (\n      id INTEGER PRIMARY KEY AUTOINCREMENT,\n      code TEXT NOT NULL UNIQUE,\n      name_th TEXT NOT NULL,\n      name_en TEXT,\n      name_mm TEXT,\n      name_zh TEXT,\n      sort_order INTEGER NOT NULL DEFAULT 0\n    );\n\n    -- Product Labels (Medicine Prescription Labels)\n    CREATE TABLE IF NOT EXISTS product_labels (\n      id INTEGER PRIMARY KEY AUTOINCREMENT,\n      product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,\n      label_name TEXT,\n      dose_qty REAL,\n      dosage_id INTEGER REFERENCES label_dosages(id),\n      frequency_id INTEGER REFERENCES label_frequencies(id),\n      timing_id INTEGER REFERENCES label_meal_relations(id),\n      label_time_id INTEGER REFERENCES label_times(id),\n      advice_id INTEGER REFERENCES label_advices(id),\n      indication_th TEXT,\n      indication_en TEXT,\n      indication_mm TEXT,\n      indication_zh TEXT,\n      note_th TEXT,\n      note_mm TEXT,\n      note_zh TEXT,\n      is_default INTEGER NOT NULL DEFAULT 0,\n      show_barcode INTEGER NOT NULL DEFAULT 0,\n      is_active INTEGER NOT NULL DEFAULT 1,\n      created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),\n      updated_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))\n    );\n\n    -- Label Usage Presets \u2014 a named bundle of the 5 \"how to use\" lookups the user\n    -- can apply with one click in the label form (fills the 5 usage fields +\n    -- label_name). The code column is nullable: seed rows carry stable SEED_*\n    -- codes (for idempotent back-fill), user rows leave it NULL (SQLite allows\n    -- many NULLs under a UNIQUE column). Nothing references a preset, so deleting\n    -- one is always safe.\n    CREATE TABLE IF NOT EXISTS label_presets (\n      id INTEGER PRIMARY KEY AUTOINCREMENT,\n      code TEXT UNIQUE,\n      name TEXT NOT NULL,\n      dosage_id     INTEGER REFERENCES label_dosages(id),\n      frequency_id  INTEGER REFERENCES label_frequencies(id),\n      timing_id     INTEGER REFERENCES label_meal_relations(id),\n      label_time_id INTEGER REFERENCES label_times(id),\n      advice_id     INTEGER REFERENCES label_advices(id),\n      sort_order INTEGER NOT NULL DEFAULT 0,\n      created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),\n      updated_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))\n    );\n\n    -- Label Settings (print configuration)\n    CREATE TABLE IF NOT EXISTS label_settings (\n      id INTEGER PRIMARY KEY AUTOINCREMENT,\n      width_mm REAL NOT NULL DEFAULT 80,\n      height_mm REAL NOT NULL DEFAULT 50,\n      pad_top REAL NOT NULL DEFAULT 3,\n      pad_right REAL NOT NULL DEFAULT 3,\n      pad_bottom REAL NOT NULL DEFAULT 3,\n      pad_left REAL NOT NULL DEFAULT 3,\n      font_family TEXT NOT NULL DEFAULT 'Sarabun',\n      -- Per-section font size (one column per text section); all default 10pt.\n      font_size_shop          REAL NOT NULL DEFAULT 10,\n      font_size_print_date    REAL NOT NULL DEFAULT 10,\n      font_size_shop_address  REAL NOT NULL DEFAULT 10,\n      font_size_shop_phone    REAL NOT NULL DEFAULT 10,\n      font_size_shop_line_id  REAL NOT NULL DEFAULT 10,\n      font_size_product       REAL NOT NULL DEFAULT 10,\n      font_size_dosage        REAL NOT NULL DEFAULT 10,\n      font_size_timing        REAL NOT NULL DEFAULT 10,\n      font_size_indication    REAL NOT NULL DEFAULT 10,\n      font_size_advice        REAL NOT NULL DEFAULT 10,\n      font_size_barcode       REAL NOT NULL DEFAULT 10,\n      -- Barcode is sized by an explicit box: font_size_barcode = HEIGHT (mm),\n      -- barcode_width_mm = WIDTH (mm). The bars stretch to fill so every product\n      -- renders the same barcode footprint regardless of how many digits it has.\n      barcode_width_mm        REAL NOT NULL DEFAULT 40,\n      font_size_custom_text   REAL NOT NULL DEFAULT 10,\n      -- qty folds into the product flex row (right, like print_date \u2192 shop);\n      -- expiry folds into the dosage row (right). Both = sale context (cart qty /\n      -- FEFO lot) so they print blank outside the POS flow.\n      font_size_qty           REAL NOT NULL DEFAULT 10,\n      font_size_expiry        REAL NOT NULL DEFAULT 10,\n      -- frequency (\u0E04\u0E27\u0E32\u0E21\u0E16\u0E35\u0E48) split out of dosage so it prints on its own line.\n      font_size_frequency     REAL NOT NULL DEFAULT 10,\n      font_size_small         REAL NOT NULL DEFAULT 10, -- DEAD: retired shared tier\n      -- Per-section bold; only shop name / address / phone / product default on.\n      bold_shop          INTEGER NOT NULL DEFAULT 1,\n      bold_print_date    INTEGER NOT NULL DEFAULT 0,\n      bold_shop_address  INTEGER NOT NULL DEFAULT 1,\n      bold_shop_phone    INTEGER NOT NULL DEFAULT 1,\n      bold_shop_line_id  INTEGER NOT NULL DEFAULT 0,\n      bold_product       INTEGER NOT NULL DEFAULT 1,\n      bold_dosage        INTEGER NOT NULL DEFAULT 0,\n      bold_timing        INTEGER NOT NULL DEFAULT 0,\n      bold_indication    INTEGER NOT NULL DEFAULT 0,\n      bold_advice        INTEGER NOT NULL DEFAULT 0,\n      bold_barcode       INTEGER NOT NULL DEFAULT 0,\n      bold_custom_text   INTEGER NOT NULL DEFAULT 0,\n      bold_qty           INTEGER NOT NULL DEFAULT 0,\n      bold_expiry        INTEGER NOT NULL DEFAULT 0,\n      bold_frequency     INTEGER NOT NULL DEFAULT 0,\n      line_spacing REAL NOT NULL DEFAULT 1.2,\n      section_gap REAL NOT NULL DEFAULT 2,\n      printer_name TEXT NOT NULL DEFAULT '',\n      custom_text TEXT NOT NULL DEFAULT '',\n      show_shop          INTEGER NOT NULL DEFAULT 1,\n      show_print_date    INTEGER NOT NULL DEFAULT 1,\n      show_shop_address  INTEGER NOT NULL DEFAULT 1,\n      show_shop_phone    INTEGER NOT NULL DEFAULT 1,\n      show_shop_line_id  INTEGER NOT NULL DEFAULT 1,\n      show_product       INTEGER NOT NULL DEFAULT 1,\n      show_dosage        INTEGER NOT NULL DEFAULT 1,\n      show_timing        INTEGER NOT NULL DEFAULT 1,\n      show_indication    INTEGER NOT NULL DEFAULT 1,\n      show_advice        INTEGER NOT NULL DEFAULT 1,\n      show_notes         INTEGER NOT NULL DEFAULT 1,\n      show_lot_expiry    INTEGER NOT NULL DEFAULT 1,\n      show_barcode       INTEGER NOT NULL DEFAULT 0,\n      show_custom_text   INTEGER NOT NULL DEFAULT 1,\n      show_qty           INTEGER NOT NULL DEFAULT 1,\n      show_expiry        INTEGER NOT NULL DEFAULT 1,\n      show_frequency     INTEGER NOT NULL DEFAULT 1,\n      show_header_line   INTEGER NOT NULL DEFAULT 1,\n      show_footer_line   INTEGER NOT NULL DEFAULT 1,\n      offset_x_shop       REAL NOT NULL DEFAULT 0,\n      offset_y_shop       REAL NOT NULL DEFAULT 0,\n      offset_x_print_date REAL NOT NULL DEFAULT 0,\n      offset_y_print_date REAL NOT NULL DEFAULT 0,\n      offset_x_shop_address REAL NOT NULL DEFAULT 0,\n      offset_y_shop_address REAL NOT NULL DEFAULT 0,\n      offset_x_shop_phone   REAL NOT NULL DEFAULT 0,\n      offset_y_shop_phone   REAL NOT NULL DEFAULT 0,\n      offset_x_shop_line_id REAL NOT NULL DEFAULT 0,\n      offset_y_shop_line_id REAL NOT NULL DEFAULT 0,\n      offset_x_product    REAL NOT NULL DEFAULT 0,\n      offset_y_product    REAL NOT NULL DEFAULT 0,\n      offset_x_qty        REAL NOT NULL DEFAULT 0,\n      offset_y_qty        REAL NOT NULL DEFAULT 0,\n      offset_x_expiry     REAL NOT NULL DEFAULT 0,\n      offset_y_expiry     REAL NOT NULL DEFAULT 0,\n      offset_x_frequency  REAL NOT NULL DEFAULT 0,\n      offset_y_frequency  REAL NOT NULL DEFAULT 0,\n      offset_x_dosage     REAL NOT NULL DEFAULT 0,\n      offset_y_dosage     REAL NOT NULL DEFAULT 0,\n      offset_x_timing     REAL NOT NULL DEFAULT 0,\n      offset_y_timing     REAL NOT NULL DEFAULT 0,\n      offset_x_indication REAL NOT NULL DEFAULT 0,\n      offset_y_indication REAL NOT NULL DEFAULT 0,\n      offset_x_advice     REAL NOT NULL DEFAULT 0,\n      offset_y_advice     REAL NOT NULL DEFAULT 0,\n      offset_x_notes      REAL NOT NULL DEFAULT 0,\n      offset_y_notes      REAL NOT NULL DEFAULT 0,\n      offset_x_lot_expiry REAL NOT NULL DEFAULT 0,\n      offset_y_lot_expiry REAL NOT NULL DEFAULT 0,\n      offset_x_barcode    REAL NOT NULL DEFAULT 0,\n      offset_y_barcode    REAL NOT NULL DEFAULT 0,\n      offset_x_custom_text REAL NOT NULL DEFAULT 0,\n      offset_y_custom_text REAL NOT NULL DEFAULT 0,\n      offset_x_header_line REAL NOT NULL DEFAULT 0,\n      offset_y_header_line REAL NOT NULL DEFAULT 0,\n      offset_x_footer_line REAL NOT NULL DEFAULT 0,\n      offset_y_footer_line REAL NOT NULL DEFAULT 0,\n      updated_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))\n    );\n\n    -- POS / Sales Settings (singleton). Columns map 1:1 to SalesTab form keys \u2014\n    -- the IPC upsert builds dynamic SQL from Object.keys(), so any renamed key\n    -- would throw \"no such column\".\n    -- Note: expiry warn/danger month thresholds are NOT stored here \u2014 they're\n    -- fixed policy constants in src/lib/expiry.ts (single source of truth).\n    CREATE TABLE IF NOT EXISTS sales_settings (\n      id INTEGER PRIMARY KEY AUTOINCREMENT,\n      expiry_alert_enabled    INTEGER NOT NULL DEFAULT 1,\n      expired_alert_enabled   INTEGER NOT NULL DEFAULT 1,\n      low_stock_alert_enabled INTEGER NOT NULL DEFAULT 1,\n      qty_multiplier_enabled  INTEGER NOT NULL DEFAULT 1,\n      vat_enabled             INTEGER NOT NULL DEFAULT 0,\n      vat_rate                REAL NOT NULL DEFAULT 7,\n      updated_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))\n    );\n\n    -- Receipt / cash-slip print settings (singleton). Columns map 1:1 to the\n    -- ReceiptSettingsTab form keys \u2014 the IPC upsert builds dynamic SQL from\n    -- Object.keys(), so any renamed key would throw \"no such column\".\n    -- paper_height_mm = 0 means auto (measure content height); a positive value\n    -- forces a fixed page for thermal drivers that reject custom long pages.\n    CREATE TABLE IF NOT EXISTS receipt_settings (\n      id INTEGER PRIMARY KEY AUTOINCREMENT,\n      printer_name       TEXT NOT NULL DEFAULT '',\n      paper_width_mm     REAL NOT NULL DEFAULT 80,\n      paper_height_mm    REAL NOT NULL DEFAULT 0,\n      auto_print         INTEGER NOT NULL DEFAULT 0,\n      copies             INTEGER NOT NULL DEFAULT 1,\n      font_family        TEXT NOT NULL DEFAULT 'Sarabun',\n      font_size          REAL NOT NULL DEFAULT 11,\n      footer_note        TEXT NOT NULL DEFAULT '\u0E02\u0E2D\u0E1A\u0E04\u0E38\u0E13\u0E17\u0E35\u0E48\u0E43\u0E0A\u0E49\u0E1A\u0E23\u0E34\u0E01\u0E32\u0E23',\n      -- DEAD COLUMN: \u0E42\u0E2B\u0E21\u0E14\u0E43\u0E1A\u0E01\u0E33\u0E01\u0E31\u0E1A\u0E20\u0E32\u0E29\u0E35\u0E2D\u0E22\u0E48\u0E32\u0E07\u0E22\u0E48\u0E2D\u0E15\u0E31\u0E14\u0E2A\u0E34\u0E19\u0E08\u0E32\u0E01 sale.total_vat>0 (print.ts) \u0E41\u0E25\u0E49\u0E27\n      -- \u0E44\u0E21\u0E48\u0E21\u0E35 UI/\u0E42\u0E04\u0E49\u0E14\u0E2D\u0E48\u0E32\u0E19\u0E04\u0E48\u0E32\u0E19\u0E35\u0E49 \u2192 DROP \u0E15\u0E2D\u0E19 schema cleanup. \u0E14\u0E39 docs/refine_schema.md\n      abbrev_tax_invoice INTEGER NOT NULL DEFAULT 1,\n      -- \u0E23\u0E39\u0E1B\u0E41\u0E1A\u0E1A\u0E1A\u0E25\u0E47\u0E2D\u0E01\u0E23\u0E32\u0E22\u0E01\u0E32\u0E23\u0E2A\u0E34\u0E19\u0E04\u0E49\u0E32: 'detailed' = 2 \u0E1A\u0E23\u0E23\u0E17\u0E31\u0E14/\u0E23\u0E32\u0E22\u0E01\u0E32\u0E23 (\u0E0A\u0E37\u0E48\u0E2D + \u0E08\u0E33\u0E19\u0E27\u0E19\u00D7\u0E23\u0E32\u0E04\u0E32 \u2026\n      -- \u0E22\u0E2D\u0E14, \u0E04\u0E48\u0E32\u0E40\u0E23\u0E34\u0E48\u0E21\u0E15\u0E49\u0E19), 'table' = \u0E15\u0E32\u0E23\u0E32\u0E07 1 \u0E1A\u0E23\u0E23\u0E17\u0E31\u0E14/\u0E23\u0E32\u0E22\u0E01\u0E32\u0E23 (\u0E0A\u0E37\u0E48\u0E2D | \u0E08\u0E33\u0E19\u0E27\u0E19+\u0E2B\u0E19\u0E48\u0E27\u0E22 |\n      -- \u0E23\u0E32\u0E04\u0E32 | \u0E23\u0E27\u0E21). \u0E2D\u0E48\u0E32\u0E19\u0E42\u0E14\u0E22 buildSlipHtml.ts.\n      items_layout       TEXT NOT NULL DEFAULT 'detailed',\n      -- Per-section style (SSOT: src/lib/receipt/sections.ts). show_/bold_ = 0|1,\n      -- align_ = 'left'|'center'|'right'|'justify'. Font SIZE is global above.\n      show_shop          INTEGER NOT NULL DEFAULT 1, bold_shop          INTEGER NOT NULL DEFAULT 1, align_shop          TEXT NOT NULL DEFAULT 'center',\n      show_shop_contact  INTEGER NOT NULL DEFAULT 1, bold_shop_contact  INTEGER NOT NULL DEFAULT 0, align_shop_contact  TEXT NOT NULL DEFAULT 'center',\n      show_tax_id        INTEGER NOT NULL DEFAULT 1, bold_tax_id        INTEGER NOT NULL DEFAULT 0, align_tax_id        TEXT NOT NULL DEFAULT 'center',\n      show_title         INTEGER NOT NULL DEFAULT 1, bold_title         INTEGER NOT NULL DEFAULT 1, align_title         TEXT NOT NULL DEFAULT 'center',\n      show_bill_info     INTEGER NOT NULL DEFAULT 1, bold_bill_info     INTEGER NOT NULL DEFAULT 0, align_bill_info     TEXT NOT NULL DEFAULT 'justify',\n      show_summary       INTEGER NOT NULL DEFAULT 1, bold_summary       INTEGER NOT NULL DEFAULT 0, align_summary       TEXT NOT NULL DEFAULT 'justify',\n      show_payment       INTEGER NOT NULL DEFAULT 1, bold_payment       INTEGER NOT NULL DEFAULT 0, align_payment       TEXT NOT NULL DEFAULT 'justify',\n      show_footer        INTEGER NOT NULL DEFAULT 1, bold_footer        INTEGER NOT NULL DEFAULT 0, align_footer        TEXT NOT NULL DEFAULT 'center',\n      show_salesperson   INTEGER NOT NULL DEFAULT 1, bold_salesperson   INTEGER NOT NULL DEFAULT 0, align_salesperson   TEXT NOT NULL DEFAULT 'center',\n      updated_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))\n    );\n\n    -- A4 document printing (singleton). Covers every full-page document that\n    -- shares the A4 printer: \u0E43\u0E1A\u0E01\u0E33\u0E01\u0E31\u0E1A\u0E20\u0E32\u0E29\u0E35\u0E40\u0E15\u0E47\u0E21\u0E23\u0E39\u0E1B, \u0E43\u0E1A\u0E23\u0E31\u0E1A\u0E2A\u0E34\u0E19\u0E04\u0E49\u0E32, \u0E43\u0E1A\u0E40\u0E2A\u0E19\u0E2D\u0E23\u0E32\u0E04\u0E32, \u0E2F\u0E25\u0E2F.\n    -- One physical printer for all of them (operator decision). paper_size picks\n    -- the page size the print helpers emit ('A4' 210\u00D7297 / 'A5' 148\u00D7210 mm);\n    -- printer_name = '' falls back to the OS default printer.\n    CREATE TABLE IF NOT EXISTS document_settings (\n      id INTEGER PRIMARY KEY AUTOINCREMENT,\n      printer_name TEXT NOT NULL DEFAULT '',\n      copies       INTEGER NOT NULL DEFAULT 1,\n      -- DEAD COLUMN: A5 removed system-wide (2026-06-19) \u2014 always 'A4' now. Kept\n      -- to avoid mid-dev migration; drop in the pre-launch schema cleanup\n      -- (docs/refine_schema.md). See [[project_print_dialog_unification]].\n      paper_size   TEXT NOT NULL DEFAULT 'A4',\n      updated_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))\n    );\n\n    -- Barcode sticker print-page preference (singleton). Printer + paper (W\u00D7H)\n    -- come from label_settings (same physical printer + die-cut paper as drug\n    -- labels). This table only stores the chosen LAYOUT PRESET + content toggles.\n    -- preset resolves to {cols,rows,gap,font sizes,barcode height} via\n    -- src/lib/tags/presets.ts (cell size COMPUTED from the actual label paper;\n    -- presets too small for the paper are disabled in the UI). Columns map 1:1 to\n    -- the renderer form keys (dynamic-SQL save).\n    CREATE TABLE IF NOT EXISTS barcode_sticker_settings (\n      id INTEGER PRIMARY KEY AUTOINCREMENT,\n      preset      TEXT NOT NULL DEFAULT '4up',\n      show_name   INTEGER NOT NULL DEFAULT 1,\n      show_price  INTEGER NOT NULL DEFAULT 1,\n      show_digits INTEGER NOT NULL DEFAULT 1,\n      updated_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))\n    );\n\n    -- Price-tag print-page preference (singleton). Printer + paper SIZE (A4/A5)\n    -- come from document_settings (printer_name + paper_size). This table only\n    -- stores the chosen LAYOUT PRESET + content toggles. preset resolves per paper\n    -- size via src/lib/tags/presets.ts (e.g. A4 '8up' = 2\u00D74; A5 fewer).\n    CREATE TABLE IF NOT EXISTS price_tag_settings (\n      id INTEGER PRIMARY KEY AUTOINCREMENT,\n      preset         TEXT NOT NULL DEFAULT '8up',\n      show_name      INTEGER NOT NULL DEFAULT 1,\n      show_price     INTEGER NOT NULL DEFAULT 1,\n      show_barcode   INTEGER NOT NULL DEFAULT 0,\n      show_code      INTEGER NOT NULL DEFAULT 0,\n      show_unit      INTEGER NOT NULL DEFAULT 1,\n      show_cut_lines INTEGER NOT NULL DEFAULT 1,\n      updated_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))\n    );\n\n    -- Database backup settings (singleton). auto_enabled gates the on-close +\n    -- midnight auto-backups; retention_count caps how many auto-*.db files are\n    -- kept. backup_dir is the user-chosen destination folder (NULL = default\n    -- userData/backups). last_auto_backup_at is set after each auto-backup.\n    CREATE TABLE IF NOT EXISTS backup_settings (\n      id INTEGER PRIMARY KEY AUTOINCREMENT,\n      auto_enabled    INTEGER NOT NULL DEFAULT 1,\n      retention_count INTEGER NOT NULL DEFAULT 7,\n      backup_dir      TEXT,\n      last_auto_backup_at TEXT,\n      updated_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))\n    );\n\n    -- Full tax invoices (\u0E43\u0E1A\u0E01\u0E33\u0E01\u0E31\u0E1A\u0E20\u0E32\u0E29\u0E35\u0E40\u0E15\u0E47\u0E21\u0E23\u0E39\u0E1B, \u0E21.86/4). One row per sale issued.\n    -- doc_no reuses the sale's invoice_no (RC-) as the running serial number.\n    -- Buyer fields are a snapshot taken at issue time (the customer record may\n    -- change later). original_printed gates the \"\u0E15\u0E49\u0E19\u0E09\u0E1A\u0E31\u0E1A\" vs \"\u0E2A\u0E33\u0E40\u0E19\u0E32\" header:\n    -- the first print stamps \u0E15\u0E49\u0E19\u0E09\u0E1A\u0E31\u0E1A and sets the flag; every reprint = \u0E2A\u0E33\u0E40\u0E19\u0E32.\n    CREATE TABLE IF NOT EXISTS tax_invoices (\n      id INTEGER PRIMARY KEY AUTOINCREMENT,\n      sale_id INTEGER NOT NULL UNIQUE REFERENCES sales(id) ON DELETE CASCADE,\n      doc_no TEXT NOT NULL,\n      buyer_name TEXT NOT NULL DEFAULT '',\n      buyer_address TEXT NOT NULL DEFAULT '',\n      buyer_tax_id TEXT NOT NULL DEFAULT '',\n      buyer_branch TEXT NOT NULL DEFAULT '',\n      original_printed INTEGER NOT NULL DEFAULT 0,\n      issued_by INTEGER REFERENCES users(id),\n      issued_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),\n      updated_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))\n    );\n\n    -- VAT mode transition audit. The shop's VAT status is never a free Settings\n    -- toggle \u2014 flipping VAT off mid-stream leaves a gap in the continuous RC-\n    -- sequence (\u0E2A\u0E23\u0E23\u0E1E\u0E32\u0E01\u0E23 red flag). Transitions go through guarded flows only:\n    -- action 'upgrade' (setup wizard / settings:upgradeToVat) and 'downgrade'\n    -- (settings:downgradeFromVat \u2014 admin password re-entry + mandatory reason).\n    -- Every transition is recorded here with who/when/why.\n    CREATE TABLE IF NOT EXISTS vat_audit_log (\n      id INTEGER PRIMARY KEY AUTOINCREMENT,\n      action TEXT NOT NULL,\n      tax_id TEXT NOT NULL DEFAULT '',\n      branch TEXT NOT NULL DEFAULT '',\n      vat_rate REAL NOT NULL DEFAULT 7,\n      effective_date TEXT,\n      reason TEXT,\n      performed_by INTEGER REFERENCES users(id),\n      created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))\n    );\n\n    -- Shop expenses (\u0E04\u0E48\u0E32\u0E43\u0E0A\u0E49\u0E08\u0E48\u0E32\u0E22) \u2014 manual operating-cost entries (rent, utilities,\n    -- salaries, \u2026) used by the Finance net-profit calc + the \u0E04\u0E48\u0E32\u0E43\u0E0A\u0E49\u0E08\u0E48\u0E32\u0E22 report.\n    CREATE TABLE IF NOT EXISTS expense_categories (\n      id INTEGER PRIMARY KEY AUTOINCREMENT,\n      name TEXT NOT NULL,\n      is_active INTEGER NOT NULL DEFAULT 1,\n      sort_order INTEGER NOT NULL DEFAULT 0,\n      created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),\n      updated_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))\n    );\n    CREATE TABLE IF NOT EXISTS expenses (\n      id INTEGER PRIMARY KEY AUTOINCREMENT,\n      expense_no TEXT NOT NULL UNIQUE,\n      expense_date TEXT NOT NULL,\n      category_id INTEGER REFERENCES expense_categories(id),\n      amount REAL NOT NULL,\n      reference_no TEXT,\n      note TEXT,\n      -- Input VAT (\u0E20\u0E32\u0E29\u0E35\u0E0B\u0E37\u0E49\u0E2D) on operating expenses. amount stays the full sum\n      -- paid (VAT-inclusive as on the receipt); vat_amount is the claimable\n      -- portion \u2014 only meaningful when has_tax_invoice = 1 (a full tax invoice\n      -- is required to claim; the \u0E20\u0E32\u0E29\u0E35\u0E0B\u0E37\u0E49\u0E2D report filters on it).\n      vat_amount REAL NOT NULL DEFAULT 0,\n      has_tax_invoice INTEGER NOT NULL DEFAULT 0,\n      created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),\n      updated_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))\n    );\n\n    -- Purchase receipt headers (GR-level metadata, one row per invoice_no).\n    -- Authoritative source for supplier / payment / dates of a GR.\n    -- product_lots also stores some of these for stock display, but is last-write-wins.\n    CREATE TABLE IF NOT EXISTS purchase_receipts (\n      invoice_no TEXT PRIMARY KEY,\n      supplier_id INTEGER REFERENCES suppliers(id),\n      supplier_invoice_no TEXT,\n      order_date TEXT,\n      payment_type TEXT NOT NULL DEFAULT 'cash',\n      due_date TEXT,\n      is_paid INTEGER NOT NULL DEFAULT 0,\n      paid_date TEXT,\n      note TEXT NOT NULL DEFAULT '',\n      discount_amount REAL NOT NULL DEFAULT 0,\n      surcharge_amount REAL NOT NULL DEFAULT 0,\n      -- Input VAT (\u0E20\u0E32\u0E29\u0E35\u0E0B\u0E37\u0E49\u0E2D) \u2014 declared PER BILL because not every supplier is\n      -- VAT-registered. vat_mode: 'none' | 'inclusive' (line prices contain\n      -- VAT). vat_amount is a snapshot computed at save time; the \u0E20\u0E32\u0E29\u0E35\u0E0B\u0E37\u0E49\u0E2D\n      -- report reads it directly.\n      vat_mode TEXT NOT NULL DEFAULT 'none',\n      vat_rate REAL NOT NULL DEFAULT 0,\n      vat_amount REAL NOT NULL DEFAULT 0,\n      status TEXT NOT NULL DEFAULT 'completed',\n      cancelled_at TEXT,\n      cancelled_by INTEGER REFERENCES users(id),\n      cancel_reason TEXT,\n      created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))\n    );\n\n    -- Purchase receipt line items (immutable receive ledger).\n    -- One row per line per GR. NEVER mutated after insert (except is_cancelled flag).\n    -- Source of truth for \u0E1B\u0E23\u0E30\u0E27\u0E31\u0E15\u0E34\u0E01\u0E32\u0E23\u0E23\u0E31\u0E1A\u0E2A\u0E34\u0E19\u0E04\u0E49\u0E32 history and cancellation.\n    CREATE TABLE IF NOT EXISTS purchase_receipt_items (\n      id INTEGER PRIMARY KEY AUTOINCREMENT,\n      invoice_no TEXT NOT NULL,\n      product_id INTEGER NOT NULL REFERENCES products(id),\n      lot_id INTEGER REFERENCES product_lots(id),\n      lot_number TEXT NOT NULL,\n      manufactured_date TEXT,\n      expiry_date TEXT,\n      cost_price REAL NOT NULL DEFAULT 0,\n      sell_price REAL NOT NULL DEFAULT 0,\n      qty REAL NOT NULL DEFAULT 0,\n      -- Received unit (\u0E01\u0E25\u0E48\u0E2D\u0E07/\u0E42\u0E2B\u0E25) kept for document fidelity; qty/cost above are\n      -- in this entered unit. Backend converts to base for stock/cost.\n      unit_name TEXT,\n      qty_per_base REAL NOT NULL DEFAULT 1,\n      note TEXT,\n      created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))\n    );\n    CREATE INDEX IF NOT EXISTS idx_pri_invoice ON purchase_receipt_items(invoice_no);\n    CREATE INDEX IF NOT EXISTS idx_pri_lot ON purchase_receipt_items(lot_id);\n\n    -- Supplier product alias (Invoice Matcher).\n    -- (supplier_id, normalized supplier_text) -> product_id. Grows from\n    -- human-confirmed first-time matches; after that, instant exact lookup.\n    -- supplier_text is stored normalized (trim, collapse whitespace, uppercase)\n    -- so \"PARA 500\" and \" para  500 \" collide on the same key.\n    CREATE TABLE IF NOT EXISTS supplier_product_alias (\n      id INTEGER PRIMARY KEY AUTOINCREMENT,\n      supplier_id INTEGER NOT NULL REFERENCES suppliers(id) ON DELETE CASCADE,\n      supplier_text TEXT NOT NULL,\n      product_id INTEGER NOT NULL REFERENCES products(id),\n      confidence REAL NOT NULL DEFAULT 1.0,\n      confirmed_by INTEGER REFERENCES users(id),\n      confirmed_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),\n      created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),\n      UNIQUE(supplier_id, supplier_text)\n    );\n    CREATE INDEX IF NOT EXISTS idx_alias_lookup ON supplier_product_alias(supplier_id, supplier_text);\n\n    -- Indexes\n    CREATE INDEX IF NOT EXISTS idx_products_barcode ON products(barcode);\n    CREATE INDEX IF NOT EXISTS idx_products_barcode2 ON products(barcode2);\n    CREATE INDEX IF NOT EXISTS idx_products_barcode3 ON products(barcode3);\n    CREATE INDEX IF NOT EXISTS idx_products_barcode4 ON products(barcode4);\n    CREATE INDEX IF NOT EXISTS idx_products_code ON products(code);\n    CREATE INDEX IF NOT EXISTS idx_product_lots_product ON product_lots(product_id);\n    CREATE INDEX IF NOT EXISTS idx_product_lots_expiry ON product_lots(expiry_date);\n    CREATE INDEX IF NOT EXISTS idx_sales_invoice ON sales(invoice_no);\n    CREATE INDEX IF NOT EXISTS idx_sales_sold_at ON sales(sold_at);\n    -- Reports hot path: every cost/profit aggregate joins sale_items \u2192 sale_item_lots\n    -- per sale. Without these the subquery does a full table scan, killing perf\n    -- once sales count > ~5k (financeSummary, salesPurchaseTrend, topProducts,\n    -- cashierLeaderboard all hit this). Also covers reports:getSale per-bill detail.\n    CREATE INDEX IF NOT EXISTS idx_sale_items_sale ON sale_items(sale_id);\n    CREATE INDEX IF NOT EXISTS idx_sale_items_product ON sale_items(product_id);\n    CREATE INDEX IF NOT EXISTS idx_sale_item_lots_sale_item ON sale_item_lots(sale_item_id);\n    CREATE INDEX IF NOT EXISTS idx_sale_item_lots_lot ON sale_item_lots(lot_id);\n    CREATE INDEX IF NOT EXISTS idx_sale_item_lots_product ON sale_item_lots(product_id);\n    -- Same story for purchase aggregates and history filtering.\n    CREATE INDEX IF NOT EXISTS idx_purchase_receipts_created ON purchase_receipts(created_at);\n    CREATE INDEX IF NOT EXISTS idx_purchase_receipts_supplier ON purchase_receipts(supplier_id);\n    CREATE INDEX IF NOT EXISTS idx_stock_movements_product ON stock_movements(product_id, lot_id);\n    CREATE INDEX IF NOT EXISTS idx_stock_movements_type ON stock_movements(movement_type);\n    CREATE INDEX IF NOT EXISTS idx_stock_movements_created ON stock_movements(created_at);\n    CREATE INDEX IF NOT EXISTS idx_price_logs_product ON price_logs(product_id, created_at DESC);\n    CREATE INDEX IF NOT EXISTS idx_expenses_no ON expenses(expense_no);\n    CREATE INDEX IF NOT EXISTS idx_expenses_date ON expenses(expense_date);\n    CREATE INDEX IF NOT EXISTS idx_expenses_category ON expenses(category_id);\n\n    -- GPP environmental monitoring log (\u0E1A\u0E31\u0E19\u0E17\u0E36\u0E01\u0E2D\u0E38\u0E13\u0E2B\u0E20\u0E39\u0E21\u0E34\u2013\u0E04\u0E27\u0E32\u0E21\u0E0A\u0E37\u0E49\u0E19).\n    -- One row per (log_date, period): 1=\u0E40\u0E0A\u0E49\u0E32 2=\u0E01\u0E25\u0E32\u0E07\u0E27\u0E31\u0E19 3=\u0E40\u0E22\u0E47\u0E19. Manual entry \u2014\n    -- numeric cells stay NULL until measured (never coerced to 0).\n    CREATE TABLE IF NOT EXISTS env_log (\n      id INTEGER PRIMARY KEY AUTOINCREMENT,\n      log_date TEXT NOT NULL,            -- 'YYYY-MM-DD'\n      period   INTEGER NOT NULL,         -- 1=\u0E40\u0E0A\u0E49\u0E32 2=\u0E01\u0E25\u0E32\u0E07\u0E27\u0E31\u0E19 3=\u0E40\u0E22\u0E47\u0E19\n      store_temp REAL, store_humidity REAL,\n      reserve_temp REAL, reserve_humidity REAL,\n      fridge_temp REAL,\n      note TEXT,\n      recorded_by INTEGER REFERENCES users(id),\n      created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),\n      updated_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),\n      UNIQUE(log_date, period)\n    );\n    CREATE TABLE IF NOT EXISTS env_settings (\n      id INTEGER PRIMARY KEY AUTOINCREMENT,\n      zone_reserve_enabled INTEGER NOT NULL DEFAULT 1,\n      zone_fridge_enabled  INTEGER NOT NULL DEFAULT 1,\n      store_temp_max       REAL NOT NULL DEFAULT 30,\n      store_humidity_max   REAL NOT NULL DEFAULT 75,\n      reserve_temp_max     REAL NOT NULL DEFAULT 30,\n      reserve_humidity_max REAL NOT NULL DEFAULT 75,\n      fridge_temp_min      REAL NOT NULL DEFAULT 2,\n      fridge_temp_max      REAL NOT NULL DEFAULT 8,\n      updated_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))\n    );\n  ");
    // Safe column migrations for existing databases
    for (var _i = 0, _a = [
        "ALTER TABLE purchase_receipts ADD COLUMN discount_amount REAL NOT NULL DEFAULT 0",
        "ALTER TABLE purchase_receipts ADD COLUMN surcharge_amount REAL NOT NULL DEFAULT 0",
        // Input VAT (ภาษีซื้อ) per GR — see the purchase_receipts CREATE TABLE comment.
        "ALTER TABLE purchase_receipts ADD COLUMN vat_mode TEXT NOT NULL DEFAULT 'none'",
        "ALTER TABLE purchase_receipts ADD COLUMN vat_rate REAL NOT NULL DEFAULT 0",
        "ALTER TABLE purchase_receipts ADD COLUMN vat_amount REAL NOT NULL DEFAULT 0",
        // Input VAT (ภาษีซื้อ) on expenses — see the expenses CREATE TABLE comment.
        "ALTER TABLE expenses ADD COLUMN vat_amount REAL NOT NULL DEFAULT 0",
        "ALTER TABLE expenses ADD COLUMN has_tax_invoice INTEGER NOT NULL DEFAULT 0",
        // Downgrade flow records why VAT was turned off (DBs created before this
        // column already have the table from the same release).
        "ALTER TABLE vat_audit_log ADD COLUMN reason TEXT",
        // GR received unit conversion: keep the entered receiving unit + its
        // qty_per_base on the ledger (document fidelity); backend stores base.
        "ALTER TABLE purchase_receipt_items ADD COLUMN unit_name TEXT",
        "ALTER TABLE purchase_receipt_items ADD COLUMN qty_per_base REAL NOT NULL DEFAULT 1",
        // POS quantity multiplier (*N) feature toggle — default on for existing DBs.
        "ALTER TABLE sales_settings ADD COLUMN qty_multiplier_enabled INTEGER NOT NULL DEFAULT 1",
        "ALTER TABLE sales_settings ADD COLUMN vat_enabled INTEGER NOT NULL DEFAULT 0",
        "ALTER TABLE sales_settings ADD COLUMN vat_rate REAL NOT NULL DEFAULT 7",
        // VAT is now an all-or-nothing global switch (sales_settings.vat_enabled);
        // POS taxes every line when on, so the per-product has_vat flag is gone.
        "ALTER TABLE products DROP COLUMN has_vat",
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
        // default_qty: re-adds the PHP "จำนวนตั้งต้นการขายใน POS" — starting cart qty.
        "ALTER TABLE products ADD COLUMN default_qty REAL NOT NULL DEFAULT 1",
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
        // Label restructure: new sections shop_address / timing / advice each get a
        // show toggle + X/Y nudge. shop_address & advice split out of the old
        // shop/notes lines; timing splits dose+frequency off into its own line.
        "ALTER TABLE label_settings ADD COLUMN show_shop_address  INTEGER NOT NULL DEFAULT 1",
        "ALTER TABLE label_settings ADD COLUMN show_timing        INTEGER NOT NULL DEFAULT 1",
        "ALTER TABLE label_settings ADD COLUMN show_advice        INTEGER NOT NULL DEFAULT 1",
        "ALTER TABLE label_settings ADD COLUMN offset_x_shop_address REAL NOT NULL DEFAULT 0",
        "ALTER TABLE label_settings ADD COLUMN offset_y_shop_address REAL NOT NULL DEFAULT 0",
        "ALTER TABLE label_settings ADD COLUMN offset_x_timing       REAL NOT NULL DEFAULT 0",
        "ALTER TABLE label_settings ADD COLUMN offset_y_timing       REAL NOT NULL DEFAULT 0",
        "ALTER TABLE label_settings ADD COLUMN offset_x_advice       REAL NOT NULL DEFAULT 0",
        "ALTER TABLE label_settings ADD COLUMN offset_y_advice       REAL NOT NULL DEFAULT 0",
        // Label section-split: every text section now owns its own font_size_<key> +
        // bold_<key>; new sections shop_phone / shop_line_id / custom_text get the
        // full show + X/Y set too. The retired shared "font_size_small" tier stays as
        // a DEAD column. (font_size_shop/product/dosage + bold_shop/product/dosage
        // already exist; ADD COLUMN on them throws "duplicate column" and is swallowed
        // by the try/catch — defaults for fresh DBs live in the CREATE TABLE above.)
        "ALTER TABLE label_settings ADD COLUMN custom_text TEXT NOT NULL DEFAULT ''",
        "ALTER TABLE label_settings ADD COLUMN font_size_shop_address  REAL NOT NULL DEFAULT 10",
        "ALTER TABLE label_settings ADD COLUMN font_size_shop_phone    REAL NOT NULL DEFAULT 10",
        "ALTER TABLE label_settings ADD COLUMN font_size_shop_line_id  REAL NOT NULL DEFAULT 10",
        "ALTER TABLE label_settings ADD COLUMN font_size_timing        REAL NOT NULL DEFAULT 10",
        "ALTER TABLE label_settings ADD COLUMN font_size_indication    REAL NOT NULL DEFAULT 10",
        "ALTER TABLE label_settings ADD COLUMN font_size_advice        REAL NOT NULL DEFAULT 10",
        "ALTER TABLE label_settings ADD COLUMN font_size_barcode       REAL NOT NULL DEFAULT 10",
        "ALTER TABLE label_settings ADD COLUMN font_size_custom_text   REAL NOT NULL DEFAULT 10",
        "ALTER TABLE label_settings ADD COLUMN bold_shop_address  INTEGER NOT NULL DEFAULT 1",
        "ALTER TABLE label_settings ADD COLUMN bold_shop_phone    INTEGER NOT NULL DEFAULT 1",
        "ALTER TABLE label_settings ADD COLUMN bold_shop_line_id  INTEGER NOT NULL DEFAULT 0",
        "ALTER TABLE label_settings ADD COLUMN bold_timing        INTEGER NOT NULL DEFAULT 0",
        "ALTER TABLE label_settings ADD COLUMN bold_indication    INTEGER NOT NULL DEFAULT 0",
        "ALTER TABLE label_settings ADD COLUMN bold_advice        INTEGER NOT NULL DEFAULT 0",
        "ALTER TABLE label_settings ADD COLUMN bold_barcode       INTEGER NOT NULL DEFAULT 0",
        "ALTER TABLE label_settings ADD COLUMN bold_custom_text   INTEGER NOT NULL DEFAULT 0",
        "ALTER TABLE label_settings ADD COLUMN show_shop_phone    INTEGER NOT NULL DEFAULT 1",
        "ALTER TABLE label_settings ADD COLUMN show_shop_line_id  INTEGER NOT NULL DEFAULT 1",
        "ALTER TABLE label_settings ADD COLUMN show_custom_text   INTEGER NOT NULL DEFAULT 1",
        "ALTER TABLE label_settings ADD COLUMN offset_x_shop_phone   REAL NOT NULL DEFAULT 0",
        "ALTER TABLE label_settings ADD COLUMN offset_y_shop_phone   REAL NOT NULL DEFAULT 0",
        "ALTER TABLE label_settings ADD COLUMN offset_x_shop_line_id REAL NOT NULL DEFAULT 0",
        "ALTER TABLE label_settings ADD COLUMN offset_y_shop_line_id REAL NOT NULL DEFAULT 0",
        "ALTER TABLE label_settings ADD COLUMN offset_x_custom_text  REAL NOT NULL DEFAULT 0",
        "ALTER TABLE label_settings ADD COLUMN offset_y_custom_text  REAL NOT NULL DEFAULT 0",
        // Print date split out of the shop section into its own settings (show/font/
        // bold/offset). It is NOT a standalone line — it's folded into the shop flex
        // row (right side) and styled by these columns. Defaults: 10pt, not bold, shown.
        "ALTER TABLE label_settings ADD COLUMN font_size_print_date  REAL NOT NULL DEFAULT 10",
        "ALTER TABLE label_settings ADD COLUMN bold_print_date    INTEGER NOT NULL DEFAULT 0",
        "ALTER TABLE label_settings ADD COLUMN show_print_date    INTEGER NOT NULL DEFAULT 1",
        "ALTER TABLE label_settings ADD COLUMN offset_x_print_date   REAL NOT NULL DEFAULT 0",
        "ALTER TABLE label_settings ADD COLUMN offset_y_print_date   REAL NOT NULL DEFAULT 0",
        // Barcode WIDTH (mm) — pairs with font_size_barcode (HEIGHT). The bars stretch
        // to fill this box so a short code and a long code occupy the same footprint.
        "ALTER TABLE label_settings ADD COLUMN barcode_width_mm      REAL NOT NULL DEFAULT 40",
        // จำนวน (qty) folds into the product flex row (right, like print_date → shop);
        // วันหมดอายุ (expiry) folds into the dosage row (right). Both pull sale context —
        // qty = summed cart qty per product, expiry = the FEFO lot's expiry — so they
        // render blank outside POS print (no sale). Full per-section column set each.
        "ALTER TABLE label_settings ADD COLUMN show_qty           INTEGER NOT NULL DEFAULT 1",
        "ALTER TABLE label_settings ADD COLUMN font_size_qty      REAL NOT NULL DEFAULT 10",
        "ALTER TABLE label_settings ADD COLUMN bold_qty           INTEGER NOT NULL DEFAULT 0",
        "ALTER TABLE label_settings ADD COLUMN offset_x_qty       REAL NOT NULL DEFAULT 0",
        "ALTER TABLE label_settings ADD COLUMN offset_y_qty       REAL NOT NULL DEFAULT 0",
        "ALTER TABLE label_settings ADD COLUMN show_expiry        INTEGER NOT NULL DEFAULT 1",
        "ALTER TABLE label_settings ADD COLUMN font_size_expiry   REAL NOT NULL DEFAULT 10",
        "ALTER TABLE label_settings ADD COLUMN bold_expiry        INTEGER NOT NULL DEFAULT 0",
        "ALTER TABLE label_settings ADD COLUMN offset_x_expiry    REAL NOT NULL DEFAULT 0",
        "ALTER TABLE label_settings ADD COLUMN offset_y_expiry    REAL NOT NULL DEFAULT 0",
        // ความถี่ (frequency) split out of วิธีใช้ (dosage) into its own line so the two
        // position independently. Full per-section column set; default show = 1.
        "ALTER TABLE label_settings ADD COLUMN show_frequency     INTEGER NOT NULL DEFAULT 1",
        "ALTER TABLE label_settings ADD COLUMN font_size_frequency REAL NOT NULL DEFAULT 10",
        "ALTER TABLE label_settings ADD COLUMN bold_frequency     INTEGER NOT NULL DEFAULT 0",
        "ALTER TABLE label_settings ADD COLUMN offset_x_frequency REAL NOT NULL DEFAULT 0",
        "ALTER TABLE label_settings ADD COLUMN offset_y_frequency REAL NOT NULL DEFAULT 0",
        // product_labels restructure: persist the advice + time-of-day lookups and
        // the per-label default / show-barcode toggles. Without these columns the
        // saveLabel UPDATE (dynamic from Object.keys) threw "no such column".
        // English สรรพคุณ (indication) — completes the 4-language set (th/en/mm/zh)
        // so the POS label-print language switch can render English. lookups already
        // carry name_en; this fills the per-product gap.
        "ALTER TABLE product_labels ADD COLUMN indication_en TEXT",
        "ALTER TABLE product_labels ADD COLUMN label_time_id INTEGER REFERENCES label_times(id)",
        "ALTER TABLE product_labels ADD COLUMN advice_id INTEGER REFERENCES label_advices(id)",
        "ALTER TABLE product_labels ADD COLUMN is_default INTEGER NOT NULL DEFAULT 0",
        "ALTER TABLE product_labels ADD COLUMN show_barcode INTEGER NOT NULL DEFAULT 0",
        // Expiry thresholds moved to fixed constants in src/lib/expiry.ts — drop the
        // now-unused settings columns from existing DBs.
        "ALTER TABLE sales_settings DROP COLUMN expiry_warn_months",
        "ALTER TABLE sales_settings DROP COLUMN expiry_danger_months",
        // Seller branch for tax invoices (ม.86/4 requires "สำนักงานใหญ่"/branch no.).
        "ALTER TABLE settings ADD COLUMN shop_branch TEXT NOT NULL DEFAULT '\u0E2A\u0E33\u0E19\u0E31\u0E01\u0E07\u0E32\u0E19\u0E43\u0E2B\u0E0D\u0E48'",
        "ALTER TABLE settings ADD COLUMN shop_postcode TEXT NOT NULL DEFAULT ''",
        // User-chosen auto-backup destination folder (NULL = default userData/backups).
        "ALTER TABLE backup_settings ADD COLUMN backup_dir TEXT",
        // First-run setup gate. setup_completed=0 forces the setup wizard before the
        // app is usable. ALTERs MUST precede the backfill UPDATE below (same array,
        // ordered) so the column exists when the UPDATE references it on first run.
        "ALTER TABLE settings ADD COLUMN setup_completed INTEGER NOT NULL DEFAULT 0",
        "ALTER TABLE settings ADD COLUMN setup_completed_at TEXT",
        "ALTER TABLE settings ADD COLUMN vat_registered_date TEXT",
        // Backfill: mark pre-existing LIVE installs (anything with a sale) as already
        // set up so the wizard never blocks them. Migrations run before seed
        // (electron/db/index.ts) and on every launch with errors swallowed, so this
        // must be self-idempotent via its WHERE:
        //  - existing install w/ sales → set to 1 once, re-runs no-op (already 1)
        //  - fresh install → no settings row yet at migration time → 0 rows; seed
        //    later inserts the row with default 0 → wizard shows
        //  - fresh install reopened before finishing the wizard (row exists,
        //    setup_completed=0, still no sales) → EXISTS sales false → stays 0 →
        //    wizard reappears (no false-complete)
        "UPDATE settings SET setup_completed = 1, setup_completed_at = datetime('now','localtime')\n       WHERE setup_completed = 0 AND EXISTS (SELECT 1 FROM sales LIMIT 1)",
        // Login/auth columns on users (slice 1): recovery code + brute-force lockout.
        "ALTER TABLE users ADD COLUMN recovery_code_hash TEXT",
        "ALTER TABLE users ADD COLUMN failed_attempts INTEGER NOT NULL DEFAULT 0",
        "ALTER TABLE users ADD COLUMN locked_until TEXT",
        // Recovery-code lockout — a separate counter from login (Phase 2.5).
        "ALTER TABLE users ADD COLUMN recovery_failed_attempts INTEGER NOT NULL DEFAULT 0",
        "ALTER TABLE users ADD COLUMN recovery_locked_until TEXT",
        // Profile fields: structured name + login username + phone. `name` is kept
        // as an auto-composed display string (first+last) so the many report joins on
        // users.name stay populated. username is the login identity (unique via index
        // below); "required" is enforced in saveStaff, not at the column level (ALTER
        // can only add it nullable).
        "ALTER TABLE users ADD COLUMN first_name TEXT NOT NULL DEFAULT ''",
        "ALTER TABLE users ADD COLUMN last_name TEXT NOT NULL DEFAULT ''",
        "ALTER TABLE users ADD COLUMN username TEXT",
        "ALTER TABLE users ADD COLUMN phone TEXT",
        // A4 documents can now be issued on A4 or A5 — page size is configurable
        // per the document_settings singleton (was hard-locked to A4).
        "ALTER TABLE document_settings ADD COLUMN paper_size TEXT NOT NULL DEFAULT 'A4'",
        // receipt_settings: per-section style (SSOT src/lib/receipt/sections.ts).
        // show_/bold_ = 0|1, align_ = 'left'|'center'|'right'|'justify'. Font size
        // stays the single global `font_size` column. header_note is retired (dropped
        // below) — the slip's only free text is footer_note.
        "ALTER TABLE receipt_settings ADD COLUMN show_shop          INTEGER NOT NULL DEFAULT 1",
        "ALTER TABLE receipt_settings ADD COLUMN bold_shop          INTEGER NOT NULL DEFAULT 1",
        "ALTER TABLE receipt_settings ADD COLUMN align_shop          TEXT NOT NULL DEFAULT 'center'",
        "ALTER TABLE receipt_settings ADD COLUMN show_shop_contact  INTEGER NOT NULL DEFAULT 1",
        "ALTER TABLE receipt_settings ADD COLUMN bold_shop_contact  INTEGER NOT NULL DEFAULT 0",
        "ALTER TABLE receipt_settings ADD COLUMN align_shop_contact  TEXT NOT NULL DEFAULT 'center'",
        "ALTER TABLE receipt_settings ADD COLUMN show_tax_id        INTEGER NOT NULL DEFAULT 1",
        "ALTER TABLE receipt_settings ADD COLUMN bold_tax_id        INTEGER NOT NULL DEFAULT 0",
        "ALTER TABLE receipt_settings ADD COLUMN align_tax_id        TEXT NOT NULL DEFAULT 'center'",
        "ALTER TABLE receipt_settings ADD COLUMN show_title         INTEGER NOT NULL DEFAULT 1",
        "ALTER TABLE receipt_settings ADD COLUMN bold_title         INTEGER NOT NULL DEFAULT 1",
        "ALTER TABLE receipt_settings ADD COLUMN align_title         TEXT NOT NULL DEFAULT 'center'",
        "ALTER TABLE receipt_settings ADD COLUMN show_bill_info     INTEGER NOT NULL DEFAULT 1",
        "ALTER TABLE receipt_settings ADD COLUMN bold_bill_info     INTEGER NOT NULL DEFAULT 0",
        "ALTER TABLE receipt_settings ADD COLUMN align_bill_info     TEXT NOT NULL DEFAULT 'justify'",
        "ALTER TABLE receipt_settings ADD COLUMN show_summary       INTEGER NOT NULL DEFAULT 1",
        "ALTER TABLE receipt_settings ADD COLUMN bold_summary       INTEGER NOT NULL DEFAULT 0",
        "ALTER TABLE receipt_settings ADD COLUMN align_summary       TEXT NOT NULL DEFAULT 'justify'",
        "ALTER TABLE receipt_settings ADD COLUMN show_payment       INTEGER NOT NULL DEFAULT 1",
        "ALTER TABLE receipt_settings ADD COLUMN bold_payment       INTEGER NOT NULL DEFAULT 0",
        "ALTER TABLE receipt_settings ADD COLUMN align_payment       TEXT NOT NULL DEFAULT 'justify'",
        "ALTER TABLE receipt_settings ADD COLUMN show_footer        INTEGER NOT NULL DEFAULT 1",
        "ALTER TABLE receipt_settings ADD COLUMN bold_footer        INTEGER NOT NULL DEFAULT 0",
        "ALTER TABLE receipt_settings ADD COLUMN align_footer        TEXT NOT NULL DEFAULT 'center'",
        "ALTER TABLE receipt_settings ADD COLUMN show_salesperson   INTEGER NOT NULL DEFAULT 1",
        "ALTER TABLE receipt_settings ADD COLUMN bold_salesperson   INTEGER NOT NULL DEFAULT 0",
        "ALTER TABLE receipt_settings ADD COLUMN align_salesperson   TEXT NOT NULL DEFAULT 'center'",
        // รูปแบบบล็อกรายการสินค้า: 'detailed' (เดิม) | 'table' (ตาราง 1 บรรทัด/รายการ).
        "ALTER TABLE receipt_settings ADD COLUMN items_layout       TEXT NOT NULL DEFAULT 'detailed'",
        // Retire the receipt header note (owner doesn't use it). DROP COLUMN needs
        // SQLite 3.35+ (bundled); the loop's per-statement try/catch swallows it on
        // older engines, where the column simply lingers unused (harmless).
        "ALTER TABLE receipt_settings DROP COLUMN header_note",
    ]; _i < _a.length; _i++) {
        var sql = _a[_i];
        try {
            db.exec(sql);
        }
        catch (_b) { }
    }
    // One-time: Sarabun is now the default receipt font (matches label_settings
    // and the UI Thai font). Flip installs still holding the OLD 'Bai Jamjuree'
    // default to Sarabun. Guarded by user_version (this is the first use of it in
    // the app — claim version 1) so a later *deliberate* re-selection of Bai
    // Jamjuree in Settings is NOT reverted on the next launch.
    try {
        var fontVer = db.pragma('user_version', { simple: true });
        if (!fontVer || fontVer < 1) {
            db.exec("UPDATE receipt_settings SET font_family = 'Sarabun' WHERE font_family = 'Bai Jamjuree'");
            db.pragma('user_version = 1');
        }
    }
    catch (_c) { }
    // Migration (user_version 2): backfill the new users profile fields.
    //   - first_name  ← existing display name (so users.name stays meaningful and
    //     report joins on users.name keep working; last_name stays '').
    //   - username    ← 'admin' for the owner admin (email-keyed, the load-bearing
    //     account), else the email local-part sanitized; de-duped IN JS (a numeric
    //     suffix on collision) because a per-group unique suffix can't be expressed
    //     in a single SQL UPDATE. Done row-by-row inside one transaction.
    // The UNIQUE index is created AFTER de-dup guarantees uniqueness, so it can't
    // throw on legacy dirty data. Guarded by user_version so it runs exactly once.
    try {
        var ver = db.pragma('user_version', { simple: true });
        if (!ver || ver < 2) {
            db.transaction(function () {
                var _a;
                db.exec("UPDATE users SET first_name = name WHERE first_name = ''");
                var rows = db.prepare("SELECT id, email FROM users").all();
                var taken = new Set();
                var setUsername = db.prepare("UPDATE users SET username = ? WHERE id = ?");
                for (var _i = 0, rows_1 = rows; _i < rows_1.length; _i++) {
                    var r = rows_1[_i];
                    var base = void 0;
                    if (r.email === 'admin@syntropic.local') {
                        base = 'admin';
                    }
                    else {
                        var local = ((_a = r.email) !== null && _a !== void 0 ? _a : '').split('@')[0].toLowerCase().replace(/[^a-z0-9_.]/g, '');
                        base = local || "user".concat(r.id);
                    }
                    var candidate = base;
                    var n = 1;
                    while (taken.has(candidate)) {
                        n += 1;
                        candidate = "".concat(base).concat(n);
                    }
                    taken.add(candidate);
                    setUsername.run(candidate, r.id);
                }
            })();
            db.pragma('user_version = 2');
        }
    }
    catch (_d) { }
    // De-dup above guarantees uniqueness; create the index defensively (never
    // hard-crash boot — keep the file's swallow convention).
    try {
        db.exec("CREATE UNIQUE INDEX IF NOT EXISTS idx_users_username ON users(username)");
    }
    catch (_e) { }
    // Migration: drop the vestigial item_units.multiply column. Never read by any
    // business logic — per-product conversion lives in product_units.qty_per_base.
    try {
        db.exec("ALTER TABLE item_units DROP COLUMN multiply");
    }
    catch (_f) { }
    // Ensure a fallback unit exists.
    try {
        db.exec("INSERT OR IGNORE INTO item_units (name) VALUES ('\u0E0A\u0E34\u0E49\u0E19')");
    }
    catch (_g) { }
    // Migration: FDA report columns — drug_types gets boolean flags, products renamed.
    // Order matters: drug_types flags must exist before products backfill uses them.
    for (var _h = 0, _j = [
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
    ]; _h < _j.length; _h++) {
        var sql = _j[_h];
        try {
            db.exec(sql);
        }
        catch (_k) { }
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
    for (var _l = 0, _m = [
        "ALTER TABLE products ADD COLUMN last_cost_price REAL NOT NULL DEFAULT 0",
        "UPDATE products SET last_cost_price = COALESCE((\n        SELECT pl.cost_price FROM product_lots pl\n        WHERE pl.product_id = products.id AND pl.cost_price > 0\n        ORDER BY pl.created_at DESC, pl.id DESC LIMIT 1\n      ), 0)\n      WHERE last_cost_price = 0",
    ]; _l < _m.length; _l++) {
        var sql = _m[_l];
        try {
            db.exec(sql);
        }
        catch (_o) { }
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
    for (var _p = 0, _q = [
        // 1. Repoint drug_allergies at the surviving row for its generic name.
        "UPDATE drug_allergies SET generic_name_id = (\n        SELECT MIN(d2.id) FROM drug_generic_names d2\n        WHERE d2.name = (SELECT d1.name FROM drug_generic_names d1\n                         WHERE d1.id = drug_allergies.generic_name_id)\n      ) WHERE generic_name_id IS NOT NULL",
        // 2. Delete every row that isn't the MIN id for its name.
        "DELETE FROM drug_generic_names WHERE id NOT IN (\n        SELECT MIN(id) FROM drug_generic_names GROUP BY name\n      )",
        // 3. Block future dups — now INSERT OR IGNORE works as intended.
        "CREATE UNIQUE INDEX IF NOT EXISTS idx_drug_generic_names_name\n        ON drug_generic_names(name)",
    ]; _p < _q.length; _p++) {
        var sql = _q[_p];
        try {
            db.exec(sql);
        }
        catch (_r) { }
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
    catch (_s) { }
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
    catch (_t) { }
    try {
        db.exec("ALTER TABLE product_units DROP COLUMN is_base_unit");
    }
    catch (_u) { }
    // Customers: add is_disabled (mirror suppliers/users soft-disable). Existing
    // is_hidden was the de-facto soft-delete flag; backfill so previously "deleted"
    // customers carry over as disabled under the new flag.
    for (var _v = 0, _w = [
        "ALTER TABLE customers ADD COLUMN is_disabled INTEGER NOT NULL DEFAULT 0",
        "UPDATE customers SET is_disabled = 1 WHERE is_hidden = 1 AND is_disabled = 0",
        // Tax-invoice branch (สาขา) — paired with id_card (which doubles as the
        // buyer's เลขประจำตัวผู้เสียภาษี, same 13 digits). The tax-invoice dialog reads
        // these read-only from the sale's linked customer (Tax Invoice Flow Rework).
        // No separate tax_id column: a pharmacy stores every member as a person, so
        // id_card IS the tax id.
        "ALTER TABLE customers ADD COLUMN branch TEXT",
    ]; _v < _w.length; _v++) {
        var sql = _w[_v];
        try {
            db.exec(sql);
        }
        catch (_x) { }
    }
    // Drop unused columns — UI no longer reads/writes these. Try/catch absorbs
    // "no such column" on re-run. Order matters: customers.is_hidden drop runs
    // AFTER the is_hidden→is_disabled backfill above.
    for (var _y = 0, _z = [
        "ALTER TABLE customers DROP COLUMN hn",
        "ALTER TABLE customers DROP COLUMN hc_uc",
        "ALTER TABLE customers DROP COLUMN hc_gov",
        "ALTER TABLE customers DROP COLUMN hc_sso",
        "ALTER TABLE customers DROP COLUMN other_allergy",
        "ALTER TABLE customers DROP COLUMN food_allergy",
        "ALTER TABLE customers DROP COLUMN warning_note",
        "ALTER TABLE customers DROP COLUMN is_hidden",
        "ALTER TABLE suppliers DROP COLUMN contact_name",
        // ลำดับฉลาก (sort_order) ถอดออก — ฉลากเรียงตาม id (ลำดับสร้าง) แทน.
        "ALTER TABLE product_labels DROP COLUMN sort_order",
    ]; _y < _z.length; _y++) {
        var sql = _z[_y];
        try {
            db.exec(sql);
        }
        catch (_0) { }
    }
    // Migration: split the sale_return movement type. Voids and genuine customer
    // returns both used to write movement_type='sale_return', distinguished only
    // by ref_type ('sale' = void, 'return' = real return). Promote voids to their
    // own 'sale_void' type so the history/filter can tell them apart. The
    // ref_type predicate makes this exact + idempotent (no rows match on re-run).
    try {
        db.exec("UPDATE stock_movements SET movement_type = 'sale_void' WHERE movement_type = 'sale_return' AND ref_type = 'sale'");
    }
    catch (_1) { }
    // Refresh query-planner stats so the planner picks the new indexes added
    // above on first launch (and on later launches where data has grown).
    // PRAGMA optimize is cheap when stats are fresh — only re-ANALYZEs tables
    // whose stats are stale.
    try {
        db.exec("PRAGMA optimize");
    }
    catch (_2) { }
}
