import React, { useState, useMemo, useCallback } from 'react';
import {
  TrendingUp, TrendingDown, Award, Zap, BarChart2,
  AlertTriangle, ArrowUp, ArrowDown, SlidersHorizontal, X,
  Sparkles, RefreshCw,
} from 'lucide-react';
import { Stock, AIRecommendationItem, AIRecommendationsResponse } from '../types';
import { cn } from '../lib/utils';
import StockLogo from './StockLogo';
import { fetchAIRecommendations } from '../data';

interface MarketScannersProps {
  stocks: Stock[];
  loading: boolean;
  onSelectStock: (stock: Stock) => void;
}

type SortKey = 'upside' | 'currentPrice' | 'peRatio' | 'sentiment' | 'belowHigh' | 'high52w';
type SortDir = 'asc' | 'desc';

interface Preset {
  id: string;
  label: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  accent: string;        // Tailwind colour token
  filter: (s: Stock) => boolean;
  defaultSort: { key: SortKey; dir: SortDir };
}

const PRESETS: Preset[] = [
  {
    id: 'alpha-hunt',
    label: 'Alpha Hunt',
    description: 'Highest upside to fair value',
    icon: TrendingUp,
    accent: 'emerald',
    filter: (s) => s.upside > 5,
    defaultSort: { key: 'upside', dir: 'desc' },
  },
  {
    id: 'deep-value',
    label: 'Deep Value',
    description: 'Lowest P/E ratios in the market',
    icon: Award,
    accent: 'blue',
    filter: (s) => s.peRatio > 0 && s.peRatio < 15,
    defaultSort: { key: 'peRatio', dir: 'asc' },
  },
  {
    id: 'momentum',
    label: 'Near 52W High',
    description: 'Within 10% of yearly peak',
    icon: Zap,
    accent: 'violet',
    filter: (s) => s.high52w > 0 && s.belowHigh >= -10,
    defaultSort: { key: 'belowHigh', dir: 'desc' },
  },
  {
    id: 'value-floor',
    label: 'Value Floor',
    description: 'Closest to 52-week lows',
    icon: BarChart2,
    accent: 'amber',
    filter: (s) => s.low52w > 0 && s.currentPrice > 0,
    defaultSort: { key: 'belowHigh', dir: 'asc' },
  },
  {
    id: 'bullish',
    label: 'Bullish Consensus',
    description: 'Strongest technical buy signals',
    icon: TrendingUp,
    accent: 'green',
    filter: (s) => s.sentiment >= 62,
    defaultSort: { key: 'sentiment', dir: 'desc' },
  },
  {
    id: 'bearish-watch',
    label: 'Bearish Watch',
    description: 'Weak sentiment — risk zone',
    icon: AlertTriangle,
    accent: 'rose',
    filter: (s) => s.sentiment < 40,
    defaultSort: { key: 'sentiment', dir: 'asc' },
  },
  {
    id: 'overvalued',
    label: 'Overvalued',
    description: 'Trading above estimated fair value',
    icon: TrendingDown,
    accent: 'orange',
    filter: (s) => s.upside < -5,
    defaultSort: { key: 'upside', dir: 'asc' },
  },
];

