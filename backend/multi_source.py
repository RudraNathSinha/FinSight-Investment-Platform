"""
Parallel multi-source stock data fetch + merge.
Sources run simultaneously:
  1) yfinance
  2) free public APIs (Yahoo query1 chart + quote summary)
  3) stockanalysis.com scraper
"""
from __future__ import annotations

import json
import os
import re
import concurrent.futures
from typing import Any, Dict, List, Optional, Tuple

# optional imports (lazy-friendly)
YF = False
yf = None
try:
    import yfinance as yf
    YF = True
except Exception:
    YF = False
    yf = None

try:
    import urllib.request
    import urllib.error
except Exception:
    urllib = None

SA = False
sa_scrape = None
try:
    from backend.scraper_stockanalysis import scrape_stock as sa_scrape
    SA = True
except Exception:
    try:
        from scraper_stockanalysis import scrape_stock as sa_scrape
        SA = True
    except Exception:
        sa_scrape = None
        SA = False

def _ensure_yf():
    global YF, yf
    if YF and yf is not None:
        return True
    try:
        import yfinance as _yf
        yf = _yf
        YF = True
        return True
    except Exception:
        return False


def _to_yf_candidates(symbol: str, exchange: Optional[str]) -> List[str]:
    out = []
    if exchange:
        # light local mapping
        m = {
            "NSE": f"{symbol}.NS", "BOM": f"{symbol}.BO", "BSE": f"{symbol}.BO",
            "NYSE": symbol, "NASDAQ": symbol, "AMEX": symbol, "OTC": symbol,
            "LSE": f"{symbol}.L", "LON": f"{symbol}.L", "TYO": f"{symbol}.T",
            "HKG": f"{symbol}.HK", "ASX": f"{symbol}.AX", "TSX": f"{symbol}.TO",
            "FRA": f"{symbol}.DE", "ETR": f"{symbol}.DE",
        }
        if exchange.upper() in m:
            out.append(m[exchange.upper()])
        # China zero pad etc handled by caller if needed
    out.extend([
        symbol, f"{symbol}.NS", f"{symbol}.BO", f"{symbol}.L", f"{symbol}.T",
        f"{symbol}.HK", f"{symbol}.AX", f"{symbol}.TO", f"{symbol}.DE",
    ])
    # dedupe preserve order
    seen = set()
    res = []
    for x in out:
        if x not in seen:
            seen.add(x)
            res.append(x)
    return res


def _df_to_dict(df) -> dict:
    if df is None:
        return {}
    try:
        if hasattr(df, "empty") and df.empty:
            return {}
    except Exception:
        return {}
    out = {}
    try:
        for col in df.columns:
            key = str(col)[:10]
            out[key] = {}
            for idx, val in df[col].items():
                try:
                    import math
                    if val is None or (isinstance(val, float) and math.isnan(val)):
                        out[key][str(idx)] = None
                    elif hasattr(val, "item"):
                        out[key][str(idx)] = float(val)
                    elif isinstance(val, (int, float)):
                        out[key][str(idx)] = float(val)
                    else:
                        out[key][str(idx)] = str(val)
                except Exception:
                    out[key][str(idx)] = None
    except Exception:
        return {}
    return out


def _http_json(url: str, timeout: float = 12.0) -> Optional[dict]:
    if urllib is None:
        return None
    try:
        req = urllib.request.Request(url, headers={
            "User-Agent": "Mozilla/5.0 (compatible; FinSight/1.0)",
            "Accept": "application/json",
        })
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            return json.loads(resp.read().decode("utf-8", errors="replace"))
    except Exception:
        return None


