# FinSight — Handoff Pack
© All rights reserved FinSight prepared by Rudra Nath Sinha

## What this product is
FinSight is an end-to-end **educational** market-intelligence web app for long-term investors:
- Sector & industry ranking visualization (Part 1)
- Stock hierarchy / comparison visualization (Part 2)
- Stock analysis, live fundamentals, valuation, multi-stock compare, and downloadable reports (Part 3)
- Flask API for live market data (yfinance) + optional server-side PDF

**Positioning:** prepare fundamentals *before* consulting a broker or adviser. Not SEBI research.

## Folder map
```
webapp/
  index.html              # Home + guided investor path
  methodology.html        # Plain-language methodology
  disclaimer.html         # Legal disclaimer
  HANDOFF.md              # This file
  backend/
    app.py                # Flask: live data, TTL cache, PDF
    requirements.txt
    run.sh
  shared/
    theme.js              # Light default + dark toggle
    live.js               # LiveAPI + health chip + PDF helper
    ui.js                 # Empty states + disclaimer strip
    styles.css
  part1_sector_industry/  # Rankings dashboards
  part2_stock_visualization/
  part3_stock_analysis/   # Analysis + reports.js
  data/                   # Static JSON derived from ranking workbooks
```
Offline ranking source workbooks live under the parent `artifacts/` tree (`Sector_Ranking/`, `industry_ranking/`, `stock_wise_ranking/`).

## How to run (local)
```bash
cd webapp/backend
pip install -r requirements.txt
python3 app.py
# open http://localhost:5000
```
Frontend is served by Flask from `webapp/`. Part 3 live panels need the API on port 5000.

## Data sources
| Layer | Source |
|-------|--------|
| Sector / industry / stock ranks | Offline Excel → JSON under `webapp/data` and ranking folders |
| Quotes, history, financials, dividends | yfinance via `/api/live/*` |
| Reports | Assembled in browser from live + offline; PDF via WeasyPrint `POST /api/reports/pdf` |

## Cache
- Quote ~60s · History ~5m · Financials/dividends ~15m  
- `GET /api/cache/stats` · `POST /api/cache/clear`

## Known limitations
- Some tickers return sparse fundamentals; UI shows empty states.
- DCF / LBO are **illustrative** (simplified discount rate & growth fade).
- Ranking ensemble depends on the offline workbook quality.
- No user accounts / server-side watchlists in this pack (local browser only if added later).
- Not a substitute for primary filings or licensed advice.

## IP
© All rights reserved FinSight prepared by Rudra Nath Sinha.

## Suggested demo path for investors
1. Home → follow **Guided path** steps  
2. Part 1: open a top sector → industry → stock  
3. Part 3: review Overview → Financials → Valuation  
4. Generate Equity Research or Valuation PDF  
