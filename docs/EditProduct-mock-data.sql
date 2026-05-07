-- ===========================================================================
-- EditProduct.tsx — Mock test data for the real SQLite schema
-- ===========================================================================
-- Source-of-truth: electron/db/schema.ts
-- Covers tables exercised by src/pages/Products/EditProduct.tsx:
--   products, product_units, product_labels, product_lots
-- Skips UI-only / phantom keys (drug_generic_name_id, has_wholesale1/2,
-- default_qty, label_time_id, advice_id, show_barcode, is_default) — see
-- docs/EditProduct-field-mapping.txt for the rationale.
--
-- Idempotency:
--   - Suppliers use INSERT OR IGNORE on `code`.
--   - Products use INSERT OR IGNORE on `code` (codes MED001..MED100).
--   - Lookup FKs are resolved by code/name subqueries — works against any
--     schema.ts seed without depending on auto-incremented ids.
--   - Re-running this file is safe; product_units/product_lots inserts
--     guard with NOT EXISTS so they don't duplicate on re-run.
--
-- How to run (one-shot):
--   sqlite3 <path-to-app.db> < docs/EditProduct-mock-data.sql
-- Or paste into a DB GUI connected to the app db.
--
-- Field-coverage notes:
--   - Bulk INSERT keeps each row scannable; rare flags (has_vat, no_discount,
--     is_original_drug, is_fda_report, is_fda13_report, tmt_id, barcode2/3/4,
--     name_for_print, side_effect_note, note, is_hidden, is_disabled,
--     expiry_alert_days*) are set in the "Coverage extras" UPDATE block at
--     the bottom — every persistable products column is touched at least once.
--   - product_units gets base + strip variants for tablets/capsules and
--     box variants for 10 selected products — exercises is_base_unit / qty_per_base.
--   - product_lots: every product gets 1 healthy lot; 10 products get a 2nd
--     lot at varied expiry windows (red / orange / yellow / expired) so the
--     getExpiryStatus() logic can be visually tested.
--   - product_labels: 30 rows exercising dose_qty / dosage_id / frequency_id /
--     timing_id / indication_th/mm/zh / note_th/mm/zh / sort_order / is_active.
-- ===========================================================================

PRAGMA foreign_keys = ON;
BEGIN TRANSACTION;

-- ---------------------------------------------------------------------------
-- 1) Suppliers (referenced by product_lots)
-- ---------------------------------------------------------------------------
INSERT OR IGNORE INTO suppliers (code, name, tax_id, phone, address, contact_name) VALUES
  ('S0001', 'บริษัท ดีเอ็มเอช ฟาร์มา จำกัด', '0105537000111', '02-555-1111', '99/1 ถ.พระราม 4 กรุงเทพฯ 10110', 'คุณสมหญิง'),
  ('S0002', 'องค์การเภสัชกรรม',              '0994000159367', '02-203-8000', '75/1 ถ.พระราม 6 ราชเทวี กรุงเทพฯ 10400', 'คุณวิชัย'),
  ('S0003', 'บริษัท ซิลลิคฟาร์มา จำกัด',      '0105540023456', '02-650-7888', '88 อาคารปาโซ่ ถ.สีลม กรุงเทพฯ 10500', 'คุณนวพร');

