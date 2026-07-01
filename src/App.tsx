import React, { Suspense, lazy, useEffect, useState, useCallback } from 'react'
import { HashRouter, Routes, Route, Navigate } from 'react-router-dom'
import { Layout } from './components/layout/Layout'
import { ToastProvider } from './components/ui/toast'
import { TooltipProvider } from './components/ui/tooltip'
import { useUserStore } from './stores/userStore'

// DEV-only UI review/annotation overlay. Gated on import.meta.env.DEV so both the
// component and this import are tree-shaken out of production builds.
const ReviewOverlay = import.meta.env.DEV
  ? lazy(() => import('./dev/ReviewOverlay'))
  : null

const SetupWizard = lazy(() => import('./pages/Setup/SetupWizard').then(m => ({ default: m.SetupWizard })))
const LoginScreen = lazy(() => import('./pages/Auth/LoginScreen').then(m => ({ default: m.LoginScreen })))

const POS = lazy(() => import('./pages/POS'))
const Purchase = lazy(() => import('./pages/Purchase'))
const PurchaseIntake = lazy(() => import('./pages/PurchaseIntake'))
const Products = lazy(() => import('./pages/Products'))
const ProductsList = lazy(() => import('./pages/Products/ProductsList'))
const PrintTab = lazy(() => import('./pages/Products/PrintTab'))
const EditProduct = lazy(() => import('./pages/Products/EditProduct'))
const EditBundle = lazy(() => import('./pages/Products/EditBundle'))
const People = lazy(() => import('./pages/People'))
const ManageLayout = lazy(() => import('./pages/Manage'))
const ManageSales = lazy(() => import('./pages/Manage/Sales'))
const ManagePurchases = lazy(() => import('./pages/Manage/Purchases'))
const ManageExpenses = lazy(() => import('./pages/Manage/Expenses'))
const ManageDeadStock = lazy(() => import('./pages/Manage/DeadStock'))
const ManageLowStock = lazy(() => import('./pages/Manage/LowStock'))
const ManageExpiry = lazy(() => import('./pages/Manage/Expiry'))
const ManageNegativeStock = lazy(() => import('./pages/Manage/NegativeStock'))
const ReportsLayout = lazy(() => import('./pages/Reports'))
const ReportsDashboard = lazy(() => import('./pages/Reports/Dashboard'))
const ReportsFda = lazy(() => import('./pages/Reports/FdaReports'))
const ReportsKhorYor9 = lazy(() => import('./pages/Reports/KhorYor9'))
const ReportsKhorYor10 = lazy(() => import('./pages/Reports/KhorYor10'))
const ReportsKhorYor11 = lazy(() => import('./pages/Reports/KhorYor11'))
const ReportsEnvLog = lazy(() => import('./pages/Reports/EnvLog'))
const ReportsVat = lazy(() => import('./pages/Reports/VatReport'))
const ReportsExport = lazy(() => import('./pages/Reports/ExportHub'))
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

// Gates every route behind login. Session is in-memory only (no persist) so
// `current` starts null on every launch → the login screen shows until a
// successful auth sets `current`, after which the gate passes through. The
// gated children hold the <Routes>, so no route that calls getCurrentUserId()
// mounts before a user exists.
function LoginGate({ children }: { children: React.ReactNode }) {
  const current = useUserStore(s => s.current)

  // DEV-only: auto-login as the first admin so a hard refresh doesn't bounce you
  // back to the login screen. Stripped from production builds by import.meta.env.DEV;
  // the main handler is independently gated on !app.isPackaged. Do not remove either.
  const [devTrying, setDevTrying] = useState(import.meta.env.DEV)
  useEffect(() => {
    if (!import.meta.env.DEV || useUserStore.getState().current) { setDevTrying(false); return }
    let alive = true
    window.api?.auth?.devLogin?.()
      .then(u => { if (alive && u) useUserStore.getState().login(u) })
      .catch(() => {})
      .finally(() => { if (alive) setDevTrying(false) })
    return () => { alive = false }
  }, [])

  if (!current) {
    if (devTrying) return <PageLoader />
    return (
      <Suspense fallback={<PageLoader />}>
        <LoginScreen />
      </Suspense>
    )
  }
  return <>{children}</>
}

export default function App() {
  return (
    <ToastProvider>
     <TooltipProvider>
      {/* HashRouter must wrap the gates: SetupWizard/LoginScreen both render
          <TitleBar/>, which calls useLocation() and crashes ("may be used only
          in the context of a <Router>") if mounted outside the router. Do not
          move it back inside the gates. */}
      <HashRouter>
      {ReviewOverlay && (
        <Suspense fallback={null}><ReviewOverlay /></Suspense>
      )}
      <SetupGate>
      <LoginGate>
        <Suspense fallback={<PageLoader />}>
          <Routes>
            <Route element={<Layout />}>
              <Route index element={<POS />} />
              <Route path="purchase" element={<Purchase />} />
              <Route path="purchase-intake" element={<PurchaseIntake />} />
              <Route path="products" element={<Products />}>
                <Route index element={<ProductsList />} />
                <Route path="print" element={<PrintTab />} />
              </Route>
              <Route path="products/new" element={<EditProduct />} />
              <Route path="products/:id/edit" element={<EditProduct />} />
              <Route path="products/bundles/new" element={<EditBundle />} />
              <Route path="products/bundles/:id/edit" element={<EditBundle />} />
              <Route path="people" element={<People />} />
              <Route path="manage" element={<ManageLayout />}>
                <Route index element={<ManageSales />} />
                <Route path="purchases" element={<ManagePurchases />} />
                <Route path="expenses" element={<ManageExpenses />} />
                <Route path="dead-stock" element={<ManageDeadStock />} />
                <Route path="low-stock" element={<ManageLowStock />} />
                <Route path="expiry" element={<ManageExpiry />} />
                <Route path="negative-stock" element={<ManageNegativeStock />} />
              </Route>
              {/* Phase 4: Reports rebuilt as finance dashboard (Phase 5 adds อย.). */}
              <Route path="reports" element={<ReportsLayout />}>
                <Route index element={<ReportsDashboard />} />
                <Route path="fda" element={<ReportsFda />}>
                  <Route index element={<Navigate to="khor-yor-9" replace />} />
                  <Route path="khor-yor-9" element={<ReportsKhorYor9 />} />
                  <Route path="khor-yor-10" element={<ReportsKhorYor10 />} />
                  <Route path="khor-yor-11" element={<ReportsKhorYor11 />} />
                  <Route path="environment" element={<ReportsEnvLog />} />
                </Route>
                <Route path="vat" element={<ReportsVat />} />
                <Route path="export" element={<ReportsExport />} />
              </Route>
              <Route path="settings" element={<Settings />} />
              <Route path="theme" element={<Theme />} />
              <Route path="css" element={<CSSPage />} />
            </Route>
          </Routes>
        </Suspense>
      </LoginGate>
      </SetupGate>
      </HashRouter>
     </TooltipProvider>
    </ToastProvider>
  )
}
