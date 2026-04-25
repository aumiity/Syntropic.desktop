import type Database from 'better-sqlite3'

export function initializeSchema(db: Database.Database) {
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;

    -- Users / Staff
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL DEFAULT '',
      role TEXT NOT NULL DEFAULT 'staff',
      is_disabled INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
    );

    -- Settings
    CREATE TABLE IF NOT EXISTS settings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      shop_name TEXT NOT NULL DEFAULT '',
      shop_address TEXT NOT NULL DEFAULT '',
      shop_phone TEXT NOT NULL DEFAULT '',
      shop_license_no TEXT NOT NULL DEFAULT '',
      shop_tax_id TEXT NOT NULL DEFAULT '',
      shop_line_id TEXT NOT NULL DEFAULT '',
      updated_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
    );

    -- Product Categories
    CREATE TABLE IF NOT EXISTS product_categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      description TEXT,
      sort_order INTEGER NOT NULL DEFAULT 0,
      is_disabled INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
    );

    -- Item Units (base units: Tablet, Box, Bottle, etc.)
    CREATE TABLE IF NOT EXISTS item_units (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      multiply INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
    );

    -- Drug Types (GENERAL, DANGEROUS, etc.)
    CREATE TABLE IF NOT EXISTS drug_types (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT NOT NULL UNIQUE,
      name_th TEXT NOT NULL,
      khor_yor_report TEXT,
      is_disabled INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
    );

    -- Dosage Forms (Tablet, Capsule, Syrup, etc.)
    CREATE TABLE IF NOT EXISTS dosage_forms (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name_th TEXT NOT NULL,
      name_en TEXT,
      is_disabled INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
    );

    -- Drug Generic Names
    CREATE TABLE IF NOT EXISTS drug_generic_names (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      is_disabled INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
    );

    -- Products
    CREATE TABLE IF NOT EXISTS products (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      barcode TEXT,
      barcode2 TEXT,
      barcode3 TEXT,
      barcode4 TEXT,
      code TEXT,
      trade_name TEXT NOT NULL,
      name_for_print TEXT,
      category_id INTEGER REFERENCES product_categories(id),
      dosage_form_id INTEGER REFERENCES dosage_forms(id),
      unit_id INTEGER REFERENCES item_units(id),
      is_stock_item INTEGER NOT NULL DEFAULT 1,
      is_disabled INTEGER NOT NULL DEFAULT 0,
      is_hidden INTEGER NOT NULL DEFAULT 0,
      price_retail REAL NOT NULL DEFAULT 0,
      price_wholesale1 REAL NOT NULL DEFAULT 0,
      price_wholesale2 REAL NOT NULL DEFAULT 0,
      cost_price REAL NOT NULL DEFAULT 0,
      has_vat INTEGER NOT NULL DEFAULT 0,
      no_discount INTEGER NOT NULL DEFAULT 0,
      reorder_point REAL,
      safety_stock REAL,
      expiry_alert_days1 INTEGER DEFAULT 90,
      expiry_alert_days2 INTEGER DEFAULT 60,
      expiry_alert_days3 INTEGER DEFAULT 30,
      drug_type_id INTEGER REFERENCES drug_types(id),
      strength TEXT,
      registration_no TEXT,
      tmt_id TEXT,
      is_original_drug INTEGER NOT NULL DEFAULT 0,
      is_antibiotic INTEGER NOT NULL DEFAULT 0,
      max_dispense_qty REAL,
      indication_note TEXT,
      side_effect_note TEXT,
      is_fda_report INTEGER NOT NULL DEFAULT 0,
      is_fda13_report INTEGER NOT NULL DEFAULT 0,
      is_sale_control INTEGER NOT NULL DEFAULT 0,
      sale_control_qty REAL,
      search_keywords TEXT,
      note TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
    );

    -- Product Unit Variants
    CREATE TABLE IF NOT EXISTS product_units (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
      unit_id INTEGER NOT NULL REFERENCES item_units(id),
      barcode TEXT,
      qty_per_base REAL NOT NULL DEFAULT 1,
      price_retail REAL NOT NULL DEFAULT 0,
      price_wholesale1 REAL NOT NULL DEFAULT 0,
      price_wholesale2 REAL NOT NULL DEFAULT 0,
      is_base_unit INTEGER NOT NULL DEFAULT 0,
      is_for_sale INTEGER NOT NULL DEFAULT 1,
      is_for_purchase INTEGER NOT NULL DEFAULT 0,
      is_disabled INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
    );

    -- Product Lots / Batches
    CREATE TABLE IF NOT EXISTS product_lots (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      product_id INTEGER NOT NULL REFERENCES products(id),
      supplier_id INTEGER REFERENCES suppliers(id),
      lot_number TEXT NOT NULL,
      manufactured_date TEXT,
      expiry_date TEXT,
      cost_price REAL NOT NULL DEFAULT 0,
      sell_price REAL NOT NULL DEFAULT 0,
      qty_received REAL NOT NULL DEFAULT 0,
      qty_on_hand REAL NOT NULL DEFAULT 0,
      qty_reserved REAL NOT NULL DEFAULT 0,
      invoice_no TEXT,
      supplier_invoice_no TEXT,
      payment_type TEXT DEFAULT 'cash',
      due_date TEXT,
      is_paid INTEGER NOT NULL DEFAULT 1,
      paid_date TEXT,
      is_closed INTEGER NOT NULL DEFAULT 0,
      closed_at TEXT,
      note TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
      UNIQUE(product_id, lot_number)
    );

    -- Customers
    CREATE TABLE IF NOT EXISTS customers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT NOT NULL UNIQUE,
      full_name TEXT NOT NULL,
      id_card TEXT,
      hn TEXT,
      dob TEXT,
      phone TEXT,
      address TEXT,
      hc_uc INTEGER NOT NULL DEFAULT 0,
      hc_gov INTEGER NOT NULL DEFAULT 0,
      hc_sso INTEGER NOT NULL DEFAULT 0,
      food_allergy TEXT,
      other_allergy TEXT,
      chronic_diseases TEXT,
      is_alert INTEGER NOT NULL DEFAULT 0,
      alert_note TEXT,
      warning_note TEXT,
      is_hidden INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
    );

    -- Drug Allergies (linked to customers)
    CREATE TABLE IF NOT EXISTS drug_allergies (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      customer_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
      generic_name_id INTEGER REFERENCES drug_generic_names(id),
      drug_name_free TEXT,
      reaction TEXT,
      severity TEXT,
      noted_by INTEGER REFERENCES users(id),
      noted_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
    );

    -- Suppliers
    CREATE TABLE IF NOT EXISTS suppliers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      tax_id TEXT,
      phone TEXT,
      address TEXT,
      contact_name TEXT,
      is_disabled INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
    );

    -- Sales
    CREATE TABLE IF NOT EXISTS sales (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      invoice_no TEXT NOT NULL UNIQUE,
      sale_type TEXT NOT NULL DEFAULT 'retail',
      customer_id INTEGER REFERENCES customers(id),
      customer_name_free TEXT,
      sold_by INTEGER REFERENCES users(id),
      sold_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
      age_range TEXT,
      symptom_note TEXT,
      subtotal REAL NOT NULL DEFAULT 0,
      total_discount REAL NOT NULL DEFAULT 0,
      total_vat REAL NOT NULL DEFAULT 0,
      total_amount REAL NOT NULL DEFAULT 0,
      cash_amount REAL NOT NULL DEFAULT 0,
      card_amount REAL NOT NULL DEFAULT 0,
      transfer_amount REAL NOT NULL DEFAULT 0,
      change_amount REAL NOT NULL DEFAULT 0,
      is_credit INTEGER NOT NULL DEFAULT 0,
      due_date TEXT,
      is_fda13_report INTEGER NOT NULL DEFAULT 0,
      sale_report_note TEXT,
      status TEXT NOT NULL DEFAULT 'completed',
      void_reason TEXT,
      note TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
    );

    -- Sale Items
    CREATE TABLE IF NOT EXISTS sale_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      sale_id INTEGER NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
      product_id INTEGER NOT NULL REFERENCES products(id),
      item_name TEXT NOT NULL,
      unit_name TEXT NOT NULL DEFAULT '',
      qty REAL NOT NULL DEFAULT 1,
      unit_price REAL NOT NULL DEFAULT 0,
      discount REAL NOT NULL DEFAULT 0,
      unit_vat REAL NOT NULL DEFAULT 0,
      line_total REAL NOT NULL DEFAULT 0,
      item_note TEXT,
      is_cancelled INTEGER NOT NULL DEFAULT 0
    );

    -- Sale Item Lots (FEFO tracking)
    CREATE TABLE IF NOT EXISTS sale_item_lots (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      sale_item_id INTEGER NOT NULL REFERENCES sale_items(id) ON DELETE CASCADE,
      lot_id INTEGER REFERENCES product_lots(id),
      product_id INTEGER NOT NULL REFERENCES products(id),
      qty REAL NOT NULL DEFAULT 0,
      is_cancelled INTEGER NOT NULL DEFAULT 0
    );

    -- Stock Movements Audit
    CREATE TABLE IF NOT EXISTS stock_movements (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      product_id INTEGER NOT NULL REFERENCES products(id),
      lot_id INTEGER REFERENCES product_lots(id),
      movement_type TEXT NOT NULL,
      ref_type TEXT,
      ref_id INTEGER,
      qty_change REAL NOT NULL DEFAULT 0,
      qty_before REAL NOT NULL DEFAULT 0,
      qty_after REAL NOT NULL DEFAULT 0,
      unit_cost REAL NOT NULL DEFAULT 0,
      note TEXT,
      created_by INTEGER REFERENCES users(id),
      created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
    );

    -- Price change history
    CREATE TABLE IF NOT EXISTS price_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
      price_type TEXT NOT NULL DEFAULT 'retail',
      old_price REAL NOT NULL DEFAULT 0,
      new_price REAL NOT NULL DEFAULT 0,
      note TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
    );

    -- Label Frequencies
    CREATE TABLE IF NOT EXISTS label_frequencies (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT NOT NULL UNIQUE,
      name_th TEXT NOT NULL,
      name_en TEXT,
      name_mm TEXT,
      name_zh TEXT,
      sort_order INTEGER NOT NULL DEFAULT 0
    );

    -- Label Dosages
    CREATE TABLE IF NOT EXISTS label_dosages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT NOT NULL UNIQUE,
      name_th TEXT NOT NULL,
      name_en TEXT,
      name_mm TEXT,
      name_zh TEXT,
      sort_order INTEGER NOT NULL DEFAULT 0
    );

    -- Label Times
    CREATE TABLE IF NOT EXISTS label_times (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT NOT NULL UNIQUE,
      name_th TEXT NOT NULL,
      name_en TEXT,
      name_mm TEXT,
      name_zh TEXT,
      sort_order INTEGER NOT NULL DEFAULT 0
    );

    -- Label Meal Relations
    CREATE TABLE IF NOT EXISTS label_meal_relations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT NOT NULL UNIQUE,
      name_th TEXT NOT NULL,
      name_en TEXT,
      name_mm TEXT,
      name_zh TEXT,
      sort_order INTEGER NOT NULL DEFAULT 0
    );

    -- Label Advices
    CREATE TABLE IF NOT EXISTS label_advices (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT NOT NULL UNIQUE,
      name_th TEXT NOT NULL,
      name_en TEXT,
      name_mm TEXT,
      name_zh TEXT,
      sort_order INTEGER NOT NULL DEFAULT 0
    );

    -- Product Labels (Medicine Prescription Labels)
    CREATE TABLE IF NOT EXISTS product_labels (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
      label_name TEXT,
      dose_qty REAL,
      dosage_id INTEGER REFERENCES label_dosages(id),
      frequency_id INTEGER REFERENCES label_frequencies(id),
      timing_id INTEGER REFERENCES label_meal_relations(id),
      indication_th TEXT,
      indication_mm TEXT,
      indication_zh TEXT,
      note_th TEXT,
      note_mm TEXT,
      note_zh TEXT,
      is_active INTEGER NOT NULL DEFAULT 1,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
    );

    -- Label Settings (print configuration)
    CREATE TABLE IF NOT EXISTS label_settings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      width_mm REAL NOT NULL DEFAULT 62,
      height_mm REAL NOT NULL DEFAULT 0,
      pad_top REAL NOT NULL DEFAULT 3,
      pad_right REAL NOT NULL DEFAULT 3,
      pad_bottom REAL NOT NULL DEFAULT 3,
      pad_left REAL NOT NULL DEFAULT 3,
      font_family TEXT NOT NULL DEFAULT 'Sarabun',
      font_size_shop REAL NOT NULL DEFAULT 8,
      font_size_product REAL NOT NULL DEFAULT 10,
      font_size_dosage REAL NOT NULL DEFAULT 9,
      font_size_small REAL NOT NULL DEFAULT 7,
      bold_shop INTEGER NOT NULL DEFAULT 0,
      bold_product INTEGER NOT NULL DEFAULT 1,
      bold_dosage INTEGER NOT NULL DEFAULT 0,
      line_spacing REAL NOT NULL DEFAULT 1.2,
      section_gap REAL NOT NULL DEFAULT 2,
      updated_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
    );

    -- Purchase receipt headers (GR-level metadata, one row per invoice_no)
    CREATE TABLE IF NOT EXISTS purchase_receipts (
      invoice_no TEXT PRIMARY KEY,
      note TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
    );

    -- Indexes
    CREATE INDEX IF NOT EXISTS idx_products_barcode ON products(barcode);
    CREATE INDEX IF NOT EXISTS idx_products_barcode2 ON products(barcode2);
    CREATE INDEX IF NOT EXISTS idx_products_barcode3 ON products(barcode3);
    CREATE INDEX IF NOT EXISTS idx_products_barcode4 ON products(barcode4);
    CREATE INDEX IF NOT EXISTS idx_products_code ON products(code);
    CREATE INDEX IF NOT EXISTS idx_product_lots_product ON product_lots(product_id);
    CREATE INDEX IF NOT EXISTS idx_product_lots_expiry ON product_lots(expiry_date);
    CREATE INDEX IF NOT EXISTS idx_sales_invoice ON sales(invoice_no);
    CREATE INDEX IF NOT EXISTS idx_sales_sold_at ON sales(sold_at);
    CREATE INDEX IF NOT EXISTS idx_stock_movements_product ON stock_movements(product_id, lot_id);
    CREATE INDEX IF NOT EXISTS idx_stock_movements_type ON stock_movements(movement_type);
    CREATE INDEX IF NOT EXISTS idx_stock_movements_created ON stock_movements(created_at);
    CREATE INDEX IF NOT EXISTS idx_price_logs_product ON price_logs(product_id, created_at DESC);
  `)
}
