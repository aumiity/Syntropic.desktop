import React, { Suspense, lazy, useEffect, useState, useCallback } from 'react'
import { HashRouter, Routes, Route } from 'react-router-dom'
import { Layout } from './components/layout/Layout'
import { ToastProvider } from './components/ui/toast'
import { TooltipProvider } from './components/ui/tooltip'
import { useUserStore } from './stores/userStore'

const SetupWizard = lazy(() => import('./pages/Setup/SetupWizard').then(m => ({ default: m.SetupWizard })))

const POS = lazy(() => import('./pages/POS'))
const Purchase = lazy(() => import('./pages/Purchase'))
const PurchaseIntake = lazy(() => import('./pages/PurchaseIntake'))
const Products = lazy(() => import('./pages/Products'))
const ProductsList = lazy(() => import('./pages/Products/ProductsList'))
const BundlesList = lazy(() => import('./pages/Products/BundlesList'))
const EditProduct = lazy(() => import('./pages/Products/EditProduct'))
const EditBundle = lazy(() => import('./pages/Products/EditBundle'))
const People = lazy(() => import('./pages/People'))
const QuotationList = lazy(() => import('./pages/Quotation/QuotationList'))
const EditQuotation = lazy(() => import('./pages/Quotation/EditQuotation'))
const ManageLayout = lazy(() => import('./pages/Manage'))
const ManageSales = lazy(() => import('./pages/Manage/Sales'))
const ManagePurchases = lazy(() => import('./pages/Manage/Purchases'))
const ManageLowStock = lazy(() => import('./pages/Manage/LowStock'))
const ManageExpiry = lazy(() => import('./pages/Manage/Expiry'))
const ManageNegativeStock = lazy(() => import('./pages/Manage/NegativeStock'))
const ReportsLayout = lazy(() => import('./pages/Reports'))
const ReportsDashboard = lazy(() => import('./pages/Reports/Dashboard'))
const ReportsExpenses = lazy(() => import('./pages/Reports/Expenses'))
const ReportsFda = lazy(() => import('./pages/Reports/FdaReports'))
const ReportsKhorYor9 = lazy(() => import('./pages/Reports/KhorYor9'))
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

// Gates the whole app behind the first-run setup wizard. Until the shop's
// settings.setup_completed === 1, the wizard replaces the router entirely so the
// operator cannot reach the POS without entering essential shop data + the VAT
// decision. Existing installs are backfilled to completed in the DB migration.
function SetupGate({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<'loading' | 'setup' | 'ready'>('loading')
  const check = useCallback(() => {
    window.api.settings.getShop()
      .then((d: any) => setState(d?.setup_completed === 1 ? 'ready' : 'setup'))
      .catch(() => setState('setup'))
  }, [])
  useEffect(() => { check() }, [check])

  if (state === 'loading') return <PageLoader />
  if (state === 'setup') {
    return (
      <Suspense fallback={<PageLoader />}>
        <SetupWizard onComplete={check} />
      </Suspense>
    )
  }
  return <>{children}</>
}

export default function App() {
  const hydrateUser = useUserStore(s => s.hydrate)
  useEffect(() => { hydrateUser() }, [hydrateUser])

  return (
    <ToastProvider>
     <TooltipProvider>
      <SetupGate>
      <HashRouter>
        <Suspense fallback={<PageLoader />}>
          <Routes>
            <Route element={<Layout />}>
              <Route index element={<POS />} />
              <Route path="purchase" element={<Purchase />} />
              <Route path="purchase-intake" element={<PurchaseIntake />} />
              <Route path="products" element={<Products />}>
                <Route index element={<ProductsList />} />
                <Route path="bundles" element={<BundlesList />} />
              </Route>
              <Route path="products/new" element={<EditProduct />} />
              <Route path="products/:id/edit" element={<EditProduct />} />
              <Route path="products/bundles/new" element={<EditBundle />} />
              <Route path="products/bundles/:id/edit" element={<EditBundle />} />
              <Route path="people" element={<People />} />
              <Route path="quotation" element={<QuotationList />} />
              <Route path="quotation/new" element={<EditQuotation />} />
              <Route path="quotation/:id/edit" element={<EditQuotation />} />
              <Route path="manage" element={<ManageLayout />}>
                <Route index element={<ManageSales />} />
                <Route path="purchases" element={<ManagePurchases />} />
                <Route path="low-stock" element={<ManageLowStock />} />
                <Route path="expiry" element={<ManageExpiry />} />
                <Route path="negative-stock" element={<ManageNegativeStock />} />
              </Route>
              {/* Phase 4: Reports rebuilt as finance dashboard (Phase 5 adds อย.). */}
              <Route path="reports" element={<ReportsLayout />}>
                <Route index element={<ReportsDashboard />} />
                <Route path="expenses" element={<ReportsExpenses />} />
                <Route path="fda">
                  <Route index element={<ReportsFda />} />
                  <Route path="khor-yor-9" element={<ReportsKhorYor9 />} />
                </Route>
              </Route>
              <Route path="settings" element={<Settings />} />
              <Route path="theme" element={<Theme />} />
              <Route path="css" element={<CSSPage />} />
            </Route>
          </Routes>
        </Suspense>
      </HashRouter>
      </SetupGate>
     </TooltipProvider>
    </ToastProvider>
  )
}