# ---------- Source 1: yfinance ----------
def fetch_yfinance(symbol: str, exchange: Optional[str], freq: str = "annual") -> dict:
    result = {"source": "yfinance", "available": False, "info": {}, "income_statement": {},
              "balance_sheet": {}, "cashflow": {}, "dividends_history": [], "history": None, "ticker": None}
    if not _ensure_yf():
        result["error"] = "yfinance unavailable"
        return result
    for t in _to_yf_candidates(symbol, exchange):
        try:
            tk = yf.Ticker(t)
            info = {}
            try:
                info = tk.info or {}
            except Exception:
                info = {}
            # require some signal of validity
            if not info and not getattr(tk, "fast_info", None):
                continue
            freq_l = (freq or "annual").lower()
            income = balance = cashflow = {}
            try:
                if freq_l == "quarterly":
                    income = _df_to_dict(getattr(tk, "quarterly_income_stmt", None))
                    balance = _df_to_dict(getattr(tk, "quarterly_balance_sheet", None))
                    cashflow = _df_to_dict(getattr(tk, "quarterly_cashflow", None))
                elif freq_l == "ttm":
                    income = _df_to_dict(getattr(tk, "ttm_income_stmt", None) or getattr(tk, "income_stmt", None))
                    balance = _df_to_dict(getattr(tk, "ttm_balance_sheet", None) or getattr(tk, "balance_sheet", None))
                    cashflow = _df_to_dict(getattr(tk, "ttm_cashflow", None) or getattr(tk, "cashflow", None))
                else:
                    income = _df_to_dict(getattr(tk, "income_stmt", None) or getattr(tk, "financials", None))
                    balance = _df_to_dict(getattr(tk, "balance_sheet", None))
                    cashflow = _df_to_dict(getattr(tk, "cashflow", None))
            except Exception:
                pass
            divs = []
            try:
                d = tk.dividends
                if d is not None and hasattr(d, "items"):
                    for dt, val in list(d.items())[-40:]:
                        divs.append({"date": str(dt)[:10], "amount": float(val)})
            except Exception:
                pass
            hist = None
            try:
                h = tk.history(period="1y")
                if h is not None and not h.empty:
                    h = h.reset_index()
                    date_col = "Date" if "Date" in h.columns else h.columns[0]
                    hist = {
                        "dates": [str(x)[:10] for x in h[date_col]],
                        "closes": [float(x) if x == x else None for x in h["Close"]],
                    }
            except Exception:
                pass
            price = info.get("currentPrice") or info.get("regularMarketPrice") or info.get("previousClose")
            has_signal = bool(price is not None or income or balance or cashflow or info.get("longName") or info.get("shortName") or info.get("marketCap"))
            if not has_signal:
                continue
            result.update({
                "available": True,
                "ticker": t,
                "info": info,
                "price": price,
                "currency": info.get("currency"),
                "name": info.get("longName") or info.get("shortName") or symbol,
                "market_cap": info.get("marketCap"),
                "year_change": info.get("52WeekChange"),
                "dividend_yield": info.get("dividendYield"),
                "sector": info.get("sector"),
                "industry": info.get("industry"),
                "summary": (info.get("longBusinessSummary") or "")[:1200],
                "income_statement": income,
                "balance_sheet": balance,
                "cashflow": cashflow,
                "dividends_history": divs,
                "history": hist,
            })
            return result
        except Exception as e:
            result["error"] = str(e)[:200]
            continue
    return result