-- ---------------------------------------------------------------------------
-- 2) Products (100 rows)
--    Columns set per row:
--      code, trade_name, category, drug_type, dosage_form, unit, strength,
--      registration_no, price_retail, cost_price, is_antibiotic,
--      is_sale_control, sale_control_qty, max_dispense_qty, indication_note,
--      search_keywords, barcode
--    Wholesale prices = 0.85 / 0.75 of retail.
--    reorder_point = 50, safety_stock = 20 for all (override below if needed).
--    Defaults rely on schema: is_stock_item=1, has_vat=0, no_discount=0,
--    is_hidden=0, is_disabled=0, is_original_drug=0, is_fda_report=0,
--    is_fda13_report=0, expiry_alert_days1/2/3=90/60/30. Tweaked below.
-- ---------------------------------------------------------------------------
WITH v(code, trade_name, cat, dt, df, unit, strength, reg, pr, cost, abx, ctrl, ctrl_q, maxq, indic, kw, bc) AS (VALUES
  -- Pain / Fever (10) ------------------------------------------------------
  ('MED001', 'Paracetamol 500mg',     'DRUG', 'OTC',       'Tablet',     'เม็ด',   '500 mg',     '1A 1/55',  1.00, 0.50, 0, 0, NULL, 8,    'ลดไข้ บรรเทาปวด',     'พารา,para,tylenol',    '8851000000001'),
  ('MED002', 'Paracetamol 325mg',     'DRUG', 'OTC',       'Tablet',     'เม็ด',   '325 mg',     '1A 2/55',  0.75, 0.40, 0, 0, NULL, 8,    'ลดไข้ บรรเทาปวด',     'พารา,para',            '8851000000002'),
  ('MED003', 'Tylenol 500mg',         'DRUG', 'OTC',       'Tablet',     'เม็ด',   '500 mg',     '1A 3/55',  2.00, 1.20, 0, 0, NULL, 8,    'ลดไข้ บรรเทาปวด',     'tylenol,paracetamol',  '8851000000003'),
  ('MED004', 'Sara 500mg',            'DRUG', 'OTC',       'Tablet',     'เม็ด',   '500 mg',     '1A 4/55',  1.50, 0.90, 0, 0, NULL, 8,    'ลดไข้ บรรเทาปวด',     'sara,paracetamol',     '8851000000004'),
  ('MED005', 'Ibuprofen 400mg',       'DRUG', 'DANGEROUS', 'Tablet',     'เม็ด',   '400 mg',     '1A 5/55',  3.00, 1.80, 0, 0, NULL, 4,    'แก้ปวด ลดอักเสบ',      'ibuprofen,brufen',     '8851000000005'),
  ('MED006', 'Ibuprofen 200mg',       'DRUG', 'OTC',       'Tablet',     'เม็ด',   '200 mg',     '1A 6/55',  1.50, 0.80, 0, 0, NULL, 8,    'แก้ปวด ลดอักเสบ',      'ibuprofen',            '8851000000006'),
  ('MED007', 'Aspirin 81mg',          'DRUG', 'OTC',       'Tablet',     'เม็ด',   '81 mg',      '1A 7/55',  2.50, 1.30, 0, 0, NULL, 30,   'ป้องกันลิ่มเลือด',     'aspirin,asa,bayer',    '8851000000007'),
  ('MED008', 'Naproxen 250mg',        'DRUG', 'DANGEROUS', 'Tablet',     'เม็ด',   '250 mg',     '1A 8/55',  5.00, 3.00, 0, 0, NULL, 4,    'แก้ปวด ลดอักเสบ',      'naproxen',             '8851000000008'),
  ('MED009', 'Diclofenac 25mg',       'DRUG', 'DANGEROUS', 'Tablet',     'เม็ด',   '25 mg',      '1A 9/55',  2.00, 1.10, 0, 0, NULL, 3,    'แก้ปวด ลดอักเสบ',      'diclofenac,voltaren',  '8851000000009'),
  ('MED010', 'Mefenamic acid 250mg',  'DRUG', 'DANGEROUS', 'Capsule',    'แคปซูล', '250 mg',     '1A 10/55', 3.50, 2.00, 0, 0, NULL, 4,    'แก้ปวด ลดอักเสบ',      'mefenamic,ponstan',    '8851000000010'),

  -- Antibiotics (15) -------------------------------------------------------
  ('MED011', 'Amoxicillin 500mg',     'DRUG', 'DANGEROUS', 'Capsule',    'แคปซูล', '500 mg',     '1A 11/55', 5.00, 3.00, 1, 0, NULL, 30,   'ยาฆ่าเชื้อแบคทีเรีย',  'amoxy,amoxicillin',    '8851000000011'),
  ('MED012', 'Amoxicillin 250mg',     'DRUG', 'DANGEROUS', 'Capsule',    'แคปซูล', '250 mg',     '1A 12/55', 3.50, 2.00, 1, 0, NULL, 30,   'ยาฆ่าเชื้อแบคทีเรีย',  'amoxy,amoxicillin',    '8851000000012'),
  ('MED013', 'Amoxicillin syrup 125', 'DRUG', 'DANGEROUS', 'Suspension', 'ขวด',    '125 mg/5ml', '1A 13/55', 45.00, 28.00, 1, 0, NULL, 1,  'ยาฆ่าเชื้อแบคทีเรีย',  'amoxy syrup',          '8851000000013'),
  ('MED014', 'Amoxicillin syrup 250', 'DRUG', 'DANGEROUS', 'Suspension', 'ขวด',    '250 mg/5ml', '1A 14/55', 55.00, 35.00, 1, 0, NULL, 1,  'ยาฆ่าเชื้อแบคทีเรีย',  'amoxy syrup',          '8851000000014'),
  ('MED015', 'Augmentin 625mg',       'DRUG', 'DANGEROUS', 'Tablet',     'เม็ด',   '625 mg',     '1A 15/55', 25.00, 16.00, 1, 0, NULL, 21, 'ยาฆ่าเชื้อแบคทีเรีย',  'augmentin,co-amox',    '8851000000015'),
  ('MED016', 'Azithromycin 250mg',    'DRUG', 'DANGEROUS', 'Capsule',    'แคปซูล', '250 mg',     '1A 16/55', 18.00, 11.00, 1, 0, NULL, 6,  'ยาฆ่าเชื้อแบคทีเรีย',  'azithromycin,zithromax','8851000000016'),
  ('MED017', 'Cephalexin 500mg',      'DRUG', 'DANGEROUS', 'Capsule',    'แคปซูล', '500 mg',     '1A 17/55', 6.00, 3.50, 1, 0, NULL, 28,   'ยาฆ่าเชื้อแบคทีเรีย',  'cephalexin,keflex',    '8851000000017'),
  ('MED018', 'Doxycycline 100mg',     'DRUG', 'DANGEROUS', 'Capsule',    'แคปซูล', '100 mg',     '1A 18/55', 4.00, 2.20, 1, 0, NULL, 28,   'ยาฆ่าเชื้อแบคทีเรีย',  'doxy,doxycycline',     '8851000000018'),
  ('MED019', 'Ciprofloxacin 500mg',   'DRUG', 'DANGEROUS', 'Tablet',     'เม็ด',   '500 mg',     '1A 19/55', 8.00, 4.50, 1, 0, NULL, 14,   'ยาฆ่าเชื้อแบคทีเรีย',  'cipro,ciprofloxacin',  '8851000000019'),
  ('MED020', 'Levofloxacin 500mg',    'DRUG', 'DANGEROUS', 'Tablet',     'เม็ด',   '500 mg',     '1A 20/55', 25.00, 15.00, 1, 0, NULL, 14, 'ยาฆ่าเชื้อแบคทีเรีย',  'levo,levofloxacin',    '8851000000020'),
  ('MED021', 'Norfloxacin 400mg',     'DRUG', 'DANGEROUS', 'Tablet',     'เม็ด',   '400 mg',     '1A 21/55', 5.00, 3.00, 1, 0, NULL, 14,   'ยาฆ่าเชื้อแบคทีเรีย',  'norfloxacin',          '8851000000021'),
  ('MED022', 'Metronidazole 400mg',   'DRUG', 'DANGEROUS', 'Tablet',     'เม็ด',   '400 mg',     '1A 22/55', 3.00, 1.80, 1, 0, NULL, 21,   'ยาฆ่าเชื้อแบคทีเรีย',  'flagyl,metro',         '8851000000022'),
  ('MED023', 'Cloxacillin 500mg',     'DRUG', 'DANGEROUS', 'Capsule',    'แคปซูล', '500 mg',     '1A 23/55', 5.00, 3.00, 1, 0, NULL, 28,   'ยาฆ่าเชื้อแบคทีเรีย',  'cloxa,cloxacillin',    '8851000000023'),
  ('MED024', 'Erythromycin 500mg',    'DRUG', 'DANGEROUS', 'Tablet',     'เม็ด',   '500 mg',     '1A 24/55', 6.00, 3.50, 1, 0, NULL, 28,   'ยาฆ่าเชื้อแบคทีเรีย',  'erythro',              '8851000000024'),
  ('MED025', 'Roxithromycin 150mg',   'DRUG', 'DANGEROUS', 'Tablet',     'เม็ด',   '150 mg',     '1A 25/55', 12.00, 7.00, 1, 0, NULL, 14,  'ยาฆ่าเชื้อแบคทีเรีย',  'roxithromycin',        '8851000000025'),

  -- Antihistamines (10) ----------------------------------------------------
  ('MED026', 'CPM 4mg',               'DRUG', 'OTC',       'Tablet',     'เม็ด',   '4 mg',       '1A 26/55', 0.50, 0.20, 0, 0, NULL, 30,   'แก้แพ้ ลดน้ำมูก',     'cpm,chlorphen',        '8851000000026'),
  ('MED027', 'Loratadine 10mg',       'DRUG', 'OTC',       'Tablet',     'เม็ด',   '10 mg',      '1A 27/55', 5.00, 3.00, 0, 0, NULL, 30,   'แก้แพ้ ไม่ง่วง',      'loratadine,clarityne', '8851000000027'),
  ('MED028', 'Cetirizine 10mg',       'DRUG', 'OTC',       'Tablet',     'เม็ด',   '10 mg',      '1A 28/55', 3.00, 1.80, 0, 0, NULL, 30,   'แก้แพ้ ไม่ง่วง',      'cetirizine,zyrtec',    '8851000000028'),
  ('MED029', 'Cetirizine syrup',      'DRUG', 'OTC',       'Syrup',      'ขวด',    '5 mg/5ml',   '1A 29/55', 75.00, 48.00, 0, 0, NULL, 1,  'แก้แพ้ ไม่ง่วง',      'cetirizine syrup',     '8851000000029'),
  ('MED030', 'Fexofenadine 60mg',     'DRUG', 'DANGEROUS', 'Tablet',     'เม็ด',   '60 mg',      '1A 30/55', 12.00, 7.00, 0, 0, NULL, 30,  'แก้แพ้ ไม่ง่วง',      'fexo,telfast',         '8851000000030'),
  ('MED031', 'Fexofenadine 180mg',    'DRUG', 'DANGEROUS', 'Tablet',     'เม็ด',   '180 mg',     '1A 31/55', 18.00, 11.00, 0, 0, NULL, 30, 'แก้แพ้ ไม่ง่วง',      'fexo,telfast',         '8851000000031'),
  ('MED032', 'Hydroxyzine 10mg',      'DRUG', 'DANGEROUS', 'Tablet',     'เม็ด',   '10 mg',      '1A 32/55', 2.00, 1.10, 0, 0, NULL, 30,   'แก้แพ้ ลดผื่น',       'hydroxyzine,atarax',   '8851000000032'),
  ('MED033', 'Diphenhydramine 25mg',  'DRUG', 'OTC',       'Capsule',    'แคปซูล', '25 mg',      '1A 33/55', 1.00, 0.50, 0, 0, NULL, 15,   'แก้แพ้ ช่วยให้นอนหลับ','benadryl',             '8851000000033'),
  ('MED034', 'Bromfeniramine 4mg',    'DRUG', 'OTC',       'Tablet',     'เม็ด',   '4 mg',       '1A 34/55', 0.80, 0.40, 0, 0, NULL, 30,   'แก้แพ้',             'bromfeniramine',       '8851000000034'),
  ('MED035', 'Promethazine syrup',    'DRUG', 'DANGEROUS', 'Syrup',      'ขวด',    '5 mg/5ml',   '1A 35/55', 45.00, 28.00, 0, 0, NULL, 1,  'แก้แพ้ แก้คลื่นไส้',  'phenergan',            '8851000000035'),

  -- GI / Antacid (10) ------------------------------------------------------
  ('MED036', 'Alum milk 240ml',       'DRUG', 'OTC',       'Suspension', 'ขวด',    NULL,         '1A 36/55', 45.00, 28.00, 0, 0, NULL, 1,  'ลดกรดในกระเพาะ',     'alum milk,antacid',    '8851000000036'),
  ('MED037', 'Alum milk sachet 30ml', 'DRUG', 'OTC',       'Suspension', 'ซอง',    NULL,         '1A 37/55', 8.00, 4.50, 0, 0, NULL, 10,   'ลดกรดในกระเพาะ',     'alum milk sachet',     '8851000000037'),
  ('MED038', 'Omeprazole 20mg',       'DRUG', 'DANGEROUS', 'Capsule',    'แคปซูล', '20 mg',      '1A 38/55', 5.00, 2.80, 0, 0, NULL, 30,   'ลดกรดในกระเพาะ',     'omeprazole,losec',     '8851000000038'),
  ('MED039', 'Lansoprazole 30mg',     'DRUG', 'DANGEROUS', 'Capsule',    'แคปซูล', '30 mg',      '1A 39/55', 12.00, 7.00, 0, 0, NULL, 30,  'ลดกรดในกระเพาะ',     'lansoprazole',         '8851000000039'),
  ('MED040', 'Esomeprazole 20mg',     'DRUG', 'DANGEROUS', 'Tablet',     'เม็ด',   '20 mg',      '1A 40/55', 25.00, 15.00, 0, 0, NULL, 30, 'ลดกรดในกระเพาะ',     'nexium,esomeprazole',  '8851000000040'),
  ('MED041', 'Ranitidine 150mg',      'DRUG', 'DANGEROUS', 'Tablet',     'เม็ด',   '150 mg',     '1A 41/55', 2.50, 1.40, 0, 0, NULL, 30,   'ลดกรดในกระเพาะ',     'ranitidine,zantac',    '8851000000041'),
  ('MED042', 'Famotidine 20mg',       'DRUG', 'DANGEROUS', 'Tablet',     'เม็ด',   '20 mg',      '1A 42/55', 3.00, 1.80, 0, 0, NULL, 30,   'ลดกรดในกระเพาะ',     'famotidine',           '8851000000042'),
  ('MED043', 'Domperidone 10mg',      'DRUG', 'DANGEROUS', 'Tablet',     'เม็ด',   '10 mg',      '1A 43/55', 2.50, 1.40, 0, 0, NULL, 15,   'แก้คลื่นไส้',         'motilium,domperidone', '8851000000043'),
  ('MED044', 'Metoclopramide 10mg',   'DRUG', 'DANGEROUS', 'Tablet',     'เม็ด',   '10 mg',      '1A 44/55', 2.00, 1.10, 0, 0, NULL, 15,   'แก้คลื่นไส้',         'plasil,metoclo',       '8851000000044'),
  ('MED045', 'Loperamide 2mg',        'DRUG', 'OTC',       'Capsule',    'แคปซูล', '2 mg',       '1A 45/55', 2.50, 1.40, 0, 0, NULL, 8,    'แก้ท้องเสีย',        'imodium,loperamide',   '8851000000045'),

  -- Cough / Cold / Respiratory (10) ----------------------------------------
  ('MED046', 'Bromhexine 8mg',        'DRUG', 'OTC',       'Tablet',     'เม็ด',   '8 mg',       '1A 46/55', 1.50, 0.80, 0, 0, NULL, 30,   'ขับเสมหะ',           'bisolvon,bromhexine',  '8851000000046'),
  ('MED047', 'Bromhexine syrup',      'DRUG', 'OTC',       'Syrup',      'ขวด',    '4 mg/5ml',   '1A 47/55', 55.00, 35.00, 0, 0, NULL, 1,  'ขับเสมหะ',           'bisolvon syrup',       '8851000000047'),
  ('MED048', 'DXM syrup',             'DRUG', 'OTC',       'Syrup',      'ขวด',    '15 mg/5ml',  '1A 48/55', 45.00, 28.00, 0, 0, NULL, 1,  'แก้ไอ',              'dxm,romilar',          '8851000000048'),
  ('MED049', 'Guaifenesin syrup',     'DRUG', 'OTC',       'Syrup',      'ขวด',    '100 mg/5ml', '1A 49/55', 35.00, 22.00, 0, 0, NULL, 1,  'ขับเสมหะ',           'guaifenesin',          '8851000000049'),
  ('MED050', 'Acetylcysteine 600mg',  'DRUG', 'OTC',       'Powder',     'ซอง',    '600 mg',     '1A 50/55', 12.00, 7.00, 0, 0, NULL, 10,  'ขับเสมหะ',           'fluimucil,nac',        '8851000000050'),
  ('MED051', 'Decolgen',              'DRUG', 'OTC',       'Tablet',     'เม็ด',   NULL,         '1A 51/55', 3.00, 1.80, 0, 0, NULL, 12,   'แก้หวัด ลดน้ำมูก',   'decolgen',             '8851000000051'),
  ('MED052', 'Tiffy',                 'DRUG', 'OTC',       'Tablet',     'เม็ด',   NULL,         '1A 52/55', 3.00, 1.80, 0, 0, NULL, 12,   'แก้หวัด',            'tiffy',                '8851000000052'),
  ('MED053', 'Sara Cold',             'DRUG', 'OTC',       'Tablet',     'เม็ด',   NULL,         '1A 53/55', 3.50, 2.00, 0, 0, NULL, 12,   'แก้หวัด ลดไข้',       'sara cold',            '8851000000053'),
  ('MED054', 'Solmux 500mg',          'DRUG', 'OTC',       'Capsule',    'แคปซูล', '500 mg',     '1A 54/55', 6.00, 3.50, 0, 0, NULL, 15,   'ขับเสมหะ',           'solmux,carbocist',     '8851000000054'),
  ('MED055', 'Salbutamol inhaler',    'DRUG', 'DANGEROUS', 'Inhaler',    'หลอด',   '100mcg/puff','1A 55/55', 150.00, 95.00, 0, 0, NULL, 1, 'ขยายหลอดลม',         'ventolin,salbutamol',  '8851000000055'),

  -- Vitamins / Supplements (15) --------------------------------------------
  ('MED056', 'Vitamin C 500mg',       'SUPPLEMENT', 'OTC', 'Tablet',     'เม็ด',   '500 mg',     NULL,       2.00, 1.10, 0, 0, NULL, 30,   'เสริมภูมิ',          'vitc,vitamin c',       '8851000000056'),
  ('MED057', 'Vitamin C 1000mg',      'SUPPLEMENT', 'OTC', 'Tablet',     'เม็ด',   '1000 mg',    NULL,       4.00, 2.30, 0, 0, NULL, 30,   'เสริมภูมิ',          'vitc 1000',            '8851000000057'),
  ('MED058', 'Vitamin B-Complex',     'SUPPLEMENT', 'OTC', 'Tablet',     'เม็ด',   NULL,         NULL,       3.00, 1.70, 0, 0, NULL, 30,   'บำรุงเส้นประสาท',     'b complex',            '8851000000058'),
  ('MED059', 'Vitamin B1 100mg',      'SUPPLEMENT', 'OTC', 'Tablet',     'เม็ด',   '100 mg',     NULL,       1.00, 0.50, 0, 0, NULL, 30,   'บำรุงเส้นประสาท',     'b1,thiamine',          '8851000000059'),
  ('MED060', 'Vitamin B6 100mg',      'SUPPLEMENT', 'OTC', 'Tablet',     'เม็ด',   '100 mg',     NULL,       1.50, 0.80, 0, 0, NULL, 30,   'บำรุงเส้นประสาท',     'b6,pyridoxine',        '8851000000060'),
  ('MED061', 'Vitamin B12 1000mcg',   'SUPPLEMENT', 'OTC', 'Tablet',     'เม็ด',   '1000 mcg',   NULL,       3.00, 1.80, 0, 0, NULL, 30,   'บำรุงเลือด',         'b12,cyanocobalamin',   '8851000000061'),
  ('MED062', 'Vitamin D3 1000IU',     'SUPPLEMENT', 'OTC', 'Capsule',    'แคปซูล', '1000 IU',    NULL,       5.00, 3.00, 0, 0, NULL, 30,   'บำรุงกระดูก',        'd3,vitamin d',         '8851000000062'),
  ('MED063', 'Vitamin E 400IU',       'SUPPLEMENT', 'OTC', 'Capsule',    'แคปซูล', '400 IU',     NULL,       4.00, 2.30, 0, 0, NULL, 30,   'ต้านอนุมูลอิสระ',    'vitamin e',            '8851000000063'),
  ('MED064', 'Multivitamin',          'SUPPLEMENT', 'OTC', 'Tablet',     'เม็ด',   NULL,         NULL,       5.00, 3.00, 0, 0, NULL, 30,   'วิตามินรวม',         'multi,centrum',        '8851000000064'),
  ('MED065', 'Calcium 600mg',         'SUPPLEMENT', 'OTC', 'Tablet',     'เม็ด',   '600 mg',     NULL,       4.00, 2.30, 0, 0, NULL, 30,   'บำรุงกระดูก',        'calcium',              '8851000000065'),
  ('MED066', 'Calcium + Vit D',       'SUPPLEMENT', 'OTC', 'Tablet',     'เม็ด',   NULL,         NULL,       5.00, 3.00, 0, 0, NULL, 30,   'บำรุงกระดูก',        'caltrate',             '8851000000066'),
  ('MED067', 'Iron tablets (FBC)',    'SUPPLEMENT', 'OTC', 'Tablet',     'เม็ด',   '60 mg',      NULL,       1.00, 0.50, 0, 0, NULL, 30,   'บำรุงเลือด',         'iron,fbc,ferrous',     '8851000000067'),
  ('MED068', 'Folic acid 5mg',        'DRUG',       'OTC', 'Tablet',     'เม็ด',   '5 mg',       '1A 68/55', 0.80, 0.40, 0, 0, NULL, 30,   'บำรุงเลือด',         'folic acid',           '8851000000068'),
  ('MED069', 'Zinc 50mg',             'SUPPLEMENT', 'OTC', 'Tablet',     'เม็ด',   '50 mg',      NULL,       3.50, 2.00, 0, 0, NULL, 30,   'เสริมภูมิ',          'zinc',                 '8851000000069'),
  ('MED070', 'Fish oil 1000mg',       'SUPPLEMENT', 'OTC', 'Capsule',    'แคปซูล', '1000 mg',    NULL,       6.00, 3.50, 0, 0, NULL, 30,   'omega-3',           'fish oil,omega',       '8851000000070'),

  -- Topical (10) -----------------------------------------------------------
  ('MED071', 'Calamine lotion 60ml',  'DRUG',   'OTC',       'Lotion',   'ขวด',    NULL,         '1A 71/55', 35.00, 22.00, 0, 0, NULL, 1, 'แก้ผื่นคัน',         'calamine',             '8851000000071'),
  ('MED072', 'Betadine sol 30ml',     'SUPPLY', 'OTC',       'Lotion',   'ขวด',    '10%',        NULL,       55.00, 35.00, 0, 0, NULL, 1, 'น้ำยาฆ่าเชื้อ',       'betadine,povidone',    '8851000000072'),
  ('MED073', 'Mupirocin 2% cream',    'DRUG',   'DANGEROUS', 'Cream',    'หลอด',   '2%',         '1A 73/55', 95.00, 60.00, 1, 0, NULL, 1, 'ครีมปฏิชีวนะ',       'mupirocin,bactroban',  '8851000000073'),
  ('MED074', 'Hydrocortisone 1%',     'DRUG',   'OTC',       'Cream',    'หลอด',   '1%',         '1A 74/55', 45.00, 28.00, 0, 0, NULL, 1, 'ครีมแก้คัน',         'hydrocort,hc',         '8851000000074'),
  ('MED075', 'Clotrimazole 1%',       'DRUG',   'OTC',       'Cream',    'หลอด',   '1%',         '1A 75/55', 55.00, 35.00, 0, 0, NULL, 1, 'ครีมรักษาเชื้อรา',  'clotrimazole,canesten','8851000000075'),
  ('MED076', 'Ketoconazole 2%',       'DRUG',   'DANGEROUS', 'Cream',    'หลอด',   '2%',         '1A 76/55', 85.00, 55.00, 0, 0, NULL, 1, 'ครีมรักษาเชื้อรา',  'ketoconazole,nizoral', '8851000000076'),
  ('MED077', 'Counterpain cream',     'DRUG',   'OTC',       'Cream',    'หลอด',   NULL,         '1A 77/55', 75.00, 48.00, 0, 0, NULL, 1, 'ครีมแก้ปวดเมื่อย',  'counterpain',          '8851000000077'),
  ('MED078', 'Voltaren gel 1%',       'DRUG',   'DANGEROUS', 'Gel',      'หลอด',   '1%',         '1A 78/55', 125.00, 80.00, 0, 0, NULL, 1,'เจลแก้ปวดเมื่อย',  'voltaren,diclofenac',  '8851000000078'),
  ('MED079', 'Centella cream',        'DRUG',   'OTC',       'Cream',    'หลอด',   NULL,         '1A 79/55', 95.00, 60.00, 0, 0, NULL, 1, 'แผลเป็น',            'centella,madecassol',  '8851000000079'),
  ('MED080', 'Acyclovir 5% cream',    'DRUG',   'DANGEROUS', 'Cream',    'หลอด',   '5%',         '1A 80/55', 85.00, 55.00, 0, 0, NULL, 1, 'ครีมรักษาเริม',     'acyclovir,zovirax',    '8851000000080'),

  -- Controlled substances (5) — is_sale_control=1 ---------------------------
  ('MED081', 'Alprazolam 0.5mg',      'DRUG', 'PSYCHO_4',   'Tablet',   'เม็ด',   '0.5 mg',     '1A 81/55', 8.00, 4.50, 0, 1, 30, 30,    'แก้กังวล',            'xanax,alprazolam',     '8851000000081'),
  ('MED082', 'Diazepam 5mg',          'DRUG', 'PSYCHO_4',   'Tablet',   'เม็ด',   '5 mg',       '1A 82/55', 3.00, 1.80, 0, 1, 30, 30,    'แก้กังวล',            'valium,diazepam',      '8851000000082'),
  ('MED083', 'Codeine syrup',         'DRUG', 'NARCOTIC_3', 'Syrup',    'ขวด',    '10 mg/5ml',  '1A 83/55', 75.00, 48.00, 0, 1, 1, 1,    'แก้ไอ',              'codeine syrup',        '8851000000083'),
  ('MED084', 'Tramadol 50mg',         'DRUG', 'SPCL_CTRL',  'Capsule',  'แคปซูล', '50 mg',      '1A 84/55', 6.00, 3.50, 0, 0, NULL, 15,  'แก้ปวดรุนแรง',       'tramadol,tramol',      '8851000000084'),
  ('MED085', 'Lorazepam 1mg',         'DRUG', 'PSYCHO_4',   'Tablet',   'เม็ด',   '1 mg',       '1A 85/55', 5.00, 3.00, 0, 1, 30, 30,    'แก้กังวล',            'ativan,lorazepam',     '8851000000085'),

  -- ORS / electrolytes / charcoal (5) --------------------------------------
  ('MED086', 'ORS sachet',            'DRUG',       'OTC', 'Powder',     'ซอง',    NULL,         '1A 86/55', 8.00, 4.50, 0, 0, NULL, 20,  'เกลือแร่',           'ors,electrolyte',      '8851000000086'),
  ('MED087', 'Electrolyte 500ml',     'SUPPLEMENT', 'OTC', 'Suspension', 'ขวด',    NULL,         NULL,       25.00, 16.00, 0, 0, NULL, 5, 'เกลือแร่',           'sport drink',          '8851000000087'),
  ('MED088', 'Pedialyte 250ml',       'SUPPLEMENT', 'OTC', 'Suspension', 'ขวด',    NULL,         NULL,       45.00, 28.00, 0, 0, NULL, 5, 'เกลือแร่เด็ก',       'pedialyte',            '8851000000088'),
  ('MED089', 'Glucose powder 100g',   'SUPPLY',     'OTC', 'Powder',     'ซอง',    NULL,         NULL,       15.00, 9.00, 0, 0, NULL, 5,  'น้ำตาลกลูโคส',       'glucose',              '8851000000089'),
  ('MED090', 'Activated charcoal',    'DRUG',       'OTC', 'Tablet',     'เม็ด',   '250 mg',     '1A 90/55', 2.00, 1.10, 0, 0, NULL, 30,  'ดูดสารพิษ',          'charcoal,ultracarbon', '8851000000090'),

  -- Eye / Ear / Throat / Misc supplies (10) --------------------------------
  ('MED091', 'Tears Naturale eye',    'DRUG',   'OTC',       'Eye Drop', 'ขวด',    NULL,         '1A 91/55', 125.00, 80.00, 0, 0, NULL, 1,'น้ำตาเทียม',         'tears naturale',       '8851000000091'),
  ('MED092', 'Vislin eye drop',       'DRUG',   'OTC',       'Eye Drop', 'ขวด',    NULL,         '1A 92/55', 45.00, 28.00, 0, 0, NULL, 1, 'แก้ตาแดง',           'vislin',               '8851000000092'),
  ('MED093', 'Otosporin ear drop',    'DRUG',   'DANGEROUS', 'Ear Drop', 'ขวด',    NULL,         '1A 93/55', 155.00, 98.00, 1, 0, NULL, 1,'หยอดหู ฆ่าเชื้อ',   'otosporin',            '8851000000093'),
  ('MED094', 'Strepsils lozenges',    'DRUG',   'OTC',       'Tablet',   'ซอง',    NULL,         '1A 94/55', 45.00, 28.00, 0, 0, NULL, 3, 'อมแก้เจ็บคอ',        'strepsils',            '8851000000094'),
  ('MED095', 'Listerine 250ml',       'SUPPLY', 'OTC',       'Lotion',   'ขวด',    NULL,         NULL,       135.00, 85.00, 0, 0, NULL, 1,'น้ำยาบ้วนปาก',       'listerine',            '8851000000095'),
  ('MED096', 'Saline nasal 30ml',     'DRUG',   'OTC',       'Inhaler',  'ขวด',    '0.65%',      '1A 96/55', 75.00, 48.00, 0, 0, NULL, 1, 'พ่นจมูก',            'saline,sterimar',      '8851000000096'),
  ('MED097', 'Hand sanitizer 70%',    'SUPPLY', 'OTC',       'Lotion',   'ขวด',    '70%',        NULL,       55.00, 35.00, 0, 0, NULL, 5, 'เจลล้างมือ',         'sanitizer,alcohol',    '8851000000097'),
  ('MED098', 'Surgical mask 3-ply',   'SUPPLY', 'OTC',       'Patch',    'ชิ้น',   NULL,         NULL,       2.00, 1.20, 0, 0, NULL, 100, 'หน้ากากอนามัย',     'mask,surgical',        '8851000000098'),
  ('MED099', 'Bandage roll 4 inch',   'SUPPLY', 'OTC',       'Patch',    'ชิ้น',   NULL,         NULL,       25.00, 16.00, 0, 0, NULL, 5, 'ผ้าพันแผล',          'bandage,gauze',        '8851000000099'),
  ('MED100', 'Digital thermometer',   'SUPPLY', 'OTC',       'Patch',    'อัน',    NULL,         NULL,       185.00, 120.00, 0, 0, NULL, 1,'เทอร์โมมิเตอร์',     'thermometer',          '8851000000100')
)
INSERT OR IGNORE INTO products (
  code, trade_name, category_id, drug_type_id, dosage_form_id, unit_id,
  strength, registration_no,
  price_retail, price_wholesale1, price_wholesale2, cost_price,
  reorder_point, safety_stock,
  is_antibiotic, is_sale_control, sale_control_qty, max_dispense_qty,
  indication_note, search_keywords, barcode
)
SELECT
  v.code, v.trade_name, c.id, dt.id, df.id, u.id,
  v.strength, v.reg,
  v.pr, ROUND(v.pr * 0.85, 2), ROUND(v.pr * 0.75, 2), v.cost,
  50, 20,
  v.abx, v.ctrl, v.ctrl_q, v.maxq,
  v.indic, v.kw, v.bc
