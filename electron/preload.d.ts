declare const api: {
    pos: {
        searchProducts: (q: string) => Promise<any>;
        searchCustomers: (q: string) => Promise<any>;
        saveBill: (payload: any) => Promise<any>;
        getDailyStats: () => Promise<any>;
        returnItems: (payload: any) => Promise<any>;
    };
    products: {
        list: (filters: any) => Promise<any>;
        lowStock: (filters: any) => Promise<any>;
        get: (id: number) => Promise<any>;
        create: (data: any) => Promise<any>;
        update: (id: number, data: any) => Promise<any>;
        updatePrice: (id: number, data: {
            price_type?: "retail" | "wholesale1" | "wholesale2";
            new_price: number;
            note?: string;
        }) => Promise<any>;
        priceHistory: (id: number, limit?: number) => Promise<any>;
        stockMovements: (productId: number, opts?: {
            page?: number;
            pageSize?: number;
            movement_types?: string[];
            date_from?: string;
            date_to?: string;
            sort_dir?: "asc" | "desc";
        }) => Promise<any>;
        adjustStock: (productId: number, data: any) => Promise<any>;
        addUnit: (data: any) => Promise<any>;
        updateUnit: (id: number, data: any) => Promise<any>;
        deleteUnit: (id: number) => Promise<any>;
        getLabels: (productId: number) => Promise<any>;
        saveLabel: (data: any) => Promise<any>;
        deleteLabel: (id: number) => Promise<any>;
        searchGenericNames: (q: string) => Promise<any>;
        getLots: (productId: number) => Promise<any>;
        monthlySales: (productId: number) => Promise<any>;
        getBundleItems: (bundleId: number) => Promise<any>;
        saveBundleItems: (bundleId: number, items: Array<{
            component_product_id: number;
            qty_per_bundle: number;
        }>) => Promise<any>;
        createBundle: (payload: {
            product: any;
            items: Array<{
                component_product_id: number;
                qty_per_bundle: number;
            }>;
        }) => Promise<any>;
        adjustLot: (payload: {
            product_id: number;
            qty: number;
            note?: string;
            user_id: number;
        }) => Promise<any>;
        adjustLotBatch: (payload: {
            items: Array<{
                product_id: number;
                lot_id: number;
                qty: number;
            }>;
            reason: string;
            user_id: number;
        }) => Promise<any>;
        updateLot: (id: number, data: any) => Promise<any>;
        expireLot: (lotId: number, userId: number) => Promise<any>;
        stockStats: (filters: {
            q?: string;
            category_id?: number;
            drug_type_id?: number;
            include_disabled?: boolean;
            is_bundle?: 0 | 1;
        }) => Promise<any>;
    };
    purchase: {
        nextGRNumber: () => Promise<any>;
        save: (payload: any) => Promise<any>;
        history: (filters: any) => Promise<any>;
        getReceipt: (invoiceNo: string) => Promise<any>;
        cancel: (payload: {
            invoice_no: string;
            reason: string;
            userId: number;
        }) => Promise<any>;
        updateHeader: (payload: any) => Promise<any>;
    };
    people: {
        listCustomers: (filters: any) => Promise<any>;
        getCustomer: (id: number) => Promise<any>;
        saveCustomer: (data: any) => Promise<any>;
        setCustomerStatus: (id: number, disabled: boolean) => Promise<any>;
        listSuppliers: (filters: any) => Promise<any>;
        saveSupplier: (data: any) => Promise<any>;
        setSupplierStatus: (id: number, disabled: boolean) => Promise<any>;
        listStaff: (filters?: any) => Promise<any>;
        saveStaff: (data: any) => Promise<any>;
        setStaffStatus: (id: number, disabled: boolean) => Promise<any>;
        allSuppliers: () => Promise<any>;
    };
    reports: {
        salesList: (filters: any) => Promise<any>;
        getSale: (id: number) => Promise<any>;
        getSaleByInvoice: (invoiceNo: string) => Promise<any>;
        voidSale: (id: number, reason: string) => Promise<any>;
        expiringLots: (filters: any) => Promise<any>;
        financeSummary: (filters: any) => Promise<any>;
        salesPurchaseTrend: (filters: any) => Promise<any>;
        accountsPayable: () => Promise<any>;
        khorYor9: (filters: {
            date_from?: string;
            date_to?: string;
        }) => Promise<any>;
        topProducts: (filters: any) => Promise<any>;
        topSuppliers: (filters: any) => Promise<any>;
        hourlyTraffic: (filters: any) => Promise<any>;
        cashierLeaderboard: (filters: any) => Promise<any>;
        salesStats: (filters: any) => Promise<any>;
        inactiveProducts: (filters: any) => Promise<any>;
        productVelocity: (filters: any) => Promise<any>;
    };
    settings: {
        getShop: () => Promise<any>;
        saveShop: (data: any) => Promise<any>;
        listCategories: () => Promise<any>;
        saveCategory: (data: any) => Promise<any>;
        reorderCategories: (ids: number[]) => Promise<any>;
        listUnits: () => Promise<any>;
        saveUnit: (data: any) => Promise<any>;
        listDrugTypes: () => Promise<any>;
        saveDrugType: (data: any) => Promise<any>;
        getLabelSettings: () => Promise<any>;
        saveLabelSettings: (data: any) => Promise<any>;
        getSalesSettings: () => Promise<any>;
        saveSalesSettings: (data: any) => Promise<any>;
        getReceiptSettings: () => Promise<any>;
        saveReceiptSettings: (data: any) => Promise<any>;
        listLabelFrequencies: () => Promise<any>;
        listLabelDosages: () => Promise<any>;
        listLabelMealRelations: () => Promise<any>;
        listLabelTimes: () => Promise<any>;
        listLabelAdvices: () => Promise<any>;
        allUnits: () => Promise<any>;
        allCategories: () => Promise<any>;
        allDrugTypes: () => Promise<any>;
        allDosageForms: () => Promise<any>;
        getThemeColors: () => Promise<any>;
        saveThemeColors: (payload: Array<{
            token: string;
            light: string;
            dark: string;
        }>) => Promise<any>;
        getThemeFontSize: () => Promise<any>;
        saveThemeFontSize: (fontSize: string) => Promise<any>;
        getThemeFonts: () => Promise<any>;
        saveThemeFonts: (payload: {
            latin: string;
            thai: string;
        }) => Promise<any>;
    };
    printer: {
        printReceipt: (data: any) => Promise<any>;
        openCashDrawer: (data: any) => Promise<any>;
        listPrinters: () => Promise<Array<{
            name: string;
            displayName: string;
            description: string;
            status: number;
            isDefault: boolean;
        }>>;
        printLabel: (args: {
            html: string;
            printerName: string;
            paperWidthMm: number;
            paperHeightMm: number;
        }) => Promise<{
            success: boolean;
            error?: string;
        }>;
        previewLabelPdf: (args: {
            html: string;
            paperWidthMm: number;
            paperHeightMm: number;
        }) => Promise<{
            success: boolean;
            error?: string;
            path?: string;
        }>;
        printHtml: (args: {
            html: string;
            printerName: string;
            paperWidthMm: number;
            heightMm?: number | "auto";
            copies?: number;
        }) => Promise<{
            success: boolean;
            error?: string;
        }>;
        previewHtmlPdf: (args: {
            html: string;
            paperWidthMm?: number;
            heightMm?: number | "auto";
            pageFormat?: "A4" | "A5";
        }) => Promise<{
            success: boolean;
            error?: string;
            path?: string;
        }>;
    };
    tax: {
        get: (saleId: number) => Promise<any>;
        issueOrGet: (payload: {
            sale_id: number;
            buyer_name: string;
            buyer_address: string;
            buyer_tax_id?: string;
            buyer_branch?: string;
            issued_by?: number | null;
        }) => Promise<any>;
    };
    window: {
        minimize: () => Promise<any>;
        maximize: () => Promise<any>;
        close: () => Promise<any>;
        isMaximized: () => Promise<any>;
        setSize: (width: number, height: number) => Promise<any>;
    };
    app: {
        getVersion: () => Promise<any>;
    };
    matcher: {
        matchLines: (supplierId: number, lines: string[]) => Promise<any>;
        saveAliases: (rows: Array<{
            supplierId: number;
            supplierText: string;
            productId: number;
            confidence?: number;
            confirmedBy?: number;
        }>) => Promise<any>;
        listAliases: (supplierId: number) => Promise<any>;
        exportCSV: (rows: Array<{
            barcode: string;
            qty: number | string;
            expiry: string;
            lineTotal: number | string;
        }>) => Promise<any>;
    };
    negativeStock: {
        list: () => Promise<any>;
        count: () => Promise<any>;
        reconcile: (payload: {
            id: number;
            userId: number;
        }) => Promise<any>;
        dismiss: (payload: {
            id: number;
            userId: number;
        }) => Promise<any>;
    };
    auth: {
        getCurrentUser: () => Promise<any>;
    };
    dev: {
        seedSalesHistory: (days?: number) => Promise<any>;
    };
};
export type ElectronAPI = typeof api;
export {};