# ---------- Source 2: free Yahoo public API (no key) ----------
def fetch_free_api(symbol: str, exchange: Optional[str]) -> dict:
    """Yahoo query1 public endpoints — no API key required."""
    result = {"source": "yahoo_public_api", "available": False, "info": {}, "income_statement": {},
              "balance_sheet": {}, "cashflow": {}, "dividends_history": [], "history": None}
    candidates = _to_yf_candidates(symbol, exchange)
    for t in candidates:
        try:
            # quote summary modules
            mods = "price,summaryDetail,defaultKeyStatistics,financialData,summaryProfile,incomeStatementHistory,balanceSheetHistory,cashflowStatementHistory"
            url = (
                f"https://query1.finance.yahoo.com/v10/finance/quoteSummary/{t}"
                f"?modules={mods}"
            )
            data = _http_json(url)
            if not data:
                continue
            qs = (data.get("quoteSummary") or {}).get("result")
            if not qs:
                continue
            block = qs[0] or {}
            price_b = block.get("price") or {}
            sum_d = block.get("summaryDetail") or {}
            key_s = block.get("defaultKeyStatistics") or {}
            fin_d = block.get("financialData") or {}
            prof = block.get("summaryProfile") or {}

            def gv(obj, *keys):
                for k in keys:
                    if not obj:
                        return None
                    v = obj.get(k)
                    if isinstance(v, dict) and "raw" in v:
                        return v.get("raw")
                    if v is not None:
                        return v
                return None

            info = {
                "currentPrice": gv(price_b, "regularMarketPrice"),
                "regularMarketPrice": gv(price_b, "regularMarketPrice"),
                "previousClose": gv(price_b, "regularMarketPreviousClose"),
                "currency": price_b.get("currency") or sum_d.get("currency"),
                "marketCap": gv(price_b, "marketCap") or gv(sum_d, "marketCap"),
                "trailingPE": gv(sum_d, "trailingPE") or gv(key_s, "trailingPE"),
                "forwardPE": gv(sum_d, "forwardPE") or gv(key_s, "forwardPE"),
                "priceToBook": gv(sum_d, "priceToBook") or gv(key_s, "priceToBook"),
                "dividendYield": gv(sum_d, "dividendYield"),
                "dividendRate": gv(sum_d, "dividendRate"),
                "beta": gv(sum_d, "beta") or gv(key_s, "beta"),
                "fiftyTwoWeekHigh": gv(sum_d, "fiftyTwoWeekHigh"),
                "fiftyTwoWeekLow": gv(sum_d, "fiftyTwoWeekLow"),
                "volume": gv(price_b, "regularMarketVolume"),
                "averageVolume": gv(sum_d, "averageVolume"),
                "trailingEps": gv(key_s, "trailingEps"),
                "bookValue": gv(key_s, "bookValue"),
                "profitMargins": gv(fin_d, "profitMargins"),
                "returnOnEquity": gv(fin_d, "returnOnEquity"),
                "returnOnAssets": gv(fin_d, "returnOnAssets"),
                "revenueGrowth": gv(fin_d, "revenueGrowth"),
                "earningsGrowth": gv(fin_d, "earningsGrowth"),
                "totalRevenue": gv(fin_d, "totalRevenue"),
                "totalDebt": gv(fin_d, "totalDebt"),
                "totalCash": gv(fin_d, "totalCash"),
                "sector": prof.get("sector"),
                "industry": prof.get("industry"),
                "longBusinessSummary": (prof.get("longBusinessSummary") or "")[:1200],
                "website": prof.get("website"),
                "fullTimeEmployees": prof.get("fullTimeEmployees"),
                "city": prof.get("city"),
                "country": prof.get("country"),
                "longName": price_b.get("longName") or price_b.get("shortName"),
                "shortName": price_b.get("shortName"),
            }

            # chart history + price from meta
            hist = None
            chart = _http_json(
                f"https://query1.finance.yahoo.com/v8/finance/chart/{t}?range=1y&interval=1d"
            )
            if not chart:
                chart = _http_json(
                    f"https://query2.finance.yahoo.com/v8/finance/chart/{t}?range=1y&interval=1d"
                )
            if chart:
                try:
                    res0 = (chart.get("chart") or {}).get("result") or []
                    if res0:
                        ts = res0[0].get("timestamp") or []
                        q = (res0[0].get("indicators") or {}).get("quote") or [{}]
                        closes = (q[0] or {}).get("close") or []
                        from datetime import datetime, timezone
                        dates = [datetime.fromtimestamp(x, tz=timezone.utc).strftime("%Y-%m-%d") for x in ts]
                        hist = {"dates": dates, "closes": closes}
                        meta = res0[0].get("meta") or {}
                        if meta.get("regularMarketPrice") is not None:
                            info["currentPrice"] = meta.get("regularMarketPrice")
                            info["currency"] = meta.get("currency") or info.get("currency")
                except Exception:
                    pass

            # If quoteSummary failed modules but chart worked, still mark available
            if not info.get("currentPrice") and hist and hist.get("closes"):
                last = next((c for c in reversed(hist["closes"]) if c is not None), None)
                if last is not None:
                    info["currentPrice"] = last

            result.update({
                "available": True,
                "ticker": t,
                "info": {k: v for k, v in info.items() if v is not None},
                "price": info.get("currentPrice"),
                "currency": info.get("currency"),
                "name": info.get("longName") or symbol,
                "market_cap": info.get("marketCap"),
                "dividend_yield": info.get("dividendYield"),
                "sector": info.get("sector"),
                "industry": info.get("industry"),
                "summary": info.get("longBusinessSummary") or "",
                "history": hist,
            })
            return result
        except Exception as e:
            result["error"] = str(e)[:200]
            continue
        # chart-only fallback for this ticker
        try:
            chart = _http_json(f"https://query1.finance.yahoo.com/v8/finance/chart/{t}?range=1y&interval=1d")
            if chart:
                res0 = (chart.get("chart") or {}).get("result") or []
                if res0:
                    meta = res0[0].get("meta") or {}
                    ts = res0[0].get("timestamp") or []
                    q = (res0[0].get("indicators") or {}).get("quote") or [{}]
                    closes = (q[0] or {}).get("close") or []
                    from datetime import datetime, timezone
                    dates = [datetime.fromtimestamp(x, tz=timezone.utc).strftime("%Y-%m-%d") for x in ts]
                    result.update({
                        "available": True,
                        "ticker": t,
                        "price": meta.get("regularMarketPrice"),
                        "currency": meta.get("currency"),
                        "name": meta.get("shortName") or meta.get("symbol") or symbol,
                        "info": {
                            "currentPrice": meta.get("regularMarketPrice"),
                            "currency": meta.get("currency"),
                            "fiftyTwoWeekHigh": meta.get("fiftyTwoWeekHigh"),
                            "fiftyTwoWeekLow": meta.get("fiftyTwoWeekLow"),
                            "exchangeName": meta.get("exchangeName"),
                        },
                        "history": {"dates": dates, "closes": closes},
                    })
                    return result
        except Exception:
            pass
    return result


