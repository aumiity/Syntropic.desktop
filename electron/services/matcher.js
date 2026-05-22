import dayjs from 'dayjs';
// Auto-confirm threshold: at/above this, the UI may pre-pick without a manual
// click. (Decision: 0.95.)
export var AUTO_CONFIRM_THRESHOLD = 0.95;
// Normalize supplier text for the alias key: trim, collapse internal
// whitespace, uppercase. "PARA 500" and " para  500 " collide here.
export function normalize(text) {
    return text.replace(/\s+/g, ' ').trim().toUpperCase();
}
// First non-empty barcode, primary first. (Decision: fall back 2/3/4.)
function resolveBarcode(p) {
    for (var _i = 0, _a = [p.barcode, p.barcode2, p.barcode3, p.barcode4]; _i < _a.length; _i++) {
        var b = _a[_i];
        var v = (b !== null && b !== void 0 ? b : '').trim();
        if (v)
            return v;
    }
    return null;
}
// Tokenize: lowercase, split on whitespace/punctuation, and glue a number to a
// trailing unit so "500 mg" and "500mg" tokenize the same. Keeps Thai letters,
// latin letters and digits.
function tokenize(text) {
    var cleaned = text
        .toLowerCase()
        .replace(/(\d)\s+(mg|g|ml|mcg|iu|%|cc|l|kg)\b/g, '$1$2');
    var raw = cleaned.split(/[^0-9a-z฀-๿%]+/i).filter(Boolean);
    return raw.filter(function (t) { return t.length > 1 || /\d/.test(t); });
}
function tokenF1(query, doc) {
    if (query.size === 0 || doc.size === 0)
        return 0;
    var inter = 0;
    query.forEach(function (t) {
        if (doc.has(t))
            inter++;
    });
    if (inter === 0)
        return 0;
    var recall = inter / query.size;
    var precision = inter / doc.size;
    return (2 * recall * precision) / (recall + precision);
}
// Character trigram Dice coefficient (0..1).
function trigrams(s) {
    var t = " ".concat(s.toLowerCase().replace(/\s+/g, ' ').trim(), " ");
    var g = new Set();
    for (var i = 0; i < t.length - 2; i++)
        g.add(t.slice(i, i + 3));
    return g;
}
function diceSimilarity(a, b) {
    var A = trigrams(a);
    var B = trigrams(b);
    if (A.size === 0 || B.size === 0)
        return 0;
    var inter = 0;
    A.forEach(function (g) {
        if (B.has(g))
            inter++;
    });
    return (2 * inter) / (A.size + B.size);
}
function toCandidate(p, score) {
    return {
        productId: p.id,
        code: p.code,
        name: p.trade_name,
        generic: p.search_keywords,
        barcode: resolveBarcode(p),
        unitName: p.unit_name,
        score: Math.round(score * 1000) / 1000,
    };
}
var TOKEN_TIER_MIN = 0.7; // below this, fall through to fuzzy
var FUZZY_FLOOR = 0.3; // below this, tier = 'none' (still surfaced for manual pick)
/**
 * Match supplier invoice lines to products.
 * Empty / whitespace-only lines are skipped silently (decision).
 */
