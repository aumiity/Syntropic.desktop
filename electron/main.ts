import { app, BrowserWindow, shell, ipcMain } from 'electron'
import path from 'path'
import { closeDb, applyPendingRestore } from './db'
import { registerPosHandlers } from './ipc/pos'
import { registerProductHandlers } from './ipc/products'
import { registerPurchaseHandlers } from './ipc/purchase'
import { registerPeopleHandlers } from './ipc/people'
import { registerReportHandlers } from './ipc/reports'
import { registerEnvHandlers } from './ipc/env'
import { registerSettingsHandlers } from './ipc/settings'
import { registerPrinterHandlers } from './ipc/printer'
import { registerTaxHandlers } from './ipc/tax'
import { registerAuthHandlers } from './ipc/auth'
import { registerPermissionHandlers } from './ipc/permissions'
import { registerDevHandlers } from './ipc/dev'
import { registerMatcherHandlers } from './ipc/matcher'
import { registerNegativeStockHandlers } from './ipc/negativeStock'
import { registerExpenseHandlers } from './ipc/expenses'
import { registerExportHandlers } from './ipc/exports'
import { registerBackupHandlers, runCloseBackup, scheduleDailyBackup } from './ipc/backup'
import { clearSessionById } from './auth/session'

const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged

let mainWindow: BrowserWindow | null = null

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1440,
    minHeight: 800,
    title: 'Rx Desktop',
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

  // Drop the main-side session whenever the renderer reloads / navigates the
  // main frame or is torn down — a fresh page must start unauthenticated so a
  // stale role can never be replayed (matches the renderer no-persist model).
  const wc = mainWindow.webContents
  const senderId = wc.id
  wc.on('destroyed', () => clearSessionById(senderId))
  wc.on('did-start-navigation', (details) => {
    if (details.isMainFrame && !details.isSameDocument) clearSessionById(senderId)
  })
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
registerEnvHandlers()
registerSettingsHandlers()
registerPrinterHandlers()
registerTaxHandlers()
registerAuthHandlers()
registerPermissionHandlers()
registerMatcherHandlers()
registerNegativeStockHandlers()
registerExpenseHandlers()
registerExportHandlers()
registerBackupHandlers()
if (isDev) registerDevHandlers()

// App event
ipcMain.handle('app:getVersion', () => app.getVersion())

app.whenReady().then(() => {
  // Swap in a restored database BEFORE getDb() opens anything (no-op if none pending).
  applyPendingRestore()
  createWindow()
  // Daily 00:00 backup — only fires if the app is left running across midnight.
  scheduleDailyBackup()
})

app.on('window-all-closed', () => {
  // The on-quit backup + closeDb run in before-quit; here we only trigger quit
  // on non-mac so that flow runs once.
  if (process.platform !== 'darwin') app.quit()
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow()
})

// Back up the end-of-session state, then release the DB. runCloseBackup is sync
// (VACUUM INTO) so it completes before the process exits; it self-guards to run once.
app.on('before-quit', () => {
  runCloseBackup()
  closeDb()
})
