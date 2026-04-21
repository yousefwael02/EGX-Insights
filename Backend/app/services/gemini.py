import asyncio
import json
import logging
import os
import re
import time

from dotenv import load_dotenv

load_dotenv()

logger = logging.getLogger(__name__)

_api_key: str | None = os.getenv("GEMINI_API_KEY")
_default_gemini_model = os.getenv("GEMINI_MODEL", "models/gemini-flash-lite-latest").strip()
_gemini_models = list(dict.fromkeys(
    model for model in [
        _default_gemini_model,
        "models/gemini-2.5-flash-lite",
        "models/gemini-2.0-flash-lite-001",
        "models/gemini-2.0-flash-lite",
        "models/gemini-2.0-flash",
    ] if model
))
_gemini_quota_backoff_until = 0.0

# Configure the SDK only if a key is present
if _api_key:
    try:
        import google.generativeai as genai

        genai.configure(api_key=_api_key)
        _genai_available = True
    except Exception as exc:
        logger.error("Failed to configure Gemini SDK: %s", exc)
        _genai_available = False
else:
    _genai_available = False


def _is_quota_error(exc: Exception | str) -> bool:
    text = str(exc).lower()
    return "quota exceeded" in text or "rate limit" in text or "429" in text


def _extract_retry_delay_seconds(message: str, default: int = 60) -> int:
    match = re.search(r"retry in\s+([\d.]+)s", message.lower())
    if match:
        return max(15, int(float(match.group(1))) + 1)
    return default


def _normalize_gemini_text(text: str) -> str:
    """Normalize whitespace and common encoding artifacts in Gemini text output."""
    cleaned = (text or "").replace("â€”", "—").replace("â€“", "–").replace("â€", '"')
    cleaned = cleaned.replace("\r\n", "\n").replace("\r", "\n")
    cleaned = re.sub(r"\n{3,}", "\n\n", cleaned)
    return cleaned.strip()


def _extract_finish_reason(response: object) -> str:
    candidates = getattr(response, "candidates", None) or []
    if not candidates:
        return ""
    finish_reason = getattr(candidates[0], "finish_reason", "")
    return str(finish_reason or "").upper()


def _looks_incomplete_text(text: str, finish_reason: str = "") -> bool:
    stripped = (text or "").strip()
    if not stripped:
        return True
    if "MAX_TOKENS" in finish_reason:
        return True
    if stripped.endswith((".", "!", "?", "…", '"', "”")):
        return False
    return True


def _trim_to_complete_boundary(text: str) -> str:
    """If a reply ends mid-sentence, trim it back to the last complete sentence or bullet."""
    stripped = _normalize_gemini_text(text)
    if not stripped or stripped.endswith((".", "!", "?", "…", '"', "”")):
        return stripped

    sentence_endings = [match.end() for match in re.finditer(r"[.!?](?:\s|$)", stripped)]
    bullet_breaks = [match.start() for match in re.finditer(r"\n[-*]\s", stripped)]
    candidates = sentence_endings + bullet_breaks
    if candidates:
        cutoff = max(candidates)
        if cutoff >= max(40, int(len(stripped) * 0.55)):
            return stripped[:cutoff].strip()
    return stripped


def _merge_continuation(base_text: str, continuation_text: str) -> str:
    """Merge a second Gemini continuation while avoiding obvious repeated overlap."""
    base = _normalize_gemini_text(base_text)
    continuation = _normalize_gemini_text(continuation_text)
    if not continuation:
        return base

    for size in range(min(120, len(base)), 30, -10):
        overlap = base[-size:].strip()
        if overlap and continuation.startswith(overlap):
            continuation = continuation[len(overlap):].lstrip()
            break

    if continuation.startswith(('.', ',', ';', ':')):
        continuation = continuation.lstrip()

    separator = " "
    if not base or base.endswith(("\n", " ")):
        separator = ""
    elif base[-1].isdigit() and continuation[:1].isdigit():
        separator = ""
    elif base[-1].isalpha() and continuation[:1].islower():
        separator = ""
    elif base[-1] in {"-", "—", "/"}:
        separator = ""

    return f"{base}{separator}{continuation}".strip()


