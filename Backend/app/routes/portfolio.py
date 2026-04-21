import logging
import uuid

from fastapi import APIRouter, Depends, HTTPException

from app.auth import get_current_user
from app.data.egx_stocks import EGX_STOCKS
from app.database import get_db
from app.models import AddHoldingRequest, PortfolioHolding, PortfolioStats
from app.services.cache import quotes_cache

router = APIRouter(prefix="/api/portfolio", tags=["portfolio"])
logger = logging.getLogger(__name__)

# Pre-built set of valid tickers for O(1) validation even when cache is cold
_EGX_TICKERS: set[str] = {s["ticker"].upper() for s in EGX_STOCKS}


def _enrich(holding: dict) -> PortfolioHolding:
    """Attach live price data from the quotes cache to a stored holding."""
    all_stocks = quotes_cache.get("all_stocks") or []
    stock = next((s for s in all_stocks if s.ticker == holding["ticker"]), None)

    current_price = stock.currentPrice if stock else 0.0
    name = stock.name if stock else holding.get("name", holding["ticker"])
    sector = stock.sector if stock else holding.get("sector", "")

    cost_basis = holding["quantity"] * holding["avgCost"]
    current_value = holding["quantity"] * current_price
    gain_loss = current_value - cost_basis
    gain_loss_pct = (gain_loss / cost_basis * 100) if cost_basis else 0.0

    return PortfolioHolding(
        id=holding["id"],
        ticker=holding["ticker"],
        name=name,
        sector=sector,
        quantity=holding["quantity"],
        avgCost=holding["avgCost"],
        currentPrice=current_price,
        currentValue=round(current_value, 2),
        costBasis=round(cost_basis, 2),
        gainLoss=round(gain_loss, 2),
        gainLossPercent=round(gain_loss_pct, 2),
    )


@router.get("", response_model=PortfolioStats)
async def get_portfolio(current_user: dict = Depends(get_current_user)):
    """Return the authenticated user's portfolio with live-price P&L stats."""
    db = get_db()
    user_id = str(current_user["_id"])
    docs = await db.holdings.find({"user_id": user_id}).to_list(length=None)
    holdings = [_enrich(h) for h in docs]

    total_invested = sum(h.costBasis for h in holdings)
    current_value = sum(h.currentValue for h in holdings)
    total_gain_loss = current_value - total_invested
    total_gain_loss_pct = (
        (total_gain_loss / total_invested * 100) if total_invested else 0.0
    )

    return PortfolioStats(
        totalInvested=round(total_invested, 2),
        currentValue=round(current_value, 2),
        totalGainLoss=round(total_gain_loss, 2),
        totalGainLossPercent=round(total_gain_loss_pct, 2),
        holdings=holdings,
    )


@router.post("/holdings", response_model=PortfolioHolding, status_code=201)
async def add_holding(req: AddHoldingRequest, current_user: dict = Depends(get_current_user)):
    """Add a new holding to the authenticated user's portfolio."""
    if req.quantity <= 0:
        raise HTTPException(status_code=422, detail="Quantity must be positive")
    if req.avgCost <= 0:
        raise HTTPException(status_code=422, detail="Average cost must be positive")

    # Validate the ticker exists in the EGX universe.
    # Prefer the live cache (gives us name/sector); fall back to the static
    # ticker list so validation never wrongly rejects a valid ticker when
    # the 5-minute TTL cache happens to be cold.
    all_stocks = quotes_cache.get("all_stocks") or []
    stock = next((s for s in all_stocks if s.ticker == req.ticker.upper()), None)

    if stock is None:
        # Cache is cold — check the static universe before rejecting
        if req.ticker.upper() not in _EGX_TICKERS:
            raise HTTPException(
                status_code=404,
                detail=f"Ticker '{req.ticker}' not found in EGX universe.",
            )
        # Valid ticker but no live quote yet — store stub name/sector
        name = req.ticker.upper()
        sector = ""
        static = next(
            (s for s in EGX_STOCKS if s["ticker"].upper() == req.ticker.upper()), None
        )
        if static:
            name = static.get("name", name)
            sector = static.get("sector", "")
    else:
        name = stock.name
        sector = stock.sector

    holding_id = str(uuid.uuid4())
    user_id = str(current_user["_id"])
    doc = {
        "id": holding_id,
        "user_id": user_id,
        "ticker": req.ticker.upper(),
        "name": name,
        "sector": sector,
        "quantity": req.quantity,
        "avgCost": req.avgCost,
    }
    db = get_db()
    await db.holdings.insert_one(doc)
    logger.info(
        "Portfolio[%s]: added %s x%.2f @ %.2f",
        user_id, req.ticker.upper(), req.quantity, req.avgCost,
    )
    return _enrich(doc)


@router.delete("/holdings/{holding_id}", status_code=204)
async def remove_holding(holding_id: str, current_user: dict = Depends(get_current_user)):
    """Remove a holding belonging to the authenticated user."""
    db = get_db()
    user_id = str(current_user["_id"])
    result = await db.holdings.delete_one({"id": holding_id, "user_id": user_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Holding not found")
    logger.info("Portfolio[%s]: removed holding %s", user_id, holding_id)


@router.put("/holdings/{holding_id}", response_model=PortfolioHolding)
async def update_holding(
    holding_id: str,
    req: AddHoldingRequest,
    current_user: dict = Depends(get_current_user),
):
    """Update quantity / average cost of an existing holding."""
    if req.quantity <= 0:
        raise HTTPException(status_code=422, detail="Quantity must be positive")
    if req.avgCost <= 0:
        raise HTTPException(status_code=422, detail="Average cost must be positive")

    db = get_db()
    user_id = str(current_user["_id"])
    result = await db.holdings.find_one_and_update(
        {"id": holding_id, "user_id": user_id},
        {"$set": {"quantity": req.quantity, "avgCost": req.avgCost}},
        return_document=True,
    )
    if result is None:
        raise HTTPException(status_code=404, detail="Holding not found")
    return _enrich(result)
