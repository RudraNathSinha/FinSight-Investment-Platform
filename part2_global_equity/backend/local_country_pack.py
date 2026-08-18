"""
Last-resort local country pack loader.

When live scrape / yfinance / free APIs return no usable data, FinSight may
fall back to pre-uploaded country JSON packs under data/country_packs/.

These packs are offline scrapes (per-country bundles of stockanalysis-style
records). They must ONLY be used after every live source has failed or is empty.
"""
from __future__ import annotations

import json
import os
import re
import threading
from typing import Any, Dict, List, Optional, Tuple

_LOCK = threading.Lock()
_INDEX: Optional[Dict[str, Tuple[str, str]]] = None  # key -> (pack_path, stock_file_key)
_PACK_CACHE: Dict[str, dict] = {}

# Prefer project data/country_packs; also accept sibling artifacts packs if present
def _pack_dirs() -> List[str]:
    """Only the project country_packs folder (canonical location)."""
    here = os.path.dirname(os.path.abspath(__file__))
    base = os.path.abspath(os.path.join(here, ".."))
    primary = os.path.join(base, "data", "country_packs")
    out = []
    if os.path.isdir(primary):
        out.append(primary)
    return out


def _norm_sym(s: str) -> str:
    return re.sub(r"\s+", "", (s or "").strip().upper())


def _norm_ex(s: str) -> str:
    return (s or "").strip().upper()


def _parse_number(raw: Any) -> Optional[float]:
    if raw is None:
        return None
    if isinstance(raw, (int, float)):
        return float(raw)
    s = str(raw).strip()
    if not s or s.lower() in ("n/a", "na", "-", "—", "none"):
        return None
    # strip trailing growth annotations like "349.99M-14.8%"
    s = re.split(r"(?<=\d)(?=[+-]\d)", s)[0]
    s = s.replace(",", "").replace("%", "").strip()
    mult = 1.0
    if s[-1:].upper() == "T":
        mult = 1e12
        s = s[:-1]
    elif s[-1:].upper() == "B":
        mult = 1e9
        s = s[:-1]
    elif s[-1:].upper() == "M":
        mult = 1e6
        s = s[:-1]
    elif s[-1:].upper() == "K":
        mult = 1e3
        s = s[:-1]
    try:
        return float(s) * mult
    except Exception:
        m = re.search(r"-?\d+(?:\.\d+)?", s)
        if m:
            try:
                return float(m.group(0)) * mult
            except Exception:
                return None
    return None



def _clean_metric_label(label: str) -> str:
    label = (label or "").strip()
    if not label:
        return label
    # Split camel mash: "NetIncome" -> "Net Income"
    label = re.sub(r"([a-z])([A-Z])", r"\1 \2", label)
    # Collapse duplicated phrases: "Revenue Revenue Growth" -> "Revenue Growth"
    parts = label.split()
    out = []
    for p in parts:
        if out and out[-1].lower() == p.lower():
            continue
        out.append(p)
    label = " ".join(out)
    label = re.sub(r"\s+", " ", label).strip()
    return label


def _build_index() -> Dict[str, Tuple[str, str]]:
    """Map lookup keys to (pack_file_path, inner_stock_key)."""
    index: Dict[str, Tuple[str, str]] = {}
    skip_names = {"stocks_universe.json", "otc.json"}
    for d in _pack_dirs():
        try:
            names = os.listdir(d)
        except Exception:
            continue
        for name in names:
            if not name.lower().endswith(".json"):
                continue
            if name.lower() in skip_names:
                continue
            path = os.path.join(d, name)
            if not os.path.isfile(path):
                continue
            # Prefer dedicated country_packs folder files over loose artifacts
            try:
                with open(path, "r", encoding="utf-8") as f:
                    data = json.load(f)
            except Exception:
                continue
            sources = data.get("source_files") if isinstance(data, dict) else None
            if not isinstance(sources, dict):
                continue
            for stock_key, stock in sources.items():
                if not isinstance(stock, dict):
                    continue
                sym = _norm_sym(stock.get("symbol") or "")
                ex = _norm_ex(stock.get("exchange_code") or "")
                if not sym:
                    # try from filename BAX_ABC.json
                    base = os.path.splitext(str(stock_key))[0]
                    parts = base.split("_", 1)
                    if len(parts) == 2:
                        ex = ex or _norm_ex(parts[0])
                        sym = _norm_sym(parts[1])
                if not sym:
                    continue
                # primary: SYMBOL|EXCHANGE
                if ex:
                    index[f"{sym}|{ex}"] = (path, stock_key)
                # secondary: SYMBOL only (first wins; country_packs preferred by dir order)
                index.setdefault(f"{sym}|", (path, stock_key))
                # also bare symbol
                index.setdefault(sym, (path, stock_key))
    return index


