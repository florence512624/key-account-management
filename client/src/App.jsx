import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { Layout } from './components/Layout.jsx'
import { ToastProvider } from './components/ui.jsx'
import { Spinner } from './components/ui.jsx'
import { AuthProvider, useAuth } from './lib/auth.jsx'
import Dashboard from './pages/Dashboard.jsx'
import Accounts from './pages/Accounts.jsx'
import StakeholderMap from './pages/StakeholderMap.jsx'
import Interactions from './pages/Interactions.jsx'
import AiInsight from './pages/AiInsight.jsx'
import Login from './pages/Login.jsx'
import Profile from './pages/Profile.jsx'

function Splash () {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-canvas">
      <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-brand-500 to-brand-700 text-[13px] font-bold text-white shadow-lg shadow-brand-900/20">
        KA
      </div>
      <div className="flex items-center gap-2 text-[12.5px] text-slate-400">
        <Spinner className="h-4 w-4 text-brand-600" />
        正在确认登录状态…
      </div>
    </div>
  )
}

/** 路由守卫：未登录时记住原地址，登录后原路返回 */
function RequireAuth ({ children }) {
  const { loading, user } = useAuth()
  const location = useLocation()

  if (loading) return <Splash />
  if (!user) {
    return <Navigate to="/login" replace state={{ from: `${location.pathname}${location.search}` }} />
  }
  return children
}

export default function App () {
  return (
    <BrowserRouter>
      <ToastProvider>
        <AuthProvider>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route
              element={
                <RequireAuth>
                  <Layout />
                </RequireAuth>
              }
            >
              <Route index element={<Dashboard />} />
              <Route path="accounts" element={<Accounts />} />
              <Route path="accounts/:id/map" element={<StakeholderMap />} />
              <Route path="map" element={<StakeholderMap />} />
              <Route path="interactions" element={<Interactions />} />
              <Route path="ai" element={<AiInsight />} />
              <Route path="profile" element={<Profile />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Route>
          </Routes>
        </AuthProvider>
      </ToastProvider>
    </BrowserRouter>
  )
}
