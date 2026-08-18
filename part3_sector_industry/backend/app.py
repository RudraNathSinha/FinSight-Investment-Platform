"""
© All rights reserved FinSight prepared by Rudra Nath Sinha

FinSight — Flask backend for Part 3 live stock data (yfinance),
TTL response cache, server-side PDF reports, and static frontend.
"""
from __future__ import annotations

import math
import time
from pathlib import Path
from typing import Any, Callable

import pandas as pd
from flask import Flask, Response, jsonify, request, send_from_directory

try:
    from cachetools import TTLCache
except ImportError:  # pragma: no cover
    TTLCache = None  # type: ignore

BASE = Path(__file__).resolve().parent.parent  # webapp/
DATA = BASE / "data"
ARTIFACTS = BASE.parent
STOCK_RANKING = ARTIFACTS / "stock_wise_ranking"

# static_url_path="" steals /<path> and 404s directories; we serve files via static_proxy only
app = Flask(__name__, static_folder=None)

# ---------------------------------------------------------------------------
# CORS
# ---------------------------------------------------------------------------
@app.after_request
def add_cors(resp):
    resp.headers["Access-Control-Allow-Origin"] = "*"
    resp.headers["Access-Control-Allow-Methods"] = "GET, POST, OPTIONS"
    resp.headers["Access-Control-Allow-Headers"] = "Content-Type"
    return resp


@app.route("/api/<path:_any>", methods=["OPTIONS"])
def cors_preflight(_any: str):
    return ("", 204)


SECTOR_FILE = {
    "Communication Services": "Final_Ranking_Communication Services.xlsx",
    "Consumer Discretionary": "Final_Ranking_Consumer Discretionary.xlsx",
    "Consumer Staples": "Final_Ranking_Consumer Staples.xlsx",
    "Energy": "Final_Ranking_Energy.xlsx",
    "Financials": "Final_Ranking_Financials.xlsx",
    "Healthcare": "Final_Ranking_Healthcare.xlsx",
    "Industrials": "Final_Ranking_Industrials.xlsx",
    "Materials": "Final_Ranking_Materials.xlsx",
    "Real Estate": "Final_Ranking_Real Estate.xlsx",
    "Technology": "Final_Ranking_Technology.xlsx",
    "Utilities": "Final_Ranking_Utilities.xlsx",
}

# ---------------------------------------------------------------------------
# TTL caches (point 4)
# quote ~60s, history ~5min, financials/dividends ~15min, profile ~10min
# ---------------------------------------------------------------------------
if TTLCache is not None:
    _cache_quote = TTLCache(maxsize=512, ttl=60)
    _cache_history = TTLCache(maxsize=256, ttl=300)
    _cache_financials = TTLCache(maxsize=256, ttl=900)
    _cache_dividends = TTLCache(maxsize=256, ttl=900)
    _cache_profile = TTLCache(maxsize=512, ttl=600)
else:
    _cache_quote = {}
    _cache_history = {}
    _cache_financials = {}
    _cache_dividends = {}
    _cache_profile = {}

_CACHE_STATS = {"hits": 0, "misses": 0}


def _cache_get(store: Any, key: str) -> Any:
    try:
        if key in store:
            _CACHE_STATS["hits"] += 1
            return store[key]
    except Exception:
        pass
    _CACHE_STATS["misses"] += 1
    return None


def _cache_set(store: Any, key: str, value: Any) -> None:
    try:
        store[key] = value
    except Exception:
        pass


def _json_safe(obj: Any) -> Any:
    if obj is None:
        return None
    if isinstance(obj, dict):
        return {k: _json_safe(v) for k, v in obj.items()}
    if isinstance(obj, (list, tuple)):
        return [_json_safe(v) for v in obj]
    if isinstance(obj, float):
        if math.isnan(obj) or math.isinf(obj):
            return None
        return obj
    if hasattr(obj, "item"):
        try:
            return _json_safe(obj.item())
        except Exception:
            return None
    try:
        if pd.isna(obj):
            return None
    except Exception:
        pass
    return obj