# ---------- Source 3: web scrape ----------
def fetch_scrape(symbol: str, exchange: Optional[str]) -> dict:
    result = {"source": "stockanalysis_scrape", "available": False, "info": {},
              "income_statement": {}, "balance_sheet": {}, "cashflow": {},
              "dividends_history": [], "ratios": {}, "profile": {}}
    if not SA or not sa_scrape:
        result["error"] = "scraper unavailable"
        return result
    try:
        scraped = sa_scrape(symbol, exchange, sections=[
            "overview", "income", "balance", "cashflow", "ratios", "statistics", "company"
        ])
        if not scraped or not scraped.get("available"):
            result["error"] = (scraped or {}).get("error") or "empty scrape"
            return result
        # Scraper returns flat keys: overview_stats, income, balance, cashflow, statistics, company
        overview = scraped.get("overview_stats") or scraped.get("overview") or {}
        income = scraped.get("income") or scraped.get("income_statement") or {}
        balance = scraped.get("balance") or scraped.get("balance_sheet") or {}
        cashflow = scraped.get("cashflow") or scraped.get("cash_flow") or {}
        ratios = scraped.get("ratios") or {}
        profile = scraped.get("company") or scraped.get("profile") or {}
        stats = scraped.get("statistics") or {}
        divs = scraped.get("dividends") or scraped.get("dividends_history") or []

        info = {}
        for block in (overview, stats, profile):
            if isinstance(block, dict):
                for k, v in block.items():
                    if not isinstance(v, (dict, list)) and v not in (None, "", "n/a", "N/A"):
                        info[k] = v

        result.update({
            "available": True,
            "raw": scraped,
            "info": info,
            "income_statement": income if isinstance(income, dict) else {},
            "balance_sheet": balance if isinstance(balance, dict) else {},
            "cashflow": cashflow if isinstance(cashflow, dict) else {},
            "ratios": ratios if isinstance(ratios, dict) else {},
            "profile": profile if isinstance(profile, dict) else {},
            "dividends_history": divs if isinstance(divs, list) else [],
            "name": scraped.get("page_title") or info.get("name") or info.get("Company") or symbol,
            "summary": info.get("description") or info.get("Description") or "",
            "sector": info.get("sector") or info.get("Sector"),
            "industry": info.get("industry") or info.get("Industry"),
            "market_cap": info.get("marketCap") or info.get("Market Cap") or info.get("market_cap"),
        })
    except Exception as e:
        result["error"] = str(e)[:300]
    return result


