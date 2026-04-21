import logging
import math

import yfinance as yf

logger = logging.getLogger(__name__)


def format_currency_value(value: float | None) -> str:
    """Format a number as a human-readable string: 1.2T, 3.4B, 500M, etc."""
    if not value or value == 0:
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


def calc_sentiment(recommendation_key: str | None) -> int:
    """Map Yahoo Finance recommendation key to a 0-100 bullish sentiment score."""
    mapping = {
        "strong_buy": 90,
        "buy": 75,
        "hold": 50,
        "underperform": 30,
        "sell": 25,
        "strong_sell": 10,
    }
    if not recommendation_key:
        return 50
    return mapping.get(recommendation_key.lower(), 50)


def get_stock_quote(yf_ticker: str, static_info: dict) -> dict | None:
    """Fetch a single stock's quote and fundamentals from Yahoo Finance.

    Returns a dict that maps directly to the Stock Pydantic model, or None on
    failure / missing price data.

    Strategy (most reliable → least reliable):
      1. fast_info  – lightweight endpoint, works for most tickers including EGX
      2. history    – fallback price from last close if fast_info has no price
      3. info       – supplemental fundamentals only; failures are non-fatal
    """
    try:
        ticker_obj = yf.Ticker(yf_ticker)

        # ── Price and 52-week range via fast_info ────────────────────────────
        current_price: float | None = None
        high52w = 0.0
        low52w = 0.0
        try:
            fi = ticker_obj.fast_info
            raw_price = getattr(fi, "last_price", None)
            if raw_price is not None and not math.isnan(float(raw_price)):
                current_price = float(raw_price)
            raw_high = getattr(fi, "year_high", None)
            raw_low = getattr(fi, "year_low", None)
            if raw_high is not None and not math.isnan(float(raw_high)):
                high52w = float(raw_high)
            if raw_low is not None and not math.isnan(float(raw_low)):
                low52w = float(raw_low)
        except Exception as exc:
            logger.warning("fast_info failed for %s: %s", yf_ticker, exc)

        # ── Fallback: last close from recent history ─────────────────────────
        if not current_price or current_price <= 0:
            try:
                hist = ticker_obj.history(period="5d")
                if not hist.empty:
                    closes = hist["Close"].dropna()
                    if not closes.empty:
                        current_price = float(closes.iloc[-1])
            except Exception as exc:
                logger.warning("history fallback failed for %s: %s", yf_ticker, exc)

        if not current_price or current_price <= 0:
            logger.warning("No valid price for %s", yf_ticker)
            return None

        # ── Supplemental fundamentals from info (non-critical) ───────────────
        info: dict = {}
        try:
            fetched = ticker_obj.info
            if isinstance(fetched, dict) and fetched:
                info = fetched
        except Exception as exc:
            logger.warning("info fetch failed for %s: %s", yf_ticker, exc)

        # Prefer info dict for 52W range if fast_info didn't return it
        if high52w == 0:
            high52w = float(info.get("fiftyTwoWeekHigh") or 0)
        if low52w == 0:
            low52w = float(info.get("fiftyTwoWeekLow") or 0)

        # ── Fair value: analyst target > 52W high × 0.95 fallback ───────────
        target_price = info.get("targetMeanPrice")
        if target_price and float(target_price) > 0:
            fair_value = round(float(target_price), 2)
        elif high52w > 0:
            fair_value = round(high52w * 0.95, 2)
        else:
            fair_value = round(current_price * 1.10, 2)

        below_high = (
            round((current_price - high52w) / high52w * 100, 1) if high52w > 0 else 0.0
        )
        upside = (
            round((fair_value - current_price) / current_price * 100, 1)
            if current_price > 0
            else 0.0
        )

        # ── Fundamentals ─────────────────────────────────────────────────────
        pe = info.get("trailingPE") or 0
        eps = info.get("trailingEps") or 0
        market_cap = info.get("marketCap") or 0
        revenue = info.get("totalRevenue") or 0
        recommendation = info.get("recommendationKey") or "hold"

        # ── Sector / Industry with static fallback ───────────────────────────
        sector = info.get("sector") or static_info.get("sector", "")
        industry = info.get("industry") or static_info.get("industry", "")

        description = info.get("longBusinessSummary") or (
            f"{static_info.get('name', '')} is a company listed on the Egyptian Exchange "
            f"(EGX), operating in the {sector} sector."
        )

        return {
            "ticker": static_info["display"],
            "name": (
                info.get("longName")
                or info.get("shortName")
                or static_info.get("name", yf_ticker)
            ),
            "currentPrice": round(current_price, 2),
            "high52w": round(high52w, 2),
            "low52w": round(low52w, 2),
            "belowHigh": below_high,
            "fairValue": fair_value,
            "upside": upside,
            "peRatio": round(float(pe), 1) if pe else 0.0,
            "marketCap": format_currency_value(float(market_cap) if market_cap else 0),
            "eps": round(float(eps), 2) if eps else 0.0,
            "revenue": format_currency_value(float(revenue) if revenue else 0),
            "description": description,
            "sector": sector or static_info.get("sector", ""),
            "industry": industry or static_info.get("industry", ""),
            "sentiment": calc_sentiment(str(recommendation)),
            "logo": None,
            "currency": "EGP",
        }
    except Exception as exc:
        logger.error("Error fetching quote for %s: %s", yf_ticker, exc)
        return None


