"""
FinSight API v3 — Global Equity Intelligence
"""
from fastapi import FastAPI, Query, HTTPException
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, JSONResponse
from fastapi.middleware.cors import CORSMiddleware
import sqlite3, os, math, time, random
from typing import Optional, List, Any
try:
    from backend.country_norm import normalize_country, country_to_iso3, ranking_iso_to_canonical, RANKING_NAME_TO_CANONICAL
except Exception:
    try:
        from country_norm import normalize_country, country_to_iso3, ranking_iso_to_canonical, RANKING_NAME_TO_CANONICAL
    except Exception:
        def normalize_country(n): return n
        def country_to_iso3(n): return None
        def ranking_iso_to_canonical(i, m): return i
        RANKING_NAME_TO_CANONICAL = {}

try:
    from backend.multi_source import fetch_all_parallel
except Exception:
    try:
        from multi_source import fetch_all_parallel
    except Exception:
        fetch_all_parallel = None



try:
    import yfinance as yf
    import pandas as pd
    YF_AVAILABLE = True
except ImportError:
    YF_AVAILABLE = False

try:
    from backend.scraper_stockanalysis import scrape_stock as sa_scrape
    SA_AVAILABLE = True
except Exception:
    try:
        from scraper_stockanalysis import scrape_stock as sa_scrape
        SA_AVAILABLE = True
    except Exception:
        SA_AVAILABLE = False
        sa_scrape = None

# Unified platform root = FinSigh_tInvestmentPlatform/
_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
# Part 2 (Global Equity) lives under part2_global_equity/
_PART2 = os.path.join(_ROOT, "part2_global_equity")
_BASE = _PART2  # keep _BASE for any legacy relative paths inside this file
DB_PATH = os.path.join(_PART2, "data", "stocks.db")
FRONTEND = os.path.join(_PART2, "frontend")
FINSIGHT_ROOT = _ROOT
LANDING_DIR = os.path.join(_ROOT, "landing")
if not os.path.isdir(LANDING_DIR):
    LANDING_DIR = os.path.join(FRONTEND, "_landing")
PART1_DIR = os.path.join(_ROOT, "part1_country_ranking")
PART3_DIR = os.path.join(_ROOT, "part3_sector_industry")
PART3_URL = os.environ.get("FINSIGHT_PART3_URL", "/sector")  # same-origin relative
RANKING_DIR = os.path.join(_PART2, "data", "country_ranking")

# ISO3 <-> name maps (loaded once)
_ISO_NAME = {}
_NAME_ISO = {}
def _load_iso_maps():
    global _ISO_NAME, _NAME_ISO
    path = os.path.join(RANKING_DIR, "countries_with_stock_exchange.json")
    if not os.path.exists(path):
        return
    import json
    data = json.loads(open(path).read())
    _ISO_NAME = {c["iso3"]: c["country_name"] for c in data}
    _NAME_ISO = {c["country_name"]: c["iso3"] for c in data}
    # aliases
    aliases = {
        "United States": "USA", "USA": "USA", "US": "USA",
        "United Kingdom": "GBR", "UK": "GBR",
        "South Korea": "KOR", "Korea": "KOR",
        "Russia": "RUS", "Czech Republic": "CZE",
        "United Arab Emirates": "ARE", "UAE": "ARE",
        "Hong Kong": "HKG", "Taiwan": "TWN",
        "Vietnam": "VNM", "Iran": "IRN",
    }
    for k,v in aliases.items():
        if v in _ISO_NAME:
            _NAME_ISO[k] = v
_load_iso_maps()

BLOCK_NAMES = {
    1: "Macroeconomic Strength",
    2: "Fiscal & Debt Health",
    3: "Monetary & Financial Stability",
    4: "Trade & External Position",
    5: "Market Depth & Liquidity",
    6: "Institutional Quality",
    7: "Business Environment",
    8: "Human Capital & Demographics",
    9: "Innovation & Technology",
    10: "Natural Resources & Environment",
    11: "Infrastructure & Connectivity",
}

app = FastAPI(title="FinSight API", version="3.0.0")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_credentials=True, allow_methods=["*"], allow_headers=["*"])

# =============================================================================
# REPORT ROUTES — INLINE (always on this app; no separate router import)
# =============================================================================
def _report_builders():
    """Lazy-import report engine. Returns (build_report, render_html, build_pdf, error)."""
    try:
        from backend.report_engine import build_report
        from backend.report_html import render_report_html
        from backend.report_pdf import build_pdf
        return build_report, render_report_html, build_pdf, None
    except Exception as e1:
        try:
            from report_engine import build_report
            from report_html import render_report_html
            from report_pdf import build_pdf
            return build_report, render_report_html, build_pdf, None
        except Exception as e2:
            return None, None, None, f"{e1} | {e2}"


def _report_kind(k):
    return "equity"  # equity research only


@app.get("/api/report-ping")
def report_ping():
    """Always registered. Verify the running server has report code."""
    _, _, _, err = _report_builders()
    pack = {}
    try:
        try:
            from backend.local_country_pack import pack_stats
        except Exception:
            from local_country_pack import pack_stats
        pack = pack_stats()
    except Exception as e:
        pack = {"error": str(e)[:160]}
    return {
        "ok": True,
        "report_engine": err is None,
        "error": err,
        "local_country_packs": pack,
        "endpoints": [
            "/api/report-ping",
            "/api/reports/html?symbol=TSLA&kind=equity&exchange=NASDAQ",
            "/api/reports/pdf?symbol=TSLA&kind=equity&exchange=NASDAQ",
            "/api/reports/json?symbol=TSLA&kind=equity&exchange=NASDAQ",
        ],
    }


@app.get("/api/reports/html")
def reports_html_endpoint(
    symbol: str = Query(..., description="Ticker"),
    kind: str = Query("equity"),
    exchange: Optional[str] = None,
):
    from fastapi.responses import HTMLResponse
    build_report, render_html, _, err = _report_builders()
    if err or not build_report:
        return HTMLResponse(
            f"<html><body style='font-family:sans-serif;padding:24px'>"
            f"<h1>Report engine unavailable</h1><pre>{err}</pre>"
            f"<p>Ensure backend/report_engine.py, report_html.py, report_pdf.py exist.</p>"
            f"</body></html>",
            status_code=500,
        )
    try:
        report = build_report(_report_kind(kind), symbol.strip().upper(), (exchange or "").strip() or None)
        return HTMLResponse(render_html(report))
    except Exception as e:
        return HTMLResponse(
            f"<html><body style='font-family:sans-serif;padding:24px'>"
            f"<h1>Report generation failed</h1><pre>{e}</pre></body></html>",
            status_code=500,
        )


@app.get("/api/reports/pdf")
def reports_pdf_endpoint(
    symbol: str = Query(..., description="Ticker"),
    kind: str = Query("equity"),
    exchange: Optional[str] = None,
):
    from fastapi.responses import Response
    build_report, _, build_pdf, err = _report_builders()
    if err or not build_report:
        return JSONResponse({"available": False, "error": str(err)}, status_code=500)
    try:
        k = _report_kind(kind)
        sym = symbol.strip().upper()
        report = build_report(k, sym, (exchange or "").strip() or None)
        pdf_bytes = build_pdf(report)
        fname = f"FinSight_{k}_{sym}_{(exchange or 'X').upper()}.pdf"
        return Response(
            content=pdf_bytes,
            media_type="application/pdf",
            headers={"Content-Disposition": f'attachment; filename="{fname}"'},
        )
    except Exception as e:
        return JSONResponse({"available": False, "error": str(e)[:500]}, status_code=500)


@app.get("/api/reports/json")
def reports_json_endpoint(
    symbol: str = Query(..., description="Ticker"),
    kind: str = Query("equity"),
    exchange: Optional[str] = None,
):
    build_report, _, _, err = _report_builders()
    if err or not build_report:
        return JSONResponse({"available": False, "error": str(err)}, status_code=500)
    try:
        report = build_report(_report_kind(kind), symbol.strip().upper(), (exchange or "").strip() or None)
        report["available"] = True
        return report
    except Exception as e:
        return JSONResponse({"available": False, "error": str(e)[:500]}, status_code=500)


@app.get("/api/report/{kind}/{symbol}/html")
def report_html_path(kind: str, symbol: str, exchange: Optional[str] = None):
    return reports_html_endpoint(symbol=symbol, kind=kind, exchange=exchange)


@app.get("/api/report/{kind}/{symbol}/pdf")
def report_pdf_path(kind: str, symbol: str, exchange: Optional[str] = None):
    return reports_pdf_endpoint(symbol=symbol, kind=kind, exchange=exchange)


@app.get("/api/report/{kind}/{symbol}")
def report_json_path(kind: str, symbol: str, exchange: Optional[str] = None):
    return reports_json_endpoint(symbol=symbol, kind=kind, exchange=exchange)


print("[FinSight] inline report routes registered: /api/report-ping /api/reports/html|pdf|json")

# --- 11 standard global sectors ---
# --- 11 standard global sectors ---
STANDARD_SECTORS = [
    "Communication Services", "Consumer Discretionary", "Consumer Staples", "Energy",
    "Financials", "Health Care", "Industrials", "Information Technology", "Materials",
    "Real Estate", "Utilities",
]
_SECTOR_MAP = {
    "communication services": "Communication Services",
    "communications": "Communication Services",
    "telecom": "Communication Services",
    "telecommunications": "Communication Services",
    "media": "Communication Services",
    "entertainment": "Communication Services",
    "consumer discretionary": "Consumer Discretionary",
    "consumer cyclical": "Consumer Discretionary",
    "cyclical consumer goods": "Consumer Discretionary",
    "academic & educational services": "Consumer Discretionary",
    "academic and educational services": "Consumer Discretionary",
    "services": "Consumer Discretionary",
    "distributor": "Consumer Discretionary",
    "distributors": "Consumer Discretionary",
    "leisure products": "Consumer Discretionary",
    "consumer staples": "Consumer Staples",
    "consumer non-cyclical": "Consumer Staples",
    "consumer non-cyclicals": "Consumer Staples",
    "consumer non cyclical": "Consumer Staples",
    "consumer noncyclical": "Consumer Staples",
    "defensive": "Consumer Staples",
    "consumer goods": "Consumer Staples",
    "energy": "Energy",
    "oil & gas": "Energy",
    "oil and gas": "Energy",
    "financials": "Financials",
    "financial": "Financials",
    "financial services": "Financials",
    "banks": "Financials",
    "health care": "Health Care",
    "healthcare": "Health Care",
    "industrials": "Industrials",
    "industrial": "Industrials",
    "industrial goods": "Industrials",
    "information technology": "Information Technology",
    "technology": "Information Technology",
    "software": "Information Technology",
    "communication equipment": "Information Technology",
    "communication equipments": "Information Technology",
    "communications equipment": "Information Technology",
    "materials": "Materials",
    "basic materials": "Materials",
    "real estate": "Real Estate",
    "utilities": "Utilities",
}

