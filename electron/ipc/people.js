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
import { nextCustomerCode, walkInCustomerId, WALKIN_CUSTOMER_CODE } from './codes';
import { orderByBucket } from '../db/sortName';
import { hashSecret } from '../auth/hash';
import { requireAdmin } from '../auth/session';
export function registerPeopleHandlers() {
    // --- CUSTOMERS ---
    ipcMain.handle('people:listCustomers', function (_e, filters) {
        var _a, _b;
        var db = getDb();
        var _c = filters !== null && filters !== void 0 ? filters : {}, q = _c.q, _d = _c.page, page = _d === void 0 ? 1 : _d, limitOpt = _c.limit, _f = _c.includeDisabled, includeDisabled = _f === void 0 ? false : _f;
        var limit = limitOpt === 'all' ? null : (typeof limitOpt === 'number' && limitOpt > 0 ? limitOpt : 50);
        var offset = limit ? (page - 1) * limit : 0;
        var conds = [];
        var params = [];
        // C0000 (walk-in) is a reserved system row, never a real customer — keep
        // it out of the People list (walk-in invariant, CLAUDE.md).
        conds.push("code != '".concat(WALKIN_CUSTOMER_CODE, "'"));
        if (!includeDisabled)
            conds.push("is_disabled = 0");
        if (q) {
            conds.push("(full_name LIKE ? OR phone LIKE ? OR code LIKE ?)");
            params.push("%".concat(q, "%"), "%".concat(q, "%"), "%".concat(q, "%"));
        }
        var where = conds.length ? "WHERE ".concat(conds.join(' AND ')) : '';
        var limitClause = limit ? "LIMIT ? OFFSET ?" : '';
        var limitParams = limit ? [limit, offset] : [];
        var rows = (_a = db.prepare("SELECT * FROM customers ".concat(where, " ORDER BY code ").concat(limitClause))).all.apply(_a, __spreadArray(__spreadArray([], params, false), limitParams, false));
        var total = (_b = db.prepare("SELECT COUNT(*) as c FROM customers ".concat(where))).get.apply(_b, params).c;
        return { rows: rows, total: total, page: page, limit: limit !== null && limit !== void 0 ? limit : total };
    });
    ipcMain.handle('people:getCustomer', function (_e, id) {
        var db = getDb();
        var customer = db.prepare("SELECT * FROM customers WHERE id = ?").get(id);
        var allergies = db.prepare("\n      SELECT da.*, dgn.name as generic_name FROM drug_allergies da\n      LEFT JOIN drug_generic_names dgn ON dgn.id = da.generic_name_id\n      WHERE da.customer_id = ? ORDER BY da.noted_at DESC\n    ").all(id);
        return __assign(__assign({}, customer), { allergies: allergies });
    });
    ipcMain.handle('people:saveCustomer', function (_e, data) {
        var db = getDb();
        if (data.id) {
            if (data.id === walkInCustomerId(db))
                throw new Error('ไม่สามารถแก้ไขลูกค้าทั่วไป (ลูกค้าระบบสงวนไว้)');
            var id = data.id, rest = __rest(data, ["id"]);
            delete rest.allergies;
            var fields = Object.keys(rest).map(function (k) { return "".concat(k, " = @").concat(k); }).join(', ');
            db.prepare("UPDATE customers SET ".concat(fields, ", updated_at = datetime('now','localtime') WHERE id = @id")).run(data);
            return db.prepare("SELECT * FROM customers WHERE id = ?").get(id);
        }
        var code = nextCustomerCode(db);
        var result = db.prepare("\n      INSERT INTO customers (code, full_name, id_card, dob, phone, address,\n        chronic_diseases,\n        is_alert, alert_note, is_disabled)\n      VALUES (@code, @full_name, @id_card, @dob, @phone, @address,\n        @chronic_diseases,\n        @is_alert, @alert_note, @is_disabled)\n    ").run(__assign({ code: code }, data));
        return db.prepare("SELECT * FROM customers WHERE id = ?").get(result.lastInsertRowid);
    });
    ipcMain.handle('people:setCustomerStatus', function (_e, payload) {
        var db = getDb();
        if (payload.id === walkInCustomerId(db))
            throw new Error('ไม่สามารถปิด/ลบลูกค้าทั่วไป (ลูกค้าระบบสงวนไว้)');
        db.prepare("UPDATE customers SET is_disabled = ?, updated_at = datetime('now','localtime') WHERE id = ?")
            .run(payload.disabled ? 1 : 0, payload.id);
        return true;
    });
    // --- SUPPLIERS ---
    ipcMain.handle('people:listSuppliers', function (_e, filters) {
        var _a, _b;
        var db = getDb();
        var _c = filters !== null && filters !== void 0 ? filters : {}, q = _c.q, _d = _c.page, page = _d === void 0 ? 1 : _d, limitOpt = _c.limit, _f = _c.includeDisabled, includeDisabled = _f === void 0 ? false : _f;
        var limit = limitOpt === 'all' ? null : (typeof limitOpt === 'number' && limitOpt > 0 ? limitOpt : 50);
        var offset = limit ? (page - 1) * limit : 0;
        var conds = [];
        var params = [];
        if (!includeDisabled)
            conds.push("is_disabled = 0");
        if (q) {
            conds.push("(name LIKE ? OR code LIKE ? OR phone LIKE ?)");
            params.push("%".concat(q, "%"), "%".concat(q, "%"), "%".concat(q, "%"));
        }
        var where = conds.length ? "WHERE ".concat(conds.join(' AND ')) : '';
        var limitClause = limit ? "LIMIT ? OFFSET ?" : '';
        var limitParams = limit ? [limit, offset] : [];
        var rows = (_a = db.prepare("SELECT * FROM suppliers ".concat(where, " ORDER BY ").concat(orderByBucket('name'), " ").concat(limitClause))).all.apply(_a, __spreadArray(__spreadArray([], params, false), limitParams, false));
        var total = (_b = db.prepare("SELECT COUNT(*) as c FROM suppliers ".concat(where))).get.apply(_b, params).c;
        return { rows: rows, total: total, page: page, limit: limit !== null && limit !== void 0 ? limit : total };
    });
    ipcMain.handle('people:saveSupplier', function (_e, data) {
        var db = getDb();
        if (data.id) {
            var id = data.id, rest = __rest(data, ["id"]);
            var fields = Object.keys(rest).map(function (k) { return "".concat(k, " = @").concat(k); }).join(', ');
            db.prepare("UPDATE suppliers SET ".concat(fields, ", updated_at = datetime('now','localtime') WHERE id = @id")).run(data);
            return db.prepare("SELECT * FROM suppliers WHERE id = ?").get(id);
        }
        var last = db.prepare("SELECT code FROM suppliers WHERE code LIKE 'S%' ORDER BY id DESC LIMIT 1").get();
        var nextNum = 1;
        if (last === null || last === void 0 ? void 0 : last.code)
            nextNum = parseInt(last.code.slice(1)) + 1;
        var code = "S".concat(String(nextNum).padStart(4, '0'));
        var result = db.prepare("\n      INSERT INTO suppliers (code, name, tax_id, phone, address)\n      VALUES (@code, @name, @tax_id, @phone, @address)\n    ").run(__assign({ code: code }, data));
        return db.prepare("SELECT * FROM suppliers WHERE id = ?").get(result.lastInsertRowid);
    });
    ipcMain.handle('people:setSupplierStatus', function (_e, payload) {
        getDb().prepare("UPDATE suppliers SET is_disabled = ?, updated_at = datetime('now','localtime') WHERE id = ?")
            .run(payload.disabled ? 1 : 0, payload.id);
        return true;
    });
    // --- STAFF ---
    ipcMain.handle('people:listStaff', function (_e, filters) {
        requireAdmin(_e);
        var _a = (filters !== null && filters !== void 0 ? filters : {}).includeDisabled, includeDisabled = _a === void 0 ? false : _a;
        var where = includeDisabled ? '' : "WHERE is_disabled = 0";
        return getDb().prepare("SELECT id, name, first_name, last_name, username, phone, email, role, is_disabled, created_at FROM users ".concat(where, " ORDER BY ").concat(orderByBucket('name'))).all();
    });
    ipcMain.handle('people:saveStaff', function (_e, data) {
        var _a, _b, _c, _d, _f, _g, _h, _j;
        requireAdmin(_e);
        var db = getDb();
        // Required identity fields. username is app-required (the column is nullable +
        // UNIQUE-indexed, so enforcement lives here, not in the schema).
        var email = String((_a = data.email) !== null && _a !== void 0 ? _a : '').trim();
        // Usernames are forced UPPERCASE, English alphanumerics + _ . - only (anything
        // else — Thai, spaces, symbols — is stripped). They're case-insensitive
        // identifiers, so this also makes the uniqueness check below case-insensitive
        // (SQLite's default text compare is case-sensitive) and avoids AUM/Aum/aum dupes.
        var username = String((_b = data.username) !== null && _b !== void 0 ? _b : '').trim().toUpperCase().replace(/[^A-Z0-9_.-]/g, '');
        if (!email)
            throw new Error('กรุณาระบุอีเมล');
        if (!username)
            throw new Error('กรุณาระบุชื่อผู้ใช้ (username)');
        // The owner admin's username is locked to 'ADMIN' (avoids confusion; admin
        // lookups elsewhere are email-keyed).
        var finalUsername = username;
        if (data.id) {
            var existing = db.prepare("SELECT email FROM users WHERE id = ?").get(data.id);
            if ((existing === null || existing === void 0 ? void 0 : existing.email) === 'admin@syntropic.local')
                finalUsername = 'ADMIN';
        }
        // Unique username (excluding self).
        var clash = db.prepare("SELECT id FROM users WHERE username = ? AND id <> ?").get(finalUsername, (_c = data.id) !== null && _c !== void 0 ? _c : 0);
        if (clash)
            throw new Error('ชื่อผู้ใช้นี้ถูกใช้แล้ว');
        // Compose the display name — users.name is NOT NULL and is what every report
        // join (sold_by_name / created_by_name / cashier) reads. Never let it be ''.
        var first = String((_d = data.first_name) !== null && _d !== void 0 ? _d : '').trim();
        var last = String((_f = data.last_name) !== null && _f !== void 0 ? _f : '').trim();
        var composedName = [first, last].filter(Boolean).join(' ').trim() || finalUsername || email.split('@')[0];
        // HARD: allow-list columns — never spread Object.keys(data) (footgun: a stray
        // key throws "no such column"; a renderer-supplied hash must never be trusted).
        // The renderer always sends plaintext; we hash here. `name` and `username` are
        // injected explicitly (composed / normalized), not taken from the allow-list.
        var ALLOWED = ['first_name', 'last_name', 'phone', 'role', 'is_disabled'];
        if (data.id) {
            var params = { id: data.id, name: composedName, username: finalUsername, email: email };
            var sets = ['name = @name', 'username = @username', 'email = @email'];
            for (var _i = 0, ALLOWED_1 = ALLOWED; _i < ALLOWED_1.length; _i++) {
                var k = ALLOWED_1[_i];
                if (k in data) {
                    sets.push("".concat(k, " = @").concat(k));
                    params[k] = data[k];
                }
            }
            // Password is conditional — only touched when a non-empty value is sent.
            if (data.password) {
                sets.push("password = @password");
                params.password = hashSecret(data.password);
            }
            db.prepare("UPDATE users SET ".concat(sets.join(', '), ", updated_at = datetime('now','localtime') WHERE id = @id")).run(params);
            return db.prepare("SELECT id, name, first_name, last_name, username, phone, email, role, is_disabled FROM users WHERE id = ?").get(data.id);
        }
        var result = db.prepare("INSERT INTO users (name, first_name, last_name, username, phone, email, password, role) VALUES (@name, @first_name, @last_name, @username, @phone, @email, @password, @role)").run({
            name: composedName,
            first_name: first,
            last_name: last,
            username: finalUsername,
            phone: (_g = data.phone) !== null && _g !== void 0 ? _g : null,
            email: email,
            password: hashSecret((_h = data.password) !== null && _h !== void 0 ? _h : ''),
            role: (_j = data.role) !== null && _j !== void 0 ? _j : 'staff',
        });
        return db.prepare("SELECT id, name, first_name, last_name, username, phone, email, role, is_disabled FROM users WHERE id = ?").get(result.lastInsertRowid);
    });
    ipcMain.handle('people:setStaffStatus', function (_e, payload) {
        requireAdmin(_e);
        getDb().prepare("UPDATE users SET is_disabled = ?, updated_at = datetime('now','localtime') WHERE id = ?")
            .run(payload.disabled ? 1 : 0, payload.id);
        return true;
    });
    // Admin reset of another staff member's password (no current-password check —
    // that's the self-service auth:changePassword flow). Hashing happens here; the
    // renderer only ever sends plaintext.
    ipcMain.handle('people:resetStaffPassword', function (_e, payload) {
        var _a;
        requireAdmin(_e);
        var pw = String((_a = payload === null || payload === void 0 ? void 0 : payload.password) !== null && _a !== void 0 ? _a : '');
        if (pw.length < 4)
            throw new Error('รหัสผ่านใหม่ต้องมีอย่างน้อย 4 ตัวอักษร');
        var res = getDb()
            .prepare("UPDATE users SET password = ?, updated_at = datetime('now','localtime') WHERE id = ?")
            .run(hashSecret(pw), payload.id);
        if (res.changes === 0)
            throw new Error('ไม่พบพนักงาน');
        return true;
    });
    // All suppliers (for dropdowns) — always filters disabled.
    ipcMain.handle('people:allSuppliers', function () {
        return getDb().prepare("SELECT id, code, name FROM suppliers WHERE is_disabled = 0 ORDER BY ".concat(orderByBucket('name'))).all();
    });
}
