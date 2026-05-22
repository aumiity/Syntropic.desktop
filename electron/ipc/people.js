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
        var rows = (_a = db.prepare("SELECT * FROM suppliers ".concat(where, " ORDER BY name ").concat(limitClause))).all.apply(_a, __spreadArray(__spreadArray([], params, false), limitParams, false));
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
        var _a = (filters !== null && filters !== void 0 ? filters : {}).includeDisabled, includeDisabled = _a === void 0 ? false : _a;
        var where = includeDisabled ? '' : "WHERE is_disabled = 0";
        return getDb().prepare("SELECT id, name, email, role, is_disabled, created_at FROM users ".concat(where, " ORDER BY name")).all();
    });
    ipcMain.handle('people:saveStaff', function (_e, data) {
        var db = getDb();
        if (data.id) {
            var id = data.id, rest = __rest(data, ["id"]);
            var fields = Object.keys(rest).map(function (k) { return "".concat(k, " = @").concat(k); }).join(', ');
            db.prepare("UPDATE users SET ".concat(fields, ", updated_at = datetime('now','localtime') WHERE id = @id")).run(data);
            return db.prepare("SELECT id, name, email, role, is_disabled FROM users WHERE id = ?").get(id);
        }
        var result = db.prepare("INSERT INTO users (name, email, password, role) VALUES (@name, @email, @password, @role)").run(data);
        return db.prepare("SELECT id, name, email, role, is_disabled FROM users WHERE id = ?").get(result.lastInsertRowid);
    });
    ipcMain.handle('people:setStaffStatus', function (_e, payload) {
        getDb().prepare("UPDATE users SET is_disabled = ?, updated_at = datetime('now','localtime') WHERE id = ?")
            .run(payload.disabled ? 1 : 0, payload.id);
        return true;
    });
    // All suppliers (for dropdowns) — always filters disabled.
    ipcMain.handle('people:allSuppliers', function () {
        return getDb().prepare("SELECT id, code, name FROM suppliers WHERE is_disabled = 0 ORDER BY name").all();
    });
}