def normalize_sector(raw):
    if not raw or not str(raw).strip() or str(raw).strip() in ("—", "-", "N/A", "null", "None"):
        return None
    s = str(raw).strip()
    if s in STANDARD_SECTORS:
        return s
    key = s.lower()
    if key in _SECTOR_MAP:
        return _SECTOR_MAP[key]
    for k, v in _SECTOR_MAP.items():
        if k in key or key in k:
            return v
    # fallback: keep only if already standard-ish
    return s

def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn

_SECTORS_RECLASSIFIED = False
def ensure_sector_reclass():
    """One-time DB reclassification into 11 standard sectors + remove bogus exchanges."""
    global _SECTORS_RECLASSIFIED
    if _SECTORS_RECLASSIFIED:
        return
    try:
        conn = sqlite3.connect(DB_PATH)
        c = conn.cursor()
        # Reclassify sectors
        for (sec,) in c.execute("SELECT DISTINCT sector FROM stocks").fetchall():
            if not sec:
                continue
            mapped = normalize_sector(sec)
            if mapped and mapped != sec:
                c.execute("UPDATE stocks SET sector=? WHERE sector=?", (mapped, sec))
        for dead in ("Distributor", "Distributors", "Leisure Products"):
            c.execute("UPDATE stocks SET sector=? WHERE sector=?", ("Consumer Discretionary", dead))
        # Remove bogus "Stock_Exchange" / empty-name exchanges (India junk etc.)
        c.execute("""
            DELETE FROM stocks WHERE
              TRIM(COALESCE(stock_exchange,'')) = ''
              OR LOWER(TRIM(stock_exchange)) IN ('stock_exchange','stock exchange','stock-exchange','n/a','null','—','-')
              OR TRIM(COALESCE(exchange_code,'')) = ''
              OR LOWER(TRIM(exchange_code)) IN ('stock_exchange','n/a','null','—','-')
        """)
        conn.commit()
        conn.close()
        _SECTORS_RECLASSIFIED = True
    except Exception as e:
        print("sector reclass warning:", e)

@app.on_event("startup")
def _on_startup():
    ensure_sector_reclass()

YF_SUFFIX = {
    "NYSE": "", "NASDAQ": "", "AMEX": "", "OTC": "",
    "LON": ".L", "AIM": ".L", "LSE": ".L", "AQU": ".L",
    "FRA": ".F", "ETR": ".DE", "BST": ".SG", "DUSE": ".DU", "MUN": ".MU", "HAM": ".HM",
    "BOM": ".BO", "NSE": ".NS", "BSE": ".BO",
    "HKG": ".HK", "HKG_1": ".HK", "SHA": ".SS", "SHE": ".SZ",
    "TYO": ".T", "TSE": ".T", "XNGO": ".T", "SPSE": ".T",
    "ASX": ".AX", "NSX": ".AX",
    "TSX": ".TO", "TSXV": ".V", "CSE": ".CN", "NEO": ".NE",
    "BVMF": ".SA", "B3": ".SA", "KRX": ".KS", "KOSDAQ": ".KQ",
    "BIT": ".MI", "EPA": ".PA", "PAR": ".PA", "AMS": ".AS", "ELI": ".LS",
    "BME": ".MC", "SWX": ".SW", "OSL": ".OL", "STO": ".ST", "XSAT": ".ST",
    "HEL": ".HE", "CPH": ".CO", "WSE": ".WA", "BKK": ".BK",
    "IDX": ".JK", "KLSE": ".KL", "SGX": ".SI", "SGXC": ".SI",
    "TPE": ".TW", "TPEX": ".TWO", "TWSE": ".TW",
    "HOSE": ".VN", "HNX": ".VN", "PSE": ".PS", "JSE": ".JO",
    "EGX": ".CA", "IST": ".IS", "TLV": ".TA", "MOEX": ".ME",
    "BCBA": ".BA", "BMV": ".MX", "BVL": ".LM", "NZE": ".NZ", "ATH": ".AT",
    "VIE": ".VI", "BUD": ".BD", "PRA": ".PR", "BVB": ".RO", "ISE": ".IR",
    "TADAWUL": ".SR", "TASI": ".SR", "DFM": ".AE", "ADX": ".AE", "QSE": ".QA",
    "PSX": ".KA", "DSE": ".BD", "COSE": ".CM", "NGX": ".LG", "NASE": ".NR",
    "KASE": ".KZ", "ICE": ".IC", "TAL": "", "SNSE": ".SN", "BVC": ".CL",
}

# Approximate capital coordinates for map markers (exchange cities)

# Canonical country names + aliases (ranking / external data may use variants)
COUNTRY_ALIASES = {
    "korea, rep.": "South Korea",
    "korea, republic of": "South Korea",
    "republic of korea": "South Korea",
    "south korea": "South Korea",
    "hong kong sar, china": "Hong Kong",
    "hong kong sar": "Hong Kong",
    "hong kong, china": "Hong Kong",
    "hong kong": "Hong Kong",
    "turkiye": "Turkey",
    "türkiye": "Turkey",
    "turkey": "Turkey",
    "viet nam": "Vietnam",
    "vietnam": "Vietnam",
    "egypt, arab rep.": "Egypt",
    "egypt, arab rep": "Egypt",
    "egypt": "Egypt",
    "russian federation": "Russia",
    "russia": "Russia",
    "czechia": "Czech Republic",
    "czech republic": "Czech Republic",
    "cote d'ivoire": "Cote d'Ivoire",
    "côte d'ivoire": "Cote d'Ivoire",
    "ivory coast": "Cote d'Ivoire",
    "west africa": "Cote d'Ivoire",
    "west bank and gaza": "Palestine",
    "palestine": "Palestine",
    "venezuela, rb": "Venezuela",
    "venezuela,rb": "Venezuela",
    "venezuela": "Venezuela",
    "slovak republic": "Slovakia",
    "slovakia": "Slovakia",
    "united states of america": "United States",
    "usa": "United States",
    "uk": "United Kingdom",
    "u.s.": "United States",
    "u.s.a.": "United States",
}

def normalize_country(name: str) -> str:
    if not name:
        return name
    key = name.strip().lower()
    return COUNTRY_ALIASES.get(key, name.strip())


COUNTRY_COORDS = {
    "United States": [39.8, -98.5], "United Kingdom": [54.0, -2.0], "Germany": [51.1, 10.4],
    "India": [20.5, 78.9], "China": [35.8, 104.1], "Japan": [36.2, 138.2],
    "Canada": [56.1, -106.3], "Hong Kong": [22.3, 114.1], "South Korea": [35.9, 127.7],
    "Taiwan": [23.7, 120.9], "Australia": [-25.2, 133.7], "Thailand": [15.8, 100.9],
    "Brazil": [-14.2, -51.9], "France": [46.2, 2.2], "Italy": [41.8, 12.5],
    "Netherlands": [52.1, 5.2], "Spain": [40.4, -3.7], "Switzerland": [46.8, 8.2],
    "Singapore": [1.3, 103.8], "Malaysia": [4.2, 101.9], "Indonesia": [-0.7, 113.9],
    "Vietnam": [14.0, 108.2], "Philippines": [12.8, 121.7], "South Africa": [-30.5, 25.0],
    "Egypt": [26.8, 30.8], "Turkey": [38.9, 35.2], "Israel": [31.0, 34.8],
    "Russia": [61.5, 105.3], "Argentina": [-38.4, -63.6], "Mexico": [23.6, -102.5],
    "Peru": [-9.1, -75.0], "Colombia": [4.5, -74.2], "Chile": [-35.6, -71.5],
    "United Arab Emirates": [23.4, 53.8], "Saudi Arabia": [23.8, 45.0], "Qatar": [25.3, 51.1],
    "Kuwait": [29.3, 47.4], "Bahrain": [26.0, 50.5], "Oman": [21.4, 57.0],
    "Pakistan": [30.3, 69.3], "Bangladesh": [23.6, 90.3], "Sri Lanka": [7.8, 80.7],
    "New Zealand": [-40.9, 174.8], "Greece": [39.0, 21.8], "Hungary": [47.1, 19.5],
    "Czech Republic": [49.8, 15.4], "Romania": [45.9, 24.9], "Serbia": [44.0, 21.0],
    "Austria": [47.5, 14.5], "Belgium": [50.5, 4.4], "Ireland": [53.1, -7.6],
    "Poland": [51.9, 19.1], "Sweden": [60.1, 18.6], "Norway": [60.4, 8.4],
    "Denmark": [56.2, 9.5], "Finland": [61.9, 25.7], "Iceland": [64.9, -19.0],
    "Nigeria": [9.0, 8.6], "Kenya": [0.0, 37.9], "Ghana": [7.9, -1.0],
    "Morocco": [31.7, -7.0], "Tunisia": [33.8, 9.5], "Cote d'Ivoire": [7.5, -5.5], "Latvia": [56.9, 24.1], "Lithuania": [55.2, 23.9],
}