export function matchLines(db, supplierId, lines) {
    var _a, _b;
    var products = db
        .prepare("SELECT p.id, p.code, p.trade_name, p.search_keywords,\n              p.barcode, p.barcode2, p.barcode3, p.barcode4,\n              u.name AS unit_name\n         FROM products p\n         LEFT JOIN item_units u ON u.id = p.unit_id\n        WHERE p.is_disabled = 0")
        .all();
    // Pre-tokenize the product corpus once per call.
    var docTokens = products.map(function (p) { var _a, _b; return new Set(tokenize("".concat(p.trade_name, " ").concat((_a = p.search_keywords) !== null && _a !== void 0 ? _a : '', " ").concat((_b = p.code) !== null && _b !== void 0 ? _b : ''))); });
    var aliasStmt = db.prepare("SELECT product_id FROM supplier_product_alias\n      WHERE supplier_id = ? AND supplier_text = ?");
    var byId = new Map(products.map(function (p) { return [p.id, p]; }));
    var results = [];
    var _loop_1 = function (rawLine) {
        var supplierText = rawLine.trim();
        if (!supplierText)
            return "continue"; // skip blank lines silently
        var norm = normalize(supplierText);
        // Tier 1 — alias cache
        var hit = aliasStmt.get(supplierId, norm);
        if (hit && byId.has(hit.product_id)) {
            results.push({
                supplierText: supplierText,
                normalized: norm,
                tier: 'alias',
                candidates: [toCandidate(byId.get(hit.product_id), 1.0)],
            });
            return "continue";
        }
        // Tier 2 — token-set F1
        var qTokens = new Set(tokenize(supplierText));
        var tokenScored = products
            .map(function (p, i) { return ({ p: p, s: tokenF1(qTokens, docTokens[i]) }); })
            .filter(function (x) { return x.s > 0; })
            .sort(function (a, b) { return b.s - a.s || a.p.trade_name.length - b.p.trade_name.length; });
        if (tokenScored.length && tokenScored[0].s >= TOKEN_TIER_MIN) {
            results.push({
                supplierText: supplierText,
                normalized: norm,
                tier: 'token',
                candidates: tokenScored.slice(0, 3).map(function (x) { return toCandidate(x.p, x.s); }),
            });
            return "continue";
        }
        // Tier 3 — fuzzy trigram
        var fuzzyScored = products
            .map(function (p) { return ({
            p: p,
            s: Math.max(diceSimilarity(norm, p.trade_name), p.search_keywords ? diceSimilarity(norm, p.search_keywords) : 0),
        }); })
            .sort(function (a, b) { return b.s - a.s || a.p.trade_name.length - b.p.trade_name.length; });
        var best = (_b = (_a = fuzzyScored[0]) === null || _a === void 0 ? void 0 : _a.s) !== null && _b !== void 0 ? _b : 0;
        results.push({
            supplierText: supplierText,
            normalized: norm,
            tier: best >= FUZZY_FLOOR ? 'fuzzy' : 'none',
            candidates: fuzzyScored.slice(0, 3).map(function (x) { return toCandidate(x.p, x.s); }),
        });
    };
    for (var _i = 0, lines_1 = lines; _i < lines_1.length; _i++) {
        var rawLine = lines_1[_i];
        _loop_1(rawLine);
    }
    return results;
}
// ล็อต = DDMMYY derived from expiry (leading zero preserved as literal chars).
export function formatLot(expiry) {
    var d = dayjs(expiry);
    return d.isValid() ? d.format('DDMMYY') : '';
}
// วันผลิต / วันหมดอายุ = DD/MM/YYYY (both columns get the expiry value).
export function formatDate(expiry) {
    var d = dayjs(expiry);
    return d.isValid() ? d.format('DD/MM/YYYY') : '';
}
var CSV_HEADER = ['Barcode', 'จำนวน', 'ล็อต', 'วันผลิต', 'วันหมดอายุ', 'ราคารวม'];
function csvCell(v) {
    var s = String(v);
    return "\"".concat(s.replace(/"/g, '""'), "\"");
}
/**
 * Build the Power Automate CSV. UTF-8 BOM is prepended by the caller that
 * writes the file. Columns: Barcode | จำนวน | ล็อต | วันผลิต | วันหมดอายุ | ราคารวม
 * - วันผลิต and วันหมดอายุ both carry the expiry value (by design).
 * - ราคารวม is the line total (qty × unit cost), passed in pre-computed.
 */
export function buildCsv(rows) {
    var lines = [CSV_HEADER.map(csvCell).join(',')];
    for (var _i = 0, rows_1 = rows; _i < rows_1.length; _i++) {
        var r = rows_1[_i];
        lines.push([
            csvCell(r.barcode),
            csvCell(r.qty),
            csvCell(formatLot(r.expiry)),
            csvCell(formatDate(r.expiry)),
            csvCell(formatDate(r.expiry)),
            csvCell(r.lineTotal),
        ].join(','));
    }
    return lines.join('\r\n');
}