def _df_records(df: pd.DataFrame | None) -> list | None:
    if df is None or (hasattr(df, "empty") and df.empty):
        return None
    df = df.copy()
    df = df.replace([float("inf"), float("-inf")], pd.NA)
    records = df.where(pd.notnull(df), None).to_dict(orient="records")
    return _json_safe(records)


# ---------------------------------------------------------------------------
# Health + cache stats
# ---------------------------------------------------------------------------
@app.get("/api/health")
def health():
    return jsonify(
        {
            "status": "ok",
            "service": "FinSight Flask",
            "live": True,
            "cache": dict(_CACHE_STATS),
            "ts": int(time.time()),
            "author": "Rudra Nath Sinha",
        }
    )


# ---------------------------------------------------------------------------
# Live quote
# ---------------------------------------------------------------------------
@app.get("/api/live/quote/<symbol>")
def live_quote(symbol: str):
    key = symbol.upper().strip()
    if not key:
        return jsonify({"error": "Symbol required", "code": "EMPTY_SYMBOL"}), 400
    cached = _cache_get(_cache_quote, key)
    if cached is not None:
        return jsonify(cached)
    try:
        import yfinance as yf

        t = yf.Ticker(key)
        info = t.info or {}
        if not info or (info.get("trailingPegRatio") is None and info.get("symbol") is None and not info.get("shortName") and not info.get("regularMarketPrice") and not info.get("currentPrice")):
            # yfinance sometimes returns sparse dict for bad tickers
            if not info.get("shortName") and not info.get("longName") and info.get("regularMarketPrice") is None and info.get("currentPrice") is None:
                return jsonify({"error": f"No quote data for {key}", "code": "NO_DATA", "symbol": key}), 404
        keys = [
            "symbol", "shortName", "longName", "sector", "industry", "country",
            "exchange", "fullExchangeName", "currency", "marketCap", "enterpriseValue",
            "trailingPE", "forwardPE", "dividendYield", "payoutRatio",
            "profitMargins", "operatingMargins", "grossMargins",
            "returnOnEquity", "returnOnAssets", "revenueGrowth", "earningsGrowth",
            "currentPrice", "previousClose", "open", "dayLow", "dayHigh",
            "fiftyTwoWeekLow", "fiftyTwoWeekHigh", "volume", "averageVolume",
            "targetMeanPrice", "recommendationKey", "numberOfAnalystOpinions",
            "fullTimeEmployees", "longBusinessSummary", "website",
            "dividendRate", "exDividendDate", "fiveYearAvgDividendYield",
            "trailingEps", "forwardEps", "bookValue", "priceToBook",
            "enterpriseToRevenue", "enterpriseToEbitda", "beta",
            "heldPercentInsiders", "heldPercentInstitutions", "floatShares",
            "sharesOutstanding", "impliedSharesOutstanding",
            "totalCash", "totalDebt", "totalRevenue", "ebitda", "netIncomeToCommon",
            "grossProfits", "debtToEquity", "currentRatio", "priceToSalesTrailing12Months",
            "companyOfficers",
        ]
        out = {k: info.get(k) for k in keys if info.get(k) is not None}
        out["symbol"] = key
        if "currentPrice" not in out and info.get("regularMarketPrice") is not None:
            out["currentPrice"] = info.get("regularMarketPrice")
        safe = _json_safe(out)
        _cache_set(_cache_quote, key, safe)
        return jsonify(safe)
    except Exception as e:
        return jsonify({"error": str(e), "code": "UPSTREAM", "symbol": key}), 502