FROM v
LEFT JOIN product_categories c  ON c.code = v.cat
LEFT JOIN drug_types        dt  ON dt.code = v.dt
LEFT JOIN dosage_forms      df  ON df.name_en = v.df
LEFT JOIN item_units        u   ON u.name = v.unit;

-- ---------------------------------------------------------------------------
-- 3) Coverage extras — exercise every remaining persistable products column
-- ---------------------------------------------------------------------------
-- has_vat: supplies typically have VAT
UPDATE products SET has_vat = 1 WHERE code IN ('MED095', 'MED097', 'MED098', 'MED099', 'MED100');

-- no_discount: all controlled substances + a few flagship branded items
UPDATE products SET no_discount = 1 WHERE code IN ('MED081', 'MED082', 'MED083', 'MED084', 'MED085', 'MED055');

-- is_original_drug: branded originals
UPDATE products SET is_original_drug = 1 WHERE code IN ('MED015', 'MED055', 'MED078', 'MED040', 'MED093', 'MED038');

-- is_fda_report: all DANGEROUS / SPCL_CTRL drugs with khor_yor_report
UPDATE products SET is_fda_report = 1
  WHERE drug_type_id IN (SELECT id FROM drug_types WHERE code IN ('DANGEROUS', 'SPCL_CTRL'));

