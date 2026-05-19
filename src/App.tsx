import React, { Suspense, lazy, useEffect } from 'react'
import { HashRouter, Routes, Route } from 'react-router-dom'
import { Layout } from './components/layout/Layout'
import { ToastProvider } from './components/ui/toast'
import { TooltipProvider } from './components/ui/tooltip'
import { useUserStore } from './stores/userStore'

const POS = lazy(() => import('./pages/POS'))
const Purchase = lazy(() => import('./pages/Purchase'))
const PurchaseIntake = lazy(() => import('./pages/PurchaseIntake'))
const Products = lazy(() => import('./pages/Products'))
const EditProduct = lazy(() => import('./pages/Products/EditProduct'))
const People = lazy(() => import('./pages/People'))
const ManageLayout = lazy(() => import('./pages/Manage'))
const ManageSales = lazy(() => import('./pages/Manage/Sales'))
const ManagePurchases = lazy(() => import('./pages/Manage/Purchases'))
const ManageLowStock = lazy(() => import('./pages/Manage/LowStock'))
const ManageExpiry = lazy(() => import('./pages/Manage/Expiry'))
const ReportsLayout = lazy(() => import('./pages/Reports'))
const ReportsFinance = lazy(() => import('./pages/Reports/Finance'))
const ReportsPayables = lazy(() => import('./pages/Reports/Payables'))
const ReportsFda = lazy(() => import('./pages/Reports/FdaReports'))
const Settings = lazy(() => import('./pages/Settings'))
const Theme = lazy(() => import('./pages/Theme'))
const CSSPage = lazy(() => import('./pages/CSS'))

function PageLoader() {
  return (
    <div className="flex h-full items-center justify-center text-muted-foreground text-sm">
      กำลังโหลด...
    </div>
  )
}

export default function App() {
  const hydrateUser = useUserStore(s => s.hydrate)
  useEffect(() => { hydrateUser() }, [hydrateUser])

  return (
    <ToastProvider>
     <TooltipProvider>
      <HashRouter>
        <Suspense fallback={<PageLoader />}>
          <Routes>
            <Route element={<Layout />}>
              <Route index element={<POS />} />
              <Route path="purchase" element={<Purchase />} />
              <Route path="purchase-intake" element={<PurchaseIntake />} />
              <Route path="products" element={<Products />} />
              <Route path="products/new" element={<EditProduct />} />
              <Route path="products/:id/edit" element={<EditProduct />} />
              <Route path="people" element={<People />} />
              <Route path="manage" element={<ManageLayout />}>
                <Route index element={<ManageSales />} />
                <Route path="purchases" element={<ManagePurchases />} />
                <Route path="low-stock" element={<ManageLowStock />} />
                <Route path="expiry" element={<ManageExpiry />} />
              </Route>
              {/* Phase 4: Reports rebuilt as finance dashboard (Phase 5 adds อย.). */}
              <Route path="reports" element={<ReportsLayout />}>
                <Route index element={<ReportsFinance />} />
                <Route path="payables" element={<ReportsPayables />} />
                <Route path="fda" element={<ReportsFda />} />
              </Route>
              <Route path="settings" element={<Settings />} />
              <Route path="theme" element={<Theme />} />
              <Route path="css" element={<CSSPage />} />
            </Route>
          </Routes>
        </Suspense>
      </HashRouter>
     </TooltipProvider>
    </ToastProvider>
  )
}
