"""
Run this from the Backend directory:
    python debug_prices.py

Quick test of the new Yahoo Finance v8 chart API for EGX history.
"""
import json
import math
import time
import urllib.request

HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/122.0.0.0 Safari/537.36"
    ),
    "Accept": "application/json",
}


def fetch_history(ticker_ca, period="3mo", interval="1d"):
    url = (
        f"https://query1.finance.yahoo.com/v8/finance/chart/{ticker_ca}"
        f"?interval={interval}&range={period}&includePrePost=false"
    )
    req = urllib.request.Request(url, headers=HEADERS)
    with urllib.request.urlopen(req, timeout=15) as resp:
        data = json.loads(resp.read())
    chart = data["chart"]["result"][0]
    timestamps = chart.get("timestamp", [])
    closes = chart.get("indicators", {}).get("quote", [{}])[0].get("close", [])
    result = []
    for ts, close in zip(timestamps, closes, strict=False):
        if close and not math.isnan(float(close)):
            result.append(
                {
                    "date": time.strftime("%Y-%m-%d", time.gmtime(ts)),
                    "price": round(float(close), 2),
                }
            )
    return result


for ticker in ["COMI.CA", "TMGH.CA", "ADIB.CA"]:
    try:
        pts = fetch_history(ticker)
        last = pts[-1] if pts else None
        print(f"  {ticker:<10} {len(pts)} points | latest: {last}")
    except Exception as e:
        print(f"  {ticker:<10} FAILED: {e}")







