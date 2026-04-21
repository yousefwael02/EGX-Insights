import asyncio
import logging
from datetime import datetime

from fastapi import APIRouter, HTTPException

from app.data.egx_stocks import EGX_STOCKS
from app.models import (
    AIRecommendationItem,
    AIRecommendationsResponse,
    ChartPoint,
    Insight,
    Stock,
    StockChatRequest,
    StockChatResponse,
)
from app.services.cache import history_cache, insights_cache, quotes_cache, recommendations_cache
from app.services.gemini import (
    get_market_chat_response,
    get_market_recommendations,
    get_stock_insight,
)
from app.services.scraper import fetch_tv_egx_quotes
from app.services.yahoo_finance import get_stock_history, get_stock_quote

router = APIRouter(prefix="/api/stocks", tags=["stocks"])
logger = logging.getLogger(__name__)


def _static_description(stock_info: dict) -> str:
    return (
        f"{stock_info['name']} is a company listed on the Egyptian Exchange (EGX), "
        f"operating in the {stock_info.get('sector', '')} sector."
    )


async def _fetch_one_stock(
    stock_info: dict, semaphore: asyncio.Semaphore
) -> Stock | None:
    """Fetch a single stock via yfinance (fallback path) with bounded concurrency."""
    async with semaphore:
        loop = asyncio.get_event_loop()
        try:
            data = await loop.run_in_executor(
                None, get_stock_quote, stock_info["ticker"], stock_info
            )
            if data:
                return Stock(**data)
        except Exception as exc:
            logger.error("yfinance fallback failed for %s: %s", stock_info["ticker"], exc)
    return None


@router.get("", response_model=list[Stock])
async def get_all_stocks():
    """Return all EGX stocks with live prices. Results are cached for 5 minutes."""
    cached = quotes_cache.get("all_stocks")
    if cached is not None:
        return cached

    # ── Primary: TradingView Scanner (real-time, single request) ─────────────
    tv_quotes = await fetch_tv_egx_quotes()

    stocks: list[Stock] = []
    needs_fallback: list[dict] = []

    for stock_info in EGX_STOCKS:
        display = stock_info["display"]
        tv = tv_quotes.get(display)
        if tv:
            try:
                stocks.append(Stock(
                    ticker=display,
                    name=stock_info["name"],
                    description=_static_description(stock_info),
                    sector=stock_info.get("sector", ""),
                    industry=stock_info.get("industry", ""),
                    currency="EGP",
                    **tv,
                ))
            except Exception as exc:
                logger.error("Stock build failed for %s: %s", display, exc)
                needs_fallback.append(stock_info)
        else:
            needs_fallback.append(stock_info)

    # ── Fallback: yfinance for any tickers TV didn't return ───────────────────
    if needs_fallback:
        logger.info(
            "TradingView missing %d tickers; falling back to yfinance: %s",
            len(needs_fallback),
            [s["display"] for s in needs_fallback],
        )
        semaphore = asyncio.Semaphore(8)
        fallback = await asyncio.gather(
            *[_fetch_one_stock(s, semaphore) for s in needs_fallback]
        )
        stocks.extend(r for r in fallback if r is not None)

    if stocks:
        quotes_cache["all_stocks"] = stocks

    return stocks


def _recommendation_snapshot(stock: Stock) -> dict:
    """Keep only the fields Gemini needs for the market scanner recommendations."""
    return {
        "ticker": stock.ticker,
        "name": stock.name,
        "sector": stock.sector,
        "currentPrice": stock.currentPrice,
        "fairValue": stock.fairValue,
        "upside": stock.upside,
        "peRatio": stock.peRatio,
        "sentiment": stock.sentiment,
        "belowHigh": stock.belowHigh,
    }


@router.get("/ai-recommendations", response_model=AIRecommendationsResponse)
async def get_ai_recommendations():
    """Return Gemini-powered buy/sell recommendations based on current scanner data."""
    cached = recommendations_cache.get("recommendations")
    if cached is not None:
        return cached

    all_stocks: list | None = quotes_cache.get("all_stocks")
    if not all_stocks:
        all_stocks = await get_all_stocks()

    stocks_data = [_recommendation_snapshot(s) for s in all_stocks]
    raw = await get_market_recommendations(stocks_data)

    result = AIRecommendationsResponse(
        buy=[AIRecommendationItem(**item) for item in raw.get("buy", [])],
        sell=[AIRecommendationItem(**item) for item in raw.get("sell", [])],
        summary=raw.get("summary", ""),
        generated_at=datetime.utcnow().strftime("%H:%M UTC"),
    )
    recommendations_cache["recommendations"] = result
    return result