def _get_index() -> Dict[str, Tuple[str, str]]:
    global _INDEX
    if _INDEX is not None:
        return _INDEX
    with _LOCK:
        if _INDEX is None:
            _INDEX = _build_index()
    return _INDEX


def rebuild_index() -> int:
    """Force re-scan of pack directories. Returns number of keyed entries."""
    global _INDEX, _PACK_CACHE
    with _LOCK:
        _INDEX = _build_index()
        _PACK_CACHE = {}
        return len(_INDEX)


def _load_pack(path: str) -> dict:
    if path in _PACK_CACHE:
        return _PACK_CACHE[path]
    with _LOCK:
        if path in _PACK_CACHE:
            return _PACK_CACHE[path]
        with open(path, "r", encoding="utf-8") as f:
            data = json.load(f)
        # simple LRU-ish: keep last 8 packs
        if len(_PACK_CACHE) >= 8:
            try:
                _PACK_CACHE.pop(next(iter(_PACK_CACHE)))
            except Exception:
                _PACK_CACHE.clear()
        _PACK_CACHE[path] = data
        return data


def lookup_local_stock(symbol: str, exchange: Optional[str] = None) -> Optional[dict]:
    """
    Return raw pack stock dict or None.
    Lookup order: SYMBOL|EXCHANGE → SYMBOL|
    """
    sym = _norm_sym(symbol)
    ex = _norm_ex(exchange or "")
    if not sym:
        return None
    idx = _get_index()
    hit = None
    if ex and f"{sym}|{ex}" in idx:
        hit = idx[f"{sym}|{ex}"]
    elif f"{sym}|" in idx:
        hit = idx[f"{sym}|"]
    elif sym in idx:
        hit = idx[sym]
    if not hit:
        return None
    path, stock_key = hit
    pack = _load_pack(path)
    sources = pack.get("source_files") or {}
    stock = sources.get(stock_key)
    if not isinstance(stock, dict):
        return None
    out = dict(stock)
    out["_pack_path"] = path
    out["_pack_key"] = stock_key
    out["_source"] = "local_country_pack"
    return out


def _table_to_matrix(tables: Any) -> dict:
    """Convert pack statement tables → {periods:[], rows:{metric:{period: value}}}."""
    if not tables:
        return {"periods": [], "rows": {}}
    # Prefer the widest table with Fiscal Year style headers
    best = None
    if isinstance(tables, list):
        for t in tables:
            if isinstance(t, dict) and t.get("headers") and t.get("rows"):
                if best is None or len(t.get("headers") or []) > len(best.get("headers") or []):
                    best = t
    elif isinstance(tables, dict):
        best = tables
    if not best:
        return {"periods": [], "rows": {}}
    headers = [str(h) for h in (best.get("headers") or [])]
    # periods: skip first header (metric label)
    periods = []
    for h in headers[1:]:
        # normalize "FY 2024" / "TTM"
        h2 = h.strip()
        if "Period Ending" in h2 or "Jun " in h2 and "FY" not in h2:
            # secondary header row mixed into headers — skip noisy ones
            if re.search(r"FY\s*\d{4}", h2):
                m = re.search(r"FY\s*(\d{4})", h2)
                periods.append(m.group(1) if m else h2)
            elif h2.upper().startswith("TTM"):
                periods.append("TTM")
            else:
                continue
        else:
            m = re.search(r"(FY\s*)?(\d{4})", h2)
            if h2.upper().startswith("TTM"):
                periods.append("TTM")
            elif m:
                periods.append(m.group(2))
            else:
                periods.append(h2[:16])
    # de-dupe periods while preserving order; align by index with data columns
    # Simpler approach: use column index positions from first data row length
    rows_out: Dict[str, Dict[str, Any]] = {}
    for row in best.get("rows") or []:
        if not row or not isinstance(row, list):
            continue
        label = _clean_metric_label(str(row[0]))
        vals = row[1:]
        # build period list from headers if lengths match
        use_periods = periods[: len(vals)] if periods else [f"P{i}" for i in range(len(vals))]
        if len(use_periods) < len(vals):
            use_periods = use_periods + [f"P{i}" for i in range(len(use_periods), len(vals))]
        series: Dict[str, Any] = {}
        for i, v in enumerate(vals):
            num = _parse_number(v)
            series[use_periods[i]] = num if num is not None else v
        # skip pure growth-only clutter if empty
        if label:
            rows_out[label] = series
    # unique periods from all series keys in order of first row
    period_order: List[str] = []
    for series in rows_out.values():
        for k in series.keys():
            if k not in period_order:
                period_order.append(k)
    return {"periods": period_order, "rows": rows_out}


