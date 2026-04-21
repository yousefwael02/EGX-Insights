
from pydantic import BaseModel, Field

# ── Auth ──────────────────────────────────────────────────────────────────────

class UserCreate(BaseModel):
    email: str
    password: str
    name: str = ""


class UserLogin(BaseModel):
    email: str
    password: str


class UserOut(BaseModel):
    id: str
    email: str
    name: str = ""


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserOut


class Stock(BaseModel):
    ticker: str
    name: str
    currentPrice: float
    high52w: float
    low52w: float
    belowHigh: float
    fairValue: float
    upside: float
    peRatio: float
    marketCap: str
    eps: float
    revenue: str
    description: str
    sector: str
    industry: str
    sentiment: int
    logo: str | None = None
    currency: str = "EGP"


class ChartPoint(BaseModel):
    date: str
    price: float
    volume: int | None = None


class Insight(BaseModel):
    id: str
    title: str
    category: str
    content: str
    time: str


class MarketSummary(BaseModel):
    index_value: float
    change: float
    changePercent: float
    timestamp: str


class AlphaLeader(BaseModel):
    ticker: str
    name: str
    upside: float
    progress: int


class ValueFloor(BaseModel):
    ticker: str
    name: str
    fromLow: float


class PortfolioHolding(BaseModel):
    id: str
    ticker: str
    name: str
    sector: str = ""
    quantity: float
    avgCost: float
    currentPrice: float = 0.0
    currentValue: float = 0.0
    costBasis: float = 0.0
    gainLoss: float = 0.0
    gainLossPercent: float = 0.0


class AddHoldingRequest(BaseModel):
    ticker: str
    quantity: float
    avgCost: float


class PortfolioStats(BaseModel):
    totalInvested: float
    currentValue: float
    totalGainLoss: float
    totalGainLossPercent: float
    holdings: list[PortfolioHolding]


class WatchlistItem(BaseModel):
    ticker: str
    name: str
    sector: str = ""
    currentPrice: float = 0.0
    fairValue: float = 0.0
    upside: float = 0.0
    belowHigh: float = 0.0
    high52w: float = 0.0
    low52w: float = 0.0
    peRatio: float = 0.0
    sentiment: int = 50
    currency: str = "EGP"


class AddWatchlistRequest(BaseModel):
    ticker: str


class AIRecommendationItem(BaseModel):
    ticker: str
    name: str
    reason: str
    conviction: str  # "High" | "Medium" | "Low"
    scanner: str


class AIRecommendationsResponse(BaseModel):
    buy: list[AIRecommendationItem]
    sell: list[AIRecommendationItem]
    summary: str
    generated_at: str


class ChatMessage(BaseModel):
    role: str
    content: str


class StockChatRequest(BaseModel):
    question: str
    history: list[ChatMessage] = Field(default_factory=list)


class StockChatResponse(BaseModel):
    answer: str
    suggestedQuestions: list[str] = Field(default_factory=list)
    usedFallback: bool = False