def to_yf_ticker(symbol, exchange_code):
    """Build Yahoo Finance ticker with exchange suffix + symbol normalization."""
    code = (exchange_code or "").replace("_1", "").upper()
    suffix = YF_SUFFIX.get(code, "")
    sym = (symbol or "").strip().upper()
    if not sym:
        return sym
    # Already has a Yahoo-style suffix
    if "." in sym and any(sym.endswith(s) for s in (
        ".L", ".NS", ".BO", ".T", ".HK", ".SS", ".SZ", ".AX", ".TO", ".V",
        ".SA", ".KS", ".KQ", ".MI", ".PA", ".AS", ".MC", ".SW", ".OL", ".ST",
        ".HE", ".CO", ".WA", ".BK", ".JK", ".KL", ".SI", ".TW", ".TWO", ".VN",
        ".PS", ".JO", ".IS", ".TA", ".ME", ".BA", ".MX", ".NZ", ".DE", ".F",
        ".SR", ".AE", ".QA", ".KA", ".BD", ".CM", ".RO", ".LS", ".CN",
    )):
        return sym
    # China A-shares: pad numeric codes to 6 digits
    if code in ("SHE", "SHA", "SZSE", "SSE") and sym.isdigit():
        sym = sym.zfill(6)
    # Hong Kong: pad numeric codes to 4 digits (0700.HK)
    if code in ("HKG", "HKG_1") and sym.isdigit():
        sym = sym.zfill(4)
    # Saudi / some Gulf numeric codes — keep as-is with .SR
    return f"{sym}{suffix}"

# ---------- Health ----------
@app.get("/api/health")
def health():
    return {
        "status": "ok",
        "database": os.path.exists(DB_PATH),
        "frontend": os.path.exists(os.path.join(FRONTEND, "index.html")),
        "yfinance": YF_AVAILABLE,
    }

# ---------- Overview ----------
_EX_FILTER = """
  AND TRIM(COALESCE(stock_exchange,'')) NOT IN ('','Stock_Exchange','Stock Exchange','stock_exchange','N/A','—','-')
  AND TRIM(COALESCE(exchange_code,'')) NOT IN ('','Stock_Exchange','N/A','—','-')
"""

@app.get("/api/overview")
def overview():
    ensure_sector_reclass()
    conn = get_db(); c = conn.cursor()
    c.execute(f"SELECT COUNT(*) FROM stocks WHERE 1=1 {_EX_FILTER}"); total = c.fetchone()[0]
    c.execute(f"SELECT COUNT(DISTINCT country) FROM stocks WHERE 1=1 {_EX_FILTER}"); countries = c.fetchone()[0]
    c.execute(f"SELECT COUNT(DISTINCT stock_exchange) FROM stocks WHERE 1=1 {_EX_FILTER}"); exchanges = c.fetchone()[0]
    c.execute("SELECT COUNT(DISTINCT sector) FROM stocks WHERE sector IS NOT NULL AND TRIM(sector)!=''"); sectors = c.fetchone()[0]
    c.execute("SELECT COUNT(*) FROM stocks WHERE sector IS NOT NULL"); with_sector = c.fetchone()[0]
    c.execute("SELECT country, COUNT(*) as cnt FROM stocks GROUP BY country ORDER BY cnt DESC LIMIT 15")
    top_countries = [{"country": r[0], "count": r[1]} for r in c.fetchall()]
    c.execute("SELECT sector, COUNT(*) as cnt FROM stocks WHERE sector IS NOT NULL GROUP BY sector ORDER BY cnt DESC LIMIT 12")
    top_sectors = [{"sector": r[0], "count": r[1]} for r in c.fetchall()]
    c.execute("SELECT stock_exchange, exchange_code, country, COUNT(*) as cnt FROM stocks GROUP BY stock_exchange ORDER BY cnt DESC LIMIT 20")
    top_exchanges = [{"exchange": r[0], "code": r[1], "country": r[2], "count": r[3]} for r in c.fetchall()]
    conn.close()
    return {
        "total_stocks": total, "countries": countries, "exchanges": exchanges, "sectors": sectors,
        "with_sector": with_sector, "coverage_pct": round(100 * with_sector / total, 1) if total else 0,
        "top_countries": top_countries, "top_sectors": top_sectors, "top_exchanges": top_exchanges,
        "yfinance": YF_AVAILABLE,
        "tagline": "Navigate 80,000+ listings across 80+ countries. Spot sector concentration, exchange depth, and live company fundamentals — all in one place.",
    }

# ---------- Countries ----------
@app.get("/api/countries")
def list_countries():
    """Countries with listing counts + ranking score/rank/iso3 when available."""
    ensure_sector_reclass()
    conn = get_db(); c = conn.cursor()
    c.execute(f"""
        SELECT country, COUNT(*) as cnt,
               COUNT(DISTINCT sector) as sectors,
               COUNT(DISTINCT stock_exchange) as exchanges
        FROM stocks WHERE 1=1 {_EX_FILTER}
        GROUP BY country ORDER BY cnt DESC
    """)
    rows = [{"country": r[0], "stocks": r[1], "sectors": r[2], "exchanges": r[3]} for r in c.fetchall()]
    conn.close()

    # Merge ranking
    ranks = _read_ranking("rank_list.json") or []
    se = _read_ranking("countries_with_stock_exchange.json") or []
    iso_meta = {c["iso3"]: c for c in se}
    name_to_rank = {}
    for r in ranks:
        iso = r.get("country")
        meta = iso_meta.get(iso, {})
        cname = meta.get("country_name") or _ISO_NAME.get(iso, iso)
        payload = {
            "iso3": iso,
            "rank": r.get("rank"),
            "score": r.get("final_score"),
            "region": meta.get("region"),
            "lat": meta.get("latitude"),
            "lng": meta.get("longitude"),
            "capital": meta.get("capitalCity"),
        }
        # Index under canonical + raw names
        for key in {cname, normalize_country(cname)}:
            name_to_rank[key] = payload
        if iso == "USA":
            name_to_rank["United States"] = payload
        if iso == "GBR":
            name_to_rank["United Kingdom"] = payload
        if iso == "KOR":
            name_to_rank["South Korea"] = payload
            name_to_rank["Korea, Rep."] = payload
        if iso == "HKG":
            name_to_rank["Hong Kong"] = payload
        if iso == "TUR":
            name_to_rank["Turkey"] = payload
            name_to_rank["Turkiye"] = payload
        if iso == "VNM":
            name_to_rank["Vietnam"] = payload
            name_to_rank["Viet Nam"] = payload
        if iso == "EGY":
            name_to_rank["Egypt"] = payload
        if iso == "RUS":
            name_to_rank["Russia"] = payload
            name_to_rank["Russian Federation"] = payload
        if iso == "CZE":
            name_to_rank["Czech Republic"] = payload
            name_to_rank["Czechia"] = payload
        if iso == "CIV":
            name_to_rank["Cote d'Ivoire"] = payload
            name_to_rank["Ivory Coast"] = payload
        if iso == "PSE":
            name_to_rank["Palestine"] = payload
            name_to_rank["West Bank and Gaza"] = payload
        if iso == "VEN":
            name_to_rank["Venezuela"] = payload
        if iso == "SVK":
            name_to_rank["Slovakia"] = payload
            name_to_rank["Slovak Republic"] = payload
        if iso == "LVA":
            name_to_rank["Latvia"] = payload
        if iso == "LTU":
            name_to_rank["Lithuania"] = payload
        if iso == "TWN":
            name_to_rank["Taiwan"] = payload

    CURRENCY = {
        "United States": "USD", "United Kingdom": "GBP", "India": "INR", "China": "CNY",
        "Japan": "JPY", "Germany": "EUR", "France": "EUR", "Italy": "EUR", "Spain": "EUR",
        "Netherlands": "EUR", "Austria": "EUR", "Belgium": "EUR", "Ireland": "EUR",
        "Finland": "EUR", "Portugal": "EUR", "Greece": "EUR", "Canada": "CAD",
        "Australia": "AUD", "New Zealand": "NZD", "Switzerland": "CHF", "Sweden": "SEK",
        "Norway": "NOK", "Denmark": "DKK", "Hong Kong": "HKD", "Singapore": "SGD",
        "South Korea": "KRW", "Taiwan": "TWD", "Brazil": "BRL", "Mexico": "MXN",
        "Argentina": "ARS", "Chile": "CLP", "Colombia": "COP", "Peru": "PEN",
        "South Africa": "ZAR", "Turkey": "TRY", "Israel": "ILS", "Saudi Arabia": "SAR",
        "United Arab Emirates": "AED", "Qatar": "QAR", "Kuwait": "KWD", "Bahrain": "BHD",
        "Egypt": "EGP", "Nigeria": "NGN", "Kenya": "KES", "Thailand": "THB",
        "Malaysia": "MYR", "Indonesia": "IDR", "Philippines": "PHP", "Vietnam": "VND",
        "Pakistan": "PKR", "Bangladesh": "BDT", "Sri Lanka": "LKR", "Poland": "PLN",
        "Czech Republic": "CZK", "Hungary": "HUF", "Romania": "RON", "Russia": "RUB",
        "Iceland": "ISK", "Morocco": "MAD", "Tunisia": "TND", "Ghana": "GHS",
        "Jamaica": "JMD", "Kazakhstan": "KZT", "Ukraine": "UAH", "Croatia": "EUR",
        "Bulgaria": "BGN", "Serbia": "RSD", "Cyprus": "EUR", "Malta": "EUR", "Latvia": "EUR", "Lithuania": "EUR", "Cote d'Ivoire": "XOF", "Slovakia": "EUR", "Palestine": "ILS",
    }

    for row in rows:
        row["country"] = normalize_country(row["country"])
        rk = name_to_rank.get(row["country"], {})
        row["iso3"] = rk.get("iso3") or _NAME_ISO.get(row["country"])
        row["rank"] = rk.get("rank")
        row["score"] = rk.get("score")
        row["region"] = rk.get("region")
        row["lat"] = rk.get("lat") or (COUNTRY_COORDS.get(row["country"]) or [None, None])[0]
        row["lng"] = rk.get("lng") or (COUNTRY_COORDS.get(row["country"]) or [None, None])[1]
        row["currency"] = CURRENCY.get(row["country"], "—")
        row["capital"] = rk.get("capital")
    return rows