def _generate_text_with_gemini(
    prompt: str,
    *,
    generation_config: dict | None = None,
    preferred_models: list[str] | None = None,
    allow_continuation: bool = False,
) -> str:
    """Try a small set of Gemini models and back off briefly when the free-tier quota is exhausted."""
    global _gemini_quota_backoff_until

    if not _genai_available:
        raise RuntimeError("Gemini SDK is not configured")

    now = time.time()
    if _gemini_quota_backoff_until > now:
        remaining = int(_gemini_quota_backoff_until - now)
        raise RuntimeError(f"Gemini quota cooldown active for another {remaining}s")

    import google.generativeai as genai

    last_exc: Exception | None = None
    quota_wait_seconds = 0
    models_to_try = list(dict.fromkeys([*(preferred_models or []), *_gemini_models]))

    for model_name in models_to_try:
        try:
            model = genai.GenerativeModel(model_name)
            kwargs = {"generation_config": generation_config} if generation_config else {}
            response = model.generate_content(prompt, **kwargs)
            text = _normalize_gemini_text(getattr(response, "text", "") or "")
            finish_reason = _extract_finish_reason(response)

            if allow_continuation and text and _looks_incomplete_text(text, finish_reason):
                try:
                    continuation_prompt = (
                        "Continue the following answer from exactly where it stopped. "
                        "Do not repeat the beginning. Finish the last unfinished sentence and end cleanly.\n\n"
                        f"Partial answer:\n{text}\n\nContinuation only:"
                    )
                    follow_up = model.generate_content(continuation_prompt, **kwargs)
                    follow_up_text = _normalize_gemini_text(getattr(follow_up, "text", "") or "")
                    if follow_up_text:
                        text = _merge_continuation(text, follow_up_text)
                except Exception:
                    pass


            text = _trim_to_complete_boundary(text) if allow_continuation else text
            if text:
                return text
            raise ValueError(f"Empty response from Gemini model {model_name}")
        except Exception as exc:
            last_exc = exc
            if _is_quota_error(exc):
                quota_wait_seconds = max(quota_wait_seconds, _extract_retry_delay_seconds(str(exc)))
                logger.warning("Gemini quota hit for %s; trying the next configured model.", model_name)
            else:
                logger.warning("Gemini model %s failed; trying fallback. Error: %s", model_name, exc)

    if quota_wait_seconds > 0:
        _gemini_quota_backoff_until = time.time() + quota_wait_seconds
        raise RuntimeError(
            f"Gemini quota exceeded for all configured models. Retry in about {quota_wait_seconds}s."
        ) from last_exc

    raise RuntimeError("All configured Gemini models failed.") from last_exc


def _generate_insight_sync(ticker: str, stock_data: dict) -> str:
    """Blocking Gemini call — must be run inside a thread executor."""
    if not _genai_available:
        return (
            f"{stock_data.get('name', ticker)} is listed on the Egyptian Exchange (EGX). "
            "Add your GEMINI_API_KEY to Backend/.env to enable AI-powered analysis."
        )

    prompt = (
        f"EGX analyst. 2-3 sentence analysis of {stock_data.get('name')} ({ticker}), "
        f"{stock_data.get('sector')} sector. "
        f"Price EGP {stock_data.get('currentPrice')}, upside {stock_data.get('upside')}%, "
        f"P/E {stock_data.get('peRatio')}. "
        "Focus on valuation vs EGX peers and key risk/opportunity. No bullets or headers."
    )

    try:
        return _generate_text_with_gemini(prompt)
    except Exception as exc:
        if _is_quota_error(exc) or "cooldown" in str(exc).lower():
            logger.warning("Gemini insight temporarily unavailable for %s: %s", ticker, exc)
        else:
            logger.error("Gemini error for %s: %s", ticker, exc)
        sector = stock_data.get("sector", "")
        return (
            f"{stock_data.get('name', ticker)} operates in Egypt's {sector} sector. "
            "Based on current market valuations, the stock presents a compelling case "
            "for EGX-focused investors. Always conduct thorough due diligence before "
            "making any investment decisions."
        )


async def get_stock_insight(ticker: str, stock_data: dict) -> str:
    """Async wrapper: runs the blocking Gemini call in a thread pool executor."""
    loop = asyncio.get_event_loop()
    return await loop.run_in_executor(None, _generate_insight_sync, ticker, stock_data)


def _compact_stock(stock: dict) -> dict:
    """Keep only the fields that matter for recommendations."""
    return {
        "ticker": stock.get("ticker", ""),
        "name": stock.get("name", ""),
        "sector": stock.get("sector", ""),
        "currentPrice": round(float(stock.get("currentPrice", 0) or 0), 2),
        "fairValue": round(float(stock.get("fairValue", 0) or 0), 2),
        "upside": round(float(stock.get("upside", 0) or 0), 1),
        "peRatio": round(float(stock.get("peRatio", 0) or 0), 1),
        "sentiment": int(stock.get("sentiment", 50) or 50),
        "belowHigh": round(float(stock.get("belowHigh", 0) or 0), 1),
    }


