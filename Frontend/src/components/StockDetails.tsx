import { useState, useEffect, useMemo } from 'react';
import { Star, ArrowUp, ArrowDown, TrendingUp, Check, Loader2 } from 'lucide-react';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  ResponsiveContainer,
} from 'recharts';
import { Stock, ChartPoint, Insight } from '../types';
import { fetchStockHistory, fetchInsight, fetchWatchlist, addToWatchlist, removeFromWatchlist, CHART_PERIODS } from '../data';
import { cn } from '../lib/utils';
import StockLogo from './StockLogo';

interface StockDetailsProps {
  stock: Stock;
  onBack: () => void;
}

// Deterministic colour for each ticker's avatar — kept for any non-logo fallback
const AVATAR_COLORS = [
  'bg-emerald-500',
  'bg-blue-500',
  'bg-violet-500',
  'bg-amber-500',
  'bg-rose-500',
  'bg-cyan-500',
  'bg-orange-500',
  'bg-pink-500',
];
function avatarColor(ticker: string): string {
  const sum = ticker.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0);
  return AVATAR_COLORS[sum % AVATAR_COLORS.length];
}

function formatXDate(dateStr: string, period: string) {
  // Intraday timestamps come back as "YYYY-MM-DD HH:MM" – parse without adding a noon-UTC offset
  const d = dateStr.includes(' ')
    ? new Date(dateStr.replace(' ', 'T') + 'Z')
    : new Date(dateStr + 'T12:00:00Z');
  if (period === '1D') return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
  if (period === 'ALL') return String(d.getFullYear());
  if (period === '1Y') return d.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

const CustomTooltip = ({ active, payload, label }: any) => {
  if (active && payload && payload.length) {
    return (
      <div className="bg-white rounded-xl shadow-lg border border-slate-100 px-4 py-3">
        <p className="text-xs text-slate-400 mb-1">{label}</p>
        <p className="text-lg font-bold">EGP {Number(payload[0].value).toFixed(2)}</p>
      </div>
    );
  }
  return null;
};

export default function StockDetails({ stock, onBack }: StockDetailsProps) {
  const [activePeriod, setActivePeriod] = useState('1M');
  const [chartData, setChartData] = useState<ChartPoint[]>([]);
  const [chartLoading, setChartLoading] = useState(true);
  const [insight, setInsight] = useState<Insight | null>(null);
  const [insightLoading, setInsightLoading] = useState(true);
  const [isWatched, setIsWatched] = useState(false);
  const [watchlistLoading, setWatchlistLoading] = useState(false);

  // Fetch chart history when period or stock changes
  useEffect(() => {
    setChartLoading(true);
    const { range, interval } = CHART_PERIODS[activePeriod] ?? CHART_PERIODS['1M'];
    fetchStockHistory(stock.ticker, range, interval)
      .then((data) => {
        // Always append the live current price as the rightmost point so the
        // chart extends to "now" rather than stopping at yesterday's close.
        if (stock.currentPrice > 0) {
          const today = new Date().toISOString().split('T')[0];
          const hasToday = data.some((p) => p.date.startsWith(today));
          if (!hasToday) {
            // For 1D (intraday x-axis), use a full datetime string so it
            // renders as a time label rather than a date.
            const nowStr =
              activePeriod === '1D'
                ? new Date().toISOString().replace('T', ' ').slice(0, 16)
                : today;
            data = [...data, { date: nowStr, price: stock.currentPrice, volume: undefined }];
          }
        }
        setChartData(data);
      })
      .catch(() => setChartData([]))
      .finally(() => setChartLoading(false));
  }, [stock.ticker, activePeriod, stock.currentPrice]);

  // Fetch AI insight once on mount
  useEffect(() => {
    setInsightLoading(true);
    fetchInsight(stock.ticker)
      .then(setInsight)
      .catch(() => setInsight(null))
      .finally(() => setInsightLoading(false));
  }, [stock.ticker]);

  // Check initial watchlist state
  useEffect(() => {
    fetchWatchlist()
      .then((items) => setIsWatched(items.some((i) => i.ticker === stock.ticker)))
      .catch(() => {});
  }, [stock.ticker]);

  const handleWatchlistToggle = async () => {
    setWatchlistLoading(true);
    try {
      if (isWatched) {
        await removeFromWatchlist(stock.ticker);
        setIsWatched(false);
      } else {
        await addToWatchlist(stock.ticker);
        setIsWatched(true);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setWatchlistLoading(false);
    }
  };

  // Compute period price change from chart data
  const periodChange = useMemo(() => {
    if (chartData.length < 2) return null;
    const first = chartData[0].price;
    const last = chartData[chartData.length - 1].price;
    const pct = ((last - first) / first) * 100;
    return { value: +(last - first).toFixed(2), percent: +pct.toFixed(2) };
  }, [chartData]);

  // Dynamic valuation bar widths
  const { underWidth, overWidth } = useMemo(() => {
    const u = stock.upside >= 0
      ? Math.min(80, 50 + stock.upside * 0.6)
      : Math.max(10, 50 + stock.upside * 0.6);
    const o = stock.upside >= 0
      ? Math.max(5, 15 - stock.upside * 0.3)
      : Math.min(80, 15 + Math.abs(stock.upside) * 0.9);
    return { underWidth: Math.round(u), overWidth: Math.round(o) };
  }, [stock.upside]);

  const isUndervalued = stock.upside >= 0;

  return (
    <div className="max-w-7xl mx-auto space-y-8 animate-in slide-in-from-right duration-500">
      {/* Header */}
      <header className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div className="flex items-center gap-4">
          {/* Ticker avatar — clickable to go back */}
          <button
            onClick={onBack}
            className="hover:opacity-80 transition-opacity"
          >
            <StockLogo
              ticker={stock.ticker}
              logo={stock.logo}
              size="w-16 h-16"
              textSize="text-lg"
            />
          </button>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-3xl font-extrabold text-slate-900">{stock.name}</h1>
              <span className="bg-slate-100 px-2 py-0.5 rounded text-xs font-bold text-slate-500 tracking-wider">
                {stock.ticker}
              </span>
            </div>
            <p className="text-slate-500 font-medium">
              EGX · {stock.sector} · {stock.industry}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={handleWatchlistToggle}
            disabled={watchlistLoading}
            className={cn(
              'flex items-center gap-2 px-5 py-2.5 rounded-full border transition-all duration-200 font-semibold text-sm disabled:opacity-60',
              isWatched
                ? 'border-amber-300 bg-amber-50 text-amber-700 hover:bg-amber-100'
                : 'border-slate-200 hover:bg-slate-50 text-slate-700',
            )}
          >
            {watchlistLoading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : isWatched ? (
              <Check className="w-4 h-4" />
            ) : (
              <Star className="w-4 h-4" />
            )}
            {isWatched ? 'Watching' : 'Add to Watchlist'}
          </button>
        </div>
      </header>

      {/* Bento Grid */}
      <div className="grid grid-cols-12 gap-6">
        {/* Price Chart — no overflow-hidden so the tooltip can follow the cursor */}
        <div className="col-span-12 lg:col-span-8 bg-white rounded-2xl shadow-sm border border-slate-100/50 flex flex-col">
          <div className="p-6 pb-0 flex justify-between items-end">
            <div>
              <p className="text-sm font-bold text-slate-400 uppercase tracking-widest mb-1">
                Current Price
              </p>
              <div className="flex items-baseline gap-3">
                <span className="text-4xl font-extrabold text-slate-900">
                  EGP {stock.currentPrice.toLocaleString('en-EG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
                {periodChange && (
                  <span
                    className={cn(
                      'font-bold flex items-center gap-1 text-sm px-2 py-0.5 rounded-full',
                      periodChange.percent >= 0
                        ? 'text-emerald-600 bg-emerald-50'
                        : 'text-rose-600 bg-rose-50',
                    )}
                  >
                    {periodChange.percent >= 0 ? (
                      <ArrowUp className="w-3 h-3" />
                    ) : (
                      <ArrowDown className="w-3 h-3" />
                    )}
                    {periodChange.percent >= 0 ? '+' : ''}
                    {periodChange.percent.toFixed(2)}%
                  </span>
                )}
              </div>
            </div>
            <div className="flex bg-slate-100 p-1 rounded-full">
              {Object.keys(CHART_PERIODS).map((p) => (
                <button
                  key={p}
                  onClick={() => setActivePeriod(p)}
                  className={cn(
                    'px-4 py-1.5 rounded-full text-xs font-bold transition-all',
                    activePeriod === p
                      ? 'bg-white shadow-sm text-black'
                      : 'text-slate-500 hover:text-slate-900',
                  )}
                >
                  {p}
                </button>
              ))}
            </div>
          </div>

          <div className="relative flex-1 min-h-[320px] mt-4">
            {chartLoading ? (
              <div className="flex items-center justify-center h-full">
                <div className="w-8 h-8 border-4 border-slate-200 border-t-black rounded-full animate-spin" />
              </div>
            ) : chartData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData} margin={{ top: 24, right: 24, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="colorPrice" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#000" stopOpacity={0.06} />
                      <stop offset="95%" stopColor="#000" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                  <XAxis
                    dataKey="date"
                    tickFormatter={(d) => formatXDate(d, activePeriod)}
                    tick={{ fontSize: 10, fill: '#94a3b8' }}
                    axisLine={false}
                    tickLine={false}
                    interval="preserveStartEnd"
                  />
                  <YAxis
                    domain={['auto', 'auto']}
                    tick={{ fontSize: 10, fill: '#94a3b8' }}
                    axisLine={false}
                    tickLine={false}
                    tickFormatter={(v) => v.toFixed(0)}
                    width={50}
                  />
                  <Tooltip
                    content={<CustomTooltip />}
                    offset={12}
                    cursor={{ stroke: '#e2e8f0', strokeWidth: 1 }}
                  />
                  {stock.high52w > 0 && (
                    <ReferenceLine
                      y={stock.high52w}
                      stroke="#cbd5e1"
                      strokeDasharray="4 3"
                      label={{
                        value: `52W High  ${stock.high52w.toFixed(2)}`,
                        position: 'insideTopRight',
                        fontSize: 9,
                        fill: '#94a3b8',
                        fontWeight: 700,
                        dy: -6,
                      }}
                    />
                  )}
                  {stock.fairValue > 0 && (
                    <ReferenceLine
                      y={stock.fairValue}
                      stroke="#10b981"
                      strokeDasharray="4 3"
                      label={{
                        value: `Fair Value  ${stock.fairValue.toFixed(2)}`,
                        position: 'insideTopLeft',
                        fontSize: 9,
                        fill: '#10b981',
                        fontWeight: 700,
                        dy: -6,
                      }}
                    />
                  )}
                  <Area
                    type="monotone"
                    dataKey="price"
                    stroke="#000"
                    strokeWidth={2.5}
                    fillOpacity={1}
                    fill="url(#colorPrice)"
                    dot={false}
                    activeDot={{ r: 4, strokeWidth: 0, fill: '#000' }}
                  />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex items-center justify-center h-full text-slate-300 text-sm">
                No chart data available for this period.
              </div>
            )}
          </div>
        </div>

        {/* Side Stats Column */}
        <div className="col-span-12 lg:col-span-4 flex flex-col gap-6">
          {/* Valuation Card */}
          <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100/50">
            <h3 className="text-lg font-extrabold mb-6">Valuation Analysis</h3>
            <div className="space-y-6">
              <div>
                <div className="flex justify-between items-end mb-2">
                  <span className="text-sm font-medium text-slate-500">Price vs Fair Value</span>
                  <span
                    className={cn(
                      'text-sm font-extrabold',
                      isUndervalued ? 'text-emerald-600' : 'text-rose-600',
                    )}
                  >
                    {isUndervalued
                      ? `+${stock.upside.toFixed(1)}% Upside`
                      : `${stock.upside.toFixed(1)}% Overvalued`}
                  </span>
                </div>
                <div className="h-3 w-full bg-slate-100 rounded-full overflow-hidden flex">
                  <div className="h-full bg-emerald-500" style={{ width: `${underWidth}%` }} />
                  <div
                    className="h-full bg-rose-500"
                    style={{ width: `${overWidth}%` }}
                  />
                  <div className="h-full bg-slate-200 flex-1" />
                </div>
                <div className="flex justify-between mt-2">
                  <span className="text-[10px] font-bold text-slate-400 uppercase">Under</span>
                  <span className="text-[10px] font-bold text-slate-400 uppercase">Fair</span>
                  <span className="text-[10px] font-bold text-slate-400 uppercase">Over</span>
                </div>
              </div>
              <div className="pt-4 border-t border-slate-100 flex items-center justify-between">
                <div>
                  <p className="text-xs font-bold text-slate-400 uppercase mb-1">Fair Value Model</p>
                  <p className="text-2xl font-black text-slate-900">
                    EGP {stock.fairValue.toFixed(2)}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-xs font-bold text-slate-400 uppercase mb-1">Analyst Target</p>
                  <p className="text-lg font-bold text-slate-500">
                    EGP {stock.fairValue.toFixed(2)}
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Key Stats */}
          <div className="grid grid-cols-2 gap-4">
            {[
              { label: 'Market Cap', value: stock.marketCap },
              { label: 'P/E Ratio', value: stock.peRatio > 0 ? stock.peRatio.toFixed(1) : 'N/A' },
              {
                label: 'EPS (TTM)',
                value: stock.eps !== 0 ? `EGP ${stock.eps.toFixed(2)}` : 'N/A',
              },
              { label: 'Revenue', value: stock.revenue },
            ].map((stat) => (
              <div
                key={stat.label}
                className="bg-white p-4 rounded-2xl border border-slate-100 shadow-sm"
              >
                <p className="text-[10px] font-bold text-slate-400 uppercase mb-1">{stat.label}</p>
                <p className="text-lg font-bold">{stat.value}</p>
              </div>
            ))}
          </div>
        </div>

        {/* About + AI Insight */}
        <div className="col-span-12 lg:col-span-8 bg-white p-8 rounded-2xl shadow-sm border border-slate-100/50">
          <h3 className="text-xl font-extrabold mb-4">About {stock.name}</h3>
          <p className="text-slate-600 leading-relaxed mb-8">{stock.description}</p>

          <h4 className="text-sm font-bold text-slate-400 uppercase tracking-widest mb-4">
            AI Research Insight
          </h4>
          {insightLoading ? (
            <div className="space-y-2">
              <div className="h-4 bg-slate-100 rounded-lg animate-pulse w-full" />
              <div className="h-4 bg-slate-100 rounded-lg animate-pulse w-4/5" />
              <div className="h-4 bg-slate-100 rounded-lg animate-pulse w-3/4" />
            </div>
          ) : insight ? (
            <div className="p-5 bg-slate-50 rounded-2xl border border-slate-100 space-y-2">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-[10px] font-bold text-emerald-600 uppercase tracking-widest bg-emerald-50 px-2 py-0.5 rounded-full">
                  {insight.category}
                </span>
                <span className="text-[10px] text-slate-400">{insight.time}</span>
              </div>
              <p className="text-slate-700 leading-relaxed text-sm">{insight.content}</p>
            </div>
          ) : (
            <p className="text-slate-400 text-sm italic">
              AI insight unavailable. Add GEMINI_API_KEY to Backend/.env to enable.
            </p>
          )}
        </div>

        {/* Sentiment + Alpha Signal */}
        <div className="col-span-12 lg:col-span-4 flex flex-col gap-6">
          <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100/50">
            <h3 className="text-lg font-extrabold mb-4">Market Sentiment</h3>
            <div className="flex items-center gap-6 mb-6">
              <div className="relative w-24 h-24">
                <svg className="w-full h-full -rotate-90" viewBox="0 0 36 36">
                  <circle cx="18" cy="18" r="16" fill="none" stroke="#f1f5f9" strokeWidth="3" />
                  <circle
                    cx="18"
                    cy="18"
                    r="16"
                    fill="none"
                    stroke={stock.sentiment >= 60 ? '#10b981' : stock.sentiment >= 40 ? '#f59e0b' : '#ef4444'}
                    strokeWidth="3"
                    strokeDasharray={`${stock.sentiment} 100`}
                    strokeLinecap="round"
                  />
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <span className="text-xl font-black">{stock.sentiment}</span>
                  <span className="text-[8px] font-bold text-slate-400 uppercase">
                    {stock.sentiment >= 60 ? 'Bullish' : stock.sentiment >= 40 ? 'Neutral' : 'Bearish'}
                  </span>
                </div>
              </div>
              <div className="flex-1 space-y-2">
                <div className="flex justify-between text-xs">
                  <span className="font-medium text-slate-600">Upside</span>
                  <span className={cn('font-bold', isUndervalued ? 'text-emerald-600' : 'text-rose-600')}>
                    {isUndervalued ? `+${stock.upside.toFixed(1)}%` : `${stock.upside.toFixed(1)}%`}
                  </span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="font-medium text-slate-600">52W Range</span>
                  <span className="font-bold text-slate-700">
                    {stock.low52w > 0 ? `${stock.low52w.toFixed(0)}–${stock.high52w.toFixed(0)}` : '—'}
                  </span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="font-medium text-slate-600">% Below High</span>
                  <span className={cn('font-bold', stock.belowHigh < -20 ? 'text-rose-600' : 'text-slate-700')}>
                    {stock.belowHigh.toFixed(1)}%
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Alpha Signal */}
          <div className="bg-slate-900 p-6 rounded-2xl shadow-lg relative overflow-hidden">
            <div className="relative z-10">
              <h4 className="text-white font-bold mb-2 flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-emerald-400" />
                Alpha Signal
              </h4>
              <p className="text-slate-400 text-sm mb-4">
                {isUndervalued
                  ? `EGXInsight model targets EGP ${stock.fairValue.toFixed(2)} — ${stock.upside.toFixed(1)}% potential upside from current price.`
                  : `Stock appears overvalued. Fair value estimate is EGP ${stock.fairValue.toFixed(2)}. Consider waiting for a pullback.`}
              </p>
              <button className="w-full py-2 bg-white text-black rounded-lg font-bold text-sm shadow-sm hover:bg-slate-100 transition-colors">
                View Full Analysis
              </button>
            </div>
            <div className="absolute -right-4 -bottom-4 w-24 h-24 bg-emerald-500/10 rounded-full blur-2xl" />
          </div>
        </div>
      </div>
    </div>
  );
}