@app.get("/api/exchanges/map")
def exchanges_map():
    """All exchanges with country coords for world map markers."""
    ensure_sector_reclass()
    conn = get_db(); c = conn.cursor()
    c.execute(f"""
        SELECT stock_exchange, exchange_code, country, COUNT(*) as cnt
        FROM stocks WHERE 1=1 {_EX_FILTER}
        GROUP BY exchange_code ORDER BY cnt DESC
    """)
    rows = []
    for r in c.fetchall():
        coords = COUNTRY_COORDS.get(r[2], [20, 0])
        rows.append({
            "exchange": r[0], "code": r[1], "country": r[2], "count": r[3],
            "lat": coords[0], "lng": coords[1],
        })
    conn.close()
    return {"exchanges": rows}

@app.get("/api/country/{country}")
def country_detail(country: str):
    ensure_sector_reclass()
    country = normalize_country(country)
    conn = get_db(); c = conn.cursor()
    c.execute(f"SELECT COUNT(*) FROM stocks WHERE country = ? {_EX_FILTER}", (country,))
    total = c.fetchone()[0]
    if total == 0:
        raise HTTPException(404, "Country not found")
    c.execute("""
        SELECT sector, COUNT(*) as cnt FROM stocks
        WHERE country = ? AND sector IS NOT NULL AND TRIM(sector)!='' GROUP BY sector ORDER BY cnt DESC
    """, (country,))
    sectors = [{"sector": r[0], "count": r[1]} for r in c.fetchall()]
    c.execute(f"""
        SELECT stock_exchange, exchange_code, COUNT(*) as cnt
        FROM stocks WHERE country = ? {_EX_FILTER}
        GROUP BY stock_exchange ORDER BY cnt DESC
    """, (country,))
    exchanges = [{"exchange": r[0], "code": r[1], "count": r[2]} for r in c.fetchall()]
    c.execute("""
        SELECT industry, COUNT(*) as cnt FROM stocks
        WHERE country = ? AND industry IS NOT NULL GROUP BY industry ORDER BY cnt DESC LIMIT 25
    """, (country,))
    industries = [{"industry": r[0], "count": r[1]} for r in c.fetchall()]
    conn.close()
    coords = COUNTRY_COORDS.get(country, [20, 0])
    return {
        "country": country, "total_stocks": total, "sectors": sectors,
        "exchanges": exchanges, "industries": industries, "top_industries": industries,
        "lat": coords[0], "lng": coords[1],
    }

# ---------- Exchanges ----------
@app.get("/api/exchanges")
def list_exchanges():
    ensure_sector_reclass()
    conn = get_db(); c = conn.cursor()
    c.execute(f"""
        SELECT stock_exchange, exchange_code, country, COUNT(*) as cnt
        FROM stocks WHERE 1=1 {_EX_FILTER}
        GROUP BY stock_exchange ORDER BY cnt DESC
    """)
    rows = [{"exchange": r[0], "code": r[1], "country": r[2], "stocks": r[3], "count": r[3]} for r in c.fetchall()]
    conn.close()
    return rows

@app.get("/api/exchange/{code}")
def exchange_detail(code: str):
    conn = get_db(); c = conn.cursor()
    c.execute("""
        SELECT stock_exchange, country, COUNT(*)
        FROM stocks WHERE exchange_code = ? OR exchange_code = ?
        GROUP BY stock_exchange LIMIT 1
    """, (code, code.replace("_1", "")))
    row = c.fetchone()
    if not row:
        c.execute("SELECT stock_exchange, country, COUNT(*) FROM stocks WHERE stock_exchange LIKE ? GROUP BY stock_exchange LIMIT 1", (f"%{code}%",))
        row = c.fetchone()
    if not row:
        raise HTTPException(404, "Exchange not found")
    name, country, total = row
    c.execute("""
        SELECT sector, COUNT(*) as cnt FROM stocks
        WHERE (exchange_code = ? OR stock_exchange = ?) AND sector IS NOT NULL
        GROUP BY sector ORDER BY cnt DESC
    """, (code, name))
    sectors = [{"sector": r[0], "count": r[1]} for r in c.fetchall()]
    c.execute("""
        SELECT industry, COUNT(*) as cnt FROM stocks
        WHERE (exchange_code = ? OR stock_exchange = ?) AND industry IS NOT NULL
        GROUP BY industry ORDER BY cnt DESC LIMIT 20
    """, (code, name))
    industries = [{"industry": r[0], "count": r[1]} for r in c.fetchall()]
    c.execute("""
        SELECT stock_exchange, exchange_code, COUNT(*) as cnt
        FROM stocks WHERE country = ? GROUP BY stock_exchange ORDER BY cnt DESC
    """, (country,))
    siblings = [{"exchange": r[0], "code": r[1], "count": r[2]} for r in c.fetchall()]
    conn.close()
    return {
        "exchange": name, "code": code, "country": country, "total_stocks": total,
        "sectors": sectors, "industries": industries, "country_exchanges": siblings,
    }

@app.get("/api/exchange/{code}/stocks")
def exchange_stocks(code: str, page: int = Query(1, ge=1), limit: int = Query(50, ge=1, le=200), q: Optional[str] = None):
    conn = get_db(); c = conn.cursor()
    clauses = ["(exchange_code = ? OR exchange_code = ?)"]
    params: List[Any] = [code, code.replace("_1", "")]
    if q:
        clauses.append("(symbol LIKE ? OR company_name LIKE ?)")
        params.extend([f"%{q}%", f"%{q}%"])
    where = " WHERE " + " AND ".join(clauses)
    c.execute(f"SELECT COUNT(*) FROM stocks{where}", params)
    total = c.fetchone()[0]
    offset = (page - 1) * limit
    c.execute(f"""
        SELECT symbol, company_name, stock_exchange, exchange_code, industry, sector, country
        FROM stocks{where} ORDER BY company_name LIMIT ? OFFSET ?
    """, params + [limit, offset])
    results = []
    for r in c.fetchall():
        results.append({
            "symbol": r[0], "company_name": r[1] or "—",
            "stock_exchange": r[2], "exchange_code": r[3],
            "industry": r[4] if r[4] else "—", "sector": r[5] if r[5] else "—",
            "country": r[6], "market_cap": "—", "change_1y": "—",
        })
    conn.close()
    return {"total": total, "page": page, "limit": limit, "pages": math.ceil(total / limit) if limit else 1, "results": results}

# ---------- Sectors ----------
@app.get("/api/sectors")
def list_sectors():
    ensure_sector_reclass()
    conn = get_db(); c = conn.cursor()
    c.execute(f"""
        SELECT sector, COUNT(*) as cnt, COUNT(DISTINCT country) as countries,
               COUNT(DISTINCT stock_exchange) as exchanges,
               COUNT(DISTINCT industry) as industries
        FROM stocks
        WHERE sector IS NOT NULL AND TRIM(sector) != '' AND sector != '—'
        {_EX_FILTER}
        GROUP BY sector ORDER BY cnt DESC
    """)
    rows = [{"sector": r[0], "stocks": r[1], "countries": r[2], "exchanges": r[3], "industries": r[4]} for r in c.fetchall()]
    conn.close()
    return rows

@app.get("/api/sector/{sector_name}")
def sector_detail(sector_name: str):
    conn = get_db(); c = conn.cursor()
    c.execute("SELECT COUNT(*) FROM stocks WHERE sector = ?", (sector_name,))
    total = c.fetchone()[0]
    if total == 0:
        raise HTTPException(404, "Sector not found")
    c.execute("""
        SELECT country, COUNT(*) as cnt FROM stocks WHERE sector = ?
        GROUP BY country ORDER BY cnt DESC LIMIT 25
    """, (sector_name,))
    countries = [{"country": r[0], "count": r[1]} for r in c.fetchall()]
    c.execute("""
        SELECT industry, COUNT(*) as cnt FROM stocks
        WHERE sector = ? AND industry IS NOT NULL GROUP BY industry ORDER BY cnt DESC LIMIT 30
    """, (sector_name,))
    industries = [{"industry": r[0], "count": r[1]} for r in c.fetchall()]
    c.execute("""
        SELECT stock_exchange, country, COUNT(*) as cnt FROM stocks WHERE sector = ?
        GROUP BY stock_exchange ORDER BY cnt DESC LIMIT 15
    """, (sector_name,))
    exchanges = [{"exchange": r[0], "country": r[1], "count": r[2]} for r in c.fetchall()]
    conn.close()
    return {"sector": sector_name, "total_stocks": total, "by_country": countries, "industries": industries, "top_exchanges": exchanges}

@app.get("/api/sector/{sector_name}/stocks")
def sector_stocks(sector_name: str, page: int = Query(1, ge=1), limit: int = Query(50, ge=1, le=200), q: Optional[str] = None):
    conn = get_db(); c = conn.cursor()
    clauses = ["sector = ?"]
    params: List[Any] = [sector_name]
    if q:
        clauses.append("(symbol LIKE ? OR company_name LIKE ?)")
        params.extend([f"%{q}%", f"%{q}%"])
    where = " WHERE " + " AND ".join(clauses)
    c.execute(f"SELECT COUNT(*) FROM stocks{where}", params)
    total = c.fetchone()[0]
    offset = (page - 1) * limit
    c.execute(f"""
        SELECT symbol, company_name, stock_exchange, exchange_code, industry, sector, country
        FROM stocks{where} ORDER BY company_name LIMIT ? OFFSET ?
    """, params + [limit, offset])
    results = [dict(r) for r in c.fetchall()]
    for r in results:
        r["industry"] = r.get("industry") or "—"
        r["sector"] = r.get("sector") or "—"
    conn.close()
    return {"total": total, "page": page, "limit": limit, "pages": math.ceil(total / limit) if limit else 1, "results": results}

# ---------- Autocomplete search ----------
@app.get("/api/autocomplete")
def autocomplete(q: str = Query(..., min_length=1), limit: int = Query(12, ge=1, le=30)):
    conn = get_db(); c = conn.cursor()
    like = f"%{q}%"
    c.execute("""
        SELECT symbol, company_name, stock_exchange, exchange_code, country, sector
        FROM stocks
        WHERE symbol LIKE ? OR company_name LIKE ?
        ORDER BY
          CASE WHEN UPPER(symbol) = UPPER(?) THEN 0
               WHEN UPPER(symbol) LIKE UPPER(?) THEN 1
               ELSE 2 END,
          company_name
        LIMIT ?
    """, (like, like, q, f"{q}%", limit))
    rows = [dict(r) for r in c.fetchall()]
    conn.close()
    return {"results": rows}

