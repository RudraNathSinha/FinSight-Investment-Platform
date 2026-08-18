#!/usr/bin/env python3
"""
Fetch live stock data via yfinance and save/update JSON under data/live/{SYMBOL}.json
Usage:
  python _fetch_stock.py AAPL
  python _fetch_stock.py AAPL MSFT GOOGL
  python _fetch_stock.py --from-universe 30   # top N symbols from universe (slow)
"""
from __future__ import annotations

import argparse
import json
import math
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

import pandas as pd
import yfinance as yf

LIVE_DIR = Path(__file__).resolve().parent
UNIVERSE_PATH = LIVE_DIR.parent / "stocks_universe.json"

# polite delay between symbols (seconds)
SLEEP_BETWEEN = 1.5
SLEEP_BETWEEN_HISTORY = 0.4

QUOTE_KEYS = [
    "symbol", "shortName", "longName", "sector", "industry", "country",
    "exchange", "currency", "marketCap", "enterpriseValue",
    "trailingPE", "forwardPE", "dividendYield", "payoutRatio",
    "profitMargins", "operatingMargins", "grossMargins",
    "returnOnEquity", "returnOnAssets", "revenueGrowth", "earningsGrowth",
    "currentPrice", "regularMarketPrice", "previousClose", "open",
    "dayLow", "dayHigh", "fiftyTwoWeekLow", "fiftyTwoWeekHigh",
    "volume", "averageVolume", "targetMeanPrice", "recommendationKey",
    "numberOfAnalystOpinions", "fullTimeEmployees", "longBusinessSummary",
    "website", "quoteType", "financialCurrency",
]

PERIODS = {
    "1d":  ("1d", "5m"),
    "7d":  ("5d", "15m"),
    "1mo": ("1mo", "1d"),
    "6mo": ("6mo", "1d"),
    "1y":  ("1y", "1d"),
    "5y":  ("5y", "1wk"),
    "10y": ("10y", "1wk"),
}


def clean_val(v):
    if v is None:
        return None
    if isinstance(v, float) and (math.isnan(v) or math.isinf(v)):
        return None
    if hasattr(v, "item"):
        try:
            v = v.item()
        except Exception:
            return None
        if isinstance(v, float) and (math.isnan(v) or math.isinf(v)):
            return None
    return v


def frame_to_records(df: pd.DataFrame | None):
    if df is None or df.empty:
        return []
    out = df.copy()
    # index may be dates
    if not isinstance(out.index, pd.RangeIndex):
        out = out.reset_index()
    # stringify datetimes
    for col in out.columns:
        if pd.api.types.is_datetime64_any_dtype(out[col]):
            out[col] = out[col].astype(str)
        elif out[col].dtype == object:
            out[col] = out[col].apply(lambda x: str(x) if hasattr(x, "isoformat") else x)
    records = out.where(pd.notnull(out), None).to_dict(orient="records")
    for r in records:
        for k, v in list(r.items()):
            r[k] = clean_val(v)
    return records


def financial_frame(df: pd.DataFrame | None):
    if df is None or df.empty:
        return []
    df = df.copy()
    df.columns = [str(c) for c in df.columns]
    df.insert(0, "Metric", df.index.astype(str))
    df = df.reset_index(drop=True)
    return frame_to_records(df)


