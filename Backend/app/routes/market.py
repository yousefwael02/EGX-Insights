import asyncio
import logging

from fastapi import APIRouter, HTTPException

from app.models import AlphaLeader, MarketSummary, ValueFloor
from app.services.cache import market_cache, quotes_cache
from app.services.scraper import fetch_tv_egx_index
from app.services.yahoo_finance import get_egx_index

router = APIRouter(prefix="/api/market", tags=["market"])
logger = logging.getLogger(__name__)


@router.get("/summary", response_model=MarketSummary)
async def get_market_summary():
    """Return EGX30 index value and daily change."""
    cached = market_cache.get("summary")
    if cached is not None:
        return cached

    # Primary: TradingView (live data)
    data = await fetch_tv_egx_index()

    # Fallback: yfinance history
    if not data:
        logger.warning("TradingView index fetch failed; falling back to yfinance")
        loop = asyncio.get_event_loop()
        data = await loop.run_in_executor(None, get_egx_index)

    if not data:
        raise HTTPException(status_code=503, detail="Could not fetch EGX index data")

    result = MarketSummary(**data)
    market_cache["summary"] = result
    return result


@router.get("/leaders", response_model=list[AlphaLeader])
async def get_alpha_leaders():
    """Return the top 3 EGX stocks by estimated upside (Alpha Leaders)."""
    all_stocks = quotes_cache.get("all_stocks")
    if not all_stocks:
        raise HTTPException(
            status_code=503,
            detail="Stock data not yet loaded. Please call /api/stocks first.",
        )

    positive = [s for s in all_stocks if s.upside > 0]
    top3 = sorted(positive, key=lambda s: s.upside, reverse=True)[:3]

    if not top3:
        return []

    max_upside = top3[0].upside or 1
    return [
        AlphaLeader(
            ticker=s.ticker,
            name=s.name,
            upside=s.upside,
            progress=min(100, int((s.upside / max_upside) * 100)),
        )
        for s in top3
    ]


@router.get("/value-floor", response_model=list[ValueFloor])
async def get_value_floor():
    """Return the 3 EGX stocks trading closest to their 52-week low (Value Floor)."""
    all_stocks = quotes_cache.get("all_stocks")
    if not all_stocks:
        raise HTTPException(
            status_code=503,
            detail="Stock data not yet loaded. Please call /api/stocks first.",
        )

    # Only consider stocks with valid low52w data
    valid = [s for s in all_stocks if s.low52w > 0 and s.currentPrice > 0]

    def pct_from_low(s) -> float:
        return (s.currentPrice - s.low52w) / s.low52w * 100

    bottom3 = sorted(valid, key=pct_from_low)[:3]

    return [
        ValueFloor(
            ticker=s.ticker,
            name=s.name,
            fromLow=round(pct_from_low(s), 1),
        )
        for s in bottom3
    ]
