import type Database from 'better-sqlite3'

export function initializeSchema(db: Database.Database) {
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;

    -- Users / Staff
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      first_name TEXT NOT NULL DEFAULT '',
      last_name TEXT NOT NULL DEFAULT '',
      username TEXT,
      phone TEXT,
      email TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL DEFAULT '',
      role TEXT NOT NULL DEFAULT 'staff',
      is_disabled INTEGER NOT NULL DEFAULT 0,
      recovery_code_hash TEXT,
      failed_attempts INTEGER NOT NULL DEFAULT 0,
      locked_until TEXT,
      recovery_failed_attempts INTEGER NOT NULL DEFAULT 0,
      recovery_locked_until TEXT,
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
      setup_completed INTEGER NOT NULL DEFAULT 0,
      setup_completed_at TEXT,
      vat_registered_date TEXT,
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
      created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
    );

    -- Drug Types (GENERAL, DANGEROUS, etc.)
    CREATE TABLE IF NOT EXISTS drug_types (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT NOT NULL UNIQUE,
      name_th TEXT NOT NULL,
      is_fda9  INTEGER NOT NULL DEFAULT 0,
      is_fda10 INTEGER NOT NULL DEFAULT 0,
      is_fda11 INTEGER NOT NULL DEFAULT 0,
      is_fda13 INTEGER NOT NULL DEFAULT 0,
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
      name TEXT NOT NULL UNIQUE,
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
      is_stock_item INTEGER NOT NULL DEFAULT 1,
      is_bundle INTEGER NOT NULL DEFAULT 0,
      is_disabled INTEGER NOT NULL DEFAULT 0,
      is_hidden INTEGER NOT NULL DEFAULT 0,
      price_retail REAL NOT NULL DEFAULT 0,
      price_wholesale1 REAL NOT NULL DEFAULT 0,
      price_wholesale2 REAL NOT NULL DEFAULT 0,
      cost_price REAL NOT NULL DEFAULT 0,
      last_cost_price REAL NOT NULL DEFAULT 0,
      unit_id INTEGER REFERENCES item_units(id),
      is_drug INTEGER NOT NULL DEFAULT 0,
      reorder_point REAL,
      safety_stock REAL,
      drug_type_id INTEGER REFERENCES drug_types(id),
      tmt_id TEXT,
      is_antibiotic INTEGER NOT NULL DEFAULT 0,
      indication_note TEXT,
      side_effect_note TEXT,
      is_fda9  INTEGER NOT NULL DEFAULT 0,
      is_fda10 INTEGER NOT NULL DEFAULT 0,
      is_fda11 INTEGER NOT NULL DEFAULT 0,
      is_fda13 INTEGER NOT NULL DEFAULT 0,
      search_keywords TEXT,
      note TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
    );

    -- Product Unit Variants (non-base units only — แผง, กล่อง, ...)
    -- The base unit lives directly on the products table (products.unit_id).
    CREATE TABLE IF NOT EXISTS product_units (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
      unit_id INTEGER NOT NULL REFERENCES item_units(id),
      barcode TEXT,
      qty_per_base REAL NOT NULL DEFAULT 1,
      price_retail REAL NOT NULL DEFAULT 0,
      price_wholesale1 REAL NOT NULL DEFAULT 0,
      price_wholesale2 REAL NOT NULL DEFAULT 0,
      is_for_sale INTEGER NOT NULL DEFAULT 1,
      is_for_purchase INTEGER NOT NULL DEFAULT 0,
      is_disabled INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
    );

    -- Product Bundle Items (recipe for is_bundle=1 products)
    -- One bundle row in products + N rows here. Stock is derived
    -- (MIN of component capacities); cost is auto Σ(component_cost × qty).
    -- Sale-time FEFO deducts from each component's lots; void/return
    -- restores via sale_item_lots.product_id (component-tagged).
    CREATE TABLE IF NOT EXISTS product_bundle_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      bundle_id            INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
      component_product_id INTEGER NOT NULL REFERENCES products(id),
      qty_per_bundle       REAL NOT NULL DEFAULT 1,
      sort_order           INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
      UNIQUE(bundle_id, component_product_id)
    );
    CREATE INDEX IF NOT EXISTS idx_pbi_bundle ON product_bundle_items(bundle_id);
    CREATE INDEX IF NOT EXISTS idx_pbi_component ON product_bundle_items(component_product_id);

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
      order_date TEXT,
      payment_type TEXT DEFAULT 'cash',
      due_date TEXT,
      is_paid INTEGER NOT NULL DEFAULT 1,
      paid_date TEXT,
      is_closed INTEGER NOT NULL DEFAULT 0,
      closed_at TEXT,
      is_cancelled INTEGER NOT NULL DEFAULT 0,
      cancelled_at TEXT,
      cancel_note TEXT,
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
      dob TEXT,
      phone TEXT,
      address TEXT,
      chronic_diseases TEXT,
      is_alert INTEGER NOT NULL DEFAULT 0,
      alert_note TEXT,
      is_disabled INTEGER NOT NULL DEFAULT 0,
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

    -- Lot cost change history (cost_price edits via products:updateLot)
    CREATE TABLE IF NOT EXISTS lot_cost_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      lot_id INTEGER NOT NULL REFERENCES product_lots(id) ON DELETE CASCADE,
      product_id INTEGER NOT NULL REFERENCES products(id),
      old_cost REAL NOT NULL DEFAULT 0,
      new_cost REAL NOT NULL DEFAULT 0,
      note TEXT,
      created_by INTEGER REFERENCES users(id),
      created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
    );
    CREATE INDEX IF NOT EXISTS idx_lot_cost_logs_lot ON lot_cost_logs(lot_id, created_at DESC);

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
      label_time_id INTEGER REFERENCES label_times(id),
      advice_id INTEGER REFERENCES label_advices(id),
      indication_th TEXT,
      indication_mm TEXT,
      indication_zh TEXT,
      note_th TEXT,
      note_mm TEXT,
      note_zh TEXT,
      is_default INTEGER NOT NULL DEFAULT 0,
      show_barcode INTEGER NOT NULL DEFAULT 0,
      is_active INTEGER NOT NULL DEFAULT 1,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
    );

    -- Label Settings (print configuration)
    CREATE TABLE IF NOT EXISTS label_settings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      width_mm REAL NOT NULL DEFAULT 80,
      height_mm REAL NOT NULL DEFAULT 50,
      pad_top REAL NOT NULL DEFAULT 3,
      pad_right REAL NOT NULL DEFAULT 3,
      pad_bottom REAL NOT NULL DEFAULT 3,
      pad_left REAL NOT NULL DEFAULT 3,
      font_family TEXT NOT NULL DEFAULT 'Sarabun',
      -- Per-section font size (one column per text section); all default 10pt.
      font_size_shop          REAL NOT NULL DEFAULT 10,
      font_size_print_date    REAL NOT NULL DEFAULT 10,
      font_size_shop_address  REAL NOT NULL DEFAULT 10,
      font_size_shop_phone    REAL NOT NULL DEFAULT 10,
      font_size_shop_line_id  REAL NOT NULL DEFAULT 10,
      font_size_product       REAL NOT NULL DEFAULT 10,
      font_size_dosage        REAL NOT NULL DEFAULT 10,
      font_size_timing        REAL NOT NULL DEFAULT 10,
      font_size_indication    REAL NOT NULL DEFAULT 10,
      font_size_advice        REAL NOT NULL DEFAULT 10,
      font_size_barcode       REAL NOT NULL DEFAULT 10,
      font_size_custom_text   REAL NOT NULL DEFAULT 10,
      font_size_small         REAL NOT NULL DEFAULT 10, -- DEAD: retired shared tier
      -- Per-section bold; only shop name / address / phone / product default on.
      bold_shop          INTEGER NOT NULL DEFAULT 1,
      bold_print_date    INTEGER NOT NULL DEFAULT 0,
      bold_shop_address  INTEGER NOT NULL DEFAULT 1,
      bold_shop_phone    INTEGER NOT NULL DEFAULT 1,
      bold_shop_line_id  INTEGER NOT NULL DEFAULT 0,
      bold_product       INTEGER NOT NULL DEFAULT 1,
      bold_dosage        INTEGER NOT NULL DEFAULT 0,
      bold_timing        INTEGER NOT NULL DEFAULT 0,
      bold_indication    INTEGER NOT NULL DEFAULT 0,
      bold_advice        INTEGER NOT NULL DEFAULT 0,
      bold_barcode       INTEGER NOT NULL DEFAULT 0,
      bold_custom_text   INTEGER NOT NULL DEFAULT 0,
      line_spacing REAL NOT NULL DEFAULT 1.2,
      section_gap REAL NOT NULL DEFAULT 2,
      printer_name TEXT NOT NULL DEFAULT '',
      custom_text TEXT NOT NULL DEFAULT '',
      show_shop          INTEGER NOT NULL DEFAULT 1,
      show_print_date    INTEGER NOT NULL DEFAULT 1,
      show_shop_address  INTEGER NOT NULL DEFAULT 1,
      show_shop_phone    INTEGER NOT NULL DEFAULT 1,
      show_shop_line_id  INTEGER NOT NULL DEFAULT 1,
      show_product       INTEGER NOT NULL DEFAULT 1,
      show_dosage        INTEGER NOT NULL DEFAULT 1,
      show_timing        INTEGER NOT NULL DEFAULT 1,
      show_indication    INTEGER NOT NULL DEFAULT 1,
      show_advice        INTEGER NOT NULL DEFAULT 1,
      show_notes         INTEGER NOT NULL DEFAULT 1,
      show_lot_expiry    INTEGER NOT NULL DEFAULT 1,
      show_barcode       INTEGER NOT NULL DEFAULT 0,
      show_custom_text   INTEGER NOT NULL DEFAULT 1,
      show_header_line   INTEGER NOT NULL DEFAULT 1,
      show_footer_line   INTEGER NOT NULL DEFAULT 1,
      offset_x_shop       REAL NOT NULL DEFAULT 0,
      offset_y_shop       REAL NOT NULL DEFAULT 0,
      offset_x_print_date REAL NOT NULL DEFAULT 0,
      offset_y_print_date REAL NOT NULL DEFAULT 0,
      offset_x_shop_address REAL NOT NULL DEFAULT 0,
      offset_y_shop_address REAL NOT NULL DEFAULT 0,
      offset_x_shop_phone   REAL NOT NULL DEFAULT 0,
      offset_y_shop_phone   REAL NOT NULL DEFAULT 0,
      offset_x_shop_line_id REAL NOT NULL DEFAULT 0,
      offset_y_shop_line_id REAL NOT NULL DEFAULT 0,
      offset_x_product    REAL NOT NULL DEFAULT 0,
      offset_y_product    REAL NOT NULL DEFAULT 0,
      offset_x_dosage     REAL NOT NULL DEFAULT 0,
      offset_y_dosage     REAL NOT NULL DEFAULT 0,
      offset_x_timing     REAL NOT NULL DEFAULT 0,
      offset_y_timing     REAL NOT NULL DEFAULT 0,
      offset_x_indication REAL NOT NULL DEFAULT 0,
      offset_y_indication REAL NOT NULL DEFAULT 0,
      offset_x_advice     REAL NOT NULL DEFAULT 0,
      offset_y_advice     REAL NOT NULL DEFAULT 0,
      offset_x_notes      REAL NOT NULL DEFAULT 0,
      offset_y_notes      REAL NOT NULL DEFAULT 0,
      offset_x_lot_expiry REAL NOT NULL DEFAULT 0,
      offset_y_lot_expiry REAL NOT NULL DEFAULT 0,
      offset_x_barcode    REAL NOT NULL DEFAULT 0,
      offset_y_barcode    REAL NOT NULL DEFAULT 0,
      offset_x_custom_text REAL NOT NULL DEFAULT 0,
      offset_y_custom_text REAL NOT NULL DEFAULT 0,
      offset_x_header_line REAL NOT NULL DEFAULT 0,
      offset_y_header_line REAL NOT NULL DEFAULT 0,
      offset_x_footer_line REAL NOT NULL DEFAULT 0,
      offset_y_footer_line REAL NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
    );

    -- POS / Sales Settings (singleton). Columns map 1:1 to SalesTab form keys —
    -- the IPC upsert builds dynamic SQL from Object.keys(), so any renamed key
    -- would throw "no such column".
    -- Note: expiry warn/danger month thresholds are NOT stored here — they're
    -- fixed policy constants in src/lib/expiry.ts (single source of truth).
    CREATE TABLE IF NOT EXISTS sales_settings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      expiry_alert_enabled    INTEGER NOT NULL DEFAULT 1,
      expired_alert_enabled   INTEGER NOT NULL DEFAULT 1,
      low_stock_alert_enabled INTEGER NOT NULL DEFAULT 1,
      qty_multiplier_enabled  INTEGER NOT NULL DEFAULT 1,
      vat_enabled             INTEGER NOT NULL DEFAULT 0,
      vat_rate                REAL NOT NULL DEFAULT 7,
      updated_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
    );

    -- Receipt / cash-slip print settings (singleton). Columns map 1:1 to the
    -- ReceiptSettingsTab form keys — the IPC upsert builds dynamic SQL from
    -- Object.keys(), so any renamed key would throw "no such column".
    -- paper_height_mm = 0 means auto (measure content height); a positive value
    -- forces a fixed page for thermal drivers that reject custom long pages.
    CREATE TABLE IF NOT EXISTS receipt_settings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      printer_name       TEXT NOT NULL DEFAULT '',
      paper_width_mm     REAL NOT NULL DEFAULT 80,
      paper_height_mm    REAL NOT NULL DEFAULT 0,
      auto_print         INTEGER NOT NULL DEFAULT 0,
      copies             INTEGER NOT NULL DEFAULT 1,
      font_family        TEXT NOT NULL DEFAULT 'Sarabun',
      font_size          REAL NOT NULL DEFAULT 11,
      header_note        TEXT NOT NULL DEFAULT '',
      footer_note        TEXT NOT NULL DEFAULT 'ขอบคุณที่ใช้บริการ',
      abbrev_tax_invoice INTEGER NOT NULL DEFAULT 1,
      updated_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
    );

    -- A4 document printing (singleton). Covers every full-page document that
    -- shares the A4 printer: ใบกำกับภาษีเต็มรูป, ใบรับสินค้า, ใบเสนอราคา, ฯลฯ.
    -- One physical printer for all of them (operator decision). paper_size picks
    -- the page size the print helpers emit ('A4' 210×297 / 'A5' 148×210 mm);
    -- printer_name = '' falls back to the OS default printer.
    CREATE TABLE IF NOT EXISTS document_settings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      printer_name TEXT NOT NULL DEFAULT '',
      copies       INTEGER NOT NULL DEFAULT 1,
      paper_size   TEXT NOT NULL DEFAULT 'A4',
      updated_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
    );

    -- Database backup settings (singleton). auto_enabled gates the on-close +
    -- midnight auto-backups; retention_count caps how many auto-*.db files are
    -- kept. backup_dir is the user-chosen destination folder (NULL = default
    -- userData/backups). last_auto_backup_at is set after each auto-backup.
    CREATE TABLE IF NOT EXISTS backup_settings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      auto_enabled    INTEGER NOT NULL DEFAULT 1,
      retention_count INTEGER NOT NULL DEFAULT 7,
      backup_dir      TEXT,
      last_auto_backup_at TEXT,
      updated_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
    );

    -- Full tax invoices (ใบกำกับภาษีเต็มรูป, ม.86/4). One row per sale issued.
    -- doc_no reuses the sale's invoice_no (RC-) as the running serial number.
    -- Buyer fields are a snapshot taken at issue time (the customer record may
    -- change later). original_printed gates the "ต้นฉบับ" vs "สำเนา" header:
    -- the first print stamps ต้นฉบับ and sets the flag; every reprint = สำเนา.
    CREATE TABLE IF NOT EXISTS tax_invoices (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      sale_id INTEGER NOT NULL UNIQUE REFERENCES sales(id) ON DELETE CASCADE,
      doc_no TEXT NOT NULL,
      buyer_name TEXT NOT NULL DEFAULT '',
      buyer_address TEXT NOT NULL DEFAULT '',
      buyer_tax_id TEXT NOT NULL DEFAULT '',
      buyer_branch TEXT NOT NULL DEFAULT '',
      original_printed INTEGER NOT NULL DEFAULT 0,
      issued_by INTEGER REFERENCES users(id),
      issued_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
    );

    -- Quotations (ใบเสนอราคา). Pre-sale price offers — NEVER touch stock/lots.
    -- quote_no = QT-YYYYMMDD-NNNN (generated with retry-on-unique-collision).
    -- Customer fields are a snapshot at issue time so a reprint stays stable.
    -- issue_date is set once on create and immutable on update; valid_until is
    -- user-editable. vat_enabled/vat_rate are snapshotted so a later rate change
    -- doesn't alter an issued quote. Edit/delete is gated to status='draft'.
    CREATE TABLE IF NOT EXISTS quotations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      quote_no TEXT NOT NULL UNIQUE,
      customer_id INTEGER REFERENCES customers(id),
      customer_name TEXT NOT NULL DEFAULT '',
      customer_address TEXT NOT NULL DEFAULT '',
      customer_tax_id TEXT NOT NULL DEFAULT '',
      issue_date TEXT NOT NULL DEFAULT (datetime('now','localtime')),
      valid_until TEXT,
      status TEXT NOT NULL DEFAULT 'draft',
      vat_enabled INTEGER NOT NULL DEFAULT 0,
      vat_rate REAL NOT NULL DEFAULT 7,
      subtotal REAL NOT NULL DEFAULT 0,
      total_discount REAL NOT NULL DEFAULT 0,
      total_vat REAL NOT NULL DEFAULT 0,
      total_amount REAL NOT NULL DEFAULT 0,
      note TEXT NOT NULL DEFAULT '',
      converted_invoice_no TEXT,
      created_by INTEGER REFERENCES users(id),
      created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
    );

    CREATE TABLE IF NOT EXISTS quotation_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      quotation_id INTEGER NOT NULL REFERENCES quotations(id) ON DELETE CASCADE,
      product_id INTEGER REFERENCES products(id),
      item_name TEXT NOT NULL DEFAULT '',
      unit_name TEXT NOT NULL DEFAULT '',
      qty REAL NOT NULL DEFAULT 1,
      unit_price REAL NOT NULL DEFAULT 0,
      discount REAL NOT NULL DEFAULT 0,
      line_total REAL NOT NULL DEFAULT 0,
      sort_order INTEGER NOT NULL DEFAULT 0
    );

    -- Shop expenses (ค่าใช้จ่าย) — manual operating-cost entries (rent, utilities,
    -- salaries, …) used by the Finance net-profit calc + the ค่าใช้จ่าย report.
    CREATE TABLE IF NOT EXISTS expense_categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      is_active INTEGER NOT NULL DEFAULT 1,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
    );
    CREATE TABLE IF NOT EXISTS expenses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      expense_no TEXT NOT NULL UNIQUE,
      expense_date TEXT NOT NULL,
      category_id INTEGER REFERENCES expense_categories(id),
      amount REAL NOT NULL,
      reference_no TEXT,
      note TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
    );

    -- Purchase receipt headers (GR-level metadata, one row per invoice_no).
    -- Authoritative source for supplier / payment / dates of a GR.
    -- product_lots also stores some of these for stock display, but is last-write-wins.
    CREATE TABLE IF NOT EXISTS purchase_receipts (
      invoice_no TEXT PRIMARY KEY,
      supplier_id INTEGER REFERENCES suppliers(id),
      supplier_invoice_no TEXT,
      order_date TEXT,
      payment_type TEXT NOT NULL DEFAULT 'cash',
      due_date TEXT,
      is_paid INTEGER NOT NULL DEFAULT 0,
      paid_date TEXT,
      note TEXT NOT NULL DEFAULT '',
      discount_amount REAL NOT NULL DEFAULT 0,
      surcharge_amount REAL NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'completed',
      cancelled_at TEXT,
      cancelled_by INTEGER REFERENCES users(id),
      cancel_reason TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
    );

    -- Purchase receipt line items (immutable receive ledger).
    -- One row per line per GR. NEVER mutated after insert (except is_cancelled flag).
    -- Source of truth for ประวัติการรับสินค้า history and cancellation.
    CREATE TABLE IF NOT EXISTS purchase_receipt_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      invoice_no TEXT NOT NULL,
      product_id INTEGER NOT NULL REFERENCES products(id),
      lot_id INTEGER REFERENCES product_lots(id),
      lot_number TEXT NOT NULL,
      manufactured_date TEXT,
      expiry_date TEXT,
      cost_price REAL NOT NULL DEFAULT 0,
      sell_price REAL NOT NULL DEFAULT 0,
      qty REAL NOT NULL DEFAULT 0,
      note TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
    );
    CREATE INDEX IF NOT EXISTS idx_pri_invoice ON purchase_receipt_items(invoice_no);
    CREATE INDEX IF NOT EXISTS idx_pri_lot ON purchase_receipt_items(lot_id);

    -- Supplier product alias (Invoice Matcher).
    -- (supplier_id, normalized supplier_text) -> product_id. Grows from
    -- human-confirmed first-time matches; after that, instant exact lookup.
    -- supplier_text is stored normalized (trim, collapse whitespace, uppercase)
    -- so "PARA 500" and " para  500 " collide on the same key.
    CREATE TABLE IF NOT EXISTS supplier_product_alias (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      supplier_id INTEGER NOT NULL REFERENCES suppliers(id) ON DELETE CASCADE,
      supplier_text TEXT NOT NULL,
      product_id INTEGER NOT NULL REFERENCES products(id),
      confidence REAL NOT NULL DEFAULT 1.0,
      confirmed_by INTEGER REFERENCES users(id),
      confirmed_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
      created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
      UNIQUE(supplier_id, supplier_text)
    );
    CREATE INDEX IF NOT EXISTS idx_alias_lookup ON supplier_product_alias(supplier_id, supplier_text);

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
    -- Reports hot path: every cost/profit aggregate joins sale_items → sale_item_lots
    -- per sale. Without these the subquery does a full table scan, killing perf
    -- once sales count > ~5k (financeSummary, salesPurchaseTrend, topProducts,
    -- cashierLeaderboard all hit this). Also covers reports:getSale per-bill detail.
    CREATE INDEX IF NOT EXISTS idx_sale_items_sale ON sale_items(sale_id);
    CREATE INDEX IF NOT EXISTS idx_sale_items_product ON sale_items(product_id);
    CREATE INDEX IF NOT EXISTS idx_sale_item_lots_sale_item ON sale_item_lots(sale_item_id);
    CREATE INDEX IF NOT EXISTS idx_sale_item_lots_lot ON sale_item_lots(lot_id);
    CREATE INDEX IF NOT EXISTS idx_sale_item_lots_product ON sale_item_lots(product_id);
    -- Same story for purchase aggregates and history filtering.
    CREATE INDEX IF NOT EXISTS idx_purchase_receipts_created ON purchase_receipts(created_at);
    CREATE INDEX IF NOT EXISTS idx_purchase_receipts_supplier ON purchase_receipts(supplier_id);
    CREATE INDEX IF NOT EXISTS idx_stock_movements_product ON stock_movements(product_id, lot_id);
    CREATE INDEX IF NOT EXISTS idx_stock_movements_type ON stock_movements(movement_type);
    CREATE INDEX IF NOT EXISTS idx_stock_movements_created ON stock_movements(created_at);
    CREATE INDEX IF NOT EXISTS idx_price_logs_product ON price_logs(product_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_quotations_no ON quotations(quote_no);
    CREATE INDEX IF NOT EXISTS idx_quotations_issued ON quotations(issue_date);
    CREATE INDEX IF NOT EXISTS idx_quotation_items_q ON quotation_items(quotation_id);
    CREATE INDEX IF NOT EXISTS idx_expenses_no ON expenses(expense_no);
    CREATE INDEX IF NOT EXISTS idx_expenses_date ON expenses(expense_date);
    CREATE INDEX IF NOT EXISTS idx_expenses_category ON expenses(category_id);
  `)

  // Safe column migrations for existing databases
  for (const sql of [
    `ALTER TABLE purchase_receipts ADD COLUMN discount_amount REAL NOT NULL DEFAULT 0`,
    `ALTER TABLE purchase_receipts ADD COLUMN surcharge_amount REAL NOT NULL DEFAULT 0`,
    // POS quantity multiplier (*N) feature toggle — default on for existing DBs.
    `ALTER TABLE sales_settings ADD COLUMN qty_multiplier_enabled INTEGER NOT NULL DEFAULT 1`,
    `ALTER TABLE sales_settings ADD COLUMN vat_enabled INTEGER NOT NULL DEFAULT 0`,
    `ALTER TABLE sales_settings ADD COLUMN vat_rate REAL NOT NULL DEFAULT 7`,
    // VAT is now an all-or-nothing global switch (sales_settings.vat_enabled);
    // POS taxes every line when on, so the per-product has_vat flag is gone.
    `ALTER TABLE products DROP COLUMN has_vat`,
    `ALTER TABLE product_lots ADD COLUMN is_cancelled INTEGER NOT NULL DEFAULT 0`,
    `ALTER TABLE product_lots ADD COLUMN cancelled_at TEXT`,
    `ALTER TABLE product_lots ADD COLUMN cancel_note TEXT`,
    `ALTER TABLE products DROP COLUMN is_original_drug`,
    `ALTER TABLE products DROP COLUMN strength`,
    `ALTER TABLE products DROP COLUMN registration_no`,
    `ALTER TABLE products DROP COLUMN max_dispense_qty`,
    `ALTER TABLE products DROP COLUMN is_sale_control`,
    `ALTER TABLE products DROP COLUMN sale_control_qty`,
    `ALTER TABLE products DROP COLUMN expiry_alert_days1`,
    `ALTER TABLE products DROP COLUMN expiry_alert_days2`,
    `ALTER TABLE products DROP COLUMN expiry_alert_days3`,
    `ALTER TABLE products DROP COLUMN no_discount`,
    `ALTER TABLE products DROP COLUMN dosage_form_id`,
    // is_drug: explicit "this product is a drug" flag (Hygeia-style toggle).
    // category is now purely for sorting/filtering; this flag gates the
    // "ข้อมูลยา" section in EditProduct.
    `ALTER TABLE products ADD COLUMN is_drug INTEGER NOT NULL DEFAULT 0`,
    // Backfill: anything that already had a drug_type assigned was implicitly a drug.
    `UPDATE products SET is_drug = 1 WHERE drug_type_id IS NOT NULL AND is_drug = 0`,
    // is_bundle: marks a product as a "ชุดสินค้า" (kit/bundle). Bundle rows
    // hold no lots (is_stock_item=0); stock derived via product_bundle_items.
    `ALTER TABLE products ADD COLUMN is_bundle INTEGER NOT NULL DEFAULT 0`,
    // label_settings: printer choice + per-section visibility + per-section X/Y nudge (mm)
    `ALTER TABLE label_settings ADD COLUMN printer_name TEXT NOT NULL DEFAULT ''`,
    `ALTER TABLE label_settings ADD COLUMN show_shop          INTEGER NOT NULL DEFAULT 1`,
    `ALTER TABLE label_settings ADD COLUMN show_product       INTEGER NOT NULL DEFAULT 1`,
    `ALTER TABLE label_settings ADD COLUMN show_dosage        INTEGER NOT NULL DEFAULT 1`,
    `ALTER TABLE label_settings ADD COLUMN show_indication    INTEGER NOT NULL DEFAULT 1`,
    `ALTER TABLE label_settings ADD COLUMN show_notes         INTEGER NOT NULL DEFAULT 1`,
    `ALTER TABLE label_settings ADD COLUMN show_lot_expiry    INTEGER NOT NULL DEFAULT 1`,
    `ALTER TABLE label_settings ADD COLUMN show_barcode       INTEGER NOT NULL DEFAULT 0`,
    `ALTER TABLE label_settings ADD COLUMN offset_x_shop       REAL NOT NULL DEFAULT 0`,
    `ALTER TABLE label_settings ADD COLUMN offset_y_shop       REAL NOT NULL DEFAULT 0`,
    `ALTER TABLE label_settings ADD COLUMN offset_x_product    REAL NOT NULL DEFAULT 0`,
    `ALTER TABLE label_settings ADD COLUMN offset_y_product    REAL NOT NULL DEFAULT 0`,
    `ALTER TABLE label_settings ADD COLUMN offset_x_dosage     REAL NOT NULL DEFAULT 0`,
    `ALTER TABLE label_settings ADD COLUMN offset_y_dosage     REAL NOT NULL DEFAULT 0`,
    `ALTER TABLE label_settings ADD COLUMN offset_x_indication REAL NOT NULL DEFAULT 0`,
    `ALTER TABLE label_settings ADD COLUMN offset_y_indication REAL NOT NULL DEFAULT 0`,
    `ALTER TABLE label_settings ADD COLUMN offset_x_notes      REAL NOT NULL DEFAULT 0`,
    `ALTER TABLE label_settings ADD COLUMN offset_y_notes      REAL NOT NULL DEFAULT 0`,
    `ALTER TABLE label_settings ADD COLUMN offset_x_lot_expiry REAL NOT NULL DEFAULT 0`,
    `ALTER TABLE label_settings ADD COLUMN offset_y_lot_expiry REAL NOT NULL DEFAULT 0`,
    `ALTER TABLE label_settings ADD COLUMN offset_x_barcode    REAL NOT NULL DEFAULT 0`,
    `ALTER TABLE label_settings ADD COLUMN offset_y_barcode    REAL NOT NULL DEFAULT 0`,
    `ALTER TABLE label_settings ADD COLUMN show_header_line    INTEGER NOT NULL DEFAULT 1`,
    `ALTER TABLE label_settings ADD COLUMN show_footer_line    INTEGER NOT NULL DEFAULT 1`,
    `ALTER TABLE label_settings ADD COLUMN offset_x_header_line REAL NOT NULL DEFAULT 0`,
    `ALTER TABLE label_settings ADD COLUMN offset_y_header_line REAL NOT NULL DEFAULT 0`,
    `ALTER TABLE label_settings ADD COLUMN offset_x_footer_line REAL NOT NULL DEFAULT 0`,
    `ALTER TABLE label_settings ADD COLUMN offset_y_footer_line REAL NOT NULL DEFAULT 0`,
    // Label restructure: new sections shop_address / timing / advice each get a
    // show toggle + X/Y nudge. shop_address & advice split out of the old
    // shop/notes lines; timing splits dose+frequency off into its own line.
    `ALTER TABLE label_settings ADD COLUMN show_shop_address  INTEGER NOT NULL DEFAULT 1`,
    `ALTER TABLE label_settings ADD COLUMN show_timing        INTEGER NOT NULL DEFAULT 1`,
    `ALTER TABLE label_settings ADD COLUMN show_advice        INTEGER NOT NULL DEFAULT 1`,
    `ALTER TABLE label_settings ADD COLUMN offset_x_shop_address REAL NOT NULL DEFAULT 0`,
    `ALTER TABLE label_settings ADD COLUMN offset_y_shop_address REAL NOT NULL DEFAULT 0`,
    `ALTER TABLE label_settings ADD COLUMN offset_x_timing       REAL NOT NULL DEFAULT 0`,
    `ALTER TABLE label_settings ADD COLUMN offset_y_timing       REAL NOT NULL DEFAULT 0`,
    `ALTER TABLE label_settings ADD COLUMN offset_x_advice       REAL NOT NULL DEFAULT 0`,
    `ALTER TABLE label_settings ADD COLUMN offset_y_advice       REAL NOT NULL DEFAULT 0`,
    // Label section-split: every text section now owns its own font_size_<key> +
    // bold_<key>; new sections shop_phone / shop_line_id / custom_text get the
    // full show + X/Y set too. The retired shared "font_size_small" tier stays as
    // a DEAD column. (font_size_shop/product/dosage + bold_shop/product/dosage
    // already exist; ADD COLUMN on them throws "duplicate column" and is swallowed
    // by the try/catch — defaults for fresh DBs live in the CREATE TABLE above.)
    `ALTER TABLE label_settings ADD COLUMN custom_text TEXT NOT NULL DEFAULT ''`,
    `ALTER TABLE label_settings ADD COLUMN font_size_shop_address  REAL NOT NULL DEFAULT 10`,
    `ALTER TABLE label_settings ADD COLUMN font_size_shop_phone    REAL NOT NULL DEFAULT 10`,
    `ALTER TABLE label_settings ADD COLUMN font_size_shop_line_id  REAL NOT NULL DEFAULT 10`,
    `ALTER TABLE label_settings ADD COLUMN font_size_timing        REAL NOT NULL DEFAULT 10`,
    `ALTER TABLE label_settings ADD COLUMN font_size_indication    REAL NOT NULL DEFAULT 10`,
    `ALTER TABLE label_settings ADD COLUMN font_size_advice        REAL NOT NULL DEFAULT 10`,
    `ALTER TABLE label_settings ADD COLUMN font_size_barcode       REAL NOT NULL DEFAULT 10`,
    `ALTER TABLE label_settings ADD COLUMN font_size_custom_text   REAL NOT NULL DEFAULT 10`,
    `ALTER TABLE label_settings ADD COLUMN bold_shop_address  INTEGER NOT NULL DEFAULT 1`,
    `ALTER TABLE label_settings ADD COLUMN bold_shop_phone    INTEGER NOT NULL DEFAULT 1`,
    `ALTER TABLE label_settings ADD COLUMN bold_shop_line_id  INTEGER NOT NULL DEFAULT 0`,
    `ALTER TABLE label_settings ADD COLUMN bold_timing        INTEGER NOT NULL DEFAULT 0`,
    `ALTER TABLE label_settings ADD COLUMN bold_indication    INTEGER NOT NULL DEFAULT 0`,
    `ALTER TABLE label_settings ADD COLUMN bold_advice        INTEGER NOT NULL DEFAULT 0`,
    `ALTER TABLE label_settings ADD COLUMN bold_barcode       INTEGER NOT NULL DEFAULT 0`,
    `ALTER TABLE label_settings ADD COLUMN bold_custom_text   INTEGER NOT NULL DEFAULT 0`,
    `ALTER TABLE label_settings ADD COLUMN show_shop_phone    INTEGER NOT NULL DEFAULT 1`,
    `ALTER TABLE label_settings ADD COLUMN show_shop_line_id  INTEGER NOT NULL DEFAULT 1`,
    `ALTER TABLE label_settings ADD COLUMN show_custom_text   INTEGER NOT NULL DEFAULT 1`,
    `ALTER TABLE label_settings ADD COLUMN offset_x_shop_phone   REAL NOT NULL DEFAULT 0`,
    `ALTER TABLE label_settings ADD COLUMN offset_y_shop_phone   REAL NOT NULL DEFAULT 0`,
    `ALTER TABLE label_settings ADD COLUMN offset_x_shop_line_id REAL NOT NULL DEFAULT 0`,
    `ALTER TABLE label_settings ADD COLUMN offset_y_shop_line_id REAL NOT NULL DEFAULT 0`,
    `ALTER TABLE label_settings ADD COLUMN offset_x_custom_text  REAL NOT NULL DEFAULT 0`,
    `ALTER TABLE label_settings ADD COLUMN offset_y_custom_text  REAL NOT NULL DEFAULT 0`,
    // Print date split out of the shop section into its own settings (show/font/
    // bold/offset). It is NOT a standalone line — it's folded into the shop flex
    // row (right side) and styled by these columns. Defaults: 10pt, not bold, shown.
    `ALTER TABLE label_settings ADD COLUMN font_size_print_date  REAL NOT NULL DEFAULT 10`,
    `ALTER TABLE label_settings ADD COLUMN bold_print_date    INTEGER NOT NULL DEFAULT 0`,
    `ALTER TABLE label_settings ADD COLUMN show_print_date    INTEGER NOT NULL DEFAULT 1`,
    `ALTER TABLE label_settings ADD COLUMN offset_x_print_date   REAL NOT NULL DEFAULT 0`,
    `ALTER TABLE label_settings ADD COLUMN offset_y_print_date   REAL NOT NULL DEFAULT 0`,
    // product_labels restructure: persist the advice + time-of-day lookups and
    // the per-label default / show-barcode toggles. Without these columns the
    // saveLabel UPDATE (dynamic from Object.keys) threw "no such column".
    `ALTER TABLE product_labels ADD COLUMN label_time_id INTEGER REFERENCES label_times(id)`,
    `ALTER TABLE product_labels ADD COLUMN advice_id INTEGER REFERENCES label_advices(id)`,
    `ALTER TABLE product_labels ADD COLUMN is_default INTEGER NOT NULL DEFAULT 0`,
    `ALTER TABLE product_labels ADD COLUMN show_barcode INTEGER NOT NULL DEFAULT 0`,
    // Expiry thresholds moved to fixed constants in src/lib/expiry.ts — drop the
    // now-unused settings columns from existing DBs.
    `ALTER TABLE sales_settings DROP COLUMN expiry_warn_months`,
    `ALTER TABLE sales_settings DROP COLUMN expiry_danger_months`,
    // Seller branch for tax invoices (ม.86/4 requires "สำนักงานใหญ่"/branch no.).
    `ALTER TABLE settings ADD COLUMN shop_branch TEXT NOT NULL DEFAULT 'สำนักงานใหญ่'`,
    // Quotation → sale conversion: link to the resulting sale invoice.
    `ALTER TABLE quotations ADD COLUMN converted_invoice_no TEXT`,
    // User-chosen auto-backup destination folder (NULL = default userData/backups).
    `ALTER TABLE backup_settings ADD COLUMN backup_dir TEXT`,
    // First-run setup gate. setup_completed=0 forces the setup wizard before the
    // app is usable. ALTERs MUST precede the backfill UPDATE below (same array,
    // ordered) so the column exists when the UPDATE references it on first run.
    `ALTER TABLE settings ADD COLUMN setup_completed INTEGER NOT NULL DEFAULT 0`,
    `ALTER TABLE settings ADD COLUMN setup_completed_at TEXT`,
    `ALTER TABLE settings ADD COLUMN vat_registered_date TEXT`,
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
    `UPDATE settings SET setup_completed = 1, setup_completed_at = datetime('now','localtime')
       WHERE setup_completed = 0 AND EXISTS (SELECT 1 FROM sales LIMIT 1)`,
    // Login/auth columns on users (slice 1): recovery code + brute-force lockout.
    `ALTER TABLE users ADD COLUMN recovery_code_hash TEXT`,
    `ALTER TABLE users ADD COLUMN failed_attempts INTEGER NOT NULL DEFAULT 0`,
    `ALTER TABLE users ADD COLUMN locked_until TEXT`,
    // Recovery-code lockout — a separate counter from login (Phase 2.5).
    `ALTER TABLE users ADD COLUMN recovery_failed_attempts INTEGER NOT NULL DEFAULT 0`,
    `ALTER TABLE users ADD COLUMN recovery_locked_until TEXT`,
    // Profile fields: structured name + login username + phone. `name` is kept
    // as an auto-composed display string (first+last) so the many report joins on
    // users.name stay populated. username is the login identity (unique via index
    // below); "required" is enforced in saveStaff, not at the column level (ALTER
    // can only add it nullable).
    `ALTER TABLE users ADD COLUMN first_name TEXT NOT NULL DEFAULT ''`,
    `ALTER TABLE users ADD COLUMN last_name TEXT NOT NULL DEFAULT ''`,
    `ALTER TABLE users ADD COLUMN username TEXT`,
    `ALTER TABLE users ADD COLUMN phone TEXT`,
    // A4 documents can now be issued on A4 or A5 — page size is configurable
    // per the document_settings singleton (was hard-locked to A4).
    `ALTER TABLE document_settings ADD COLUMN paper_size TEXT NOT NULL DEFAULT 'A4'`,
  ]) {
    try { db.exec(sql) } catch {}
  }

  // One-time: Sarabun is now the default receipt font (matches label_settings
  // and the UI Thai font). Flip installs still holding the OLD 'Bai Jamjuree'
  // default to Sarabun. Guarded by user_version (this is the first use of it in
  // the app — claim version 1) so a later *deliberate* re-selection of Bai
  // Jamjuree in Settings is NOT reverted on the next launch.
  try {
    const fontVer = db.pragma('user_version', { simple: true }) as number
    if (!fontVer || fontVer < 1) {
      db.exec(`UPDATE receipt_settings SET font_family = 'Sarabun' WHERE font_family = 'Bai Jamjuree'`)
      db.pragma('user_version = 1')
    }
  } catch {}

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
    const ver = db.pragma('user_version', { simple: true }) as number
    if (!ver || ver < 2) {
      db.transaction(() => {
        db.exec(`UPDATE users SET first_name = name WHERE first_name = ''`)

        const rows = db.prepare(`SELECT id, email FROM users`).all() as { id: number; email: string | null }[]
        const taken = new Set<string>()
        const setUsername = db.prepare(`UPDATE users SET username = ? WHERE id = ?`)
        for (const r of rows) {
          let base: string
          if (r.email === 'admin@syntropic.local') {
            base = 'admin'
          } else {
            const local = (r.email ?? '').split('@')[0].toLowerCase().replace(/[^a-z0-9_.]/g, '')
            base = local || `user${r.id}`
          }
          let candidate = base
          let n = 1
          while (taken.has(candidate)) { n += 1; candidate = `${base}${n}` }
          taken.add(candidate)
          setUsername.run(candidate, r.id)
        }
      })()
      db.pragma('user_version = 2')
    }
  } catch {}

  // De-dup above guarantees uniqueness; create the index defensively (never
  // hard-crash boot — keep the file's swallow convention).
  try { db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS idx_users_username ON users(username)`) } catch {}

  // Migration: drop the vestigial item_units.multiply column. Never read by any
  // business logic — per-product conversion lives in product_units.qty_per_base.
  try { db.exec(`ALTER TABLE item_units DROP COLUMN multiply`) } catch {}

  // Ensure a fallback unit exists.
  try { db.exec(`INSERT OR IGNORE INTO item_units (name) VALUES ('ชิ้น')`) } catch {}

  // Migration: FDA report columns — drug_types gets boolean flags, products renamed.
  // Order matters: drug_types flags must exist before products backfill uses them.
  for (const sql of [
    // drug_types: add individual boolean flags (replaces khor_yor_report TEXT)
    `ALTER TABLE drug_types ADD COLUMN is_fda9  INTEGER NOT NULL DEFAULT 0`,
    `ALTER TABLE drug_types ADD COLUMN is_fda10 INTEGER NOT NULL DEFAULT 0`,
    `ALTER TABLE drug_types ADD COLUMN is_fda11 INTEGER NOT NULL DEFAULT 0`,
    `ALTER TABLE drug_types ADD COLUMN is_fda13 INTEGER NOT NULL DEFAULT 0`,
    // Backfill drug_types from old khor_yor_report column
    `UPDATE drug_types SET is_fda9=1 WHERE khor_yor_report IS NOT NULL AND is_fda9=0`,
    `UPDATE drug_types SET is_fda10=1 WHERE khor_yor_report='ขย.10' AND is_fda10=0`,
    `ALTER TABLE drug_types DROP COLUMN khor_yor_report`,
    // products: rename is_fda_report → is_fda9, is_fda13_report → is_fda13
    `ALTER TABLE products RENAME COLUMN is_fda_report TO is_fda9`,
    `ALTER TABLE products RENAME COLUMN is_fda13_report TO is_fda13`,
    // products: add is_fda10 and is_fda11
    `ALTER TABLE products ADD COLUMN is_fda10 INTEGER NOT NULL DEFAULT 0`,
    `ALTER TABLE products ADD COLUMN is_fda11 INTEGER NOT NULL DEFAULT 0`,
    // Backfill: all drugs must be in ข.ย.9 (purchase report)
    `UPDATE products SET is_fda9=1 WHERE is_drug=1 AND is_fda9=0`,
    // Backfill is_fda10/11 from the drug_type (flags set above)
    `UPDATE products SET is_fda10=(SELECT COALESCE(dt.is_fda10,0) FROM drug_types dt WHERE dt.id=products.drug_type_id) WHERE is_drug=1 AND drug_type_id IS NOT NULL`,
    `UPDATE products SET is_fda11=(SELECT COALESCE(dt.is_fda11,0) FROM drug_types dt WHERE dt.id=products.drug_type_id) WHERE is_drug=1 AND drug_type_id IS NOT NULL`,
  ]) {
    try { db.exec(sql) } catch {}
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
  for (const sql of [
    `ALTER TABLE products ADD COLUMN last_cost_price REAL NOT NULL DEFAULT 0`,
    `UPDATE products SET last_cost_price = COALESCE((
        SELECT pl.cost_price FROM product_lots pl
        WHERE pl.product_id = products.id AND pl.cost_price > 0
        ORDER BY pl.created_at DESC, pl.id DESC LIMIT 1
      ), 0)
      WHERE last_cost_price = 0`,
  ]) {
    try { db.exec(sql) } catch {}
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
  for (const sql of [
    // 1. Repoint drug_allergies at the surviving row for its generic name.
    `UPDATE drug_allergies SET generic_name_id = (
        SELECT MIN(d2.id) FROM drug_generic_names d2
        WHERE d2.name = (SELECT d1.name FROM drug_generic_names d1
                         WHERE d1.id = drug_allergies.generic_name_id)
      ) WHERE generic_name_id IS NOT NULL`,
    // 2. Delete every row that isn't the MIN id for its name.
    `DELETE FROM drug_generic_names WHERE id NOT IN (
        SELECT MIN(id) FROM drug_generic_names GROUP BY name
      )`,
    // 3. Block future dups — now INSERT OR IGNORE works as intended.
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_drug_generic_names_name
        ON drug_generic_names(name)`,
  ]) {
    try { db.exec(sql) } catch {}
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
  try { db.exec(`ALTER TABLE products ADD COLUMN unit_id INTEGER REFERENCES item_units(id)`) } catch {}

  try {
    db.transaction(() => {
      db.exec(`
        UPDATE products
           SET unit_id = (SELECT pu.unit_id FROM product_units pu
                           WHERE pu.product_id = products.id AND pu.is_base_unit = 1)
         WHERE unit_id IS NULL
      `)
      // Gate: refuse to delete base rows if any product would be left orphaned.
      // (Products that were already orphaned before this migration are excluded
      // from the check via the EXISTS clause — they wouldn't be helped by aborting.)
      const orphans = db.prepare(`
        SELECT COUNT(*) AS c FROM products p
         WHERE p.unit_id IS NULL
           AND EXISTS (SELECT 1 FROM product_units pu
                        WHERE pu.product_id = p.id AND pu.is_base_unit = 1)
      `).get() as { c: number }
      if (orphans.c > 0) throw new Error(`Migration aborted: ${orphans.c} products would lose their base unit`)
      db.exec(`DELETE FROM product_units WHERE is_base_unit = 1`)
    })()
  } catch {}

  try { db.exec(`ALTER TABLE product_units DROP COLUMN is_base_unit`) } catch {}

  // Customers: add is_disabled (mirror suppliers/users soft-disable). Existing
  // is_hidden was the de-facto soft-delete flag; backfill so previously "deleted"
  // customers carry over as disabled under the new flag.
  for (const sql of [
    `ALTER TABLE customers ADD COLUMN is_disabled INTEGER NOT NULL DEFAULT 0`,
    `UPDATE customers SET is_disabled = 1 WHERE is_hidden = 1 AND is_disabled = 0`,
  ]) {
    try { db.exec(sql) } catch {}
  }

  // Drop unused columns — UI no longer reads/writes these. Try/catch absorbs
  // "no such column" on re-run. Order matters: customers.is_hidden drop runs
  // AFTER the is_hidden→is_disabled backfill above.
  for (const sql of [
    `ALTER TABLE customers DROP COLUMN hn`,
    `ALTER TABLE customers DROP COLUMN hc_uc`,
    `ALTER TABLE customers DROP COLUMN hc_gov`,
    `ALTER TABLE customers DROP COLUMN hc_sso`,
    `ALTER TABLE customers DROP COLUMN other_allergy`,
    `ALTER TABLE customers DROP COLUMN food_allergy`,
    `ALTER TABLE customers DROP COLUMN warning_note`,
    `ALTER TABLE customers DROP COLUMN is_hidden`,
    `ALTER TABLE suppliers DROP COLUMN contact_name`,
  ]) {
    try { db.exec(sql) } catch {}
  }

  // Migration: split the sale_return movement type. Voids and genuine customer
  // returns both used to write movement_type='sale_return', distinguished only
  // by ref_type ('sale' = void, 'return' = real return). Promote voids to their
  // own 'sale_void' type so the history/filter can tell them apart. The
  // ref_type predicate makes this exact + idempotent (no rows match on re-run).
  try {
    db.exec(`UPDATE stock_movements SET movement_type = 'sale_void' WHERE movement_type = 'sale_return' AND ref_type = 'sale'`)
  } catch {}

  // Refresh query-planner stats so the planner picks the new indexes added
  // above on first launch (and on later launches where data has grown).
  // PRAGMA optimize is cheap when stats are fresh — only re-ANALYZEs tables
  // whose stats are stale.
  try { db.exec(`PRAGMA optimize`) } catch {}
}
