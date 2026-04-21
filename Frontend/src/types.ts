export interface User {
  id: string;
  email: string;
  name: string;
}

export interface Stock {
  ticker: string;
  name: string;
  currentPrice: number;
  high52w: number;
  low52w: number;
  belowHigh: number;
  fairValue: number;
  upside: number;
  peRatio: number;
  marketCap: string;
  eps: number;
  revenue: string;
  description: string;
  sector: string;
  industry: string;
  sentiment: number;
  logo?: string;
  currency: string;
}

export interface ChartPoint {
  date: string;
  price: number;
  volume?: number;
}

export interface Insight {
  id: string;
  title: string;
  category: string;
  content: string;
  time: string;
}

export interface MarketSummary {
  index_value: number;
  change: number;
  changePercent: number;
  timestamp: string;
}

export interface AlphaLeader {
  ticker: string;
  name: string;
  upside: number;
  progress: number;
}

export interface ValueFloor {
  ticker: string;
  name: string;
  fromLow: number;
}

export interface PortfolioHolding {
  id: string;
  ticker: string;
  name: string;
  sector: string;
  quantity: number;
  avgCost: number;
  currentPrice: number;
  currentValue: number;
  costBasis: number;
  gainLoss: number;
  gainLossPercent: number;
}

export interface PortfolioStats {
  totalInvested: number;
  currentValue: number;
  totalGainLoss: number;
  totalGainLossPercent: number;
  holdings: PortfolioHolding[];
}

export interface WatchlistItem {
  ticker: string;
  name: string;
  sector: string;
  currentPrice: number;
  fairValue: number;
  upside: number;
  belowHigh: number;
  high52w: number;
  low52w: number;
  peRatio: number;
  sentiment: number;
  currency: string;
}

export interface AIRecommendationItem {
  ticker: string;
  name: string;
  reason: string;
  conviction: 'High' | 'Medium' | 'Low';
  scanner: string;
}

export interface AIRecommendationsResponse {
  buy: AIRecommendationItem[];
  sell: AIRecommendationItem[];
  summary: string;
  generated_at: string;
}

export interface StockChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface StockChatResponse {
  answer: string;
  suggestedQuestions: string[];
  usedFallback: boolean;
}