def _prepare_candidate_buckets(stocks_data: list[dict], limit: int = 2) -> dict[str, list[dict]]:
    """Pre-filter the market into a very small shortlist for Gemini free-tier calls."""

    def top(items: list[dict], key, reverse: bool = True) -> list[dict]:
        ranked = sorted(items, key=key, reverse=reverse)[:limit]
        return [_compact_stock(stock) for stock in ranked]

    return {
        "alpha": top(
            [s for s in stocks_data if float(s.get("upside", 0) or 0) > 5],
            lambda s: float(s.get("upside", 0) or 0),
        ),
        "deep_value": top(
            [s for s in stocks_data if 0 < float(s.get("peRatio", 0) or 0) < 15],
            lambda s: float(s.get("peRatio", 999) or 999),
            reverse=False,
        ),
        "bullish": top(
            [s for s in stocks_data if int(s.get("sentiment", 0) or 0) >= 62],
            lambda s: int(s.get("sentiment", 0) or 0),
        ),
        "overvalued": top(
            [s for s in stocks_data if float(s.get("upside", 0) or 0) < -5],
            lambda s: float(s.get("upside", 0) or 0),
            reverse=False,
        ),
        "bearish": top(
            [s for s in stocks_data if int(s.get("sentiment", 100) or 100) < 40],
            lambda s: int(s.get("sentiment", 100) or 100),
            reverse=False,
        ),
    }


def _build_rule_based_recommendations(stocks_data: list[dict]) -> dict:
    """Fallback recommendations when Gemini is unavailable or returns invalid JSON."""
    buckets = _prepare_candidate_buckets(stocks_data, limit=2)
    buy: list[dict] = []
    sell: list[dict] = []
    seen_buy: set[str] = set()
    seen_sell: set[str] = set()

    def add_pick(target: list[dict], seen: set[str], stock: dict, scanner: str, reason: str) -> None:
        ticker = stock.get("ticker")
        if not ticker or ticker in seen:
            return

        conviction = "Medium"
        upside = float(stock.get("upside", 0) or 0)
        sentiment = int(stock.get("sentiment", 50) or 50)
        pe_ratio = float(stock.get("peRatio", 0) or 0)

        if scanner in {"Alpha Hunt", "Bullish Consensus"} and (upside >= 15 or sentiment >= 70):
            conviction = "High"
        elif scanner == "Deep Value" and 0 < pe_ratio <= 8:
            conviction = "High"
        elif scanner in {"Overvalued", "Bearish Watch"} and (upside <= -10 or sentiment <= 30):
            conviction = "High"

        target.append({
            "ticker": ticker,
            "name": stock.get("name", ticker),
            "reason": reason,
            "conviction": conviction,
            "scanner": scanner,
        })
        seen.add(ticker)

    for stock in buckets["alpha"]:
        add_pick(buy, seen_buy, stock, "Alpha Hunt", "Strong upside versus fair value")
    for stock in buckets["deep_value"]:
        add_pick(buy, seen_buy, stock, "Deep Value", "Low P/E compared with peers")
    for stock in buckets["bullish"]:
        add_pick(buy, seen_buy, stock, "Bullish Consensus", "Momentum and sentiment stay strong")

    for stock in buckets["overvalued"]:
        add_pick(sell, seen_sell, stock, "Overvalued", "Trading above estimated fair value")
    for stock in buckets["bearish"]:
        add_pick(sell, seen_sell, stock, "Bearish Watch", "Sentiment remains notably weak")

    buy = buy[:4]
    sell = sell[:2]

    if buy and sell:
        summary = "Selective EGX value ideas still stand out, while weak-sentiment names remain the main risk pocket."
    elif buy:
        summary = "Current scanners lean constructive, with the best setups clustered in value and upside screens."
    elif sell:
        summary = "Risk signals dominate the current snapshot, especially in overvalued or weak-sentiment names."
    else:
        summary = "No strong scanner signals were found in the current EGX snapshot."

    return {
        "buy": buy,
        "sell": sell,
        "summary": summary,
    }


