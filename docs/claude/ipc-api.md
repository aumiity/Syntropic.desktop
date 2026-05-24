# IPC API (`window.api`)

| Namespace | Key methods |
|-----------|-------------|
| `pos` | searchProducts, searchCustomers, addCustomer, saveBill, getDailyStats |
| `products` | list, get, create, update, adjustStock, addUnit/updateUnit/deleteUnit, saveLabel/deleteLabel, searchGenericNames, getLots |
| `purchase` | nextGRNumber, save, history, getReceipt |
| `people` | customers CRUD, suppliers CRUD, staff/users CRUD, allSuppliers |
| `reports` | salesList, getSale, voidSale, purchaseList |
| `settings` | shopSettings, updateShopSettings, categories, itemUnits, drugTypes, dosageForms, allLabelLookups, labelSettings, updateLabelSettings |
| `printer` | printReceipt, openCashDrawer |

Handlers live in `electron/ipc/*.ts`; bridge in `electron/preload.ts`.