-- is_fda13_report: psychotropics + narcotics
UPDATE products SET is_fda13_report = 1
  WHERE drug_type_id IN (SELECT id FROM drug_types WHERE code IN ('PSYCHO_4', 'NARCOTIC_3'));

-- tmt_id: synthetic 7-digit TMT id for all DRUG-category products
UPDATE products
   SET tmt_id = 'TMT' || substr('0000000' || id, -7)
 WHERE category_id = (SELECT id FROM product_categories WHERE code = 'DRUG');

-- name_for_print: short alias for cash receipts (a few examples)
UPDATE products SET name_for_print = 'พารา 500'      WHERE code = 'MED001';
UPDATE products SET name_for_print = 'อะม็อกซี่ 500' WHERE code = 'MED011';
UPDATE products SET name_for_print = 'ออกเมนติน'    WHERE code = 'MED015';
UPDATE products SET name_for_print = 'เซทิริซีน'    WHERE code = 'MED028';
UPDATE products SET name_for_print = 'โอเมพราโซล'  WHERE code = 'MED038';

-- secondary barcodes: paracetamol gets all 4
UPDATE products
   SET barcode2 = '8851000000901',
       barcode3 = '8851000000902',
       barcode4 = '8851000000903'
 WHERE code = 'MED001';
UPDATE products SET barcode2 = '8851000000911' WHERE code = 'MED011';
UPDATE products SET barcode2 = '8851000000915' WHERE code = 'MED015';