def _clean_gemini_json_text(text: str) -> str:
    """Extract the first JSON object from a Gemini response and normalize common formatting issues."""
    cleaned = (text or "").strip()
    if cleaned.startswith("```"):
        cleaned = "\n".join(cleaned.split("\n")[1:])
        cleaned = cleaned.rsplit("```", 1)[0].strip()

    cleaned = (
        cleaned.replace("\u201c", '"')
        .replace("\u201d", '"')
        .replace("\u2018", "'")
        .replace("\u2019", "'")
    )

    start = cleaned.find("{")
    if start == -1:
        raise ValueError("No JSON object found in Gemini response")

    depth = 0
    in_string = False
    escaped = False
    end = -1

    for idx, char in enumerate(cleaned[start:], start=start):
        if in_string:
            if escaped:
                escaped = False
            elif char == "\\":
                escaped = True
            elif char == '"':
                in_string = False
            continue

        if char == '"':
            in_string = True
        elif char == "{":
            depth += 1
        elif char == "}":
            depth -= 1
            if depth == 0:
                end = idx
                break

    if end == -1:
        end = cleaned.rfind("}")
    if end == -1:
        raise ValueError("Incomplete JSON object in Gemini response")

    return cleaned[start:end + 1]


def _normalize_recommendation_items(
    items: object,
    *,
    max_items: int,
    allowed_scanners: set[str],
    default_scanner: str,
) -> list[dict]:
    normalized: list[dict] = []
    if not isinstance(items, list):
        return normalized

    for item in items:
        if not isinstance(item, dict):
            continue

        ticker = str(item.get("ticker", "")).strip().upper()
        if not ticker:
            continue

        conviction = str(item.get("conviction", "Medium")).strip().title()
        if conviction not in {"High", "Medium", "Low"}:
            conviction = "Medium"

        scanner = str(item.get("scanner", default_scanner)).strip() or default_scanner
        if scanner not in allowed_scanners:
            scanner = default_scanner

        normalized.append({
            "ticker": ticker,
            "name": str(item.get("name", ticker)).strip() or ticker,
            "reason": str(item.get("reason", "No reason provided")).strip()[:120],
            "conviction": conviction,
            "scanner": scanner,
        })

        if len(normalized) >= max_items:
            break

    return normalized


def _repair_json_like_fragment(fragment: str) -> str:
    """Normalize common JSON mistakes produced by LLMs."""
    repaired = (fragment or "").strip()
    repaired = (
        repaired.replace("\u201c", '"')
        .replace("\u201d", '"')
        .replace("\u2018", "'")
        .replace("\u2019", "'")
    )
    repaired = re.sub(r",\s*([}\]])", r"\1", repaired)
    repaired = re.sub(r"}\s*{", "},{", repaired)
    repaired = re.sub(
        r'(\"[^\"]+\"|\}|\]|\d|true|false|null)\s*(\"(?:buy|sell|summary|ticker|name|reason|conviction|scanner)\"\s*:)',
        r'\1, \2',
        repaired,
        flags=re.IGNORECASE,
    )
    return repaired


def _extract_named_json_value(text: str, key: str) -> str | None:
    """Extract a top-level JSON-like value for a given key, even if the whole payload is malformed."""
    match = re.search(rf'"{re.escape(key)}"\s*:\s*', text)
    if not match:
        return None

    idx = match.end()
    while idx < len(text) and text[idx].isspace():
        idx += 1
    if idx >= len(text):
        return None

    opening = text[idx]
    if opening == '"':
        idx += 1
        escaped = False
        while idx < len(text):
            char = text[idx]
            if escaped:
                escaped = False
            elif char == "\\":
                escaped = True
            elif char == '"':
                return text[match.end():idx + 1].strip()
            idx += 1
        return text[match.end():].strip()

    if opening not in "[{":
        end = idx
        while end < len(text) and text[end] not in ",}\n":
            end += 1
        return text[idx:end].strip()

    closing = "]" if opening == "[" else "}"
    depth = 0
    in_string = False
    escaped = False

    for end in range(idx, len(text)):
        char = text[end]
        if in_string:
            if escaped:
                escaped = False
            elif char == "\\":
                escaped = True
            elif char == '"':
                in_string = False
            continue

        if char == '"':
            in_string = True
        elif char == opening:
            depth += 1
        elif char == closing:
            depth -= 1
            if depth == 0:
                return text[idx:end + 1].strip()

    return text[idx:].strip()


