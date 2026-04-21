import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  Star, StarOff, Trash2, ArrowUp, ArrowDown, Plus, X, Search,
  TrendingUp, TrendingDown, BarChart2, AlertCircle,
} from 'lucide-react';
import { Stock, WatchlistItem } from '../types';
import { fetchWatchlist, addToWatchlist, removeFromWatchlist } from '../data';
import { cn } from '../lib/utils';
import StockLogo from './StockLogo';

interface WatchlistProps {
  stocks: Stock[];
  onSelectStock: (stock: Stock) => void;
}

type SortKey = 'ticker' | 'currentPrice' | 'upside' | 'peRatio' | 'sentiment' | 'belowHigh';
type SortDir = 'asc' | 'desc';

const AVATAR_COLORS = [
  'bg-emerald-500', 'bg-blue-500', 'bg-violet-500',
  'bg-amber-500', 'bg-rose-500', 'bg-cyan-500', 'bg-orange-500', 'bg-pink-500',
];
function avatarColor(ticker: string): string {
  const sum = ticker.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0);
  return AVATAR_COLORS[sum % AVATAR_COLORS.length];
}

function sentimentLabel(score: number): { label: string; cls: string } {
  if (score >= 65) return { label: 'Bullish', cls: 'text-emerald-600 bg-emerald-50' };
  if (score >= 45) return { label: 'Neutral', cls: 'text-slate-600 bg-slate-100' };
  return { label: 'Bearish', cls: 'text-rose-600 bg-rose-50' };
}

// ── Add-to-watchlist search bar ───────────────────────────────────────────────
interface AddSearchProps {
  stocks: Stock[];
  watchedTickers: Set<string>;
  onAdd: (ticker: string) => Promise<void>;
}

