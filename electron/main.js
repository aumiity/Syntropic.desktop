import { app, BrowserWindow, shell, ipcMain } from 'electron';
import path from 'path';
import { closeDb } from './db';
import { registerPosHandlers } from './ipc/pos';
import { registerProductHandlers } from './ipc/products';
import { registerPurchaseHandlers } from './ipc/purchase';
import { registerPeopleHandlers } from './ipc/people';
import { registerReportHandlers } from './ipc/reports';
import { registerSettingsHandlers } from './ipc/settings';
import { registerPrinterHandlers } from './ipc/printer';
import { registerTaxHandlers } from './ipc/tax';
import { registerAuthHandlers } from './ipc/auth';
import { registerDevHandlers } from './ipc/dev';
import { registerMatcherHandlers } from './ipc/matcher';
import { registerNegativeStockHandlers } from './ipc/negativeStock';
var isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;
var mainWindow = null;
function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1400,
        height: 900,
        minWidth: 1366,
        minHeight: 800,
        title: 'Syntropic RX',
        backgroundColor: '#065f46',
        frame: false,
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            contextIsolation: true,
            nodeIntegration: false,
            sandbox: false,
        },
        show: false,
    });
    if (isDev) {
        mainWindow.loadURL('http://localhost:5173');
        mainWindow.webContents.openDevTools();
    }
    else {
        mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
    }
    mainWindow.once('ready-to-show', function () { return mainWindow === null || mainWindow === void 0 ? void 0 : mainWindow.show(); });
    mainWindow.webContents.setWindowOpenHandler(function (_a) {
        var url = _a.url;
        shell.openExternal(url);
        return { action: 'deny' };
    });
    mainWindow.on('closed', function () { mainWindow = null; });
}
// Window control IPC
ipcMain.handle('window:minimize', function () { return mainWindow === null || mainWindow === void 0 ? void 0 : mainWindow.minimize(); });
ipcMain.handle('window:maximize', function () {
    if (mainWindow === null || mainWindow === void 0 ? void 0 : mainWindow.isMaximized())
        mainWindow.unmaximize();
    else
        mainWindow === null || mainWindow === void 0 ? void 0 : mainWindow.maximize();
});
ipcMain.handle('window:close', function () { return mainWindow === null || mainWindow === void 0 ? void 0 : mainWindow.close(); });
ipcMain.handle('window:isMaximized', function () { var _a; return (_a = mainWindow === null || mainWindow === void 0 ? void 0 : mainWindow.isMaximized()) !== null && _a !== void 0 ? _a : false; });
ipcMain.handle('window:setSize', function (_e, width, height) {
    if (!mainWindow)
        return;
    if (mainWindow.isMaximized())
        mainWindow.unmaximize();
    mainWindow.setSize(Math.round(width), Math.round(height));
    mainWindow.center();
});
// Register all IPC handlers
registerPosHandlers();
registerProductHandlers();
registerPurchaseHandlers();
registerPeopleHandlers();
registerReportHandlers();
registerSettingsHandlers();
registerPrinterHandlers();
registerTaxHandlers();
registerAuthHandlers();
registerMatcherHandlers();
registerNegativeStockHandlers();
if (isDev)
    registerDevHandlers();
// App event
ipcMain.handle('app:getVersion', function () { return app.getVersion(); });
app.whenReady().then(createWindow);
app.on('window-all-closed', function () {
    closeDb();
    if (process.platform !== 'darwin')
        app.quit();
});
app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0)
        createWindow();
});
app.on('before-quit', function () { return closeDb(); });
