# Database

Runtime SQLite schema lives in `electron/db/schema.ts` — **always read it before writing save/update code**. The PHP `syntropic_rx.sql` is the *intent* spec, not what ships; the desktop schema is a strict subset with deliberate divergences.

## Schema divergences from PHP

- **Renamed:** `products.is_vat` → `has_vat`
- **Dropped from `products`:** `dosage_form_id`, `no_discount` (formerly `is_not_discount`)
- **Added `products.is_drug`** (Hygeia-style): explicit "this product is a drug under the law" flag, gates the "ข้อมูลยา" section in EditProduct. `category` is purely for sorting/filtering. Migration backfills `is_drug=1` for products with a `drug_type_id`.
- **Base unit lives directly on `products`:** `products.unit_id` (FK → `item_units`) is the single source of truth for the base unit. `product_units` holds **only non-base variants** (แผง, กล่อง, …). `unit_name` for product list / POS / purchase / reports resolves via `LEFT JOIN item_units u ON u.id = p.unit_id`. There is no `is_base_unit` flag and no synthetic base row in `product_units`.
- **PHP-only, not in SQLite:** `has_wholesale1`, `has_wholesale2`, `drug_generic_name_id`, `old_item_key`
- **Re-added:** `products.default_qty` (REAL DEFAULT 1) — the POS default starting cart quantity, brought back from PHP.

## Allow-list save payloads (HARD)

`products:update` (and similar generic update handlers) builds dynamic SQL from `Object.keys(data)`. Any payload key that isn't a real column throws `no such column: X` and aborts the entire UPDATE. **Allow-list your save payload — never spread `...form` blindly.**

## Lookup tables (seeded on first run)

`drug_types`, `drug_generic_names` (~4253 rows), `drug_groups`, `dosage_forms`, `product_categories`, `label_frequencies`, `label_dosages`, `label_times`, `label_meal_relations`, `label_advices`.
