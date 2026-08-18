"""
FinSight Report Engine
Assembles institutional-grade Equity Research and Financial Analysis reports
from stockanalysis.com scrape (primary) + multi-source fallbacks.
"""
from __future__ import annotations

import math
import re
import time
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Tuple

# --- scrape / multi-source imports ---
try:
    from backend.scraper_stockanalysis import scrape_stock as sa_scrape
except Exception:
    try:
        from scraper_stockanalysis import scrape_stock as sa_scrape
    except Exception:
        sa_scrape = None

try:
    from backend.multi_source import fetch_all_parallel
except Exception:
    try:
        from multi_source import fetch_all_parallel
    except Exception:
        fetch_all_parallel = None


DISCLAIMER = (  # deprecated, not shown in reports

    "This report is compiled exclusively from freely available public data sources "
    "(including stockanalysis.com and related market data feeds). Figures may be "
    "incomplete, delayed, or estimated and do not necessarily reflect the company's "
    "primary listing or official regulatory filings. The ticker selected may not be "
    "the issuer's main listing — please cross-check the same company on other exchanges. "
    "This document is for informational and educational purposes only and does not "
    "constitute investment advice, a solicitation, or a recommendation to buy or sell "
    "any security."
)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _now_iso() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")


def _now_short() -> str:
    return datetime.now(timezone.utc).strftime("%d %b %Y")


def _safe_float(v: Any) -> Optional[float]:
    if v is None:
        return None
    if isinstance(v, (int, float)):
        if isinstance(v, float) and (math.isnan(v) or math.isinf(v)):
            return None
        return float(v)
    s = str(v).strip().replace(",", "").replace("%", "").replace("$", "")
    if not s or s in ("—", "-", "N/A", "n/a", "NA", "null", "None"):
        return None
    mult = 1.0
    if s[-1:] in ("B", "b"):
        mult = 1e9
        s = s[:-1]
    elif s[-1:] in ("M", "m"):
        mult = 1e6
        s = s[:-1]
    elif s[-1:] in ("K", "k"):
        mult = 1e3
        s = s[:-1]
    elif s[-1:] in ("T", "t"):
        mult = 1e12
        s = s[:-1]
    try:
        return float(s) * mult
    except Exception:
        return None


def _fmt_num(v: Any, decimals: int = 2) -> str:
    f = _safe_float(v)
    if f is None:
        return "—"
    abs_f = abs(f)
    sign = "-" if f < 0 else ""
    if abs_f >= 1e12:
        return f"{sign}{abs_f/1e12:.{decimals}f}T"
    if abs_f >= 1e9:
        return f"{sign}{abs_f/1e9:.{decimals}f}B"
    if abs_f >= 1e6:
        return f"{sign}{abs_f/1e6:.{decimals}f}M"
    if abs_f >= 1e3:
        return f"{sign}{abs_f:,.{decimals}f}"
    if abs_f >= 10:
        return f"{sign}{abs_f:.{decimals}f}"
    return f"{sign}{abs_f:.{max(decimals, 2)}f}"


def _fmt_pct(v: Any, already_pct: bool = False) -> str:
    f = _safe_float(v)
    if f is None:
        return "—"
    if not already_pct and abs(f) <= 1.5:
        f = f * 100
    return f"{f:.2f}%"


def _pick(d: dict, *keys, default=None):
    if not isinstance(d, dict):
        return default
    for k in keys:
        if k in d and d[k] not in (None, "", "—", "-"):
            return d[k]
    # case-insensitive
    lower_map = {str(x).lower(): x for x in d.keys()}
    for k in keys:
        lk = str(k).lower()
        if lk in lower_map:
            val = d[lower_map[lk]]
            if val not in (None, "", "—", "-"):
                return val
    return default


def _row_series(table: dict, *names) -> Dict[str, Any]:
    """Return first matching metric row from a statement table {periods, rows}."""
    if not table or not isinstance(table, dict):
        return {}
    rows = table.get("rows") or {}
    for n in names:
        if n in rows:
            return rows[n] or {}
        for rk, rv in rows.items():
            if str(rk).lower() == str(n).lower():
                return rv or {}
    for n in names:
        nl = str(n).lower()
        for rk, rv in rows.items():
            if nl in str(rk).lower() or str(rk).lower() in nl:
                return rv or {}
    return {}


def _periods(table: dict) -> List[str]:
    if not table:
        return []
    ps = table.get("periods") or []
    return [str(p) for p in ps if str(p).lower() not in ("ttm", "n/a", "")]


def _latest(series: dict, periods: List[str] = None) -> Optional[float]:
    if not series:
        return None
    order = periods or list(series.keys())
    for p in reversed(list(order)):
        v = _safe_float(series.get(p))
        if v is not None:
            return v
    for v in series.values():
        f = _safe_float(v)
        if f is not None:
            return f
    return None


def _series_list(series: dict, periods: List[str]) -> List[Optional[float]]:
    return [_safe_float(series.get(p)) for p in periods]


def _yoy_growth(series: dict, periods: List[str]) -> Optional[float]:
    vals = [(p, _safe_float(series.get(p))) for p in periods]
    vals = [(p, v) for p, v in vals if v is not None]
    if len(vals) < 2:
        return None
    a, b = vals[-2][1], vals[-1][1]
    if a == 0:
        return None
    return (b - a) / abs(a)


def _cagr(series: dict, periods: List[str]) -> Optional[float]:
    vals = [_safe_float(series.get(p)) for p in periods]
    vals = [v for v in vals if v is not None and v != 0]
    if len(vals) < 2:
        return None
    n = len(vals) - 1
    if vals[0] <= 0 or vals[-1] <= 0:
        return None
    try:
        return (vals[-1] / vals[0]) ** (1 / n) - 1
    except Exception:
        return None


# ---------------------------------------------------------------------------
# Data collection
# ---------------------------------------------------------------------------

# Simple TTL cache for multi-source report payloads (in-memory, process-local)
_REPORT_CACHE: Dict[str, Any] = {}
_REPORT_CACHE_TTL = 900  # 15 minutes


def _cache_get(key: str):
    import time as _t
    hit = _REPORT_CACHE.get(key)
    if not hit:
        return None
    if _t.time() - hit.get("ts", 0) > _REPORT_CACHE_TTL:
        _REPORT_CACHE.pop(key, None)
        return None
    return hit.get("data")


def _cache_set(key: str, data: dict):
    import time as _t
    _REPORT_CACHE[key] = {"ts": _t.time(), "data": data}
    # prune old
    if len(_REPORT_CACHE) > 64:
        oldest = sorted(_REPORT_CACHE.items(), key=lambda kv: kv[1].get("ts", 0))
        for k, _ in oldest[:16]:
            _REPORT_CACHE.pop(k, None)