@app.get("/api/live/history/<symbol>")
def live_history(symbol: str):
    key = symbol.upper().strip()
    period = request.args.get("period", "1y")
    interval = request.args.get("interval", "1d")
    ckey = f"{key}|{period}|{interval}"
    cached = _cache_get(_cache_history, ckey)
    if cached is not None:
        return jsonify(cached)
    try:
        import yfinance as yf

        t = yf.Ticker(key)
        hist = t.history(period=period, interval=interval)
        if hist is None or hist.empty:
            return jsonify({"error": f"No history for {key}", "code": "NO_DATA", "symbol": key}), 404
        hist = hist.reset_index()
        for col in hist.columns:
            dtype = str(hist[col].dtype).lower()
            if "datetime" in dtype or "date" in dtype or hasattr(hist[col].dtype, "tz"):
                hist[col] = hist[col].astype(str)
        records = _df_records(hist)
        _cache_set(_cache_history, ckey, records)
        return jsonify(records)
    except Exception as e:
        return jsonify({"error": str(e), "code": "UPSTREAM", "symbol": key}), 502


@app.get("/api/live/financials/<symbol>")

def live_financials(symbol: str):
    key = symbol.upper().strip()
    cached = _cache_get(_cache_financials, key)
    if cached is not None:
        return jsonify(cached)
    try:
        import yfinance as yf

        t = yf.Ticker(key)

        def as_metric_records(df):
            """Rows shaped for Part 3 isParseMatrix: [{Metric, 'YYYY-MM-DD': val, ...}, ...]"""
            if df is None or getattr(df, "empty", True):
                return []
            d = df.copy()
            # index = line items, columns = periods
            d.columns = [str(c)[:10] if hasattr(c, "year") or "20" in str(c) else str(c) for c in d.columns]
            # Normalize column labels to date-like strings
            new_cols = []
            for c in d.columns:
                s = str(c)
                # Timestamp / datetime string
                if len(s) >= 10 and s[0:4].isdigit():
                    new_cols.append(s[:10])
                else:
                    new_cols.append(s)
            d.columns = new_cols
            d = d.reset_index()
            # first column is metric name
            idx_col = d.columns[0]
            d = d.rename(columns={idx_col: "Metric"})
            d["Metric"] = d["Metric"].astype(str)
            records = d.where(pd.notnull(d), None).to_dict(orient="records")
            return _json_safe(records) or []

        income = as_metric_records(getattr(t, "financials", None))
        income_q = as_metric_records(getattr(t, "quarterly_financials", None))
        balance = as_metric_records(getattr(t, "balance_sheet", None))
        balance_q = as_metric_records(getattr(t, "quarterly_balance_sheet", None))
        cashflow = as_metric_records(getattr(t, "cashflow", None))
        cashflow_q = as_metric_records(getattr(t, "quarterly_cashflow", None))

        if not any([income, income_q, balance, balance_q, cashflow, cashflow_q]):
            return jsonify({"error": f"No financials for {key}", "code": "NO_DATA", "symbol": key}), 404

        # Primary keys expected by Part 3 UI + quarterly aliases used in the frontend
        payload = {
            "symbol": key,
            "income_statement": income,
            "quarterly_income": income_q,
            "income_statement_quarterly": income_q,
            "balance_sheet": balance,
            "quarterly_balance": balance_q,
            "balance_sheet_quarterly": balance_q,
            "cashflow": cashflow,
            "quarterly_cashflow": cashflow_q,
            "cashflow_quarterly": cashflow_q,
        }
        safe = _json_safe(payload)
        _cache_set(_cache_financials, key, safe)
        return jsonify(safe)
    except Exception as e:
        return jsonify({"error": str(e), "code": "UPSTREAM", "symbol": key}), 502


@app.get("/api/live/dividends/<symbol>")
def live_dividends(symbol: str):
    key = symbol.upper().strip()
    cached = _cache_get(_cache_dividends, key)
    if cached is not None:
        return jsonify(cached)
    try:
        import yfinance as yf

        t = yf.Ticker(key)
        div = t.dividends
        if div is None or (hasattr(div, "empty") and div.empty):
            payload = {"symbol": key, "dividends": []}
            _cache_set(_cache_dividends, key, payload)
            return jsonify(payload)
        df = div.reset_index()
        df.columns = ["Date", "Dividend"]
        df["Date"] = df["Date"].astype(str)
        payload = {"symbol": key, "dividends": _df_records(df) or []}
        _cache_set(_cache_dividends, key, payload)
        return jsonify(payload)
    except Exception as e:
        return jsonify({"error": str(e), "code": "UPSTREAM", "symbol": key}), 502