function AddSearch({ stocks, watchedTickers, onAdd }: AddSearchProps) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [adding, setAdding] = useState('');
  const [error, setError] = useState('');
  const ref = useRef<HTMLDivElement>(null);

  const results = useMemo(() => {
    if (!query.trim()) return [];
    const q = query.toLowerCase();
    return stocks
      .filter((s) => s.ticker.toLowerCase().includes(q) || s.name.toLowerCase().includes(q))
      .slice(0, 8);
  }, [stocks, query]);

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
        setError('');
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const handleAdd = async (ticker: string) => {
    setAdding(ticker);
    setError('');
    try {
      await onAdd(ticker);
      setQuery('');
      setOpen(false);
    } catch (err: any) {
      setError(err.message ?? 'Failed to add stock');
    } finally {
      setAdding('');
    }
  };

  return (
    <div ref={ref} className="relative w-full max-w-sm">
      <div className="flex items-center gap-2 bg-white border border-slate-200 rounded-xl px-4 py-2.5 shadow-sm focus-within:ring-2 focus-within:ring-black transition-all">
        <Search className="w-4 h-4 text-slate-400 flex-shrink-0" />
        <input
          type="text"
          placeholder="Search stock to add…"
          value={query}
          onChange={(e) => { setQuery(e.target.value); setOpen(true); setError(''); }}
          onFocus={() => setOpen(true)}
          className="flex-1 text-sm text-slate-900 placeholder:text-slate-400 bg-transparent outline-none"
        />
        {query && (
          <button onClick={() => { setQuery(''); setOpen(false); setError(''); }}>
            <X className="w-4 h-4 text-slate-400 hover:text-slate-700" />
          </button>
        )}
      </div>

      {/* Error bubble */}
      {error && (
        <div className="absolute top-full mt-1 left-0 right-0 flex items-center gap-2 bg-rose-50 text-rose-600 text-xs px-3 py-2 rounded-xl z-20">
          <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
          {error}
        </div>
      )}

      {/* Dropdown */}
      {open && results.length > 0 && (
        <div className="absolute top-full mt-1 left-0 right-0 bg-white border border-slate-100 rounded-2xl shadow-xl z-20 overflow-hidden">
          {results.map((s) => {
            const watched = watchedTickers.has(s.ticker);
            const isAdding = adding === s.ticker;
            return (
              <button
                key={s.ticker}
                disabled={watched || isAdding}
                onClick={() => handleAdd(s.ticker)}
                className={cn(
                  'w-full flex items-center gap-3 px-4 py-3 text-left transition-colors',
                  watched
                    ? 'opacity-40 cursor-not-allowed'
                    : 'hover:bg-slate-50 cursor-pointer',
                )}
              >
                <StockLogo
                  ticker={s.ticker}
                  logo={s.logo}
                  size="w-7 h-7"
                  textSize="text-[10px]"
                />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-bold text-slate-900">{s.ticker}</p>
                  <p className="text-[10px] text-slate-400 truncate">{s.name}</p>
                </div>
                {watched ? (
                  <Star className="w-3.5 h-3.5 text-amber-400 flex-shrink-0" fill="currentColor" />
                ) : isAdding ? (
                  <div className="w-3.5 h-3.5 border-2 border-slate-300 border-t-black rounded-full animate-spin flex-shrink-0" />
                ) : (
                  <Plus className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Sentiment bar ─────────────────────────────────────────────────────────────
function SentimentBar({ score }: { score: number }) {
  const pct = Math.max(0, Math.min(100, score));
  const color = score >= 65 ? 'bg-emerald-500' : score >= 45 ? 'bg-slate-400' : 'bg-rose-500';
  return (
    <div className="flex items-center gap-2">
      <div className="w-16 h-1.5 bg-slate-100 rounded-full overflow-hidden">
        <div className={cn('h-full rounded-full transition-all duration-500', color)} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs text-slate-400 font-mono w-6">{pct}</span>
    </div>
  );
}

// ── Main component ──────────────────────────────────────────────────────────
export default function Watchlist({ stocks, onSelectStock }: WatchlistProps) {
  const [items, setItems] = useState<WatchlistItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [removingTicker, setRemovingTicker] = useState<string | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>('ticker');
  const [sortDir, setSortDir] = useState<SortDir>('asc');

  const load = () =>
    fetchWatchlist()
      .then(setItems)
      .catch(console.error)
      .finally(() => setLoading(false));

  useEffect(() => { load(); }, []);

  const watchedTickers = useMemo(() => new Set(items.map((i) => i.ticker)), [items]);

  const stockByTicker = useMemo(() => {
    const m: Record<string, Stock> = {};
    for (const s of stocks) m[s.ticker] = s;
    return m;
  }, [stocks]);

  const handleAdd = async (ticker: string) => {
    await addToWatchlist(ticker);
    await fetchWatchlist().then(setItems);
  };

  const handleRemove = async (ticker: string) => {
    setRemovingTicker(ticker);
    try {
      await removeFromWatchlist(ticker);
      setItems((prev) => prev.filter((i) => i.ticker !== ticker));
    } catch (err) {
      console.error(err);
    } finally {
      setRemovingTicker(null);
    }
  };

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir(key === 'ticker' ? 'asc' : 'desc');
    }
  };

  const sorted = useMemo(() => {
    return [...items].sort((a, b) => {
      let v: number;
      if (sortKey === 'ticker') {
        v = a.ticker.localeCompare(b.ticker);
      } else {
        v = (a[sortKey] as number) - (b[sortKey] as number);
      }
      return sortDir === 'asc' ? v : -v;
    });
  }, [items, sortKey, sortDir]);

  // Summary stats
  const avgUpside = items.length ? items.reduce((s, i) => s + i.upside, 0) / items.length : 0;
  const bullishCount = items.filter((i) => i.sentiment >= 65).length;
  const topUpside = items.length ? [...items].sort((a, b) => b.upside - a.upside)[0] : null;

  const SortTh = ({ label, k }: { label: string; k: SortKey }) => (
    <th
      className="pb-4 font-bold text-xs uppercase tracking-widest text-slate-400 text-right cursor-pointer select-none hover:text-slate-600 transition-colors"
      onClick={() => toggleSort(k)}
    >
      <span className="flex items-center justify-end gap-1">
        {label}
        {sortKey === k && (
          sortDir === 'asc'
            ? <ArrowUp className="w-3 h-3" />
            : <ArrowDown className="w-3 h-3" />
        )}
      </span>
    </th>
  );

  return (
    <div className="max-w-screen-2xl mx-auto space-y-8 animate-in fade-in duration-500">
      {/* Header */}
      <header className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h1 className="text-4xl font-extrabold text-slate-900 tracking-tighter mb-2">
            Watchlist
          </h1>
          <p className="text-slate-500 max-w-xl">
            Track EGX stocks you're monitoring. Search and add any listed company to follow their valuation and sentiment in real time.
          </p>
        </div>
        <AddSearch stocks={stocks} watchedTickers={watchedTickers} onAdd={handleAdd} />
      </header>

      {/* Loading */}
      {loading && (
        <div className="flex flex-col items-center justify-center py-24 gap-4">
          <div className="w-8 h-8 border-4 border-slate-200 border-t-black rounded-full animate-spin" />
          <p className="text-slate-400 text-sm">Loading watchlist…</p>
        </div>
      )}

      {/* Empty state */}
      {!loading && items.length === 0 && (
        <div className="flex flex-col items-center justify-center min-h-[50vh] gap-6 text-center">
          <div className="w-20 h-20 bg-slate-100 rounded-2xl flex items-center justify-center">
            <Star className="w-9 h-9 text-slate-300" />
          </div>
          <div>
            <h2 className="text-2xl font-bold text-slate-900 mb-2">Your watchlist is empty</h2>
            <p className="text-slate-400 max-w-xs">
              Use the search bar above to add EGX stocks you want to monitor.
            </p>
          </div>
        </div>
      )}

      {/* Content */}
      {!loading && items.length > 0 && (
        <>
          {/* Summary cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-white rounded-2xl p-5 shadow-sm border border-slate-100/50">
              <div className="w-9 h-9 rounded-xl bg-amber-50 text-amber-500 flex items-center justify-center mb-3">
                <Star className="w-5 h-5" fill="currentColor" />
              </div>
              <p className="text-xs font-bold uppercase tracking-widest text-slate-400 mb-1">Watching</p>
              <p className="text-2xl font-extrabold text-slate-900">{items.length}</p>
            </div>
            <div className="bg-white rounded-2xl p-5 shadow-sm border border-slate-100/50">
              <div className={cn('w-9 h-9 rounded-xl flex items-center justify-center mb-3', avgUpside >= 0 ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-600')}>
                {avgUpside >= 0 ? <TrendingUp className="w-5 h-5" /> : <TrendingDown className="w-5 h-5" />}
              </div>
              <p className="text-xs font-bold uppercase tracking-widest text-slate-400 mb-1">Avg Upside</p>
              <p className={cn('text-2xl font-extrabold', avgUpside >= 0 ? 'text-emerald-600' : 'text-rose-600')}>
                {avgUpside >= 0 ? '+' : ''}{avgUpside.toFixed(1)}%
              </p>
            </div>
            <div className="bg-white rounded-2xl p-5 shadow-sm border border-slate-100/50">
              <div className="w-9 h-9 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center mb-3">
                <BarChart2 className="w-5 h-5" />
              </div>
              <p className="text-xs font-bold uppercase tracking-widest text-slate-400 mb-1">Bullish Signals</p>
              <p className="text-2xl font-extrabold text-slate-900">
                {bullishCount} <span className="text-sm font-medium text-slate-400">/ {items.length}</span>
              </p>
            </div>
            <div className="bg-white rounded-2xl p-5 shadow-sm border border-slate-100/50">
              <div className="w-9 h-9 rounded-xl bg-violet-50 text-violet-600 flex items-center justify-center mb-3">
                <TrendingUp className="w-5 h-5" />
              </div>
              <p className="text-xs font-bold uppercase tracking-widest text-slate-400 mb-1">Top Upside</p>
              <p className="text-2xl font-extrabold text-slate-900">
                {topUpside
                  ? <span className={topUpside.upside >= 0 ? 'text-emerald-600' : 'text-rose-600'}>{topUpside.ticker}</span>
                  : '—'}
              </p>
            </div>
          </div>

          {/* Table */}
          <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-100/50">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-bold">Tracked Stocks</h2>
              <span className="px-3 py-1 bg-slate-100 text-slate-500 text-[10px] font-bold uppercase tracking-widest rounded-full">
                {items.length} stocks
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-100">
                    {/* Non-sortable: Stock */}
                    <th
                      className="pb-4 font-bold text-xs uppercase tracking-widest text-slate-400 cursor-pointer select-none hover:text-slate-600 transition-colors"
                      onClick={() => toggleSort('ticker')}
                    >
                      <span className="flex items-center gap-1">
                        Stock
                        {sortKey === 'ticker' && (
                          sortDir === 'asc'
                            ? <ArrowUp className="w-3 h-3" />
                            : <ArrowDown className="w-3 h-3" />
                        )}
                      </span>
                    </th>
                    <SortTh label="Price" k="currentPrice" />
                    <SortTh label="Fair Value" k="upside" />
                    <SortTh label="Upside" k="upside" />
                    <SortTh label="% Below High" k="belowHigh" />
                    <SortTh label="P/E" k="peRatio" />
                    <SortTh label="Sentiment" k="sentiment" />
                    <th className="pb-4" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {sorted.map((item: WatchlistItem) => {
                    const stock = stockByTicker[item.ticker];
                    const sentiment = sentimentLabel(item.sentiment);
                    const isRemoving = removingTicker === item.ticker;
                    return (
                      <tr key={item.ticker} className="hover:bg-slate-50 transition-colors group">
                        {/* Stock name */}
                        <td className="py-4">
                          <button
                            onClick={() => { if (stock) onSelectStock(stock); }}
                            className="flex items-center gap-3 text-left"
                          >
                            <StockLogo
                              ticker={item.ticker}
                              logo={stock?.logo}
                              size="w-8 h-8"
                              textSize="text-[10px]"
                            />
                            <div>
                              <p className="font-bold text-sm text-slate-900 leading-tight group-hover:underline">{item.ticker}</p>
                              <p className="text-[11px] text-slate-400 max-w-[180px] truncate">{item.name}</p>
                            </div>
                          </button>
                        </td>
                        {/* Price */}
                        <td className="py-4 text-right font-mono text-sm font-medium">
                          {item.currentPrice > 0
                            ? `${item.currentPrice.toFixed(2)}`
                            : <span className="text-slate-300">—</span>}
                        </td>
                        {/* Fair Value */}
                        <td className="py-4 text-right font-mono text-sm font-bold">
                          {item.fairValue > 0
                            ? item.fairValue.toFixed(2)
                            : <span className="text-slate-300">—</span>}
                        </td>
                        {/* Upside */}
                        <td className="py-4 text-right">
                          {item.fairValue > 0 ? (
                            <div className={cn('flex items-center justify-end gap-1 font-bold text-sm', item.upside >= 0 ? 'text-emerald-600' : 'text-rose-600')}>
                              {item.upside >= 0 ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />}
                              {Math.abs(item.upside).toFixed(1)}%
                            </div>
                          ) : <span className="text-slate-300 text-sm">—</span>}
                        </td>
                        {/* % Below High */}
                        <td className="py-4 text-right">
                          <span className="text-xs px-2 py-1 bg-slate-100 rounded-lg font-medium">
                            {item.belowHigh.toFixed(1)}%
                          </span>
                        </td>
                        {/* P/E */}
                        <td className="py-4 text-right font-mono text-sm text-slate-500">
                          {item.peRatio > 0 ? item.peRatio.toFixed(1) : <span className="text-slate-300">—</span>}
                        </td>
                        {/* Sentiment */}
                        <td className="py-4 text-right">
                          <div className="flex flex-col items-end gap-1">
                            <span className={cn('text-[10px] font-bold px-2 py-0.5 rounded-full', sentiment.cls)}>
                              {sentiment.label}
                            </span>
                            <SentimentBar score={item.sentiment} />
                          </div>
                        </td>
                        {/* Remove */}
                        <td className="py-4 text-right">
                          <button
                            onClick={() => handleRemove(item.ticker)}
                            disabled={isRemoving}
                            className="p-1.5 rounded-lg hover:bg-rose-50 text-slate-300 hover:text-rose-500 transition-colors disabled:opacity-40 opacity-0 group-hover:opacity-100"
                            title={`Remove ${item.ticker} from watchlist`}
                          >
                            {isRemoving
                              ? <div className="w-4 h-4 border-2 border-rose-200 border-t-rose-500 rounded-full animate-spin" />
                              : <Trash2 className="w-4 h-4" />}
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