@router.post("/chat", response_model=StockChatResponse)
async def chat_about_stocks(payload: StockChatRequest):
    """Answer natural-language questions about the EGX market and tracked stocks."""
    all_stocks: list | None = quotes_cache.get("all_stocks")
    if not all_stocks:
        all_stocks = await get_all_stocks()

    stocks_data = [_recommendation_snapshot(s) for s in all_stocks]
    raw = await get_market_chat_response(
        payload.question,
        stocks_data,
        [msg.model_dump() for msg in payload.history],
    )

    return StockChatResponse(
        answer=raw.get("answer", "I could not generate a reply right now."),
        suggestedQuestions=raw.get("suggestedQuestions", []),
        usedFallback=bool(raw.get("usedFallback", False)),
    )


@router.get("/{ticker}/history", response_model=list[ChartPoint])
async def get_history(ticker: str, range: str = "1mo", interval: str = "1d"):
    """Return historical price data for a stock symbol (e.g. COMI)."""
    cache_key = f"history:{ticker.upper()}:{range}:{interval}"
    cached = history_cache.get(cache_key)
    if cached is not None:
        return cached

    stock_info = next(
        (s for s in EGX_STOCKS if s["display"].upper() == ticker.upper()), None
    )
    if not stock_info:
        raise HTTPException(
            status_code=404,
            detail=f"Stock '{ticker}' not found in the EGX universe",
        )

    loop = asyncio.get_event_loop()
    raw = await loop.run_in_executor(
        None, get_stock_history, stock_info["ticker"], range, interval
    )
    result = [ChartPoint(**p) for p in raw]
    history_cache[cache_key] = result
    return result


@router.get("/{ticker}/insights", response_model=Insight)
async def get_insights(ticker: str):
    """Return a Gemini-generated AI insight for a stock."""
    cache_key = f"insight:{ticker.upper()}"
    cached = insights_cache.get(cache_key)
    if cached is not None:
        return cached

    # Prefer pre-cached stock data; fall back to a fresh fetch
    all_stocks: list | None = quotes_cache.get("all_stocks")
    stock = (
        next((s for s in all_stocks if s.ticker.upper() == ticker.upper()), None)
        if all_stocks
        else None
    )

    if not stock:
        stock_info = next(
            (s for s in EGX_STOCKS if s["display"].upper() == ticker.upper()), None
        )
        if not stock_info:
            raise HTTPException(
                status_code=404, detail=f"Stock '{ticker}' not found"
            )
        loop = asyncio.get_event_loop()
        data = await loop.run_in_executor(
            None, get_stock_quote, stock_info["ticker"], stock_info
        )
        if not data:
            raise HTTPException(
                status_code=503, detail="Could not fetch stock data from Yahoo Finance"
            )
        stock = Stock(**data)

    insight_text = await get_stock_insight(ticker, stock.model_dump())
    result = Insight(
        id=f"ai-{ticker.lower()}",
        title=f"AI Analysis: {stock.name}",
        category="AI Research",
        content=insight_text,
        time="Generated now",
    )
    insights_cache[cache_key] = result
    return result


@router.get("/{ticker}", response_model=Stock)
async def get_single_stock(ticker: str):
    """Return data for a single stock by display ticker (e.g. COMI)."""
    all_stocks: list | None = quotes_cache.get("all_stocks")
    if all_stocks:
        stock = next(
            (s for s in all_stocks if s.ticker.upper() == ticker.upper()), None
        )
        if stock:
            return stock

    stock_info = next(
        (s for s in EGX_STOCKS if s["display"].upper() == ticker.upper()), None
    )
    if not stock_info:
        raise HTTPException(
            status_code=404, detail=f"Stock '{ticker}' not found in the EGX universe"
        )

    loop = asyncio.get_event_loop()
    data = await loop.run_in_executor(
        None, get_stock_quote, stock_info["ticker"], stock_info
    )
    if not data:
        raise HTTPException(
            status_code=503,
            detail="Could not fetch stock data from Yahoo Finance",
        )
    return Stock(**data)
