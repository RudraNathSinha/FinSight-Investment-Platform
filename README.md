# FinSight Investment Platform

**Unified single-origin application** — one process, one URL, one deploy.

All three products run under the same host and port:

| Path | Product |
|------|---------|
| `/` | Landing page |
| `/country-ranking/` | Country Ranking |
| `/equity/` | Global Equity Universe (primary) |
| `/sector/` | Sector & Industry Intelligence |

No cross-port or external module links. Everything is same-origin.

---

## Local run (one command)

```bash
cd FinSigh_tInvestmentPlatform
pip install -r requirements.txt
uvicorn backend.main:app --host 0.0.0.0 --port 8000
```

Open: **http://127.0.0.1:8000/**

---

## Deploy on Render (single free web service)

1. Push this folder (or the parent repo with Root Directory = `FinSigh_tInvestmentPlatform`).
2. Create a **Web Service**:
   - Runtime: Python
   - Build: `pip install -r requirements.txt`
   - Start: `uvicorn backend.main:app --host 0.0.0.0 --port $PORT`
3. Deploy. The public URL serves the full platform.

Cold starts on free tier are normal.

Alternatively use the included `render.yaml` Blueprint.

---

## Structure

```
FinSigh_tInvestmentPlatform/
  backend/                 # Single FastAPI entry (main.py + modules)
  landing/                 # Commercial landing
  part1_country_ranking/   # Country Ranking static app
  part2_global_equity/     # Global Equity (frontend + data + packs)
  part3_sector_industry/   # Sector Intelligence static + data
  requirements.txt
  render.yaml
  README.md
```

---

## Disclaimer

FinSight is an educational analytics workspace. It is not SEBI-registered research or personalised investment advice. Data may be incomplete. Models are illustrative. Verify with primary filings and a licensed adviser.

© All rights reserved FinSight prepared by Rudra Nath Sinha.