-- side_effect_note: NSAIDs / antibiotics / inhaler / controlled
UPDATE products
   SET side_effect_note = 'อาจทำให้คลื่นไส้ ปวดท้อง — ควรรับประทานหลังอาหาร'
 WHERE code IN ('MED005', 'MED008', 'MED009', 'MED010');
UPDATE products
   SET side_effect_note = 'อาจทำให้ท้องเสีย คลื่นไส้ — ควรรับประทานยาให้ครบ course'
 WHERE code IN ('MED011', 'MED015', 'MED019', 'MED022');
UPDATE products
   SET side_effect_note = 'อาจทำให้ใจสั่น มือสั่น'
 WHERE code = 'MED055';
UPDATE products
   SET side_effect_note = 'ทำให้ง่วง — ห้ามขับรถ ห้ามดื่มแอลกอฮอล์'
 WHERE code IN ('MED081', 'MED082', 'MED084', 'MED085');

-- note: free-text product remarks
UPDATE products SET note = 'รุ่นใหม่ packaging กล่อง 100 เม็ด' WHERE code = 'MED015';
UPDATE products SET note = 'ผู้ผลิตเปลี่ยนสูตรปี 2026'         WHERE code = 'MED040';
UPDATE products SET note = 'ขึ้นทะเบียนพิเศษ — ต้องแสดง อย.13' WHERE code IN ('MED081', 'MED083');