# ---------- Merge helpers ----------
def _merge_info(*infos: dict) -> dict:
    out = {}
    for info in infos:
        if not info:
            continue
        for k, v in info.items():
            if v is None or v == "" or v == "—":
                continue
            if k not in out or out[k] in (None, "", "—"):
                out[k] = v
    return out


def _merge_stmt(a: dict, b: dict) -> dict:
    """
    Merge financial statement dicts.
    Supports two shapes:
      A) { period: { metric: value } }
      B) { periods: [...], rows: { metric: { period: value } } }
    Output prefers shape A normalized to period-first if either is A,
    else shape B.
    """
    if not a:
        return b or {}
    if not b:
        return a or {}

    # Detect shape B
    if "periods" in a or "periods" in b:
        periods = list(dict.fromkeys((a.get("periods") or []) + (b.get("periods") or [])))
        rows = {}
        for src in (a, b):
            for m, series in (src.get("rows") or {}).items():
                rows.setdefault(m, {})
                for p, v in (series or {}).items():
                    if rows[m].get(p) in (None, "", "—") and v not in (None, "", "—"):
                        rows[m][p] = v
                    elif p not in rows[m]:
                        rows[m][p] = v
        return {"periods": periods, "rows": rows}

    # Shape A: period -> metric -> value
    out = {}
    for src in (a, b):
        for period, metrics in (src or {}).items():
            if not isinstance(metrics, dict):
                continue
            out.setdefault(period, {})
            for m, v in metrics.items():
                if out[period].get(m) in (None, "", "—") and v not in (None, "", "—"):
                    out[period][m] = v
                elif m not in out[period]:
                    out[period][m] = v
    return out


def _first(*vals):
    for v in vals:
        if v is not None and v != "" and v != "—":
            return v
    return None