@app.get("/api/stocks/<symbol>")
def stock_profile(symbol: str):
    """Offline ranking profile + live quote blend."""
    key = symbol.upper().strip()
    cached = _cache_get(_cache_profile, key)
    if cached is not None:
        return jsonify(cached)
    profile: dict[str, Any] = {"symbol": key}
    # try ranking files
    try:
        if STOCK_RANKING.is_dir():
            for xlsx in STOCK_RANKING.glob("*.xlsx"):
                try:
                    df = pd.read_excel(xlsx)
                    cols = {c.lower(): c for c in df.columns}
                    sym_col = cols.get("symbol") or cols.get("ticker")
                    if not sym_col:
                        continue
                    hit = df[df[sym_col].astype(str).str.upper() == key]
                    if not hit.empty:
                        profile["ranking"] = _json_safe(hit.iloc[0].to_dict())
                        profile["ranking_file"] = xlsx.name
                        break
                except Exception:
                    continue
    except Exception:
        pass
    _cache_set(_cache_profile, key, profile)
    return jsonify(profile)


# ---------------------------------------------------------------------------
# Server-side PDF (point 3)
# ---------------------------------------------------------------------------
@app.post("/api/reports/pdf")
def reports_pdf():
    """
    Accepts JSON: { "html": "<html>...</html>", "filename": "report.pdf" }
    Returns application/pdf via WeasyPrint.
    """
    data = request.get_json(silent=True) or {}
    html = data.get("html") or ""
    filename = (data.get("filename") or "finsight-report.pdf").replace("/", "_")
    if not html or len(html) < 40:
        return jsonify({"error": "html body required", "code": "BAD_REQUEST"}), 400
    if len(html) > 8_000_000:
        return jsonify({"error": "html too large", "code": "BAD_REQUEST"}), 413
    try:
        from weasyprint import HTML

        pdf_bytes = HTML(string=html, base_url=str(BASE)).write_pdf()
        return Response(
            pdf_bytes,
            mimetype="application/pdf",
            headers={
                "Content-Disposition": f'attachment; filename="{filename}"',
                "X-FinSight-Author": "Rudra Nath Sinha",
            },
        )
    except Exception as e:
        return jsonify({"error": f"PDF engine failed: {e}", "code": "PDF_ENGINE"}), 500


@app.get("/api/cache/stats")
def cache_stats():
    return jsonify({"status": "ok", "cache": dict(_CACHE_STATS)})


@app.post("/api/cache/clear")
def cache_clear():
    for store in (_cache_quote, _cache_history, _cache_financials, _cache_dividends, _cache_profile):
        try:
            store.clear()
        except Exception:
            pass
    _CACHE_STATS["hits"] = 0
    _CACHE_STATS["misses"] = 0
    return jsonify({"status": "cleared"})


# ---------------------------------------------------------------------------
# Static frontend
# ---------------------------------------------------------------------------
@app.route("/")
def index():
    return send_from_directory(str(BASE), "index.html")


@app.route("/<path:path>")
def static_proxy(path: str):
    if path.startswith("api/"):
        return jsonify({"error": "Not found"}), 404
    # Normalize and resolve under webapp/
    path = path.lstrip("/").rstrip("/")
    target = (BASE / path).resolve()
    try:
        target.relative_to(BASE.resolve())
    except ValueError:
        return jsonify({"error": "Invalid path"}), 400

    # Directory → index.html
    if target.is_dir():
        index = target / "index.html"
        if index.is_file():
            return send_from_directory(str(target), "index.html")
        return jsonify({"error": "Not found", "path": path}), 404

    # Explicit file
    if target.is_file():
        return send_from_directory(str(target.parent), target.name)

    # Fallback: treat as folder with index
    index = BASE / path / "index.html"
    if index.is_file():
        return send_from_directory(str(index.parent), "index.html")

    return jsonify({"error": "Not found", "path": path}), 404


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=int(__import__("os").environ.get("PORT", 5000)), debug=False)
