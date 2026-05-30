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
import { ipcMain, BrowserWindow } from 'electron';
import net from 'net';
// ESC/POS constants
var ESC = 0x1b;
var GS = 0x1d;
function buildReceipt(data) {
    var encoder = new TextEncoder();
    var chunks = [];
    var push = function (text) { return chunks.push(encoder.encode(text)); };
    var pushBytes = function () {
        var bytes = [];
        for (var _i = 0; _i < arguments.length; _i++) {
            bytes[_i] = arguments[_i];
        }
        return chunks.push(new Uint8Array(bytes));
    };
    // Initialize, set Thai code page
    pushBytes(ESC, 0x40); // Init
    pushBytes(ESC, 0x74, 0x15); // Code page Thai
    // Center align
    pushBytes(ESC, 0x61, 0x01);
    push("".concat(data.shopName, "\n"));
    if (data.shopAddress)
        push("".concat(data.shopAddress, "\n"));
    if (data.shopPhone)
        push("".concat(data.shopPhone, "\n"));
    push('--------------------------------\n');
    // Left align
    pushBytes(ESC, 0x61, 0x00);
    push("\u0E40\u0E25\u0E02\u0E17\u0E35\u0E48: ".concat(data.invoiceNo, "\n"));
    push("\u0E27\u0E31\u0E19\u0E17\u0E35\u0E48: ".concat(data.soldAt, "\n"));
    if (data.customerName)
        push("\u0E25\u0E39\u0E01\u0E04\u0E49\u0E32: ".concat(data.customerName, "\n"));
    push('--------------------------------\n');
    for (var _i = 0, _a = data.items; _i < _a.length; _i++) {
        var item = _a[_i];
        var name_1 = item.name.substring(0, 20).padEnd(20, ' ');
        var qty = "".concat(item.qty);
        var price = item.price.toFixed(2);
        var total = item.total.toFixed(2).padStart(8, ' ');
        push("".concat(name_1, "\n"));
        push("  ".concat(qty, " x ").concat(price).concat(total, "\n"));
        if (item.discount > 0)
            push("  \u0E2A\u0E48\u0E27\u0E19\u0E25\u0E14: -".concat(item.discount.toFixed(2), "\n"));
    }
    push('--------------------------------\n');
    var subStr = data.subtotal.toFixed(2).padStart(8, ' ');
    push("\u0E22\u0E2D\u0E14\u0E23\u0E27\u0E21:".concat(subStr.padStart(25, ' '), "\n"));
    if (data.discount > 0) {
        var discStr = data.discount.toFixed(2).padStart(8, ' ');
        push("\u0E2A\u0E48\u0E27\u0E19\u0E25\u0E14:-".concat(discStr.padStart(24, ' '), "\n"));
    }
    // Double height for total
    pushBytes(ESC, 0x21, 0x10);
    var totalStr = data.total.toFixed(2).padStart(8, ' ');
    push("\u0E23\u0E27\u0E21\u0E17\u0E31\u0E49\u0E07\u0E2A\u0E34\u0E49\u0E19:".concat(totalStr.padStart(21, ' '), "\n"));
    pushBytes(ESC, 0x21, 0x00);
    if (data.cashAmount > 0) {
        push("\u0E23\u0E31\u0E1A\u0E40\u0E07\u0E34\u0E19:".concat(data.cashAmount.toFixed(2).padStart(24, ' '), "\n"));
        push("\u0E40\u0E07\u0E34\u0E19\u0E17\u0E2D\u0E19:".concat(data.changeAmount.toFixed(2).padStart(23, ' '), "\n"));
    }
    push('--------------------------------\n');
    // Center
    pushBytes(ESC, 0x61, 0x01);
    push('ขอบคุณที่ใช้บริการ\n');
    push('\n\n\n');
    // Cut
    pushBytes(GS, 0x56, 0x41, 0x10);
    var totalLen = chunks.reduce(function (a, c) { return a + c.length; }, 0);
    var result = new Uint8Array(totalLen);
    var offset = 0;
    for (var _b = 0, chunks_1 = chunks; _b < chunks_1.length; _b++) {
        var chunk = chunks_1[_b];
        result.set(chunk, offset);
        offset += chunk.length;
    }
    return Buffer.from(result);
}
export function registerPrinterHandlers() {
    var _this = this;
    ipcMain.handle('printer:printReceipt', function (_e, data) { return __awaiter(_this, void 0, void 0, function () {
        var buffer_1, err_1;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    _a.trys.push([0, 2, , 3]);
                    buffer_1 = buildReceipt(data);
                    // Send to printer via TCP (default ESC/POS network printer)
                    return [4 /*yield*/, new Promise(function (resolve, reject) {
                            var _a, _b;
                            var client = new net.Socket();
                            var host = (_a = data.printerHost) !== null && _a !== void 0 ? _a : '192.168.1.100';
                            var port = (_b = data.printerPort) !== null && _b !== void 0 ? _b : 9100;
                            client.connect(port, host, function () {
                                client.write(buffer_1, function () {
                                    client.destroy();
                                    resolve();
                                });
                            });
                            client.on('error', reject);
                            setTimeout(function () { client.destroy(); reject(new Error('timeout')); }, 5000);
                        })];
                case 1:
                    // Send to printer via TCP (default ESC/POS network printer)
                    _a.sent();
                    return [2 /*return*/, { success: true }];
                case 2:
                    err_1 = _a.sent();
                    return [2 /*return*/, { success: false, error: err_1.message }];
                case 3: return [2 /*return*/];
            }
        });
    }); });
    ipcMain.handle('printer:listPrinters', function (event) { return __awaiter(_this, void 0, void 0, function () {
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, event.sender.getPrintersAsync()];
                case 1: return [2 /*return*/, _a.sent()];
            }
        });
    }); });
    ipcMain.handle('printer:printLabel', function (_e, args) { return __awaiter(_this, void 0, void 0, function () {
        var w, e_1;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    if (!(args.paperWidthMm > 0) || !(args.paperHeightMm > 0)) {
                        return [2 /*return*/, { success: false, error: 'invalid paper size' }];
                    }
                    w = new BrowserWindow({ show: false, webPreferences: { offscreen: false } });
                    _a.label = 1;
                case 1:
                    _a.trys.push([1, 5, 6, 7]);
                    return [4 /*yield*/, w.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(args.html))
                        // Wait for webfonts + layout before printing, otherwise Electron may
                        // snapshot the page with the default font or pre-layout sizing.
                    ];
                case 2:
                    _a.sent();
                    // Wait for webfonts + layout before printing, otherwise Electron may
                    // snapshot the page with the default font or pre-layout sizing.
                    return [4 /*yield*/, w.webContents.executeJavaScript("\n        (async () => {\n          if (document.fonts && document.fonts.ready) { try { await document.fonts.ready } catch {} }\n          await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)))\n        })()\n      ")];
                case 3:
                    // Wait for webfonts + layout before printing, otherwise Electron may
                    // snapshot the page with the default font or pre-layout sizing.
                    _a.sent();
                    return [4 /*yield*/, new Promise(function (resolve, reject) {
                            w.webContents.print({
                                silent: true,
                                deviceName: args.printerName || undefined,
                                // Electron pageSize uses microns (1 mm = 1000 µm).
                                pageSize: { width: Math.round(args.paperWidthMm * 1000), height: Math.round(args.paperHeightMm * 1000) },
                                margins: { marginType: 'none' },
                                printBackground: false,
                                color: false,
                            }, function (success, failureReason) { return success ? resolve() : reject(new Error(failureReason)); });
                        })];
                case 4:
                    _a.sent();
                    return [2 /*return*/, { success: true }];
                case 5:
                    e_1 = _a.sent();
                    return [2 /*return*/, { success: false, error: e_1.message }];
                case 6:
                    w.destroy();
                    return [7 /*endfinally*/];
                case 7: return [2 /*return*/];
            }
        });
    }); });
    ipcMain.handle('printer:openCashDrawer', function (_e, data) { return __awaiter(_this, void 0, void 0, function () {
        var host_1, port_1, cmd_1, err_2;
        var _a, _b;
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0:
                    _c.trys.push([0, 2, , 3]);
                    host_1 = (_a = data.host) !== null && _a !== void 0 ? _a : '192.168.1.100';
                    port_1 = (_b = data.port) !== null && _b !== void 0 ? _b : 9100;
                    cmd_1 = Buffer.from([ESC, 0x70, 0x00, 0x19, 0xfa]);
                    return [4 /*yield*/, new Promise(function (resolve, reject) {
                            var client = new net.Socket();
                            client.connect(port_1, host_1, function () { client.write(cmd_1, function () { client.destroy(); resolve(); }); });
                            client.on('error', reject);
                            setTimeout(function () { client.destroy(); reject(new Error('timeout')); }, 3000);
                        })];
                case 1:
                    _c.sent();
                    return [2 /*return*/, { success: true }];
                case 2:
                    err_2 = _c.sent();
                    return [2 /*return*/, { success: false, error: err_2.message }];
                case 3: return [2 /*return*/];
            }
        });
    }); });
}