# ---------- Search / Screener ----------
_UNIVERSE_SYMS = None
def _universe_set():
    global _UNIVERSE_SYMS
    if _UNIVERSE_SYMS is not None:
        return _UNIVERSE_SYMS
    path = os.path.join(_BASE, "data", "universe_symbols.json")
    try:
        import json as _j
        _UNIVERSE_SYMS = set(_j.load(open(path)))
    except Exception:
        _UNIVERSE_SYMS = set()
    return _UNIVERSE_SYMS

@app.get("/api/search")
def search(q: Optional[str] = None, country: Optional[str] = None, sector: Optional[str] = None,
           exchange: Optional[str] = None, page: int = Query(1, ge=1), limit: int = Query(50, ge=1, le=200),
           industry: Optional[str] = None):
    """Search listings. Universe symbols (stocks_universe.json) are sorted first."""
    conn = get_db(); c = conn.cursor()
    clauses, params = [], []
    if q:
        clauses.append("(symbol LIKE ? OR company_name LIKE ?)")
        params.extend([f"%{q}%", f"%{q}%"])
    if country:
        clauses.append("country = ?"); params.append(normalize_country(country))
    if sector:
        clauses.append("sector = ?"); params.append(sector)
    if industry:
        clauses.append("industry = ?"); params.append(industry)
    if exchange:
        clauses.append("(exchange_code = ? OR stock_exchange LIKE ?)")
        params.extend([exchange, f"%{exchange}%"])
    where = (" WHERE " + " AND ".join(clauses)) if clauses else ""
    c.execute(f"SELECT COUNT(*) FROM stocks{where}", params)
    total = c.fetchone()[0]
    # Fetch a wider window then prioritize universe, then paginate in Python for stable priority
    # For empty query: still prioritize universe
    c.execute(f"""
        SELECT symbol, company_name, stock_exchange, exchange_code, industry, sector, country,
               pack_available, data_source
        FROM stocks{where} ORDER BY company_name
    """, params)
    all_rows = [dict(r) for r in c.fetchall()]
    conn.close()
    uni = _universe_set()
    for r in all_rows:
        r["industry"] = r.get("industry") or "—"
        r["sector"] = r.get("sector") or "—"
        r["in_universe"] = (r.get("symbol") or "").upper() in uni
    all_rows.sort(key=lambda r: (0 if r["in_universe"] else 1, (r.get("company_name") or "").lower()))
    offset = (page - 1) * limit
    results = all_rows[offset:offset + limit]
    return {"total": total, "page": page, "limit": limit, "pages": math.ceil(total / limit) if limit else 1, "results": results}

@app.get("/api/listings/{symbol}")
def multi_listings(symbol: str, company: Optional[str] = None):
    conn = get_db(); c = conn.cursor()
    if company:
        c.execute("""
            SELECT symbol, company_name, stock_exchange, exchange_code, country, sector, industry,
                   pack_available, data_source
            FROM stocks WHERE company_name = ? OR UPPER(symbol) = UPPER(?)
            ORDER BY country, stock_exchange
        """, (company, symbol))
    else:
        c.execute("""
            SELECT symbol, company_name, stock_exchange, exchange_code, country, sector, industry,
                   pack_available, data_source
            FROM stocks WHERE UPPER(symbol) = UPPER(?) ORDER BY country, stock_exchange
        """, (symbol,))
    rows = [dict(r) for r in c.fetchall()]
    conn.close()
    return {"listings": rows}

# ---------- Live data (yfinance + fallbacks) ----------
def _try_yf_info(ticker_str):
    tk = yf.Ticker(ticker_str)
    info = {}
    try:
        info = tk.info or {}
    except Exception:
        pass
    if not info or (not info.get("longName") and not info.get("shortName") and info.get("regularMarketPrice") is None):
        try:
            fi = tk.fast_info
            if fi and getattr(fi, "last_price", None) is not None:
                return {
                    "ticker": ticker_str, "available": True, "source": "yfinance-fast",
                    "name": ticker_str, "price": getattr(fi, "last_price", None),
                    "currency": getattr(fi, "currency", None),
                    "market_cap": getattr(fi, "market_cap", None),
                    "year_change": None, "dividend_yield": None, "sector": None, "industry": None,
                    "summary": "", "info": {},
                }
        except Exception:
            pass
        return None
    price = info.get("currentPrice") or info.get("regularMarketPrice") or info.get("previousClose")
    keys = [
        "previousClose", "open", "dayLow", "dayHigh", "volume", "averageVolume",
        "fiftyTwoWeekLow", "fiftyTwoWeekHigh", "trailingPE", "forwardPE", "priceToBook",
        "beta", "dividendRate", "exDividendDate", "payoutRatio", "profitMargins",
        "returnOnEquity", "returnOnAssets", "revenueGrowth", "earningsGrowth",
        "totalRevenue", "totalDebt", "totalCash", "bookValue", "sharesOutstanding",
        "floatShares", "website", "fullTimeEmployees", "city", "country",
        "exchange", "quoteType", "recommendationKey",
    ]
    return {
        "ticker": ticker_str, "available": True, "source": "yfinance",
        "name": info.get("longName") or info.get("shortName") or ticker_str,
        "price": price, "currency": info.get("currency"),
        "market_cap": info.get("marketCap"), "year_change": info.get("52WeekChange"),
        "dividend_yield": info.get("dividendYield"),
        "sector": info.get("sector"), "industry": info.get("industry"),
        "summary": (info.get("longBusinessSummary") or "")[:900],
        "info": {k: info.get(k) for k in keys if info.get(k) is not None},
    }

@app.get("/api/live/{symbol}")
def live_quote(symbol: str, exchange: Optional[str] = None):
    if not YF_AVAILABLE:
        return {"available": False, "error": "yfinance not installed"}
    candidates = []
    if exchange:
        candidates.append(to_yf_ticker(symbol, exchange))
    candidates.extend([
        symbol, f"{symbol}.NS", f"{symbol}.BO", f"{symbol}.L", f"{symbol}.T",
        f"{symbol}.HK", f"{symbol}.AX", f"{symbol}.TO", f"{symbol}.SA", f"{symbol}.DE",
    ])
    candidates = list(dict.fromkeys(candidates))
    for t in candidates:
        try:
            result = _try_yf_info(t)
            if result:
                return result
        except Exception:
            continue
    return {"available": False, "error": "No data found", "tried": candidates}

@app.get("/api/history/{symbol}")
def price_history(symbol: str, exchange: Optional[str] = None, period: str = "1y"):
    """
    Supported periods: 1d, 7d, 15d, 1mo, 6mo, 1y, 5y, 10y, max
    Maps to yfinance period + interval.
    """
    if not YF_AVAILABLE:
        return {"available": False, "error": "yfinance not installed"}
    # Map UI period → (yf period, interval, date format)
    period_map = {
        "1d":  ("1d",  "5m",  "time"),
        "7d":  ("5d",  "15m", "time"),
        "15d": ("1mo", "1h",  "datetime"),
        "1mo": ("1mo", "1d",  "date"),
        "6mo": ("6mo", "1d",  "date"),
        "1y":  ("1y",  "1d",  "date"),
        "5y":  ("5y",  "1wk", "date"),
        "10y": ("10y", "1wk", "date"),
        "max": ("max", "1mo", "date"),
    }
    key = (period or "1y").lower()
    yf_period, interval, fmt = period_map.get(key, ("1y", "1d", "date"))

    candidates = []
    if exchange:
        candidates.append(to_yf_ticker(symbol, exchange))
    candidates.extend([symbol, f"{symbol}.NS", f"{symbol}.BO", f"{symbol}.L", f"{symbol}.T", f"{symbol}.HK"])
    candidates = list(dict.fromkeys(candidates))
    for t in candidates:
        try:
            hist = yf.Ticker(t).history(period=yf_period, interval=interval)
            if hist is None or hist.empty:
                continue
            hist = hist.reset_index()
            date_col = "Datetime" if "Datetime" in hist.columns else "Date"
            dates = []
            for d in hist[date_col]:
                if hasattr(d, "strftime"):
                    if fmt == "time":
                        dates.append(d.strftime("%H:%M") if key == "1d" else d.strftime("%d/%m %H:%M"))
                    elif fmt == "datetime":
                        dates.append(d.strftime("%d/%m/%y %H:%M"))
                    else:
                        dates.append(d.strftime("%d/%m/%Y"))
                else:
                    dates.append(str(d)[:16])
            closes = [round(float(x), 4) if pd.notna(x) else None for x in hist["Close"]]
            opens = [round(float(x), 4) if pd.notna(x) else None for x in hist["Open"]] if "Open" in hist.columns else []
            highs = [round(float(x), 4) if pd.notna(x) else None for x in hist["High"]] if "High" in hist.columns else []
            lows = [round(float(x), 4) if pd.notna(x) else None for x in hist["Low"]] if "Low" in hist.columns else []
            volumes = [int(x) if pd.notna(x) else None for x in hist["Volume"]] if "Volume" in hist.columns else []
            return {
                "available": True, "ticker": t, "period": key,
                "yf_period": yf_period, "interval": interval,
                "dates": dates, "closes": closes,
                "opens": opens, "highs": highs, "lows": lows, "volumes": volumes,
                "currency": None,
            }
        except Exception:
            continue
    return {"available": False, "error": "No history"}

def _df_to_dict(df):
    if df is None or (hasattr(df, "empty") and df.empty):
        return {}
    out = {}
    for col in df.columns:
        key = str(col)[:10]
        out[key] = {}
        for idx, val in df[col].items():
            if pd.isna(val):
                out[key][str(idx)] = None
            elif isinstance(val, (int, float)):
                out[key][str(idx)] = float(val)
            else:
                out[key][str(idx)] = str(val)
    return out