def _parse_items_from_fragment(
    fragment: str | None,
    *,
    max_items: int,
    allowed_scanners: set[str],
    default_scanner: str,
) -> list[dict]:
    if not fragment:
        return []

    attempts = [fragment.strip(), _repair_json_like_fragment(fragment)]
    for attempt in dict.fromkeys(attempts):
        try:
            parsed = json.loads(attempt)
            if isinstance(parsed, list):
                normalized = _normalize_recommendation_items(
                    parsed,
                    max_items=max_items,
                    allowed_scanners=allowed_scanners,
                    default_scanner=default_scanner,
                )
                if normalized:
                    return normalized
        except Exception:
            pass

    raw_items: list[dict] = []
    for block in re.findall(r"\{.*?\}", _repair_json_like_fragment(fragment), flags=re.DOTALL):
        item: dict[str, str] = {}
        for field in ["ticker", "name", "reason", "conviction", "scanner"]:
            field_match = re.search(rf'["\']{field}["\']\s*:\s*["\']([^"\']*)', block, flags=re.IGNORECASE)
            if field_match:
                item[field] = field_match.group(1).replace("\n", " ").strip()
        if item.get("ticker"):
            raw_items.append(item)

    return _normalize_recommendation_items(
        raw_items,
        max_items=max_items,
        allowed_scanners=allowed_scanners,
        default_scanner=default_scanner,
    )


def _parse_recommendations_response(text: str, fallback: dict) -> dict:
    """Parse Gemini JSON safely and salvage usable fields from partially broken payloads."""
    candidate = _clean_gemini_json_text(text)
    attempts = [candidate, _repair_json_like_fragment(candidate)]

    last_error: Exception | None = None
    for attempt in dict.fromkeys(attempts):
        try:
            parsed = json.loads(attempt)
            if not isinstance(parsed, dict):
                raise ValueError("Gemini response was not a JSON object")

            return {
                "buy": _normalize_recommendation_items(
                    parsed.get("buy", fallback["buy"]),
                    max_items=4,
                    allowed_scanners={"Alpha Hunt", "Deep Value", "Bullish Consensus"},
                    default_scanner="Alpha Hunt",
                ) or fallback["buy"],
                "sell": _normalize_recommendation_items(
                    parsed.get("sell", fallback["sell"]),
                    max_items=2,
                    allowed_scanners={"Overvalued", "Bearish Watch"},
                    default_scanner="Overvalued",
                ) or fallback["sell"],
                "summary": str(parsed.get("summary") or fallback["summary"]).strip(),
            }
        except Exception as exc:
            last_error = exc

    buy = _parse_items_from_fragment(
        _extract_named_json_value(candidate, "buy"),
        max_items=4,
        allowed_scanners={"Alpha Hunt", "Deep Value", "Bullish Consensus"},
        default_scanner="Alpha Hunt",
    )
    sell = _parse_items_from_fragment(
        _extract_named_json_value(candidate, "sell"),
        max_items=2,
        allowed_scanners={"Overvalued", "Bearish Watch"},
        default_scanner="Overvalued",
    )

    summary_fragment = _extract_named_json_value(candidate, "summary")
    summary = fallback["summary"]
    if summary_fragment:
        summary_match = re.search(r'"([^"\\]*(?:\\.[^"\\]*)*)"', summary_fragment)
        if summary_match:
            summary = summary_match.group(1).strip()
        else:
            summary = summary_fragment.strip().strip('"').strip()

    if buy or sell or summary != fallback["summary"]:
        return {
            "buy": buy or fallback["buy"],
            "sell": sell or fallback["sell"],
            "summary": summary or fallback["summary"],
        }

    raise ValueError(f"Could not parse Gemini JSON payload: {last_error}") from last_error


def _generate_recommendations_sync(stocks_data: list) -> dict:
    """Blocking Gemini call — generates buy/sell recommendations from a compact scanner shortlist."""
    fallback = _build_rule_based_recommendations(stocks_data)
    buckets = _prepare_candidate_buckets(stocks_data, limit=2)

    buy_candidates = buckets["alpha"] + buckets["deep_value"] + buckets["bullish"]
    sell_candidates = buckets["overvalued"] + buckets["bearish"]

    def dedupe(items: list[dict]) -> list[dict]:
        seen: set[str] = set()
        result: list[dict] = []
        for item in items:
            ticker = item.get("ticker")
            if ticker and ticker not in seen:
                seen.add(ticker)
                result.append(item)
        return result

    candidate_payload = {
        "buy_candidates": dedupe(buy_candidates)[:6],
        "sell_candidates": dedupe(sell_candidates)[:4],
    }

    if not _genai_available:
        fallback["summary"] = (
            f"{fallback['summary']} Rule-based picks are shown because Gemini is not configured."
        )
        return fallback

    prompt = (
        "You are an EGX equity analyst. Choose the best buy and sell ideas from this compact scanner snapshot. "
        "Only use the supplied candidates.\n"
        f"{json.dumps(candidate_payload, separators=(',', ':'))}\n"
        "Return ONLY valid JSON in this exact shape: "
        '{"buy":[{"ticker":"","name":"","reason":"<12 words","conviction":"High|Medium|Low","scanner":"Alpha Hunt|Deep Value|Bullish Consensus"}],' 
        '"sell":[{"ticker":"","name":"","reason":"<12 words","conviction":"High|Medium|Low","scanner":"Overvalued|Bearish Watch"}],' 
        '"summary":"2 short sentences on EGX right now."} '
        "Limit to 4 buys and 2 sells. Keep each reason very short."
    )

    try:
        text = _generate_text_with_gemini(
            prompt,
            generation_config={
                "temperature": 0.2,
                "max_output_tokens": 400,
                "response_mime_type": "application/json",
            },
        )
        return _parse_recommendations_response(text, fallback)
    except Exception as exc:
        error_text = str(exc).lower()
        if _is_quota_error(exc) or "cooldown" in error_text:
            logger.warning("Gemini recommendations temporarily unavailable: %s", exc)
            fallback["summary"] = (
                f"{fallback['summary']} Gemini free-tier quota is temporarily unavailable, so a local fallback was used."
            )
        elif "json" in error_text or "delimiter" in error_text:

            fallback["summary"] = (
                f"{fallback['summary']} Gemini returned malformed JSON, so a safe fallback was used."
            )
        else:
            logger.error("Gemini recommendations error: %s", exc)
            fallback["summary"] = (
                f"{fallback['summary']} A compact fallback was used because the Gemini call failed."
            )
        return fallback