const ACCENT_STYLES: Record<string, { pill: string; border: string; icon: string; badge: string }> = {
  emerald: {
    pill: 'bg-emerald-50 border-emerald-200 text-emerald-700',
    border: 'border-emerald-400',
    icon: 'text-emerald-500',
    badge: 'bg-emerald-100 text-emerald-700',
  },
  blue: {
    pill: 'bg-blue-50 border-blue-200 text-blue-700',
    border: 'border-blue-400',
    icon: 'text-blue-500',
    badge: 'bg-blue-100 text-blue-700',
  },
  violet: {
    pill: 'bg-violet-50 border-violet-200 text-violet-700',
    border: 'border-violet-400',
    icon: 'text-violet-500',
    badge: 'bg-violet-100 text-violet-700',
  },
  amber: {
    pill: 'bg-amber-50 border-amber-200 text-amber-700',
    border: 'border-amber-400',
    icon: 'text-amber-500',
    badge: 'bg-amber-100 text-amber-700',
  },
  green: {
    pill: 'bg-green-50 border-green-200 text-green-700',
    border: 'border-green-400',
    icon: 'text-green-500',
    badge: 'bg-green-100 text-green-700',
  },
  rose: {
    pill: 'bg-rose-50 border-rose-200 text-rose-700',
    border: 'border-rose-400',
    icon: 'text-rose-500',
    badge: 'bg-rose-100 text-rose-700',
  },
  orange: {
    pill: 'bg-orange-50 border-orange-200 text-orange-700',
    border: 'border-orange-400',
    icon: 'text-orange-500',
    badge: 'bg-orange-100 text-orange-700',
  },
};

const SORT_LABELS: Record<SortKey, string> = {
  upside: 'Upside %',
  currentPrice: 'Price',
  peRatio: 'P/E Ratio',
  sentiment: 'Sentiment',
  belowHigh: '% Below High',
  high52w: '52W High',
};

// ── AIPickCard sub-component ───────────────────────────────────────────────────

interface AIPickCardProps {
  item: AIRecommendationItem;
  stock?: Stock;
  type: 'buy' | 'sell';
  onSelect?: () => void;
}