@app.get("/api/financials/{symbol}")
def financials(symbol: str, exchange: Optional[str] = None, freq: str = "annual"):
    """Fetch annual or quarterly financials from yfinance."""
    if not YF_AVAILABLE:
        return {"available": False, "error": "yfinance not installed"}
    candidates = []
    if exchange:
        candidates.append(to_yf_ticker(symbol, exchange))
    # Common suffixes
    candidates.extend([
        symbol, f"{symbol}.NS", f"{symbol}.BO", f"{symbol}.L", f"{symbol}.T",
        f"{symbol}.HK", f"{symbol}.AX", f"{symbol}.TO", f"{symbol}.SA", f"{symbol}.DE",
    ])
    candidates = list(dict.fromkeys(candidates))
    for t in candidates:
        try:
            tk = yf.Ticker(t)
            info = {}
            try:
                info = tk.info or {}
            except Exception:
                pass
            freq_l = (freq or "annual").lower()
            if freq_l == "quarterly":
                try:
                    income = _df_to_dict(getattr(tk, "quarterly_income_stmt", None) or getattr(tk, "quarterly_financials", None))
                except Exception:
                    income = {}
                try:
                    balance = _df_to_dict(getattr(tk, "quarterly_balance_sheet", None))
                except Exception:
                    balance = {}
                try:
                    cashflow = _df_to_dict(getattr(tk, "quarterly_cashflow", None))
                except Exception:
                    cashflow = {}
            elif freq_l == "ttm":
                # Prefer TTM statements when yfinance exposes them; else fall back to annual
                try:
                    income = _df_to_dict(getattr(tk, "ttm_income_stmt", None))
                except Exception:
                    income = {}
                if not income:
                    try:
                        income = _df_to_dict(getattr(tk, "income_stmt", None) or getattr(tk, "financials", None))
                    except Exception:
                        income = {}
                try:
                    balance = _df_to_dict(getattr(tk, "ttm_balance_sheet", None) or getattr(tk, "balance_sheet", None))
                except Exception:
                    balance = {}
                try:
                    cashflow = _df_to_dict(getattr(tk, "ttm_cashflow", None) or getattr(tk, "cashflow", None))
                except Exception:
                    cashflow = {}
            else:  # annual
                try:
                    income = _df_to_dict(getattr(tk, "income_stmt", None) or getattr(tk, "financials", None))
                except Exception:
                    income = _df_to_dict(getattr(tk, "financials", None))
                try:
                    balance = _df_to_dict(tk.balance_sheet)
                except Exception:
                    balance = {}
                try:
                    cashflow = _df_to_dict(tk.cashflow)
                except Exception:
                    cashflow = {}
            has_any = bool(income) or bool(balance) or bool(cashflow)
            if not has_any and not info.get("longName"):
                continue
            # Dividends history
            divs = []
            try:
                dhist = tk.dividends
                if dhist is not None and len(dhist):
                    for dt, val in list(dhist.items())[-40:]:
                        divs.append({"date": str(dt)[:10], "amount": float(val)})
                    divs = list(reversed(divs))
            except Exception:
                pass
            return {
                "available": True, "ticker": t, "freq": freq,
                "name": info.get("longName") or info.get("shortName") or t,
                "income_statement": income,
                "balance_sheet": balance,
                "cashflow": cashflow,
                "dividends_history": divs,
                "info_snapshot": {
                    "sector": info.get("sector"), "industry": info.get("industry"),
                    "marketCap": info.get("marketCap"), "currency": info.get("currency"),
                    "website": info.get("website"),
                    "summary": (info.get("longBusinessSummary") or "")[:1500],
                    "trailingPE": info.get("trailingPE"), "forwardPE": info.get("forwardPE"),
                    "priceToBook": info.get("priceToBook"), "dividendYield": info.get("dividendYield"),
                    "dividendRate": info.get("dividendRate"), "payoutRatio": info.get("payoutRatio"),
                    "profitMargins": info.get("profitMargins"), "returnOnEquity": info.get("returnOnEquity"),
                    "returnOnAssets": info.get("returnOnAssets"), "beta": info.get("beta"),
                    "grossMargins": info.get("grossMargins"), "operatingMargins": info.get("operatingMargins"),
                    "ebitdaMargins": info.get("ebitdaMargins"), "revenueGrowth": info.get("revenueGrowth"),
                    "earningsGrowth": info.get("earningsGrowth"), "currentRatio": info.get("currentRatio"),
                    "quickRatio": info.get("quickRatio"), "debtToEquity": info.get("debtToEquity"),
                    "totalCash": info.get("totalCash"), "totalDebt": info.get("totalDebt"),
                    "freeCashflow": info.get("freeCashflow"), "operatingCashflow": info.get("operatingCashflow"),
                    "bookValue": info.get("bookValue"), "priceToSalesTrailing12Months": info.get("priceToSalesTrailing12Months"),
                    "enterpriseToEbitda": info.get("enterpriseToEbitda"), "pegRatio": info.get("pegRatio"),
                },
            }
        except Exception:
            continue
    # Fallback: stockanalysis.com scrape
    if SA_AVAILABLE and sa_scrape:
        try:
            scraped = sa_scrape(symbol, exchange, sections=[
                "statistics", "income", "balance", "cashflow", "ratios", "company", "overview"
            ])
            if scraped.get("available"):
                # Map scrape tables into same shape frontend expects where possible
                def sa_table_to_cols(tbl):
                    if not tbl or not tbl.get("rows"):
                        return {}
                    # Convert {metric: {period: val}} → keep as-is under periods
                    return tbl
                info = scraped.get("statistics") or scraped.get("overview_stats") or {}
                company = scraped.get("company") or {}
                return {
                    "available": True,
                    "ticker": symbol,
                    "source": "stockanalysis",
                    "url": scraped.get("url"),
                    "name": company.get("Company Name") or scraped.get("page_title") or symbol,
                    "income_statement": scraped.get("income") or {},
                    "balance_sheet": scraped.get("balance") or {},
                    "cashflow": scraped.get("cashflow") or {},
                    "ratios_table": scraped.get("ratios") or {},
                    "dividends_history": [],
                    "info_snapshot": {
                        "sector": company.get("Sector") or info.get("Sector"),
                        "industry": company.get("Industry") or info.get("Industry"),
                        "marketCap": info.get("Market Cap"),
                        "currency": None,
                        "website": company.get("Website"),
                        "summary": company.get("description") or "",
                        "trailingPE": info.get("PE Ratio"),
                        "forwardPE": info.get("Forward PE"),
                        "priceToBook": info.get("PB Ratio"),
                        "dividendYield": info.get("Dividend Yield"),
                        "profitMargins": info.get("Profit Margin"),
                        "returnOnEquity": info.get("Return on Equity (ROE)"),
                        "beta": info.get("Beta"),
                        "grossMargins": info.get("Gross Margin"),
                        "operatingMargins": info.get("Operating Margin"),
                        "from_scrape": True,
                        "raw_stats": info,
                        "raw_company": company,
                    },
                    "scrape_meta": {
                        "base_path": scraped.get("base_path"),
                        "from_cache": scraped.get("from_cache"),
                    },
                }
        except Exception as e:
            return {"available": False, "error": f"yfinance miss; scrape failed: {e}"}
    return {"available": False, "error": "Financial statements not found on yfinance or stockanalysis for this ticker"}



# ---------- Country Ranking System ----------
import json as _json

def _ranking_search_dirs():
    """Resolve ranking JSON from several known locations (backend data, frontend data, Part 1)."""
    dirs = [
        RANKING_DIR,
        os.path.join(_BASE, "data", "country_ranking"),
        os.path.join(_BASE, "frontend", "data", "country_ranking"),
        os.path.join(_BASE, "frontend", "data"),
        os.path.join(_BASE, "frontend", "country-ranking", "data"),
    ]
    # FinSight monorepo Part 1
    root = os.environ.get("FINSIGHT_ROOT") or os.path.abspath(os.path.join(_BASE, ".."))
    dirs.append(os.path.join(root, "part1_country_ranking", "data"))
    dirs.append(os.path.join(root, "part1_country_ranking", "data", "country_ranking"))
    out = []
    for d in dirs:
        d = os.path.abspath(d)
        if os.path.isdir(d) and d not in out:
            out.append(d)
    return out

def _read_ranking(name):
    for d in _ranking_search_dirs():
        path = os.path.join(d, name)
        if os.path.exists(path):
            try:
                with open(path) as f:
                    return _json.load(f)
            except Exception:
                continue
    return None

@app.get("/api/ranking/list")
def ranking_list():
    ranks = _read_ranking("rank_list.json") or []
    se = _read_ranking("countries_with_stock_exchange.json") or []
    iso_meta = {c["iso3"]: c for c in se}
    out = []
    for r in ranks:
        iso = r.get("country")
        meta = iso_meta.get(iso, {})
        out.append({
            "rank": r.get("rank"),
            "iso3": iso,
            "country": meta.get("country_name") or _ISO_NAME.get(iso, iso),
            "final_score": r.get("final_score"),
            "region": meta.get("region"),
            "capital": meta.get("capitalCity"),
            "lat": meta.get("latitude"),
            "lng": meta.get("longitude"),
            "incomeLevel": meta.get("incomeLevel"),
        })
    return {
        "rankings": out,
        "disclaimer": "This ranking is produced by our system using multiple World Bank and structural indicators. Scores are on a 0–100 scale and are subject to change as data is refreshed.",
        "message": "FinSight Country Intelligence ranks stock-market economies with transparent multi-indicator scores across 11 analytical blocks.",
    }