def get_stock_history(
    yf_ticker: str, period: str = "1mo", interval: str = "1d"
) -> list:
    """Fetch historical OHLCV data using Yahoo Finance's v8 chart API directly.

    Bypasses yfinance's internal DataFrame parsing which silently fails for
    EGX (.CA) tickers in newer yfinance versions.
    Returns a list of dicts compatible with the ChartPoint Pydantic model.
    """
    import json
    import time
    import urllib.request

    url = (
        f"https://query1.finance.yahoo.com/v8/finance/chart/{yf_ticker}"
        f"?interval={interval}&range={period}&includePrePost=false"
    )
    headers = {
        "User-Agent": (
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
            "AppleWebKit/537.36 (KHTML, like Gecko) "
            "Chrome/122.0.0.0 Safari/537.36"
        ),
        "Accept": "application/json",
    }

    try:
        req = urllib.request.Request(url, headers=headers)
        with urllib.request.urlopen(req, timeout=15) as resp:
            data = json.loads(resp.read())
    except Exception as exc:
        logger.error("Yahoo chart API request failed for %s: %s", yf_ticker, exc)
        return []

    def _parse_chart_response(raw_data: dict, ivl: str) -> list:
        """Extract split-adjusted ChartPoint dicts from a raw v8 chart JSON response.

        Uses adjclose (adjusted close) so that historical prices are
        retroactively corrected for bonus share distributions and stock splits,
        giving a continuous, comparable series. Falls back to raw close if the
        adjclose field is absent (e.g. for intraday intervals where YF omits it).
        """
        result_data = raw_data.get("chart", {}).get("result")
        if not result_data:
            return []
        chart = result_data[0]
        ts_list = chart.get("timestamp") or []
        indicators = chart.get("indicators", {})
        quote0 = (indicators.get("quote") or [{}])[0]
        # adjclose lives in a separate top-level key in the indicators dict
        adjclose_list = (
            (indicators.get("adjclose") or [{}])[0].get("adjclose") or []
        )
        # Fall back to raw close when adjclose is unavailable (intraday)
        cl_list = adjclose_list if adjclose_list else (quote0.get("close") or [])
        vol_list = quote0.get("volume") or []
        if not ts_list or not cl_list:
            return []
        INTRADAY = {'1m', '2m', '5m', '15m', '30m', '60m', '90m', '1h'}
        rows = []
        for ts, close, vol in zip(
            ts_list,
            cl_list,
            vol_list or [None] * len(ts_list),
            strict=False,
        ):
            if close is None or math.isnan(float(close)):
                continue
            if ivl in INTRADAY:
                date_str = time.strftime("%Y-%m-%d %H:%M", time.gmtime(ts))
            else:
                date_str = time.strftime("%Y-%m-%d", time.gmtime(ts))
            rows.append({
                "date": date_str,
                "price": round(float(close), 2),
                "volume": int(vol) if vol is not None and not math.isnan(float(vol)) else None,
            })
        return rows

    try:
        result_data = data["chart"]["result"]
        if not result_data:
            logger.warning("No chart result for %s (period=%s)", yf_ticker, period)
            return []

        chart = result_data[0]
        timestamps = chart.get("timestamp", [])
        # Use adjclose for the "not empty" check so we're consistent with _parse_chart_response
        closes = (
            (chart.get("indicators", {}).get("adjclose") or [{}])[0].get("adjclose")
            or chart.get("indicators", {}).get("quote", [{}])[0].get("close", [])
        )
        if not timestamps or not closes:
            logger.warning("Empty chart data for %s (period=%s)", yf_ticker, period)
            # ── EGX tickers don't support 1d range; fall back to 5d + filter ──
            if period == "1d":
                fallback_url = (
                    f"https://query1.finance.yahoo.com/v8/finance/chart/{yf_ticker}"
                    f"?interval={interval}&range=5d&includePrePost=false"
                )
                try:
                    fb_req = urllib.request.Request(fallback_url, headers=headers)
                    with urllib.request.urlopen(fb_req, timeout=15) as fb_resp:
                        fb_data = json.loads(fb_resp.read())
                    all_bars = _parse_chart_response(fb_data, interval)
                    if all_bars:
                        last_date = all_bars[-1]["date"].split(" ")[0]
                        bars = [b for b in all_bars if b["date"].startswith(last_date)]
                        logger.info(
                            "1d fallback: returning %d bars for last date %s (%s)",
                            len(bars), last_date, yf_ticker,
                        )
                        return bars
                except Exception as fb_exc:
                    logger.error("1d fallback failed for %s: %s", yf_ticker, fb_exc)
            return []

        result = _parse_chart_response(data, interval)
        logger.info("Yahoo chart: %d points for %s (%s)", len(result), yf_ticker, period)
        return result

    except Exception as exc:
        logger.error("Error parsing chart response for %s: %s", yf_ticker, exc)
        return []


def get_egx_index() -> dict | None:
    """Fetch EGX30 index value and daily change percentage."""
    # Try primary ticker first, then fallback
    for index_ticker in ("^CASE30", "^EGX30CAPPED.CA"):
        try:
            ticker_obj = yf.Ticker(index_ticker)
            hist = ticker_obj.history(period="5d", interval="1d")
            if not hist.empty:
                closes = hist["Close"].dropna()
                if len(closes) >= 1:
                    latest = float(closes.iloc[-1])
                    prev = float(closes.iloc[-2]) if len(closes) >= 2 else latest
                    change = round(latest - prev, 2)
                    change_pct = round((change / prev) * 100, 2) if prev > 0 else 0.0
                    return {
                        "index_value": round(latest, 2),
                        "change": change,
                        "changePercent": change_pct,
                        "timestamp": hist.index[-1].strftime("%Y-%m-%d %H:%M"),
                    }
        except Exception as exc:
            logger.warning("Error fetching %s: %s", index_ticker, exc)

    logger.error("Could not fetch EGX index from any source")
    return None