def collect_report_data(symbol: str, exchange: Optional[str] = None) -> Dict[str, Any]:
    """
    Fetch from multiple free sources in parallel and merge.
    Preference order when filling blanks:
      1) stockanalysis.com scrape
      2) yfinance
      3) free public Yahoo APIs
      4) multi_source parallel bundle (combined)
      5) lightweight rule-based synthesizer (fills narrative gaps only)
    Results are cached briefly so repeated report clicks reuse work.
    """
    import concurrent.futures
    symbol = (symbol or "").strip().upper()
    exchange = (exchange or "").strip().upper() or None
    t0 = time.time()
    cache_key = f"{symbol}|{exchange or ''}|annual"
    cached = _cache_get(cache_key)
    if cached:
        cached = dict(cached)
        cached["cache_hit"] = True
        cached["elapsed_sec"] = round(time.time() - t0, 2)
        return cached

    meta = _db_meta(symbol, exchange)

    def _scrape_job():
        if not sa_scrape:
            return {"available": False, "source": "stockanalysis"}
        try:
            out = sa_scrape(
                symbol, exchange,
                sections=["overview", "statistics", "company", "income", "balance", "cashflow", "ratios", "financials"],
            ) or {"available": False}
            out["source"] = "stockanalysis"
            return out
        except Exception as e:
            return {"available": False, "error": str(e)[:300], "source": "stockanalysis"}

    def _bundle_job():
        if not fetch_all_parallel:
            return {"available": False, "source": "multi_bundle"}
        try:
            out = fetch_all_parallel(symbol, exchange, "annual") or {}
            out["source"] = "multi_bundle"
            return out
        except Exception as e:
            return {"available": False, "error": str(e)[:200], "source": "multi_bundle"}

    def _yf_job():
        try:
            from backend.multi_source import fetch_yfinance
        except Exception:
            try:
                from multi_source import fetch_yfinance
            except Exception:
                return {"available": False, "source": "yfinance"}
        try:
            out = fetch_yfinance(symbol, exchange, "annual") or {}
            out["source"] = "yfinance"
            return out
        except Exception as e:
            return {"available": False, "error": str(e)[:200], "source": "yfinance"}

    def _free_api_job():
        try:
            from backend.multi_source import fetch_free_api
        except Exception:
            try:
                from multi_source import fetch_free_api
            except Exception:
                return {"available": False, "source": "free_api"}
        try:
            out = fetch_free_api(symbol, exchange) or {}
            out["source"] = "free_api"
            return out
        except Exception as e:
            return {"available": False, "error": str(e)[:200], "source": "free_api"}

    def _llm_synth_job(ctx: dict):
        """Rule-based free synthesizer — fills narrative gaps only (no paid API)."""
        name = (ctx.get("name") or symbol)
        sector = ctx.get("sector") or "its sector"
        industry = ctx.get("industry") or "its industry"
        country = ctx.get("country") or "its primary market"
        return {
            "available": True,
            "source": "synth_llm",
            "description": (
                f"{name} is a publicly listed company operating in {industry} "
                f"({sector}), with primary market exposure linked to {country}. "
                "This narrative is synthesised from classification fields and public quote metadata "
                "when a longer business description is not returned by upstream feeds."
            ),
        }

    scrape = {"available": False}
    bundle = {}
    yf_data = {}
    free_data = {}

    with concurrent.futures.ThreadPoolExecutor(max_workers=4) as ex:
        f_scrape = ex.submit(_scrape_job)
        f_bundle = ex.submit(_bundle_job)
        f_yf = ex.submit(_yf_job)
        f_free = ex.submit(_free_api_job)
        for fut in concurrent.futures.as_completed([f_scrape, f_bundle, f_yf, f_free]):
            try:
                res = fut.result()
            except Exception as e:
                res = {"available": False, "error": str(e)[:120]}
            src = (res or {}).get("source")
            if src == "stockanalysis":
                scrape = res
            elif src == "multi_bundle":
                bundle = res
            elif src == "yfinance":
                yf_data = res
            elif src == "free_api":
                free_data = res

    # Preferential merge into a unified bundle for build_snapshot
    merged = dict(bundle or {})
    # yfinance / free API fill blanks on top-level fields
    for src in (yf_data, free_data):
        if not isinstance(src, dict):
            continue
        for k, v in src.items():
            if k in ("source", "error", "available"):
                continue
            if merged.get(k) in (None, "", {}, []):
                merged[k] = v
            elif isinstance(v, dict) and isinstance(merged.get(k), dict):
                for sk, sv in v.items():
                    if merged[k].get(sk) in (None, "", {}, []):
                        merged[k][sk] = sv

    # Seed description for synthesizer context
    ctx = {
        "name": (scrape.get("company") or {}).get("name") if isinstance(scrape.get("company"), dict) else None,
        "sector": meta.get("sector"),
        "industry": meta.get("industry"),
        "country": meta.get("country"),
    }
    if not ctx["name"]:
        ctx["name"] = (merged.get("info") or {}).get("longName") or symbol
    synth = _llm_synth_job(ctx)
    if not (scrape.get("company") or {}).get("description") and not merged.get("summary"):
        merged["summary"] = synth.get("description")
        merged["synth_description"] = synth.get("description")

    # ---- LAST RESORT: local country packs (only if live sources are empty) ----
    def _scrape_empty(s: dict) -> bool:
        if not s or not s.get("available"):
            return True
        # treat as empty if no company name and no statement tables
        has_company = bool((s.get("company") or {}).get("name") or s.get("price"))
        has_stmt = bool((s.get("income") or {}).get("rows") or (s.get("balance") or {}).get("rows"))
        return not (has_company or has_stmt)

    def _bundle_empty(b: dict) -> bool:
        if not b:
            return True
        if b.get("available") is False and not b.get("info") and not b.get("income_statement"):
            return True
        useful = any([
            b.get("info"), b.get("summary"), b.get("income_statement"),
            b.get("balance_sheet"), b.get("cashflow"), b.get("price"),
        ])
        return not useful

    local_pack = {"available": False, "source": "local_country_pack"}
    used_local = False
    if _scrape_empty(scrape) and _bundle_empty(merged):
        try:
            try:
                from backend.local_country_pack import fetch_local_country_pack
            except Exception:
                from local_country_pack import fetch_local_country_pack
            local_pack = fetch_local_country_pack(symbol, exchange) or {"available": False}
            if local_pack.get("available"):
                used_local = True
                # Promote pack into scrape shape so build_snapshot consumes it as primary offline data
                scrape = local_pack
                # Also seed merged bundle with description / price for secondary paths
                merged = dict(merged or {})
                if local_pack.get("price") is not None:
                    merged.setdefault("price", local_pack.get("price"))
                company = local_pack.get("company") or {}
                if company.get("description"):
                    merged.setdefault("summary", company.get("description"))
                info = dict(merged.get("info") or {})
                info.setdefault("longName", company.get("name"))
                info.setdefault("sector", company.get("sector"))
                info.setdefault("industry", company.get("industry"))
                info.setdefault("country", company.get("country") or local_pack.get("country"))
                merged["info"] = info
                merged["available"] = True
        except Exception as e:
            local_pack = {"available": False, "source": "local_country_pack", "error": str(e)[:200]}

    elapsed = round(time.time() - t0, 2)
    out = {
        "symbol": symbol,
        "exchange": exchange or meta.get("exchange_code") or scrape.get("exchange_code") or "",
        "meta": meta,
        "scrape": scrape,
        "bundle": merged,
        "sources_raw": {
            "stockanalysis": bool(scrape.get("available")) and scrape.get("source") != "local_country_pack",
            "yfinance": bool(yf_data.get("available")),
            "free_api": bool(free_data.get("available")),
            "multi_bundle": bool(bundle.get("available")),
            "synth_llm": True,
            "local_country_pack": bool(used_local or local_pack.get("available")),
        },
        "local_pack_used": used_local,
        "collected_at": _now_iso(),
        "elapsed_sec": elapsed,
        "cache_hit": False,
    }
    _cache_set(cache_key, out)
    return out


def _db_meta(symbol: str, exchange: Optional[str]) -> dict:
    try:
        import os, sqlite3
        base = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
        db = os.path.join(base, "data", "stocks.db")
        if not os.path.exists(db):
            return {}
        conn = sqlite3.connect(db)
        conn.row_factory = sqlite3.Row
        if exchange:
            row = conn.execute(
                "SELECT * FROM stocks WHERE UPPER(symbol)=? AND UPPER(exchange_code)=? LIMIT 1",
                (symbol.upper(), exchange.upper()),
            ).fetchone()
        else:
            row = conn.execute(
                "SELECT * FROM stocks WHERE UPPER(symbol)=? LIMIT 1",
                (symbol.upper(),),
            ).fetchone()
        conn.close()
        if not row:
            return {}
        return dict(row)
    except Exception:
        return {}


# ---------------------------------------------------------------------------
# Normalized snapshot
# ---------------------------------------------------------------------------

def build_snapshot(raw: Dict[str, Any]) -> Dict[str, Any]:
    scrape = raw.get("scrape") or {}
    bundle = raw.get("bundle") or {}
    meta = raw.get("meta") or {}
    stats = scrape.get("statistics") or scrape.get("overview_stats") or {}
    company = scrape.get("company") or {}
    info = bundle.get("info") or {}
    snap = bundle.get("snapshot") or {}

    name = (
        _pick(company, "Company Name", "Name")
        or bundle.get("name")
        or meta.get("company_name")
        or raw.get("symbol")
    )
    sector = (
        _pick(company, "Sector") or _pick(stats, "Sector")
        or bundle.get("sector") or info.get("sector") or meta.get("sector") or "—"
    )
    industry = (
        _pick(company, "Industry") or _pick(stats, "Industry")
        or bundle.get("industry") or info.get("industry") or meta.get("industry") or "—"
    )
    country = (
        _pick(company, "Country") or meta.get("country")
        or info.get("country") or snap.get("country") or "—"
    )
    exchange = raw.get("exchange") or meta.get("exchange_code") or meta.get("stock_exchange") or "—"
    description = (
        _pick(company, "description", "Description")
        or bundle.get("summary")
        or info.get("longBusinessSummary")
        or ""
    )
    if isinstance(description, str) and len(description) > 1800:
        description = description[:1800].rsplit(" ", 1)[0] + "…"

    price = _safe_float(
        bundle.get("price")
        or _pick(stats, "Stock Price", "Price", "Current Price")
        or info.get("currentPrice")
        or info.get("regularMarketPrice")
    )
    currency = bundle.get("currency") or info.get("currency") or "USD"
    market_cap = _safe_float(
        bundle.get("market_cap")
        or _pick(stats, "Market Cap", "Market Capitalization")
        or info.get("marketCap")
    )
    pe = _safe_float(_pick(stats, "PE Ratio", "P/E", "PE") or info.get("trailingPE"))
    fwd_pe = _safe_float(_pick(stats, "Forward PE", "Forward P/E") or info.get("forwardPE"))
    pb = _safe_float(_pick(stats, "PB Ratio", "P/B", "Price/Book") or info.get("priceToBook"))
    ps = _safe_float(_pick(stats, "PS Ratio", "P/S") or info.get("priceToSalesTrailing12Months"))
    eps = _safe_float(_pick(stats, "EPS", "EPS (ttm)", "EPS (TTM)") or info.get("trailingEps"))
    beta = _safe_float(_pick(stats, "Beta") or info.get("beta"))
    div_yield = _safe_float(
        bundle.get("dividend_yield")
        or _pick(stats, "Dividend Yield", "Div Yield")
        or info.get("dividendYield")
    )
    week52_high = _safe_float(_pick(stats, "52-Week High", "52 Week High") or info.get("fiftyTwoWeekHigh"))
    week52_low = _safe_float(_pick(stats, "52-Week Low", "52 Week Low") or info.get("fiftyTwoWeekLow"))
    employees = _pick(company, "Employees", "Full Time Employees") or info.get("fullTimeEmployees")
    ceo = _pick(company, "CEO", "Chief Executive Officer")
    website = _pick(company, "Website", "Web") or info.get("website")
    founded = _pick(company, "Founded", "IPO Date", "IPO")
    shares = _safe_float(_pick(stats, "Shares Outstanding", "Shares Out") or info.get("sharesOutstanding"))
    year_change = _safe_float(bundle.get("year_change") or info.get("52WeekChange"))

    income = scrape.get("income") or bundle.get("income_statement") or {}
    balance = scrape.get("balance") or bundle.get("balance_sheet") or {}
    cashflow = scrape.get("cashflow") or bundle.get("cashflow") or {}
    ratios_tbl = scrape.get("ratios") or {}
    ratios_bundle = bundle.get("ratios") or {}

    # Normalize statement tables to {periods, rows}
    income = _normalize_table(income)
    balance = _normalize_table(balance)
    cashflow = _normalize_table(cashflow)
    ratios_tbl = _normalize_table(ratios_tbl)

    return {
        "symbol": raw.get("symbol"),
        "exchange": exchange,
        "name": name,
        "sector": sector,
        "industry": industry,
        "country": country,
        "description": description,
        "price": price,
        "currency": currency,
        "market_cap": market_cap,
        "pe": pe,
        "forward_pe": fwd_pe,
        "pb": pb,
        "ps": ps,
        "eps": eps,
        "beta": beta,
        "dividend_yield": div_yield,
        "week52_high": week52_high,
        "week52_low": week52_low,
        "employees": employees,
        "ceo": ceo,
        "website": website,
        "founded": founded,
        "shares_outstanding": shares,
        "year_change": year_change,
        "income": income,
        "balance": balance,
        "cashflow": cashflow,
        "ratios_table": ratios_tbl,
        "ratios_flat": ratios_bundle,
        "stats_raw": stats,
        "company_raw": company,
        "info": info,
        "scrape_url": scrape.get("url") or scrape.get("base_path"),
        "scrape_available": bool(scrape.get("available")),
        "collected_at": raw.get("collected_at"),
        "sources_raw": raw.get("sources_raw") or {},
        "bundle_available": bool(bundle.get("available")),
        # history filled below
        "collected_at": raw.get("collected_at") or _now_iso(),
        "sources": list(filter(None, [
            "stockanalysis.com" if scrape.get("available") else None,
            "multi-source bundle" if bundle.get("available") else None,
        ])) or ["public free sources"],
    }


