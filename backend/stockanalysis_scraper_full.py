#!/usr/bin/env python3
"""
StockAnalysis.com Full Scraper
- Supports two URL patterns:
  1. /stocks/{symbol}/          (major listings)
  2. /quote/{exchange}/{symbol}/ (other exchanges)
- Automatically falls back to quote path on 404
- Includes History section
- Random short / average / long sleeps
- Saves everything to a clean JSON file
"""

import requests
from bs4 import BeautifulSoup
import json
import time
import random
from datetime import datetime
import re
import sys


# ============================================================
# Random Sleep Functions
# ============================================================

def short_sleep():
    """Short random sleep (1–3 seconds)"""
    delay = random.uniform(1.0, 3.0)
    print(f"⏳ Short sleep: {delay:.2f}s")
    time.sleep(delay)


def avg_sleep():
    """Average random sleep (3–7 seconds)"""
    delay = random.uniform(3.0, 7.0)
    print(f"⏳ Average sleep: {delay:.2f}s")
    time.sleep(delay)


def long_sleep():
    """Long random sleep (8–15 seconds)"""
    delay = random.uniform(8.0, 15.0)
    print(f"⏳ Long sleep: {delay:.2f}s")
    time.sleep(delay)


# ============================================================
# Headers + Core Helper
# ============================================================

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
                  "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Accept-Language": "en-US,en;q=0.9",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
    "Referer": "https://stockanalysis.com/",
}


def get_soup(url: str):
    """Fetch a page and return BeautifulSoup object. Returns None on 404 or error."""
    try:
        response = requests.get(url, headers=HEADERS, timeout=25)
        if response.status_code == 404:
            print(f"🚫 404 Not Found → {url}")
            return None
        response.raise_for_status()
        return BeautifulSoup(response.text, "html.parser")
    except Exception as e:
        print(f"❌ Error fetching {url}: {e}")
        return None


def _scrape_table_page(url: str, section_name: str) -> dict:
    """Generic helper that extracts all tables from a page."""
    soup = get_soup(url)
    if not soup:
        return {"error": f"Failed to load {section_name}", "url": url}

    data = {
        "url": url,
        "section": section_name,
        "scraped_at": datetime.now().isoformat(),
        "tables": []
    }

    tables = soup.select("table")
    for i, table in enumerate(tables):
        headers = [th.get_text(strip=True) for th in table.select("thead th")]
        if not headers:
            headers = [th.get_text(strip=True) for th in table.select("tr th")]

        rows = []
        for tr in table.select("tbody tr") or table.select("tr")[1:]:
            cells = [td.get_text(strip=True) for td in tr.select("td")]
            if cells:
                rows.append(cells)

        data["tables"].append({
            "table_index": i,
            "headers": headers,
            "rows": rows
        })

    return data


# ============================================================
# SET 1: Primary Path  →  /stocks/{symbol}/
# ============================================================

def scrape_overview_stocks(symbol: str) -> dict:
    url = f"https://stockanalysis.com/stocks/{symbol.lower()}/"
    print(f"\n📊 [stocks] Overview → {url}")
    soup = get_soup(url)
    if not soup:
        return {"error": "Failed", "url": url}

    data = {"url": url, "scraped_at": datetime.now().isoformat()}
    title = soup.select_one("h1")
    data["company_name"] = title.get_text(strip=True) if title else None

    price_tag = soup.select_one("[data-test='price']") or soup.select_one(".text-4xl")
    data["price"] = price_tag.get_text(strip=True) if price_tag else None

    stats = {}
    for row in soup.select("table tr"):
        cols = row.find_all(["td", "th"])
        if len(cols) >= 2:
            key = cols[0].get_text(strip=True)
            val = cols[1].get_text(strip=True)
            if key:
                stats[key] = val
    data["key_stats"] = stats
    return data


def scrape_financials_stocks(symbol: str) -> dict:
    url = f"https://stockanalysis.com/stocks/{symbol.lower()}/financials/"
    print(f"\n📈 [stocks] Financials → {url}")
    return _scrape_table_page(url, "financials")


def scrape_income_statement_stocks(symbol: str) -> dict:
    url = f"https://stockanalysis.com/stocks/{symbol.lower()}/financials/income-statement/"
    print(f"\n💰 [stocks] Income Statement → {url}")
    return _scrape_table_page(url, "income_statement")


