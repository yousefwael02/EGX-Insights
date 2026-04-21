import { useState, useEffect, useRef } from 'react';
import { NavLink } from 'react-router-dom';
import { Search, LogOut, TrendingUp, TrendingDown } from 'lucide-react';
import { fetchMarketSummary } from '../data';
import { Stock, MarketSummary } from '../types';
import { cn } from '../lib/utils';
import { useAuth } from '../context/AuthContext';
import StockLogo from './StockLogo';

interface TopNavProps {
  stocks: Stock[];
  onSelectStock: (stock: Stock) => void;
  onShowAuth: () => void;
}

export default function TopNav({ stocks, onSelectStock, onShowAuth }: TopNavProps) {
  const { user, logout } = useAuth();
  const [marketSummary, setMarketSummary] = useState<MarketSummary | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Stock[]>([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetchMarketSummary()
      .then(setMarketSummary)
      .catch(() => {/* index data unavailable */});
  }, []);

  useEffect(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) {
      setSearchResults([]);
      setShowDropdown(false);
      return;
    }
    const results = stocks
      .filter((s) => s.ticker.toLowerCase().includes(q) || s.name.toLowerCase().includes(q))
      .slice(0, 6);
    setSearchResults(results);
    setShowDropdown(results.length > 0);
  }, [searchQuery, stocks]);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const handleSelect = (stock: Stock) => {
    onSelectStock(stock);
    setShowDropdown(false);
    setSearchQuery('');
  };

  const indexUp = marketSummary ? marketSummary.changePercent >= 0 : null;

  return (
    <nav className="fixed top-0 w-full z-50 bg-white/70 backdrop-blur-md shadow-sm border-b border-slate-100">
      <div className="flex justify-between items-center h-16 px-6 w-full max-w-screen-2xl mx-auto">
        {/* Left: brand + EGX30 index */}
        <div className="flex items-center gap-8">
          <div className="flex items-baseline gap-0.5">
            <span className="text-xl font-black tracking-tighter text-slate-900">EGX</span>
            <span className="text-xl font-black tracking-tighter text-emerald-600">Insight</span>
          </div>

          {/* Live EGX30 index badge */}
          {marketSummary && (
            <div className="hidden md:flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-full px-4 py-1.5">
              <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">EGX30</span>
              <span className="font-mono font-bold text-slate-900 text-sm">
                {marketSummary.index_value.toLocaleString('en-EG', { maximumFractionDigits: 0 })}
              </span>
              <span
                className={cn(
                  'flex items-center gap-0.5 text-xs font-bold',
                  indexUp ? 'text-emerald-600' : 'text-rose-600',
                )}
              >
                {indexUp ? (
                  <TrendingUp className="w-3 h-3" />
                ) : (
                  <TrendingDown className="w-3 h-3" />
                )}
                {indexUp ? '+' : ''}
                {marketSummary.changePercent.toFixed(2)}%
              </span>
            </div>
          )}

          <div className="hidden md:flex items-center gap-6">
            <NavLink
              to="/"
              end
              className={({ isActive }) =>
                isActive
                  ? 'text-slate-900 font-bold border-b-2 border-slate-900 py-5'
                  : 'text-slate-500 font-medium hover:bg-slate-100 px-3 py-1 rounded-lg transition-colors'
              }
            >
              Dashboard
            </NavLink>
            <NavLink
              to="/scanners"
              className={({ isActive }) =>
                isActive
                  ? 'text-slate-900 font-bold border-b-2 border-slate-900 py-5'
                  : 'text-slate-500 font-medium hover:bg-slate-100 px-3 py-1 rounded-lg transition-colors'
              }
            >
              Market Scanners
            </NavLink>
            <NavLink
              to="/chat"
              className={({ isActive }) =>
                isActive
                  ? 'text-slate-900 font-bold border-b-2 border-slate-900 py-5'
                  : 'text-slate-500 font-medium hover:bg-slate-100 px-3 py-1 rounded-lg transition-colors'
              }
            >
              AI Chat
            </NavLink>
            <NavLink
              to="/portfolio"
              className={({ isActive }) =>
                isActive
                  ? 'text-slate-900 font-bold border-b-2 border-slate-900 py-5'
                  : 'text-slate-500 font-medium hover:bg-slate-100 px-3 py-1 rounded-lg transition-colors'
              }
            >
              Portfolio
            </NavLink>
          </div>
        </div>

        {/* Right: search + icons */}
        <div className="flex items-center gap-4">
          {/* Search with dropdown */}
          <div className="relative hidden sm:block" ref={searchRef}>
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4 pointer-events-none" />
            <input
              className="pl-10 pr-4 py-2 bg-slate-100 rounded-full border-none text-sm w-64 focus:ring-2 focus:ring-slate-200 outline-none"
              placeholder="Search EGX tickers…"
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onFocus={() => searchResults.length > 0 && setShowDropdown(true)}
            />
            {showDropdown && (
              <div className="absolute top-full mt-2 w-full bg-white rounded-2xl shadow-xl border border-slate-100 overflow-hidden z-50">
                {searchResults.map((stock) => (
                  <button
                    key={stock.ticker}
                    onClick={() => handleSelect(stock)}
                    className="w-full flex items-center gap-3 px-4 py-3 hover:bg-slate-50 transition-colors text-left"
                  >
                    <StockLogo ticker={stock.ticker} logo={stock.logo} size="w-8 h-8" textSize="text-[10px]" />
                    <div className="flex-1 min-w-0">
                      <span className="font-bold text-slate-900 text-sm block">{stock.ticker}</span>
                      <span className="text-slate-500 text-xs truncate block">{stock.name}</span>
                    </div>
                    <span className="font-mono text-sm font-medium text-slate-700 shrink-0">
                      EGP {stock.currentPrice.toFixed(2)}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Logout button — only shown when signed in */}
          {user && (
            <button
              onClick={logout}
              className="p-2 text-slate-500 hover:bg-slate-100 rounded-full transition-colors"
              title="Sign out"
            >
              <LogOut className="w-4 h-4" />
            </button>
          )}

          {/* User avatar / Sign-in button */}
          {user ? (
            <div className="w-8 h-8 rounded-full bg-emerald-600 flex items-center justify-center ml-1 shrink-0" title={user.email}>
              <span className="text-white text-xs font-bold uppercase">
                {user.name ? user.name[0] : user.email?.[0] ?? 'U'}
              </span>
            </div>
          ) : (
            <button
              onClick={onShowAuth}
              className="ml-1 px-4 py-1.5 bg-black text-white text-xs font-semibold rounded-full hover:bg-zinc-800 transition-colors"
            >
              Sign In
            </button>
          )}
        </div>
      </div>
    </nav>
  );
}