def _normalize_table(t: Any) -> dict:
    if not t or not isinstance(t, dict):
        return {"periods": [], "rows": {}}
    if "rows" in t and "periods" in t:
        return {"periods": list(t.get("periods") or []), "rows": dict(t.get("rows") or {})}
    # sometimes nested differently
    if "data" in t and isinstance(t["data"], dict):
        return _normalize_table(t["data"])
    return {"periods": [], "rows": {}}


# ---------------------------------------------------------------------------
# Analytical blocks
# ---------------------------------------------------------------------------

def financial_highlights(snap: dict) -> List[str]:
    points = []
    income = snap.get("income") or {}
    periods = _periods(income)
    rev = _row_series(income, "Revenue", "Total Revenue", "Sales")
    ni = _row_series(income, "Net Income", "Net Income Common", "Net Income (Common)")
    gp = _row_series(income, "Gross Profit")
    op = _row_series(income, "Operating Income", "EBIT")

    if periods and rev:
        last = _latest(rev, periods)
        g = _yoy_growth(rev, periods)
        if last is not None:
            msg = f"Latest reported revenue stands at {_fmt_num(last)}"
            if g is not None:
                msg += f", a {_fmt_pct(g)} year-over-year change"
            points.append(msg + ".")
        cagr = _cagr(rev, periods)
        if cagr is not None and len(periods) >= 3:
            points.append(
                f"Multi-period revenue CAGR over the available window is approximately {_fmt_pct(cagr)}."
            )

    if periods and ni:
        last_ni = _latest(ni, periods)
        last_rev = _latest(rev, periods) if rev else None
        if last_ni is not None:
            points.append(f"Latest net income is {_fmt_num(last_ni)}.")
            if last_rev and last_rev != 0:
                margin = last_ni / last_rev
                points.append(f"Implied net margin on the latest period is {_fmt_pct(margin)}.")

    if periods and gp and rev:
        last_gp, last_rev = _latest(gp, periods), _latest(rev, periods)
        if last_gp is not None and last_rev:
            points.append(f"Gross margin on the latest period is {_fmt_pct(last_gp / last_rev)}.")

    if periods and op and rev:
        last_op, last_rev = _latest(op, periods), _latest(rev, periods)
        if last_op is not None and last_rev:
            points.append(f"Operating margin on the latest period is {_fmt_pct(last_op / last_rev)}.")

    cf = snap.get("cashflow") or {}
    cfp = _periods(cf)
    ocf = _row_series(cf, "Operating Cash Flow", "Cash From Operations", "Net Cash From Operating Activities")
    fcf = _row_series(cf, "Free Cash Flow")
    if cfp and ocf:
        points.append(f"Latest operating cash flow is {_fmt_num(_latest(ocf, cfp))}.")
    if cfp and fcf:
        points.append(f"Latest free cash flow is {_fmt_num(_latest(fcf, cfp))}.")

    if snap.get("pe") is not None:
        points.append(f"Trailing P/E is {_fmt_num(snap['pe'], 2)}.")
    if snap.get("market_cap") is not None:
        points.append(f"Market capitalisation is approximately {_fmt_num(snap['market_cap'])} {snap.get('currency') or ''}.".strip())

    if not points:
        points.append(
            "Detailed multi-year financial line items were limited for this listing; "
            "the sections below use whatever public statement data was available."
        )
    return points[:10]


def ratio_panel(snap: dict) -> Dict[str, List[Tuple[str, str]]]:
    """Grouped ratios for the financial analysis / equity ratio section."""
    info = snap.get("info") or {}
    rf = snap.get("ratios_flat") or {}
    stats = snap.get("stats_raw") or {}

    def g(*keys, pct=False):
        for k in keys:
            v = _pick(info, k) or _pick(rf, k) or _pick(stats, k)
            if v is not None:
                return _fmt_pct(v) if pct else _fmt_num(v)
        return "—"

    return {
        "Valuation": [
            ("Trailing P/E", g("trailingPE", "PE Ratio", "P/E") if not snap.get("pe") else _fmt_num(snap["pe"])),
            ("Forward P/E", g("forwardPE", "Forward PE") if not snap.get("forward_pe") else _fmt_num(snap["forward_pe"])),
            ("Price / Book", g("priceToBook", "PB Ratio", "P/B") if not snap.get("pb") else _fmt_num(snap["pb"])),
            ("Price / Sales", g("priceToSalesTrailing12Months", "PS Ratio", "P/S") if not snap.get("ps") else _fmt_num(snap["ps"])),
            ("EV / EBITDA", g("enterpriseToEbitda", "EV/EBITDA")),
            ("PEG Ratio", g("pegRatio", "PEG")),
        ],
        "Profitability": [
            ("Gross Margin", g("grossMargins", "Gross Margin", pct=True)),
            ("Operating Margin", g("operatingMargins", "Operating Margin", pct=True)),
            ("Profit Margin", g("profitMargins", "Net Margin", "Profit Margin", pct=True)),
            ("ROE", g("returnOnEquity", "ROE", pct=True)),
            ("ROA", g("returnOnAssets", "ROA", pct=True)),
            ("EBITDA Margin", g("ebitdaMargins", pct=True)),
        ],
        "Liquidity & Leverage": [
            ("Current Ratio", g("currentRatio", "Current Ratio")),
            ("Quick Ratio", g("quickRatio", "Quick Ratio")),
            ("Debt / Equity", g("debtToEquity", "Debt/Equity", "D/E")),
            ("Total Debt", g("totalDebt", "Total Debt")),
            ("Total Cash", g("totalCash", "Cash")),
            ("Interest Coverage", g("interestCoverage")),
        ],
        "Growth & Cash": [
            ("Revenue Growth", g("revenueGrowth", pct=True)),
            ("Earnings Growth", g("earningsGrowth", pct=True)),
            ("Operating Cash Flow", g("operatingCashflow", "Operating Cash Flow")),
            ("Free Cash Flow", g("freeCashflow", "Free Cash Flow")),
            ("Beta", g("beta") if not snap.get("beta") else _fmt_num(snap["beta"])),
            ("Dividend Yield", _fmt_pct(snap["dividend_yield"]) if snap.get("dividend_yield") is not None else g("dividendYield", pct=True)),
        ],
    }


def statement_matrix(table: dict, metrics: List[str], max_periods: int = 6) -> Dict[str, Any]:
    periods = _periods(table)[-max_periods:]
    rows_out = []
    for m in metrics:
        series = _row_series(table, m)
        if not series:
            continue
        vals = [_fmt_num(series.get(p)) for p in periods]
        if all(v == "—" for v in vals):
            continue
        rows_out.append({"metric": m, "values": vals})
    return {"periods": periods, "rows": rows_out}


def income_metrics() -> List[str]:
    return [
        "Revenue", "Total Revenue", "Cost of Revenue", "Gross Profit",
        "Operating Expenses", "Operating Income", "EBITDA",
        "Interest Expense", "Pretax Income", "Income Tax", "Net Income",
        "EPS (Diluted)", "EPS Diluted", "Shares Outstanding (Diluted)",
    ]


def balance_metrics() -> List[str]:
    return [
        "Cash & Equivalents", "Cash and Cash Equivalents", "Short-Term Investments",
        "Receivables", "Inventory", "Total Current Assets", "Property, Plant & Equipment",
        "Total Assets", "Total Current Liabilities", "Long-Term Debt", "Total Debt",
        "Total Liabilities", "Shareholders' Equity", "Total Equity", "Retained Earnings",
    ]


def cashflow_metrics() -> List[str]:
    return [
        "Net Income", "Depreciation & Amortization", "Operating Cash Flow",
        "Capital Expenditures", "Capital Expenditure", "Free Cash Flow",
        "Dividends Paid", "Common Dividends Paid",
        "Issuance of Debt", "Repayment of Debt", "Repurchase of Stock",
        "Cash From Investing", "Cash From Financing",
    ]


