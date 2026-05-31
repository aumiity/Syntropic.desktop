import { app, BrowserWindow, shell, ipcMain } from 'electron'
import path from 'path'
import { closeDb } from './db'
import { registerPosHandlers } from './ipc/pos'
import { registerProductHandlers } from './ipc/products'
import { registerPurchaseHandlers } from './ipc/purchase'
import { registerPeopleHandlers } from './ipc/people'
import { registerReportHandlers } from './ipc/reports'
import { registerSettingsHandlers } from './ipc/settings'
import { registerPrinterHandlers } from './ipc/printer'
import { registerTaxHandlers } from './ipc/tax'
import { registerAuthHandlers } from './ipc/auth'
import { registerDevHandlers } from './ipc/dev'
import { registerMatcherHandlers } from './ipc/matcher'
import { registerNegativeStockHandlers } from './ipc/negativeStock'

const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged

let mainWindow: BrowserWindow | null = null

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
  })

  if (isDev) {
    mainWindow.loadURL('http://localhost:5173')
    mainWindow.webContents.openDevTools()
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'))
  }

  mainWindow.once('ready-to-show', () => mainWindow?.show())

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })

  mainWindow.on('closed', () => { mainWindow = null })
}

// Window control IPC
ipcMain.handle('window:minimize', () => mainWindow?.minimize())
ipcMain.handle('window:maximize', () => {
  if (mainWindow?.isMaximized()) mainWindow.unmaximize()
  else mainWindow?.maximize()
})
ipcMain.handle('window:close', () => mainWindow?.close())
ipcMain.handle('window:isMaximized', () => mainWindow?.isMaximized() ?? false)
ipcMain.handle('window:setSize', (_e, width: number, height: number) => {
  if (!mainWindow) return
  if (mainWindow.isMaximized()) mainWindow.unmaximize()
  mainWindow.setSize(Math.round(width), Math.round(height))
  mainWindow.center()
})

// Register all IPC handlers
registerPosHandlers()
registerProductHandlers()
registerPurchaseHandlers()
registerPeopleHandlers()
registerReportHandlers()
registerSettingsHandlers()
registerPrinterHandlers()
registerTaxHandlers()
registerAuthHandlers()
registerMatcherHandlers()
registerNegativeStockHandlers()
if (isDev) registerDevHandlers()

// App event
ipcMain.handle('app:getVersion', () => app.getVersion())

app.whenReady().then(createWindow)

app.on('window-all-closed', () => {
  closeDb()
  if (process.platform !== 'darwin') app.quit()
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow()
})

app.on('before-quit', () => closeDb())