async def get_market_recommendations(stocks_data: list) -> dict:
    """Async wrapper: runs the blocking recommendations call in a thread pool executor."""
    loop = asyncio.get_event_loop()
    return await loop.run_in_executor(None, _generate_recommendations_sync, stocks_data)


_CHAT_SUGGESTIONS = [
    "What stocks look strongest this week?",
    "What are the key EGX30 names?",
    "Which stocks look overvalued right now?",
    "Give me a quick market summary.",
]

_BLUE_CHIP_TICKERS = {
    "ABUK", "COMI", "CIEB", "EAST", "EFID", "ETEL", "FWRY", "HRHO",
    "JUFO", "MFPC", "OCDI", "ORAS", "ORHD", "ORWE", "PHDC", "SWDY", "TMGH",
}

_ALLOWED_CHAT_ALIASES = {"EGX", "EGX30", "CIB", "MOPCO", "SAE"}
_NON_EGX_COMPANY_HINTS = {
    "tesla", "apple", "microsoft", "amazon", "nvidia", "alphabet", "google",
    "meta", "netflix", "nasdaq", "s&p 500", "dow jones", "wall street",
}


def _find_stock_by_ticker(stocks_data: list[dict], ticker: str) -> dict | None:
    ticker = ticker.upper().strip()
    return next((s for s in stocks_data if str(s.get("ticker", "")).upper() == ticker), None)


def _answer_is_egx_specific(answer: str, stocks_data: list[dict]) -> bool:
    """Reject stock-chat answers that drift into non-EGX names or markets."""
    lower = (answer or "").lower()
    if any(name in lower for name in _NON_EGX_COMPANY_HINTS):
        return False

    allowed_tickers = {str(s.get("ticker", "")).upper() for s in stocks_data}
    mentioned_tickers = set(re.findall(r"\b[A-Z]{2,6}\b", answer or ""))
    suspicious = {
        ticker for ticker in mentioned_tickers
        if ticker not in allowed_tickers and ticker not in _ALLOWED_CHAT_ALIASES
    }
    return len(suspicious) == 0


def _market_candidates(stocks_data: list[dict], *, positive: bool = True, limit: int = 4) -> list[dict]:
    if positive:
        filtered = [
            s for s in stocks_data
            if float(s.get("upside", 0) or 0) > 5 and int(s.get("sentiment", 0) or 0) >= 55
        ]
        return sorted(
            filtered,
            key=lambda s: (float(s.get("upside", 0) or 0), int(s.get("sentiment", 0) or 0)),
            reverse=True,
        )[:limit]

    filtered = [
        s for s in stocks_data
        if float(s.get("upside", 0) or 0) < -5 or int(s.get("sentiment", 100) or 100) < 40
    ]
    return sorted(
        filtered,
        key=lambda s: (float(s.get("upside", 0) or 0), int(s.get("sentiment", 100) or 100)),
    )[:limit]


def _format_candidate_line(stock: dict) -> str:
    return (
        f"{stock.get('ticker')} ({stock.get('name')}) — {stock.get('sector')}, "
        f"price EGP {float(stock.get('currentPrice', 0) or 0):.2f}, "
        f"upside {float(stock.get('upside', 0) or 0):+.1f}%, "
        f"P/E {float(stock.get('peRatio', 0) or 0):.1f}, "
        f"sentiment {int(stock.get('sentiment', 50) or 50)}/100"
    )


