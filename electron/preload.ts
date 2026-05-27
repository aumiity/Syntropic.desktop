import { contextBridge, ipcRenderer } from 'electron'

const api = {
  // POS
  pos: {
    searchProducts: (q: string) => ipcRenderer.invoke('pos:searchProducts', q),
    searchCustomers: (q: string) => ipcRenderer.invoke('pos:searchCustomers', q),
    addCustomer: (data: any) => ipcRenderer.invoke('pos:addCustomer', data),
    saveBill: (payload: any) => ipcRenderer.invoke('pos:saveBill', payload),
    getDailyStats: () => ipcRenderer.invoke('pos:getDailyStats'),
    returnItems: (payload: any) => ipcRenderer.invoke('pos:returnItems', payload),
  },
  // Products
  products: {
    list: (filters: any) => ipcRenderer.invoke('products:list', filters),
    lowStock: (filters: any) => ipcRenderer.invoke('products:lowStock', filters),
    get: (id: number) => ipcRenderer.invoke('products:get', id),
    create: (data: any) => ipcRenderer.invoke('products:create', data),
    update: (id: number, data: any) => ipcRenderer.invoke('products:update', id, data),
    updatePrice: (id: number, data: { price_type?: 'retail' | 'wholesale1' | 'wholesale2'; new_price: number; note?: string }) => ipcRenderer.invoke('products:updatePrice', id, data),
    priceHistory: (id: number, limit?: number) => ipcRenderer.invoke('products:priceHistory', id, limit),
    stockMovements: (productId: number, opts?: {
      page?: number; pageSize?: number;
      movement_types?: string[]; date_from?: string; date_to?: string;
      sort_dir?: 'asc' | 'desc'
    }) => ipcRenderer.invoke('products:stockMovements', productId, opts),
    adjustStock: (productId: number, data: any) => ipcRenderer.invoke('products:adjustStock', productId, data),
    addUnit: (data: any) => ipcRenderer.invoke('products:addUnit', data),
    updateUnit: (id: number, data: any) => ipcRenderer.invoke('products:updateUnit', id, data),
    deleteUnit: (id: number) => ipcRenderer.invoke('products:deleteUnit', id),
    getLabels: (productId: number) => ipcRenderer.invoke('products:getLabels', productId),
    saveLabel: (data: any) => ipcRenderer.invoke('products:saveLabel', data),
    deleteLabel: (id: number) => ipcRenderer.invoke('products:deleteLabel', id),
    searchGenericNames: (q: string) => ipcRenderer.invoke('products:searchGenericNames', q),
    getLots: (productId: number) => ipcRenderer.invoke('products:getLots', productId),
    monthlySales: (productId: number) => ipcRenderer.invoke('products:monthlySales', productId),
    getBundleItems: (bundleId: number) => ipcRenderer.invoke('products:getBundleItems', bundleId),
    saveBundleItems: (bundleId: number, items: Array<{ component_product_id: number; qty_per_bundle: number }>) =>
      ipcRenderer.invoke('products:saveBundleItems', bundleId, items),
    createBundle: (payload: { product: any; items: Array<{ component_product_id: number; qty_per_bundle: number }> }) =>
      ipcRenderer.invoke('products:createBundle', payload),
    adjustLot: (payload: { product_id: number; qty: number; note?: string; user_id: number }) =>
      ipcRenderer.invoke('products:adjustLot', payload),
    adjustLotBatch: (payload: {
      items: Array<{ product_id: number; lot_id: number; qty: number }>
      reason: string
      user_id: number
    }) => ipcRenderer.invoke('products:adjustLotBatch', payload),
    updateLot: (id: number, data: any) => ipcRenderer.invoke('products:updateLot', id, data),
    expireLot: (lotId: number, userId: number) => ipcRenderer.invoke('products:expireLot', lotId, userId),
    stockStats: (filters: { q?: string; category_id?: number; drug_type_id?: number; include_disabled?: boolean; is_bundle?: 0 | 1 }) =>
      ipcRenderer.invoke('products:stockStats', filters),
  },
  // Purchase
  purchase: {
    nextGRNumber: () => ipcRenderer.invoke('purchase:nextGRNumber'),
    save: (payload: any) => ipcRenderer.invoke('purchase:save', payload),
    history: (filters: any) => ipcRenderer.invoke('purchase:history', filters),
    getReceipt: (invoiceNo: string) => ipcRenderer.invoke('purchase:getReceipt', invoiceNo),
    cancel: (payload: { invoice_no: string; reason: string; userId: number }) =>
      ipcRenderer.invoke('purchase:cancel', payload),
    updateHeader: (payload: any) => ipcRenderer.invoke('purchase:updateHeader', payload),
  },
  // People
  people: {
    listCustomers: (filters: any) => ipcRenderer.invoke('people:listCustomers', filters),
    getCustomer: (id: number) => ipcRenderer.invoke('people:getCustomer', id),
    saveCustomer: (data: any) => ipcRenderer.invoke('people:saveCustomer', data),
    setCustomerStatus: (id: number, disabled: boolean) => ipcRenderer.invoke('people:setCustomerStatus', { id, disabled }),
    listSuppliers: (filters: any) => ipcRenderer.invoke('people:listSuppliers', filters),
    saveSupplier: (data: any) => ipcRenderer.invoke('people:saveSupplier', data),
    setSupplierStatus: (id: number, disabled: boolean) => ipcRenderer.invoke('people:setSupplierStatus', { id, disabled }),
    listStaff: (filters?: any) => ipcRenderer.invoke('people:listStaff', filters),
    saveStaff: (data: any) => ipcRenderer.invoke('people:saveStaff', data),
    setStaffStatus: (id: number, disabled: boolean) => ipcRenderer.invoke('people:setStaffStatus', { id, disabled }),
    allSuppliers: () => ipcRenderer.invoke('people:allSuppliers'),
  },
  // Reports
  reports: {
    salesList: (filters: any) => ipcRenderer.invoke('reports:salesList', filters),
    getSale: (id: number) => ipcRenderer.invoke('reports:getSale', id),
    getSaleByInvoice: (invoiceNo: string) => ipcRenderer.invoke('reports:getSaleByInvoice', invoiceNo),
    voidSale: (id: number, reason: string) => ipcRenderer.invoke('reports:voidSale', id, reason),
    expiringLots: (filters: any) => ipcRenderer.invoke('reports:expiringLots', filters),
    financeSummary: (filters: any) => ipcRenderer.invoke('reports:financeSummary', filters),
    salesPurchaseTrend: (filters: any) => ipcRenderer.invoke('reports:salesPurchaseTrend', filters),
    accountsPayable: () => ipcRenderer.invoke('reports:accountsPayable'),
    khorYor9: (filters: { date_from?: string; date_to?: string }) => ipcRenderer.invoke('reports:khorYor9', filters),
    topProducts:        (filters: any) => ipcRenderer.invoke('reports:topProducts', filters),
    topSuppliers:       (filters: any) => ipcRenderer.invoke('reports:topSuppliers', filters),
    hourlyTraffic:      (filters: any) => ipcRenderer.invoke('reports:hourlyTraffic', filters),
    cashierLeaderboard: (filters: any) => ipcRenderer.invoke('reports:cashierLeaderboard', filters),
    salesStats:         (filters: any) => ipcRenderer.invoke('reports:salesStats', filters),
    inactiveProducts:   (filters: any) => ipcRenderer.invoke('reports:inactiveProducts', filters),
    productVelocity:    (filters: any) => ipcRenderer.invoke('reports:productVelocity', filters),
  },
  // Settings
  settings: {
    getShop: () => ipcRenderer.invoke('settings:getShop'),
    saveShop: (data: any) => ipcRenderer.invoke('settings:saveShop', data),
    listCategories: () => ipcRenderer.invoke('settings:listCategories'),
    saveCategory: (data: any) => ipcRenderer.invoke('settings:saveCategory', data),
    reorderCategories: (ids: number[]) => ipcRenderer.invoke('settings:reorderCategories', ids),
    listUnits: () => ipcRenderer.invoke('settings:listUnits'),
    saveUnit: (data: any) => ipcRenderer.invoke('settings:saveUnit', data),
    listDrugTypes: () => ipcRenderer.invoke('settings:listDrugTypes'),
    saveDrugType: (data: any) => ipcRenderer.invoke('settings:saveDrugType', data),
    getLabelSettings: () => ipcRenderer.invoke('settings:getLabelSettings'),
    saveLabelSettings: (data: any) => ipcRenderer.invoke('settings:saveLabelSettings', data),
    getSalesSettings: () => ipcRenderer.invoke('settings:getSalesSettings'),
    saveSalesSettings: (data: any) => ipcRenderer.invoke('settings:saveSalesSettings', data),
    listLabelFrequencies: () => ipcRenderer.invoke('settings:listLabelFrequencies'),
    listLabelDosages: () => ipcRenderer.invoke('settings:listLabelDosages'),
    listLabelMealRelations: () => ipcRenderer.invoke('settings:listLabelMealRelations'),
    listLabelTimes: () => ipcRenderer.invoke('settings:listLabelTimes'),
    listLabelAdvices: () => ipcRenderer.invoke('settings:listLabelAdvices'),
    allUnits: () => ipcRenderer.invoke('settings:allUnits'),
    allCategories: () => ipcRenderer.invoke('settings:allCategories'),
    allDrugTypes: () => ipcRenderer.invoke('settings:allDrugTypes'),
    allDosageForms: () => ipcRenderer.invoke('settings:allDosageForms'),
    getThemeColors: () => ipcRenderer.invoke('settings:getThemeColors'),
    saveThemeColors: (payload: Array<{ token: string; light: string; dark: string }>) =>
      ipcRenderer.invoke('settings:saveThemeColors', payload),
    getThemeFontSize: () => ipcRenderer.invoke('settings:getThemeFontSize'),
    saveThemeFontSize: (fontSize: string) => ipcRenderer.invoke('settings:saveThemeFontSize', fontSize),
    getThemeFonts: () => ipcRenderer.invoke('settings:getThemeFonts'),
    saveThemeFonts: (payload: { latin: string; thai: string }) =>
      ipcRenderer.invoke('settings:saveThemeFonts', payload),
  },
  // Printer
  printer: {
    printReceipt: (data: any) => ipcRenderer.invoke('printer:printReceipt', data),
    openCashDrawer: (data: any) => ipcRenderer.invoke('printer:openCashDrawer', data),
  },
  // Window controls
  window: {
    minimize: () => ipcRenderer.invoke('window:minimize'),
    maximize: () => ipcRenderer.invoke('window:maximize'),
    close: () => ipcRenderer.invoke('window:close'),
    isMaximized: () => ipcRenderer.invoke('window:isMaximized'),
    setSize: (width: number, height: number) => ipcRenderer.invoke('window:setSize', width, height),
  },
  // App
  app: {
    getVersion: () => ipcRenderer.invoke('app:getVersion'),
  },
  // Invoice Matcher
  matcher: {
    matchLines: (supplierId: number, lines: string[]) =>
      ipcRenderer.invoke('matcher:matchLines', supplierId, lines),
    saveAliases: (
      rows: Array<{
        supplierId: number; supplierText: string; productId: number
        confidence?: number; confirmedBy?: number
      }>,
    ) => ipcRenderer.invoke('matcher:saveAliases', rows),
    listAliases: (supplierId: number) =>
      ipcRenderer.invoke('matcher:listAliases', supplierId),
    exportCSV: (
      rows: Array<{ barcode: string; qty: number | string; expiry: string; lineTotal: number | string }>,
    ) => ipcRenderer.invoke('matcher:exportCSV', rows),
  },
  // Negative-stock reconciliation
  negativeStock: {
    list: () => ipcRenderer.invoke('negativeStock:list'),
    count: () => ipcRenderer.invoke('negativeStock:count'),
    reconcile: (payload: { id: number; userId: number }) =>
      ipcRenderer.invoke('negativeStock:reconcile', payload),
    dismiss: (payload: { id: number; userId: number }) =>
      ipcRenderer.invoke('negativeStock:dismiss', payload),
  },
  // Auth (placeholder until proper login)
  auth: {
    getCurrentUser: () => ipcRenderer.invoke('auth:getCurrentUser'),
  },
  // Dev (only registered when isDev=true in main.ts; will reject otherwise)
  dev: {
    seedSalesHistory: (days?: number) => ipcRenderer.invoke('dev:seedSalesHistory', { days }),
  },
}

contextBridge.exposeInMainWorld('api', api)

export type ElectronAPI = typeof api
