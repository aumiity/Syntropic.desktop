import { contextBridge, ipcRenderer } from 'electron'

const api = {
  // POS
  pos: {
    searchProducts: (q: string) => ipcRenderer.invoke('pos:searchProducts', q),
    searchCustomers: (q: string) => ipcRenderer.invoke('pos:searchCustomers', q),
    addCustomer: (data: any) => ipcRenderer.invoke('pos:addCustomer', data),
    saveBill: (payload: any) => ipcRenderer.invoke('pos:saveBill', payload),
    getDailyStats: () => ipcRenderer.invoke('pos:getDailyStats'),
  },
  // Products
  products: {
    list: (filters: any) => ipcRenderer.invoke('products:list', filters),
    get: (id: number) => ipcRenderer.invoke('products:get', id),
    create: (data: any) => ipcRenderer.invoke('products:create', data),
    update: (id: number, data: any) => ipcRenderer.invoke('products:update', id, data),
    updatePrice: (id: number, data: { price_type?: 'retail' | 'wholesale1' | 'wholesale2'; new_price: number; note?: string }) => ipcRenderer.invoke('products:updatePrice', id, data),
    priceHistory: (id: number, limit?: number) => ipcRenderer.invoke('products:priceHistory', id, limit),
    adjustStock: (productId: number, data: any) => ipcRenderer.invoke('products:adjustStock', productId, data),
    addUnit: (data: any) => ipcRenderer.invoke('products:addUnit', data),
    updateUnit: (id: number, data: any) => ipcRenderer.invoke('products:updateUnit', id, data),
    deleteUnit: (id: number) => ipcRenderer.invoke('products:deleteUnit', id),
    getLabels: (productId: number) => ipcRenderer.invoke('products:getLabels', productId),
    saveLabel: (data: any) => ipcRenderer.invoke('products:saveLabel', data),
    deleteLabel: (id: number) => ipcRenderer.invoke('products:deleteLabel', id),
    searchGenericNames: (q: string) => ipcRenderer.invoke('products:searchGenericNames', q),
    getLots: (productId: number) => ipcRenderer.invoke('products:getLots', productId),
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
    deleteCustomer: (id: number) => ipcRenderer.invoke('people:deleteCustomer', id),
    listSuppliers: (filters: any) => ipcRenderer.invoke('people:listSuppliers', filters),
    saveSupplier: (data: any) => ipcRenderer.invoke('people:saveSupplier', data),
    deleteSupplier: (id: number) => ipcRenderer.invoke('people:deleteSupplier', id),
    listStaff: () => ipcRenderer.invoke('people:listStaff'),
    saveStaff: (data: any) => ipcRenderer.invoke('people:saveStaff', data),
    deleteStaff: (id: number) => ipcRenderer.invoke('people:deleteStaff', id),
    allSuppliers: () => ipcRenderer.invoke('people:allSuppliers'),
  },
  // Reports
  reports: {
    salesList: (filters: any) => ipcRenderer.invoke('reports:salesList', filters),
    getSale: (id: number) => ipcRenderer.invoke('reports:getSale', id),
    voidSale: (id: number, reason: string) => ipcRenderer.invoke('reports:voidSale', id, reason),
    purchaseList: (filters: any) => ipcRenderer.invoke('reports:purchaseList', filters),
  },
  // Settings
  settings: {
    getShop: () => ipcRenderer.invoke('settings:getShop'),
    saveShop: (data: any) => ipcRenderer.invoke('settings:saveShop', data),
    listCategories: () => ipcRenderer.invoke('settings:listCategories'),
    saveCategory: (data: any) => ipcRenderer.invoke('settings:saveCategory', data),
    toggleCategory: (id: number) => ipcRenderer.invoke('settings:toggleCategory', id),
    listUnits: () => ipcRenderer.invoke('settings:listUnits'),
    saveUnit: (data: any) => ipcRenderer.invoke('settings:saveUnit', data),
    listDrugTypes: () => ipcRenderer.invoke('settings:listDrugTypes'),
    saveDrugType: (data: any) => ipcRenderer.invoke('settings:saveDrugType', data),
    toggleDrugType: (id: number) => ipcRenderer.invoke('settings:toggleDrugType', id),
    getLabelSettings: () => ipcRenderer.invoke('settings:getLabelSettings'),
    saveLabelSettings: (data: any) => ipcRenderer.invoke('settings:saveLabelSettings', data),
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
  },
  // App
  app: {
    getVersion: () => ipcRenderer.invoke('app:getVersion'),
  },
}

contextBridge.exposeInMainWorld('api', api)

export type ElectronAPI = typeof api