def fetch_symbol(symbol: str) -> dict:
    symbol = symbol.upper().strip()
    print(f"  → fetching {symbol} ...", flush=True)
    t = yf.Ticker(symbol)

    # --- quote / info ---
    try:
        info = t.info or {}
    except Exception as e:
        print(f"    warn info: {e}")
        info = {}
    quote = {k: clean_val(info.get(k)) for k in QUOTE_KEYS}
    if not quote.get("symbol"):
        quote["symbol"] = symbol
    # normalize price
    if quote.get("currentPrice") is None:
        quote["currentPrice"] = quote.get("regularMarketPrice") or quote.get("previousClose")

    time.sleep(SLEEP_BETWEEN_HISTORY)

    # --- history for multiple periods ---
    history = {}
    for label, (period, interval) in PERIODS.items():
        try:
            hist = t.history(period=period, interval=interval)
            history[label] = frame_to_records(hist)
            print(f"    history {label}: {len(history[label])} bars", flush=True)
        except Exception as e:
            print(f"    warn history {label}: {e}")
            history[label] = []
        time.sleep(SLEEP_BETWEEN_HISTORY)

    # --- financials ---
    financials = {}
    try:
        financials = {
            "income_statement": financial_frame(getattr(t, "financials", None)),
            "balance_sheet": financial_frame(getattr(t, "balance_sheet", None)),
            "cashflow": financial_frame(getattr(t, "cashflow", None)),
            "quarterly_income": financial_frame(getattr(t, "quarterly_financials", None)),
            "quarterly_balance": financial_frame(getattr(t, "quarterly_balance_sheet", None)),
            "quarterly_cashflow": financial_frame(getattr(t, "quarterly_cashflow", None)),
        }
        print(f"    financials ok", flush=True)
    except Exception as e:
        print(f"    warn financials: {e}")
        financials = {}

    # --- dividends ---
    dividends = []
    try:
        div = t.dividends
        if div is not None and len(div):
            tmp = div.reset_index()
            tmp.columns = ["Date", "Dividend"]
            dividends = frame_to_records(tmp)
        print(f"    dividends: {len(dividends)}", flush=True)
    except Exception as e:
        print(f"    warn dividends: {e}")

    payload = {
        "symbol": symbol,
        "updated_at": datetime.now(timezone.utc).isoformat(),
        "quote": quote,
        "history": history,
        "financials": financials,
        "dividends": dividends,
    }
    return payload


def save_symbol(payload: dict) -> Path:
    path = LIVE_DIR / f"{payload['symbol']}.json"
    with open(path, "w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False, indent=2)
    # update index
    update_index(payload["symbol"], payload.get("updated_at"))
    return path


def update_index(symbol: str, updated_at: str | None):
    idx_path = LIVE_DIR / "_index.json"
    if idx_path.exists():
        try:
            idx = json.loads(idx_path.read_text())
        except Exception:
            idx = {}
    else:
        idx = {}
    idx[symbol] = updated_at or datetime.now(timezone.utc).isoformat()
    idx_path.write_text(json.dumps(idx, indent=2))


def load_universe_symbols(n: int) -> list[str]:
    if not UNIVERSE_PATH.exists():
        return []
    data = json.loads(UNIVERSE_PATH.read_text())
    syms = []
    for r in data:
        s = r.get("Symbol")
        if s and s not in syms:
            syms.append(s)
        if len(syms) >= n:
            break
    return syms


def main():
    ap = argparse.ArgumentParser(description="Fetch yfinance data → data/live/{SYM}.json")
    ap.add_argument("symbols", nargs="*", help="Ticker symbols")
    ap.add_argument("--from-universe", type=int, default=0, help="Fetch first N from universe")
    ap.add_argument("--sleep", type=float, default=SLEEP_BETWEEN, help="Seconds between symbols")
    args = ap.parse_args()

    symbols = [s.upper() for s in args.symbols]
    if args.from_universe > 0:
        symbols.extend(load_universe_symbols(args.from_universe))
    # unique preserve order
    seen = set()
    symbols = [s for s in symbols if not (s in seen or seen.add(s))]

    if not symbols:
        print("No symbols provided. Example: python _fetch_stock.py AAPL MSFT")
        sys.exit(1)

    print(f"Fetching {len(symbols)} symbol(s) → {LIVE_DIR}")
    for i, sym in enumerate(symbols):
        try:
            payload = fetch_symbol(sym)
            path = save_symbol(payload)
            print(f"  ✓ saved {path.name} ({path.stat().st_size // 1024} KB)")
        except Exception as e:
            print(f"  ✗ {sym} failed: {e}")
        if i < len(symbols) - 1:
            time.sleep(args.sleep)

    print("Done.")


if __name__ == "__main__":
    main()
