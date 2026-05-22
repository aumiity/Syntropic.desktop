var __assign = (this && this.__assign) || function () {
    __assign = Object.assign || function(t) {
        for (var s, i = 1, n = arguments.length; i < n; i++) {
            s = arguments[i];
            for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p))
                t[p] = s[p];
        }
        return t;
    };
    return __assign.apply(this, arguments);
};
var __rest = (this && this.__rest) || function (s, e) {
    var t = {};
    for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p) && e.indexOf(p) < 0)
        t[p] = s[p];
    if (s != null && typeof Object.getOwnPropertySymbols === "function")
        for (var i = 0, p = Object.getOwnPropertySymbols(s); i < p.length; i++) {
            if (e.indexOf(p[i]) < 0 && Object.prototype.propertyIsEnumerable.call(s, p[i]))
                t[p[i]] = s[p[i]];
        }
    return t;
};
var __spreadArray = (this && this.__spreadArray) || function (to, from, pack) {
    if (pack || arguments.length === 2) for (var i = 0, l = from.length, ar; i < l; i++) {
        if (ar || !(i in from)) {
            if (!ar) ar = Array.prototype.slice.call(from, 0, i);
            ar[i] = from[i];
        }
    }
    return to.concat(ar || Array.prototype.slice.call(from));
};
import { ipcMain } from 'electron';
import { getDb } from '../db';
import { assertNotBundle, recomputeAvgCost, recomputeBundleCost, propagateCostToBundles } from '../db/pricing';
// Stock expression aware of bundles: regular products sum open lots,
// bundles derive MIN(component_open_stock / qty_per_bundle). Used by
// products:list (sort + filter), stockStats, and anywhere else that
// needs "how many of this can we sell right now".
var STOCK_EXPR = "\n  CASE WHEN p.is_bundle = 1 THEN\n    COALESCE((\n      SELECT MIN(CAST(\n        (SELECT COALESCE(SUM(qty_on_hand),0) FROM product_lots\n         WHERE product_id = bi.component_product_id AND is_closed = 0) / bi.qty_per_bundle\n      AS INTEGER))\n      FROM product_bundle_items bi WHERE bi.bundle_id = p.id\n    ), 0)\n  ELSE\n    COALESCE((SELECT SUM(qty_on_hand) FROM product_lots WHERE product_id = p.id AND is_closed=0), 0)\n  END\n";
export function registerProductHandlers() {
    ipcMain.handle('products:list', function (_e, filters) {
        var _a, _b;
        var db = getDb();
        var q = filters.q, category_id = filters.category_id, drug_type_id = filters.drug_type_id, _c = filters.page, page = _c === void 0 ? 1 : _c, limitOpt = filters.limit, sort_by = filters.sort_by, sort_dir = filters.sort_dir, stock_filter = filters.stock_filter, include_disabled = filters.include_disabled, is_bundle = filters.is_bundle;
        var limit = limitOpt === 'all' ? null : (typeof limitOpt === 'number' && limitOpt > 0 ? limitOpt : 50);
        var offset = limit ? (page - 1) * limit : 0;
        var conditions = [];
        var params = [];
        // Disabled-only mode ('disabled') forces is_disabled=1 and skips other stock
        // filters. Enabled-only mode ('enabled') forces is_disabled=0 regardless of
        // include_disabled. Otherwise hide disabled unless include_disabled is true.
        if (stock_filter === 'disabled') {
            conditions.push("p.is_disabled = 1");
        }
        else if (stock_filter === 'enabled') {
            conditions.push("p.is_disabled = 0");
        }
        else if (!include_disabled) {
            conditions.push("p.is_disabled = 0");
        }
        if (q) {
            conditions.push("(p.trade_name LIKE ? OR p.barcode LIKE ? OR p.code LIKE ? OR p.search_keywords LIKE ?)");
            var lq = "%".concat(q, "%");
            params.push(lq, lq, lq, lq);
        }
        if (category_id) {
            conditions.push("p.category_id = ?");
            params.push(category_id);
        }
        if (drug_type_id) {
            conditions.push("p.drug_type_id = ?");
            params.push(drug_type_id);
        }
        // Bundle filter: ProductsList passes 0, BundlesList passes 1; undefined = no filter.
        if (is_bundle === 0 || is_bundle === 1) {
            conditions.push("p.is_bundle = ?");
            params.push(is_bundle);
        }
        // Stock-state filter: 'low' / 'out' / 'in' narrow the result; 'all' / 'disabled' / missing are a no-op here.
        // Uses STOCK_EXPR so bundles evaluate against their derived capacity ('in' = ประกอบได้).
        if (stock_filter === 'out' || stock_filter === 'low' || stock_filter === 'in') {
            if (stock_filter === 'out') {
                conditions.push("(".concat(STOCK_EXPR, ") <= 0"));
            }
            else if (stock_filter === 'in') {
                conditions.push("(".concat(STOCK_EXPR, ") > 0"));
            }
            else {
                conditions.push("(".concat(STOCK_EXPR, ") > 0 AND p.reorder_point > 0 AND (").concat(STOCK_EXPR, ") <= p.reorder_point"));
            }
        }
        var where = conditions.length ? "WHERE ".concat(conditions.join(' AND ')) : '';
        // Whitelist sort columns — never interpolate user input directly into ORDER BY.
        // Keys are the public field names exposed to the renderer; values are the SQL
        // expression they map to (computed columns like profit are built here).
        var SORT_MAP = {
            trade_name: 'p.trade_name',
            unit_name: 'u.name',
            cost_price: 'p.cost_price',
            price_retail: 'p.price_retail',
            profit: '(p.price_retail - p.cost_price)',
            stock_qty: 'stock_qty',
        };
        var orderCol = (sort_by && SORT_MAP[sort_by]) || 'p.trade_name';
        var orderDir = sort_dir === 'desc' ? 'DESC' : 'ASC';
        // Relevance ranking when searching by name (default sort + a query present).
        // Mirrors pos:searchProducts so the same query returns the same top hit in
        // both places — without this, AMMIDENE (which has "pirox" in search_keywords)
        // outranks PIROXICAM-* (trade_name match) just because A < P alphabetically.
        // Skipped when the caller picked an explicit sort_by other than trade_name —
        // they asked for that order specifically.
        var orderParams = [];
        var orderBy;
        if (orderCol === 'p.trade_name' && q) {
            var prefix = "".concat(q, "%");
            var kwMid = "%,".concat(q, "%");
            var kwMidSp = "%, ".concat(q, "%");
            orderBy = "\n        CASE\n          WHEN p.trade_name LIKE ? THEN 1\n          WHEN p.code LIKE ? THEN 2\n          WHEN p.search_keywords LIKE ? OR p.search_keywords LIKE ? OR p.search_keywords LIKE ? THEN 3\n          ELSE 4\n        END,\n        p.trade_name ".concat(orderDir, "\n      ");
            orderParams.push(prefix, prefix, prefix, kwMid, kwMidSp);
        }
        else if (orderCol === 'p.trade_name') {
            orderBy = "".concat(orderCol, " ").concat(orderDir);
        }
        else {
            // Always tie-break on trade_name so paginated results are stable when the
            // primary sort column has duplicates (e.g. many products with cost_price=0).
            orderBy = "".concat(orderCol, " ").concat(orderDir, ", p.trade_name ASC");
        }
        var total = (_a = db.prepare("SELECT COUNT(*) as c FROM products p ".concat(where))).get.apply(_a, params).c;
        var limitClause = limit ? "LIMIT ? OFFSET ?" : '';
        var limitParams = limit ? [limit, offset] : [];
        var rows = (_b = db.prepare("\n      SELECT p.*, c.name as category_name, dt.name_th as drug_type_name,\n             u.name as unit_name,\n             (".concat(STOCK_EXPR, ") as stock_qty,\n             (SELECT COUNT(*) FROM product_bundle_items WHERE bundle_id = p.id) as component_count\n      FROM products p\n      LEFT JOIN product_categories c ON c.id = p.category_id\n      LEFT JOIN drug_types dt ON dt.id = p.drug_type_id\n      LEFT JOIN item_units u ON u.id = p.unit_id\n      ").concat(where, " ORDER BY ").concat(orderBy, " ").concat(limitClause, "\n    "))).all.apply(_b, __spreadArray(__spreadArray(__spreadArray([], params, false), orderParams, false), limitParams, false));
        return { rows: rows, total: total, page: page, limit: limit !== null && limit !== void 0 ? limit : total };
    });
    ipcMain.handle('products:stockStats', function (_e, filters) {
        var _a, _b, _c, _d;
        var db = getDb();
        var q = filters.q, category_id = filters.category_id, drug_type_id = filters.drug_type_id, include_disabled = filters.include_disabled, is_bundle = filters.is_bundle;
        var conditions = [];
        var params = [];
        if (!include_disabled)
            conditions.push("p.is_disabled = 0");
        if (q) {
            conditions.push("(p.trade_name LIKE ? OR p.barcode LIKE ? OR p.code LIKE ? OR p.search_keywords LIKE ?)");
            var lq = "%".concat(q, "%");
            params.push(lq, lq, lq, lq);
        }
        if (category_id) {
            conditions.push("p.category_id = ?");
            params.push(category_id);
        }
        if (drug_type_id) {
            conditions.push("p.drug_type_id = ?");
            params.push(drug_type_id);
        }
        // Bundle filter — ProductsList passes 0 so the "out" / "low" / total stats
        // don't get inflated by bundles (which have is_stock_item=0 and no lots).
        if (is_bundle === 0 || is_bundle === 1) {
            conditions.push("p.is_bundle = ?");
            params.push(is_bundle);
        }
        var where = conditions.length ? "WHERE ".concat(conditions.join(' AND ')) : '';
        var andStock = function (extra) { return where
            ? "".concat(where, " AND ").concat(extra)
            : "WHERE ".concat(extra); };
        var out = (_a = db.prepare("SELECT COUNT(*) as c FROM products p ".concat(andStock("(".concat(STOCK_EXPR, ") <= 0"))))).get.apply(_a, params).c;
        var low = (_b = db.prepare("SELECT COUNT(*) as c FROM products p ".concat(andStock("(".concat(STOCK_EXPR, ") > 0 AND p.reorder_point > 0 AND (").concat(STOCK_EXPR, ") <= p.reorder_point"))))).get.apply(_b, params).c;
        // Total — used by "สินค้าทั้งหมด" stat card. Always counts every product
        // (enabled + disabled); only "is_bundle" applies so bundles don't inflate
        // the count. Ignores search/category/drug-type and the include_disabled
        // toggle — "ทั้งหมด" must literally mean all.
        var totalCond = [];
        var totalParams = [];
        if (is_bundle === 0 || is_bundle === 1) {
            totalCond.push('is_bundle = ?');
            totalParams.push(is_bundle);
        }
        var totalWhere = totalCond.length ? "WHERE ".concat(totalCond.join(' AND ')) : '';
        var total_all = (_c = db.prepare("SELECT COUNT(*) as c FROM products ".concat(totalWhere))).get.apply(_c, totalParams).c;
        // Disabled — global count of disabled products (force is_disabled=1, respects
        // is_bundle only). Mirrors total_all's "ignore search filters" semantics so
        // the "ปิดการใช้งาน" card always shows the total disabled count.
        var disabledCond = ['is_disabled = 1'];
        var disabledParams = [];
        if (is_bundle === 0 || is_bundle === 1) {
            disabledCond.push('is_bundle = ?');
            disabledParams.push(is_bundle);
        }
        var disabled = (_d = db.prepare("SELECT COUNT(*) as c FROM products WHERE ".concat(disabledCond.join(' AND ')))).get.apply(_d, disabledParams).c;
        return { out: out, low: low, total_all: total_all, disabled: disabled };
    });
    // Reorder worklist: products at/below their reorder point. Flat (no pagination,
    // like reports:expiringLots) — it's an actionable purchasing list, sorted by
    // the biggest gap first. Only products with reorder_point > 0 qualify.
    ipcMain.handle('products:lowStock', function (_e, filters) {
        var _a;
        var db = getDb();
        var q = filters.q, category_id = filters.category_id, include_disabled = filters.include_disabled;
        var conditions = [];
        var params = [];
        if (!include_disabled)
            conditions.push("p.is_disabled = 0");
        if (q) {
            conditions.push("(p.trade_name LIKE ? OR p.barcode LIKE ? OR p.code LIKE ? OR p.search_keywords LIKE ?)");
            var lq = "%".concat(q, "%");
            params.push(lq, lq, lq, lq);
        }
        if (category_id) {
            conditions.push("p.category_id = ?");
            params.push(category_id);
        }
        // Same SUM-of-open-lots expression as products:list / stockStats.
        var stockExpr = "COALESCE((SELECT SUM(qty_on_hand) FROM product_lots WHERE product_id = p.id AND is_closed=0), 0)";
        // Bundles are never "low-stock" in the reorder sense — they have no
        // reorder_point and no own lots. Hardcode the exclusion.
        conditions.push("p.is_bundle = 0");
        conditions.push("p.reorder_point > 0");
        conditions.push("".concat(stockExpr, " <= p.reorder_point"));
        var where = "WHERE ".concat(conditions.join(' AND '));
        var rows = (_a = db.prepare("\n      SELECT p.id as product_id, p.code, p.trade_name,\n             p.reorder_point, p.safety_stock,\n             u.name as unit_name, c.name as category_name,\n             ".concat(stockExpr, " as stock_qty,\n             (p.reorder_point - ").concat(stockExpr, ") as shortfall,\n             (SELECT s.name FROM product_lots pl\n                JOIN suppliers s ON s.id = pl.supplier_id\n                WHERE pl.product_id = p.id AND pl.supplier_id IS NOT NULL\n                ORDER BY pl.created_at DESC LIMIT 1) as last_supplier_name\n      FROM products p\n      LEFT JOIN product_categories c ON c.id = p.category_id\n      LEFT JOIN item_units u ON u.id = p.unit_id\n      ").concat(where, "\n      ORDER BY shortfall DESC, p.trade_name ASC\n    "))).all.apply(_a, params);
        var out_count = rows.filter(function (r) { return r.stock_qty <= 0; }).length;
        var total_shortfall = rows.reduce(function (s, r) { return s + Math.max(0, r.shortfall); }, 0);
        return { rows: rows, count: rows.length, out_count: out_count, total_shortfall: total_shortfall };
    });
    ipcMain.handle('products:get', function (_e, id) {
        var db = getDb();
        var product = db.prepare("\n      SELECT p.*, u.name as unit_name\n      FROM products p\n      LEFT JOIN item_units u ON u.id = p.unit_id\n      WHERE p.id = ?\n    ").get(id);
        if (!product)
            return null;
        var units = db.prepare("\n      SELECT pu.*, u.name as unit_name FROM product_units pu\n      JOIN item_units u ON u.id = pu.unit_id\n      WHERE pu.product_id = ? ORDER BY pu.qty_per_base ASC\n    ").all(id);
        var lots = db.prepare("SELECT * FROM product_lots WHERE product_id = ? ORDER BY created_at DESC").all(id);
        var labels = db.prepare("\n      SELECT pl.*, lf.name_th as frequency_name, ld.name_th as dosage_name, lm.name_th as timing_name\n      FROM product_labels pl\n      LEFT JOIN label_frequencies lf ON lf.id = pl.frequency_id\n      LEFT JOIN label_dosages ld ON ld.id = pl.dosage_id\n      LEFT JOIN label_meal_relations lm ON lm.id = pl.timing_id\n      WHERE pl.product_id = ? ORDER BY pl.sort_order, pl.id\n    ").all(id);
        // Bundles carry their composition. Joined display fields (component_name etc.)
        // make EditBundle's ComponentsTab render without a second IPC round-trip.
        var bundle_items = product.is_bundle === 1
            ? db.prepare("\n          SELECT bi.*,\n                 c.trade_name as component_name,\n                 u.name as component_unit_name,\n                 c.cost_price as component_cost,\n                 c.price_retail as component_sell_price,\n                 COALESCE((SELECT SUM(qty_on_hand) FROM product_lots\n                           WHERE product_id = c.id AND is_closed = 0), 0) as component_stock\n          FROM product_bundle_items bi\n          JOIN products c ON c.id = bi.component_product_id\n          LEFT JOIN item_units u ON u.id = c.unit_id\n          WHERE bi.bundle_id = ?\n          ORDER BY bi.sort_order, bi.id\n        ").all(id)
            : [];
        return __assign(__assign({}, product), { units: units, lots: lots, labels: labels, bundle_items: bundle_items });
    });
    ipcMain.handle('products:create', function (_e, data) {
        var _a, _b, _c, _d, _f, _g, _h;
        var db = getDb();
        // Auto-generate product code (P0001, P0002, …). Scan only auto-generated codes
        // so legacy custom codes (e.g. MED001) don't poison the sequence.
        var last = db.prepare("SELECT code FROM products WHERE code GLOB 'P[0-9][0-9][0-9][0-9]*' ORDER BY code DESC LIMIT 1").get();
        var nextNum = 1;
        if (last === null || last === void 0 ? void 0 : last.code)
            nextNum = parseInt(last.code.slice(1)) + 1;
        var code = "P".concat(String(nextNum).padStart(4, '0'));
        // Fallback unit if caller didn't pick one (shouldn't happen via the UI, but defends against legacy callers).
        var fallbackUnitId = (_b = (_a = db.prepare("SELECT id FROM item_units WHERE name = '\u0E0A\u0E34\u0E49\u0E19'").get()) === null || _a === void 0 ? void 0 : _a.id) !== null && _b !== void 0 ? _b : db.prepare("INSERT INTO item_units (name) VALUES ('\u0E0A\u0E34\u0E49\u0E19')").run().lastInsertRowid;
        var insProduct = db.prepare("\n      INSERT INTO products (barcode, barcode2, barcode3, barcode4, code, trade_name, name_for_print,\n        category_id, is_stock_item, is_bundle,\n        price_retail, price_wholesale1, price_wholesale2, cost_price, last_cost_price,\n        unit_id,\n        has_vat, reorder_point, safety_stock,\n        drug_type_id, tmt_id,\n        is_drug, is_antibiotic,\n        indication_note, side_effect_note,\n        is_fda9, is_fda10, is_fda11, is_fda13,\n        search_keywords, note)\n      VALUES (@barcode, @barcode2, @barcode3, @barcode4, @code, @trade_name, @name_for_print,\n        @category_id, @is_stock_item, @is_bundle,\n        @price_retail, @price_wholesale1, @price_wholesale2, @cost_price, @last_cost_price,\n        @unit_id,\n        @has_vat, @reorder_point, @safety_stock,\n        @drug_type_id, @tmt_id,\n        @is_drug, @is_antibiotic,\n        @indication_note, @side_effect_note,\n        @is_fda9, @is_fda10, @is_fda11, @is_fda13,\n        @search_keywords, @note)\n    ");
        // New product has no lots yet: seed both costs from the entered value.
        // cost_price (weighted avg) will be recomputed once lots exist;
        // last_cost_price is the pricing reference until the first paid receive.
        //
        // Build a complete params object with explicit defaults for every named
        // parameter in the INSERT — better-sqlite3 throws RangeError on any
        // missing @-binding, and not every caller (e.g., BundlesList quick-create)
        // fills the full product surface. Spread `data` on top so caller-provided
        // values win. Bundle invariant is enforced last: is_bundle=1 ⇒ is_stock_item=0.
        var isBundle = data.is_bundle === 1 ? 1 : 0;
        var defaults = {
            barcode: null, barcode2: null, barcode3: null, barcode4: null,
            name_for_print: null,
            category_id: null,
            is_stock_item: 1,
            price_retail: 0, price_wholesale1: 0, price_wholesale2: 0,
            cost_price: 0, last_cost_price: 0,
            has_vat: 0,
            reorder_point: null, safety_stock: null,
            drug_type_id: null, tmt_id: null,
            is_drug: 0, is_antibiotic: 0,
            indication_note: null, side_effect_note: null,
            is_fda9: 0, is_fda10: 0, is_fda11: 0, is_fda13: 0,
            search_keywords: null, note: null,
        };
        var params = __assign(__assign(__assign({}, defaults), data), { code: code, unit_id: (_c = data.unit_id) !== null && _c !== void 0 ? _c : fallbackUnitId, is_bundle: isBundle, is_stock_item: isBundle ? 0 : ((_d = data.is_stock_item) !== null && _d !== void 0 ? _d : 1), cost_price: (_f = data.cost_price) !== null && _f !== void 0 ? _f : 0, last_cost_price: (_h = (_g = data.last_cost_price) !== null && _g !== void 0 ? _g : data.cost_price) !== null && _h !== void 0 ? _h : 0 });
        var r = insProduct.run(params);
        return db.prepare("SELECT * FROM products WHERE id = ?").get(r.lastInsertRowid);
    });
    // Atomic bundle creation. Unlike products:create + saveBundleItems (which
    // could leave an empty bundle row stranded if the user abandons mid-flow),
    // this commits the product row AND its >=2 components in a single
    // transaction — or rolls back entirely. Enforces the same "at least 2
    // components" invariant as saveBundleItems.
    ipcMain.handle('products:createBundle', function (_e, payload) {
        var _a;
        var db = getDb();
        var data = payload.product, items = payload.items;
        if (!((_a = data === null || data === void 0 ? void 0 : data.trade_name) === null || _a === void 0 ? void 0 : _a.trim()))
            throw new Error('กรุณาระบุชื่อชุดสินค้า');
        if (!items || items.length < 2)
            throw new Error('ชุดสินค้าต้องมีรายการอย่างน้อย 2 รายการ');
        return db.transaction(function () {
            var _a, _b, _c;
            // Validate components up-front so we don't INSERT a doomed product row.
            for (var _i = 0, items_1 = items; _i < items_1.length; _i++) {
                var it = items_1[_i];
                if (!it.component_product_id)
                    throw new Error('ส่วนประกอบไม่ถูกต้อง');
                if (!it.qty_per_bundle || Number(it.qty_per_bundle) <= 0)
                    throw new Error('จำนวนต่อชุดต้องมากกว่า 0');
                var c = db.prepare("SELECT id, trade_name, is_bundle, is_disabled FROM products WHERE id = ?").get(it.component_product_id);
                if (!c)
                    throw new Error('ไม่พบส่วนประกอบ');
                if (c.is_bundle === 1)
                    throw new Error("\"".concat(c.trade_name, "\" \u0E40\u0E1B\u0E47\u0E19\u0E0A\u0E38\u0E14\u0E2A\u0E34\u0E19\u0E04\u0E49\u0E32 \u2014 \u0E2B\u0E49\u0E32\u0E21\u0E0B\u0E49\u0E2D\u0E19"));
                if (c.is_disabled === 1)
                    throw new Error("\"".concat(c.trade_name, "\" \u0E16\u0E39\u0E01\u0E1E\u0E31\u0E01\u0E43\u0E0A\u0E49\u0E07\u0E32\u0E19"));
            }
            // Reuse products:create's code/sequence/defaults logic by calling the
            // same scaffolding inline (we can't recurse into the IPC handler).
            var last = db.prepare("SELECT code FROM products WHERE code GLOB 'P[0-9][0-9][0-9][0-9]*' ORDER BY code DESC LIMIT 1").get();
            var nextNum = 1;
            if (last === null || last === void 0 ? void 0 : last.code)
                nextNum = parseInt(last.code.slice(1)) + 1;
            var code = "P".concat(String(nextNum).padStart(4, '0'));
            var fallbackUnitId = (_b = (_a = db.prepare("SELECT id FROM item_units WHERE name = '\u0E0A\u0E34\u0E49\u0E19'").get()) === null || _a === void 0 ? void 0 : _a.id) !== null && _b !== void 0 ? _b : db.prepare("INSERT INTO item_units (name) VALUES ('\u0E0A\u0E34\u0E49\u0E19')").run().lastInsertRowid;
            var defaults = {
                barcode: null, barcode2: null, barcode3: null, barcode4: null,
                name_for_print: null,
                category_id: null,
                price_retail: 0, price_wholesale1: 0, price_wholesale2: 0,
                cost_price: 0, last_cost_price: 0,
                has_vat: 0,
                reorder_point: null, safety_stock: null,
                drug_type_id: null, tmt_id: null,
                is_drug: 0, is_antibiotic: 0,
                indication_note: null, side_effect_note: null,
                is_fda9: 0, is_fda10: 0, is_fda11: 0, is_fda13: 0,
                search_keywords: null, note: null,
            };
            var params = __assign(__assign(__assign({}, defaults), data), { code: code, unit_id: (_c = data.unit_id) !== null && _c !== void 0 ? _c : fallbackUnitId, is_bundle: 1, is_stock_item: 0 });
            var r = db.prepare("\n        INSERT INTO products (barcode, barcode2, barcode3, barcode4, code, trade_name, name_for_print,\n          category_id, is_stock_item, is_bundle,\n          price_retail, price_wholesale1, price_wholesale2, cost_price, last_cost_price,\n          unit_id,\n          has_vat, reorder_point, safety_stock,\n          drug_type_id, tmt_id,\n          is_drug, is_antibiotic,\n          indication_note, side_effect_note,\n          is_fda9, is_fda10, is_fda11, is_fda13,\n          search_keywords, note)\n        VALUES (@barcode, @barcode2, @barcode3, @barcode4, @code, @trade_name, @name_for_print,\n          @category_id, @is_stock_item, @is_bundle,\n          @price_retail, @price_wholesale1, @price_wholesale2, @cost_price, @last_cost_price,\n          @unit_id,\n          @has_vat, @reorder_point, @safety_stock,\n          @drug_type_id, @tmt_id,\n          @is_drug, @is_antibiotic,\n          @indication_note, @side_effect_note,\n          @is_fda9, @is_fda10, @is_fda11, @is_fda13,\n          @search_keywords, @note)\n      ").run(params);
            var bundleId = r.lastInsertRowid;
            var ins = db.prepare("\n        INSERT INTO product_bundle_items (bundle_id, component_product_id, qty_per_bundle, sort_order)\n        VALUES (?, ?, ?, ?)\n      ");
            items.forEach(function (it, i) { return ins.run(bundleId, it.component_product_id, Number(it.qty_per_bundle), i + 1); });
            recomputeBundleCost(db, bundleId);
            return db.prepare("SELECT * FROM products WHERE id = ?").get(bundleId);
        })();
    });
    ipcMain.handle('products:update', function (_e, id, data) {
        var db = getDb();
        var fields = Object.keys(data).map(function (k) { return "".concat(k, " = @").concat(k); }).join(', ');
        db.prepare("UPDATE products SET ".concat(fields, ", updated_at = datetime('now','localtime') WHERE id = @id")).run(__assign(__assign({}, data), { id: id }));
        return db.prepare("SELECT * FROM products WHERE id = ?").get(id);
    });
    ipcMain.handle('products:updatePrice', function (_e, productId, data) {
        var _a;
        var db = getDb();
        var type = (_a = data.price_type) !== null && _a !== void 0 ? _a : 'retail';
        var col = type === 'retail' ? 'price_retail' : type === 'wholesale1' ? 'price_wholesale1' : 'price_wholesale2';
        return db.transaction(function () {
            var _a;
            var product = db.prepare("SELECT id, ".concat(col, " as current FROM products WHERE id = ?")).get(productId);
            if (!product)
                throw new Error('ไม่พบสินค้า');
            var oldPrice = Number(product.current) || 0;
            var newPrice = Number(data.new_price) || 0;
            if (oldPrice === newPrice)
                return { product_id: productId, price_type: type, old_price: oldPrice, new_price: newPrice, changed: false };
            db.prepare("UPDATE products SET ".concat(col, " = ?, updated_at = datetime('now','localtime') WHERE id = ?")).run(newPrice, productId);
            db.prepare("INSERT INTO price_logs (product_id, price_type, old_price, new_price, note) VALUES (?, ?, ?, ?, ?)")
                .run(productId, type, oldPrice, newPrice, (_a = data.note) !== null && _a !== void 0 ? _a : null);
            return { product_id: productId, price_type: type, old_price: oldPrice, new_price: newPrice, changed: true };
        })();
    });
    ipcMain.handle('products:priceHistory', function (_e, productId, limit) {
        if (limit === void 0) { limit = 10; }
        return getDb().prepare("\n      SELECT id, price_type, old_price, new_price, note, created_at\n      FROM price_logs\n      WHERE product_id = ?\n      ORDER BY created_at DESC, id DESC\n      LIMIT ?\n    ").all(productId, limit);
    });
    // Stock movement audit log for a single product. Returns rows from
    // stock_movements joined with lot + user info for display. Ordered newest
    // first. movement_type values: receive, sale, sale_return, adjust_in,
    // adjust_out, purchase_return, expired, near_expiry. Note often contains a referencing
    // invoice/GR number (frontend extracts for navigation).
    ipcMain.handle('products:stockMovements', function (_e, productId, opts) {
        var _a, _b;
        var _c, _d;
        var db = getDb();
        var limit = (_c = opts === null || opts === void 0 ? void 0 : opts.limit) !== null && _c !== void 0 ? _c : 200;
        // Bundles (is_bundle=1) have no rows in stock_movements because they don't
        // hold stock (only components do). We simulate movements by querying
        // sale_items joined with sales to show the bill history.
        var prod = db.prepare('SELECT is_bundle FROM products WHERE id = ?').get(productId);
        if ((prod === null || prod === void 0 ? void 0 : prod.is_bundle) === 1) {
            var siConds = ['si.product_id = ?'];
            var siParams = [productId];
            if (opts === null || opts === void 0 ? void 0 : opts.date_from) {
                siConds.push('date(s.sold_at) >= ?');
                siParams.push(opts.date_from);
            }
            if (opts === null || opts === void 0 ? void 0 : opts.date_to) {
                siConds.push('date(s.sold_at) <= ?');
                siParams.push(opts.date_to);
            }
            var typesFilter = (opts === null || opts === void 0 ? void 0 : opts.movement_types) && opts.movement_types.length > 0
                ? "WHERE movement_type IN (".concat(opts.movement_types.map(function () { return '?'; }).join(','), ")")
                : '';
            var typeParams = (_d = opts === null || opts === void 0 ? void 0 : opts.movement_types) !== null && _d !== void 0 ? _d : [];
            // Simulating movements:
            // 1. Every sale_item row is a 'sale' (or 'sale_return' if RT- bill).
            // 2. If the sale is voided, we add a balancing 'sale_return' row.
            return (_a = db.prepare("\n        SELECT * FROM (\n          SELECT si.id,\n                 CASE WHEN s.sale_type = 'return' THEN 'sale_return' ELSE 'sale' END as movement_type,\n                 'sale' as ref_type, s.id as ref_id,\n                 -si.qty as qty_change, 0 as qty_before, 0 as qty_after, si.unit_price as unit_cost,\n                 COALESCE(NULLIF(si.item_note, ''), '\u0E02\u0E32\u0E22: ' || s.invoice_no) as note, s.sold_at as created_at,\n                 NULL as lot_id, NULL as lot_number, NULL as expiry_date,\n                 NULL AS gr_invoice_no,\n                 s.invoice_no AS sale_invoice_no,\n                 s.sold_by as created_by, u.name AS created_by_name\n          FROM sale_items si\n          JOIN sales s ON s.id = si.sale_id\n          LEFT JOIN users u ON u.id = s.sold_by\n          WHERE ".concat(siConds.join(' AND '), "\n\n          UNION ALL\n\n          SELECT si.id, 'sale_return' as movement_type, 'sale' as ref_type, s.id as ref_id,\n                 si.qty as qty_change, 0 as qty_before, 0 as qty_after, si.unit_price as unit_cost,\n                 '\u0E22\u0E01\u0E40\u0E25\u0E34\u0E01: ' || COALESCE(s.void_reason, '') as note, s.updated_at as created_at,\n                 NULL as lot_id, NULL as lot_number, NULL as expiry_date,\n                 NULL AS gr_invoice_no,\n                 s.invoice_no AS sale_invoice_no,\n                 s.sold_by as created_by, u.name AS created_by_name\n          FROM sale_items si\n          JOIN sales s ON s.id = si.sale_id\n          LEFT JOIN users u ON u.id = s.sold_by\n          WHERE ").concat(siConds.join(' AND '), " AND s.status = 'voided'\n        )\n        ").concat(typesFilter, "\n        ORDER BY created_at DESC, id DESC\n        LIMIT ?\n      "))).all.apply(_a, __spreadArray(__spreadArray(__spreadArray(__spreadArray([], siParams, false), siParams, false), typeParams, false), [limit], false));
        }
        var conditions = ['sm.product_id = ?'];
        var params = [productId];
        if ((opts === null || opts === void 0 ? void 0 : opts.movement_types) && opts.movement_types.length > 0) {
            conditions.push("sm.movement_type IN (".concat(opts.movement_types.map(function () { return '?'; }).join(','), ")"));
            params.push.apply(params, opts.movement_types);
        }
        if (opts === null || opts === void 0 ? void 0 : opts.date_from) {
            conditions.push('date(sm.created_at) >= ?');
            params.push(opts.date_from);
        }
        if (opts === null || opts === void 0 ? void 0 : opts.date_to) {
            conditions.push('date(sm.created_at) <= ?');
            params.push(opts.date_to);
        }
        // pl.invoice_no = the GR (purchase_receipt) the lot belongs to → used for
        // navigating receive/purchase_return movements to the purchase detail page.
        // s.invoice_no = the sale the movement references → only meaningful when
        // ref_type='sale' (covers both 'sale' and 'sale_return' movement_types).
        return (_b = db.prepare("\n      SELECT sm.id, sm.movement_type, sm.ref_type, sm.ref_id,\n             sm.qty_change, sm.qty_before, sm.qty_after, sm.unit_cost,\n             sm.note, sm.created_at,\n             sm.lot_id, pl.lot_number, pl.expiry_date,\n             pl.invoice_no AS gr_invoice_no,\n             s.invoice_no AS sale_invoice_no,\n             sm.created_by, u.name AS created_by_name\n      FROM stock_movements sm\n      LEFT JOIN product_lots pl ON pl.id = sm.lot_id\n      LEFT JOIN sales s ON sm.ref_type = 'sale' AND s.id = sm.ref_id\n      LEFT JOIN users u ON u.id = sm.created_by\n      WHERE ".concat(conditions.join(' AND '), "\n      ORDER BY sm.created_at DESC, sm.id DESC\n      LIMIT ?\n    "))).all.apply(_b, __spreadArray(__spreadArray([], params, false), [limit], false));
    });
    // Stock adjustment from Products list. Three modes — operator picks one
    // based on the situation:
    //
    //   decrease            → auto-FEFO. Deduct from real lots ordered by
    //                         expiry_date ASC. Preserves cost provenance.
    //                         Used when stock count finds shortage.
    //
    //   increase_new_lot    → create a brand-new product_lot. Operator supplies
    //                         lot_number (auto-generated if blank), optional
    //                         expiry, cost (default 0 for freebies). The right
    //                         pick when extra stock came from somewhere with
    //                         different expiry/source than existing lots.
    //
    //   increase_existing_lot → add qty into an existing lot. Operator picks the
    //                           target lot and supplies the cost of the *added*
    //                           units (often 0). The lot's qty_received grows
    //                           and cost_price is recomputed as a weighted avg
    //                           within the lot — same total contribution to
    //                           products.cost_price as creating a new lot. Use
    //                           when supplier bundles freebies with an existing
    //                           receive (same batch/expiry).
    ipcMain.handle('products:adjustStock', function (_e, productId, data) {
        if (!data.userId)
            throw new Error('ไม่พบผู้ใช้งาน');
        if (!data.note || !data.note.trim())
            throw new Error('กรุณาระบุหมายเหตุ');
        if (!data.qty || data.qty <= 0)
            throw new Error('จำนวนต้องมากกว่า 0');
        var db = getDb();
        assertNotBundle(db, productId);
        // Helper that mirrors recomputeAvgCost + propagateCostToBundles so callers
        // below can stay terse. The shared helpers from electron/db/pricing.ts run
        // inside the same transaction (db param threaded through).
        var recompute = function (pid) {
            recomputeAvgCost(db, pid);
            propagateCostToBundles(db, pid);
        };
        return db.transaction(function () {
            var _a, _b;
            var _c, _d, _f;
            if (data.mode === 'decrease') {
                var lots = db.prepare("\n          SELECT * FROM product_lots\n          WHERE product_id = ? AND qty_on_hand > 0 AND is_closed = 0 AND is_cancelled = 0\n          ORDER BY CASE WHEN expiry_date IS NULL THEN '9999-99-99' ELSE expiry_date END ASC, id ASC\n        ").all(productId);
                var totalAvail = lots.reduce(function (s, l) { return s + Number(l.qty_on_hand); }, 0);
                if (data.qty > totalAvail) {
                    throw new Error("\u0E08\u0E33\u0E19\u0E27\u0E19\u0E17\u0E35\u0E48\u0E15\u0E49\u0E2D\u0E07\u0E01\u0E32\u0E23\u0E25\u0E14 (".concat(data.qty, ") \u0E21\u0E32\u0E01\u0E01\u0E27\u0E48\u0E32\u0E2A\u0E15\u0E47\u0E2D\u0E01\u0E17\u0E35\u0E48\u0E21\u0E35 (").concat(totalAvail, ")"));
                }
                var remaining = data.qty;
                var affected = [];
                for (var _i = 0, lots_1 = lots; _i < lots_1.length; _i++) {
                    var lot = lots_1[_i];
                    if (remaining <= 0)
                        break;
                    var deduct = Math.min(remaining, Number(lot.qty_on_hand));
                    var qtyBefore = Number(lot.qty_on_hand);
                    var qtyAfter = qtyBefore - deduct;
                    var setParts = ['qty_on_hand = qty_on_hand - ?'];
                    var setVals = [deduct];
                    if (qtyAfter <= 0) {
                        setParts.push("is_closed = 1", "closed_at = datetime('now','localtime')");
                    }
                    setParts.push("updated_at = datetime('now','localtime')");
                    (_a = db.prepare("UPDATE product_lots SET ".concat(setParts.join(', '), " WHERE id = ?"))).run.apply(_a, __spreadArray(__spreadArray([], setVals, false), [lot.id], false));
                    db.prepare("\n            INSERT INTO stock_movements (product_id, lot_id, movement_type, ref_type, qty_change, qty_before, qty_after, unit_cost, note, created_by)\n            VALUES (?, ?, 'adjust_out', 'adjust', ?, ?, ?, ?, ?, ?)\n          ").run(productId, lot.id, -deduct, qtyBefore, qtyAfter, lot.cost_price, data.note, data.userId);
                    affected.push({
                        lot_id: lot.id,
                        lot_number: lot.lot_number,
                        qty_deducted: deduct,
                        qty_before: qtyBefore,
                        qty_after: qtyAfter,
                    });
                    remaining -= deduct;
                }
                recompute(productId);
                return { success: true, mode: 'decrease', affected_lots: affected };
            }
            if (data.mode === 'increase_new_lot') {
                var cost = Number((_c = data.cost_price) !== null && _c !== void 0 ? _c : 0);
                if (cost < 0)
                    throw new Error('ต้นทุนต้องไม่ติดลบ');
                var lotNumber = ((_d = data.lot_number) !== null && _d !== void 0 ? _d : '').trim();
                if (!lotNumber) {
                    // Auto-generate ADJ-YYYYMMDD-NNN — unique per product per day
                    var today = db.prepare("SELECT date('now','localtime') AS d").get().d;
                    var prefix = "ADJ-".concat(today.replace(/-/g, ''), "-");
                    var last = db.prepare("\n            SELECT lot_number FROM product_lots\n            WHERE product_id = ? AND lot_number LIKE ?\n            ORDER BY lot_number DESC LIMIT 1\n          ").get(productId, "".concat(prefix, "%"));
                    var nextSeq = last
                        ? String(Number(String(last.lot_number).slice(prefix.length)) + 1).padStart(3, '0')
                        : '001';
                    lotNumber = "".concat(prefix).concat(nextSeq);
                }
                else {
                    var dup = db.prepare("\n            SELECT id FROM product_lots WHERE product_id = ? AND lot_number = ? LIMIT 1\n          ").get(productId, lotNumber);
                    if (dup)
                        throw new Error("\u0E21\u0E35\u0E25\u0E47\u0E2D\u0E15\u0E2B\u0E21\u0E32\u0E22\u0E40\u0E25\u0E02 \"".concat(lotNumber, "\" \u0E2D\u0E22\u0E39\u0E48\u0E41\u0E25\u0E49\u0E27\u0E43\u0E19\u0E2A\u0E34\u0E19\u0E04\u0E49\u0E32\u0E19\u0E35\u0E49"));
                }
                var insertResult = db.prepare("\n          INSERT INTO product_lots (product_id, lot_number, expiry_date, manufactured_date, qty_received, qty_on_hand, cost_price, note)\n          VALUES (?, ?, ?, ?, ?, ?, ?, ?)\n        ").run(productId, lotNumber, data.expiry_date || null, data.manufactured_date || null, data.qty, data.qty, cost, data.note);
                var newLotId = Number(insertResult.lastInsertRowid);
                db.prepare("\n          INSERT INTO stock_movements (product_id, lot_id, movement_type, ref_type, qty_change, qty_before, qty_after, unit_cost, note, created_by)\n          VALUES (?, ?, 'adjust_in', 'adjust', ?, 0, ?, ?, ?, ?)\n        ").run(productId, newLotId, data.qty, data.qty, cost, data.note, data.userId);
                recompute(productId);
                return { success: true, mode: 'increase_new_lot', lot_id: newLotId, lot_number: lotNumber, cost_price: cost };
            }
            if (data.mode === 'increase_existing_lot') {
                if (!data.target_lot_id)
                    throw new Error('กรุณาเลือกล็อตปลายทาง');
                var addedCost = Number((_f = data.added_cost_price) !== null && _f !== void 0 ? _f : 0);
                if (addedCost < 0)
                    throw new Error('ต้นทุนต้องไม่ติดลบ');
                var lot = db.prepare("SELECT * FROM product_lots WHERE id = ? AND product_id = ?")
                    .get(data.target_lot_id, productId);
                if (!lot)
                    throw new Error('ไม่พบล็อตปลายทาง');
                if (lot.is_cancelled)
                    throw new Error('ล็อตนี้ถูกยกเลิกแล้ว');
                var qtyBefore = Number(lot.qty_on_hand);
                var qtyAfter = qtyBefore + data.qty;
                var oldQtyReceived = Number(lot.qty_received);
                var newQtyReceived = oldQtyReceived + data.qty;
                var oldCost = Number(lot.cost_price);
                // Weighted avg within the lot: ((old_qty × old_cost) + (added_qty × added_cost)) / new_qty
                // This keeps the lot's total cost contribution (qty_received × cost_price) consistent
                // with summing the two events separately — products.cost_price ends up identical
                // whether the operator picked new-lot or existing-lot mode.
                var newLotCost = newQtyReceived > 0
                    ? (oldQtyReceived * oldCost + data.qty * addedCost) / newQtyReceived
                    : addedCost;
                var setParts = [
                    'qty_received = ?',
                    'qty_on_hand = qty_on_hand + ?',
                    'cost_price = ?',
                    "updated_at = datetime('now','localtime')",
                ];
                var setVals = [newQtyReceived, data.qty, newLotCost];
                if (lot.is_closed) {
                    setParts.push('is_closed = 0', 'closed_at = NULL');
                }
                (_b = db.prepare("UPDATE product_lots SET ".concat(setParts.join(', '), " WHERE id = ?")))
                    .run.apply(_b, __spreadArray(__spreadArray([], setVals, false), [data.target_lot_id], false));
                db.prepare("\n          INSERT INTO stock_movements (product_id, lot_id, movement_type, ref_type, qty_change, qty_before, qty_after, unit_cost, note, created_by)\n          VALUES (?, ?, 'adjust_in', 'adjust', ?, ?, ?, ?, ?, ?)\n        ").run(productId, data.target_lot_id, data.qty, qtyBefore, qtyAfter, addedCost, data.note, data.userId);
                if (Math.abs(newLotCost - oldCost) > 0.0001) {
                    db.prepare("\n            INSERT INTO lot_cost_logs (lot_id, product_id, old_cost, new_cost, note, created_by)\n            VALUES (?, ?, ?, ?, ?, ?)\n          ").run(data.target_lot_id, productId, oldCost, newLotCost, "\u0E40\u0E1E\u0E34\u0E48\u0E21\u0E2A\u0E15\u0E47\u0E2D\u0E01\u0E40\u0E02\u0E49\u0E32\u0E25\u0E47\u0E2D\u0E15\u0E40\u0E14\u0E34\u0E21: ".concat(data.note), data.userId);
                }
                recompute(productId);
                return {
                    success: true,
                    mode: 'increase_existing_lot',
                    lot_id: data.target_lot_id,
                    lot_number: lot.lot_number,
                    new_lot_cost: newLotCost,
                };
            }
            throw new Error('โหมดปรับสต็อกไม่ถูกต้อง');
        })();
    });
    // Product units — non-base variants only (แผง, กล่อง, …).
    // The base unit lives on products.unit_id (single source of truth).
    ipcMain.handle('products:addUnit', function (_e, data) {
        var db = getDb();
        var result = db.prepare("\n      INSERT INTO product_units (product_id, unit_id, barcode, qty_per_base, price_retail, price_wholesale1, price_wholesale2, is_for_sale, is_for_purchase, is_disabled)\n      VALUES (@product_id, @unit_id, @barcode, @qty_per_base, @price_retail, @price_wholesale1, @price_wholesale2, @is_for_sale, @is_for_purchase, @is_disabled)\n    ").run(data);
        return db.prepare("SELECT pu.*, u.name as unit_name FROM product_units pu JOIN item_units u ON u.id = pu.unit_id WHERE pu.id = ?").get(result.lastInsertRowid);
    });
    ipcMain.handle('products:updateUnit', function (_e, id, data) {
        var db = getDb();
        if (Object.keys(data).length === 0)
            return true;
        var fields = Object.keys(data).map(function (k) { return "".concat(k, " = @").concat(k); }).join(', ');
        db.prepare("UPDATE product_units SET ".concat(fields, ", updated_at = datetime('now','localtime') WHERE id = @id")).run(__assign(__assign({}, data), { id: id }));
        return true;
    });
    ipcMain.handle('products:deleteUnit', function (_e, id) {
        getDb().prepare("DELETE FROM product_units WHERE id = ?").run(id);
        return true;
    });
    // Product labels
    ipcMain.handle('products:getLabels', function (_e, productId) {
        return getDb().prepare("\n      SELECT pl.*, lf.name_th as frequency_name, ld.name_th as dosage_name, lm.name_th as timing_name\n      FROM product_labels pl\n      LEFT JOIN label_frequencies lf ON lf.id = pl.frequency_id\n      LEFT JOIN label_dosages ld ON ld.id = pl.dosage_id\n      LEFT JOIN label_meal_relations lm ON lm.id = pl.timing_id\n      WHERE pl.product_id = ? ORDER BY pl.sort_order, pl.id\n    ").all(productId);
    });
    ipcMain.handle('products:saveLabel', function (_e, data) {
        var db = getDb();
        if (data.id) {
            var id = data.id, rest = __rest(data, ["id"]);
            var fields = Object.keys(rest).map(function (k) { return "".concat(k, " = @").concat(k); }).join(', ');
            db.prepare("UPDATE product_labels SET ".concat(fields, ", updated_at = datetime('now','localtime') WHERE id = @id")).run(data);
            return db.prepare("SELECT * FROM product_labels WHERE id = ?").get(id);
        }
        var result = db.prepare("\n      INSERT INTO product_labels (product_id, label_name, dose_qty, dosage_id, frequency_id, timing_id,\n        indication_th, indication_mm, indication_zh, note_th, note_mm, note_zh, sort_order)\n      VALUES (@product_id, @label_name, @dose_qty, @dosage_id, @frequency_id, @timing_id,\n        @indication_th, @indication_mm, @indication_zh, @note_th, @note_mm, @note_zh, @sort_order)\n    ").run(data);
        return db.prepare("SELECT * FROM product_labels WHERE id = ?").get(result.lastInsertRowid);
    });
    ipcMain.handle('products:deleteLabel', function (_e, id) {
        getDb().prepare("DELETE FROM product_labels WHERE id = ?").run(id);
        return true;
    });
    // Search generic names
    ipcMain.handle('products:searchGenericNames', function (_e, q) {
        return getDb().prepare("SELECT * FROM drug_generic_names WHERE name LIKE ? AND is_disabled=0 LIMIT 10").all("%".concat(q, "%"));
    });
    // Lots for a product. Bundles have no lots — return empty rather than throw
    // (less surprising for callers that defensively call this on any product id).
    ipcMain.handle('products:getLots', function (_e, productId) {
        var db = getDb();
        var row = db.prepare("SELECT is_bundle FROM products WHERE id = ?").get(productId);
        if ((row === null || row === void 0 ? void 0 : row.is_bundle) === 1)
            return [];
        return db.prepare("\n      SELECT pl.*, s.name as supplier_name FROM product_lots pl\n      LEFT JOIN suppliers s ON s.id = pl.supplier_id\n      WHERE pl.product_id = ? ORDER BY pl.created_at DESC\n    ").all(productId);
    });
    // Bundle items — composition of a is_bundle=1 product.
    ipcMain.handle('products:getBundleItems', function (_e, bundleId) {
        return getDb().prepare("\n      SELECT bi.*,\n             c.trade_name as component_name,\n             u.name as component_unit_name,\n             c.cost_price as component_cost,\n             c.price_retail as component_sell_price,\n             COALESCE((SELECT SUM(qty_on_hand) FROM product_lots\n                       WHERE product_id = c.id AND is_closed = 0), 0) as component_stock\n      FROM product_bundle_items bi\n      JOIN products c ON c.id = bi.component_product_id\n      LEFT JOIN item_units u ON u.id = c.unit_id\n      WHERE bi.bundle_id = ?\n      ORDER BY bi.sort_order, bi.id\n    ").all(bundleId);
    });
    // Replace the entire composition of a bundle in one transaction. Validates
    // that the target is actually a bundle, each component exists and is itself
    // a non-bundle non-disabled product, and qty_per_bundle > 0. Recomputes
    // bundle cost at the end.
    ipcMain.handle('products:saveBundleItems', function (_e, bundleId, items) {
        var db = getDb();
        return db.transaction(function () {
            var bundle = db.prepare("SELECT id, is_bundle FROM products WHERE id = ?").get(bundleId);
            if (!bundle)
                throw new Error('ไม่พบชุดสินค้า');
            if (bundle.is_bundle !== 1)
                throw new Error('สินค้านี้ไม่ใช่ชุดสินค้า');
            if (items.length < 2)
                throw new Error('ชุดสินค้าต้องมีรายการอย่างน้อย 2 รายการ');
            for (var _i = 0, items_2 = items; _i < items_2.length; _i++) {
                var it = items_2[_i];
                if (!it.component_product_id)
                    throw new Error('ส่วนประกอบไม่ถูกต้อง');
                if (it.component_product_id === bundleId)
                    throw new Error('ชุดสินค้ามีตัวเองเป็นส่วนประกอบไม่ได้');
                if (!it.qty_per_bundle || Number(it.qty_per_bundle) <= 0)
                    throw new Error('จำนวนต่อชุดต้องมากกว่า 0');
                var c = db.prepare("SELECT id, trade_name, is_bundle, is_disabled FROM products WHERE id = ?").get(it.component_product_id);
                if (!c)
                    throw new Error('ไม่พบส่วนประกอบ');
                if (c.is_bundle === 1)
                    throw new Error("\"".concat(c.trade_name, "\" \u0E40\u0E1B\u0E47\u0E19\u0E0A\u0E38\u0E14\u0E2A\u0E34\u0E19\u0E04\u0E49\u0E32 \u2014 \u0E2B\u0E49\u0E32\u0E21\u0E0B\u0E49\u0E2D\u0E19"));
                if (c.is_disabled === 1)
                    throw new Error("\"".concat(c.trade_name, "\" \u0E16\u0E39\u0E01\u0E1E\u0E31\u0E01\u0E43\u0E0A\u0E49\u0E07\u0E32\u0E19"));
            }
            db.prepare("DELETE FROM product_bundle_items WHERE bundle_id = ?").run(bundleId);
            var ins = db.prepare("\n        INSERT INTO product_bundle_items (bundle_id, component_product_id, qty_per_bundle, sort_order)\n        VALUES (?, ?, ?, ?)\n      ");
            items.forEach(function (it, i) { return ins.run(bundleId, it.component_product_id, Number(it.qty_per_bundle), i + 1); });
            recomputeBundleCost(db, bundleId);
            return { success: true, count: items.length };
        })();
    });
    // System A — FEFO stock-out (POS quick adjust)
    ipcMain.handle('products:adjustLot', function (_e, payload) {
        if (!payload.qty || payload.qty <= 0)
            throw new Error('จำนวนต้องมากกว่า 0');
        if (!payload.user_id)
            throw new Error('ไม่พบผู้ใช้งาน');
        var db = getDb();
        assertNotBundle(db, payload.product_id);
        return db.transaction(function () {
            var lot = db.prepare("\n        SELECT * FROM product_lots\n        WHERE product_id = ? AND qty_on_hand > 0 AND is_closed = 0 AND is_cancelled = 0\n        ORDER BY CASE WHEN expiry_date IS NULL THEN '9999-99-99' ELSE expiry_date END ASC\n        LIMIT 1\n      ").get(payload.product_id);
            if (!lot)
                throw new Error('ไม่พบล็อตสินค้าที่มีสต็อก');
            if (payload.qty > lot.qty_on_hand)
                throw new Error("\u0E08\u0E33\u0E19\u0E27\u0E19\u0E17\u0E35\u0E48\u0E15\u0E49\u0E2D\u0E07\u0E01\u0E32\u0E23\u0E15\u0E31\u0E14 (".concat(payload.qty, ") \u0E21\u0E32\u0E01\u0E01\u0E27\u0E48\u0E32\u0E04\u0E07\u0E40\u0E2B\u0E25\u0E37\u0E2D\u0E43\u0E19\u0E25\u0E47\u0E2D\u0E15 (").concat(lot.qty_on_hand, ")"));
            var qtyBefore = lot.qty_on_hand;
            var qtyAfter = qtyBefore - payload.qty;
            db.prepare("UPDATE product_lots SET qty_on_hand = qty_on_hand - ? WHERE id = ?").run(payload.qty, lot.id);
            db.prepare("\n        INSERT INTO stock_movements (product_id, lot_id, movement_type, ref_type, qty_change, qty_before, qty_after, unit_cost, note, created_by)\n        VALUES (?, ?, 'adjust_out', 'adjust', ?, ?, ?, ?, ?, ?)\n      ").run(payload.product_id, lot.id, -payload.qty, qtyBefore, qtyAfter, lot.cost_price, payload.note || null, payload.user_id);
            return { success: true, lot_number: lot.lot_number, expiry_date: lot.expiry_date, qty_before: qtyBefore, qty_after: qtyAfter };
        })();
    });
    // System A (batch) — Multi-item explicit-lot stock-out from POS adjust modal.
    // Atomic: any per-item failure rolls back the entire batch.
    ipcMain.handle('products:adjustLotBatch', function (_e, payload) {
        if (!payload.user_id)
            throw new Error('ไม่พบผู้ใช้งาน');
        if (!payload.reason || !payload.reason.trim())
            throw new Error('กรุณาระบุสาเหตุ');
        if (!payload.items || payload.items.length === 0)
            throw new Error('ไม่มีรายการที่จะตัด');
        var db = getDb();
        for (var _i = 0, _a = payload.items; _i < _a.length; _i++) {
            var item = _a[_i];
            assertNotBundle(db, item.product_id);
        }
        return db.transaction(function () {
            var results = [];
            for (var _i = 0, _a = payload.items; _i < _a.length; _i++) {
                var item = _a[_i];
                if (!item.qty || item.qty <= 0)
                    throw new Error('จำนวนต้องมากกว่า 0');
                var lot = db.prepare("SELECT * FROM product_lots WHERE id = ?").get(item.lot_id);
                if (!lot)
                    throw new Error("\u0E44\u0E21\u0E48\u0E1E\u0E1A\u0E25\u0E47\u0E2D\u0E15 #".concat(item.lot_id));
                if (lot.product_id !== item.product_id)
                    throw new Error("\u0E25\u0E47\u0E2D\u0E15 ".concat(lot.lot_number, " \u0E44\u0E21\u0E48\u0E15\u0E23\u0E07\u0E01\u0E31\u0E1A\u0E2A\u0E34\u0E19\u0E04\u0E49\u0E32\u0E17\u0E35\u0E48\u0E23\u0E30\u0E1A\u0E38"));
                if (lot.is_closed || lot.is_cancelled)
                    throw new Error("\u0E25\u0E47\u0E2D\u0E15 ".concat(lot.lot_number, " \u0E16\u0E39\u0E01\u0E1B\u0E34\u0E14\u0E2B\u0E23\u0E37\u0E2D\u0E22\u0E01\u0E40\u0E25\u0E34\u0E01\u0E41\u0E25\u0E49\u0E27"));
                if (item.qty > lot.qty_on_hand) {
                    throw new Error("\u0E08\u0E33\u0E19\u0E27\u0E19\u0E17\u0E35\u0E48\u0E15\u0E31\u0E14 (".concat(item.qty, ") \u0E21\u0E32\u0E01\u0E01\u0E27\u0E48\u0E32\u0E04\u0E07\u0E40\u0E2B\u0E25\u0E37\u0E2D\u0E43\u0E19\u0E25\u0E47\u0E2D\u0E15 ").concat(lot.lot_number, " (").concat(lot.qty_on_hand, ")"));
                }
                var qtyBefore = lot.qty_on_hand;
                var qtyAfter = qtyBefore - item.qty;
                db.prepare("UPDATE product_lots SET qty_on_hand = qty_on_hand - ? WHERE id = ?").run(item.qty, lot.id);
                db.prepare("\n          INSERT INTO stock_movements (product_id, lot_id, movement_type, ref_type, qty_change, qty_before, qty_after, unit_cost, note, created_by)\n          VALUES (?, ?, 'adjust_out', 'adjust', ?, ?, ?, ?, ?, ?)\n        ").run(item.product_id, lot.id, -item.qty, qtyBefore, qtyAfter, lot.cost_price, payload.reason.trim(), payload.user_id);
                results.push({ product_id: item.product_id, lot_id: lot.id, lot_number: lot.lot_number, qty_before: qtyBefore, qty_after: qtyAfter });
            }
            return { success: true, count: results.length, items: results };
        })();
    });
    // System B — Direct lot edit (metadata + qty)
    ipcMain.handle('products:updateLot', function (_e, id, data) {
        if (!data.user_id)
            throw new Error('ไม่พบผู้ใช้งาน');
        var db = getDb();
        return db.transaction(function () {
            var lot = db.prepare("SELECT * FROM product_lots WHERE id = ?").get(id);
            if (!lot)
                throw new Error('ไม่พบล็อต');
            // Bundles have no lots — defense in depth against direct IPC abuse.
            assertNotBundle(db, lot.product_id);
            // Block edits on cancelled lots (UI hides the button, but guard against direct IPC)
            if (lot.is_cancelled)
                throw new Error('ไม่สามารถแก้ไขล็อตที่ถูกยกเลิกได้');
            // Pre-flight: lot_number rename collision
            if (data.lot_number !== undefined && data.lot_number !== lot.lot_number) {
                var dup = db.prepare("\n          SELECT id FROM product_lots\n          WHERE product_id = ? AND lot_number = ? AND id <> ?\n          LIMIT 1\n        ").get(lot.product_id, data.lot_number, id);
                if (dup)
                    throw new Error("\u0E21\u0E35\u0E25\u0E47\u0E2D\u0E15\u0E2B\u0E21\u0E32\u0E22\u0E40\u0E25\u0E02 \"".concat(data.lot_number, "\" \u0E2D\u0E22\u0E39\u0E48\u0E41\u0E25\u0E49\u0E27\u0E43\u0E19\u0E2A\u0E34\u0E19\u0E04\u0E49\u0E32\u0E19\u0E35\u0E49"));
            }
            // qty must be non-negative
            if (data.qty_on_hand !== undefined && data.qty_on_hand < 0) {
                throw new Error('จำนวนคงเหลือต้องไม่ติดลบ');
            }
            var qtyChanged = data.qty_on_hand !== undefined && data.qty_on_hand !== lot.qty_on_hand;
            var costChanged = data.cost_price !== undefined && Number(data.cost_price) !== Number(lot.cost_price);
            // Log qty change as stock movement
            if (qtyChanged) {
                var delta = data.qty_on_hand - lot.qty_on_hand;
                var movType = delta > 0 ? 'adjust_in' : 'adjust_out';
                db.prepare("\n          INSERT INTO stock_movements (product_id, lot_id, movement_type, ref_type, qty_change, qty_before, qty_after, unit_cost, note, created_by)\n          VALUES (?, ?, ?, 'manual_edit', ?, ?, ?, ?, '\u0E41\u0E01\u0E49\u0E44\u0E02\u0E42\u0E14\u0E22\u0E15\u0E23\u0E07', ?)\n        ").run(lot.product_id, id, movType, delta, lot.qty_on_hand, data.qty_on_hand, lot.cost_price, data.user_id);
            }
            // Log cost_price change to lot_cost_logs (regulatory-significant for retroactive profit)
            if (costChanged) {
                db.prepare("\n          INSERT INTO lot_cost_logs (lot_id, product_id, old_cost, new_cost, note, created_by)\n          VALUES (?, ?, ?, ?, '\u0E41\u0E01\u0E49\u0E44\u0E02\u0E23\u0E32\u0E04\u0E32\u0E17\u0E38\u0E19\u0E1C\u0E48\u0E32\u0E19\u0E2B\u0E19\u0E49\u0E32\u0E25\u0E47\u0E2D\u0E15', ?)\n        ").run(id, lot.product_id, lot.cost_price, data.cost_price, data.user_id);
            }
            var updatable = ['lot_number', 'expiry_date', 'manufactured_date', 'qty_on_hand', 'cost_price'];
            var fields = [];
            var vals = { id: id };
            for (var _i = 0, updatable_1 = updatable; _i < updatable_1.length; _i++) {
                var key = updatable_1[_i];
                if (key in data) {
                    fields.push("".concat(key, " = @").concat(key));
                    vals[key] = data[key];
                }
            }
            // Auto-toggle is_closed/closed_at when qty crosses the 0 boundary
            // - qty → 0: close the lot so it drops out of FEFO / stock queries (filter is_closed = 0)
            // - qty 0 → >0 on a previously-closed lot: reopen so the stock is visible again
            if (data.qty_on_hand !== undefined) {
                if (data.qty_on_hand <= 0) {
                    fields.push("is_closed = 1", "closed_at = datetime('now','localtime')");
                }
                else if (lot.is_closed) {
                    fields.push("is_closed = 0", "closed_at = NULL");
                }
            }
            if (fields.length === 0)
                return lot;
            db.prepare("UPDATE product_lots SET ".concat(fields.join(', '), ", updated_at = datetime('now','localtime') WHERE id = @id")).run(vals);
            // Recompute products.cost_price (weighted avg of open lots by qty_received).
            // A lot's contribution to that avg changes whenever its cost_price changes OR
            // it transitions in/out of is_closed (qty crossing 0). Recompute on both.
            if (qtyChanged || costChanged) {
                recomputeAvgCost(db, lot.product_id);
                propagateCostToBundles(db, lot.product_id);
            }
            return db.prepare("SELECT * FROM product_lots WHERE id = ?").get(id);
        })();
    });
    // System C — Full lot disposal from Expiry report.
    // Auto-classifies movement_type based on expiry_date vs today:
    //   expired      → expiry_date <= today
    //   near_expiry  → expiry_date >  today (or expiry_date IS NULL — disposed without expiry tracking)
    // Used ONLY by the Expiry / Expiring Products page. Other disposal flows are unaffected.
    ipcMain.handle('products:expireLot', function (_e, lot_id, user_id) {
        if (!user_id)
            throw new Error('ไม่พบผู้ใช้งาน');
        var db = getDb();
        return db.transaction(function () {
            var lot = db.prepare("SELECT * FROM product_lots WHERE id = ?").get(lot_id);
            if (!lot)
                throw new Error('ไม่พบล็อต');
            if (lot.qty_on_hand <= 0)
                throw new Error('ล็อตนี้ไม่มีสินค้าคงเหลือ');
            var today = db.prepare("SELECT date('now','localtime') AS d").get().d;
            var isExpired = !!lot.expiry_date && lot.expiry_date <= today;
            var movementType = isExpired ? 'expired' : 'near_expiry';
            var note = isExpired ? 'ตัดออกเนื่องจากหมดอายุ' : 'ตัดออกก่อนหมดอายุ';
            var qtyBefore = lot.qty_on_hand;
            db.prepare("UPDATE product_lots SET qty_on_hand = 0, is_closed = 1, closed_at = datetime('now','localtime') WHERE id = ?").run(lot_id);
            db.prepare("\n        INSERT INTO stock_movements (product_id, lot_id, movement_type, ref_type, qty_change, qty_before, qty_after, unit_cost, note, created_by)\n        VALUES (?, ?, ?, 'expiry_report', ?, ?, 0, ?, ?, ?)\n      ").run(lot.product_id, lot_id, movementType, -qtyBefore, qtyBefore, lot.cost_price, note, user_id);
            // Closing the lot (is_closed: 0→1) removes it from the weighted-avg pool
            // that recomputeAvgCost uses (filter is_closed = 0). Without this call,
            // products.cost_price keeps the pre-disposal value until the next stock
            // event happens to fire a recompute. Bundles containing this product
            // also stay stale until then.
            recomputeAvgCost(db, lot.product_id);
            propagateCostToBundles(db, lot.product_id);
            return {
                success: true,
                product_id: lot.product_id,
                lot_number: lot.lot_number,
                qty_removed: qtyBefore,
                classification: movementType,
            };
        })();
    });
}
