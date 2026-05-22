var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g = Object.create((typeof Iterator === "function" ? Iterator : Object).prototype);
    return g.next = verb(0), g["throw"] = verb(1), g["return"] = verb(2), typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (g && (g = 0, op[0] && (_ = 0)), _) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
import { ipcMain, dialog } from 'electron';
import fs from 'fs';
import dayjs from 'dayjs';
import { getDb } from '../db';
import { matchLines, buildCsv, normalize } from '../services/matcher';
export function registerMatcherHandlers() {
    var _this = this;
    // Match pasted invoice lines against the product master.
    ipcMain.handle('matcher:matchLines', function (_e, supplierId, lines) {
        return matchLines(getDb(), supplierId, lines !== null && lines !== void 0 ? lines : []);
    });
    // Bulk upsert human-confirmed aliases. supplier_text is normalized here so
    // the stored key always matches the lookup key.
    ipcMain.handle('matcher:saveAliases', function (_e, rows) {
        var db = getDb();
        var stmt = db.prepare("INSERT INTO supplier_product_alias\n           (supplier_id, supplier_text, product_id, confidence, confirmed_by)\n         VALUES (@supplier_id, @supplier_text, @product_id, @confidence, @confirmed_by)\n         ON CONFLICT(supplier_id, supplier_text) DO UPDATE SET\n           product_id   = excluded.product_id,\n           confidence   = excluded.confidence,\n           confirmed_by = excluded.confirmed_by,\n           confirmed_at = datetime('now','localtime')");
        var tx = db.transaction(function (items) {
            var _a, _b, _c;
            for (var _i = 0, items_1 = items; _i < items_1.length; _i++) {
                var r = items_1[_i];
                var text = normalize((_a = r.supplierText) !== null && _a !== void 0 ? _a : '');
                if (!text || !r.supplierId || !r.productId)
                    continue;
                stmt.run({
                    supplier_id: r.supplierId,
                    supplier_text: text,
                    product_id: r.productId,
                    confidence: (_b = r.confidence) !== null && _b !== void 0 ? _b : 1.0,
                    confirmed_by: (_c = r.confirmedBy) !== null && _c !== void 0 ? _c : null,
                });
            }
        });
        tx(rows !== null && rows !== void 0 ? rows : []);
        return { ok: true };
    });
    // Management / debug: list a supplier's aliases.
    ipcMain.handle('matcher:listAliases', function (_e, supplierId) {
        return getDb()
            .prepare("SELECT a.id, a.supplier_text, a.product_id, a.confidence,\n                a.confirmed_at, p.trade_name, p.code\n           FROM supplier_product_alias a\n           JOIN products p ON p.id = a.product_id\n          WHERE a.supplier_id = ?\n          ORDER BY a.confirmed_at DESC")
            .all(supplierId);
    });
    // Write the Power Automate CSV to a user-chosen location.
    ipcMain.handle('matcher:exportCSV', function (_e, rows) { return __awaiter(_this, void 0, void 0, function () {
        var csv, _a, canceled, filePath, BOM;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0:
                    csv = buildCsv(rows !== null && rows !== void 0 ? rows : []);
                    return [4 /*yield*/, dialog.showSaveDialog({
                            title: 'ส่งออก CSV สำหรับ Power Automate',
                            defaultPath: "intake-".concat(dayjs().format('YYYYMMDD-HHmmss'), ".csv"),
                            filters: [{ name: 'CSV', extensions: ['csv'] }],
                        })];
                case 1:
                    _a = _b.sent(), canceled = _a.canceled, filePath = _a.filePath;
                    if (canceled || !filePath)
                        return [2 /*return*/, { ok: false, canceled: true }
                            // UTF-8 BOM so Excel on Windows reads Thai + leading-zero lots correctly.
                        ];
                    BOM = Buffer.from([0xef, 0xbb, 0xbf]);
                    fs.writeFileSync(filePath, Buffer.concat([BOM, Buffer.from(csv, 'utf8')]));
                    return [2 /*return*/, { ok: true, path: filePath }];
            }
        });
    }); });
}
