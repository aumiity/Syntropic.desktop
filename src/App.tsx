import React, { Suspense, lazy, useEffect } from 'react'
import { HashRouter, Routes, Route } from 'react-router-dom'
import { Layout } from './components/layout/Layout'
import { ToastProvider } from './components/ui/toast'
import { useUserStore } from './stores/userStore'

const POS = lazy(() => import('./pages/POS'))
const Purchase = lazy(() => import('./pages/Purchase'))
const Products = lazy(() => import('./pages/Products'))
const EditProduct = lazy(() => import('./pages/Products/EditProduct'))
const People = lazy(() => import('./pages/People'))
const ReportsLayout = lazy(() => import('./pages/Reports'))
const ReportsSales = lazy(() => import('./pages/Reports/Sales'))
const ReportsPurchases = lazy(() => import('./pages/Reports/Purchases'))
const ReportsExpiry = lazy(() => import('./pages/Reports/Expiry'))
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
      <HashRouter>
        <Suspense fallback={<PageLoader />}>
          <Routes>
            <Route element={<Layout />}>
              <Route index element={<POS />} />
              <Route path="purchase" element={<Purchase />} />
              <Route path="products" element={<Products />} />
              <Route path="products/new" element={<EditProduct />} />
              <Route path="products/:id/edit" element={<EditProduct />} />
              <Route path="people" element={<People />} />
              <Route path="reports" element={<ReportsLayout />}>
                <Route index element={<ReportsSales />} />
                <Route path="purchases" element={<ReportsPurchases />} />
                <Route path="expiry" element={<ReportsExpiry />} />
              </Route>
              <Route path="settings" element={<Settings />} />
              <Route path="theme" element={<Theme />} />
              <Route path="css" element={<CSSPage />} />
            </Route>
          </Routes>
        </Suspense>
      </HashRouter>
    </ToastProvider>
  )
}
