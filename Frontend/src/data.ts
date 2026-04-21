import { Stock, ChartPoint, Insight, MarketSummary, AlphaLeader, ValueFloor, PortfolioStats, PortfolioHolding, WatchlistItem, User, AIRecommendationsResponse, StockChatMessage, StockChatResponse } from './types';

// Use /api in dev (proxied via vite), or full URL in production
const API_BASE = import.meta.env.VITE_API_BASE_URL 
  ? import.meta.env.VITE_API_BASE_URL 
  : '/api';

// ── Auth helpers ─────────────────────────────────────────────────────────────

function getToken(): string | null {
  return localStorage.getItem('egx_token');
}

function authHeaders(extra: Record<string, string> = {}): Record<string, string> {
  const token = getToken();
  return token
    ? { Authorization: `Bearer ${token}`, ...extra }
    : extra;
}

export interface AuthResponse {
  access_token: string;
  token_type: string;
  user: User;
}

export async function registerUser(
  email: string,
  password: string,
  name: string,
): Promise<AuthResponse> {
  const res = await fetch(`${API_BASE}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, name }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as any).detail ?? `Registration failed (${res.status})`);
  }
  return res.json();
}

export async function loginUser(
  email: string,
  password: string,
): Promise<AuthResponse> {
  const res = await fetch(`${API_BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as any).detail ?? `Login failed (${res.status})`);
  }
  return res.json();
}

export async function fetchStocks(): Promise<Stock[]> {
  const res = await fetch(`${API_BASE}/stocks`);
  if (!res.ok) throw new Error(`Failed to fetch stocks: ${res.statusText}`);
  return res.json();
}

export async function fetchStockHistory(
  ticker: string,
  range: string = '1mo',
  interval: string = '1d',
): Promise<ChartPoint[]> {
  const params = new URLSearchParams({ range, interval });
  const res = await fetch(`${API_BASE}/stocks/${ticker}/history?${params}`);
  if (!res.ok) throw new Error(`Failed to fetch history for ${ticker}`);
  return res.json();
}

export async function fetchMarketSummary(): Promise<MarketSummary> {
  const res = await fetch(`${API_BASE}/market/summary`);
  if (!res.ok) throw new Error('Failed to fetch market summary');
  return res.json();
}

export async function fetchAlphaLeaders(): Promise<AlphaLeader[]> {
  const res = await fetch(`${API_BASE}/market/leaders`);
  if (!res.ok) throw new Error('Failed to fetch alpha leaders');
  return res.json();
}

export async function fetchValueFloor(): Promise<ValueFloor[]> {
  const res = await fetch(`${API_BASE}/market/value-floor`);
  if (!res.ok) throw new Error('Failed to fetch value floor');
  return res.json();
}

export async function fetchInsight(ticker: string): Promise<Insight> {
  const res = await fetch(`${API_BASE}/stocks/${ticker}/insights`);
  if (!res.ok) throw new Error(`Failed to fetch insights for ${ticker}`);
  return res.json();
}

export async function fetchAIRecommendations(): Promise<AIRecommendationsResponse> {
  const res = await fetch(`${API_BASE}/stocks/ai-recommendations`);
  if (!res.ok) throw new Error(`Failed to fetch AI recommendations (${res.status})`);
  return res.json();
}

export async function sendStockChatMessage(
  question: string,
  history: StockChatMessage[] = [],
): Promise<StockChatResponse> {
  const res = await fetch(`${API_BASE}/stocks/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ question, history }),
  });
  if (!res.ok) throw new Error(`Failed to chat with stock assistant (${res.status})`);
  return res.json();
}

// Period label → yfinance params mapping used by StockDetails
export const CHART_PERIODS: Record<string, { range: string; interval: string }> = {
  '1D': { range: '1d', interval: '60m' },
  '1W': { range: '5d', interval: '1d' },
  '1M': { range: '1mo', interval: '1d' },
  '1Y': { range: '1y', interval: '1wk' },
  ALL: { range: 'max', interval: '1mo' },
};

// ── Static stubs (unused — kept so any accidental import doesn't break) ──────
export const STOCKS: Stock[] = [];
export const ALPHA_LEADERS: AlphaLeader[] = [];
export const VALUE_FLOOR: ValueFloor[] = [];

// ── Portfolio API ─────────────────────────────────────────────────────────────

export async function fetchPortfolio(): Promise<PortfolioStats> {
  const res = await fetch(`${API_BASE}/portfolio`, { headers: authHeaders() });
  if (!res.ok) throw new Error('Failed to fetch portfolio');
  return res.json();
}

export async function addHolding(
  ticker: string,
  quantity: number,
  avgCost: number,
): Promise<PortfolioHolding> {
  const res = await fetch(`${API_BASE}/portfolio/holdings`, {
    method: 'POST',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ ticker, quantity, avgCost }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as any).detail ?? `Failed to add holding (${res.status})`);
  }
  return res.json();
}

export async function removeHolding(holdingId: string): Promise<void> {
  const res = await fetch(`${API_BASE}/portfolio/holdings/${encodeURIComponent(holdingId)}`, {
    method: 'DELETE',
    headers: authHeaders(),
  });
  if (!res.ok) throw new Error(`Failed to remove holding (${res.status})`);
}

export async function updateHolding(
  holdingId: string,
  ticker: string,
  quantity: number,
  avgCost: number,
): Promise<PortfolioHolding> {
  const res = await fetch(`${API_BASE}/portfolio/holdings/${encodeURIComponent(holdingId)}`, {
    method: 'PUT',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ ticker, quantity, avgCost }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as any).detail ?? `Failed to update holding (${res.status})`);
  }
  return res.json();
}

// ── Watchlist API ─────────────────────────────────────────────────────────────

export async function fetchWatchlist(): Promise<WatchlistItem[]> {
  const res = await fetch(`${API_BASE}/watchlist`, { headers: authHeaders() });
  if (!res.ok) throw new Error('Failed to fetch watchlist');
  return res.json();
}

export async function addToWatchlist(ticker: string): Promise<WatchlistItem> {
  const res = await fetch(`${API_BASE}/watchlist`, {
    method: 'POST',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ ticker }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as any).detail ?? `Failed to add to watchlist (${res.status})`);
  }
  return res.json();
}

export async function removeFromWatchlist(ticker: string): Promise<void> {
  const res = await fetch(`${API_BASE}/watchlist/${encodeURIComponent(ticker)}`, {
    method: 'DELETE',
    headers: authHeaders(),
  });
  if (!res.ok) throw new Error(`Failed to remove from watchlist (${res.status})`);
}