function AIPickCard({ item, stock, type, onSelect }: AIPickCardProps) {
  const isBuy = type === 'buy';

  const convictionColor = {
    High: isBuy ? 'bg-emerald-500' : 'bg-rose-500',
    Medium: 'bg-amber-400',
    Low: 'bg-slate-300',
  }[item.conviction] ?? 'bg-slate-300';

  const convictionText = {
    High: isBuy ? 'text-emerald-700 bg-emerald-50' : 'text-rose-700 bg-rose-50',
    Medium: 'text-amber-700 bg-amber-50',
    Low: 'text-slate-500 bg-slate-100',
  }[item.conviction] ?? 'text-slate-500 bg-slate-100';

  return (
    <div
      onClick={onSelect}
      className={cn(
        'group rounded-xl border p-4 transition-all',
        isBuy
          ? 'border-emerald-100 bg-emerald-50/40 hover:border-emerald-300 hover:bg-emerald-50'
          : 'border-rose-100 bg-rose-50/40 hover:border-rose-300 hover:bg-rose-50',
        onSelect && 'cursor-pointer',
      )}
    >
      <div className="flex items-start gap-3">
        <StockLogo
          ticker={item.ticker}
          logo={stock?.logo}
          size="w-9 h-9"
          textSize="text-xs"
        />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-bold text-sm text-slate-900">{item.ticker}</span>
            <span className="text-xs text-slate-400 truncate">{item.name}</span>
            {stock && (
              <span className="ml-auto font-mono text-xs font-semibold text-slate-600">
                EGP {stock.currentPrice.toFixed(2)}
              </span>
            )}
          </div>
          <p className="text-xs text-slate-600 mt-1 leading-relaxed">{item.reason}</p>
          <div className="flex items-center gap-2 mt-2 flex-wrap">
            <span className={cn('inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full', convictionText)}>
              <span className={cn('w-1.5 h-1.5 rounded-full', convictionColor)} />
              {item.conviction} Conviction
            </span>
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-500">
              {item.scanner}
            </span>
            {stock && (
              <span className={cn(
                'text-[10px] font-bold px-2 py-0.5 rounded-full',
                stock.upside >= 0 ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700',
              )}>
                {stock.upside >= 0 ? '+' : ''}{stock.upside.toFixed(1)}% upside
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function MarketScanners({ stocks, loading, onSelectStock }: MarketScannersProps) {
  const [activePreset, setActivePreset] = useState<string>('alpha-hunt');
  const [selectedSector, setSelectedSector] = useState<string | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>('upside');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [showFilters, setShowFilters] = useState(false);

  // AI Picks state
  const [aiRecs, setAiRecs] = useState<AIRecommendationsResponse | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);

  const handleGenerateRecs = useCallback(async () => {
    setAiLoading(true);
    setAiError(null);
    try {
      const data = await fetchAIRecommendations();
      setAiRecs(data);
    } catch (err) {
      setAiError('Could not generate recommendations. Please try again.');
    } finally {
      setAiLoading(false);
    }
  }, []);

  const preset = PRESETS.find((p) => p.id === activePreset)!;
  const accentStyles = ACCENT_STYLES[preset.accent];

  const sectors = useMemo(() => {
    const unique = new Set(stocks.map((s) => s.sector).filter(Boolean));
    return Array.from(unique).sort();
  }, [stocks]);

  const handlePresetChange = (p: Preset) => {
    setActivePreset(p.id);
    setSortKey(p.defaultSort.key);
    setSortDir(p.defaultSort.dir);
    setSelectedSector(null);
  };

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir('desc');
    }
  };

  const results = useMemo(() => {
    let filtered = stocks.filter(preset.filter);
    if (selectedSector) filtered = filtered.filter((s) => s.sector === selectedSector);
    return [...filtered].sort((a, b) => {
      const av = a[sortKey] as number;
      const bv = b[sortKey] as number;
      return sortDir === 'asc' ? av - bv : bv - av;
    });
  }, [stocks, preset, selectedSector, sortKey, sortDir]);

  const SortIcon = ({ col }: { col: SortKey }) => {
    if (sortKey !== col) return <ArrowUp className="w-3 h-3 opacity-20" />;
    return sortDir === 'asc'
      ? <ArrowUp className="w-3 h-3 text-black" />
      : <ArrowDown className="w-3 h-3 text-black" />;
  };

  const SortTh = ({
    col, label, className,
  }: { col: SortKey; label: string; className?: string }) => (
    <th
      className={cn(
        'pb-4 font-bold text-xs uppercase tracking-widest text-slate-400 cursor-pointer select-none hover:text-slate-700 transition-colors',
        className,
      )}
      onClick={() => toggleSort(col)}
    >
      <span className="inline-flex items-center gap-1">
        {label}
        <SortIcon col={col} />
      </span>
    </th>
  );

  return (
    <div className="max-w-screen-2xl mx-auto space-y-8 animate-in fade-in duration-500">
      {/* Header */}
      <header>
        <h1 className="text-4xl font-extrabold text-slate-900 tracking-tighter mb-2">
          Market Scanners
        </h1>
        <p className="text-slate-500 max-w-xl">
          Run pre-built screens or filter by sector to surface actionable EGX opportunities.
        </p>
      </header>

      {/* Preset Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-7 gap-3">
        {PRESETS.map((p) => {
          const isActive = activePreset === p.id;
          const s = ACCENT_STYLES[p.accent];
          return (
            <button
              key={p.id}
              onClick={() => handlePresetChange(p)}
              className={cn(
                'flex flex-col items-start gap-2 p-4 rounded-2xl border text-left transition-all',
                isActive
                  ? `${s.pill} ${s.border} shadow-sm`
                  : 'bg-white border-slate-100 hover:border-slate-200 hover:bg-slate-50',
              )}
            >
              <p.icon className={cn('w-5 h-5', isActive ? s.icon : 'text-slate-400')} />
              <div>
                <p className={cn('text-xs font-bold leading-tight', isActive ? '' : 'text-slate-700')}>
                  {p.label}
                </p>
                <p className={cn('text-[10px] mt-0.5 leading-tight', isActive ? 'opacity-70' : 'text-slate-400')}>
                  {p.description}
                </p>
              </div>
            </button>
          );
        })}
      </div>

      {/* Results Panel */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-100/50 overflow-hidden">
        {/* Panel Header */}
        <div className="flex items-center justify-between p-6 border-b border-slate-100">
          <div className="flex items-center gap-3">
            <div className={cn('w-1 h-6 rounded-full', `bg-${preset.accent}-400`)} />
            <div>
              <h2 className="text-lg font-bold">{preset.label}</h2>
              <p className="text-xs text-slate-400">{preset.description}</p>
            </div>
            {!loading && (
              <span className={cn('px-2.5 py-0.5 rounded-full text-xs font-bold', accentStyles.badge)}>
                {results.length} stocks
              </span>
            )}
          </div>
          <button
            onClick={() => setShowFilters((v) => !v)}
            className={cn(
              'flex items-center gap-2 px-4 py-2 rounded-full text-sm font-semibold border transition-all',
              showFilters
                ? 'bg-black text-white border-black'
                : 'border-slate-200 text-slate-600 hover:bg-slate-50',
            )}
          >
            <SlidersHorizontal className="w-4 h-4" />
            Filters
            {selectedSector && (
              <span className="w-2 h-2 rounded-full bg-emerald-400 inline-block" />
            )}
          </button>
        </div>

        {/* Filter Bar */}
        {showFilters && (
          <div className="px-6 py-4 bg-slate-50 border-b border-slate-100">
            <div className="flex items-center gap-3 flex-wrap">
              <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">Sector</span>
              <button
                onClick={() => setSelectedSector(null)}
                className={cn(
                  'px-3 py-1 rounded-full text-xs font-bold transition-colors',
                  selectedSector === null ? 'bg-black text-white' : 'bg-white border border-slate-200 text-slate-500 hover:bg-slate-100',
                )}
              >
                All
              </button>
              {sectors.map((sector) => (
                <button
                  key={sector}
                  onClick={() => setSelectedSector(sector === selectedSector ? null : sector)}
                  className={cn(
                    'px-3 py-1 rounded-full text-xs font-bold transition-colors flex items-center gap-1',
                    selectedSector === sector
                      ? 'bg-black text-white'
                      : 'bg-white border border-slate-200 text-slate-500 hover:bg-slate-100',
                  )}
                >
                  {sector}
                  {selectedSector === sector && <X className="w-3 h-3" />}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Loading */}
        {loading && (
          <div className="flex flex-col items-center justify-center py-20 gap-4">
            <div className="w-8 h-8 border-4 border-slate-200 border-t-black rounded-full animate-spin" />
            <p className="text-slate-400 text-sm">Running scanner…</p>
          </div>
        )}

        {/* Table */}
        {!loading && (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-100">
                  <th className="pb-4 pt-5 px-6 font-bold text-xs uppercase tracking-widest text-slate-400">
                    Ticker
                  </th>
                  <th className="pb-4 pt-5 font-bold text-xs uppercase tracking-widest text-slate-400">
                    Company
                  </th>
                  <th className="pb-4 pt-5 font-bold text-xs uppercase tracking-widest text-slate-400">
                    Sector
                  </th>
                  <SortTh col="currentPrice" label="Price" className="text-right pb-4 pt-5" />
                  <SortTh col="upside" label="Upside %" className="text-right pb-4 pt-5" />
                  <SortTh col="belowHigh" label="vs 52W High" className="text-right pb-4 pt-5" />
                  <SortTh col="peRatio" label="P/E" className="text-right pb-4 pt-5" />
                  <SortTh col="sentiment" label="Sentiment" className="text-right pb-4 pt-5 pr-6" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {results.map((stock) => (
                  <tr
                    key={stock.ticker}
                    onClick={() => onSelectStock(stock)}
                    className="hover:bg-slate-50 transition-colors cursor-pointer group"
                  >
                    <td className="py-4 px-6">
                      <StockLogo
                        ticker={stock.ticker}
                        logo={stock.logo}
                        size="w-10 h-10"
                        textSize="text-xs"
                      />
                    </td>
                    <td className="py-4 pr-4">
                      <p className="font-bold text-sm text-slate-900 group-hover:text-black">
                        {stock.ticker}
                      </p>
                      <p className="text-xs text-slate-400 truncate max-w-[160px]">{stock.name}</p>
                    </td>
                    <td className="py-4 pr-4">
                      <span className="px-2 py-0.5 bg-slate-100 text-slate-500 text-[10px] font-bold rounded-full whitespace-nowrap">
                        {stock.sector}
                      </span>
                    </td>
                    <td className="py-4 text-right font-mono font-semibold text-sm">
                      EGP {stock.currentPrice.toFixed(2)}
                    </td>
                    <td className="py-4 text-right">
                      <span
                        className={cn(
                          'inline-flex items-center gap-0.5 font-bold text-sm px-2 py-0.5 rounded-full',
                          stock.upside >= 0
                            ? 'text-emerald-700 bg-emerald-50'
                            : 'text-rose-700 bg-rose-50',
                        )}
                      >
                        {stock.upside >= 0 ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />}
                        {stock.upside >= 0 ? '+' : ''}{stock.upside.toFixed(1)}%
                      </span>
                    </td>
                    <td className="py-4 text-right font-mono text-sm text-slate-500">
                      {stock.belowHigh.toFixed(1)}%
                    </td>
                    <td className="py-4 text-right font-mono text-sm text-slate-500">
                      {stock.peRatio > 0 ? stock.peRatio.toFixed(1) : '—'}
                    </td>
                    <td className="py-4 text-right pr-6">
                      <div className="flex items-center justify-end gap-2">
                        <div className="w-16 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                          <div
                            className={cn(
                              'h-full rounded-full',
                              stock.sentiment >= 60
                                ? 'bg-emerald-400'
                                : stock.sentiment >= 40
                                  ? 'bg-amber-400'
                                  : 'bg-rose-400',
                            )}
                            style={{ width: `${stock.sentiment}%` }}
                          />
                        </div>
                        <span
                          className={cn(
                            'text-xs font-bold w-6 text-right',
                            stock.sentiment >= 60
                              ? 'text-emerald-600'
                              : stock.sentiment >= 40
                                ? 'text-amber-600'
                                : 'text-rose-600',
                          )}
                        >
                          {stock.sentiment}
                        </span>
                      </div>
                    </td>
                  </tr>
                ))}

                {results.length === 0 && (
                  <tr>
                    <td colSpan={8} className="py-16 text-center">
                      <p className="text-slate-400 text-sm">
                        No stocks match this scanner
                        {selectedSector ? ` in ${selectedSector}` : ''}.
                      </p>
                      {selectedSector && (
                        <button
                          onClick={() => setSelectedSector(null)}
                          className="mt-2 text-xs text-black font-bold underline"
                        >
                          Clear sector filter
                        </button>
                      )}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}

        {/* Footer */}
        {!loading && results.length > 0 && (
          <div className="px-6 py-3 border-t border-slate-50 flex justify-between items-center">
            <p className="text-xs text-slate-400">
              Click any row to open the full stock analysis
            </p>
            <p className="text-xs text-slate-400 font-mono">
              {results.length} result{results.length !== 1 ? 's' : ''}
              {selectedSector ? ` · ${selectedSector}` : ''}
            </p>
          </div>
        )}
      </div>

      {/* ── AI Picks Section ─────────────────────────────────────────────── */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-100/50 overflow-hidden">
        {/* Panel header */}
        <div className="flex items-center justify-between p-6 border-b border-slate-100">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-violet-50 flex items-center justify-center">
              <Sparkles className="w-5 h-5 text-violet-500" />
            </div>
            <div>
              <h2 className="text-lg font-bold">AI Picks</h2>
              <p className="text-xs text-slate-400">Gemini-powered buy &amp; sell signals from all scanners</p>
            </div>
            {aiRecs && (
              <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-violet-100 text-violet-700">
                Generated at {aiRecs.generated_at}
              </span>
            )}
          </div>
          <button
            onClick={handleGenerateRecs}
            disabled={aiLoading || loading}
            className={cn(
              'flex items-center gap-2 px-4 py-2 rounded-full text-sm font-semibold border transition-all',
              aiLoading
                ? 'border-slate-200 text-slate-400 cursor-not-allowed'
                : 'bg-violet-600 text-white border-violet-600 hover:bg-violet-700',
            )}
          >
            {aiLoading
              ? <><RefreshCw className="w-4 h-4 animate-spin" /> Analyzing…</>
              : aiRecs
                ? <><RefreshCw className="w-4 h-4" /> Refresh</>
                : <><Sparkles className="w-4 h-4" /> Generate</>}
          </button>
        </div>

        {/* Empty state */}
        {!aiRecs && !aiLoading && !aiError && (
          <div className="flex flex-col items-center justify-center py-16 gap-3 text-center">
            <div className="w-12 h-12 rounded-2xl bg-violet-50 flex items-center justify-center">
              <Sparkles className="w-6 h-6 text-violet-400" />
            </div>
            <p className="text-slate-500 text-sm max-w-xs">
              Click <span className="font-bold text-violet-600">Generate</span> to get Gemini AI buy &amp; sell picks based on all scanner data.
            </p>
          </div>
        )}

        {/* Loading */}
        {aiLoading && (
          <div className="flex flex-col items-center justify-center py-16 gap-4">
            <div className="w-8 h-8 border-4 border-violet-100 border-t-violet-500 rounded-full animate-spin" />
            <p className="text-slate-400 text-sm">Gemini is analyzing the market…</p>
          </div>
        )}

        {/* Error */}
        {aiError && !aiLoading && (
          <div className="flex items-center gap-3 px-6 py-4 text-rose-600 text-sm">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            {aiError}
          </div>
        )}

        {/* Results */}
        {aiRecs && !aiLoading && (
          <div className="p-6 space-y-6">
            {/* Market summary */}
            <div className="bg-slate-50 rounded-xl px-5 py-4">
              <p className="text-xs font-bold uppercase tracking-widest text-slate-400 mb-1.5">Market Commentary</p>
              <p className="text-sm text-slate-700 leading-relaxed">{aiRecs.summary}</p>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Buy picks */}
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <ArrowUp className="w-4 h-4 text-emerald-500" />
                  <h3 className="text-sm font-bold text-slate-700 uppercase tracking-widest">Buy</h3>
                  <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700">
                    {aiRecs.buy.length}
                  </span>
                </div>
                {aiRecs.buy.length === 0 && (
                  <p className="text-xs text-slate-400 pl-6">No buy picks at this time.</p>
                )}
                {aiRecs.buy.map((item) => {
                  const stock = stocks.find((s) => s.ticker === item.ticker);
                  return (
                    <React.Fragment key={item.ticker}>
                      <AIPickCard
                        item={item}
                        stock={stock}
                        type="buy"
                        onSelect={stock ? () => onSelectStock(stock) : undefined}
                      />
                    </React.Fragment>
                  );
                })}
              </div>

              {/* Sell picks */}
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <ArrowDown className="w-4 h-4 text-rose-500" />
                  <h3 className="text-sm font-bold text-slate-700 uppercase tracking-widest">Sell / Avoid</h3>
                  <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-rose-100 text-rose-700">
                    {aiRecs.sell.length}
                  </span>
                </div>
                {aiRecs.sell.length === 0 && (
                  <p className="text-xs text-slate-400 pl-6">No sell picks at this time.</p>
                )}
                {aiRecs.sell.map((item) => {
                  const stock = stocks.find((s) => s.ticker === item.ticker);
                  return (
                    <React.Fragment key={item.ticker}>
                      <AIPickCard
                        item={item}
                        stock={stock}
                        type="sell"
                        onSelect={stock ? () => onSelectStock(stock) : undefined}
                      />
                    </React.Fragment>
                  );
                })}
              </div>
            </div>

            <p className="text-[10px] text-slate-300 text-center">
              AI recommendations are for informational purposes only. Not financial advice. Always do your own research.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
