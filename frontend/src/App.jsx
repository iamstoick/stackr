import { Navigate, Route, Routes } from 'react-router-dom';

import { ProtectedRoute } from './components/ProtectedRoute.jsx';
import { AppLayout } from './layouts/AppLayout.jsx';
import { Account } from './pages/Account.jsx';
import { Alerts } from './pages/Alerts.jsx';
import { Dashboard } from './pages/Dashboard.jsx';
import { Learn } from './pages/Learn.jsx';
import { Login } from './pages/Login.jsx';
import { NotFound } from './pages/NotFound.jsx';
import { Practice } from './pages/Practice.jsx';
import { StockDetail } from './pages/StockDetail.jsx';
import { WatchlistPage } from './pages/WatchlistPage.jsx';

export function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />

      <Route
        element={
          <ProtectedRoute>
            <AppLayout />
          </ProtectedRoute>
        }
      >
        <Route index element={<Dashboard />} />
        <Route path="watchlist" element={<WatchlistPage />} />
        <Route path="stocks/:symbol" element={<StockDetail />} />
        <Route path="alerts" element={<Alerts />} />
        <Route path="practice" element={<Practice />} />
        <Route path="learn" element={<Learn />} />
        <Route path="learn/:lessonId" element={<Learn />} />
        <Route path="account" element={<Account />} />
        <Route path="*" element={<NotFound />} />
      </Route>

      <Route path="/index.html" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default App;