def scrape_balance_sheet_stocks(symbol: str) -> dict:
    url = f"https://stockanalysis.com/stocks/{symbol.lower()}/financials/balance-sheet/"
    print(f"\n🏦 [stocks] Balance Sheet → {url}")
    return _scrape_table_page(url, "balance_sheet")


def scrape_cash_flow_stocks(symbol: str) -> dict:
    url = f"https://stockanalysis.com/stocks/{symbol.lower()}/financials/cash-flow-statement/"
    print(f"\n💵 [stocks] Cash Flow → {url}")
    return _scrape_table_page(url, "cash_flow")


def scrape_ratios_stocks(symbol: str) -> dict:
    url = f"https://stockanalysis.com/stocks/{symbol.lower()}/financials/ratios/"
    print(f"\n📐 [stocks] Ratios → {url}")
    return _scrape_table_page(url, "ratios")


def scrape_statistics_stocks(symbol: str) -> dict:
    url = f"https://stockanalysis.com/stocks/{symbol.lower()}/statistics/"
    print(f"\n📉 [stocks] Statistics → {url}")
    return _scrape_table_page(url, "statistics")


def scrape_market_cap_stocks(symbol: str) -> dict:
    url = f"https://stockanalysis.com/stocks/{symbol.lower()}/market-cap/"
    print(f"\n🏛️ [stocks] Market Cap → {url}")
    return _scrape_table_page(url, "market_cap")


def scrape_revenue_stocks(symbol: str) -> dict:
    url = f"https://stockanalysis.com/stocks/{symbol.lower()}/revenue/"
    print(f"\n📦 [stocks] Revenue → {url}")
    return _scrape_table_page(url, "revenue")


def scrape_metrics_stocks(symbol: str) -> dict:
    url = f"https://stockanalysis.com/stocks/{symbol.lower()}/metrics/"
    print(f"\n📏 [stocks] Metrics → {url}")
    return _scrape_table_page(url, "metrics")


def scrape_dividend_stocks(symbol: str) -> dict:
    url = f"https://stockanalysis.com/stocks/{symbol.lower()}/dividend/"
    print(f"\n🎁 [stocks] Dividend → {url}")
    return _scrape_table_page(url, "dividend")


def scrape_profile_stocks(symbol: str) -> dict:
    url = f"https://stockanalysis.com/stocks/{symbol.lower()}/company/"
    print(f"\n🏢 [stocks] Profile → {url}")
    soup = get_soup(url)
    if not soup:
        return {"error": "Failed", "url": url}

    data = {"url": url, "scraped_at": datetime.now().isoformat()}
    desc = soup.select_one("p")
    data["description"] = desc.get_text(strip=True) if desc else None

    details = {}
    for row in soup.select("table tr"):
        cols = row.find_all(["td", "th"])
        if len(cols) >= 2:
            key = cols[0].get_text(strip=True)
            val = cols[1].get_text(strip=True)
            if key:
                details[key] = val
    data["company_details"] = details
    return data


def scrape_history_stocks(symbol: str) -> dict:
    url = f"https://stockanalysis.com/stocks/{symbol.lower()}/history/"
    print(f"\n📅 [stocks] History → {url}")
    return _scrape_table_page(url, "history")


# ============================================================
# SET 2: Quote Path  →  /quote/{exchange}/{symbol}/
# ============================================================

def scrape_overview_quote(exchange: str, symbol: str) -> dict:
    url = f"https://stockanalysis.com/quote/{exchange.lower()}/{symbol.upper()}/"
    print(f"\n📊 [quote] Overview → {url}")
    soup = get_soup(url)
    if not soup:
        return {"error": "Failed", "url": url}

    data = {"url": url, "scraped_at": datetime.now().isoformat()}
    title = soup.select_one("h1")
    data["company_name"] = title.get_text(strip=True) if title else None

    price_tag = soup.select_one("[data-test='price']") or soup.select_one(".text-4xl")
    data["price"] = price_tag.get_text(strip=True) if price_tag else None

    stats = {}
    for row in soup.select("table tr"):
        cols = row.find_all(["td", "th"])
        if len(cols) >= 2:
            key = cols[0].get_text(strip=True)
            val = cols[1].get_text(strip=True)
            if key:
                stats[key] = val
    data["key_stats"] = stats
    return data


def scrape_financials_quote(exchange: str, symbol: str) -> dict:
    url = f"https://stockanalysis.com/quote/{exchange.lower()}/{symbol.upper()}/financials/"
    print(f"\n📈 [quote] Financials → {url}")
    return _scrape_table_page(url, "financials")