def fetch_all_parallel(symbol: str, exchange: Optional[str] = None, freq: str = "annual") -> dict:
    """Run all 3 sources concurrently and compile one unified payload."""
    with concurrent.futures.ThreadPoolExecutor(max_workers=3) as ex:
        f_yf = ex.submit(fetch_yfinance, symbol, exchange, freq)
        f_api = ex.submit(fetch_free_api, symbol, exchange)
        f_sc = ex.submit(fetch_scrape, symbol, exchange)
        yf_d = f_yf.result()
        api_d = f_api.result()
        sc_d = f_sc.result()

    sources_status = {
        "yfinance": {"available": bool(yf_d.get("available")), "ticker": yf_d.get("ticker"), "error": yf_d.get("error")},
        "free_api": {"available": bool(api_d.get("available")), "ticker": api_d.get("ticker"), "error": api_d.get("error")},
        "scrape": {"available": bool(sc_d.get("available")), "error": sc_d.get("error")},
    }

    info = _merge_info(yf_d.get("info") or {}, api_d.get("info") or {}, sc_d.get("info") or {})
    # Normalize alternate key names from scrape / mixed sources
    aliases = {
        "Market Cap": "marketCap", "PE Ratio": "trailingPE", "Forward PE": "forwardPE",
        "PB Ratio": "priceToBook", "PS Ratio": "priceToSalesTrailing12Months",
        "Dividend Yield": "dividendYield", "Beta": "beta", "EPS (TTM)": "trailingEps",
        "Revenue": "totalRevenue", "Profit Margin": "profitMargins",
        "ROE": "returnOnEquity", "ROA": "returnOnAssets",
        "Shares Outstanding": "sharesOutstanding", "Sector": "sector", "Industry": "industry",
        "Website": "website", "Employees": "fullTimeEmployees", "Country": "country",
        "Current Price": "currentPrice", "Previous Close": "previousClose",
    }
    for alt, std in aliases.items():
        if alt in info and (std not in info or info.get(std) in (None, "", "—")):
            info[std] = info[alt]
    income = _merge_stmt(yf_d.get("income_statement") or {}, sc_d.get("income_statement") or {})
    # free api rarely has full statements — still merge if present
    income = _merge_stmt(income, api_d.get("income_statement") or {})
    balance = _merge_stmt(yf_d.get("balance_sheet") or {}, sc_d.get("balance_sheet") or {})
    balance = _merge_stmt(balance, api_d.get("balance_sheet") or {})
    cashflow = _merge_stmt(yf_d.get("cashflow") or {}, sc_d.get("cashflow") or {})
    cashflow = _merge_stmt(cashflow, api_d.get("cashflow") or {})

    divs = yf_d.get("dividends_history") or api_d.get("dividends_history") or sc_d.get("dividends_history") or []
    if not divs and sc_d.get("dividends_history"):
        divs = sc_d["dividends_history"]

    hist = yf_d.get("history") or api_d.get("history")

    
    # LAST RESORT — local country packs (only when all live sources failed)
    local_d = {"available": False, "source": "local_country_pack"}
    if not any([yf_d.get("available"), api_d.get("available"), sc_d.get("available")]):
        try:
            try:
                from backend.local_country_pack import fetch_local_country_pack
            except Exception:
                from local_country_pack import fetch_local_country_pack
            lp = fetch_local_country_pack(symbol, exchange) or {}
            if lp.get("available"):
                local_d = lp
                company = lp.get("company") or {}
                # seed merged structures for UI/report consumers
                if not info:
                    info = {}
                info.setdefault("longName", company.get("name") or lp.get("symbol"))
                info.setdefault("shortName", company.get("name"))
                info.setdefault("sector", company.get("sector"))
                info.setdefault("industry", company.get("industry"))
                info.setdefault("country", company.get("country") or lp.get("country"))
                info.setdefault("website", company.get("website"))
                if lp.get("pe") is not None:
                    info.setdefault("trailingPE", lp.get("pe"))
                if lp.get("eps") is not None:
                    info.setdefault("trailingEps", lp.get("eps"))
                if lp.get("market_cap") is not None:
                    info.setdefault("marketCap", lp.get("market_cap"))
                if company.get("description"):
                    info.setdefault("longBusinessSummary", company.get("description"))
                # statements in pack shape already period/rows
                if not income and (lp.get("income") or {}).get("rows"):
                    income = lp.get("income")
                if not balance and (lp.get("balance") or {}).get("rows"):
                    balance = lp.get("balance")
                if not cashflow and (lp.get("cashflow") or {}).get("rows"):
                    cashflow = lp.get("cashflow")
                sc_d = dict(sc_d or {})
                sc_d["available"] = True
                sc_d["name"] = company.get("name")
                sc_d["sector"] = company.get("sector")
                sc_d["industry"] = company.get("industry")
                sc_d["summary"] = company.get("description")
                sc_d["market_cap"] = lp.get("market_cap")
                sc_d["source"] = "local_country_pack"
        except Exception as e:
            local_d = {"available": False, "error": str(e)[:160]}

    sources_status["local_country_pack"] = {
        "available": bool(local_d.get("available")),
        "error": local_d.get("error"),
    }

    available = any([yf_d.get("available"), api_d.get("available"), sc_d.get("available"), local_d.get("available")])

    return {
        "available": available,
        "symbol": symbol,
        "exchange": exchange,
        "freq": freq,
        "sources": sources_status,
        "ticker": _first(yf_d.get("ticker"), api_d.get("ticker")),
        "name": _first(yf_d.get("name"), api_d.get("name"), sc_d.get("name"), info.get("longName"), info.get("shortName"), symbol),
        "price": _first(yf_d.get("price"), api_d.get("price"), info.get("currentPrice"), info.get("regularMarketPrice")),
        "currency": _first(yf_d.get("currency"), api_d.get("currency"), info.get("currency")),
        "market_cap": _first(yf_d.get("market_cap"), api_d.get("market_cap"), sc_d.get("market_cap"), info.get("marketCap")),
        "year_change": _first(yf_d.get("year_change"), info.get("52WeekChange")),
        "dividend_yield": _first(yf_d.get("dividend_yield"), api_d.get("dividend_yield"), info.get("dividendYield")),
        "sector": _first(yf_d.get("sector"), api_d.get("sector"), sc_d.get("sector"), info.get("sector")),
        "industry": _first(yf_d.get("industry"), api_d.get("industry"), sc_d.get("industry"), info.get("industry")),
        "summary": _first(yf_d.get("summary"), api_d.get("summary"), sc_d.get("summary"), info.get("longBusinessSummary")),
        "info": info,
        "income_statement": income,
        "balance_sheet": balance,
        "cashflow": cashflow,
        "dividends_history": divs,
        "ratios": sc_d.get("ratios") or {},
        "history_preview": hist,
        "snapshot": {
            "price": _first(yf_d.get("price"), api_d.get("price")),
            "currency": _first(yf_d.get("currency"), api_d.get("currency")),
            "marketCap": _first(yf_d.get("market_cap"), api_d.get("market_cap")),
            "sector": _first(yf_d.get("sector"), api_d.get("sector"), sc_d.get("sector")),
            "industry": _first(yf_d.get("industry"), api_d.get("industry"), sc_d.get("industry")),
            "website": info.get("website"),
            "dividendYield": _first(yf_d.get("dividend_yield"), api_d.get("dividend_yield")),
            "trailingPE": info.get("trailingPE"),
            "forwardPE": info.get("forwardPE"),
            "priceToBook": info.get("priceToBook"),
            "beta": info.get("beta"),
            "trailingEps": info.get("trailingEps"),
            "profitMargins": info.get("profitMargins"),
            "returnOnEquity": info.get("returnOnEquity"),
            "returnOnAssets": info.get("returnOnAssets"),
            "revenueGrowth": info.get("revenueGrowth"),
            "earningsGrowth": info.get("earningsGrowth"),
            "totalRevenue": info.get("totalRevenue"),
            "totalDebt": info.get("totalDebt"),
            "totalCash": info.get("totalCash"),
            "bookValue": info.get("bookValue"),
            "fiftyTwoWeekHigh": info.get("fiftyTwoWeekHigh"),
            "fiftyTwoWeekLow": info.get("fiftyTwoWeekLow"),
            "volume": info.get("volume"),
            "averageVolume": info.get("averageVolume"),
            "dividendRate": info.get("dividendRate"),
            "payoutRatio": info.get("payoutRatio"),
            "fullTimeEmployees": info.get("fullTimeEmployees"),
            "city": info.get("city"),
            "country": info.get("country"),
        },
    }
