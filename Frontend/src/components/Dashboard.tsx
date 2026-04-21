import { useState, useMemo } from 'react';
import { Download, ArrowUp, ArrowDown, ChevronLeft, ChevronRight, TrendingUp, BarChart2 } from 'lucide-react';
import { Stock } from '../types';
import { cn } from '../lib/utils';
import StockLogo from './StockLogo';

interface DashboardProps {
  stocks: Stock[];
  loading: boolean;
  onSelectStock: (stock: Stock) => void;
}

const ITEMS_PER_PAGE = 12;

function exportToCsv(stocks: Stock[], sector: string | null) {
  const headers = [
    'Ticker', 'Company Name', 'Sector', 'Industry',
    'Price (EGP)', '52W High', '52W Low', '% Below High',
    'Fair Value', 'Upside (%)', 'P/E Ratio',
    'Market Cap', 'EPS', 'Revenue', 'Sentiment',
  ];

  const escape = (v: string | number) => {
    const s = String(v);
    return s.includes(',') || s.includes('"') || s.includes('\n')
      ? `"${s.replace(/"/g, '""')}"`
      : s;
  };

  const rows = stocks.map((s) => [
    escape(s.ticker),
    escape(s.name),
    escape(s.sector),
    escape(s.industry),
    escape(s.currentPrice.toFixed(2)),
    escape(s.high52w > 0 ? s.high52w.toFixed(2) : ''),
    escape(s.low52w > 0 ? s.low52w.toFixed(2) : ''),
    escape(s.belowHigh.toFixed(1)),
    escape(s.fairValue.toFixed(2)),
    escape(s.upside.toFixed(1)),
    escape(s.peRatio > 0 ? s.peRatio.toFixed(1) : ''),
    escape(s.marketCap),
    escape(s.eps !== 0 ? s.eps.toFixed(2) : ''),
    escape(s.revenue),
    escape(s.sentiment),
  ].join(','));

  const csv = [headers.join(','), ...rows].join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const date = new Date().toISOString().slice(0, 10);
  const suffix = sector ? `_${sector.replace(/\s+/g, '_')}` : '_all';
  a.href = url;
  a.download = `EGX_stocks${suffix}_${date}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export default function Dashboard({ stocks, loading, onSelectStock }: DashboardProps) {
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedSector, setSelectedSector] = useState<string | null>(null);

  const sectors = useMemo(() => {
    const unique = new Set(stocks.map((s) => s.sector).filter(Boolean));
    return Array.from(unique).sort();
  }, [stocks]);

  const filteredStocks = useMemo(() => {
    if (!selectedSector) return stocks;
    return stocks.filter((s) => s.sector === selectedSector);
  }, [stocks, selectedSector]);

  const totalPages = Math.max(1, Math.ceil(filteredStocks.length / ITEMS_PER_PAGE));
  const safePage = Math.min(currentPage, totalPages);

  const paginatedStocks = useMemo(() => {
    const start = (safePage - 1) * ITEMS_PER_PAGE;
    return filteredStocks.slice(start, start + ITEMS_PER_PAGE);
  }, [filteredStocks, safePage]);

  const alphaLeaders = useMemo(() => {
    const withUpside = stocks.filter((s) => s.upside > 0);
    const sorted = [...withUpside].sort((a, b) => b.upside - a.upside).slice(0, 3);
    const maxUpside = sorted[0]?.upside || 1;
    return sorted.map((s) => ({
      ticker: s.ticker,
      name: s.name,
      upside: s.upside,
      progress: Math.min(100, Math.round((s.upside / maxUpside) * 100)),
      logo: s.logo,
    }));
  }, [stocks]);

  const valueFloor = useMemo(() => {
    const valid = stocks.filter((s) => s.low52w > 0 && s.currentPrice > 0);
    return [...valid]
      .sort((a, b) => {
        const aL = (a.currentPrice - a.low52w) / a.low52w;
        const bL = (b.currentPrice - b.low52w) / b.low52w;
        return aL - bL;
      })
      .slice(0, 3)
      .map((s) => ({
        ticker: s.ticker,
        name: s.name,
        fromLow: parseFloat(((s.currentPrice - s.low52w) / s.low52w * 100).toFixed(1)),
        logo: s.logo,
      }));
  }, [stocks]);

  return (
    <div className="max-w-screen-2xl mx-auto space-y-8 animate-in fade-in duration-500">
      {/* Header */}
      <header className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h1 className="text-4xl font-extrabold text-slate-900 tracking-tighter mb-2">
            EGX Alpha Discovery
          </h1>
          <p className="text-slate-500 max-w-xl">
            Deep fundamental screening for undervalued opportunities on the Egyptian Exchange (EGX).
            Data sourced from Yahoo Finance — delayed ~15 minutes.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => exportToCsv(filteredStocks, selectedSector)}
            className="flex items-center gap-2 px-6 py-3 bg-black text-white rounded-full font-semibold hover:bg-zinc-800 hover:scale-105 hover:shadow-lg active:scale-95 transition-all duration-200 cursor-pointer">
            <Download className="w-4 h-4" />
            <span>CSV Export</span>
          </button>
        </div>
      </header>

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-8">
        {/* Main Table */}
        <div className="xl:col-span-9 space-y-6">
          <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-100/50">
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-4">
                <h2 className="text-xl font-bold">Valuation Matrix</h2>
                <span className="px-3 py-1 bg-slate-100 text-slate-500 text-[10px] font-bold uppercase tracking-widest rounded-full">
                  EGX LIVE
                </span>
              </div>
              <div className="flex items-center gap-2 text-emerald-600 text-xs font-medium">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                </span>
                {loading ? 'Loading EGX data…' : `${stocks.length} stocks loaded`}
              </div>
            </div>

            {/* Sector Filter Pills */}
            {sectors.length > 0 && (
              <div className="flex flex-wrap gap-2 mb-6">
                <button
                  onClick={() => { setSelectedSector(null); setCurrentPage(1); }}
                  className={cn(
                    'px-3 py-1 rounded-full text-xs font-bold transition-colors',
                    selectedSector === null
                      ? 'bg-black text-white'
                      : 'bg-slate-100 text-slate-500 hover:bg-slate-200',
                  )}
                >
                  All
                </button>
                {sectors.map((sector) => (
                  <button
                    key={sector}
                    onClick={() => { setSelectedSector(sector); setCurrentPage(1); }}
                    className={cn(
                      'px-3 py-1 rounded-full text-xs font-bold transition-colors',
                      selectedSector === sector
                        ? 'bg-black text-white'
                        : 'bg-slate-100 text-slate-500 hover:bg-slate-200',
                    )}
                  >
                    {sector}
                  </button>
                ))}
              </div>
            )}

            {/* Loading skeleton */}
            {loading && (
              <div className="flex flex-col items-center justify-center py-16 gap-4">
                <div className="w-8 h-8 border-4 border-slate-200 border-t-black rounded-full animate-spin" />
                <p className="text-slate-400 text-sm">Fetching EGX market data…</p>
              </div>
            )}

            {/* Table */}
            {!loading && (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-slate-100">
                      <th className="pb-4 font-bold text-xs uppercase tracking-widest text-slate-400">Ticker</th>
                      <th className="pb-4 font-bold text-xs uppercase tracking-widest text-slate-400">Company Name</th>
                      <th className="pb-4 font-bold text-xs uppercase tracking-widest text-slate-400 text-right">Price (EGP)</th>
                      <th className="pb-4 font-bold text-xs uppercase tracking-widest text-slate-400 text-right">52W High</th>
                      <th className="pb-4 font-bold text-xs uppercase tracking-widest text-slate-400 text-right">% Below High</th>
                      <th className="pb-4 font-bold text-xs uppercase tracking-widest text-slate-400 text-right">Fair Value</th>
                      <th className="pb-4 font-bold text-xs uppercase tracking-widest text-slate-400 text-right">Upside (%)</th>
                      <th className="pb-4 font-bold text-xs uppercase tracking-widest text-slate-400 text-right">P/E</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {paginatedStocks.map((stock) => (
                      <tr
                        key={stock.ticker}
                        onClick={() => onSelectStock(stock)}
                        className="hover:bg-slate-50 transition-colors cursor-pointer"
                      >
                        <td className="py-4">
                          <div className="flex items-center gap-2.5">
                            <StockLogo ticker={stock.ticker} logo={stock.logo} size="w-7 h-7" textSize="text-[10px]" />
                            <span className="font-bold text-black">{stock.ticker}</span>
                          </div>
                        </td>
                        <td className="py-4 text-slate-500 text-sm font-medium">{stock.name}</td>
                        <td className="py-4 text-right font-mono font-medium">
                          {stock.currentPrice.toFixed(2)}
                        </td>
                        <td className="py-4 text-right font-mono text-slate-400">
                          {stock.high52w > 0 ? stock.high52w.toFixed(2) : '—'}
                        </td>
                        <td className="py-4 text-right">
                          <span className="text-xs px-2 py-1 bg-slate-100 rounded-lg">
                            {stock.belowHigh.toFixed(1)}%
                          </span>
                        </td>
                        <td className="py-4 text-right font-mono font-bold">
                          {stock.fairValue.toFixed(2)}
                        </td>
                        <td className="py-4 text-right">
                          <div
                            className={cn(
                              'flex items-center justify-end gap-1 font-bold',
                              stock.upside >= 0 ? 'text-emerald-600' : 'text-rose-600',
                            )}
                          >
                            {stock.upside >= 0 ? (
                              <ArrowUp className="w-3 h-3" />
                            ) : (
                              <ArrowDown className="w-3 h-3" />
                            )}
                            {Math.abs(stock.upside).toFixed(1)}%
                          </div>
                        </td>
                        <td className="py-4 text-right font-mono text-slate-500">
                          {stock.peRatio > 0 ? stock.peRatio.toFixed(1) : '—'}
                        </td>
                      </tr>
                    ))}
                    {!loading && paginatedStocks.length === 0 && (
                      <tr>
                        <td colSpan={8} className="py-12 text-center text-slate-400 text-sm">
                          No stocks found{selectedSector ? ` in ${selectedSector}` : ''}.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}

            {/* Pagination */}
            {!loading && totalPages > 1 && (
              <div className="mt-8 flex items-center justify-between">
                <span className="text-xs text-slate-400 font-medium">
                  Page {safePage} of {totalPages} · {filteredStocks.length} stocks
                </span>
                <div className="flex gap-2">
                  <button
                    disabled={safePage === 1}
                    onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                    className="p-2 border border-slate-100 rounded-lg hover:bg-slate-50 transition-colors disabled:opacity-40"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <button
                    disabled={safePage === totalPages}
                    onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                    className="p-2 border border-slate-100 rounded-lg hover:bg-slate-50 transition-colors disabled:opacity-40"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Insights Sidebar */}
        <aside className="xl:col-span-3 space-y-6">
          {/* Alpha Leaders */}
          <section className="bg-white rounded-2xl p-6 shadow-sm border border-slate-100/50">
            <div className="flex items-center justify-between mb-6">
              <h3 className="font-bold text-lg">Alpha Leaders</h3>
              <TrendingUp className="w-5 h-5 text-emerald-400" />
            </div>
            {loading ? (
              <div className="space-y-3">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="h-16 bg-slate-100 rounded-xl animate-pulse" />
                ))}
              </div>
            ) : alphaLeaders.length > 0 ? (
              <div className="space-y-4">
                {alphaLeaders.map((leader) => (
                  <div
                    key={leader.ticker}
                    className="p-4 bg-slate-50 rounded-xl group hover:bg-slate-100 transition-colors cursor-pointer border-l-4 border-emerald-400"
                  >
                    <div className="flex justify-between items-start mb-1">
                      <div className="flex items-center gap-2">
                        <StockLogo ticker={leader.ticker} logo={leader.logo} size="w-6 h-6" textSize="text-[9px]" />
                        <span className="font-bold text-sm">{leader.ticker}</span>
                      </div>
                      <span className="text-[10px] font-bold text-emerald-600">
                        +{leader.upside.toFixed(1)}% Upside
                      </span>
                    </div>
                    <p className="text-xs text-slate-500 mb-2 truncate">{leader.name}</p>
                    <div className="w-full bg-slate-200 h-1 rounded-full overflow-hidden">
                      <div
                        className="bg-emerald-400 h-full"
                        style={{ width: `${leader.progress}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-slate-400 text-center py-4">No undervalued stocks found.</p>
            )}
          </section>

          {/* Value Floor */}
          <section className="bg-white rounded-2xl p-6 shadow-sm border border-slate-100/50">
            <div className="flex items-center justify-between mb-6">
              <h3 className="font-bold text-lg">Value Floor</h3>
              <BarChart2 className="w-5 h-5 text-slate-400" />
            </div>
            {loading ? (
              <div className="space-y-3">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="h-12 bg-slate-100 rounded-xl animate-pulse" />
                ))}
              </div>
            ) : valueFloor.length > 0 ? (
              <div className="space-y-4">
                {valueFloor.map((item) => (
                  <div
                    key={item.ticker}
                    className="flex items-center justify-between p-3 hover:bg-slate-50 rounded-xl transition-colors cursor-pointer"
                  >
                    <div className="flex items-center gap-2.5">
                      <StockLogo ticker={item.ticker} logo={item.logo} size="w-6 h-6" textSize="text-[9px]" />
                      <div className="flex flex-col">
                        <span className="font-bold text-sm">{item.ticker}</span>
                        <span className="text-[10px] text-slate-500 truncate max-w-[100px]">
                          {item.name}
                        </span>
                      </div>
                    </div>
                    <div className="text-right">
                      <span className="block font-mono text-xs font-bold text-amber-600">
                        +{item.fromLow}%
                      </span>
                      <span className="block text-[10px] text-slate-400">From Low</span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-slate-400 text-center py-4">Awaiting stock data.</p>
            )}
          </section>

          {/* Promo card */}
          <div className="relative overflow-hidden rounded-2xl bg-slate-900 p-6 flex flex-col gap-4">
            <div className="absolute -right-4 -top-4 w-32 h-32 bg-emerald-500/10 rounded-full blur-2xl" />
            <div className="relative z-10">
              <span className="inline-block px-2 py-0.5 bg-emerald-500/20 text-emerald-400 text-[10px] font-bold uppercase tracking-widest rounded mb-3">
                PRO
              </span>
              <h4 className="text-white font-bold text-xl mb-2">Institutional Intelligence</h4>
              <p className="text-white/60 text-xs mb-4">
                Unlock EGX dark pool flows, institutional positioning data, and legislative trade tracking.
              </p>
              <button className="w-full py-3 bg-white text-black rounded-full font-bold text-sm hover:bg-slate-100 transition-all">
                Go Premium
              </button>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
