"""
Real-time EGX market data via the TradingView Scanner API.

The scanner endpoint is a semi-public JSON API used by TradingView's own
screener page.  No authentication is required.
"""

import logging
import math
from datetime import UTC

import httpx
from tenacity import retry, retry_if_exception_type, stop_after_attempt, wait_exponential

logger = logging.getLogger(__name__)

_TV_SCANNER = "https://scanner.tradingview.com/egypt/scan"

# Columns we request and their positional index in the returned "d" array.
# NOTE: TradingView uses "High.52W" / "Low.52W", NOT "52_week_high".
#       The "filter" and "symbols" keys are required – omitting them causes 400.
_COLUMNS = [
    "name",                           # 0  – ticker symbol (e.g. "COMI")
    "close",                          # 1  – last traded price
    "change",                         # 2  – % change from previous close
    "price_52_week_high",             # 3  – 52-week high
    "price_52_week_low",              # 4  – 52-week low
    "volume",                         # 5  – daily volume
    "market_cap_basic",               # 6  – market cap (local currency)
    "price_earnings_ttm",             # 7  – trailing P/E
    "earnings_per_share_basic_ttm",   # 8  – trailing EPS
    "Recommend.All",                  # 9  – technical recommendation −1..1
    "total_revenue",                  # 10 – annual revenue
    "logoid",                         # 11 – TradingView logo slug
]

_TV_LOGO_BASE = "https://s3-symbol-logo.tradingview.com/"

_PAYLOAD = {
    "filter": [],                           # required – empty = no filter
    "options": {"lang": "en"},
    "symbols": {"query": {"types": []}},    # required
    "columns": _COLUMNS,
    "sort": {"sortBy": "market_cap_basic", "sortOrder": "desc"},
    "range": [0, 300],
}

_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/122.0.0.0 Safari/537.36"
    ),
    "Content-Type": "application/json",
    "Origin": "https://www.tradingview.com",
    "Referer": "https://www.tradingview.com/",
    "Accept": "application/json",
}


@retry(
    stop=stop_after_attempt(3),
    wait=wait_exponential(multiplier=1, min=1, max=8),
    retry=retry_if_exception_type(httpx.HTTPError),
    reraise=True,
)
async def _post_tv(payload: dict) -> dict:
    async with httpx.AsyncClient(timeout=15) as client:
        resp = await client.post(_TV_SCANNER, json=payload, headers=_HEADERS)
        resp.raise_for_status()
        return resp.json()


def _safe(val, default: float = 0.0) -> float:
    """Return val as float, or default if None / NaN / unconvertible."""
    try:
        if val is None:
            return default
        f = float(val)
        return default if math.isnan(f) else f
    except (TypeError, ValueError):
        return default


def _fmt(value: float) -> str:
    """Format a raw number as a human-readable currency string."""
    if value <= 0:
        return "N/A"
    if value >= 1e12:
        return f"{value / 1e12:.2f}T"
    if value >= 1e9:
        return f"{value / 1e9:.2f}B"
    if value >= 1e6:
        return f"{value / 1e6:.2f}M"
    if value >= 1e3:
        return f"{value / 1e3:.2f}K"
    return f"{value:.2f}"


def _sentiment(recommend: float | None) -> int:
    """Map TradingView Recommend.All (−1..1) to a 0–100 bullish score."""
    if recommend is None:
        return 50
    return max(0, min(100, round((float(recommend) + 1) / 2 * 100)))


async def fetch_tv_egx_quotes() -> dict[str, dict]:
    """
    Fetch real-time EGX stock quotes from the TradingView Scanner API.

    Returns a dict keyed by display ticker (e.g. ``"COMI"``) whose values
    contain every numeric field needed to construct a ``Stock`` model
    *except* ``ticker``, ``name``, ``description``, ``sector``,
    ``industry``, ``logo``, and ``currency`` (those come from static data).
    Returns an empty dict on network / API failure.
    """
    try:
        payload = await _post_tv(_PAYLOAD)
    except Exception as exc:
        logger.error("TradingView scanner request failed: %s", exc)
        return {}

    quotes: dict[str, dict] = {}

    for row in payload.get("data", []):
        # row["s"] = "EGX:COMI", row["d"] = [col0, col1, ...]
        d: list = row.get("d", [])
        if not d or len(d) < 2:
            continue

        # d[0] is the "name" column → bare ticker like "COMI"
        ticker = str(d[0]).upper() if d[0] else ""
        if not ticker:
            continue

        price = _safe(d[1] if len(d) > 1 else None)
        if price <= 0:
            continue

        high52w = _safe(d[3] if len(d) > 3 else None)
        low52w  = _safe(d[4] if len(d) > 4 else None)
        mktcap  = _safe(d[6] if len(d) > 6 else None)
        pe      = _safe(d[7] if len(d) > 7 else None)
        eps     = _safe(d[8] if len(d) > 8 else None)
        rec     = d[9] if len(d) > 9 else None
        rev     = _safe(d[10] if len(d) > 10 else None)
        logoid  = str(d[11]).strip() if len(d) > 11 and d[11] else ""

        logo_url = f"{_TV_LOGO_BASE}{logoid}--big.svg" if logoid else None

        fair_value = round(high52w * 0.95, 2) if high52w > 0 else round(price * 1.10, 2)
        below_high = round((price - high52w) / high52w * 100, 1) if high52w > 0 else 0.0
        upside     = round((fair_value - price) / price * 100, 1) if price > 0 else 0.0

        quotes[ticker] = {
            "currentPrice": round(price, 2),
            "high52w":      round(high52w, 2),
            "low52w":       round(low52w, 2),
            "belowHigh":    below_high,
            "fairValue":    fair_value,
            "upside":       upside,
            "marketCap":    _fmt(mktcap),
            "peRatio":      round(pe, 1),
            "eps":          round(eps, 2),
            "sentiment":    _sentiment(rec),
            "revenue":      _fmt(rev),
            "logo":         logo_url,
        }

    logger.info("TradingView: received live quotes for %d EGX tickers", len(quotes))
    return quotes


async def fetch_tv_egx_index() -> dict | None:
    """
    Fetch the EGX30 index value from TradingView (symbol EGX:EGX30).
    Returns a dict compatible with ``MarketSummary``, or None on failure.
    """
    payload = {
        "filter": [],
        "options": {"lang": "en"},
        "symbols": {"tickers": ["EGX:EGX30"], "query": {"types": []}},
        "columns": ["close", "change", "change_abs"],
    }
    try:
        data = await _post_tv(payload)
    except Exception as exc:
        logger.error("TradingView EGX30 index fetch failed: %s", exc)
        return None

    rows = data.get("data", [])
    if not rows:
        return None

    d = rows[0].get("d", [])
    if not d or len(d) < 3:
        return None

    index_value = _safe(d[0])
    change_pct  = _safe(d[1])
    change_abs  = _safe(d[2])

    if index_value <= 0:
        return None

    from datetime import datetime
    return {
        "index_value":   round(index_value, 2),
        "change":        round(change_abs, 2),
        "changePercent": round(change_pct, 2),
        "timestamp":     datetime.now(UTC).strftime("%Y-%m-%d %H:%M"),
    }

