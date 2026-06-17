import { contextBridge, ipcRenderer } from 'electron';
var api = {
    // POS
    pos: {
        searchProducts: function (q) { return ipcRenderer.invoke('pos:searchProducts', q); },
        getProductsByIds: function (ids) { return ipcRenderer.invoke('pos:getProductsByIds', ids); },
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
        updatePrice: function (id, data, override) { return ipcRenderer.invoke('products:updatePrice', id, data, override); },
        priceHistory: function (id, limit) { return ipcRenderer.invoke('products:priceHistory', id, limit); },
        stockMovements: function (productId, opts) { return ipcRenderer.invoke('products:stockMovements', productId, opts); },
        adjustStock: function (productId, data, override) { return ipcRenderer.invoke('products:adjustStock', productId, data, override); },
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
        adjustLot: function (payload, override) {
            return ipcRenderer.invoke('products:adjustLot', payload, override);
        },
        adjustLotBatch: function (payload, override) { return ipcRenderer.invoke('products:adjustLotBatch', payload, override); },
        updateLot: function (id, data, override) { return ipcRenderer.invoke('products:updateLot', id, data, override); },
        expireLot: function (lotId, userId, override) { return ipcRenderer.invoke('products:expireLot', lotId, userId, override); },
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
        cancel: function (payload, override) {
            return ipcRenderer.invoke('purchase:cancel', payload, override);
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
        resetStaffPassword: function (id, password) { return ipcRenderer.invoke('people:resetStaffPassword', { id: id, password: password }); },
        allSuppliers: function () { return ipcRenderer.invoke('people:allSuppliers'); },
    },
    // Reports
    reports: {
        salesList: function (filters) { return ipcRenderer.invoke('reports:salesList', filters); },
        getSale: function (id) { return ipcRenderer.invoke('reports:getSale', id); },
        getSaleByInvoice: function (invoiceNo) { return ipcRenderer.invoke('reports:getSaleByInvoice', invoiceNo); },
        voidSale: function (id, reason, override) { return ipcRenderer.invoke('reports:voidSale', id, reason, override); },
        expiringLots: function (filters) { return ipcRenderer.invoke('reports:expiringLots', filters); },
        financeSummary: function (filters) { return ipcRenderer.invoke('reports:financeSummary', filters); },
        salesPurchaseTrend: function (filters) { return ipcRenderer.invoke('reports:salesPurchaseTrend', filters); },
        accountsPayable: function () { return ipcRenderer.invoke('reports:accountsPayable'); },
        khorYor9: function (filters) { return ipcRenderer.invoke('reports:khorYor9', filters); },
        khorYorSale: function (filters) { return ipcRenderer.invoke('reports:khorYorSale', filters); },
        topProducts: function (filters) { return ipcRenderer.invoke('reports:topProducts', filters); },
        topSuppliers: function (filters) { return ipcRenderer.invoke('reports:topSuppliers', filters); },
        hourlyTraffic: function (filters) { return ipcRenderer.invoke('reports:hourlyTraffic', filters); },
        cashierLeaderboard: function (filters) { return ipcRenderer.invoke('reports:cashierLeaderboard', filters); },
        salesStats: function (filters) { return ipcRenderer.invoke('reports:salesStats', filters); },
        vatSummary: function (filters) { return ipcRenderer.invoke('reports:vatSummary', filters); },
        inactiveProducts: function (filters) { return ipcRenderer.invoke('reports:inactiveProducts', filters); },
        inactiveCounts: function () { return ipcRenderer.invoke('reports:inactiveCounts'); },
        productVelocity: function (filters) { return ipcRenderer.invoke('reports:productVelocity', filters); },
    },
    // Settings
    settings: {
        getShop: function () { return ipcRenderer.invoke('settings:getShop'); },
        saveShop: function (data) { return ipcRenderer.invoke('settings:saveShop', data); },
        completeSetup: function (data) { return ipcRenderer.invoke('settings:completeSetup', data); },
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
        upgradeToVat: function (data) { return ipcRenderer.invoke('settings:upgradeToVat', data); },
        downgradeFromVat: function (data) { return ipcRenderer.invoke('settings:downgradeFromVat', data); },
        hasVatHistory: function () { return ipcRenderer.invoke('settings:hasVatHistory'); },
        getReceiptSettings: function () { return ipcRenderer.invoke('settings:getReceiptSettings'); },
        saveReceiptSettings: function (data) { return ipcRenderer.invoke('settings:saveReceiptSettings', data); },
        getDocumentSettings: function () { return ipcRenderer.invoke('settings:getDocumentSettings'); },
        saveDocumentSettings: function (data) { return ipcRenderer.invoke('settings:saveDocumentSettings', data); },
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
        previewLabelPdf: function (args) {
            return ipcRenderer.invoke('printer:previewLabelPdf', args);
        },
        printHtml: function (args) {
            return ipcRenderer.invoke('printer:printHtml', args);
        },
        previewHtmlPdf: function (args) {
            return ipcRenderer.invoke('printer:previewHtmlPdf', args);
        },
    },
    // Quotations (ใบเสนอราคา)
    quotation: {
        save: function (payload) { return ipcRenderer.invoke('quotation:save', payload); },
        list: function (filters) { return ipcRenderer.invoke('quotation:list', filters); },
        get: function (id) { return ipcRenderer.invoke('quotation:get', id); },
        setStatus: function (payload) { return ipcRenderer.invoke('quotation:setStatus', payload); },
        delete: function (id) { return ipcRenderer.invoke('quotation:delete', id); },
        beginConversion: function (id) { return ipcRenderer.invoke('quotation:beginConversion', id); },
        releaseConversion: function (id) { return ipcRenderer.invoke('quotation:releaseConversion', id); },
        markConverted: function (payload) { return ipcRenderer.invoke('quotation:markConverted', payload); },
    },
    // Tax invoices (ใบกำกับภาษีเต็มรูป)
    tax: {
        get: function (saleId) { return ipcRenderer.invoke('tax:get', saleId); },
        issueOrGet: function (payload) { return ipcRenderer.invoke('tax:issueOrGet', payload); },
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
    // Database backup / export / restore
    backup: {
        export: function () {
            return ipcRenderer.invoke('backup:export');
        },
        restore: function () {
            return ipcRenderer.invoke('backup:restore');
        },
        getSettings: function () {
            return ipcRenderer.invoke('backup:getSettings');
        },
        saveSettings: function (s) {
            return ipcRenderer.invoke('backup:saveSettings', s);
        },
        pickFolder: function () {
            return ipcRenderer.invoke('backup:pickFolder');
        },
        resetFolder: function () {
            return ipcRenderer.invoke('backup:resetFolder');
        },
        listAuto: function () {
            return ipcRenderer.invoke('backup:listAuto');
        },
        openFolder: function () {
            return ipcRenderer.invoke('backup:openFolder');
        },
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
    // Shop expenses (ค่าใช้จ่าย)
    expenses: {
        list: function (filters) { return ipcRenderer.invoke('expenses:list', filters); },
        summary: function (filters) { return ipcRenderer.invoke('expenses:summary', filters); },
        save: function (payload) { return ipcRenderer.invoke('expenses:save', payload); },
        delete: function (id) { return ipcRenderer.invoke('expenses:delete', id); },
        listCategories: function () { return ipcRenderer.invoke('expenses:listCategories'); },
        activeCategories: function () { return ipcRenderer.invoke('expenses:activeCategories'); },
        saveCategory: function (data) { return ipcRenderer.invoke('expenses:saveCategory', data); },
        reorderCategories: function (ids) { return ipcRenderer.invoke('expenses:reorderCategories', ids); },
    },
    // Auth — login picker + password verify (no session persisted)
    auth: {
        listLoginUsers: function () { return ipcRenderer.invoke('auth:listLoginUsers'); },
        login: function (userId, password) { return ipcRenderer.invoke('auth:login', { userId: userId, password: password }); },
        // DEV-only auto-login (no password) — main rejects when packaged. See auth.ts.
        devLogin: function () { return ipcRenderer.invoke('auth:devLogin'); },
        logout: function () { return ipcRenderer.invoke('auth:logout'); },
        getMyProfile: function () { return ipcRenderer.invoke('auth:getMyProfile'); },
        changePassword: function (currentPassword, newPassword) {
            return ipcRenderer.invoke('auth:changePassword', { currentPassword: currentPassword, newPassword: newPassword });
        },
        resetAdminPassword: function (recoveryCode, newPassword) {
            return ipcRenderer.invoke('auth:resetAdminPassword', { recoveryCode: recoveryCode, newPassword: newPassword });
        },
    },
    // Dev (only registered when isDev=true in main.ts; will reject otherwise)
    dev: {
        seedSalesHistory: function (days) { return ipcRenderer.invoke('dev:seedSalesHistory', { days: days }); },
    },
};
contextBridge.exposeInMainWorld('api', api);