def _key_stats_map(overview: dict) -> dict:
    ks = overview.get("key_stats") or {}
    if not isinstance(ks, dict):
        return {}
    out = {}
    for k, v in ks.items():
        out[str(k)] = v
        num = _parse_number(v)
        if num is not None:
            out[str(k) + "__num"] = num
    return out


def pack_stock_to_scrape(stock: dict) -> dict:
    """
    Normalize a local pack stock record into the scrape-like shape
    expected by report_engine.build_snapshot / statement matrices.
    """
    sections = stock.get("sections") or {}
    overview = sections.get("overview") or {}
    profile = sections.get("profile") or {}
    stats = sections.get("statistics") or {}
    ratios = sections.get("ratios") or {}
    income = sections.get("income_statement") or sections.get("income") or {}
    balance = sections.get("balance_sheet") or sections.get("balance") or {}
    cashflow = sections.get("cash_flow") or sections.get("cashflow") or {}

    key_stats = _key_stats_map(overview)
    company_details = profile.get("company_details") or {}
    if not isinstance(company_details, dict):
        company_details = {}

    price = _parse_number(overview.get("price"))
    pe = _parse_number(key_stats.get("PE Ratio"))
    eps = _parse_number(key_stats.get("EPS"))
    mcap = _parse_number(key_stats.get("Market Cap"))
    div = key_stats.get("Dividend")
    div_yield = None
    if div is not None:
        # formats like "0.01 (9.17%)"
        m = re.search(r"\(([-+]?\d+(?:\.\d+)?)%\)", str(div))
        if m:
            div_yield = float(m.group(1)) / 100.0

    income_mx = _table_to_matrix(income.get("tables"))
    balance_mx = _table_to_matrix(balance.get("tables") if isinstance(balance, dict) else None)
    cash_mx = _table_to_matrix(cashflow.get("tables") if isinstance(cashflow, dict) else None)
    ratios_mx = _table_to_matrix(ratios.get("tables") if isinstance(ratios, dict) else None)

    return {
        "available": True,
        "source": "local_country_pack",
        "symbol": stock.get("symbol"),
        "exchange_code": stock.get("exchange_code"),
        "url": stock.get("main_url") or overview.get("url"),
        "company": {
            "name": stock.get("company_name") or overview.get("company_name"),
            "description": profile.get("description") or "",
            "country": stock.get("country") or company_details.get("Country"),
            "sector": company_details.get("Sector"),
            "industry": company_details.get("Industry"),
            "ceo": company_details.get("CEO"),
            "founded": company_details.get("Founded"),
            "website": company_details.get("Website"),
            "details": company_details,
        },
        "overview_stats": key_stats,
        "statistics": key_stats,
        "price": price,
        "market_cap": mcap,
        "pe": pe,
        "eps": eps,
        "dividend_yield": div_yield,
        "income": income_mx,
        "balance": balance_mx,
        "cashflow": cash_mx,
        "ratios": ratios_mx,
        "profile": profile,
        "exchange_name": stock.get("exchange_name"),
        "country": stock.get("country"),
        "scraped_at": stock.get("scraped_at"),
        "raw_pack_key": stock.get("_pack_key"),
    }


def fetch_local_country_pack(symbol: str, exchange: Optional[str] = None) -> dict:
    """
    Public API for multi-source / report engine.
    Returns scrape-compatible dict or {available: False}.
    """
    stock = lookup_local_stock(symbol, exchange)
    if not stock:
        return {"available": False, "source": "local_country_pack", "error": "not_in_packs"}
    try:
        return pack_stock_to_scrape(stock)
    except Exception as e:
        return {"available": False, "source": "local_country_pack", "error": str(e)[:200]}


def pack_stats() -> dict:
    idx = _get_index()
    packs = set()
    for path, _ in idx.values():
        packs.add(os.path.basename(path))
    return {
        "index_entries": len(idx),
        "pack_files": sorted(packs),
        "pack_dirs": _pack_dirs(),
    }