def build_swot(snap: dict) -> Dict[str, List[str]]:
    """Heuristic SWOT grounded in available data — never empty generic fluff when data exists."""
    s, w, o, t = [], [], [], []
    income = snap.get("income") or {}
    periods = _periods(income)
    rev = _row_series(income, "Revenue", "Total Revenue")
    ni = _row_series(income, "Net Income")
    gp = _row_series(income, "Gross Profit")
    cf = snap.get("cashflow") or {}
    cfp = _periods(cf)
    fcf = _row_series(cf, "Free Cash Flow")
    ocf = _row_series(cf, "Operating Cash Flow", "Cash From Operations")

    # Strengths
    if snap.get("description"):
        s.append(
            f"{snap['name']} operates in {snap.get('industry') or 'its industry'} "
            f"within the {snap.get('sector') or 'broader market'} sector, with a publicly documented business profile."
        )
    if periods and rev:
        cagr = _cagr(rev, periods)
        if cagr is not None and cagr > 0.05:
            s.append(f"Revenue CAGR of roughly {_fmt_pct(cagr)} over the available reporting window indicates sustained top-line expansion.")
        g = _yoy_growth(rev, periods)
        if g is not None and g > 0.08:
            s.append(f"Most recent year-over-year revenue growth of {_fmt_pct(g)} supports a constructive growth narrative.")
    if periods and gp and rev:
        last_gp, last_rev = _latest(gp, periods), _latest(rev, periods)
        if last_gp and last_rev and (last_gp / last_rev) > 0.25:
            s.append(f"Gross margin near {_fmt_pct(last_gp/last_rev)} suggests meaningful pricing power or cost efficiency in the core product mix.")
    if cfp and fcf:
        last_fcf = _latest(fcf, cfp)
        if last_fcf is not None and last_fcf > 0:
            s.append(f"Positive free cash flow ({_fmt_num(last_fcf)}) provides flexibility for reinvestment, debt reduction, or shareholder returns.")
    if snap.get("beta") is not None and snap["beta"] < 1.1:
        s.append(f"Equity beta around {_fmt_num(snap['beta'], 2)} indicates relatively moderate systematic volatility versus the broad market.")
    if snap.get("market_cap") and snap["market_cap"] > 1e10:
        s.append("Large-cap scale can support better access to capital markets and operational resilience through cycles.")

    # Weaknesses
    if periods and ni:
        last_ni = _latest(ni, periods)
        if last_ni is not None and last_ni < 0:
            w.append("Latest reported net income is negative, which constrains traditional earnings-based valuation and payout capacity.")
        gni = _yoy_growth(ni, periods)
        if gni is not None and gni < -0.15:
            w.append(f"Net income contracted approximately {_fmt_pct(gni)} year-over-year — earnings quality and cost trajectory warrant scrutiny.")
    if periods and rev:
        g = _yoy_growth(rev, periods)
        if g is not None and g < -0.05:
            w.append(f"Recent revenue decline of {_fmt_pct(g)} may signal demand softness, pricing pressure, or mix shift.")
    if cfp and fcf:
        last_fcf = _latest(fcf, cfp)
        if last_fcf is not None and last_fcf < 0:
            w.append("Negative free cash flow increases reliance on external financing or cash reserves to fund operations and investment.")
    de = _safe_float(_pick(snap.get("info") or {}, "debtToEquity") or _pick(snap.get("stats_raw") or {}, "Debt/Equity", "Debt / Equity"))
    if de is not None and de > 150:
        w.append(f"Elevated debt-to-equity ({_fmt_num(de, 1)}) raises financial leverage and interest-burden risk in a higher-rate environment.")
    if not snap.get("scrape_available") and not snap.get("bundle_available"):
        w.append("Public machine-readable financial history for this listing is sparse, limiting the depth of quantitative conclusions.")

    # Opportunities
    o.append(
        f"Industry positioning in {snap.get('industry') or 'the stated industry'} may benefit from structural demand, "
        "technology adoption, or regulatory tailwinds depending on the sub-sector cycle."
    )
    if periods and rev:
        cagr = _cagr(rev, periods)
        if cagr is not None and cagr > 0:
            o.append("Continuation of historical revenue growth, if sustained with stable margins, could support earnings expansion and multiple re-rating.")
    if snap.get("dividend_yield") is None or (snap.get("dividend_yield") or 0) < 0.01:
        o.append("If free cash flow scales, the company could introduce or grow shareholder returns (dividends or buybacks) as a future capital-allocation lever.")
    o.append("Operational efficiency programmes, mix upgrade, or geographic expansion are typical levers that can lift margins even without rapid top-line acceleration.")

    # Threats
    t.append(
        "Competitive intensity in the industry can compress margins and force higher marketing or R&D spend to defend share."
    )
    t.append(
        "Macroeconomic shocks (rates, FX, commodity costs, or demand recessions) can impair volumes and valuations simultaneously."
    )
    if snap.get("beta") is not None and snap["beta"] > 1.4:
        t.append(f"Elevated beta ({_fmt_num(snap['beta'], 2)}) implies larger drawdowns in risk-off markets relative to the benchmark.")
    t.append(
        "Regulatory, legal, or listing-specific constraints — especially for secondary listings — can affect liquidity, disclosure quality, and investor access."
    )
    if periods and rev:
        g = _yoy_growth(rev, periods)
        if g is not None and g < 0:
            t.append("A sustained revenue downturn, if not reversed, could pressure employment, CapEx plans, and credit metrics.")

    # Ensure minimum content
    if not s:
        s.append("Public profile confirms an active listed equity with identifiable sector and industry classification.")
    if not w:
        w.append("Limited multi-year disclosure on this feed restricts full visibility into margin durability and off-balance-sheet commitments.")
    if not o:
        o.append("Sector growth and company-specific execution remain the primary upside levers for equity holders.")
    if not t:
        t.append("Market, credit, and operational risks typical of listed equities apply and should be sized in any portfolio context.")

    return {"strengths": s[:6], "weaknesses": w[:6], "opportunities": o[:6], "threats": t[:6]}


def expense_analysis(snap: dict) -> Dict[str, Any]:
    """Financial-analysis-report style cost breakdown narrative."""
    income = snap.get("income") or {}
    periods = _periods(income)
    blocks = []

    mapping = [
        ("Research & Development", ["Research And Development", "Research & Development", "R&D"]),
        ("Cost of Revenue / COGS", ["Cost of Revenue", "Cost Of Revenue", "Cost of Goods Sold", "COGS"]),
        ("Operating Expenses", ["Operating Expenses", "Operating Expense", "Total Operating Expenses"]),
        ("Selling, General & Administrative", ["Selling General And Administrative", "SG&A", "Selling & Marketing"]),
        ("Interest Expense", ["Interest Expense", "Interest Expense Non Operating"]),
        ("Income Tax", ["Income Tax Expense", "Income Tax", "Tax Provision"]),
    ]
    for title, keys in mapping:
        series = _row_series(income, *keys)
        if not series or not periods:
            continue
        last = _latest(series, periods)
        g = _yoy_growth(series, periods)
        note = f"Latest reported figure: {_fmt_num(last)}."
        if g is not None:
            note += f" Year-over-year change: {_fmt_pct(g)}."
        blocks.append({"title": title, "latest": last, "yoy": g, "note": note, "series": {p: series.get(p) for p in periods[-5:]}})

    # CapEx from cash flow
    cf = snap.get("cashflow") or {}
    cfp = _periods(cf)
    capex = _row_series(cf, "Capital Expenditures", "Capital Expenditure", "Purchase Of PPE")
    if capex and cfp:
        last = _latest(capex, cfp)
        blocks.append({
            "title": "Capital Expenditure",
            "latest": last,
            "yoy": _yoy_growth(capex, cfp),
            "note": f"Latest CapEx (cash outflow): {_fmt_num(last)}. CapEx funds capacity, maintenance, and growth assets.",
            "series": {p: capex.get(p) for p in cfp[-5:]},
        })

    narrative = []
    if blocks:
        narrative.append(
            "Cost structure is reconstructed from public income and cash-flow statements. "
            "Categories below mirror how institutional research typically dissects operating leverage."
        )
        rev = _row_series(income, "Revenue", "Total Revenue")
        opex = _row_series(income, "Operating Expenses", "Operating Expense")
        if rev and opex and periods:
            lr, lo = _latest(rev, periods), _latest(opex, periods)
            gr, go = _yoy_growth(rev, periods), _yoy_growth(opex, periods)
            if lr and lo is not None:
                narrative.append(
                    f"On the latest period, operating expenses of {_fmt_num(lo)} compare with revenue of {_fmt_num(lr)}."
                )
            if gr is not None and go is not None:
                if go > gr + 0.03:
                    narrative.append(
                        "Operating expense growth has recently outpaced revenue growth — a pattern that can compress operating margins if sustained."
                    )
                elif gr > go + 0.03:
                    narrative.append(
                        "Revenue growth has outpaced operating expense growth recently, consistent with positive operating leverage."
                    )
    else:
        narrative.append(
            "Granular expense lines were not fully available for this listing on free public sources. "
            "Investors should consult the issuer's primary filings for a complete cost breakdown."
        )

    return {"blocks": blocks, "narrative": narrative}


def valuation_block(snap: dict) -> Dict[str, Any]:
    """Transparent, simplified valuation context — not a formal target price service."""
    price = snap.get("price")
    pe = snap.get("pe")
    eps = snap.get("eps")
    pb = snap.get("pb")
    ps = snap.get("ps")
    beta = snap.get("beta") or 1.1
    notes = []

    # Implied / illustrative intrinsic band using earnings if available
    fair_pe_low, fair_pe_high = 12.0, 22.0
    if snap.get("sector"):
        sec = str(snap["sector"]).lower()
        if any(x in sec for x in ("tech", "information", "communication")):
            fair_pe_low, fair_pe_high = 18.0, 35.0
        elif any(x in sec for x in ("utilit", "staples", "real estate")):
            fair_pe_low, fair_pe_high = 10.0, 18.0
        elif any(x in sec for x in ("energy", "material", "industrial")):
            fair_pe_low, fair_pe_high = 8.0, 16.0
        elif "financial" in sec:
            fair_pe_low, fair_pe_high = 8.0, 14.0

    illustrative = {}
    if eps and eps > 0:
        illustrative["eps_based_low"] = eps * fair_pe_low
        illustrative["eps_based_high"] = eps * fair_pe_high
        notes.append(
            f"Using trailing EPS of {_fmt_num(eps)} and a sector-contextual P/E band of "
            f"{fair_pe_low:.0f}×–{fair_pe_high:.0f}×, an illustrative fair-value range is "
            f"{_fmt_num(illustrative['eps_based_low'])} – {_fmt_num(illustrative['eps_based_high'])} "
            f"per share (not a formal target)."
        )
    if price and pe and pe > 0:
        notes.append(
            f"At a last price of {_fmt_num(price)} and trailing P/E of {_fmt_num(pe)}, "
            "the market is capitalising current earnings at that multiple; compare with peer medians in the relative section."
        )
    if price and eps and eps > 0 and pe:
        pass
    else:
        notes.append(
            "A full DCF requires forward free-cash-flow forecasts, WACC, and terminal growth. "
            "Where statement history is incomplete, this report emphasises relative multiples and ratio diagnostics instead of a single-point DCF target."
        )

    # Simple cost of equity illustration
    rf = 0.04
    erp = 0.05
    coe = rf + beta * erp
    notes.append(
        f"Illustrative cost of equity using CAPM with rf≈4%, ERP≈5%, beta≈{_fmt_num(beta, 2)}: "
        f"Ke ≈ {_fmt_pct(coe)}. Actual WACC also depends on after-tax cost of debt and capital structure."
    )

    return {
        "price": price,
        "pe": pe,
        "eps": eps,
        "pb": pb,
        "ps": ps,
        "beta": beta,
        "illustrative_range": illustrative,
        "notes": notes,
        "fair_pe_band": [fair_pe_low, fair_pe_high],
        "cost_of_equity_illust": coe,
    }


