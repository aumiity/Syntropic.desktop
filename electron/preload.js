import { contextBridge, ipcRenderer } from 'electron';
var api = {
    // POS
    pos: {
        searchProducts: function (q) { return ipcRenderer.invoke('pos:searchProducts', q); },
        searchCustomers: function (q) { return ipcRenderer.invoke('pos:searchCustomers', q); },
        saveBill: function (payload) { return ipcRenderer.invoke('pos:saveBill', payload); },
        getDailyStats: function () { return ipcRenderer.invoke('pos:getDailyStats'); },
        returnItems: function (payload) { return ipcRenderer.invoke('pos:returnItems', payload); },
    },
    // Products
    products: {
        list: function (filters) { return ipcRenderer.invoke('products:list', filters); },
        lowStock: function (filters) { return ipcRenderer.invoke('products:lowStock', filters); },
        get: function (id) { return ipcRenderer.invoke('products:get', id); },
        create: function (data) { return ipcRenderer.invoke('products:create', data); },
        update: function (id, data) { return ipcRenderer.invoke('products:update', id, data); },
        updatePrice: function (id, data) { return ipcRenderer.invoke('products:updatePrice', id, data); },
        priceHistory: function (id, limit) { return ipcRenderer.invoke('products:priceHistory', id, limit); },
        stockMovements: function (productId, opts) { return ipcRenderer.invoke('products:stockMovements', productId, opts); },
        adjustStock: function (productId, data) { return ipcRenderer.invoke('products:adjustStock', productId, data); },
        addUnit: function (data) { return ipcRenderer.invoke('products:addUnit', data); },
        updateUnit: function (id, data) { return ipcRenderer.invoke('products:updateUnit', id, data); },
        deleteUnit: function (id) { return ipcRenderer.invoke('products:deleteUnit', id); },
        getLabels: function (productId) { return ipcRenderer.invoke('products:getLabels', productId); },
        saveLabel: function (data) { return ipcRenderer.invoke('products:saveLabel', data); },
        deleteLabel: function (id) { return ipcRenderer.invoke('products:deleteLabel', id); },
        searchGenericNames: function (q) { return ipcRenderer.invoke('products:searchGenericNames', q); },
        getLots: function (productId) { return ipcRenderer.invoke('products:getLots', productId); },
        monthlySales: function (productId) { return ipcRenderer.invoke('products:monthlySales', productId); },
        getBundleItems: function (bundleId) { return ipcRenderer.invoke('products:getBundleItems', bundleId); },
        saveBundleItems: function (bundleId, items) {
            return ipcRenderer.invoke('products:saveBundleItems', bundleId, items);
        },
        createBundle: function (payload) {
            return ipcRenderer.invoke('products:createBundle', payload);
        },
        adjustLot: function (payload) {
            return ipcRenderer.invoke('products:adjustLot', payload);
        },
        adjustLotBatch: function (payload) { return ipcRenderer.invoke('products:adjustLotBatch', payload); },
        updateLot: function (id, data) { return ipcRenderer.invoke('products:updateLot', id, data); },
        expireLot: function (lotId, userId) { return ipcRenderer.invoke('products:expireLot', lotId, userId); },
        stockStats: function (filters) {
            return ipcRenderer.invoke('products:stockStats', filters);
        },
    },
    // Purchase
    purchase: {
        nextGRNumber: function () { return ipcRenderer.invoke('purchase:nextGRNumber'); },
        save: function (payload) { return ipcRenderer.invoke('purchase:save', payload); },
        history: function (filters) { return ipcRenderer.invoke('purchase:history', filters); },
        getReceipt: function (invoiceNo) { return ipcRenderer.invoke('purchase:getReceipt', invoiceNo); },
        cancel: function (payload) {
            return ipcRenderer.invoke('purchase:cancel', payload);
        },
        updateHeader: function (payload) { return ipcRenderer.invoke('purchase:updateHeader', payload); },
    },
    // People
    people: {
        listCustomers: function (filters) { return ipcRenderer.invoke('people:listCustomers', filters); },
        getCustomer: function (id) { return ipcRenderer.invoke('people:getCustomer', id); },
        saveCustomer: function (data) { return ipcRenderer.invoke('people:saveCustomer', data); },
        setCustomerStatus: function (id, disabled) { return ipcRenderer.invoke('people:setCustomerStatus', { id: id, disabled: disabled }); },
        listSuppliers: function (filters) { return ipcRenderer.invoke('people:listSuppliers', filters); },
        saveSupplier: function (data) { return ipcRenderer.invoke('people:saveSupplier', data); },
        setSupplierStatus: function (id, disabled) { return ipcRenderer.invoke('people:setSupplierStatus', { id: id, disabled: disabled }); },
        listStaff: function (filters) { return ipcRenderer.invoke('people:listStaff', filters); },
        saveStaff: function (data) { return ipcRenderer.invoke('people:saveStaff', data); },
        setStaffStatus: function (id, disabled) { return ipcRenderer.invoke('people:setStaffStatus', { id: id, disabled: disabled }); },
        allSuppliers: function () { return ipcRenderer.invoke('people:allSuppliers'); },
    },
    // Reports
    reports: {
        salesList: function (filters) { return ipcRenderer.invoke('reports:salesList', filters); },
        getSale: function (id) { return ipcRenderer.invoke('reports:getSale', id); },
        getSaleByInvoice: function (invoiceNo) { return ipcRenderer.invoke('reports:getSaleByInvoice', invoiceNo); },
        voidSale: function (id, reason) { return ipcRenderer.invoke('reports:voidSale', id, reason); },
        expiringLots: function (filters) { return ipcRenderer.invoke('reports:expiringLots', filters); },
        financeSummary: function (filters) { return ipcRenderer.invoke('reports:financeSummary', filters); },
        salesPurchaseTrend: function (filters) { return ipcRenderer.invoke('reports:salesPurchaseTrend', filters); },
        accountsPayable: function () { return ipcRenderer.invoke('reports:accountsPayable'); },
        khorYor9: function (filters) { return ipcRenderer.invoke('reports:khorYor9', filters); },
        topProducts: function (filters) { return ipcRenderer.invoke('reports:topProducts', filters); },
        topSuppliers: function (filters) { return ipcRenderer.invoke('reports:topSuppliers', filters); },
        hourlyTraffic: function (filters) { return ipcRenderer.invoke('reports:hourlyTraffic', filters); },
        cashierLeaderboard: function (filters) { return ipcRenderer.invoke('reports:cashierLeaderboard', filters); },
        salesStats: function (filters) { return ipcRenderer.invoke('reports:salesStats', filters); },
        inactiveProducts: function (filters) { return ipcRenderer.invoke('reports:inactiveProducts', filters); },
        productVelocity: function (filters) { return ipcRenderer.invoke('reports:productVelocity', filters); },
    },
    // Settings
    settings: {
        getShop: function () { return ipcRenderer.invoke('settings:getShop'); },
        saveShop: function (data) { return ipcRenderer.invoke('settings:saveShop', data); },
        listCategories: function () { return ipcRenderer.invoke('settings:listCategories'); },
        saveCategory: function (data) { return ipcRenderer.invoke('settings:saveCategory', data); },
        reorderCategories: function (ids) { return ipcRenderer.invoke('settings:reorderCategories', ids); },
        listUnits: function () { return ipcRenderer.invoke('settings:listUnits'); },
        saveUnit: function (data) { return ipcRenderer.invoke('settings:saveUnit', data); },
        listDrugTypes: function () { return ipcRenderer.invoke('settings:listDrugTypes'); },
        saveDrugType: function (data) { return ipcRenderer.invoke('settings:saveDrugType', data); },
        getLabelSettings: function () { return ipcRenderer.invoke('settings:getLabelSettings'); },
        saveLabelSettings: function (data) { return ipcRenderer.invoke('settings:saveLabelSettings', data); },
        getSalesSettings: function () { return ipcRenderer.invoke('settings:getSalesSettings'); },
        saveSalesSettings: function (data) { return ipcRenderer.invoke('settings:saveSalesSettings', data); },
        listLabelFrequencies: function () { return ipcRenderer.invoke('settings:listLabelFrequencies'); },
        listLabelDosages: function () { return ipcRenderer.invoke('settings:listLabelDosages'); },
        listLabelMealRelations: function () { return ipcRenderer.invoke('settings:listLabelMealRelations'); },
        listLabelTimes: function () { return ipcRenderer.invoke('settings:listLabelTimes'); },
        listLabelAdvices: function () { return ipcRenderer.invoke('settings:listLabelAdvices'); },
        allUnits: function () { return ipcRenderer.invoke('settings:allUnits'); },
        allCategories: function () { return ipcRenderer.invoke('settings:allCategories'); },
        allDrugTypes: function () { return ipcRenderer.invoke('settings:allDrugTypes'); },
        allDosageForms: function () { return ipcRenderer.invoke('settings:allDosageForms'); },
        getThemeColors: function () { return ipcRenderer.invoke('settings:getThemeColors'); },
        saveThemeColors: function (payload) {
            return ipcRenderer.invoke('settings:saveThemeColors', payload);
        },
        getThemeFontSize: function () { return ipcRenderer.invoke('settings:getThemeFontSize'); },
        saveThemeFontSize: function (fontSize) { return ipcRenderer.invoke('settings:saveThemeFontSize', fontSize); },
        getThemeFonts: function () { return ipcRenderer.invoke('settings:getThemeFonts'); },
        saveThemeFonts: function (payload) {
            return ipcRenderer.invoke('settings:saveThemeFonts', payload);
        },
    },
    // Printer
    printer: {
        printReceipt: function (data) { return ipcRenderer.invoke('printer:printReceipt', data); },
        openCashDrawer: function (data) { return ipcRenderer.invoke('printer:openCashDrawer', data); },
        listPrinters: function () { return ipcRenderer.invoke('printer:listPrinters'); },
        printLabel: function (args) {
            return ipcRenderer.invoke('printer:printLabel', args);
        },
    },
    // Window controls
    window: {
        minimize: function () { return ipcRenderer.invoke('window:minimize'); },
        maximize: function () { return ipcRenderer.invoke('window:maximize'); },
        close: function () { return ipcRenderer.invoke('window:close'); },
        isMaximized: function () { return ipcRenderer.invoke('window:isMaximized'); },
        setSize: function (width, height) { return ipcRenderer.invoke('window:setSize', width, height); },
    },
    // App
    app: {
        getVersion: function () { return ipcRenderer.invoke('app:getVersion'); },
    },
    // Invoice Matcher
    matcher: {
        matchLines: function (supplierId, lines) {
            return ipcRenderer.invoke('matcher:matchLines', supplierId, lines);
        },
        saveAliases: function (rows) { return ipcRenderer.invoke('matcher:saveAliases', rows); },
        listAliases: function (supplierId) {
            return ipcRenderer.invoke('matcher:listAliases', supplierId);
        },
        exportCSV: function (rows) { return ipcRenderer.invoke('matcher:exportCSV', rows); },
    },
    // Negative-stock reconciliation
    negativeStock: {
        list: function () { return ipcRenderer.invoke('negativeStock:list'); },
        count: function () { return ipcRenderer.invoke('negativeStock:count'); },
        reconcile: function (payload) {
            return ipcRenderer.invoke('negativeStock:reconcile', payload);
        },
        dismiss: function (payload) {
            return ipcRenderer.invoke('negativeStock:dismiss', payload);
        },
    },
    // Auth (placeholder until proper login)
    auth: {
        getCurrentUser: function () { return ipcRenderer.invoke('auth:getCurrentUser'); },
    },
    // Dev (only registered when isDev=true in main.ts; will reject otherwise)
    dev: {
        seedSalesHistory: function (days) { return ipcRenderer.invoke('dev:seedSalesHistory', { days: days }); },
    },
};
contextBridge.exposeInMainWorld('api', api);