-- expiry_alert_days*: stricter alerting for sensitive items
UPDATE products
   SET expiry_alert_days1 = 120, expiry_alert_days2 = 90, expiry_alert_days3 = 45
 WHERE code IN ('MED055', 'MED093', 'MED091');

-- is_hidden / is_disabled: demonstrate visibility flags (1 each)
UPDATE products SET is_hidden  = 1 WHERE code = 'MED099';
UPDATE products SET is_disabled = 1 WHERE code = 'MED100';

-- safety_stock / reorder_point overrides for high-velocity products
UPDATE products SET reorder_point = 500, safety_stock = 200
  WHERE code IN ('MED001', 'MED026', 'MED056', 'MED086', 'MED098');

-- ---------------------------------------------------------------------------
-- 4) product_units — base unit per product (mirrors products row), then
--    strip variants for tablets/capsules and box variants for select items.
-- ---------------------------------------------------------------------------
-- Base unit (every product, qty_per_base = 1, is_base_unit = 1)
INSERT INTO product_units (
  product_id, unit_id, qty_per_base,
  price_retail, price_wholesale1, price_wholesale2,
  is_base_unit, is_for_sale, is_for_purchase
)
SELECT p.id, p.unit_id, 1,
       p.price_retail, p.price_wholesale1, p.price_wholesale2,
       1, 1, 1
FROM products p
WHERE p.code LIKE 'MED%'
  AND NOT EXISTS (
    SELECT 1 FROM product_units pu
     WHERE pu.product_id = p.id AND pu.is_base_unit = 1
  );

-- Strip variant (แผง = 10 base) for tablets/capsules
INSERT INTO product_units (
  product_id, unit_id, barcode, qty_per_base,
  price_retail, price_wholesale1, price_wholesale2,
  is_base_unit, is_for_sale, is_for_purchase
)
SELECT p.id,
       (SELECT id FROM item_units WHERE name = 'แผง'),
       '885' || substr('0000000' || (p.id + 5000), -7),
       10,
       ROUND(p.price_retail     * 10, 2),
       ROUND(p.price_wholesale1 * 10, 2),
       ROUND(p.price_wholesale2 * 10, 2),
       0, 1, 0
FROM products p
WHERE p.code LIKE 'MED%'
  AND p.unit_id IN (SELECT id FROM item_units WHERE name IN ('เม็ด', 'แคปซูล'))
  AND NOT EXISTS (
    SELECT 1 FROM product_units pu
     WHERE pu.product_id = p.id
       AND pu.unit_id = (SELECT id FROM item_units WHERE name = 'แผง')
  );

-- Box variant (กล่อง = 100 base, purchase-only) for 10 high-runners
INSERT INTO product_units (
  product_id, unit_id, qty_per_base,
  price_retail, price_wholesale1, price_wholesale2,
  is_base_unit, is_for_sale, is_for_purchase
)
SELECT p.id,
       (SELECT id FROM item_units WHERE name = 'กล่อง'),
       100,
       ROUND(p.price_retail     * 100 * 0.85, 2),
       ROUND(p.price_wholesale1 * 100 * 0.85, 2),
       ROUND(p.price_wholesale2 * 100 * 0.85, 2),
       0, 0, 1
FROM products p
WHERE p.code IN ('MED001','MED011','MED015','MED019','MED026','MED038','MED041','MED046','MED056','MED068')
  AND NOT EXISTS (
    SELECT 1 FROM product_units pu
     WHERE pu.product_id = p.id
       AND pu.unit_id = (SELECT id FROM item_units WHERE name = 'กล่อง')
  );

