import React, { Suspense, lazy } from 'react'
import { HashRouter, Routes, Route } from 'react-router-dom'
import { Layout } from './components/layout/Layout'
import { ToastProvider } from './components/ui/toast'

const POS = lazy(() => import('./pages/POS'))
const Purchase = lazy(() => import('./pages/Purchase'))
const Products = lazy(() => import('./pages/Products'))
const EditProduct = lazy(() => import('./pages/Products/EditProduct'))
const People = lazy(() => import('./pages/People'))
const ReportsSales = lazy(() => import('./pages/Reports/Sales'))
const ReportsPurchases = lazy(() => import('./pages/Reports/Purchases'))
const Settings = lazy(() => import('./pages/Settings'))
const UIComponents = lazy(() => import('./pages/UIComponents'))

function PageLoader() {
  return (
    <div className="flex h-full items-center justify-center text-muted-foreground text-sm">
      กำลังโหลด...
    </div>
  )
}

export default function App() {
  return (
    <ToastProvider>
      <HashRouter>
        <Suspense fallback={<PageLoader />}>
          <Routes>
            <Route element={<Layout />}>
              <Route index element={<POS />} />
              <Route path="purchase" element={<Purchase />} />
              <Route path="products" element={<Products />} />
              <Route path="products/:id/edit" element={<EditProduct />} />
              <Route path="people" element={<People />} />
              <Route path="reports" element={<ReportsSales />} />
              <Route path="reports/purchases" element={<ReportsPurchases />} />
              <Route path="settings" element={<Settings />} />
              <Route path="ui" element={<UIComponents />} />
            </Route>
          </Routes>
        </Suspense>
      </HashRouter>
    </ToastProvider>
  )
}