@app.get("/api/ranking/country/{key}")
def ranking_country(key: str):
    """key can be ISO3 or full country name"""
    iso = key.upper() if len(key) == 3 else _NAME_ISO.get(key)
    if not iso:
        # try fuzzy
        for name, i in _NAME_ISO.items():
            if key.lower() in name.lower():
                iso = i
                break
    if not iso:
        raise HTTPException(404, "Country not in ranking universe")

    ranks = _read_ranking("rank_list.json") or []
    blocks = _read_ranking("block_performance.json") or []
    weights = _read_ranking("mother_sheet.json") or []
    se = _read_ranking("countries_with_stock_exchange.json") or []
    indicators = _read_ranking("indicator_performance.json") or []

    rank_row = next((r for r in ranks if r.get("country") == iso), None)
    block_row = next((b for b in blocks if b.get("country") == iso), None)
    weight_row = next((w for w in weights if w.get("country") == iso), None)
    meta = next((c for c in se if c.get("iso3") == iso), {})

    block_detail = []
    if block_row:
        for i in range(1, 12):
            k = f"Block_{i}"
            block_detail.append({
                "block": i,
                "name": BLOCK_NAMES.get(i, k),
                "score": block_row.get(k),
                "weight": (weight_row or {}).get(k),
            })

    # indicators for this country — exclude Innovation & Technology (block 9)
    sel = _read_ranking("selected_indicators.json") or []
    code_to_name = {}
    for s in sel:
        code_to_name[s.get("indicator_code")] = s.get("indicator_name") or s.get("indicator_code")

    ind = [x for x in indicators if x.get("country") == iso and int(x.get("block") or 0) != 9]
    ind_out = []
    for x in ind:
        b = int(x.get("block") or 0)
        ind_out.append({
            "block": b,
            "block_name": BLOCK_NAMES.get(b, f"Block {b}"),
            "indicator_code": x.get("indicator_code"),
            "indicator_name": code_to_name.get(x.get("indicator_code"), x.get("indicator_code")),
            "score": x.get("score_0_100"),
            "weight": x.get("indicator_weight"),
            "weighted_contribution": x.get("weighted_contribution"),
        })
    ind_out.sort(key=lambda x: (x["block"], -(x.get("score") or 0)))

    # filter blocks — drop Innovation & Technology (9)
    block_detail = [b for b in block_detail if b.get("block") != 9]

    # exchanges from stocks DB
    conn = get_db(); c = conn.cursor()
    raw_name = meta.get("country_name") or _ISO_NAME.get(iso, key)
    cname = normalize_country(raw_name)
    c.execute("""
        SELECT stock_exchange, exchange_code, COUNT(*) as cnt
        FROM stocks WHERE country = ? GROUP BY stock_exchange ORDER BY cnt DESC
    """, (cname,))
    exchanges = [{"exchange": r[0], "code": r[1], "count": r[2]} for r in c.fetchall()]
    if not exchanges:
        # try raw ranking name
        c.execute("""
            SELECT stock_exchange, exchange_code, COUNT(*) as cnt
            FROM stocks WHERE country = ? GROUP BY stock_exchange ORDER BY cnt DESC
        """, (raw_name,))
        exchanges = [{"exchange": r[0], "code": r[1], "count": r[2]} for r in c.fetchall()]
    conn.close()

    return {
        "iso3": iso,
        "country": cname,
        "rank": (rank_row or {}).get("rank"),
        "final_score": (rank_row or {}).get("final_score"),
        "meta": meta,
        "blocks": block_detail,
        "indicators": ind_out,
        "top_indicators": ind_out,
        "exchanges": exchanges,
        "disclaimer": "Ranking is model-based and subject to change.",
    }


@app.get("/api/industries")
def list_industries():
    conn = get_db(); c = conn.cursor()
    c.execute("""
        SELECT industry, COUNT(*) as cnt, COUNT(DISTINCT country) as countries, COUNT(DISTINCT sector) as sectors
        FROM stocks
        WHERE industry IS NOT NULL AND TRIM(industry) != '' AND industry != '—' AND industry != 'N/A'
        GROUP BY industry ORDER BY cnt DESC
    """)
    rows = [{"industry": r[0], "stocks": r[1], "countries": r[2], "sectors": r[3]} for r in c.fetchall()]
    conn.close()
    return rows

@app.get("/api/industry/{name}")
def industry_detail(name: str):
    conn = get_db(); c = conn.cursor()
    c.execute("SELECT COUNT(*) FROM stocks WHERE industry = ?", (name,))
    total = c.fetchone()[0]
    if total == 0:
        raise HTTPException(404, "Industry not found")
    c.execute("""
        SELECT country, COUNT(*) as cnt FROM stocks WHERE industry = ?
        GROUP BY country ORDER BY cnt DESC LIMIT 30
    """, (name,))
    by_country = [{"country": r[0], "count": r[1]} for r in c.fetchall()]
    c.execute("""
        SELECT sector, COUNT(*) as cnt FROM stocks WHERE industry = ? AND sector IS NOT NULL
        GROUP BY sector ORDER BY cnt DESC
    """, (name,))
    by_sector = [{"sector": r[0], "count": r[1]} for r in c.fetchall()]
    c.execute("""
        SELECT stock_exchange, exchange_code, COUNT(*) as cnt FROM stocks WHERE industry = ?
        GROUP BY stock_exchange ORDER BY cnt DESC LIMIT 15
    """, (name,))
    exchanges = [{"exchange": r[0], "code": r[1], "count": r[2]} for r in c.fetchall()]
    conn.close()
    return {"industry": name, "total_stocks": total, "by_country": by_country, "by_sector": by_sector, "top_exchanges": exchanges}

@app.get("/api/industry/{name}/stocks")
def industry_stocks(name: str, page: int = Query(1, ge=1), limit: int = Query(50, ge=1, le=200), q: Optional[str] = None):
    conn = get_db(); c = conn.cursor()
    clauses = ["industry = ?"]; params = [name]
    if q:
        clauses.append("(symbol LIKE ? OR company_name LIKE ?)")
        params.extend([f"%{q}%", f"%{q}%"])
    where = " WHERE " + " AND ".join(clauses)
    c.execute(f"SELECT COUNT(*) FROM stocks{where}", params)
    total = c.fetchone()[0]
    offset = (page - 1) * limit
    c.execute(f"""
        SELECT symbol, company_name, stock_exchange, exchange_code, industry, sector, country
        FROM stocks{where} ORDER BY company_name LIMIT ? OFFSET ?
    """, params + [limit, offset])
    results = [dict(r) for r in c.fetchall()]
    for r in results:
        r["sector"] = r.get("sector") or "—"
        r["industry"] = r.get("industry") or "—"
    conn.close()
    return {"total": total, "page": page, "limit": limit, "pages": math.ceil(total / limit) if limit else 1, "results": results}

@app.get("/api/overview/industries")
def overview_industries():
    conn = get_db(); c = conn.cursor()
    c.execute("""
        SELECT industry, COUNT(*) as cnt FROM stocks
        WHERE industry IS NOT NULL AND industry != ''
        GROUP BY industry ORDER BY cnt DESC LIMIT 15
    """)
    rows = [{"industry": r[0], "count": r[1]} for r in c.fetchall()]
    conn.close()
    return rows




@app.get("/api/stock-bundle/{symbol}")
def stock_bundle(symbol: str, exchange: Optional[str] = None, freq: str = "annual"):
    """
    Simultaneous multi-source fetch: yfinance + free Yahoo public API + web scrape.
    Results are compiled into one complete payload for the analysis UI.
    """
    if fetch_all_parallel is None:
        return {"available": False, "error": "multi_source module unavailable"}
    try:
        return fetch_all_parallel(symbol, exchange, freq)
    except Exception as e:
        return {"available": False, "error": str(e)[:300]}

@app.get("/api/scrape/{symbol}")
def scrape_endpoint(symbol: str, exchange: Optional[str] = None, sections: Optional[str] = None):
    """Direct stockanalysis.com scrape (fallback source). sections=comma list."""
    if not SA_AVAILABLE or not sa_scrape:
        return {"available": False, "error": "scraper module not loaded"}
    sec = [s.strip() for s in sections.split(",")] if sections else None
    return sa_scrape(symbol, exchange, sections=sec)


# Report routes are in backend/report_routes.py (included at app startup)




# ---------- Ops / DA exports ----------
@app.get("/api/admin/rebuild-packs")
def admin_rebuild_packs():
    """Rescan data/country_packs and rebuild in-memory index (no process restart)."""
    try:
        try:
            from backend.local_country_pack import rebuild_index, pack_stats
        except Exception:
            from local_country_pack import rebuild_index, pack_stats
        n = rebuild_index()
        st = pack_stats()
        cleared = 0
        try:
            try:
                from backend.report_engine import clear_report_cache
            except Exception:
                from report_engine import clear_report_cache
            cleared = clear_report_cache()
        except Exception:
            pass
        return {"ok": True, "index_entries": n, "cache_cleared": cleared, **st}
    except Exception as e:
        return JSONResponse({"ok": False, "error": str(e)[:300]}, status_code=500)