-- ---------------------------------------------------------------------------
-- 5) product_lots
--    Lot 1: healthy ~24-month expiry, supplier rotated, mostly paid up.
--    Lot 2: 10 items get a near-expiry / expired lot for getExpiryStatus()
--           visual testing. Expiry computed relative to today via date('now').
-- ---------------------------------------------------------------------------
-- Lot 1: every product, supplier rotated by id, healthy expiry
INSERT INTO product_lots (
  product_id, supplier_id,
  lot_number, manufactured_date, expiry_date,
  cost_price, sell_price,
  qty_received, qty_on_hand, qty_reserved,
  invoice_no, supplier_invoice_no,
  payment_type, due_date, is_paid, paid_date,
  note
)
SELECT
  p.id,
  (SELECT id FROM suppliers WHERE code = CASE (p.id % 3)
     WHEN 0 THEN 'S0001' WHEN 1 THEN 'S0002' ELSE 'S0003' END),
  'LOT-' || p.code || '-001',
  '2025-06-15',
  '2027-06-15',
  p.cost_price,
  p.price_retail,
  CASE WHEN p.unit_id IN (SELECT id FROM item_units WHERE name IN ('เม็ด','แคปซูล','ซอง')) THEN 500 ELSE 50 END,
  CASE WHEN p.unit_id IN (SELECT id FROM item_units WHERE name IN ('เม็ด','แคปซูล','ซอง')) THEN 350 ELSE 30 END,
  0,
  'GR-20260101-001',
  'INV-2026-' || substr('0000' || p.id, -4),
  CASE WHEN p.id % 4 = 0 THEN 'credit' ELSE 'cash' END,
  CASE WHEN p.id % 4 = 0 THEN '2026-03-01' ELSE NULL END,
  CASE WHEN p.id % 4 = 0 THEN 0 ELSE 1 END,
  CASE WHEN p.id % 4 = 0 THEN NULL ELSE '2026-01-01' END,
  CASE WHEN p.id % 7 = 0 THEN 'รอบรับล็อตแรกของปี' ELSE NULL END
FROM products p
WHERE p.code LIKE 'MED%'
  AND NOT EXISTS (
    SELECT 1 FROM product_lots l
     WHERE l.product_id = p.id AND l.lot_number = 'LOT-' || p.code || '-001'
  );

-- Lot 2: near-expiry / expired for visual testing of getExpiryStatus()
-- Mapping (10 codes, varied buckets):
--   MED001/MED038 → expired (already past)
--   MED011/MED068 → red zone (expires within ~10 days from today)
--   MED015/MED046 → orange zone (~45 days)
--   MED019/MED056 → yellow zone (~75 days)
--   MED026/MED081 → green/healthy 200+ days (control sample)
INSERT INTO product_lots (
  product_id, supplier_id,
  lot_number, manufactured_date, expiry_date,
  cost_price, sell_price,
  qty_received, qty_on_hand, qty_reserved,
  invoice_no, supplier_invoice_no,
  payment_type, is_paid, paid_date,
  note
)
SELECT
  p.id,
  (SELECT id FROM suppliers WHERE code = 'S0001'),
  'LOT-' || p.code || '-002',
  '2024-06-15',
  CASE p.code
    WHEN 'MED001' THEN date('now', '-5 days')
    WHEN 'MED038' THEN date('now', '-15 days')
    WHEN 'MED011' THEN date('now', '+8 days')
    WHEN 'MED068' THEN date('now', '+12 days')
    WHEN 'MED015' THEN date('now', '+45 days')
    WHEN 'MED046' THEN date('now', '+50 days')
    WHEN 'MED019' THEN date('now', '+75 days')
    WHEN 'MED056' THEN date('now', '+80 days')
    WHEN 'MED026' THEN date('now', '+220 days')
    WHEN 'MED081' THEN date('now', '+200 days')
  END,
  ROUND(p.cost_price * 0.95, 2),
  p.price_retail,
  100, 50, 0,
  'GR-20240701-001',
  'INV-2024-OLD',
  'cash', 1, '2024-07-05',
  'ล็อตเก่า — ใช้ทดสอบ expiry alert'
FROM products p
WHERE p.code IN ('MED001','MED038','MED011','MED068','MED015','MED046','MED019','MED056','MED026','MED081')
  AND NOT EXISTS (
    SELECT 1 FROM product_lots l
     WHERE l.product_id = p.id AND l.lot_number = 'LOT-' || p.code || '-002'
  );

