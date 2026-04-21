import logging

from fastapi import APIRouter, Depends, HTTPException

from app.auth import get_current_user
from app.data.egx_stocks import EGX_STOCKS
from app.database import get_db
from app.models import AddWatchlistRequest, WatchlistItem
from app.services.cache import quotes_cache

router = APIRouter(prefix="/api/watchlist", tags=["watchlist"])
logger = logging.getLogger(__name__)

_EGX_TICKERS: set[str] = {s["ticker"].upper() for s in EGX_STOCKS}


def _enrich(ticker: str) -> WatchlistItem:
    """Build a WatchlistItem by looking up the ticker in the quotes cache."""
    all_stocks = quotes_cache.get("all_stocks") or []
    stock = next((s for s in all_stocks if s.ticker == ticker), None)
    if stock:
        return WatchlistItem(
            ticker=stock.ticker,
            name=stock.name,
            sector=stock.sector,
            currentPrice=stock.currentPrice,
            fairValue=stock.fairValue,
            upside=stock.upside,
            belowHigh=stock.belowHigh,
            high52w=stock.high52w,
            low52w=stock.low52w,
            peRatio=stock.peRatio,
            sentiment=stock.sentiment,
            currency=stock.currency,
        )
    # Ticker in watchlist but not yet in cache — return a stub
    return WatchlistItem(ticker=ticker, name=ticker)


@router.get("", response_model=list[WatchlistItem])
async def get_watchlist(current_user: dict = Depends(get_current_user)):
    """Return all watched tickers enriched with live market data."""
    db = get_db()
    user_id = str(current_user["_id"])
    doc = await db.watchlists.find_one({"user_id": user_id})
    tickers: list[str] = doc["tickers"] if doc else []
    return [_enrich(t) for t in tickers]


@router.post("", response_model=WatchlistItem, status_code=201)
async def add_to_watchlist(
    req: AddWatchlistRequest, current_user: dict = Depends(get_current_user)
):
    """Add a ticker to the authenticated user's watchlist."""
    ticker = req.ticker.upper().strip()
    if not ticker:
        raise HTTPException(status_code=422, detail="Ticker must not be empty")

    # Validate ticker exists in the EGX universe.
    # Fall back to static list when live cache is cold so a valid ticker is
    # never wrongly rejected due to a 5-minute TTL expiry.
    all_stocks = quotes_cache.get("all_stocks") or []
    if all_stocks:
        if not any(s.ticker == ticker for s in all_stocks):
            raise HTTPException(
                status_code=404,
                detail=f"Ticker '{ticker}' not found in EGX universe.",
            )
    elif ticker not in _EGX_TICKERS:
        raise HTTPException(
            status_code=404,
            detail=f"Ticker '{ticker}' not found in EGX universe.",
        )

    db = get_db()
    user_id = str(current_user["_id"])
    await db.watchlists.update_one(
        {"user_id": user_id},
        {"$addToSet": {"tickers": ticker}},
        upsert=True,
    )
    logger.info("Watchlist[%s]: added %s", user_id, ticker)
    return _enrich(ticker)


@router.delete("/{ticker}", status_code=204)
async def remove_from_watchlist(
    ticker: str, current_user: dict = Depends(get_current_user)
):
    """Remove a ticker from the authenticated user's watchlist."""
    upper = ticker.upper()
    db = get_db()
    user_id = str(current_user["_id"])
    result = await db.watchlists.update_one(
        {"user_id": user_id},
        {"$pull": {"tickers": upper}},
    )
    if result.modified_count == 0:
        raise HTTPException(status_code=404, detail="Ticker not in watchlist")
    logger.info("Watchlist[%s]: removed %s", user_id, upper)