def risk_block(snap: dict) -> Dict[str, List[str]]:
    operational = [
        "Execution risk on product, capacity, or cost programmes can cause results to diverge from historical trends.",
        "Customer concentration, supply-chain disruption, or key-person dependence (where applicable) can amplify earnings volatility.",
        "Technology or product obsolescence risk applies in innovation-heavy industries.",
    ]
    economic = [
        "Equity valuations are sensitive to discount rates; higher real yields typically compress multiples.",
        "Currency translation and country-specific macro shocks can affect reported results for multi-geography issuers.",
        "Sector cyclicality may drive correlated drawdowns across peers.",
    ]
    market = [
        "Secondary or thinly traded listings can exhibit wider spreads and lower liquidity than the primary listing.",
        f"Observed beta of {_fmt_num(snap.get('beta'), 2) if snap.get('beta') is not None else 'n/a'} frames systematic risk versus the market benchmark.",
        "Information risk: free public feeds may lag or omit restatements present in official filings.",
    ]
    if snap.get("pe") and snap["pe"] > 40:
        market.append("Elevated trailing P/E leaves limited margin of safety if growth expectations reset lower.")
    if snap.get("dividend_yield") is None:
        operational.append("Absence of a meaningful dividend means total return depends primarily on price appreciation and buybacks.")
    return {"operational": operational[:5], "economic": economic[:5], "market": market[:5]}


def investment_summary_text(snap: dict, valuation: dict) -> str:
    bits = [
        f"{snap.get('name') or snap.get('symbol')} ({snap.get('symbol')}) is listed on {snap.get('exchange') or 'its exchange'} "
        f"and classified under {snap.get('sector') or 'n/a'} / {snap.get('industry') or 'n/a'}."
    ]
    if snap.get("price") is not None:
        bits.append(
            f"Last available price in this compilation is {_fmt_num(snap['price'])} {snap.get('currency') or ''}."
        )
    if snap.get("market_cap") is not None:
        bits.append(f"Approximate market capitalisation: {_fmt_num(snap['market_cap'])}.")
    fh = financial_highlights(snap)
    if fh:
        bits.append(fh[0])
    bits.append(
        "This note combines statement trends, ratio diagnostics, qualitative SWOT, and transparent valuation context. "
        "It is not a formal buy/hold/sell recommendation."
    )
    return " ".join(bits)


# ---------------------------------------------------------------------------
# Full report payloads
# ---------------------------------------------------------------------------

def build_equity_report(symbol: str, exchange: Optional[str] = None) -> Dict[str, Any]:
    raw = collect_report_data(symbol, exchange)
    snap = build_snapshot(raw)
    valuation = valuation_block(snap)
    ratios = ratio_panel(snap)
    risks = risk_block(snap)
    swot = build_swot(snap)

    income_mx = statement_matrix(snap.get("income") or {}, income_metrics())
    balance_mx = statement_matrix(snap.get("balance") or {}, balance_metrics())
    cash_mx = statement_matrix(snap.get("cashflow") or {}, cashflow_metrics())

    return {
        "report_type": "equity",
        "title": f"Equity Research Report — {snap.get('name') or symbol}",
        "subtitle": f"{snap.get('symbol')} · {snap.get('exchange')} · {_now_short()}",
        "generated_at": _now_iso(),
        "snapshot": snap,
        "investment_summary": investment_summary_text(snap, valuation),
        "financial_highlights": financial_highlights(snap),
        "ratios": ratios,
        "income_matrix": income_mx,
        "balance_matrix": balance_mx,
        "cashflow_matrix": cash_mx,
        "valuation": valuation,
        "swot": swot,
        "risks": risks,
        "header_stats": {
            "Price": f"{_fmt_num(snap.get('price'))} {snap.get('currency') or ''}".strip(),
            "Market Cap": _fmt_num(snap.get("market_cap")),
            "52W High": _fmt_num(snap.get("week52_high")),
            "52W Low": _fmt_num(snap.get("week52_low")),
            "P/E": _fmt_num(snap.get("pe")),
            "EPS": _fmt_num(snap.get("eps")),
            "Beta": _fmt_num(snap.get("beta")),
            "Div Yield": _fmt_pct(snap.get("dividend_yield")) if snap.get("dividend_yield") is not None else "—",
            "Sector": snap.get("sector") or "—",
            "Industry": snap.get("industry") or "—",
            "Country": snap.get("country") or "—",
            "Shares Out": _fmt_num(snap.get("shares_outstanding"), 0),
        },
        "sources": snap.get("sources") or [],
        "scrape_url": snap.get("scrape_url"),
    }


def build_financial_report(symbol: str, exchange: Optional[str] = None) -> Dict[str, Any]:
    raw = collect_report_data(symbol, exchange)
    snap = build_snapshot(raw)
    expenses = expense_analysis(snap)
    swot = build_swot(snap)
    ratios = ratio_panel(snap)
    income_mx = statement_matrix(snap.get("income") or {}, income_metrics())
    balance_mx = statement_matrix(snap.get("balance") or {}, balance_metrics())
    cash_mx = statement_matrix(snap.get("cashflow") or {}, cashflow_metrics())

    abstract_parts = [
        f"This financial analysis examines {snap.get('name') or symbol} ({snap.get('symbol')}) listed on {snap.get('exchange') or 'n/a'}.",
        f"The company is classified in {snap.get('sector') or 'n/a'} / {snap.get('industry') or 'n/a'}.",
    ]
    if expenses.get("blocks"):
        abstract_parts.append(
            f"Cost structure review covers {len(expenses['blocks'])} major expense and investment categories drawn from public statements."
        )
    abstract_parts.append(
        "Ownership commentary is limited to publicly visible statistics; SWOT synthesises strengths, weaknesses, opportunities, and threats from the same dataset."
    )
    abstract_parts.append(
        "Investors should treat incomplete free-source history with caution and verify against primary exchange filings."
    )

    return {
        "report_type": "financial",
        "title": f"Financial Analysis Report — {snap.get('name') or symbol}",
        "subtitle": f"{snap.get('symbol')} · {snap.get('exchange')} · {_now_short()}",
        "generated_at": _now_iso(),
        "snapshot": snap,
        "abstract": " ".join(abstract_parts),
        "keywords": [
            snap.get("symbol") or symbol,
            snap.get("sector") or "Equity",
            "Financial Analysis",
            "SWOT",
            "Operating Expenses",
            "Public Filings",
        ],
        "expenses": expenses,
        "swot": swot,
        "ratios": ratios,
        "income_matrix": income_mx,
        "balance_matrix": balance_mx,
        "cashflow_matrix": cash_mx,
        "financial_highlights": financial_highlights(snap),
        "conclusion": {
            "results": [
                f"Public data compilation for {snap.get('symbol')} was completed at {snap.get('collected_at')}.",
                "Expense, ratio, and SWOT sections above summarise the investable narrative available from free sources.",
                "Where statement cells are blank, the issuer's primary annual and interim reports remain the authoritative reference.",
            ],
            "limitations": [
                "Free data feeds may omit footnotes, restatements, and segment detail present in audited financials.",
                "SWOT items are analytical interpretations of quantitative trends and profile text — not management guidance.",
                "This listing may not be the company's main trading line; liquidity and disclosure can differ by venue.",
                "No formal credit rating, auditor opinion, or regulated research licence is implied by this document.",
            ],
        },
        "sources": snap.get("sources") or [],
        "scrape_url": snap.get("scrape_url"),
    }


def build_report(kind: str, symbol: str, exchange: Optional[str] = None) -> Dict[str, Any]:
    """Equity research only — financial analysis report removed from product."""
    return build_equity_report(symbol, exchange)


# ---------------------------------------------------------------------------
# Extended analysis helpers for institutional redesign
# ---------------------------------------------------------------------------

