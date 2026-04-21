import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  PlusCircle, Trash2, Pencil, ArrowUp, ArrowDown,
  Wallet, TrendingUp, TrendingDown, BarChart2, X, Check, AlertCircle, Search,
} from 'lucide-react';
import { Stock, PortfolioStats, PortfolioHolding } from '../types';
import {
  fetchPortfolio, addHolding, removeHolding, updateHolding,
} from '../data';
import { cn } from '../lib/utils';
import StockLogo from './StockLogo';

interface PortfolioProps {
  stocks: Stock[];
  onSelectStock: (stock: Stock) => void;
}

// ── helpers ───────────────────────────────────────────────────────────────────
const fmt = (n: number, decimals = 2) =>
  n.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });

const AVATAR_COLORS = [
  'bg-emerald-500', 'bg-blue-500', 'bg-violet-500',
  'bg-amber-500', 'bg-rose-500', 'bg-cyan-500',
];
function avatarColor(ticker: string): string {
  const sum = ticker.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0);
  return AVATAR_COLORS[sum % AVATAR_COLORS.length];
}

// ── Add / Edit modal ──────────────────────────────────────────────────────────
interface HoldingFormProps {
  stocks: Stock[];
  existing?: PortfolioHolding;        // present when editing
  onSave: (ticker: string, qty: number, avgCost: number) => Promise<void>;
  onCancel: () => void;
}

