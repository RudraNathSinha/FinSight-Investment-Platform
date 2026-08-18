"""
StockAnalysis.com scraper — fallback when yfinance has no data.
Uses random sleep between requests. Caches successful pulls in SQLite.
"""
from __future__ import annotations

import json
import os
import random
import re
import sqlite3
import time
import urllib.error
import urllib.request
from html import unescape
from typing import Any, Dict, List, Optional, Tuple

UA = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
    "AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/122.0.0.0 Safari/537.36"
)

BASE = "https://stockanalysis.com"

# Our exchange_code → stockanalysis path segment
EXCHANGE_PATH = {
    "NYSE": "stocks", "NASDAQ": "stocks", "AMEX": "stocks",
    "OTC": "otc",
    "NSE": "nse", "BOM": "nse",  # BOM often listed under NSE on SA; try nse first
    "HKG": "hkg", "HKG_1": "hkg",
    "TYO": "tyo", "TSE": "tyo",
    "ASX": "asx",
    "FRA": "fra", "ETR": "etr",
    "KRX": "krx", "KOSDAQ": "krx",
    "TSX": "tsx", "TSXV": "tsxv",
    "LON": "stocks", "LSE": "stocks", "AIM": "stocks",  # many UK ADRs under /stocks/
    "BVMF": "bvmf", "B3": "bvmf",
    "BIT": "bit", "EPA": "epa", "AMS": "ams", "BME": "bme",
    "SWX": "swx", "OSL": "osl", "STO": "sto", "HEL": "hel", "CPH": "cph",
    "WSE": "wse", "BKK": "set", "IDX": "idx", "KLSE": "klse", "SGX": "sgx",
    "TPE": "tpe", "TPEX": "tpex",
    "HOSE": "hose", "HNX": "hnx", "PSE": "pse", "JSE": "jse",
    "IST": "ist", "TLV": "tlv", "BCBA": "bcba", "BMV": "bmv",
    "NZE": "nze", "VIE": "vie", "BVB": "bvb",
    "TADAWUL": "tadawul", "DFM": "dfm", "ADX": "adx",
    "PSX": "psx", "EGX": "egx",
    "UKR": "ukr", "UX": "ukr", "PFTS": "ukr",
    "RSE": "riga", "VSE": "vse", "TAL": "tal",
    "BUD": "bud", "PRA": "pra", "WAR": "wse",
    "ATH": "ath", "IST": "ist", "SAU": "tadawul",
    "JSE": "jse", "CSE": "cse", "COL": "cse",
    "DSE": "dse", "KSE": "psx", "MSM": "msm",
    "QSE": "qse", "BAX": "bax", "ASE": "ase",
    "BELEX": "bel", "LJSE": "lje", "ZSE": "zse",
    "BRVM": "brvm", "GSE": "gse", "NSE_NG": "ng",
    "NASE": "nse", "USE": "use", "LUSE": "luse",
    "MSE": "mse", "BSE_BW": "bse", "ZSE_ZW": "zse",
}

# Sleep bounds (seconds) — random, not fixed
SLEEP_MIN = 0.6
SLEEP_MAX = 1.8

_CACHE_DB = None


def _cache_path() -> str:
    base = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    return os.path.join(base, "data", "scrape_cache.db")


def _init_cache():
    global _CACHE_DB
    path = _cache_path()
    os.makedirs(os.path.dirname(path), exist_ok=True)
    conn = sqlite3.connect(path)
    conn.execute("""
        CREATE TABLE IF NOT EXISTS scrape_cache (
            key TEXT PRIMARY KEY,
            payload TEXT NOT NULL,
            fetched_at REAL NOT NULL
        )
    """)
    conn.commit()
    return conn


def _cache_get(key: str, max_age_hours: float = 24.0) -> Optional[dict]:
    try:
        conn = _init_cache()
        row = conn.execute(
            "SELECT payload, fetched_at FROM scrape_cache WHERE key=?", (key,)
        ).fetchone()
        conn.close()
        if not row:
            return None
        payload, ts = row
        if time.time() - ts > max_age_hours * 3600:
            return None
        return json.loads(payload)
    except Exception:
        return None


def _cache_set(key: str, data: dict):
    try:
        conn = _init_cache()
        conn.execute(
            "INSERT OR REPLACE INTO scrape_cache(key, payload, fetched_at) VALUES (?,?,?)",
            (key, json.dumps(data), time.time()),
        )
        conn.commit()
        conn.close()
    except Exception:
        pass


def random_sleep():
    time.sleep(random.uniform(SLEEP_MIN, SLEEP_MAX))