TERM_EXPLAIN = {
    "Revenue": "Total income earned from the company's core products and services before any costs are deducted. Rising revenue usually signals growing demand or pricing power.",
    "Total Revenue": "Aggregate top-line sales across all business lines for the period. It is the starting point of the income statement.",
    "Cost of Revenue": "Direct costs of producing goods or delivering services sold. Higher costs relative to revenue compress gross margin.",
    "Gross Profit": "Revenue minus cost of revenue. Shows how much is left after direct production costs to cover operating expenses and profit.",
    "Operating Expenses": "Day-to-day costs of running the business (selling, admin, R&D) excluding direct product costs, interest and tax.",
    "Operating Income": "Profit from core operations after operating expenses but before interest and taxes. Reflects underlying business profitability.",
    "EBITDA": "Earnings before interest, taxes, depreciation and amortization — a cash-earnings proxy that ignores capital structure and non-cash charges.",
    "Net Income": "Bottom-line profit after all expenses, interest and taxes. The residual amount attributable to shareholders.",
    "EPS (Diluted)": "Net income divided by diluted shares outstanding. Measures per-share earnings power.",
    "Total Assets": "Everything the company owns or controls that is expected to provide future economic benefit.",
    "Cash & Equivalents": "Most liquid assets — cash and short-term instruments that can be converted to cash quickly.",
    "Receivables": "Amounts customers owe the company for goods or services already delivered.",
    "Inventory": "Goods held for sale or used in production. High inventory can tie up cash; declining inventory may signal demand or efficiency.",
    "Total Current Assets": "Assets expected to be converted to cash within one year.",
    "Property, Plant & Equipment": "Long-lived physical assets used in operations, reported net of depreciation.",
    "Total Liabilities": "All obligations the company owes to external parties.",
    "Total Current Liabilities": "Obligations due within one year.",
    "Long-Term Debt": "Borrowings due beyond one year. Rising long-term debt increases leverage and interest burden.",
    "Total Debt": "Sum of short- and long-term interest-bearing liabilities.",
    "Shareholders' Equity": "Residual interest in assets after deducting liabilities — the book value of owners' stake.",
    "Retained Earnings": "Cumulative profits kept in the business rather than paid as dividends.",
    "Operating Cash Flow": "Cash generated by core operations after working-capital changes. The foundation of financial health.",
    "Capital Expenditures": "Cash spent to acquire or upgrade long-term assets. High CapEx can reduce free cash flow even when earnings look strong.",
    "Free Cash Flow": "Operating cash flow minus capital expenditure — cash available for dividends, buybacks, debt reduction or acquisitions.",
    "Cash From Investing": "Net cash used in or provided by investment activities such as CapEx and asset sales.",
    "Cash From Financing": "Net cash from debt issuance/repayment, equity raises, dividends and buybacks.",
    "Trailing P/E": "Share price divided by trailing twelve-month earnings per share. Higher multiples imply greater growth expectations.",
    "Forward P/E": "Share price divided by expected next-year earnings. Incorporates growth forecasts.",
    "Price / Book": "Market value relative to accounting book value of equity.",
    "Price / Sales": "Market value relative to revenue — useful when earnings are volatile or negative.",
    "ROE": "Return on equity — net income as a percentage of shareholders' equity. Measures capital efficiency for owners.",
    "ROA": "Return on assets — net income as a percentage of total assets. Measures asset productivity.",
    "Current Ratio": "Current assets divided by current liabilities. Above 1 suggests short-term obligations can be covered.",
    "Debt / Equity": "Total debt relative to equity. Higher values mean more financial leverage and risk.",
    "Dividend Yield": "Annual dividends as a percentage of the current share price — income return to shareholders.",
    "Beta": "Sensitivity of the stock's returns to overall market moves. Above 1 means more volatile than the market.",
}


def matrix_with_yoy(table: dict, metrics: List[str], max_periods: int = 6) -> Dict[str, Any]:
    """Statement matrix with a YoY growth row under each metric."""
    periods = _periods(table)[-max_periods:]
    rows_out = []
    for m in metrics:
        series = _row_series(table, m)
        if not series:
            continue
        vals = [_safe_float(series.get(p)) for p in periods]
        if all(v is None for v in vals):
            continue
        rows_out.append({
            "metric": m,
            "kind": "value",
            "values": [_fmt_num(v) for v in vals],
            "raw": vals,
            "definition": TERM_EXPLAIN.get(m) or f"{m} is a reported line item from company financial statements.",
        })
        # YoY % between consecutive periods
        yoy_display = []
        yoy_raw = []
        for i, v in enumerate(vals):
            if i == 0 or v is None or vals[i - 1] is None or vals[i - 1] == 0:
                yoy_display.append("—")
                yoy_raw.append(None)
            else:
                g = (v - vals[i - 1]) / abs(vals[i - 1])
                yoy_raw.append(g)
                yoy_display.append(_fmt_pct(g))
        rows_out.append({
            "metric": f"{m} · YoY Growth",
            "kind": "yoy",
            "values": yoy_display,
            "raw": yoy_raw,
            "parent": m,
        })
    return {"periods": periods, "rows": rows_out}


ASSET_METRICS = [
    "Cash & Equivalents", "Cash and Cash Equivalents", "Short-Term Investments",
    "Receivables", "Inventory", "Total Current Assets",
    "Property, Plant & Equipment", "Goodwill", "Intangible Assets",
    "Long-Term Investments", "Total Assets",
]
LIABILITY_METRICS = [
    "Accounts Payable", "Short-Term Debt", "Current Portion of Long-Term Debt",
    "Total Current Liabilities", "Long-Term Debt", "Total Debt",
    "Deferred Revenue", "Total Liabilities",
]
EQUITY_METRICS = [
    "Common Stock", "Additional Paid-In Capital", "Retained Earnings",
    "Treasury Stock", "Shareholders' Equity", "Total Equity", "Total Liabilities And Equity",
]
OPERATING_CF = [
    "Net Income", "Depreciation & Amortization", "Depreciation And Amortization",
    "Stock-Based Compensation", "Change In Working Capital",
    "Operating Cash Flow", "Cash From Operations", "Net Cash From Operating Activities",
]
INVESTING_CF = [
    "Capital Expenditures", "Capital Expenditure", "Purchase Of PPE",
    "Acquisitions", "Purchase Of Investments", "Sale Of Investments",
    "Cash From Investing", "Net Cash From Investing Activities",
]
FINANCING_CF = [
    "Issuance Of Debt", "Repayment Of Debt", "Issuance Of Capital Stock",
    "Repurchase Of Stock", "Dividends Paid", "Common Dividends Paid",
    "Cash From Financing", "Net Cash From Financing Activities",
]
NET_FCF = [
    "Net Change In Cash", "Free Cash Flow", "End Cash Position", "Beginning Cash Position",
]


def build_pestle(snap: dict) -> Dict[str, List[str]]:
    sector = (snap.get("sector") or "").lower()
    industry = (snap.get("industry") or "").lower()
    country = snap.get("country") or "its primary market"
    name = snap.get("name") or snap.get("symbol")
    return {
        "Political": [
            f"Regulatory frameworks in {country} shape licensing, competition policy and capital-market rules that apply to {name}.",
            "Trade policy, tariffs and cross-border investment rules can alter cost structures for globally exposed issuers.",
            "Political stability and policy continuity influence long-horizon capital allocation decisions.",
        ],
        "Economic": [
            "Interest rates and inflation affect discount rates applied to future cash flows and the cost of debt.",
            "Consumer and industrial demand cycles in the company's end markets drive volume and pricing outcomes.",
            f"Currency movements can affect reported results when {name} earns or spends outside its reporting currency.",
        ],
        "Social": [
            "Shifts in customer preferences, demographics and brand perception influence product mix and marketing spend.",
            "Workforce availability, wage trends and talent competition affect operating costs and execution capacity.",
            "Public scrutiny of corporate behaviour can impact reputation and stakeholder trust.",
        ],
        "Technological": [
            f"Technology change within {industry or sector or 'the industry'} can obsolete products or create new growth avenues.",
            "Automation, data and software capabilities increasingly differentiate operating efficiency.",
            "Cybersecurity and digital infrastructure resilience are rising operational priorities for listed companies.",
        ],
        "Legal": [
            "Accounting standards, disclosure rules and listing requirements govern what investors can observe from public data.",
            "Litigation, intellectual-property disputes and compliance obligations can create contingent costs.",
            "Environmental and labour regulations may impose capital or operating requirements over time.",
        ],
        "Environmental": [
            "Climate policy, carbon costs and resource constraints can reshape cost curves in energy-intensive industries.",
            "Physical climate risks (extreme weather, supply disruption) may affect facilities and logistics.",
            "Investor and customer expectations around sustainability influence capital access and brand equity.",
        ],
    }