-- ---------------------------------------------------------------------------
-- 6) product_labels — 30 dispensable drugs, exercising every persistable column
--    (skips phantom columns: label_time_id, advice_id, show_barcode, is_default)
-- ---------------------------------------------------------------------------
WITH v(code, label_name, dose_qty, dosage_code, freq_code, meal_code,
       ind_th, ind_mm, ind_zh, note_th, note_mm, note_zh,
       is_active, sort_order) AS (VALUES
  -- code      label_name                          dose dosage   freq  meal     ind_th                  ind_mm                ind_zh        note_th                          note_mm        note_zh   active sort
  ('MED001', 'พารา ลดไข้',                         1,  'ONE',   'Q6H', 'AFTER', 'ลดไข้ บรรเทาปวด',    'အဖျား အနာကျရန်',    '退烧 止痛',  'ห้ามใช้เกินขนาด',                 NULL,          NULL,     1, 1),
  ('MED003', 'Tylenol 1 เม็ด ทุก 6 ชม.',           1,  'ONE',   'Q6H', 'AFTER', 'ลดไข้ บรรเทาปวด',    NULL,                 NULL,         'รับประทานหลังอาหาร',              NULL,          NULL,     1, 1),
  ('MED005', 'Ibuprofen 1 เม็ด หลังอาหาร',         1,  'ONE',   'TDS', 'AFTER', 'แก้ปวด ลดอักเสบ',    NULL,                 NULL,         'ห้ามรับประทานตอนท้องว่าง',       NULL,          NULL,     1, 1),
  ('MED006', 'Ibuprofen 200 เด็กโต',               1,  'ONE',   'TDS', 'AFTER', 'แก้ปวด ลดอักเสบ',    NULL,                 NULL,         NULL,                              NULL,          NULL,     1, 2),
  ('MED008', 'Naproxen 1 เม็ด เช้า-เย็น',          1,  'ONE',   'BD',  'AFTER', 'แก้ปวด ลดอักเสบ',    NULL,                 NULL,         'ห้ามใช้ร่วมกับ NSAIDs ตัวอื่น',   NULL,          NULL,     1, 1),
  ('MED010', 'Ponstan แก้ปวดประจำเดือน',           1,  'ONE',   'TDS', 'AFTER', 'แก้ปวดประจำเดือน',   NULL,                 NULL,         NULL,                              NULL,          NULL,     1, 1),
  ('MED011', 'Amoxy 1 cap ทุก 8 ชม.',              1,  'ONE',   'TDS', 'AFTER', 'ฆ่าเชื้อแบคทีเรีย', 'ဗက်တီးရီးယားသတ်',  '抗生素',    'รับประทานให้ครบ course 7 วัน',  'အခမ်းအနားပြည့်အောင်','服完整療程', 1, 1),
  ('MED012', 'Amoxy 250 cap',                      1,  'ONE',   'TDS', 'AFTER', 'ฆ่าเชื้อแบคทีเรีย', NULL,                 NULL,         'รับประทานให้ครบ course',          NULL,          NULL,     1, 2),
  ('MED013', 'Amoxy syr 5 ml ทุก 8 ชม.',           5,  '5ML',   'TDS', 'AFTER', 'ฆ่าเชื้อแบคทีเรีย', NULL,                 NULL,         'เขย่าก่อนใช้ เก็บในตู้เย็น',     NULL,          NULL,     1, 1),
  ('MED015', 'Augmentin 625 BD',                   1,  'ONE',   'BD',  'WITH',  'ฆ่าเชื้อแบคทีเรียกว้าง','ဗက်တီးရီးယားသတ်','廣譜抗生素','รับประทานพร้อมอาหารป้องกันคลื่นไส้',NULL,        NULL,     1, 1),
  ('MED016', 'Azithro OD x 3 วัน',                 1,  'ONE',   'OD',  'BEFORE','ฆ่าเชื้อแบคทีเรีย', NULL,                 NULL,         'รับประทาน 3 วันต่อเนื่อง',        NULL,          NULL,     1, 1),
  ('MED019', 'Cipro 500 BD',                       1,  'ONE',   'BD',  'AFTER', 'ฆ่าเชื้อแบคทีเรีย', NULL,                 NULL,         'ดื่มน้ำมากๆ — ห้ามทานพร้อมนม',   NULL,          NULL,     1, 1),
  ('MED022', 'Metro 1 เม็ด ทุก 8 ชม.',             1,  'ONE',   'TDS', 'AFTER', 'ฆ่าเชื้อ',           NULL,                 NULL,         'ห้ามดื่มแอลกอฮอล์',                NULL,          NULL,     1, 1),
  ('MED026', 'CPM ก่อนนอน',                        1,  'ONE',   'HS',  'ANY',   'แก้แพ้ ลดน้ำมูก',    NULL,                 NULL,         'อาจทำให้ง่วง',                    NULL,          NULL,     1, 1),
  ('MED027', 'Loratadine OD',                      1,  'ONE',   'OD',  'ANY',   'แก้แพ้ ไม่ง่วง',     NULL,                 NULL,         NULL,                              NULL,          NULL,     1, 1),
  ('MED028', 'Cetirizine ก่อนนอน',                 1,  'ONE',   'HS',  'ANY',   'แก้แพ้ ไม่ง่วง',     NULL,                 NULL,         NULL,                              NULL,          NULL,     1, 1),
  ('MED029', 'Cetirizine syr เด็ก 5 ml',           5,  '5ML',   'OD',  'ANY',   'แก้แพ้เด็ก',         NULL,                 NULL,         'เขย่าก่อนใช้',                    NULL,          NULL,     1, 1),
  ('MED032', 'Atarax คันลมพิษ',                    1,  'ONE',   'TDS', 'AFTER', 'แก้คัน ลดผื่น',      NULL,                 NULL,         'อาจทำให้ง่วง',                    NULL,          NULL,     1, 1),
  ('MED038', 'Omeprazole 1 cap ก่อนอาหารเช้า',     1,  'ONE',   'OD',  'BEFORE','ลดกรด — แผลในกระเพาะ',NULL,                NULL,         'รับประทานตอนท้องว่าง 30 นาทีก่อนอาหาร',NULL,    NULL,     1, 1),
  ('MED040', 'Nexium 1 เม็ด เช้า',                 1,  'ONE',   'OD',  'BEFORE','ลดกรด',              NULL,                 NULL,         NULL,                              NULL,          NULL,     1, 1),
  ('MED043', 'Domperidone ก่อนอาหาร',              1,  'ONE',   'TDS', 'BEFORE','แก้คลื่นไส้',         NULL,                 NULL,         NULL,                              NULL,          NULL,     1, 1),
  ('MED045', 'Imodium PRN ท้องเสีย',               1,  'ONE',   'PRN', 'ANY',   'แก้ท้องเสีย',        NULL,                 NULL,         'ไม่เกิน 8 cap/วัน',               NULL,          NULL,     1, 1),
  ('MED046', 'Bromhexine TDS',                     1,  'ONE',   'TDS', 'AFTER', 'ขับเสมหะ',           NULL,                 NULL,         NULL,                              NULL,          NULL,     1, 1),
  ('MED048', 'DXM syr 5 ml ทุก 6 ชม.',             5,  '5ML',   'Q6H', 'ANY',   'แก้ไอ',               NULL,                 NULL,         'อาจทำให้ง่วง',                    NULL,          NULL,     1, 1),
  ('MED055', 'Salbutamol 2 พ่น PRN',               2,  '2PUFFS','PRN', 'ANY',   'ขยายหลอดลม',         NULL,                 NULL,         'พ่นเมื่อหายใจไม่สะดวก',           NULL,          NULL,     1, 1),
  ('MED056', 'Vit C 1 เม็ด ตอนเช้า',               1,  'ONE',   'OD',  'AFTER', 'เสริมภูมิคุ้มกัน',  NULL,                 NULL,         NULL,                              NULL,          NULL,     1, 1),
  ('MED067', 'Iron 1 เม็ด ก่อนอาหาร',              1,  'ONE',   'OD',  'BEFORE','บำรุงเลือด',         NULL,                 NULL,         'ดื่มน้ำส้มเพิ่มการดูดซึม',        NULL,          NULL,     1, 1),
  ('MED074', 'HC cream ทาบางๆ',                    NULL,'APPLY', 'BD', 'ANY',   'แก้คันผื่น',          NULL,                 NULL,         'ใช้ภายนอกเท่านั้น',               NULL,          NULL,     1, 1),
  ('MED081', 'Xanax ½ เม็ด ก่อนนอน',               NULL,'HALF',  'HS',  'ANY',   'แก้กังวล',           NULL,                 NULL,         'ห้ามขับรถ ห้ามดื่มแอลกอฮอล์',    NULL,          NULL,     1, 1),
  ('MED086', 'ORS 1 ซอง/น้ำ 250 ml',              1,  'ONE',   'PRN', 'ANY',   'ทดแทนเกลือแร่',      NULL,                 NULL,         'ดื่มทีละน้อยๆ',                  NULL,          NULL,     1, 1)
)
INSERT INTO product_labels (
  product_id, label_name, dose_qty,
  dosage_id, frequency_id, timing_id,
  indication_th, indication_mm, indication_zh,
  note_th, note_mm, note_zh,
  is_active, sort_order
)
SELECT p.id, v.label_name, v.dose_qty,
       ld.id, lf.id, lmr.id,
       v.ind_th, v.ind_mm, v.ind_zh,
       v.note_th, v.note_mm, v.note_zh,
       v.is_active, v.sort_order
FROM v
JOIN products              p   ON p.code = v.code
LEFT JOIN label_dosages         ld  ON ld.code = v.dosage_code
LEFT JOIN label_frequencies     lf  ON lf.code = v.freq_code
LEFT JOIN label_meal_relations  lmr ON lmr.code = v.meal_code
WHERE NOT EXISTS (
  SELECT 1 FROM product_labels pl
   WHERE pl.product_id = p.id AND pl.label_name = v.label_name
);

COMMIT;

-- ===========================================================================
-- Quick verification queries (run manually if you want to spot-check):
--
--   SELECT COUNT(*) FROM products WHERE code LIKE 'MED%';        -- expect 100
--   SELECT COUNT(*) FROM product_units pu
--     JOIN products p ON p.id = pu.product_id
--    WHERE p.code LIKE 'MED%';                                   -- ~150-160
--   SELECT COUNT(*) FROM product_lots l
--     JOIN products p ON p.id = l.product_id
--    WHERE p.code LIKE 'MED%';                                   -- 110
--   SELECT COUNT(*) FROM product_labels pl
--     JOIN products p ON p.id = pl.product_id
--    WHERE p.code LIKE 'MED%';                                   -- 30
--
--   -- Verify expiry-alert visual buckets (Lots tab in EditProduct):
--   SELECT p.code, l.lot_number, l.expiry_date,
--          CAST(julianday(l.expiry_date) - julianday('now') AS INT) AS days_left
--     FROM product_lots l JOIN products p ON p.id = l.product_id
--    WHERE l.lot_number LIKE '%-002' ORDER BY l.expiry_date;
-- ===========================================================================