function HoldingForm({ stocks, existing, onSave, onCancel }: HoldingFormProps) {
  const [ticker, setTicker] = useState(existing?.ticker ?? '');
  const [tickerSearch, setTickerSearch] = useState(
    existing ? `${existing.ticker} — ${existing.name ?? ''}` : '',
  );
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [quantity, setQuantity] = useState(existing ? String(existing.quantity) : '');
  const [avgCost, setAvgCost] = useState(existing ? String(existing.avgCost) : '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const searchRef = useRef<HTMLDivElement>(null);

  const suggestions = useMemo(() => {
    const q = tickerSearch.trim().toLowerCase();
    if (!q) return stocks.slice(0, 8);
    return stocks
      .filter(
        (s) =>
          s.ticker.toLowerCase().includes(q) ||
          s.name.toLowerCase().includes(q),
      )
      .slice(0, 8);
  }, [stocks, tickerSearch]);

  // Close suggestions when clicking outside
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setShowSuggestions(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const selectStock = (s: Stock) => {
    setTicker(s.ticker);
    setTickerSearch(`${s.ticker} — ${s.name}`);
    setShowSuggestions(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    const qty = parseFloat(quantity);
    const cost = parseFloat(avgCost);
    if (!ticker) { setError('Please select a stock ticker.'); return; }
    if (isNaN(qty) || qty <= 0) { setError('Quantity must be a positive number.'); return; }
    if (isNaN(cost) || cost <= 0) { setError('Average cost must be a positive number.'); return; }
    try {
      setSaving(true);
      await onSave(ticker, qty, cost);
    } catch (err: any) {
      setError(err.message ?? 'An unexpected error occurred.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 p-8 animate-in fade-in zoom-in-95 duration-200">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-bold">
            {existing ? 'Edit Holding' : 'Add Holding'}
          </h2>
          <button
            onClick={onCancel}
            className="p-2 rounded-full hover:bg-slate-100 transition-colors"
          >
            <X className="w-5 h-5 text-slate-400" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          {/* Ticker — searchable combobox */}
          <div>
            <label className="block text-xs font-bold uppercase tracking-widest text-slate-400 mb-2">
              Stock Ticker
            </label>
            {existing ? (
              <div className="w-full border border-slate-200 rounded-xl px-4 py-3 text-sm font-medium bg-slate-50 text-slate-400">
                {existing.ticker} — {existing.name}
              </div>
            ) : (
              <div className="relative" ref={searchRef}>
                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                <input
                  type="text"
                  placeholder="Search by ticker or name…"
                  value={tickerSearch}
                  onChange={(e) => {
                    setTickerSearch(e.target.value);
                    setTicker('');
                    setShowSuggestions(true);
                  }}
                  onFocus={() => setShowSuggestions(true)}
                  className="w-full pl-10 pr-4 py-3 border border-slate-200 rounded-xl text-sm font-medium focus:outline-none focus:ring-2 focus:ring-black"
                />
                {showSuggestions && suggestions.length > 0 && (
                  <div className="absolute top-full mt-1 left-0 right-0 bg-white border border-slate-200 rounded-xl shadow-xl z-10 overflow-hidden">
                    {suggestions.map((s) => (
                      <button
                        key={s.ticker}
                        type="button"
                        onMouseDown={() => selectStock(s)}
                        className="w-full flex items-center justify-between px-4 py-2.5 hover:bg-slate-50 transition-colors text-left"
                      >
                        <div>
                          <span className="font-bold text-slate-900 text-sm">{s.ticker}</span>
                          <span className="ml-2 text-slate-500 text-xs">{s.name}</span>
                        </div>
                        <span className="font-mono text-xs text-slate-500 shrink-0 ml-2">
                          EGP {s.currentPrice.toFixed(2)}
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Quantity */}
          <div>
            <label className="block text-xs font-bold uppercase tracking-widest text-slate-400 mb-2">
              Number of Shares
            </label>
            <input
              type="number"
              min="0.0001"
              step="any"
              placeholder="e.g. 500"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              className="w-full border border-slate-200 rounded-xl px-4 py-3 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-black"
            />
          </div>

          {/* Average cost */}
          <div>
            <label className="block text-xs font-bold uppercase tracking-widest text-slate-400 mb-2">
              Average Cost per Share (EGP)
            </label>
            <input
              type="number"
              min="0.0001"
              step="any"
              placeholder="e.g. 14.25"
              value={avgCost}
              onChange={(e) => setAvgCost(e.target.value)}
              className="w-full border border-slate-200 rounded-xl px-4 py-3 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-black"
            />
          </div>

          {/* Live preview */}
          {quantity && avgCost && !isNaN(parseFloat(quantity)) && !isNaN(parseFloat(avgCost)) && (
            <div className="bg-slate-50 rounded-xl px-4 py-3 text-sm text-slate-500">
              Cost basis:{' '}
              <span className="font-bold text-slate-900">
                EGP {fmt(parseFloat(quantity) * parseFloat(avgCost))}
              </span>
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="flex items-center gap-2 text-rose-600 text-sm bg-rose-50 rounded-xl px-4 py-3">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              {error}
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onCancel}
              className="flex-1 py-3 rounded-full border border-slate-200 text-sm font-semibold text-slate-500 hover:bg-slate-50 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="flex-1 py-3 rounded-full bg-black text-white text-sm font-semibold hover:opacity-90 transition-opacity disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {saving ? (
                <div className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
              ) : (
                <Check className="w-4 h-4" />
              )}
              {existing ? 'Save Changes' : 'Add to Portfolio'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Main component ───────────────────────────────────────────────────────────
export default function Portfolio({ stocks, onSelectStock }: PortfolioProps) {
  const [portfolio, setPortfolio] = useState<PortfolioStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingHolding, setEditingHolding] = useState<PortfolioHolding | null>(null);
  const [removingId, setRemovingId] = useState<string | null>(null);

  const load = () =>
    fetchPortfolio()
      .then(setPortfolio)
      .catch(console.error)
      .finally(() => setLoading(false));

  useEffect(() => { load(); }, []);

  // ── Sector allocation ──────────────────────────────────────────────────────
  const sectorAlloc = useMemo(() => {
    if (!portfolio || portfolio.holdings.length === 0) return [];
    const total = portfolio.currentValue || 1;
    const map: Record<string, number> = {};
    for (const h of portfolio.holdings) {
      const s = h.sector || 'Other';
      map[s] = (map[s] ?? 0) + h.currentValue;
    }
    return Object.entries(map)
      .map(([sector, value]) => ({ sector, value, pct: (value / total) * 100 }))
      .sort((a, b) => b.value - a.value);
  }, [portfolio]);

  const handleAdd = async (ticker: string, qty: number, cost: number) => {
    await addHolding(ticker, qty, cost);
    setShowAddForm(false);
    setLoading(true);
    await load();
  };

  const handleEdit = async (ticker: string, qty: number, cost: number) => {
    if (!editingHolding) return;
    await updateHolding(editingHolding.id, ticker, qty, cost);
    setEditingHolding(null);
    setLoading(true);
    await load();
  };

  const handleRemove = async (id: string) => {
    setRemovingId(id);
    try {
      await removeHolding(id);
      await load();
    } catch (err) {
      console.error(err);
    } finally {
      setRemovingId(null);
    }
  };

  const stockByTicker = useMemo(() => {
    const m: Record<string, Stock> = {};
    for (const s of stocks) m[s.ticker] = s;
    return m;
  }, [stocks]);

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="max-w-screen-2xl mx-auto space-y-8 animate-in fade-in duration-500">
      {/* Header */}
      <header className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h1 className="text-4xl font-extrabold text-slate-900 tracking-tighter mb-2">
            My Portfolio
          </h1>
          <p className="text-slate-500 max-w-xl">
            Track your EGX holdings, monitor real-time P&L, and review sector allocation.
          </p>
        </div>
        <button
          onClick={() => setShowAddForm(true)}
          className="flex items-center gap-2 px-6 py-3 bg-black text-white rounded-full font-semibold hover:opacity-90 transition-opacity self-start md:self-auto"
        >
          <PlusCircle className="w-4 h-4" />
          Add Holding
        </button>
      </header>

      {/* Loading */}
      {loading && (
        <div className="flex flex-col items-center justify-center py-24 gap-4">
          <div className="w-8 h-8 border-4 border-slate-200 border-t-black rounded-full animate-spin" />
          <p className="text-slate-400 text-sm">Loading portfolio…</p>
        </div>
      )}

      {/* Empty state */}
      {!loading && portfolio && portfolio.holdings.length === 0 && (
        <div className="flex flex-col items-center justify-center min-h-[50vh] gap-6 text-center">
          <div className="w-20 h-20 bg-slate-100 rounded-2xl flex items-center justify-center">
            <Wallet className="w-9 h-9 text-slate-400" />
          </div>
          <div>
            <h2 className="text-2xl font-bold text-slate-900 mb-2">No holdings yet</h2>
            <p className="text-slate-400 max-w-xs">
              Add your first EGX stock holding to start tracking your portfolio performance.
            </p>
          </div>
          <button
            onClick={() => setShowAddForm(true)}
            className="flex items-center gap-2 px-8 py-3 bg-black text-white rounded-full font-semibold hover:opacity-90 transition-opacity"
          >
            <PlusCircle className="w-4 h-4" />
            Add First Holding
          </button>
        </div>
      )}

      {/* Portfolio content */}
      {!loading && portfolio && portfolio.holdings.length > 0 && (
        <>
          {/* Summary cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <SummaryCard
              label="Total Invested"
              value={`EGP ${fmt(portfolio.totalInvested)}`}
              icon={<Wallet className="w-5 h-5" />}
              accent="slate"
            />
            <SummaryCard
              label="Current Value"
              value={`EGP ${fmt(portfolio.currentValue)}`}
              icon={<BarChart2 className="w-5 h-5" />}
              accent="blue"
            />
            <SummaryCard
              label="Total Gain / Loss"
              value={`${portfolio.totalGainLoss >= 0 ? '+' : ''}EGP ${fmt(portfolio.totalGainLoss)}`}
              icon={portfolio.totalGainLoss >= 0 ? <TrendingUp className="w-5 h-5" /> : <TrendingDown className="w-5 h-5" />}
              accent={portfolio.totalGainLoss >= 0 ? 'emerald' : 'rose'}
              signed
              positive={portfolio.totalGainLoss >= 0}
            />
            <SummaryCard
              label="Return"
              value={`${portfolio.totalGainLossPercent >= 0 ? '+' : ''}${fmt(portfolio.totalGainLossPercent)}%`}
              icon={portfolio.totalGainLossPercent >= 0 ? <ArrowUp className="w-5 h-5" /> : <ArrowDown className="w-5 h-5" />}
              accent={portfolio.totalGainLossPercent >= 0 ? 'emerald' : 'rose'}
              signed
              positive={portfolio.totalGainLossPercent >= 0}
            />
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-12 gap-8">
            {/* Holdings table */}
            <div className="xl:col-span-8">
              <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-100/50">
                <h2 className="text-xl font-bold mb-6">Holdings</h2>
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="border-b border-slate-100">
                        {['Stock', 'Shares', 'Avg Cost', 'Current', 'Cost Basis', 'Value', 'P&L', ''].map((h) => (
                          <th key={h} className="pb-4 font-bold text-xs uppercase tracking-widest text-slate-400 last:text-right">
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                      {portfolio.holdings.map((h: PortfolioHolding) => (
                        <HoldingRow
                          key={h.id}
                          holding={h}
                          logo={stockByTicker[h.ticker]?.logo}
                          removing={removingId === h.id}
                          onSelect={() => {
                            const s = stockByTicker[h.ticker];
                            if (s) onSelectStock(s);
                          }}
                          onEdit={() => setEditingHolding(h)}
                          onRemove={() => handleRemove(h.id)}
                        />
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            {/* Sidebar: sector allocation */}
            <div className="xl:col-span-4 space-y-6">
              {/* Sector Allocation */}
              {sectorAlloc.length > 0 && (
                <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-100/50">
                  <h3 className="font-bold text-sm mb-4">Sector Allocation</h3>
                  <div className="space-y-3">
                    {sectorAlloc.map(({ sector, pct }) => (
                      <div key={sector}>
                        <div className="flex justify-between text-xs mb-1">
                          <span className="font-medium text-slate-700 truncate pr-2">{sector || 'Other'}</span>
                          <span className="text-slate-400 font-mono flex-shrink-0">{pct.toFixed(1)}%</span>
                        </div>
                        <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-black rounded-full transition-all duration-500"
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Performance Leaders */}
              <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-100/50">
                <h3 className="font-bold text-sm mb-4">Position P&L</h3>
                <div className="space-y-3">
                  {[...portfolio.holdings]
                    .sort((a: PortfolioHolding, b: PortfolioHolding) => b.gainLossPercent - a.gainLossPercent)
                    .map((h: PortfolioHolding) => (
                      <div
                        key={h.id}
                        className="flex items-center gap-3 cursor-pointer hover:bg-slate-50 rounded-xl px-2 py-1.5 -mx-2 transition-colors"
                        onClick={() => {
                          const s = stockByTicker[h.ticker];
                          if (s) onSelectStock(s);
                        }}
                      >
                        <StockLogo
                          ticker={h.ticker}
                          logo={stockByTicker[h.ticker]?.logo}
                          size="w-7 h-7"
                          textSize="text-[10px]"
                        />
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-bold text-slate-900 truncate">{h.ticker}</p>
                          <p className="text-[10px] text-slate-400 truncate">{h.name}</p>
                        </div>
                        <div className={cn('text-xs font-bold flex-shrink-0', h.gainLossPercent >= 0 ? 'text-emerald-600' : 'text-rose-600')}>
                          {h.gainLossPercent >= 0 ? '+' : ''}{fmt(h.gainLossPercent)}%
                        </div>
                      </div>
                    ))}
                </div>
              </div>
            </div>
          </div>
        </>
      )}

      {/* Modals */}
      {showAddForm && (
        <HoldingForm
          stocks={stocks}
          onSave={handleAdd}
          onCancel={() => setShowAddForm(false)}
        />
      )}
      {editingHolding && (
        <HoldingForm
          stocks={stocks}
          existing={editingHolding}
          onSave={handleEdit}
          onCancel={() => setEditingHolding(null)}
        />
      )}
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

interface SummaryCardProps {
  label: string;
  value: string;
  icon: React.ReactNode;
  accent: string;
  signed?: boolean;
  positive?: boolean;
}

function SummaryCard({ label, value, icon, accent, signed, positive }: SummaryCardProps) {
  const colourMap: Record<string, string> = {
    slate: 'bg-slate-100 text-slate-600',
    blue: 'bg-blue-50 text-blue-600',
    emerald: 'bg-emerald-50 text-emerald-600',
    rose: 'bg-rose-50 text-rose-600',
  };
  const textColour = signed
    ? positive ? 'text-emerald-600' : 'text-rose-600'
    : 'text-slate-900';

  return (
    <div className="bg-white rounded-2xl p-5 shadow-sm border border-slate-100/50">
      <div className={cn('w-9 h-9 rounded-xl flex items-center justify-center mb-3', colourMap[accent] ?? colourMap.slate)}>
        {icon}
      </div>
      <p className="text-xs font-bold uppercase tracking-widest text-slate-400 mb-1">{label}</p>
      <p className={cn('text-lg font-extrabold leading-tight', textColour)}>{value}</p>
    </div>
  );
}

interface HoldingRowProps {
  key?: React.Key;
  holding: PortfolioHolding;
  logo?: string | null;
  removing: boolean;
  onSelect: () => void;
  onEdit: () => void;
  onRemove: () => void;
}

function HoldingRow({ holding: h, logo, removing, onSelect, onEdit, onRemove }: HoldingRowProps) {
  const isPositive = h.gainLoss >= 0;
  return (
    <tr className="hover:bg-slate-50 transition-colors">
      {/* Stock */}
      <td className="py-4">
        <button
          onClick={onSelect}
          className="flex items-center gap-3 hover:underline text-left"
        >
          <StockLogo ticker={h.ticker} logo={logo} size="w-8 h-8" textSize="text-[10px]" />
          <div>
            <p className="font-bold text-sm text-slate-900 leading-tight">{h.ticker}</p>
            <p className="text-[11px] text-slate-400 max-w-[120px] truncate">{h.name}</p>
          </div>
        </button>
      </td>
      {/* Shares */}
      <td className="py-4 font-mono text-sm text-slate-600">{fmt(h.quantity, 0)}</td>
      {/* Avg Cost */}
      <td className="py-4 font-mono text-sm text-slate-600">{fmt(h.avgCost)}</td>
      {/* Current */}
      <td className="py-4 font-mono text-sm font-medium">
        {h.currentPrice > 0 ? fmt(h.currentPrice) : <span className="text-slate-300">—</span>}
      </td>
      {/* Cost Basis */}
      <td className="py-4 font-mono text-sm text-slate-500">{fmt(h.costBasis)}</td>
      {/* Value */}
      <td className="py-4 font-mono text-sm font-bold">
        {h.currentValue > 0 ? fmt(h.currentValue) : <span className="text-slate-300">—</span>}
      </td>
      {/* P&L */}
      <td className="py-4">
        {h.currentPrice > 0 ? (
          <div className={cn('text-sm font-bold', isPositive ? 'text-emerald-600' : 'text-rose-600')}>
            <span>{isPositive ? '+' : ''}{fmt(h.gainLoss)}</span>
            <span className="text-xs ml-1 opacity-75">
              ({isPositive ? '+' : ''}{fmt(h.gainLossPercent)}%)
            </span>
          </div>
        ) : (
          <span className="text-slate-300 text-sm">—</span>
        )}
      </td>
      {/* Actions */}
      <td className="py-4 text-right">
        <div className="flex items-center justify-end gap-1">
          <button
            onClick={onEdit}
            className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-700 transition-colors"
            title="Edit"
          >
            <Pencil className="w-4 h-4" />
          </button>
          <button
            onClick={onRemove}
            disabled={removing}
            className="p-1.5 rounded-lg hover:bg-rose-50 text-slate-400 hover:text-rose-600 transition-colors disabled:opacity-40"
            title="Remove"
          >
            {removing
              ? <div className="w-4 h-4 border-2 border-rose-300 border-t-rose-600 rounded-full animate-spin" />
              : <Trash2 className="w-4 h-4" />
            }
          </button>
        </div>
      </td>
    </tr>
  );
}