@app.get("/api/reports/csv/{symbol}")
def reports_csv(symbol: str, exchange: Optional[str] = None, statement: str = Query("income")):
    """CSV export of statement matrix for quant workflows."""
    import csv, io
    from fastapi.responses import StreamingResponse
    try:
        from backend.report_engine import collect_report_data, build_snapshot, matrix_with_yoy, income_metrics, ASSET_METRICS, LIABILITY_METRICS, EQUITY_METRICS, OPERATING_CF
    except Exception:
        from report_engine import collect_report_data, build_snapshot, matrix_with_yoy, income_metrics, ASSET_METRICS, LIABILITY_METRICS, EQUITY_METRICS, OPERATING_CF
    raw = collect_report_data(symbol, exchange)
    snap = build_snapshot(raw)
    table = snap.get("income") or {}
    metrics = income_metrics()
    st = (statement or "income").lower()
    if st == "balance":
        table = snap.get("balance") or {}
        metrics = ASSET_METRICS + LIABILITY_METRICS + EQUITY_METRICS
    elif st in ("cash", "cashflow"):
        table = snap.get("cashflow") or {}
        metrics = OPERATING_CF
    mx = matrix_with_yoy(table, metrics)
    periods = mx.get("periods") or []
    buf = io.StringIO()
    w = csv.writer(buf)
    w.writerow(["metric", "kind"] + periods)
    for row in mx.get("rows") or []:
        w.writerow([row.get("metric"), row.get("kind")] + list(row.get("values") or []))
    buf.seek(0)
    fname = f"FinSight_{symbol}_{(exchange or 'X').upper()}_{st}.csv"
    return StreamingResponse(
        iter([buf.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="{fname}"'},
    )


@app.get("/api/peers/{symbol}")
def peers_for_symbol(symbol: str, exchange: Optional[str] = None, limit: int = Query(15, ge=1, le=50)):
    """Same-industry peers from local DB (for relative context)."""
    symbol = (symbol or "").strip().upper()
    exchange = (exchange or "").strip().upper() or None
    conn = get_db()
    cur = conn.cursor()
    row = cur.execute(
        "SELECT industry, sector, exchange_code, country FROM stocks WHERE upper(symbol)=? AND (? IS NULL OR upper(exchange_code)=?) LIMIT 1",
        (symbol, exchange, exchange),
    ).fetchone()
    if not row or not row[0]:
        # try any exchange
        row = cur.execute(
            "SELECT industry, sector, exchange_code, country FROM stocks WHERE upper(symbol)=? LIMIT 1",
            (symbol,),
        ).fetchone()
    if not row or not row[0]:
        return {"available": False, "peers": [], "industry": None}
    industry, sector, ex_code, country = row
    peers = cur.execute(
        """SELECT symbol, company_name, exchange_code, country, sector, industry, pack_available, data_source, pack_available, data_source
           FROM stocks WHERE industry=? AND upper(symbol)!=? ORDER BY company_name LIMIT ?""",
        (industry, symbol, limit),
    ).fetchall()
    out = [
        {
            "symbol": p[0], "company_name": p[1], "exchange_code": p[2], "country": p[3],
            "sector": p[4], "industry": p[5],
            "pack_available": bool(p[6]) if p[6] is not None else False,
            "data_source": p[7],
        }
        for p in peers
    ]
    return {
        "available": True,
        "symbol": symbol,
        "industry": industry,
        "sector": sector,
        "peer_count": len(out),
        "peers": out,
    }


@app.get("/api/compare")
def compare_stocks(symbols: str = Query(..., description="Comma-separated symbols"), exchanges: Optional[str] = None):
    """Compare up to 5 symbols: live quote + key ratios side by side."""
    syms = [s.strip().upper() for s in symbols.split(",") if s.strip()][:5]
    exs = [e.strip() for e in (exchanges or "").split(",")] if exchanges else []
    while len(exs) < len(syms):
        exs.append("")
    out = []
    for i, sym in enumerate(syms):
        row = {"symbol": sym, "exchange": exs[i], "available": False}
        # live
        try:
            live = live_quote(sym, exs[i] or None)  # reuse
            if isinstance(live, dict):
                row.update({
                    "available": live.get("available", False),
                    "price": live.get("price"),
                    "currency": live.get("currency"),
                    "year_change": live.get("year_change"),
                    "market_cap": live.get("market_cap"),
                    "dividend_yield": live.get("dividend_yield"),
                })
                info = live.get("info") or {}
                row["pe"] = info.get("trailingPE")
                row["forward_pe"] = info.get("forwardPE")
                row["pb"] = info.get("priceToBook")
                row["eps"] = info.get("trailingEps")
                row["beta"] = info.get("beta")
                row["sector"] = info.get("sector")
                row["name"] = info.get("longName") or info.get("shortName") or sym
        except Exception as e:
            row["error"] = str(e)[:120]
        out.append(row)
    return {"symbols": syms, "rows": out}


# ---------- Serve frontend ----------


@app.get("/styles.css")
def landing_css():
    p = os.path.join(LANDING_DIR, "styles.css")
    if os.path.exists(p):
        return FileResponse(p, media_type="text/css")
    return JSONResponse({"error": "missing"}, status_code=404)

@app.get("/config.js")
def landing_config():
    p = os.path.join(LANDING_DIR, "config.js")
    if os.path.exists(p):
        return FileResponse(p, media_type="application/javascript")
    return JSONResponse({"error": "missing"}, status_code=404)

@app.get("/methodology.html")
def landing_methodology():
    for p in (os.path.join(LANDING_DIR, "methodology.html"), os.path.join(FRONTEND, "methodology.html")):
        if os.path.exists(p):
            return FileResponse(p)
    return JSONResponse({"error": "missing"}, status_code=404)

@app.get("/disclaimer.html")
def landing_disclaimer():
    for p in (os.path.join(LANDING_DIR, "disclaimer.html"), os.path.join(FRONTEND, "disclaimer.html")):
        if os.path.exists(p):
            return FileResponse(p)
    return JSONResponse({"error": "missing"}, status_code=404)

@app.get("/methodology")
def methodology_page():
    path = os.path.join(FRONTEND, "methodology.html")
    if os.path.exists(path):
        return FileResponse(path)
    return JSONResponse({"error": "Methodology page missing"}, status_code=404)

@app.get("/disclaimer.html")
@app.get("/disclaimer")
def disclaimer_page():
    path = os.path.join(FRONTEND, "disclaimer.html")
    if os.path.exists(path):
        return FileResponse(path)
    return JSONResponse({"error": "Disclaimer page missing"}, status_code=404)


# ---------------------------------------------------------------------------
# Part 3 (Sector Intelligence) API compatibility — same-origin /api/live/*
# ---------------------------------------------------------------------------
@app.get("/api/live/quote/{symbol}")
def part3_live_quote(symbol: str):
    """Alias used by Part 3 shared/live.js"""
    return live_quote(symbol)


@app.get("/api/live/history/{symbol}")
def part3_live_history(symbol: str, period: str = "1y", interval: str = "1d"):
    return price_history(symbol, period=period)


@app.get("/api/live/financials/{symbol}")
def part3_live_financials(symbol: str):
    return financials(symbol)


@app.get("/api/live/dividends/{symbol}")
def part3_live_dividends(symbol: str):
    """Minimal dividends endpoint for Part 3."""
    if not YF_AVAILABLE:
        return {"available": False, "error": "yfinance not installed", "symbol": symbol}
    try:
        import yfinance as yf
        t = yf.Ticker(symbol)
        divs = t.dividends
        if divs is None or (hasattr(divs, "empty") and divs.empty):
            return {"symbol": symbol, "dividends": []}
        out = [{"date": str(idx.date()), "amount": float(val)} for idx, val in divs.items()]
        return {"symbol": symbol, "dividends": out[-40:]}
    except Exception as e:
        return {"available": False, "error": str(e), "symbol": symbol}


@app.get("/api/stocks/{symbol}")
def part3_stock_profile(symbol: str):
    """Profile alias for Part 3."""
    return live_quote(symbol)

@app.get("/country-ranking")
@app.get("/country-ranking/")
def country_ranking_app():
    path = os.path.join(FRONTEND, "country-ranking", "index.html")
    if os.path.exists(path):
        return FileResponse(path)
    return JSONResponse({"error": "Country ranking app missing"}, status_code=404)

@app.get("/")
def root():
    # Prefer FinSight landing page
    landing = os.path.join(LANDING_DIR, "index.html")
    if os.path.exists(landing):
        return FileResponse(landing)
    index = os.path.join(FRONTEND, "index.html")
    if not os.path.exists(index):
        return JSONResponse({"error": "Frontend missing", "path": index}, status_code=500)
    return FileResponse(index)

@app.get("/equity")
@app.get("/equity/")
@app.get("/app")
@app.get("/app/")
def equity_app():
    index = os.path.join(FRONTEND, "index.html")
    if not os.path.exists(index):
        return JSONResponse({"error": "Global Equity frontend missing"}, status_code=500)
    return FileResponse(index)

@app.get("/sector")
@app.get("/sector/")
def sector_app():
    index = os.path.join(PART3_DIR, "index.html")
    if not os.path.exists(index):
        return JSONResponse({"error": "Sector Intelligence frontend missing"}, status_code=500)
    return FileResponse(index)

@app.get("/api/finsight-meta")
def finsight_meta():
    return {
        "landing": os.path.exists(os.path.join(LANDING_DIR, "index.html")),
        "part1": os.path.isdir(PART1_DIR),
        "part2_frontend": os.path.exists(os.path.join(FRONTEND, "index.html")),
        "part3": os.path.isdir(PART3_DIR),
        "part3_url": PART3_URL,
        "finsight_root": FINSIGHT_ROOT,
        "unified": True,
    }

# SPA fallbacks for equity frontend routes (must be before static mounts)
@app.get("/exchange/{code}")
@app.get("/stocks/{code}")
@app.get("/analysis/{symbol}")
@app.get("/country/{name}")
def equity_spa_fallback(code: str = None, symbol: str = None, name: str = None):
    return FileResponse(os.path.join(FRONTEND, "index.html"))


# ---------------------------------------------------------------------------
# Static mounts — order matters (specific paths first)
# All served from the SAME origin / same process — no cross-port links.
# ---------------------------------------------------------------------------
if os.path.isdir(LANDING_DIR):
    # CSS/JS/assets for landing (index itself served by / route)
    app.mount("/landing-static", StaticFiles(directory=LANDING_DIR), name="landing-static")

if os.path.isdir(PART1_DIR):
    app.mount("/country-ranking", StaticFiles(directory=PART1_DIR, html=True), name="country-ranking")

if os.path.isdir(PART3_DIR):
    # Sector Intelligence full tree (HTML, shared/, data/, part*/ )
    app.mount("/sector", StaticFiles(directory=PART3_DIR, html=True), name="sector")

if os.path.isdir(FRONTEND):
    app.mount("/static", StaticFiles(directory=FRONTEND), name="static")
    # Equity SPA assets also under /equity-static for clarity
    app.mount("/equity-static", StaticFiles(directory=FRONTEND), name="equity-static")

if __name__ == "__main__":
    import uvicorn
    port = int(os.environ.get("PORT", "8000"))
    print("=" * 60)
    print("  FinSight Investment Platform (unified)")
    print(f"  Root: {FINSIGHT_ROOT}")
    print(f"  DB:   {DB_PATH}  exists={os.path.exists(DB_PATH)}")
    print(f"  Open: http://0.0.0.0:{port}/")
    print("  Routes: /  /country-ranking/  /equity/  /sector/")
    print("=" * 60)
    uvicorn.run(app, host="0.0.0.0", port=port)