def build_recommendation(snap: dict, valuation: dict, swot: dict) -> Dict[str, Any]:
    """Heuristic Buy / Hold / Sell with 10–15 detailed synthesis points across the full report."""
    score = 0
    reasons: List[str] = []
    name = snap.get("name") or snap.get("symbol") or "The company"
    sector = snap.get("sector") or "its sector"
    industry = snap.get("industry") or "its industry"
    exchange = snap.get("exchange") or "its exchange"
    income = snap.get("income") or {}
    periods = _periods(income)
    rev = _row_series(income, "Revenue", "Total Revenue")
    ni = _row_series(income, "Net Income")
    gp = _row_series(income, "Gross Profit")
    oi = _row_series(income, "Operating Income")
    cf = snap.get("cashflow") or {}
    cfp = _periods(cf)
    fcf = _row_series(cf, "Free Cash Flow")
    ocf = _row_series(cf, "Operating Cash Flow", "Cash From Operations")
    bal = snap.get("balance") or {}
    bp = _periods(bal)
    assets = _row_series(bal, "Total Assets")
    equity = _row_series(bal, "Shareholders' Equity", "Total Equity")
    debt = _row_series(bal, "Total Debt", "Long-Term Debt")

    # 1 Profile
    reasons.append(
        f"Listing profile: {name} trades on {exchange} within {industry}"
        + (f" ({sector})" if snap.get("sector") else "")
        + f". Country context is {snap.get('country') or 'not fully disclosed on free feeds'}. "
        "Secondary lines can differ in liquidity and disclosure from a primary home-market listing."
    )

    # 2–4 Income
    if periods and rev:
        g = _yoy_growth(rev, periods)
        last_rev = _latest(rev, periods)
        if g is not None and g > 0.08:
            score += 2
            reasons.append(
                f"Top-line momentum: latest revenue is about {_fmt_num(last_rev)} with year-over-year growth of {_fmt_pct(g)}. "
                "Sustained double-digit or high-single-digit growth supports a constructive demand or pricing narrative if margins hold."
            )
        elif g is not None and g < -0.08:
            score -= 2
            reasons.append(
                f"Top-line pressure: revenue near {_fmt_num(last_rev)} with a {_fmt_pct(g)} year-over-year change signals contraction that needs an explicit recovery thesis."
            )
        else:
            reasons.append(
                f"Top-line stability: revenue near {_fmt_num(last_rev)} with limited year-over-year change "
                f"({_fmt_pct(g) if g is not None else 'n/a'}). Growth is not a primary driver of the thesis on the latest print."
            )
    else:
        reasons.append(
            "Income-statement history on free feeds is thin for revenue, so growth conclusions should be validated in primary annual and interim filings."
        )

    if periods and ni:
        last_ni = _latest(ni, periods)
        if last_ni is not None and last_ni > 0:
            score += 1
            reasons.append(
                f"Earnings quality signal: latest net income is positive at about {_fmt_num(last_ni)}, which supports earnings-based multiples and internal capital generation."
            )
        elif last_ni is not None and last_ni < 0:
            score -= 2
            reasons.append(
                f"Earnings quality signal: latest net income is negative ({_fmt_num(last_ni)}). Traditional P/E is less meaningful and payout capacity is constrained until profitability returns."
            )
    else:
        reasons.append("Net income series is incomplete on free sources; treat profitability commentary as provisional.")

    if periods and gp:
        last_gp = _latest(gp, periods)
        last_rev = _latest(rev, periods) if rev else None
        if last_gp is not None and last_rev and last_rev != 0:
            gm = last_gp / abs(last_rev)
            reasons.append(
                f"Gross-margin context: gross profit near {_fmt_num(last_gp)} implies a gross margin around {_fmt_pct(gm)} on the latest comparable figures — "
                f"a key checkpoint versus peers in {industry}."
            )
        elif last_gp is not None:
            reasons.append(f"Gross profit latest print is about {_fmt_num(last_gp)}; margin ratios should be confirmed from the full income statement.")

    if periods and oi:
        last_oi = _latest(oi, periods)
        if last_oi is not None and last_oi > 0:
            reasons.append(
                f"Operating profit is positive (about {_fmt_num(last_oi)}), indicating core operations contribute before interest and tax. Watch operating leverage if revenue accelerates."
            )
        elif last_oi is not None and last_oi < 0:
            score -= 1
            reasons.append(
                f"Operating profit is negative (about {_fmt_num(last_oi)}), so the cost base is not fully covered by operating revenue on the latest print."
            )

    # 5–6 Cash flow
    if cfp and ocf:
        last_ocf = _latest(ocf, cfp)
        if last_ocf is not None and last_ocf > 0:
            score += 1
            reasons.append(
                f"Operating cash flow is positive at about {_fmt_num(last_ocf)}, which is a stronger quality signal than accrual earnings alone when sustained."
            )
        elif last_ocf is not None and last_ocf < 0:
            score -= 1
            reasons.append(
                f"Operating cash flow is negative ({_fmt_num(last_ocf)}), raising dependence on financing or cash reserves even if accounting earnings look better."
            )
    if cfp and fcf:
        last_fcf = _latest(fcf, cfp)
        if last_fcf is not None and last_fcf > 0:
            score += 2
            reasons.append(
                f"Free cash flow is positive (about {_fmt_num(last_fcf)}), expanding flexibility for dividends, buybacks, debt reduction or reinvestment without forced dilution."
            )
        elif last_fcf is not None and last_fcf < 0:
            score -= 1
            reasons.append(
                f"Free cash flow is negative ({_fmt_num(last_fcf)}). CapEx or working-capital absorption may be outrunning operating cash generation — common in growth phases but risky if prolonged."
            )
    else:
        reasons.append("Free-cash-flow history is incomplete on free feeds; capital allocation conclusions should be checked against the cash-flow statement in filings.")

    # 7 Balance sheet
    if bp and assets:
        last_a = _latest(assets, bp)
        last_e = _latest(equity, bp) if equity else None
        last_d = _latest(debt, bp) if debt else None
        msg = f"Balance-sheet scale: total assets near {_fmt_num(last_a)}"
        if last_e is not None:
            msg += f", equity near {_fmt_num(last_e)}"
        if last_d is not None:
            msg += f", debt-related balances near {_fmt_num(last_d)}"
            if last_e and last_e != 0 and last_d is not None:
                de = last_d / abs(last_e)
                if de > 1.5:
                    score -= 1
                    msg += f" (debt/equity proxy ~ {_fmt_num(de)} — elevated leverage sensitivity)."
                else:
                    msg += f" (debt/equity proxy ~ {_fmt_num(de)})."
        reasons.append(msg + " Asset quality and off-balance commitments still require filing footnotes.")
    else:
        reasons.append("Balance-sheet line history is sparse on free sources; leverage and liquidity should be confirmed in the audited statement of financial position.")

    # 8 Valuation
    pe = snap.get("pe")
    pb = snap.get("pb")
    ps = snap.get("ps")
    if pe is not None and 0 < pe < 15:
        score += 1
        reasons.append(
            f"Valuation — trailing P/E near {_fmt_num(pe)} is relatively modest versus long-run market averages, offering more room for error if fundamentals are stable."
        )
    elif pe is not None and pe > 40:
        score -= 1
        reasons.append(
            f"Valuation — trailing P/E near {_fmt_num(pe)} is elevated and leaves limited margin of safety if growth or margins reset."
        )
    elif pe is not None and pe < 0:
        reasons.append(
            f"Valuation — trailing P/E is negative ({_fmt_num(pe)}) because of losses; price-to-sales, EV-based metrics or forward recovery scenarios are more relevant."
        )
    else:
        reasons.append(
            f"Valuation — trailing P/E is {_fmt_num(pe) if pe is not None else 'unavailable'}; cross-check price/book"
            f" ({_fmt_num(pb) if pb is not None else 'n/a'}) and price/sales ({_fmt_num(ps) if ps is not None else 'n/a'}) where disclosed."
        )

    # 9 Market risk
    beta = snap.get("beta")
    if beta is not None:
        if beta > 1.2:
            reasons.append(
                f"Market risk: beta near {_fmt_num(beta)} implies historically higher sensitivity to broad equity moves — position sizing and drawdown tolerance should reflect that."
            )
        elif beta < 0.8:
            reasons.append(
                f"Market risk: beta near {_fmt_num(beta)} points to milder historical market sensitivity, which can suit defensive allocations if the business is stable."
            )
        else:
            reasons.append(f"Market risk: beta near {_fmt_num(beta)} is roughly market-like over the measured window.")
    else:
        reasons.append("Beta is not disclosed on free feeds for this listing; systematic risk should be inferred from sector peers and realised volatility.")

    # 10–12 SWOT
    strengths = swot.get("strengths") or []
    weaknesses = swot.get("weaknesses") or []
    opportunities = swot.get("opportunities") or []
    threats = swot.get("threats") or []
    if strengths:
        score += 1 if len(strengths) >= 3 else 0
        reasons.append("Strategic strengths synthesised from public data: " + "; ".join(strengths[:3]) + ".")
    if weaknesses:
        score -= 1 if len(weaknesses) >= 3 else 0
        reasons.append("Strategic weaknesses / data gaps to monitor: " + "; ".join(weaknesses[:3]) + ".")
    if opportunities:
        reasons.append("Opportunity set: " + "; ".join(opportunities[:2]) + ".")
    if threats:
        reasons.append("Threat set: " + "; ".join(threats[:2]) + ".")

    # 13 Dividends
    dy = snap.get("dividend_yield")
    if dy is not None:
        dy_disp = f"{dy*100:.2f}%" if abs(float(dy)) <= 1.5 else f"{float(dy):.2f}%"
        reasons.append(
            f"Shareholder distributions: disclosed dividend yield is about {dy_disp}. Income usefulness depends on payout sustainability and free-cash-flow coverage, not yield alone."
        )
    else:
        reasons.append("No reliable dividend yield was available on free feeds; income-oriented investors should verify distribution policy in filings.")

    # 14 Price context
    reasons.append(
        f"Price context: last compiled price {_fmt_num(snap.get('price'))} {snap.get('currency') or ''} "
        f"with 52-week range {_fmt_num(snap.get('week52_low'))} – {_fmt_num(snap.get('week52_high'))}. "
        "A quote near the high with weakening cash flow differs fundamentally from a quote near the low with stabilising free cash flow."
    )

    # 15 Data quality / process
    reasons.append(
        "Data process: this stance merges stockanalysis.com, yfinance, free public APIs and a rule-based synthesizer. "
        "Blank cells mean the free feed omitted the field — primary exchange filings remain authoritative for audit-grade work."
    )

    # Ensure at least 10
    while len(reasons) < 10:
        reasons.append(
            f"Additional diligence item: re-read segment notes, related-party disclosures and contingent liabilities for {name} in the latest annual report before sizing a position."
        )

    if score >= 3:
        action = "BUY"
        summary = (
            f"On balance, public statement trends, cash-flow signals and valuation context for {name} lean constructive. "
            "A Buy stance here means the weight of evidence in this multi-source compilation favours ownership for investors "
            "who accept equity risk and have verified primary filings."
        )
    elif score <= -2:
        action = "SELL"
        summary = (
            f"On balance, public trends for {name} point to material pressure in earnings, cash flow or valuation. "
            "A Sell stance here means the weight of evidence argues for reducing exposure until operating and financial metrics stabilise."
        )
    else:
        action = "HOLD"
        summary = (
            f"Signals for {name} from growth, profitability, cash generation and valuation are mixed or incomplete. "
            "A Hold stance means waiting for clearer confirmation from subsequent reporting periods before increasing or exiting the position."
        )

    return {
        "action": action,
        "score": score,
        "summary": summary,
        "reasons": reasons[:15],
    }