def scrape_income_statement_quote(exchange: str, symbol: str) -> dict:
    # On many quote pages the income statement lives under /financials/
    url = f"https://stockanalysis.com/quote/{exchange.lower()}/{symbol.upper()}/financials/"
    print(f"\n💰 [quote] Income Statement → {url}")
    return _scrape_table_page(url, "income_statement")


def scrape_balance_sheet_quote(exchange: str, symbol: str) -> dict:
    # Special case observed: balance-sheet1
    url = f"https://stockanalysis.com/quote/{exchange.lower()}/{symbol.upper()}/balance-sheet1/"
    print(f"\n🏦 [quote] Balance Sheet → {url}")
    return _scrape_table_page(url, "balance_sheet")


def scrape_cash_flow_quote(exchange: str, symbol: str) -> dict:
    url = f"https://stockanalysis.com/quote/{exchange.lower()}/{symbol.upper()}/cash-flow-statement/"
    print(f"\n💵 [quote] Cash Flow → {url}")
    return _scrape_table_page(url, "cash_flow")


def scrape_ratios_quote(exchange: str, symbol: str) -> dict:
    url = f"https://stockanalysis.com/quote/{exchange.lower()}/{symbol.upper()}/financials/ratios/"
    print(f"\n📐 [quote] Ratios → {url}")
    return _scrape_table_page(url, "ratios")


def scrape_statistics_quote(exchange: str, symbol: str) -> dict:
    url = f"https://stockanalysis.com/quote/{exchange.lower()}/{symbol.upper()}/statistics/"
    print(f"\n📉 [quote] Statistics → {url}")
    return _scrape_table_page(url, "statistics")


def scrape_market_cap_quote(exchange: str, symbol: str) -> dict:
    url = f"https://stockanalysis.com/quote/{exchange.lower()}/{symbol.upper()}/market-cap/"
    print(f"\n🏛️ [quote] Market Cap → {url}")
    return _scrape_table_page(url, "market_cap")


def scrape_revenue_quote(exchange: str, symbol: str) -> dict:
    url = f"https://stockanalysis.com/quote/{exchange.lower()}/{symbol.upper()}/revenue/"
    print(f"\n📦 [quote] Revenue → {url}")
    return _scrape_table_page(url, "revenue")


def scrape_profile_quote(exchange: str, symbol: str) -> dict:
    url = f"https://stockanalysis.com/quote/{exchange.lower()}/{symbol.upper()}/company/"
    print(f"\n🏢 [quote] Profile → {url}")
    soup = get_soup(url)
    if not soup:
        return {"error": "Failed", "url": url}

    data = {"url": url, "scraped_at": datetime.now().isoformat()}
    desc = soup.select_one("p")
    data["description"] = desc.get_text(strip=True) if desc else None

    details = {}
    for row in soup.select("table tr"):
        cols = row.find_all(["td", "th"])
        if len(cols) >= 2:
            key = cols[0].get_text(strip=True)
            val = cols[1].get_text(strip=True)
            if key:
                details[key] = val
    data["company_details"] = details
    return data


def scrape_history_quote(exchange: str, symbol: str) -> dict:
    """
    Example used: https://stockanalysis.com/quote/dsa/NORTHERN/history/
    """
    url = f"https://stockanalysis.com/quote/{exchange.lower()}/{symbol.upper()}/history/"
    print(f"\n📅 [quote] History → {url}")
    return _scrape_table_page(url, "history")


# ============================================================
# Main Orchestrator
# ============================================================

