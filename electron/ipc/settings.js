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
import { ipcMain } from 'electron';
import { app } from 'electron';
import fs from 'fs';
import path from 'path';
import { getDb } from '../db';
import { orderByBucket } from '../db/sortName';
function resolveThemeCssPath() {
    var appPath = app.getAppPath();
    var candidates = [
        path.resolve(appPath, 'src/index.css'),
        path.resolve(process.cwd(), 'src/index.css'),
    ];
    var found = candidates.find(function (candidate) { return fs.existsSync(candidate); });
    if (!found) {
        throw new Error('ไม่พบไฟล์ src/index.css สำหรับแก้ไขธีมสี');
    }
    return found;
}
function parseVars(block) {
    var vars = {};
    var re = /(--[a-z0-9-]+)\s*:\s*([^;]+);/gi;
    var m;
    while ((m = re.exec(block))) {
        vars[m[1]] = m[2].trim();
    }
    return vars;
}
function upsertVar(block, token, value) {
    var escapedToken = token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    var lineRe = new RegExp("(^\\s*".concat(escapedToken, "\\s*:\\s*)([^;]+)(;.*$)"), 'm');
    if (lineRe.test(block)) {
        return block.replace(lineRe, "$1".concat(value, "$3"));
    }
    var trimmed = block.replace(/\s*$/, '');
    return "".concat(trimmed, "\n    ").concat(token, ": ").concat(value, ";");
}
function updateSelectorBlock(content, selector, updates) {
    var selectorRe = selector === ':root' ? /(:root\s*\{)([\s\S]*?)(\n\s*\})/m : /(\.dark\s*\{)([\s\S]*?)(\n\s*\})/m;
    var match = content.match(selectorRe);
    if (!match) {
        throw new Error("\u0E44\u0E21\u0E48\u0E1E\u0E1A\u0E1A\u0E25\u0E47\u0E2D\u0E01 ".concat(selector, " \u0E43\u0E19\u0E44\u0E1F\u0E25\u0E4C index.css"));
    }
    var open = match[1], body = match[2], close = match[3];
    var newBody = body;
    for (var _i = 0, _a = Object.entries(updates); _i < _a.length; _i++) {
        var _b = _a[_i], token = _b[0], value = _b[1];
        newBody = upsertVar(newBody, token, value);
    }
    return content.replace(selectorRe, "".concat(open).concat(newBody).concat(close));
}
function getHtmlFontSize(css) {
    var htmlBlock = css.match(/html\s*\{([\s\S]*?)\}/m);
    if (!htmlBlock)
        return null;
    var fontSizeMatch = htmlBlock[1].match(/font-size\s*:\s*([^;]+);/m);
    if (!fontSizeMatch)
        return null;
    return fontSizeMatch[1].trim();
}
function setHtmlFontSize(css, value) {
    var htmlBlockRe = /(html\s*\{)([\s\S]*?)(\})/m;
    var htmlBlock = css.match(htmlBlockRe);
    if (!htmlBlock) {
        return "".concat(css, "\n\nhtml { font-size: ").concat(value, "; }\n");
    }
    var open = htmlBlock[1], body = htmlBlock[2], close = htmlBlock[3];
    var bodyWithFontSize = /font-size\s*:/m.test(body)
        ? body.replace(/(font-size\s*:\s*)([^;]+)(;)/m, "$1".concat(value, "$3"))
        : "".concat(body.replace(/\s*$/, ''), "\n  font-size: ").concat(value, ";\n");
    return css.replace(htmlBlockRe, "".concat(open).concat(bodyWithFontSize).concat(close));
}
export function registerSettingsHandlers() {
    // Shop settings
    ipcMain.handle('settings:getShop', function () {
        return getDb().prepare("SELECT * FROM settings LIMIT 1").get();
    });
    ipcMain.handle('settings:saveShop', function (_e, data) {
        var db = getDb();
        var existing = db.prepare("SELECT id FROM settings LIMIT 1").get();
        if (existing) {
            var fields = Object.keys(data).map(function (k) { return "".concat(k, " = @").concat(k); }).join(', ');
            db.prepare("UPDATE settings SET ".concat(fields, ", updated_at = datetime('now','localtime') WHERE id = @id")).run(__assign(__assign({}, data), { id: existing.id }));
        }
        else {
            db.prepare("INSERT INTO settings (shop_name, shop_address, shop_phone, shop_license_no, shop_tax_id, shop_line_id) VALUES (@shop_name, @shop_address, @shop_phone, @shop_license_no, @shop_tax_id, @shop_line_id)").run(data);
        }
        return db.prepare("SELECT * FROM settings LIMIT 1").get();
    });
    // Categories
    ipcMain.handle('settings:listCategories', function () {
        return getDb().prepare("SELECT * FROM product_categories ORDER BY sort_order, id").all();
    });
    ipcMain.handle('settings:saveCategory', function (_e, data) {
        var db = getDb();
        if (data.id) {
            var id = data.id, rest = __rest(data, ["id"]);
            var fields = Object.keys(rest).map(function (k) { return "".concat(k, " = @").concat(k); }).join(', ');
            db.prepare("UPDATE product_categories SET ".concat(fields, ", updated_at = datetime('now','localtime') WHERE id = @id")).run(data);
            return db.prepare("SELECT * FROM product_categories WHERE id = ?").get(id);
        }
        var result = db.prepare("INSERT INTO product_categories (code, name, description, sort_order) VALUES (@code, @name, @description, @sort_order)").run(data);
        return db.prepare("SELECT * FROM product_categories WHERE id = ?").get(result.lastInsertRowid);
    });
    // Drag-and-drop reorder: renumber sort_order to 1..n by the given id order,
    // in one transaction so listCategories (ORDER BY sort_order, id) is stable.
    ipcMain.handle('settings:reorderCategories', function (_e, ids) {
        var db = getDb();
        var upd = db.prepare("UPDATE product_categories SET sort_order = ?, updated_at = datetime('now','localtime') WHERE id = ?");
        db.transaction(function (order) {
            order.forEach(function (id, i) { return upd.run(i + 1, id); });
        })(ids);
        return db.prepare("SELECT * FROM product_categories ORDER BY sort_order, id").all();
    });
    // Item units
    ipcMain.handle('settings:listUnits', function () {
        return getDb().prepare("\n      SELECT u.*, COUNT(DISTINCT pu.product_id) as usage_count\n      FROM item_units u\n      LEFT JOIN product_units pu ON pu.unit_id = u.id\n      GROUP BY u.id ORDER BY ".concat(orderByBucket('u.name'), "\n    ")).all();
    });
    ipcMain.handle('settings:saveUnit', function (_e, data) {
        var db = getDb();
        if (data.id) {
            db.prepare("UPDATE item_units SET name = ? WHERE id = ?").run(data.name, data.id);
            return db.prepare("SELECT * FROM item_units WHERE id = ?").get(data.id);
        }
        var result = db.prepare("INSERT INTO item_units (name) VALUES (?)").run(data.name);
        return db.prepare("SELECT * FROM item_units WHERE id = ?").get(result.lastInsertRowid);
    });
    // Drug types
    ipcMain.handle('settings:listDrugTypes', function () {
        return getDb().prepare("SELECT * FROM drug_types ORDER BY id").all();
    });
    ipcMain.handle('settings:saveDrugType', function (_e, data) {
        var db = getDb();
        if (data.id) {
            var id = data.id, rest = __rest(data, ["id"]);
            var fields = Object.keys(rest).map(function (k) { return "".concat(k, " = @").concat(k); }).join(', ');
            db.prepare("UPDATE drug_types SET ".concat(fields, ", updated_at = datetime('now','localtime') WHERE id = @id")).run(data);
            return db.prepare("SELECT * FROM drug_types WHERE id = ?").get(id);
        }
        var result = db.prepare("INSERT INTO drug_types (code, name_th, is_fda9, is_fda10, is_fda11, is_fda13) VALUES (@code, @name_th, @is_fda9, @is_fda10, @is_fda11, @is_fda13)").run(data);
        return db.prepare("SELECT * FROM drug_types WHERE id = ?").get(result.lastInsertRowid);
    });
    // Dosage forms
    ipcMain.handle('settings:listDosageForms', function () {
        return getDb().prepare("SELECT * FROM dosage_forms WHERE is_disabled = 0 ORDER BY ".concat(orderByBucket('name_th'))).all();
    });
    // Label frequencies/dosages/etc.
    ipcMain.handle('settings:listLabelFrequencies', function () { return getDb().prepare("SELECT * FROM label_frequencies ORDER BY sort_order").all(); });
    ipcMain.handle('settings:listLabelDosages', function () { return getDb().prepare("SELECT * FROM label_dosages ORDER BY sort_order").all(); });
    ipcMain.handle('settings:listLabelMealRelations', function () { return getDb().prepare("SELECT * FROM label_meal_relations ORDER BY sort_order").all(); });
    ipcMain.handle('settings:listLabelTimes', function () { return getDb().prepare("SELECT * FROM label_times ORDER BY sort_order").all(); });
    ipcMain.handle('settings:listLabelAdvices', function () { return getDb().prepare("SELECT * FROM label_advices ORDER BY sort_order").all(); });
    // Label settings (singleton). ORDER BY id keeps reads deterministic if a
    // legacy DB ended up with multiple rows; the seed now guarantees only one.
    ipcMain.handle('settings:getLabelSettings', function () {
        return getDb().prepare("SELECT * FROM label_settings ORDER BY id LIMIT 1").get();
    });
    ipcMain.handle('settings:saveLabelSettings', function (_e, data) {
        var db = getDb();
        var existing = db.prepare("SELECT id FROM label_settings ORDER BY id LIMIT 1").get();
        if (existing) {
            var _drop = data.id, rest = __rest(data, ["id"]);
            var fields = Object.keys(rest).map(function (k) { return "".concat(k, " = @").concat(k); }).join(', ');
            // Bind id as @id (named) — mixing `?` with an object binding throws
            // "Too few parameter values were provided" in better-sqlite3.
            db.prepare("UPDATE label_settings SET ".concat(fields, ", updated_at = datetime('now','localtime') WHERE id = @id"))
                .run(__assign(__assign({}, rest), { id: existing.id }));
        }
        else {
            db.prepare("INSERT INTO label_settings DEFAULT VALUES").run();
        }
        return db.prepare("SELECT * FROM label_settings ORDER BY id LIMIT 1").get();
    });
    // Sales settings (singleton) — POS cart alert thresholds and toggles.
    // First read auto-inserts a default row so the renderer always gets a complete object.
    ipcMain.handle('settings:getSalesSettings', function () {
        var db = getDb();
        var row = db.prepare("SELECT * FROM sales_settings LIMIT 1").get();
        if (!row) {
            db.prepare("INSERT INTO sales_settings DEFAULT VALUES").run();
            row = db.prepare("SELECT * FROM sales_settings LIMIT 1").get();
        }
        return row;
    });
    ipcMain.handle('settings:saveSalesSettings', function (_e, data) {
        var db = getDb();
        var existing = db.prepare("SELECT id, vat_enabled FROM sales_settings LIMIT 1").get();
        db.transaction(function () {
            if (existing) {
                var id = data.id, updated_at = data.updated_at, rest = __rest(data, ["id", "updated_at"]);
                var fields = Object.keys(rest).map(function (k) { return "".concat(k, " = @").concat(k); }).join(', ');
                db.prepare("UPDATE sales_settings SET ".concat(fields, ", updated_at = datetime('now','localtime') WHERE id = ?")).run(__assign(__assign({}, rest), { id: existing.id }));
                // First time VAT is turned on (off→on): flag every product as VATable so
                // the operator opts products OUT rather than IN. Only on the transition,
                // never on subsequent saves — otherwise it would clobber per-product
                // toggles the operator set afterwards.
                if (existing.vat_enabled === 0 && data.vat_enabled === 1) {
                    db.prepare("UPDATE products SET has_vat = 1").run();
                }
            }
            else {
                db.prepare("INSERT INTO sales_settings DEFAULT VALUES").run();
            }
        })();
        return db.prepare("SELECT * FROM sales_settings LIMIT 1").get();
    });
    // All item units (for dropdowns)
    ipcMain.handle('settings:allUnits', function () {
        return getDb().prepare("SELECT * FROM item_units ORDER BY ".concat(orderByBucket('name'))).all();
    });
    // All categories (for dropdowns)
    ipcMain.handle('settings:allCategories', function () {
        return getDb().prepare("SELECT * FROM product_categories WHERE is_disabled = 0 ORDER BY sort_order").all();
    });
    // All drug types (for dropdowns)
    ipcMain.handle('settings:allDrugTypes', function () {
        return getDb().prepare("SELECT * FROM drug_types WHERE is_disabled = 0 ORDER BY id").all();
    });
    // All dosage forms (for dropdowns)
    ipcMain.handle('settings:allDosageForms', function () {
        return getDb().prepare("SELECT * FROM dosage_forms WHERE is_disabled = 0 ORDER BY ".concat(orderByBucket('name_th'))).all();
    });
    // Theme color tokens in src/index.css
    ipcMain.handle('settings:getThemeColors', function () {
        var cssPath = resolveThemeCssPath();
        var css = fs.readFileSync(cssPath, 'utf8');
        var rootMatch = css.match(/:root\s*\{([\s\S]*?)\n\s*\}/m);
        var darkMatch = css.match(/\.dark\s*\{([\s\S]*?)\n\s*\}/m);
        if (!rootMatch || !darkMatch) {
            throw new Error('ไม่พบบล็อก :root หรือ .dark ในไฟล์ index.css');
        }
        return {
            path: cssPath,
            root: parseVars(rootMatch[1]),
            dark: parseVars(darkMatch[1]),
        };
    });
    ipcMain.handle('settings:saveThemeColors', function (_e, payload) {
        var cssPath = resolveThemeCssPath();
        var css = fs.readFileSync(cssPath, 'utf8');
        var rootUpdates = {};
        var darkUpdates = {};
        for (var _i = 0, _a = payload !== null && payload !== void 0 ? payload : []; _i < _a.length; _i++) {
            var row = _a[_i];
            if (!(row === null || row === void 0 ? void 0 : row.token) || !/^--[a-z0-9-]+$/i.test(row.token))
                continue;
            if (typeof row.light === 'string' && row.light.trim())
                rootUpdates[row.token] = row.light.trim();
            if (typeof row.dark === 'string' && row.dark.trim())
                darkUpdates[row.token] = row.dark.trim();
        }
        var updated = css;
        if (Object.keys(rootUpdates).length) {
            updated = updateSelectorBlock(updated, ':root', rootUpdates);
        }
        if (Object.keys(darkUpdates).length) {
            updated = updateSelectorBlock(updated, '.dark', darkUpdates);
        }
        fs.writeFileSync(cssPath, updated, 'utf8');
        return true;
    });
    ipcMain.handle('settings:getThemeFontSize', function () {
        var _a;
        var cssPath = resolveThemeCssPath();
        var css = fs.readFileSync(cssPath, 'utf8');
        return (_a = getHtmlFontSize(css)) !== null && _a !== void 0 ? _a : '18px';
    });
    ipcMain.handle('settings:saveThemeFontSize', function (_e, fontSize) {
        var value = String(fontSize !== null && fontSize !== void 0 ? fontSize : '').trim();
        if (!/^\d+(\.\d+)?px$/i.test(value)) {
            throw new Error('รูปแบบขนาดฟอนต์ไม่ถูกต้อง (ตัวอย่าง: 18px)');
        }
        var cssPath = resolveThemeCssPath();
        var css = fs.readFileSync(cssPath, 'utf8');
        var updated = setHtmlFontSize(css, value);
        fs.writeFileSync(cssPath, updated, 'utf8');
        return true;
    });
    ipcMain.handle('settings:getThemeFonts', function () {
        var _a, _b;
        var cssPath = resolveThemeCssPath();
        var css = fs.readFileSync(cssPath, 'utf8');
        var rootMatch = css.match(/:root\s*\{([\s\S]*?)\n\s*\}/m);
        var vars = rootMatch ? parseVars(rootMatch[1]) : {};
        return {
            latin: (_a = vars['--font-latin']) !== null && _a !== void 0 ? _a : "'Inter'",
            thai: (_b = vars['--font-thai']) !== null && _b !== void 0 ? _b : "'Sarabun'",
        };
    });
    ipcMain.handle('settings:saveThemeFonts', function (_e, payload) {
        var _a, _b;
        var latin = String((_a = payload === null || payload === void 0 ? void 0 : payload.latin) !== null && _a !== void 0 ? _a : '').trim();
        var thai = String((_b = payload === null || payload === void 0 ? void 0 : payload.thai) !== null && _b !== void 0 ? _b : '').trim();
        if (!latin || !thai) {
            throw new Error('ต้องระบุฟอนต์ทั้ง Latin และ Thai');
        }
        var cssPath = resolveThemeCssPath();
        var css = fs.readFileSync(cssPath, 'utf8');
        var updated = updateSelectorBlock(css, ':root', {
            '--font-latin': latin,
            '--font-thai': thai,
        });
        fs.writeFileSync(cssPath, updated, 'utf8');
        return true;
    });
}