def fetch_html(url: str) -> Optional[str]:
    req = urllib.request.Request(
        url,
        headers={
            "User-Agent": UA,
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            "Accept-Language": "en-US,en;q=0.9",
            "Referer": "https://stockanalysis.com/",
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=25) as r:
            if r.status >= 400:
                return None
            return r.read().decode("utf-8", errors="ignore")
    except urllib.error.HTTPError:
        return None
    except Exception:
        return None


def strip_tags(s: str) -> str:
    s = re.sub(r"<script[^>]*>.*?</script>", "", s, flags=re.S | re.I)
    s = re.sub(r"<style[^>]*>.*?</style>", "", s, flags=re.S | re.I)
    s = re.sub(r"<[^>]+>", " ", s)
    s = unescape(s)
    return re.sub(r"\s+", " ", s).strip()


def parse_tables(html: str) -> List[List[List[str]]]:
    tables = re.findall(r"<table[^>]*>(.*?)</table>", html, re.S | re.I)
    out = []
    for t in tables:
        rows = re.findall(r"<tr[^>]*>(.*?)</tr>", t, re.S | re.I)
        parsed = []
        for row in rows:
            cells = re.findall(r"<t[hd][^>]*>(.*?)</t[hd]>", row, re.S | re.I)
            cells = [strip_tags(c) for c in cells]
            if any(cells):
                parsed.append(cells)
        if parsed:
            out.append(parsed)
    return out


def table_to_dict(table: List[List[str]]) -> Dict[str, Any]:
    """Convert first financial table: row0 = headers (periods), subsequent rows = metrics."""
    if not table or len(table) < 2:
        return {}
    headers = table[0]
    # Prefer Fiscal Year row as columns
    periods = headers[1:] if len(headers) > 1 else headers
    rows = {}
    for row in table[1:]:
        if not row:
            continue
        name = row[0]
        vals = row[1:]
        # align
        entry = {}
        for i, p in enumerate(periods):
            entry[p] = vals[i] if i < len(vals) else None
        rows[name] = entry
    return {"periods": periods, "rows": rows}


def parse_kv_table(html: str) -> Dict[str, str]:
    """Statistics-style key/value from consecutive <td> cells."""
    tds = re.findall(r"<td[^>]*>(.*?)</td>", html, re.S | re.I)
    cells = [strip_tags(x) for x in tds]
    cells = [c for c in cells if c]
    out = {}
    for i in range(0, len(cells) - 1, 2):
        k, v = cells[i], cells[i + 1]
        if k and v and len(k) < 80:
            out[k] = v
    return out


def build_candidate_urls(symbol: str, exchange_code: Optional[str]) -> List[Tuple[str, str]]:
    """
    Return list of (base_path, label) candidates.
    base_path is like /quote/otc/SSNLF or /stocks/AAPL (no trailing slash section).
    """
    sym = (symbol or "").strip().upper()
    code = (exchange_code or "").replace("_1", "").upper()
    candidates = []

    path = EXCHANGE_PATH.get(code)
    if path == "stocks":
        candidates.append((f"/stocks/{sym.lower()}", "stocks"))
    elif path:
        candidates.append((f"/quote/{path}/{sym}", f"quote/{path}"))

    # Always try common fallbacks
    if code in ("NYSE", "NASDAQ", "AMEX", "") or not code:
        candidates.append((f"/stocks/{sym.lower()}", "stocks"))
    if code == "OTC" or not code:
        candidates.append((f"/quote/otc/{sym}", "otc"))
    # Generic tries for international
    for p in ("nse", "hkg", "tyo", "asx", "fra", "etr", "tsx", "krx", "sgx", "lon",
              "ukr", "wse", "bme", "bit", "ams", "osl", "sto", "hel", "cph",
              "ist", "tlv", "jse", "set", "idx", "klse", "tpe", "hose", "bvmf",
              "bcba", "bmv", "tadawul", "dfm", "adx", "psx", "egx", "otc"):
        candidates.append((f"/quote/{p}/{sym}", p))

    # Deduplicate preserving order
    seen = set()
    uniq = []
    for c in candidates:
        if c[0] not in seen:
            seen.add(c[0])
            uniq.append(c)
    return uniq


def resolve_base(symbol: str, exchange_code: Optional[str] = None) -> Optional[str]:
    """Find a working stockanalysis base path for this symbol."""
    cache_key = f"resolve:{symbol}:{exchange_code or ''}"
    cached = _cache_get(cache_key, max_age_hours=72)
    if cached and cached.get("base"):
        return cached["base"]

    for base, label in build_candidate_urls(symbol, exchange_code):
        url = BASE + base + "/"
        random_sleep()
        html = fetch_html(url)
        if not html or len(html) < 8000:
            continue
        title = re.search(r"<title>([^<]+)</title>", html, re.I)
        t = (title.group(1) if title else "").lower()
        if "not found" in t or "404" in t:
            continue
        _cache_set(cache_key, {"base": base})
        return base
    return None


def scrape_section(base: str, section: str) -> Optional[str]:
    """section examples: '', 'financials/', 'financials/income-statement/', 'statistics/', 'company/'"""
    url = f"{BASE}{base}/{section}".replace("//", "/").replace("https:/", "https://")
    # fix accidental double path
    url = BASE + base + "/" + section.lstrip("/")
    random_sleep()
    return fetch_html(url)


def scrape_stock(symbol: str, exchange_code: Optional[str] = None, sections: Optional[List[str]] = None) -> Dict[str, Any]:
    """
    Full scrape for a stock. Returns structured dict.
    sections default: overview, income, balance, cashflow, ratios, statistics, company
    """
    symbol = (symbol or "").strip().upper()
    cache_key = f"full:{symbol}:{exchange_code or ''}"
    cached = _cache_get(cache_key, max_age_hours=12)
    if cached and cached.get("available"):
        cached["from_cache"] = True
        return cached

    base = resolve_base(symbol, exchange_code)
    if not base:
        return {"available": False, "source": "stockanalysis", "error": "Symbol not found on stockanalysis.com"}

    want = sections or [
        "overview", "income", "balance", "cashflow", "ratios", "statistics", "company"
    ]
    result: Dict[str, Any] = {
        "available": True,
        "source": "stockanalysis",
        "symbol": symbol,
        "exchange_code": exchange_code,
        "base_path": base,
        "url": f"{BASE}{base}/",
    }

    # Overview / financials summary
    if "overview" in want:
        html = scrape_section(base, "")
        if html:
            result["overview_stats"] = parse_kv_table(html)
            # price-ish from title area
            m = re.search(r"<title>([^<]+)</title>", html, re.I)
            result["page_title"] = m.group(1) if m else None

    if "statistics" in want:
        html = scrape_section(base, "statistics/")
        if html:
            result["statistics"] = parse_kv_table(html)

    if "company" in want:
        html = scrape_section(base, "company/")
        if html:
            profile = parse_kv_table(html)
            # try description
            m = re.search(r'(?is)<div[^>]*class="[^"]*prose[^"]*"[^>]*>(.*?)</div>', html)
            if m:
                profile["description"] = strip_tags(m.group(1))[:2000]
            # broader text search for sector/industry
            for label in ("Sector", "Industry", "Country", "CEO", "Employees", "IPO Date", "Website", "Founded"):
                if label not in profile:
                    mm = re.search(rf"(?is){re.escape(label)}\s*</[^>]+>\s*<[^>]+>([^<]+)", html)
                    if mm:
                        profile[label] = mm.group(1).strip()
            result["company"] = profile

    # Financial statement pages
    fin_map = {
        "income": "financials/income-statement/",
        "balance": "financials/balance-sheet/",
        "cashflow": "financials/cash-flow-statement/",
        "ratios": "financials/ratios/",
        "financials": "financials/",
    }
    for key, path in fin_map.items():
        if key not in want and key != "financials":
            # if user asked income/balance/cashflow specifically
            if key not in ("income", "balance", "cashflow", "ratios"):
                continue
            if key not in want:
                continue
        if key not in want:
            continue
        html = scrape_section(base, path)
        if not html:
            continue
        tables = parse_tables(html)
        if not tables:
            continue
        # Use largest table (main statement)
        best = max(tables, key=lambda t: len(t))
        result[key] = table_to_dict(best)
        result[f"{key}_raw_rows"] = len(best)

    _cache_set(cache_key, result)
    result["from_cache"] = False
    return result


if __name__ == "__main__":
    # Quick self-test
    import sys
    sym = sys.argv[1] if len(sys.argv) > 1 else "SSNLF"
    ex = sys.argv[2] if len(sys.argv) > 2 else "OTC"
    print("Scraping", sym, ex)
    data = scrape_stock(sym, ex, sections=["statistics", "income", "company"])
    print("available", data.get("available"), "base", data.get("base_path"))
    if data.get("statistics"):
        print("stats sample", list(data["statistics"].items())[:8])
    if data.get("income"):
        rows = data["income"].get("rows", {})
        print("income metrics", list(rows.keys())[:12])
        if "Revenue" in rows:
            print("Revenue", rows["Revenue"])
    if data.get("company"):
        print("company keys", list(data["company"].keys())[:10])