def scrape_all_data(symbol: str, exchange: str | None = None) -> dict:
    symbol = symbol.strip().upper()
    print(f"\n{'='*65}")
    print(f"🚀 Starting full scrape for: {symbol}")
    print(f"{'='*65}")

    result = {
        "symbol": symbol,
        "path_used": None,
        "scraped_at": datetime.now().isoformat(),
        "sections": {}
    }

    # ---------- TRY PRIMARY PATH FIRST (/stocks/) ----------
    print("\n🔍 Trying primary path: /stocks/{symbol}/ ...")
    test_url = f"https://stockanalysis.com/stocks/{symbol.lower()}/"
    test_soup = get_soup(test_url)

    if test_soup is not None:
        print("✅ Primary path works! Using /stocks/ functions")
        result["path_used"] = "stocks"
        result["main_url"] = test_url

        result["sections"]["overview"]         = scrape_overview_stocks(symbol)
        avg_sleep()
        result["sections"]["financials"]       = scrape_financials_stocks(symbol)
        avg_sleep()
        result["sections"]["income_statement"] = scrape_income_statement_stocks(symbol)
        avg_sleep()
        result["sections"]["balance_sheet"]    = scrape_balance_sheet_stocks(symbol)
        avg_sleep()
        result["sections"]["cash_flow"]        = scrape_cash_flow_stocks(symbol)
        avg_sleep()
        result["sections"]["ratios"]           = scrape_ratios_stocks(symbol)
        avg_sleep()
        result["sections"]["statistics"]       = scrape_statistics_stocks(symbol)
        avg_sleep()
        result["sections"]["market_cap"]       = scrape_market_cap_stocks(symbol)
        avg_sleep()
        result["sections"]["revenue"]          = scrape_revenue_stocks(symbol)
        avg_sleep()
        result["sections"]["metrics"]          = scrape_metrics_stocks(symbol)
        avg_sleep()
        result["sections"]["dividend"]         = scrape_dividend_stocks(symbol)
        avg_sleep()
        result["sections"]["profile"]          = scrape_profile_stocks(symbol)
        avg_sleep()
        result["sections"]["history"]          = scrape_history_stocks(symbol)
        long_sleep()

    else:
        # ---------- FALLBACK TO QUOTE PATH ----------
        print("\n⚠️  Primary path failed (404 or error).")
        print("Switching to /quote/{exchange}/{symbol}/ path...")

        exchange = (exchange or "").strip().lower()
        if not exchange:
            # try common exchange codes silently
            for trial in ("otc", "nse", "hkg", "tyo", "asx", "fra", "tsx", "lse"):
                # leave exchange as trial only if later pages work — default otc
                exchange = trial
                break
            if not exchange:
                result["error"] = "No exchange code provided"
                return result

        result["path_used"] = "quote"
        result["exchange"] = exchange
        result["main_url"] = f"https://stockanalysis.com/quote/{exchange}/{symbol}/"

        print(f"\n✅ Using quote path with exchange: {exchange}")

        result["sections"]["overview"]         = scrape_overview_quote(exchange, symbol)
        avg_sleep()
        result["sections"]["financials"]       = scrape_financials_quote(exchange, symbol)
        avg_sleep()
        result["sections"]["income_statement"] = scrape_income_statement_quote(exchange, symbol)
        avg_sleep()
        result["sections"]["balance_sheet"]    = scrape_balance_sheet_quote(exchange, symbol)
        avg_sleep()
        result["sections"]["cash_flow"]        = scrape_cash_flow_quote(exchange, symbol)
        avg_sleep()
        result["sections"]["ratios"]           = scrape_ratios_quote(exchange, symbol)
        avg_sleep()
        result["sections"]["statistics"]       = scrape_statistics_quote(exchange, symbol)
        avg_sleep()
        result["sections"]["market_cap"]       = scrape_market_cap_quote(exchange, symbol)
        avg_sleep()
        result["sections"]["revenue"]          = scrape_revenue_quote(exchange, symbol)
        avg_sleep()
        result["sections"]["profile"]          = scrape_profile_quote(exchange, symbol)
        avg_sleep()
        result["sections"]["history"]          = scrape_history_quote(exchange, symbol)
        long_sleep()

    return result


# ============================================================
# Entry Point
# ============================================================

def main():
    print("=" * 65)
    print("  StockAnalysis.com Full Data Scraper")
    print("  Supports /stocks/ and /quote/{exchange}/ paths + History")
    print("=" * 65)

    symbol = input("\nEnter stock symbol (e.g. AAPL or NORTHERN or JOHT): ").strip().upper()

    if not symbol:
        print("No symbol entered. Exiting.")
        sys.exit(0)

    all_data = scrape_all_data(symbol)

    filename = f"{symbol}_stockanalysis_data.json"
    with open(filename, "w", encoding="utf-8") as f:
        json.dump(all_data, f, indent=2, ensure_ascii=False)

    print(f"\n{'='*65}")
    print(f"✅ All data saved to → {filename}")
    print(f"Path used          → {all_data.get('path_used')}")
    if all_data.get("exchange"):
        print(f"Exchange           → {all_data.get('exchange')}")
    print(f"Sections scraped   → {len(all_data.get('sections', {}))}")
    print(f"{'='*65}")


if __name__ == "__main__":
    main()