def sorted_snapshot_stats(snap: dict) -> List[Tuple[str, str]]:
    """Non-empty stats first for the investment snapshot."""
    pairs = [
        ("Price", f"{_fmt_num(snap.get('price'))} {snap.get('currency') or ''}".strip()),
        ("Market Cap", _fmt_num(snap.get("market_cap"))),
        ("Beta", _fmt_num(snap.get("beta"))),
        ("EPS", _fmt_num(snap.get("eps"))),
        ("P/E", _fmt_num(snap.get("pe"))),
        ("Forward P/E", _fmt_num(snap.get("forward_pe"))),
        ("P/B", _fmt_num(snap.get("pb"))),
        ("P/S", _fmt_num(snap.get("ps"))),
        ("52W High", _fmt_num(snap.get("week52_high"))),
        ("52W Low", _fmt_num(snap.get("week52_low"))),
        ("Div Yield", _fmt_pct(snap.get("dividend_yield")) if snap.get("dividend_yield") is not None else "—"),
        ("Shares Out", _fmt_num(snap.get("shares_outstanding"), 0)),
        ("Sector", snap.get("sector") or "—"),
        ("Industry", snap.get("industry") or "—"),
        ("Country", snap.get("country") or "—"),
        ("Exchange", snap.get("exchange") or "—"),
    ]
    filled = [(k, v) for k, v in pairs if v not in (None, "", "—", "— —")]
    empty = [(k, v) for k, v in pairs if v in (None, "", "—", "— —")]
    return filled + empty


def _data_completeness(snap: dict, sources_raw: dict = None) -> dict:
    checks = {
        "description": bool(snap.get("description")),
        "price": snap.get("price") is not None,
        "income": bool((snap.get("income") or {}).get("rows") or (snap.get("income") or {}).get("periods")),
        "balance": bool((snap.get("balance") or {}).get("rows") or (snap.get("balance") or {}).get("periods")),
        "cashflow": bool((snap.get("cashflow") or {}).get("rows") or (snap.get("cashflow") or {}).get("periods")),
        "ratios": snap.get("pe") is not None or snap.get("pb") is not None,
        "sector": bool(snap.get("sector")),
        "industry": bool(snap.get("industry")),
    }
    filled = sum(1 for v in checks.values() if v)
    total = len(checks)
    pct = round(100.0 * filled / total, 1) if total else 0
    sources_raw = sources_raw or {}
    active = [k for k, v in sources_raw.items() if v]
    return {
        "score_pct": pct,
        "filled": filled,
        "total": total,
        "checks": checks,
        "sources_active": active,
        "sources_raw": sources_raw,
        "as_of": snap.get("collected_at") or _now_iso(),
        "currency": snap.get("currency") or "",
    }


def _price_history_series(raw: dict, snap: dict) -> dict:
    """Extract ~6–12m closes from bundle/history if present."""
    bundle = (raw or {}).get("bundle") or {}
    hist = bundle.get("history_preview") or bundle.get("history") or {}
    closes = hist.get("closes") or hist.get("Close") or []
    dates = hist.get("dates") or hist.get("Date") or []
    # yfinance-style dict of date->price
    if not closes and isinstance(hist, dict):
        try:
            items = sorted(((str(k), float(v)) for k, v in hist.items() if v is not None), key=lambda x: x[0])
            if items:
                dates = [k for k, _ in items]
                closes = [v for _, v in items]
        except Exception:
            pass
    # limit last ~126 trading days (~6m) up to ~252 (~12m)
    if len(closes) > 260:
        closes = closes[-252:]
        dates = dates[-252:] if len(dates) >= 252 else dates
    elif len(closes) > 130:
        closes = closes[-126:]
        dates = dates[-126:] if len(dates) >= 126 else dates
    return {
        "dates": dates,
        "closes": closes,
        "available": len([c for c in closes if c is not None]) >= 2,
    }


def _sensitivity_table(snap: dict) -> list:
    """Simple earnings ±10% and multiple ±2 turns illustration."""
    price = _safe_float(snap.get("price"))
    eps = _safe_float(snap.get("eps"))
    pe = _safe_float(snap.get("pe"))
    rows = []
    if eps is not None and pe is not None and eps != 0:
        for eps_mult, label in [(0.9, "EPS −10%"), (1.0, "EPS base"), (1.1, "EPS +10%")]:
            for pe_shift, plabel in [(-2, "P/E −2"), (0, "P/E base"), (2, "P/E +2")]:
                implied = eps * eps_mult * (pe + pe_shift)
                rows.append({
                    "scenario": f"{label} / {plabel}",
                    "implied_price": _fmt_num(implied),
                    "vs_spot": _fmt_pct((implied - price) / price) if price else "—",
                })
    return rows


def _peer_context(snap: dict) -> dict:
    """Lightweight same-industry peer counts from local DB if available."""
    try:
        import os, sqlite3
        base = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
        db = os.path.join(base, "data", "stocks.db")
        if not os.path.exists(db):
            return {"available": False}
        industry = snap.get("industry")
        exchange = snap.get("exchange")
        if not industry:
            return {"available": False}
        conn = sqlite3.connect(db)
        cur = conn.cursor()
        cur.execute(
            "SELECT COUNT(*) FROM stocks WHERE industry = ? AND (exchange_code = ? OR ? = '')",
            (industry, exchange or "", exchange or ""),
        )
        n = cur.fetchone()[0]
        conn.close()
        return {
            "available": True,
            "industry": industry,
            "exchange": exchange,
            "peer_count": n,
            "note": f"About {n} listings share industry '{industry}'"
            + (f" on {exchange}" if exchange else "")
            + " in the FinSight universe (counts only — not full ratio percentiles).",
        }
    except Exception as e:
        return {"available": False, "error": str(e)[:120]}


def enrich_equity_payload(report: dict) -> dict:
    """Attach chapter-ready structures to an equity report dict."""
    snap = report.get("snapshot") or {}
    income = snap.get("income") or {}
    balance = snap.get("balance") or {}
    cashflow = snap.get("cashflow") or {}
    report["income_yoy"] = matrix_with_yoy(income, income_metrics())
    report["assets_yoy"] = matrix_with_yoy(balance, ASSET_METRICS)
    report["liabilities_yoy"] = matrix_with_yoy(balance, LIABILITY_METRICS)
    report["equity_yoy"] = matrix_with_yoy(balance, EQUITY_METRICS)
    report["operating_cf_yoy"] = matrix_with_yoy(cashflow, OPERATING_CF)
    report["investing_cf_yoy"] = matrix_with_yoy(cashflow, INVESTING_CF)
    report["financing_cf_yoy"] = matrix_with_yoy(cashflow, FINANCING_CF)
    report["net_fcf_yoy"] = matrix_with_yoy(cashflow, NET_FCF)
    report["pestle"] = build_pestle(snap)
    report["recommendation"] = build_recommendation(
        snap, report.get("valuation") or {}, report.get("swot") or {}
    )
    report["snapshot_stats"] = sorted_snapshot_stats(snap)
    report["term_explain"] = TERM_EXPLAIN
    sources_raw = report.get("sources_raw") or snap.get("sources_raw") or {}
    # sources may live on raw collection — try snapshot
    if not sources_raw and isinstance(snap.get("sources"), list):
        sources_raw = {s: True for s in snap.get("sources")}
    report["completeness"] = _data_completeness(snap, sources_raw)
    report["price_history"] = report.get("price_history") or {"available": False}
    report["sensitivity"] = _sensitivity_table(snap)
    report["peers"] = _peer_context(snap)
    report["template_version"] = "1.2"
    # Field-level provenance for DA/quant users
    srcs = sources_raw or {}
    primary = "local_country_pack" if srcs.get("local_country_pack") and not srcs.get("stockanalysis") else (
        "stockanalysis" if srcs.get("stockanalysis") else (
        "yfinance" if srcs.get("yfinance") else (
        "free_api" if srcs.get("free_api") else "mixed")))
    report["field_sources"] = {
        "price": primary,
        "statements": primary,
        "ratios": primary,
        "profile": primary,
        "active_sources": [k for k,v in srcs.items() if v],
    }
    if report.get("local_pack_used") or srcs.get("local_country_pack"):
        try:
            print(f"[FinSight] report used local_country_pack for {snap.get('symbol')} / {snap.get('exchange')}")
        except Exception:
            pass
    report.pop("disclaimer", None)
    return report


# Patch builders to always enrich
_orig_build_equity = build_equity_report
_orig_build_financial = build_financial_report


def build_equity_report(symbol: str, exchange: Optional[str] = None) -> Dict[str, Any]:
    report = _orig_build_equity(symbol, exchange)
    return enrich_equity_payload(report)


def build_financial_report(symbol: str, exchange: Optional[str] = None) -> Dict[str, Any]:
    report = _orig_build_financial(symbol, exchange)
    # financial report shares chapter structures for statements/ratios/swot
    return enrich_equity_payload(report)


def build_report(kind: str, symbol: str, exchange: Optional[str] = None) -> Dict[str, Any]:
    """Equity research only — financial analysis report removed from product."""
    return build_equity_report(symbol, exchange)


def _ensure_price_history(report: dict) -> dict:
    ph = report.get("price_history") or {}
    if ph.get("available"):
        return report
    snap = report.get("snapshot") or {}
    # try bundle embedded
    # last resort: yfinance history
    try:
        import yfinance as yf
        sym = snap.get("symbol") or ""
        ex = (snap.get("exchange") or "").upper()
        ticker = sym
        if ex in ("NSE",):
            ticker = f"{sym}.NS"
        elif ex in ("BSE", "BOM"):
            ticker = f"{sym}.BO"
        t = yf.Ticker(ticker)
        df = t.history(period="1y")
        if df is not None and len(df) > 5:
            closes = [float(x) for x in df["Close"].tolist()]
            dates = [str(x)[:10] for x in df.index]
            # prefer ~6m
            if len(closes) > 140:
                closes = closes[-130:]
                dates = dates[-130:]
            report["price_history"] = {"dates": dates, "closes": closes, "available": True}
    except Exception:
        report["price_history"] = {"available": False}
    return report

_prev_enrich = enrich_equity_payload

def enrich_equity_payload(report: dict) -> dict:
    report = _prev_enrich(report)
    return _ensure_price_history(report)



def clear_report_cache() -> int:
    """Drop in-memory report cache (call after pack rebuild)."""
    n = len(_REPORT_CACHE)
    _REPORT_CACHE.clear()
    return n
