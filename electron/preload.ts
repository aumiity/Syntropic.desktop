import { contextBridge, ipcRenderer } from 'electron'

// Electron ห่อ error จาก main เป็น "Error invoking remote method 'X': Error: <ของจริง>".
// ครอบ invoke ทุกครั้งตรงนี้จุดเดียว เพื่อตัด prefix สองชั้นนั้นออกให้เหลือแค่ข้อความ
// ภาษาไทยที่ผู้ใช้อ่านรู้เรื่อง — ทุก toast/หน้าจอทั้งแอปได้ผลโดยไม่ต้องไล่แก้ทีละจุด.
const invoke = (channel: string, ...args: any[]) =>
  ipcRenderer.invoke(channel, ...args).catch((e: any) => {
    const msg = String(e?.message ?? '')
      .replace(/^Error invoking remote method '[^']*':\s*/, '')
      .replace(/^Error:\s*/, '')
    throw new Error(msg)
  })

const api = {
  // POS
  pos: {
    searchProducts: (q: string) => invoke('pos:searchProducts', q),
    getProductsByIds: (ids: number[]) => invoke('pos:getProductsByIds', ids),
    searchCustomers: (q: string) => invoke('pos:searchCustomers', q),
    saveBill: (payload: any) => invoke('pos:saveBill', payload),
    getDailyStats: () => invoke('pos:getDailyStats'),
    returnItems: (payload: any) => invoke('pos:returnItems', payload),
  },
  // Products
  products: {
    list: (filters: any) => invoke('products:list', filters),
    lowStock: (filters: any) => invoke('products:lowStock', filters),
    get: (id: number) => invoke('products:get', id),
    create: (data: any) => invoke('products:create', data),
    update: (id: number, data: any) => invoke('products:update', id, data),
    updatePrice: (id: number, data: { price_type?: 'retail' | 'wholesale1' | 'wholesale2'; new_price: number; note?: string }, override?: { userId: number; password: string }) => invoke('products:updatePrice', id, data, override),
    updateUnitPrice: (productUnitId: number, data: { price_retail?: number; price_wholesale1?: number; price_wholesale2?: number }, override?: { userId: number; password: string }) =>
      invoke('products:updateUnitPrice', productUnitId, data, override),
    priceHistory: (id: number, limit?: number) => invoke('products:priceHistory', id, limit),
    stockMovements: (productId: number, opts?: {
      page?: number; pageSize?: number;
      movement_types?: string[]; date_from?: string; date_to?: string;
      sort_dir?: 'asc' | 'desc'
    }) => invoke('products:stockMovements', productId, opts),
    adjustStock: (productId: number, data: any, override?: { userId: number; password: string }) => invoke('products:adjustStock', productId, data, override),
    addUnit: (data: any) => invoke('products:addUnit', data),
    updateUnit: (id: number, data: any) => invoke('products:updateUnit', id, data),
    deleteUnit: (id: number) => invoke('products:deleteUnit', id),
    getLabels: (productId: number) => invoke('products:getLabels', productId),
    saveLabel: (data: any) => invoke('products:saveLabel', data),
    deleteLabel: (id: number) => invoke('products:deleteLabel', id),
    searchGenericNames: (q: string) => invoke('products:searchGenericNames', q),
    getLots: (productId: number) => invoke('products:getLots', productId),
    monthlySales: (productId: number) => invoke('products:monthlySales', productId),
    getBundleItems: (bundleId: number) => invoke('products:getBundleItems', bundleId),
    saveBundleItems: (bundleId: number, items: Array<{ component_product_id: number; qty_per_bundle: number }>) =>
      invoke('products:saveBundleItems', bundleId, items),
    createBundle: (payload: { product: any; items: Array<{ component_product_id: number; qty_per_bundle: number }> }) =>
      invoke('products:createBundle', payload),
    adjustLot: (payload: { product_id: number; qty: number; note?: string; user_id: number }, override?: { userId: number; password: string }) =>
      invoke('products:adjustLot', payload, override),
    adjustLotBatch: (payload: {
      items: Array<{ product_id: number; lot_id: number; qty: number }>
      reason: string
      user_id: number
    }, override?: { userId: number; password: string }) => invoke('products:adjustLotBatch', payload, override),
    updateLot: (id: number, data: any, override?: { userId: number; password: string }) => invoke('products:updateLot', id, data, override),
    expireLot: (lotId: number, userId: number, override?: { userId: number; password: string }) => invoke('products:expireLot', lotId, userId, override),
    stockStats: (filters: { q?: string; category_id?: number; drug_type_id?: number; include_disabled?: boolean; is_bundle?: 0 | 1 }) =>
      invoke('products:stockStats', filters),
  },
  // Purchase
  purchase: {
    nextGRNumber: () => invoke('purchase:nextGRNumber'),
    save: (payload: any) => invoke('purchase:save', payload),
    history: (filters: any) => invoke('purchase:history', filters),
    getReceipt: (invoiceNo: string) => invoke('purchase:getReceipt', invoiceNo),
    cancel: (payload: { invoice_no: string; reason: string; userId: number }, override?: { userId: number; password: string }) =>
      invoke('purchase:cancel', payload, override),
    updateHeader: (payload: any) => invoke('purchase:updateHeader', payload),
  },
  // People
  people: {
    listCustomers: (filters: any) => invoke('people:listCustomers', filters),
    getCustomer: (id: number) => invoke('people:getCustomer', id),
    saveCustomer: (data: any) => invoke('people:saveCustomer', data),
    setCustomerStatus: (id: number, disabled: boolean) => invoke('people:setCustomerStatus', { id, disabled }),
    listSuppliers: (filters: any) => invoke('people:listSuppliers', filters),
    saveSupplier: (data: any) => invoke('people:saveSupplier', data),
    setSupplierStatus: (id: number, disabled: boolean) => invoke('people:setSupplierStatus', { id, disabled }),
    listStaff: (filters?: any) => invoke('people:listStaff', filters),
    saveStaff: (data: any) => invoke('people:saveStaff', data),
    setStaffStatus: (id: number, disabled: boolean) => invoke('people:setStaffStatus', { id, disabled }),
    resetStaffPassword: (id: number, password: string) => invoke('people:resetStaffPassword', { id, password }),
    allSuppliers: () => invoke('people:allSuppliers'),
  },
  // Reports
  reports: {
    salesList: (filters: any) => invoke('reports:salesList', filters),
    getSale: (id: number) => invoke('reports:getSale', id),
    getSaleByInvoice: (invoiceNo: string) => invoke('reports:getSaleByInvoice', invoiceNo),
    voidSale: (id: number, reason: string, override?: { userId: number; password: string }) => invoke('reports:voidSale', id, reason, override),
    updateSaleCustomer: (p: { sale_id: number; customer_id: number }, override?: { userId: number; password: string }) => invoke('reports:updateSaleCustomer', p, override),
    expiringLots: (filters: any) => invoke('reports:expiringLots', filters),
    financeSummary: (filters: any) => invoke('reports:financeSummary', filters),
    salesPurchaseTrend: (filters: any) => invoke('reports:salesPurchaseTrend', filters),
    accountsPayable: () => invoke('reports:accountsPayable'),
    khorYor9: (filters: { date_from?: string; date_to?: string }) => invoke('reports:khorYor9', filters),
    khorYorSale: (filters: { form: 10 | 11; date_from?: string; date_to?: string }) => invoke('reports:khorYorSale', filters),
    topProducts:        (filters: any) => invoke('reports:topProducts', filters),
    topSuppliers:       (filters: any) => invoke('reports:topSuppliers', filters),
    hourlyTraffic:      (filters: any) => invoke('reports:hourlyTraffic', filters),
    cashierLeaderboard: (filters: any) => invoke('reports:cashierLeaderboard', filters),
    salesStats:         (filters: any) => invoke('reports:salesStats', filters),
    vatSummary:         (filters: any) => invoke('reports:vatSummary', filters),
    inactiveProducts:   (filters: any) => invoke('reports:inactiveProducts', filters),
    inactiveCounts:     () => invoke('reports:inactiveCounts'),
    productVelocity:    (filters: any) => invoke('reports:productVelocity', filters),
  },
  // Environmental log (อุณหภูมิ–ความชื้น)
  env: {
    getMonth: (p: { year: number; month: number }) => invoke('env:getMonth', p),
    saveCell: (p: { log_date: string; period: number; field: string; value: any }) => invoke('env:saveCell', p),
    generateMonth: (p: { year: number; month: number; mode?: 'fill-empty' | 'all' }) => invoke('env:generateMonth', p),
    getSettings: () => invoke('env:getSettings'),
    setZones: (p: { zone_reserve_enabled: number; zone_fridge_enabled: number }) => invoke('env:setZones', p),
    saveSettings: (data: any) => invoke('env:saveSettings', data),
  },
  // Settings
  settings: {
    getShop: () => invoke('settings:getShop'),
    saveShop: (data: any) => invoke('settings:saveShop', data),
    completeSetup: (data: any) => invoke('settings:completeSetup', data),
    listCategories: () => invoke('settings:listCategories'),
    saveCategory: (data: any) => invoke('settings:saveCategory', data),
    reorderCategories: (ids: number[]) => invoke('settings:reorderCategories', ids),
    listUnits: () => invoke('settings:listUnits'),
    saveUnit: (data: any) => invoke('settings:saveUnit', data),
    deleteUnit: (id: number) => invoke('settings:deleteUnit', id),
    listDrugTypes: () => invoke('settings:listDrugTypes'),
    countUnclassifiedDrugs: () => invoke('settings:countUnclassifiedDrugs') as Promise<number>,
    saveDrugType: (data: any) => invoke('settings:saveDrugType', data),
    getLabelSettings: () => invoke('settings:getLabelSettings'),
    saveLabelSettings: (data: any) => invoke('settings:saveLabelSettings', data),
    getSalesSettings: () => invoke('settings:getSalesSettings'),
    saveSalesSettings: (data: any) => invoke('settings:saveSalesSettings', data),
    upgradeToVat: (data: any) => invoke('settings:upgradeToVat', data),
    downgradeFromVat: (data: any) => invoke('settings:downgradeFromVat', data),
    hasVatHistory: () => invoke('settings:hasVatHistory'),
    getReceiptSettings: () => invoke('settings:getReceiptSettings'),
    saveReceiptSettings: (data: any) => invoke('settings:saveReceiptSettings', data),
    getDocumentSettings: () => invoke('settings:getDocumentSettings'),
    saveDocumentSettings: (data: any) => invoke('settings:saveDocumentSettings', data),
    getBarcodeStickerSettings: () => invoke('settings:getBarcodeStickerSettings'),
    saveBarcodeStickerSettings: (data: any) => invoke('settings:saveBarcodeStickerSettings', data),
    getPriceTagSettings: () => invoke('settings:getPriceTagSettings'),
    savePriceTagSettings: (data: any) => invoke('settings:savePriceTagSettings', data),
    listLabelFrequencies: () => invoke('settings:listLabelFrequencies'),
    listLabelDosages: () => invoke('settings:listLabelDosages'),
    listLabelMealRelations: () => invoke('settings:listLabelMealRelations'),
    listLabelTimes: () => invoke('settings:listLabelTimes'),
    listLabelAdvices: () => invoke('settings:listLabelAdvices'),
    saveLabelLookup: (data: any) => invoke('settings:saveLabelLookup', data),
    labelLookupRefs: (data: any) => invoke('settings:labelLookupRefs', data),
    reassignLabelLookup: (data: any) => invoke('settings:reassignLabelLookup', data),
    deleteLabelLookup: (data: any) => invoke('settings:deleteLabelLookup', data),
    listLabelPresets: () => invoke('settings:listLabelPresets'),
    saveLabelPreset: (data: any) => invoke('settings:saveLabelPreset', data),
    deleteLabelPreset: (id: number) => invoke('settings:deleteLabelPreset', id),
    allUnits: () => invoke('settings:allUnits'),
    allCategories: () => invoke('settings:allCategories'),
    allDrugTypes: () => invoke('settings:allDrugTypes'),
    allDosageForms: () => invoke('settings:allDosageForms'),
    getThemeColors: () => invoke('settings:getThemeColors'),
    saveThemeColors: (payload: Array<{ token: string; light: string; dark: string }>) =>
      invoke('settings:saveThemeColors', payload),
    getThemeFontSize: () => invoke('settings:getThemeFontSize'),
    saveThemeFontSize: (fontSize: string) => invoke('settings:saveThemeFontSize', fontSize),
    getThemeFonts: () => invoke('settings:getThemeFonts'),
    saveThemeFonts: (payload: { latin: string; thai: string }) =>
      invoke('settings:saveThemeFonts', payload),
  },
  // Printer
  printer: {
    printReceipt: (data: any) => invoke('printer:printReceipt', data),
    openCashDrawer: (data: any) => invoke('printer:openCashDrawer', data),
    listPrinters: () => invoke('printer:listPrinters') as Promise<Array<{
      name: string; displayName: string; description: string; status: number; isDefault: boolean
    }>>,
    printLabel: (args: { html: string; printerName: string; paperWidthMm: number; paperHeightMm: number }) =>
      invoke('printer:printLabel', args) as Promise<{ success: boolean; error?: string; path?: string }>,
    previewLabelPdf: (args: { html: string; paperWidthMm: number; paperHeightMm: number }) =>
      invoke('printer:previewLabelPdf', args) as Promise<{ success: boolean; error?: string; path?: string }>,
    printHtml: (args: { html: string; printerName: string; paperWidthMm: number; heightMm?: number | 'auto'; copies?: number }) =>
      invoke('printer:printHtml', args) as Promise<{ success: boolean; error?: string; path?: string }>,
    previewHtmlPdf: (args: { html: string; paperWidthMm?: number; heightMm?: number | 'auto'; pageFormat?: 'A4' | 'A5' }) =>
      invoke('printer:previewHtmlPdf', args) as Promise<{ success: boolean; error?: string; path?: string }>,
    // Silent print of a full-page A4/A5 document with explicit orientation —
    // used by the ขย. reports to force landscape on a portrait-configured printer.
    printDocument: (args: { html: string; printerName: string; pageFormat?: 'A4' | 'A5'; landscape?: boolean; copies?: number }) =>
      invoke('printer:printDocument', args) as Promise<{ success: boolean; error?: string; path?: string }>,
  },
  // Tax invoices (ใบกำกับภาษีเต็มรูป)
  tax: {
    get: (saleId: number) => invoke('tax:get', saleId),
    issueOrGet: (payload: {
      sale_id: number
      buyer_name: string
      buyer_address: string
      buyer_tax_id?: string
      buyer_branch?: string
      issued_by?: number | null
    }) => invoke('tax:issueOrGet', payload),
    confirmOriginalPrinted: (saleId: number) => invoke('tax:confirmOriginalPrinted', saleId),
  },
  // Window controls
  window: {
    minimize: () => invoke('window:minimize'),
    maximize: () => invoke('window:maximize'),
    close: () => invoke('window:close'),
    isMaximized: () => invoke('window:isMaximized'),
    setSize: (width: number, height: number) => invoke('window:setSize', width, height),
  },
  // App
  app: {
    getVersion: () => invoke('app:getVersion'),
  },
  // Invoice Matcher
  matcher: {
    matchLines: (supplierId: number, lines: string[]) =>
      invoke('matcher:matchLines', supplierId, lines),
    saveAliases: (
      rows: Array<{
        supplierId: number; supplierText: string; productId: number
        confidence?: number; confirmedBy?: number
      }>,
    ) => invoke('matcher:saveAliases', rows),
    listAliases: (supplierId: number) =>
      invoke('matcher:listAliases', supplierId),
    exportCSV: (
      rows: Array<{ barcode: string; qty: number | string; expiry: string; lineTotal: number | string }>,
    ) => invoke('matcher:exportCSV', rows),
  },
  // Database backup / export / restore
  backup: {
    export: () =>
      invoke('backup:export') as Promise<{ ok: boolean; path?: string; canceled?: boolean; error?: string }>,
    restore: () =>
      invoke('backup:restore') as Promise<{ ok: boolean; canceled?: boolean; error?: string }>,
    getSettings: () =>
      invoke('backup:getSettings') as Promise<{
        id: number; auto_enabled: number; retention_count: number
        backup_dir: string | null; last_auto_backup_at: string | null; default_dir: string
      }>,
    saveSettings: (s: { auto_enabled: boolean; retention_count: number }) =>
      invoke('backup:saveSettings', s) as Promise<{
        id: number; auto_enabled: number; retention_count: number
        backup_dir: string | null; last_auto_backup_at: string | null; default_dir: string
      }>,
    pickFolder: () =>
      invoke('backup:pickFolder') as Promise<{ ok: boolean; path?: string; canceled?: boolean; error?: string }>,
    resetFolder: () =>
      invoke('backup:resetFolder') as Promise<{ ok: boolean; path: string }>,
    listAuto: () =>
      invoke('backup:listAuto') as Promise<
        Array<{ name: string; path: string; size: number; mtime: string }>
      >,
    openFolder: () =>
      invoke('backup:openFolder') as Promise<{ ok: boolean; error?: string }>,
  },
  // Negative-stock reconciliation
  negativeStock: {
    list: () => invoke('negativeStock:list'),
    count: () => invoke('negativeStock:count'),
    reconcile: (payload: { id: number; userId: number }) =>
      invoke('negativeStock:reconcile', payload),
    dismiss: (payload: { id: number; userId: number }) =>
      invoke('negativeStock:dismiss', payload),
  },
  // Shop expenses (ค่าใช้จ่าย)
  expenses: {
    list: (filters?: any) => invoke('expenses:list', filters),
    summary: (filters?: any) => invoke('expenses:summary', filters),
    save: (payload: any) => invoke('expenses:save', payload),
    delete: (id: number) => invoke('expenses:delete', id),
    listCategories: () => invoke('expenses:listCategories'),
    activeCategories: () => invoke('expenses:activeCategories'),
    saveCategory: (data: any) => invoke('expenses:saveCategory', data),
    reorderCategories: (ids: number[]) => invoke('expenses:reorderCategories', ids),
  },
  // Auth — login picker + password verify (no session persisted)
  auth: {
    listLoginUsers: () => invoke('auth:listLoginUsers'),
    login: (userId: number, password: string) => invoke('auth:login', { userId, password }),
    // DEV-only auto-login (no password) — main rejects when packaged. See auth.ts.
    devLogin: () => invoke('auth:devLogin') as Promise<{ id: number; name: string; role: string } | null>,
    // DEV-only role switcher — rebinds the caller's session role (main rejects when packaged). REMOVE before release.
    devSetRole: (role: string) => invoke('auth:devSetRole', { role }) as Promise<{ id: number; role: string } | null>,
    logout: () => invoke('auth:logout'),
    verifyAdmin: (override?: { userId: number; password: string }) =>
      invoke('auth:verifyAdmin', override) as Promise<{ ok: true }>,
    getMyProfile: () => invoke('auth:getMyProfile'),
    changePassword: (currentPassword: string, newPassword: string) =>
      invoke('auth:changePassword', { currentPassword, newPassword }) as Promise<{ ok: true }>,
    resetAdminPassword: (recoveryCode: string, newPassword: string) =>
      invoke('auth:resetAdminPassword', { recoveryCode, newPassword }) as Promise<{ recoveryCode: string }>,
  },
  // Dev (only registered when isDev=true in main.ts; will reject otherwise)
  dev: {
    seedSalesHistory: (days?: number) => invoke('dev:seedSalesHistory', { days }),
  },
}

contextBridge.exposeInMainWorld('api', api)

export type ElectronAPI = typeof api
