/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect } from 'react';
import { Routes, Route, Navigate, useNavigate, useParams } from 'react-router-dom';
import Sidebar from './components/Sidebar';
import TopNav from './components/TopNav';
import Dashboard from './components/Dashboard';
import StockDetails from './components/StockDetails';
import MarketScanners from './components/MarketScanners';
import StockChat from './components/StockChat';
import Portfolio from './components/Portfolio';
import Watchlist from './components/Watchlist';
import AuthPage from './components/auth/AuthPage';
import LoginPrompt from './components/auth/LoginPrompt';
import { AuthProvider, useAuth } from './context/AuthContext';
import { Stock } from './types';
import { fetchStocks } from './data';

export default function App() {
  return (
    <AuthProvider>
      <AppShell />
    </AuthProvider>
  );
}

function StockDetailsRoute({
  stocks,
  loadingStocks,
}: {
  stocks: Stock[];
  loadingStocks: boolean;
}) {
  const { ticker } = useParams<{ ticker: string }>();
  const navigate = useNavigate();
  const stock = stocks.find(
    (s) => s.ticker.toUpperCase() === ticker?.toUpperCase(),
  );

  if (loadingStocks) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <div className="w-8 h-8 border-4 border-slate-200 border-t-black rounded-full animate-spin" />
      </div>
    );
  }

  if (!stock) return <Navigate to="/" replace />;

  return <StockDetails stock={stock} onBack={() => navigate(-1)} />;
}

function AppShell() {
  const { token } = useAuth();
  const navigate = useNavigate();
  const [stocks, setStocks] = useState<Stock[]>([]);
  const [loadingStocks, setLoadingStocks] = useState(true);
  const [showAuth, setShowAuth] = useState(false);

  useEffect(() => {
    fetchStocks()
      .then(setStocks)
      .catch((err) => console.error('Failed to load EGX stocks:', err))
      .finally(() => setLoadingStocks(false));
  }, []);

  // Close auth modal once user successfully logs in
  useEffect(() => {
    if (token) setShowAuth(false);
  }, [token]);

  const handleSelectStock = (stock: Stock) => {
    navigate(`/stocks/${stock.ticker}`);
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans selection:bg-black selection:text-white">
      <TopNav stocks={stocks} onSelectStock={handleSelectStock} onShowAuth={() => setShowAuth(true)} />
      <Sidebar />

      {/* Auth modal overlay */}
      {showAuth && (
        <div
          className="fixed inset-0 z-[100] bg-black/50 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={(e) => e.target === e.currentTarget && setShowAuth(false)}
        >
          <div className="w-full max-w-md">
            <AuthPage onSuccess={() => setShowAuth(false)} />
          </div>
        </div>
      )}

      <main className="lg:ml-64 pt-24 px-6 pb-12 min-h-screen">
        <Routes>
          <Route
            path="/"
            element={
              <Dashboard
                stocks={stocks}
                loading={loadingStocks}
                onSelectStock={handleSelectStock}
              />
            }
          />
          <Route
            path="/scanners"
            element={
              <MarketScanners
                stocks={stocks}
                loading={loadingStocks}
                onSelectStock={handleSelectStock}
              />
            }
          />
          <Route
            path="/chat"
            element={
              <StockChat
                stocks={stocks}
                loading={loadingStocks}
                onSelectStock={handleSelectStock}
              />
            }
          />
          <Route
            path="/portfolio"
            element={
              !token ? (
                <LoginPrompt section="Portfolio" onLogin={() => setShowAuth(true)} />
              ) : (
                <Portfolio stocks={stocks} onSelectStock={handleSelectStock} />
              )
            }
          />
          <Route
            path="/watchlist"
            element={
              !token ? (
                <LoginPrompt section="Watchlist" onLogin={() => setShowAuth(true)} />
              ) : (
                <Watchlist stocks={stocks} onSelectStock={handleSelectStock} />
              )
            }
          />
          <Route
            path="/stocks/:ticker"
            element={
              <StockDetailsRoute stocks={stocks} loadingStocks={loadingStocks} />
            }
          />
          <Route
            path="*"
            element={
              <div className="flex flex-col items-center justify-center h-[60vh] text-slate-400 space-y-4">
                <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center">
                  <span className="text-2xl">🚧</span>
                </div>
                <h2 className="text-xl font-bold text-slate-900">Page Not Found</h2>
                <p className="text-sm">This section is currently under development.</p>
                <button
                  onClick={() => navigate('/')}
                  className="px-6 py-2 bg-black text-white rounded-full text-sm font-bold hover:opacity-90 transition-opacity"
                >
                  Return to Dashboard
                </button>
              </div>
            }
          />
        </Routes>
      </main>
    </div>
  );
}