def _build_market_chat_fallback(question: str, stocks_data: list[dict]) -> str:
    q = question.lower().strip()

    tickers = [token for token in re.findall(r"\b[A-Z]{2,6}\b", question.upper()) if _find_stock_by_ticker(stocks_data, token)]
    if tickers:
        stock = _find_stock_by_ticker(stocks_data, tickers[0])
        if stock:
            upside = float(stock.get("upside", 0) or 0)
            sentiment = int(stock.get("sentiment", 50) or 50)
            view = "constructive" if upside > 5 and sentiment >= 55 else "mixed"
            if upside < -5 or sentiment < 40:
                view = "cautious"
            return (
                f"{stock.get('ticker')} looks {view} right now. It trades near EGP {float(stock.get('currentPrice', 0) or 0):.2f} "
                f"with estimated upside of {upside:+.1f}%, P/E of {float(stock.get('peRatio', 0) or 0):.1f}, "
                f"and sentiment of {sentiment}/100. If you want, I can compare it with similar EGX names next."
            )

    if "egx30" in q:
        names = [
            f"- {s['name']} ({s['ticker']}) — {s.get('sector', 'Sector unavailable')}"
            for s in stocks_data
            if str(s.get("ticker", "")).upper() in _BLUE_CHIP_TICKERS
        ][:12]
        joined = "\n".join(names) if names else (
            "- Commercial International Bank (COMI) — Banking\n"
            "- Telecom Egypt (ETEL) — Telecommunications\n"
            "- Fawry (FWRY) — Technology\n"
            "- EFG Holding (HRHO) — Financial Services"
        )
        return (
            "The EGX30 is the Egyptian Exchange's main blue-chip index, designed to track the market's most liquid and actively traded large names. "
            "In the stock universe covered by this app, representative EGX30-style names include:\n"
            f"{joined}\n\n"
            "The exact membership can change when the exchange rebalances the index. If you want, I can next break down which of these names currently look strongest or weakest."
        )

    if any(term in q for term in ["rise", "rally", "strong", "buy", "opportun", "this week", "bullish"]):
        picks = _market_candidates(stocks_data, positive=True, limit=4)
        if picks:
            lines = "\n".join(
                f"- {s.get('ticker')} ({s.get('name')}): upside {float(s.get('upside', 0) or 0):+.1f}%, sentiment {int(s.get('sentiment', 50) or 50)}/100, P/E {float(s.get('peRatio', 0) or 0):.1f}"
                for s in picks
            )
            return (
                "Based on the current scanners, the stronger near-term EGX candidates are:\n"
                f"{lines}\n\n"
                "These are screen-based candidates rather than guarantees, so it still helps to watch volume, sector news, and general market tone through the week."
            )

    if any(term in q for term in ["sell", "avoid", "risk", "weak", "overvalued"]):
        risks = _market_candidates(stocks_data, positive=False, limit=3)
        if risks:
            lines = "; ".join(
                f"{s.get('ticker')} ({float(s.get('upside', 0) or 0):+.1f}% upside, sentiment {int(s.get('sentiment', 50) or 50)})"
                for s in risks
            )
            return (
                "The weaker setups right now are "
                f"{lines}. These names either screen as overvalued or have notably soft sentiment."
            )

    positives = _market_candidates(stocks_data, positive=True, limit=3)
    negatives = _market_candidates(stocks_data, positive=False, limit=2)
    pos_text = "; ".join(s.get("ticker", "") for s in positives) or "COMI and ETEL"
    neg_text = "; ".join(s.get("ticker", "") for s in negatives) or "HRHO"
    return (
        f"The current EGX snapshot is fairly selective: stronger setups include {pos_text}, while the main risk pocket includes {neg_text}. "
        "You can ask me about a ticker, sector, EGX30 names, or which stocks look strongest this week."
    )


def _generate_market_chat_sync(question: str, stocks_data: list[dict], history: list[dict] | None = None) -> dict:
    """Answer natural-language market questions using Gemini when available, with a deterministic fallback."""
    safe_question = (question or "").strip()
    fallback_answer = _build_market_chat_fallback(safe_question, stocks_data)

    if not safe_question:
        return {
            "answer": "Ask me about EGX stocks, sectors, likely risers, or the main EGX30 names.",
            "suggestedQuestions": _CHAT_SUGGESTIONS,
            "usedFallback": True,
        }

    if not _genai_available:
        return {
            "answer": fallback_answer,
            "suggestedQuestions": _CHAT_SUGGESTIONS,
            "usedFallback": True,
        }

    positives = [_format_candidate_line(s) for s in _market_candidates(stocks_data, positive=True, limit=5)]
    negatives = [_format_candidate_line(s) for s in _market_candidates(stocks_data, positive=False, limit=4)]
    blue_chips = [
        _format_candidate_line(s)
        for s in stocks_data
        if str(s.get("ticker", "")).upper() in _BLUE_CHIP_TICKERS
    ][:10]
    compact_history = [
        {"role": h.get("role", "user"), "content": str(h.get("content", ""))[:220]}
        for h in (history or [])[-6:]
    ]

    allowed_reference_tickers = sorted({
        *(str(s.get("ticker", "")).upper() for s in _market_candidates(stocks_data, positive=True, limit=8)),
        *(str(s.get("ticker", "")).upper() for s in _market_candidates(stocks_data, positive=False, limit=5)),
        *_BLUE_CHIP_TICKERS,
    })

    prompt = (
        "You are EGX Insight, an Egyptian stock-market assistant. You must stay strictly focused on the Egyptian Exchange (EGX). "
        "Never mention Tesla, Apple, Nvidia, US stocks, Nasdaq, S&P 500, or any non-EGX market unless the user explicitly asks for a comparison, "
        "and even then keep the answer EGX-centered. Use ONLY EGX-listed names from the context below.\n\n"
        "Give fuller, more useful answers than a short summary while staying practical and easy to read. "
        "Use plain text with short paragraphs or bullet points when helpful. Do not return JSON. Do not use markdown tables.\n\n"
        "Answer only the user's actual question. Do not append unrelated stock picks unless the user asked for them. "
        "When the question is broad or educational, aim for a more comprehensive answer of roughly 180-320 words. "
        "When the question is about a specific ticker, keep it focused but still informative.\n\n"
        "Guidance:\n"
        "- For EGX30 questions: briefly explain what the index is, then list around 8-12 representative constituents with ticker and sector, and mention that membership can change after rebalancing.\n"
        "- For 'what may rise this week' questions: give 3-5 EGX candidates only and explain the setup using the scanner data provided below.\n"
        "- Avoid repetitive generic disclaimers; one short risk note at the end is enough if needed.\n"
        "- If you are not fully certain about an official index membership detail, say 'key names include' rather than claiming a definitive full list.\n"
        "- End on a complete sentence. Never stop mid-word or mid-bullet.\n\n"
        f"Allowed EGX tickers to reference in this answer: {', '.join(allowed_reference_tickers[:30])}\n\n"
        f"Top constructive setups:\n- " + "\n- ".join(positives or ["No strong bullish candidates right now"]) + "\n\n"
        "Main risk/watchlist names:\n- " + "\n- ".join(negatives or ["No major risk flags right now"]) + "\n\n"
        "Key EGX30-style names covered here:\n- " + "\n- ".join(blue_chips or ["COMI, ETEL, FWRY, HRHO"]) + "\n\n"
        f"Recent conversation: {json.dumps(compact_history, ensure_ascii=False)}\n"
        f"User question: {safe_question}\n\n"
        "Write the answer now in plain text with good structure, solid detail, and EGX-only relevance."
    )

    try:
        answer = _generate_text_with_gemini(
            prompt,
            generation_config={"temperature": 0.25, "max_output_tokens": 900},
            preferred_models=["models/gemini-2.5-flash", "models/gemini-flash-latest", "models/gemini-2.0-flash"],
            allow_continuation=True,
        ).strip()

        if answer and not _answer_is_egx_specific(answer, stocks_data):

            return {
                "answer": fallback_answer,
                "suggestedQuestions": _CHAT_SUGGESTIONS,
                "usedFallback": True,
            }

        return {
            "answer": answer or fallback_answer,
            "suggestedQuestions": _CHAT_SUGGESTIONS,
            "usedFallback": False if answer else True,
        }
    except Exception as exc:
        if _is_quota_error(exc) or "cooldown" in str(exc).lower():
            pass
        else:
            logger.error("Gemini stock chat error: %s", exc)
        return {
            "answer": fallback_answer,
            "suggestedQuestions": _CHAT_SUGGESTIONS,
            "usedFallback": True,
        }


async def get_market_chat_response(question: str, stocks_data: list[dict], history: list[dict] | None = None) -> dict:
    """Async wrapper for the stock chat assistant."""
    loop = asyncio.get_event_loop()
    return await loop.run_in_executor(None, _generate_market_chat_sync, question, stocks_data, history)
