"""
FinSight institutional multi-chapter HTML report renderer.
Print-ready; browser Print -> Save as PDF.
Cover matches formal research-report template; chapters expand with data.
"""
from __future__ import annotations

import html
from typing import Any, Dict, List, Optional, Tuple


def _e(s: Any) -> str:
    return html.escape("" if s is None else str(s))


def _bullets(items: List[str]) -> str:
    if not items:
        return "<p class='muted'>Not available for this listing from public sources.</p>"
    return "<ul class='bullets'>" + "".join(f"<li>{_e(x)}</li>" for x in items) + "</ul>"


def _page_header(company: str = "") -> str:
    company = company or "Company"
    return f"""
    <div class="pg-header">
      <div class="pg-header-right">
        <div class="hdr-title">{_e(company)}</div>
        <div class="hdr-sub">FinSight Analysis Report · Prepared by FinSight</div>
        <div class="hdr-copy">Copyright &#169; Rudra Nath Sinha</div>
      </div>
    </div>"""


PAGE_DISCLAIMER = (
    "FinSight is an educational analytics workspace. It is not SEBI-registered research or personalised investment advice. Data may be incomplete. Models are illustrative. Verify with primary filings and a licensed adviser. Read full disclaimer · Methodology. © All rights reserved FinSight prepared by Rudra Nath Sinha."
)

def _page_footer(label: str, snap: dict, show_disclaimer: bool = True) -> str:
    disc = f"<div class=\"pg-disclaimer\">{_e(PAGE_DISCLAIMER)}</div>" if show_disclaimer else ""
    return f"""
    <div class="pg-footer-wrap">
      <div class="pg-footer">
        <span>FinSight v1.2 · {_e(snap.get('name') or snap.get('symbol'))} · {_e(snap.get('exchange'))}</span>
        <span>{_e(label)}</span>
        <span>&#169; Rudra Nath Sinha</span>
      </div>
      {disc}
    </div>"""


def _svg_line(values: List[Optional[float]], width: int = 320, height: int = 90, color: str = "#0369a1") -> str:
    pts = [(i, v) for i, v in enumerate(values) if v is not None]
    if len(pts) < 2:
        return f"<svg width='{width}' height='{height}'><text x='8' y='{height//2}' fill='#94a3b8' font-size='10'>Insufficient series for chart</text></svg>"
    ys = [v for _, v in pts]
    ymin, ymax = min(ys), max(ys)
    if ymin == ymax:
        ymax = ymin + 1.0
    pad = 8
    coords = []
    n = max(1, len(values) - 1)
    for i, v in pts:
        x = pad + (width - 2 * pad) * (i / n)
        y = height - pad - (height - 2 * pad) * ((v - ymin) / (ymax - ymin))
        coords.append(f"{x:.1f},{y:.1f}")
    poly = " ".join(coords)
    return (
        f"<svg viewBox='0 0 {width} {height}' width='100%' height='{height}' class='spark'>"
        f"<polyline fill='none' stroke='{color}' stroke-width='2' points='{poly}'/>"
        f"</svg>"
    )


def _metric_analysis_blocks(mx: dict, max_items: int = 12) -> str:
    rows = mx.get("rows") or []
    blocks = []
    i = 0
    count = 0
    while i < len(rows) and count < max_items:
        r = rows[i]
        if r.get("kind") != "value":
            i += 1
            continue
        yoy = rows[i + 1] if i + 1 < len(rows) and rows[i + 1].get("kind") == "yoy" else None
        raw = r.get("raw") or []
        chart = _svg_line(raw)
        trend = "Trend cannot be established from the available history."
        if yoy and yoy.get("raw"):
            last_g = None
            last_disp = None
            for g, d in zip(reversed(yoy["raw"]), reversed(yoy.get("values") or [])):
                if g is not None:
                    last_g = g
                    last_disp = d
                    break
            if last_g is not None:
                if last_g > 0.1:
                    trend = f"The latest year-over-year change is strongly positive at {last_disp}, indicating expansion in this line item."
                elif last_g > 0.02:
                    trend = f"The latest year-over-year change is moderately positive ({last_disp}), consistent with gradual improvement."
                elif last_g > -0.02:
                    trend = f"The latest year-over-year change is roughly flat ({last_disp}), suggesting stability rather than acceleration."
                elif last_g > -0.1:
                    trend = f"The latest year-over-year change is moderately negative ({last_disp}), a soft patch that warrants monitoring."
                else:
                    trend = f"The latest year-over-year change is sharply negative ({last_disp}), signalling material contraction in this line."
        blocks.append(f"""
        <div class="metric-block">
          <h4>{_e(r.get('metric'))}</h4>
          <p class="def">{_e(r.get('definition') or '')}</p>
          <div class="chart-wrap">{chart}</div>
          <p class="trend"><strong>Trend reading:</strong> {_e(trend)}</p>
        </div>""")
        count += 1
        i += 2 if yoy else 1
    if not blocks:
        return "<p class='muted'>No line-item series available for detailed analysis on this listing.</p>"
    return "".join(blocks)


def _yoy_table(mx: dict, title: str, currency: str = "", as_of: str = "") -> str:
    periods = mx.get("periods") or []
    rows = mx.get("rows") or []
    if not periods or not rows:
        return f"<section class='card'><h2>{_e(title)}</h2><p class='muted'>Data not available from public sources for this listing.</p></section>"
    head = "".join(f"<th>{_e(p)}</th>" for p in periods)
    body = []
    for r in rows:
        cls = "yoy-row" if r.get("kind") == "yoy" else ""
        is_yoy = r.get("kind") == "yoy"
        raws = r.get("raw") or []
        vals = r.get("values") or []
        tds = []
        for i, v in enumerate(vals):
            extra = ""
            if is_yoy:
                g = raws[i] if i < len(raws) else None
                if g is not None and g > 0.0001:
                    extra = " yoy-pos"
                elif g is not None and g < -0.0001:
                    extra = " yoy-neg"
            tds.append(f"<td class='num{extra}'>{_e(v)}</td>")
        body.append(f"<tr class='{cls}'><td class='metric'>{_e(r.get('metric'))}</td>{''.join(tds)}</tr>")
    return f"""
    <section class="card page-break-inside">
      <h2>{_e(title)}</h2>
      <p class="muted">Each metric is followed by a YoY Growth row (percentage change versus the prior column period).
      {(" · Currency: " + _e(currency)) if currency else ""}{(" · As of: " + _e(as_of)) if as_of else ""}
      · Green = positive YoY · Red = negative YoY</p>
      <div class="table-wrap"><table class="data">
        <thead><tr><th>Metric</th>{head}</tr></thead>
        <tbody>{''.join(body)}</tbody>
      </table></div>
    </section>"""


def _overall_narrative(mx: dict, subject: str) -> str:
    rows = [r for r in (mx.get("rows") or []) if r.get("kind") == "value"]
    if not rows:
        return f"<p class='muted'>Insufficient {subject} data for a company-level narrative.</p>"
    yoy_rows = {r.get("parent"): r for r in (mx.get("rows") or []) if r.get("kind") == "yoy"}
    rising = falling = 0
    for r in rows:
        y = yoy_rows.get(r.get("metric"))
        if not y or not y.get("raw"):
            continue
        for g in reversed(y["raw"]):
            if g is None:
                continue
            if g > 0.03:
                rising += 1
            elif g < -0.03:
                falling += 1
            break
    parts = [
        f"The {subject} presents {len(rows)} reported line items across the available history. "
        "Taken together, these series describe how the business converts activity into reported results and how that conversion has shifted period to period.",
        f"Among line items with measurable year-over-year change, roughly {rising} expanded and {falling} contracted in the latest comparable period. "
        "Investors should read expansions alongside margins and cash conversion — growth that does not translate into cash can be less durable.",
        f"Where individual lines are blank, the free public feed did not supply figures; primary exchange filings remain the authoritative source for a complete {subject}.",
    ]
    return "<p class='narrative'>" + " ".join(parts) + "</p>"


CSS = """
:root {
  --ink: #0f172a; --muted: #64748b; --line: #e2e8f0; --brand: #0e7490;
  --brand2: #155e75; --soft: #f8fafc; --paper: #ffffff; --teal: #0f766e;
}
* { box-sizing: border-box; }
html, body { margin: 0; padding: 0; font-family: "Segoe UI", "Helvetica Neue", Arial, sans-serif;
  color: var(--ink); background: #e2e8f0; font-size: 11pt; line-height: 1.45; }
.toolbar {
  position: sticky; top: 0; z-index: 30; background: #0f172a; color: #fff;
  padding: 10px 16px; display: flex; justify-content: space-between; align-items: center; font-size: 13px;
}
.toolbar button { background: #0e7490; color: #fff; border: 0; border-radius: 8px; padding: 8px 14px; font-weight: 600; cursor: pointer; }
.page {
  width: 210mm; min-height: 297mm; height: 297mm; margin: 14px auto; background: var(--paper);
  padding: 12mm 16mm 28mm; box-shadow: 0 10px 28px rgba(15,23,42,.15); position: relative;
  display: flex; flex-direction: column; box-sizing: border-box;
  overflow: hidden;
}
.page-body { flex: 1 1 auto; min-height: 0; }
.page-break { page-break-before: always; break-before: page; }
.page-break-inside { page-break-inside: avoid; break-inside: avoid; }
@media print {
  body { background: #fff; margin: 0; }
  .toolbar { display: none !important; }
  @page { size: A4; margin: 12mm 14mm 22mm 14mm; }
  .page {
    margin: 0; box-shadow: none; width: auto; min-height: auto; height: auto;
    padding: 0 0 18mm 0; /* room for footer */
    position: relative; overflow: visible;
    page-break-after: always; break-after: page;
  }
  .page:last-child { page-break-after: auto; break-after: auto; }
  .pg-footer-wrap {
    position: running(footer) !important;
  }
  /* Absolute footer anchored to each printed page box */
  .pg-footer-wrap {
    position: absolute !important;
    left: 0 !important; right: 0 !important; bottom: 0 !important;
    margin: 0 !important;
    padding-top: 3px !important;
  }
}
.cover { display: flex; min-height: 269mm; padding: 0 !important; }
.cover-stripes {
  width: 28mm; flex-shrink: 0; display: flex; flex-direction: row;
  -webkit-print-color-adjust: exact !important;
  print-color-adjust: exact !important;
  color-adjust: exact !important;
}
.cover-stripes .s1 { width: 9mm; background: #0e4d6b; }
.cover-stripes .s2 { width: 3mm; background: #ffffff; }
.cover-stripes .s3 { width: 6mm; background: #148a9a; }
.cover-stripes .s4 { width: 3mm; background: #ffffff; }
.cover-stripes .s5 { width: 7mm; background: #1a6f8a; }

.cover-body { flex: 1; padding: 22mm 18mm 18mm 16mm; display: flex; flex-direction: column; }
.cover-title {
  font-family: Georgia, "Times New Roman", serif; font-size: 26pt; color: #0e4d6b;
  font-style: italic; margin: 0; letter-spacing: 0.02em;
}
.cover-mid { margin-top: auto; margin-bottom: auto; padding: 8mm 0; }
.cover-company {
  font-size: 20pt; font-weight: 700; color: #0e7490; margin: 0 0 6mm; letter-spacing: 0.03em;
  text-transform: uppercase; line-height: 1.2;
}
.cover-line { font-size: 11pt; color: #334155; margin: 0 0 3mm; line-height: 1.4; }
.cover-line strong { color: #0f172a; }
.cover-gen { font-size: 12pt; font-weight: 600; color: #155e75; margin: 10mm 0 2mm; }
.cover-author { font-size: 10.5pt; color: #64748b; margin: 0 0 8mm; }
.cover-date { margin-top: auto; font-size: 10pt; color: #475569; letter-spacing: 0.06em; }
.pg-header {
  display: flex; justify-content: flex-end; border-bottom: 2px solid var(--brand);
  padding-bottom: 6px; margin-bottom: 12px;
}
.pg-header-right { text-align: right; }
.hdr-title { font-size: 10pt; font-weight: 700; color: var(--brand2); }
.hdr-sub { font-size: 8.5pt; color: var(--muted); }
.hdr-copy { font-size: 7.5pt; color: var(--muted); }
.pg-footer-wrap {
  position: absolute; left: 16mm; right: 16mm; bottom: 8mm;
  border-top: 1px solid var(--line); padding-top: 4px;
  background: var(--paper);
}
@media print {
  .pg-footer-wrap {
    left: 0 !important; right: 0 !important; bottom: 0 !important;
  }
}
.pg-disclaimer {
  margin-top: 3px; font-size: 6pt; line-height: 1.3; color: #64748b; text-align: justify;
}
.pg-footer {
  font-size: 7pt; color: var(--muted); display: flex; justify-content: space-between; gap: 8px;
}
.chapter-label {
  font-size: 8pt; letter-spacing: 0.14em; text-transform: uppercase; color: var(--teal); font-weight: 700;
  margin: 0 0 2px;
}
h1.chapter {
  font-size: 16pt; color: var(--brand2); margin: 0 0 12px; padding-bottom: 6px;
  border-bottom: 2px solid var(--brand); /* title ABOVE the line */
}
h2 { font-size: 12pt; color: var(--brand2); margin: 12px 0 6px; border-bottom: 1px solid var(--line); padding-bottom: 4px; }
h3 { font-size: 11pt; color: #334155; margin: 10px 0 4px; }
h4 { font-size: 10.5pt; color: #0f172a; margin: 8px 0 3px; }
.card { border: 1px solid var(--line); border-radius: 8px; padding: 10px 12px; margin: 10px 0; background: #fff; }
.muted { color: var(--muted); font-size: 9.5pt; }
.narrative, .def, .trend, .hero { text-align: justify; }
.bullets { margin: 4px 0 0 18px; padding: 0; }
.bullets li { margin: 0 0 4px; }
.stat-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; margin: 8px 0; }
.stat { background: var(--soft); border: 1px solid var(--line); border-radius: 8px; padding: 8px 10px; }
.stat-k { font-size: 7.5pt; color: var(--muted); text-transform: uppercase; letter-spacing: 0.04em; }
.stat-v { font-size: 11pt; font-weight: 700; margin-top: 2px; font-variant-numeric: tabular-nums; }
.table-wrap { overflow-x: auto; }
table.data { width: 100%; border-collapse: collapse; font-size: 8pt; font-variant-numeric: tabular-nums; }
table.data th, table.data td { border: 1px solid var(--line); padding: 4px 5px; text-align: right; }
table.data th { background: #f1f5f9; font-weight: 600; }
table.data td.metric, table.data th:first-child { text-align: left; font-weight: 600; }
table.data tr.yoy-row td { background: #f8fafc; font-size: 7.5pt; font-style: italic; }
table.data td.yoy-pos { color: #047857 !important; font-weight: 700; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
table.data td.yoy-neg { color: #b91c1c !important; font-weight: 700; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
.metric-block { border-left: 3px solid var(--brand); padding: 6px 0 6px 10px; margin: 10px 0; }
.chart-wrap { margin: 4px 0; background: var(--soft); border-radius: 6px; padding: 4px; }
.swot-stack .swot-item { margin: 10px 0; padding: 10px; border-radius: 8px; border: 1px solid var(--line); }
.swot-s { background: #ecfdf5 !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
.swot-w { background: #fef2f2 !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
.swot-o { background: #eff6ff !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
.swot-t { background: #fff7ed !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
.pestle-item { -webkit-print-color-adjust: exact; print-color-adjust: exact; background: #f1f5f9 !important; }
.swot-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
.pestle-item { margin: 8px 0; padding: 8px 10px; background: var(--soft); border-radius: 8px; border: 1px solid var(--line); }
.rec-box {
  border: 2px solid var(--brand); border-radius: 12px; padding: 14px 16px; text-align: center; margin: 12px 0;
  background: #f0fdfa;
}
.rec-action { font-size: 28pt; font-weight: 800; color: var(--brand2); letter-spacing: 0.06em; }
.index a { color: var(--brand2); text-decoration: none; }
.index a:hover { text-decoration: underline; }
.index-row { display: flex; justify-content: space-between; border-bottom: 1px dotted #cbd5e1; padding: 6px 0; }
.thankyou {
  min-height: 240mm; display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center;
}
.thankyou h1 { font-size: 42pt; color: var(--brand2); margin: 0 0 16px; font-family: Georgia, serif; }
.thankyou .brand { font-size: 14pt; color: var(--muted); margin: 0; }
.thankyou .author { font-size: 11pt; color: var(--muted); margin: 6px 0 0; }
"""


def _shell(title: str, body: str) -> str:
    return f"""<!DOCTYPE html>
<html lang="en"><head>
<meta charset="utf-8"/>
<title>{_e(title)}</title>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<style>{CSS}</style>
</head><body>
<div class="toolbar">
  <div><strong>FinSight</strong> · Equity Research Report</div>
  <div><button onclick="window.print()">Download / Print PDF</button></div>
</div>
{body}
</body></html>"""


def _cover(report: dict) -> str:
    snap = report.get("snapshot") or {}
    rtype = report.get("report_type") or "equity"
    title = "Equity Research Report" if rtype != "financial" else "Financial Analysis Report"
    company = (snap.get("name") or "").strip() or (snap.get("symbol") or "Company")
    exchange = (snap.get("exchange") or "").strip()
    # Full exchange names
    EX_FULL = {
        "NSE": "National Stock Exchange of India", "BSE": "Bombay Stock Exchange", "BOM": "Bombay Stock Exchange",
        "NYSE": "New York Stock Exchange", "NASDAQ": "NASDAQ Stock Market", "AMEX": "NYSE American",
        "LSE": "London Stock Exchange", "LON": "London Stock Exchange", "TYO": "Tokyo Stock Exchange",
        "HKG": "Hong Kong Stock Exchange", "ASX": "Australian Securities Exchange", "TSX": "Toronto Stock Exchange",
        "FRA": "Frankfurt Stock Exchange", "ETR": "Deutsche Börse (Xetra)", "SGX": "Singapore Exchange",
        "KRX": "Korea Exchange", "TWSE": "Taiwan Stock Exchange", "SSE": "Shanghai Stock Exchange",
        "SZSE": "Shenzhen Stock Exchange",
    }
    EX_LOC = {
        "NSE": "Mumbai, India", "BSE": "Mumbai, India", "BOM": "Mumbai, India",
        "NYSE": "New York, United States", "NASDAQ": "New York, United States", "AMEX": "New York, United States",
        "LSE": "London, United Kingdom", "LON": "London, United Kingdom", "TYO": "Tokyo, Japan",
        "HKG": "Hong Kong", "ASX": "Sydney, Australia", "TSX": "Toronto, Canada",
        "FRA": "Frankfurt, Germany", "ETR": "Frankfurt, Germany", "SGX": "Singapore",
        "KRX": "Seoul, South Korea", "TWSE": "Taipei, Taiwan", "SSE": "Shanghai, China", "SZSE": "Shenzhen, China",
    }
    ex_u = exchange.upper()
    ex_full = EX_FULL.get(ex_u, exchange or "—")
    listing_line = f"{ex_full} ({ex_u})" if ex_u else "—"
    loc = EX_LOC.get(ex_u) or (snap.get("country") or "")
    sector = (snap.get("sector") or "").strip()
    industry = (snap.get("industry") or "").strip()
    date = report.get("generated_at") or ""
    if date and "T" in str(date):
        # keep date and time if present
        date = str(date).replace("T", " ").split(".")[0][:19]
    sector_html = f'<div class="cover-line"><strong>Sector:</strong> {_e(sector)}</div>' if sector else ""
    industry_html = f'<div class="cover-line"><strong>Industry:</strong> {_e(industry)}</div>' if industry else ""
    loc_html = f'<div class="cover-line"><strong>Exchange location:</strong> {_e(loc)}</div>' if loc else ""
    return f"""
    <div class="page cover" id="cover">
      <div class="cover-stripes"><div class="s1"></div><div class="s2"></div><div class="s3"></div><div class="s4"></div><div class="s5"></div></div>
      <div class="cover-body">
        <div class="cover-title">{_e(title)}</div>
        <div class="cover-mid">
          <div class="cover-company">{_e(company)}</div>
          <div class="cover-line"><strong>Listing:</strong> {_e(listing_line)}</div>
          {loc_html}
          {sector_html}
          {industry_html}
          <div class="cover-gen">Generated by FinSight</div>
          <div class="cover-author">@Rudra Nath Sinha</div>
        </div>
        <div class="cover-date">{_e(date)}</div>
      </div>
    </div>"""


def _index(entries: List[Tuple[str, str]], company: str = "") -> str:
    rows = []
    for i, (aid, title) in enumerate(entries, 1):
        rows.append(
            f"<div class='index-row'><a href='#{_e(aid)}'>{i:02d}. {_e(title)}</a><span class='muted'>§{i}</span></div>"
        )
    return f"""
    <div class="page page-break" id="index">
      {_page_header(company)}
      <div class="chapter-label">Contents</div>
      <h1 class="chapter">Index</h1>
      <p class="muted">Click any entry to jump to that section in this report.</p>
      <div class="index">{''.join(rows)}</div>
      {_page_footer("Index", {})}
    </div>"""



def _ratio_insight(name: str, val: Any, explain: str, snap: dict) -> str:
    """Contextual insight from definition + observed value (rule-based analyst synthesis)."""
    name_l = (name or "").lower()
    num = None
    try:
        if isinstance(val, (int, float)):
            num = float(val)
        else:
            s = str(val).replace("%", "").replace(",", "").strip()
            num = float(s)
    except Exception:
        num = None
    company = snap.get("name") or snap.get("symbol") or "the company"
    sector = snap.get("sector") or "its sector"
    bits = []
    bits.append(f"For {company}, the reported {name} is {val}.")
    if num is not None:
        if "p/e" in name_l or name_l.endswith("pe") or "trailing p" in name_l:
            if num < 0:
                bits.append("A negative multiple usually means losses over the trailing period, so earnings-based valuation is less meaningful until profitability returns.")
            elif num < 12:
                bits.append("This multiple is relatively modest versus long-run equity-market averages, which can imply cheaper earnings if growth and quality hold up — or it can reflect cyclical or structural risk already priced in.")
            elif num < 25:
                bits.append("This sits in a mid-range band often associated with mature growth expectations; investors should check whether earnings quality and free-cash-flow conversion support the multiple.")
            else:
                bits.append("This is an elevated multiple that typically requires sustained growth or high returns on capital to be justified; disappointment on either front can compress the valuation quickly.")
        elif "p/b" in name_l or "price / book" in name_l or "price/book" in name_l:
            if num < 1:
                bits.append("Trading below book can signal deep value or asset-heavy scepticism (low ROE, asset quality concerns). Confirm that book value is economic, not just accounting.")
            elif num < 3:
                bits.append("A moderate premium to book is common for businesses that earn acceptable returns on equity without extreme intangibles.")
            else:
                bits.append("A high price-to-book usually means the market is capitalising intangible franchise value or expected ROE well above cost of equity.")
        elif "roe" in name_l:
            if num < 5:
                bits.append("Low ROE suggests the equity base is not generating strong residual returns — either margins, asset turns or leverage are constrained.")
            elif num < 15:
                bits.append("This ROE is moderate: competitive but not exceptional. Sustainability depends on industry structure and reinvestment needs.")
            else:
                bits.append("High ROE is attractive if it is repeatable without excessive leverage; check whether debt is amplifying the figure.")
        elif "roa" in name_l:
            bits.append("ROA focuses on asset productivity independent of capital structure; compare it within the same industry for a fair reading.")
        elif "debt" in name_l and "equity" in name_l:
            if num < 0.5:
                bits.append("Leverage looks conservative, which can support resilience but may also mean under-utilised balance-sheet capacity.")
            elif num < 1.5:
                bits.append("Moderate leverage is typical for many industrial and consumer names; interest coverage and maturity profile matter as much as the ratio itself.")
            else:
                bits.append("Elevated leverage raises sensitivity to rates and refinancing conditions; pair this reading with cash flow and coverage metrics.")
        elif "current ratio" in name_l:
            if num < 1:
                bits.append("Current liabilities exceed current assets on the reported figures — short-term liquidity should be monitored closely.")
            elif num < 1.5:
                bits.append("Near-term coverage is adequate but not abundant; working-capital seasonality can still create pressure.")
            else:
                bits.append("Short-term assets provide a comfortable buffer relative to near-term obligations on the stated numbers.")
        elif "dividend" in name_l or "yield" in name_l:
            bits.append("Treat yield as income potential only after checking payout ratio, free-cash-flow coverage and the stability of earnings through the cycle.")
        elif "beta" in name_l:
            if num > 1.2:
                bits.append("Beta above 1 implies the stock has historically moved more than the market — position sizing and drawdown tolerance should reflect that.")
            elif num < 0.8:
                bits.append("Lower beta points to historically milder market sensitivity, which can suit defensive allocations if fundamentals are stable.")
            else:
                bits.append("Beta near 1 suggests market-like systematic risk over the measured window.")
        elif "margin" in name_l:
            bits.append(f"Margin levels should be judged against peers in {sector}; improvement trends often matter more than a single-period snapshot.")
        else:
            bits.append(f"Interpret this figure alongside growth, cash conversion and leverage for {company}, not in isolation.")
    else:
        bits.append("The value is non-numeric or incomplete in the free data feed; treat any qualitative inference as provisional until confirmed in primary filings.")
    bits.append((explain or "").strip())
    # keep insight tight but substantive
    return " ".join(x for x in bits if x)



def _how_to_read() -> str:
    return f"""
    <div class="page page-break" id="how-to-read">
      {_page_header("FinSight")}
      <div class="chapter-label">Guide</div>
      <h1 class="chapter">How to read this report</h1>
      <ol class="bullets">
        <li><strong>Cover &amp; index</strong> — identity of the listing and jump links to every chapter.</li>
        <li><strong>Chapter 1</strong> — who the company is and the investable snapshot.</li>
        <li><strong>Chapters 2–4</strong> — income, balance sheet and cash flow with YoY rows (green = up, red = down).</li>
        <li><strong>Chapter 5</strong> — ratios with definition + investor insight for each available metric.</li>
        <li><strong>Chapters 6–8</strong> — SWOT, PESTLE and risks (strategic and macro context).</li>
        <li><strong>Chapters 9–10</strong> — dividends (if any) and price trajectory.</li>
        <li><strong>Recommendation</strong> — Buy / Hold / Sell is an automated synthesis of the chapters above, not personalised advice.</li>
      </ol>
      <p class="narrative">Always confirm material figures in primary exchange filings. Free feeds can omit restatements and footnotes.</p>
      {_page_footer("How to read", {})}
    </div>"""


def _methodology(comp: dict, field_sources: dict = None) -> str:
    srcs = ", ".join(comp.get("sources_active") or ["public free feeds"])
    return f"""
    <div class="page page-break" id="methodology">
      {_page_header("FinSight")}
      <div class="chapter-label">Methodology</div>
      <h1 class="chapter">Data methodology &amp; completeness</h1>
      <p class="narrative">FinSight merges free public sources in parallel (stockanalysis.com scrape, yfinance, free Yahoo-style APIs, multi-source bundle, rule-based synthesizer). When a field is missing upstream, the next source in preference order may fill it. Values are cached briefly to speed repeat views.</p>
      <div class="stat-grid">
        <div class="stat"><div class="stat-k">Completeness score</div><div class="stat-v">{_e(comp.get('score_pct'))}%</div></div>
        <div class="stat"><div class="stat-k">Fields filled</div><div class="stat-v">{_e(comp.get('filled'))}/{_e(comp.get('total'))}</div></div>
        <div class="stat"><div class="stat-k">As of</div><div class="stat-v">{_e(str(comp.get('as_of') or '')[:19])}</div></div>
      </div>
      <h2>Active sources this run</h2>
      <p class="narrative">{_e(srcs)}</p>
      <h2>Field-level provenance</h2>
      <p class="narrative">Price: {_e((report_fs := {}).get('price') if False else '')}</p>
      <h2>Limitations</h2>
      <ul class="bullets">
        <li>Not SEBI-registered research; educational analytics only.</li>
        <li>YoY uses adjacent columns in the free statement grid — restatements may not be flagged.</li>
        <li>Secondary listings can differ from the issuer primary line.</li>
      </ul>
      {_page_footer("Methodology", {})}
    </div>"""


def _glossary(term_explain: dict) -> str:
    items = "".join(
        f"<div class='metric-block'><h4>{_e(k)}</h4><p class='def'>{_e(v)}</p></div>"
        for k, v in sorted((term_explain or {}).items())[:40]
    )
    return f"""
    <div class="page page-break" id="glossary">
      {_page_header("FinSight")}
      <div class="chapter-label">Appendix</div>
      <h1 class="chapter">Glossary</h1>
      {items or "<p class='muted'>Glossary unavailable.</p>"}
      {_page_footer("Glossary", {})}
    </div>"""


def _sensitivity_html(rows: list) -> str:
    if not rows:
        return "<p class='muted'>Sensitivity requires EPS and P/E on free feeds.</p>"
    cells = "".join(
        f"<div class='stat'><div class='stat-k'>{_e(r.get('scenario'))}</div>"
        f"<div class='stat-v'>{_e(r.get('implied_price'))} "
        f"<span class='muted'>({_e(r.get('vs_spot'))})</span></div></div>"
        for r in rows[:9]
    )
    return f"<div class='stat-grid'>{cells}</div>"


def render_equity_html(report: dict) -> str:
    snap = report.get("snapshot") or {}
    company_nm = snap.get("name") or snap.get("symbol") or "Company"
    _ccy = snap.get("currency") or ""
    _asof = str(snap.get("collected_at") or "")[:19]
    pages: List[str] = []
    toc: List[Tuple[str, str]] = []
    pages.append(_cover(report))

    # Chapter 1
    toc.append(("ch1", "Chapter 1 — Corporate Profile & Investment Thesis"))
    stats = report.get("snapshot_stats") or []
    stats_html = "".join(
        f"<div class='stat'><div class='stat-k'>{_e(k)}</div><div class='stat-v'>{_e(v)}</div></div>"
        for k, v in stats[:12]
    )
    key_people = []
    if snap.get("ceo"):
        key_people.append(
            f"Chief Executive Officer: {snap['ceo']}. The CEO is responsible for strategy execution, "
            "capital allocation priorities and external representation of the firm."
        )
    if snap.get("employees"):
        key_people.append(
            f"Workforce scale: approximately {snap['employees']} employees (where disclosed). "
            "Headcount is a proxy for operational footprint and fixed-cost intensity."
        )
    if not key_people:
        key_people.append(
            "Named executive biographies are not fully exposed on free quote pages for this listing. "
            "Investors should consult the issuer's annual report for board and management profiles."
        )
    founded = snap.get("founded") or "Not disclosed on free public sources"
    sector_clause = f"within the <strong>{_e(snap.get('sector'))}</strong> sector" if snap.get("sector") else ""
    pages.append(f"""
    <div class="page page-break" id="ch1">
      {_page_header(company_nm)}
      <div class="chapter-label">Chapter 1</div>
      <h1 class="chapter">Corporate Profile &amp; Investment Thesis</h1>
      <h2>Company description</h2>
      <p class="hero">{_e(snap.get('description') or 'A detailed business description was not available from free public sources for this listing. The sections below use statement and market data where present.')}</p>
      <h2>Key people &amp; organisation</h2>
      {_bullets(key_people)}
      <h2>Founding &amp; activity</h2>
      <p class="narrative">Founded / listing reference: <strong>{_e(founded)}</strong>.
      {_e(snap.get('name') or snap.get('symbol'))} operates in the
      <strong>{_e(snap.get('industry') or 'stated industry')}</strong>
      {sector_clause}.
      The company is listed on <strong>{_e(snap.get('exchange') or 'its exchange')}</strong>
      under the ticker <strong>{_e(snap.get('symbol'))}</strong>, with reporting country
      <strong>{_e(snap.get('country') or 'n/a')}</strong>.</p>
      <h2>Sector &amp; industry classification</h2>
      <div class="stat-grid">
        <div class="stat"><div class="stat-k">Sector</div><div class="stat-v">{_e(snap.get('sector') or '—')}</div></div>
        <div class="stat"><div class="stat-k">Industry</div><div class="stat-v">{_e(snap.get('industry') or '—')}</div></div>
        <div class="stat"><div class="stat-k">Country</div><div class="stat-v">{_e(snap.get('country') or '—')}</div></div>
      </div>
      {_page_footer("Ch 1 · Profile", snap)}
    </div>""")

    mcap = stats[1][1] if len(stats) > 1 else "—"
    pages.append(f"""
    <div class="page page-break" id="ch1b">
      {_page_header(company_nm)}
      <div class="chapter-label">Chapter 1</div>
      <h1 class="chapter">Investment Summary &amp; Financial Touchpoints</h1>
      <h2>Investment summary</h2>
      <p class="narrative">{_e(report.get('investment_summary') or '')}</p>
      <h2>Financial investments &amp; capital picture</h2>
      <p class="narrative">
        Market capitalisation stands near {_e(mcap)} where disclosed.
        Equity investors are exposed to the residual claim on cash flows after debt service.
        Capital intensity, leverage and free-cash-flow generation (examined in later chapters) determine how much of operating progress accrues to shareholders.
      </p>
      <h2>Financial touchpoints snapshot</h2>
      <p class="muted">Metrics with available values are listed first; blank fields appear lower in the grid.</p>
      <div class="stat-grid">{stats_html}</div>
      <h2>Touchpoint interpretation</h2>
      {_bullets(report.get('financial_highlights') or ['Limited multi-year highlights were available for this listing.'])}
      {_page_footer("Ch 1 · Snapshot", snap)}
    </div>""")

    # Chapter 2
    toc.append(("ch2", "Chapter 2 — Business Landscape & Profitability Review"))
    sector_bit = f" as part of the broader {_e(snap.get('sector'))} sector" if snap.get("sector") else ""
    pages.append(f"""
    <div class="page page-break" id="ch2">
      {_page_header(company_nm)}
      <div class="chapter-label">Chapter 2</div>
      <h1 class="chapter">Business Landscape &amp; Profitability Review</h1>
      <h2>Business description</h2>
      <p class="hero">{_e((snap.get('description') or 'Business description not available on free sources for this listing.')[:1600])}</p>
      <h2>Industry context</h2>
      <p class="narrative">
        {_e(snap.get('name') or snap.get('symbol'))} competes within
        {_e(snap.get('industry') or 'its stated industry')}{sector_bit}.
        Industry structure — concentration of rivals, buyer power, regulation and technology change —
        frames the durability of margins and the pace at which growth can compound.
      </p>
      <ul class="bullets">
        <li>Peer comparison is most meaningful inside the same industry and accounting regime.</li>
        <li>Regulatory and subsidy regimes can alter unit economics for an entire sector at once.</li>
        <li>Secondary listings may differ in liquidity and disclosure quality from the primary home-market listing.</li>
      </ul>
      {_page_footer("Ch 2 · Business", snap)}
    </div>""")

    income_yoy = report.get("income_yoy") or {"periods": [], "rows": []}
    pages.append(f"""
    <div class="page page-break" id="ch2-income">
      {_page_header(company_nm)}
      <div class="chapter-label">Chapter 2</div>
      <h1 class="chapter">Income Statement</h1>
      {_yoy_table(income_yoy, "Consolidated income statement with YoY growth", currency=_ccy, as_of=_asof)}
      {_page_footer("Ch 2 · Income statement", snap)}
    </div>""")
    pages.append(f"""
    <div class="page page-break" id="ch2-income-analysis">
      {_page_header(company_nm)}
      <div class="chapter-label">Chapter 2</div>
      <h1 class="chapter">Income Statement — Line-Item Analysis</h1>
      <p class="muted">Each reported line is defined, charted across available periods, and interpreted using YoY growth.</p>
      {_metric_analysis_blocks(income_yoy, max_items=8)}
      {_page_footer("Ch 2 · Income analysis", snap)}
    </div>""")
    pages.append(f"""
    <div class="page page-break" id="ch2-income-synthesis">
      {_page_header(company_nm)}
      <div class="chapter-label">Chapter 2</div>
      <h1 class="chapter">Income Statement — Company-Level Synthesis</h1>
      {_overall_narrative(income_yoy, "income statement")}
      <h2>Additional highlights</h2>
      {_bullets(report.get('financial_highlights') or [])}
      {_page_footer("Ch 2 · Synthesis", snap)}
    </div>""")

    # Chapter 3 Balance sheet
    toc.append(("ch3", "Chapter 3 — Financial Position: Balance Sheet"))
    for key, title, aid in [
        ("assets_yoy", "Assets", "ch3-assets"),
        ("liabilities_yoy", "Liabilities", "ch3-liab"),
        ("equity_yoy", "Shareholders Equity", "ch3-equity"),
    ]:
        mx = report.get(key) or {"periods": [], "rows": []}
        if not mx.get("rows"):
            continue
        pages.append(f"""
        <div class="page page-break" id="{aid}">
          {_page_header(company_nm)}
          <div class="chapter-label">Chapter 3</div>
          <h1 class="chapter">Balance Sheet — {_e(title)}</h1>
          {_yoy_table(mx, title + " with YoY growth under each line", currency=_ccy, as_of=_asof)}
          {_page_footer("Ch 3 · " + title, snap)}
        </div>""")
        pages.append(f"""
        <div class="page page-break" id="{aid}-analysis">
          {_page_header(company_nm)}
          <div class="chapter-label">Chapter 3</div>
          <h1 class="chapter">{_e(title)} — Line-Item Analysis</h1>
          {_metric_analysis_blocks(mx, max_items=10)}
          <h2>Overall reading on {_e(title.lower())}</h2>
          {_overall_narrative(mx, title.lower())}
          {_page_footer("Ch 3 · " + title + " analysis", snap)}
        </div>""")

    # Chapter 4 Cash flow
    toc.append(("ch4", "Chapter 4 — Liquidity Engine: Cash Flows"))
    for key, title, aid in [
        ("operating_cf_yoy", "Operating Activities", "ch4-op"),
        ("investing_cf_yoy", "Investing Activities", "ch4-inv"),
        ("financing_cf_yoy", "Financing Activities", "ch4-fin"),
        ("net_fcf_yoy", "Net Change and Free Cash Flow", "ch4-fcf"),
    ]:
        mx = report.get(key) or {"periods": [], "rows": []}
        if not mx.get("rows"):
            continue
        pages.append(f"""
        <div class="page page-break" id="{aid}">
          {_page_header(company_nm)}
          <div class="chapter-label">Chapter 4</div>
          <h1 class="chapter">Cash Flow — {_e(title)}</h1>
          {_yoy_table(mx, title + " with YoY growth", currency=_ccy, as_of=_asof)}
          {_page_footer("Ch 4 · " + title, snap)}
        </div>""")
        pages.append(f"""
        <div class="page page-break" id="{aid}-analysis">
          {_page_header(company_nm)}
          <div class="chapter-label">Chapter 4</div>
          <h1 class="chapter">{_e(title)} — Line-Item Analysis</h1>
          {_metric_analysis_blocks(mx, max_items=10)}
          <h2>Overall reading</h2>
          {_overall_narrative(mx, title.lower())}
          {_page_footer("Ch 4 · " + title + " analysis", snap)}
        </div>""")

    # Chapter 5 Ratios
    toc.append(("ch5", "Chapter 5 — Valuation Metrics & Operating KPIs"))
    ratios = report.get("ratios") or {}
    for gi, (group, items) in enumerate(ratios.items()):
        blocks = []
        for name, val in items:
            if val in (None, "", "—"):
                continue
            explain = (report.get("term_explain") or {}).get(name) or (
                f"{name} is a financial ratio used to compare this company with peers and its own history. "
                f"The currently observed value is {val}."
            )
            insight = _ratio_insight(name, val, explain, snap)
            blocks.append(f"""
            <div class="metric-block">
              <h4>{_e(name)} — <span class="stat-v">{_e(val)}</span></h4>
              <p class="def"><strong>Definition:</strong> {_e(explain)}</p>
              <p class="trend"><strong>Investor insight:</strong> {_e(insight)}</p>
            </div>""")
        if not blocks:
            continue
        pages.append(f"""
        <div class="page page-break" id="ch5-{gi}">
          {_page_header(company_nm)}
          <div class="chapter-label">Chapter 5</div>
          <h1 class="chapter">Ratios &amp; KPIs — {_e(group)}</h1>
          {''.join(blocks)}
          {_page_footer("Ch 5 · " + str(group), snap)}
        </div>""")

    # Chapter 6 SWOT
    toc.append(("ch6", "Chapter 6 — Strategic Positioning: SWOT"))
    swot = report.get("swot") or {}
    pages.append(f"""
    <div class="page page-break" id="ch6">
      {_page_header(company_nm)}
      <div class="chapter-label">Chapter 6</div>
      <h1 class="chapter">Strategic Positioning — SWOT</h1>
      <div class="swot-stack">
        <div class="swot-item swot-s"><h3>Strengths</h3>{_bullets(swot.get('strengths') or [])}
          {_svg_line([1, 1.2, 1.4, 1.5, 1.6], color='#059669')}</div>
        <div class="swot-item swot-w"><h3>Weaknesses</h3>{_bullets(swot.get('weaknesses') or [])}
          {_svg_line([1.5, 1.4, 1.2, 1.1, 1.0], color='#dc2626')}</div>
        <div class="swot-item swot-o"><h3>Opportunities</h3>{_bullets(swot.get('opportunities') or [])}
          {_svg_line([1, 1.1, 1.3, 1.5, 1.8], color='#2563eb')}</div>
        <div class="swot-item swot-t"><h3>Threats</h3>{_bullets(swot.get('threats') or [])}
          {_svg_line([1.2, 1.3, 1.25, 1.4, 1.5], color='#d97706')}</div>
      </div>
      {_page_footer("Ch 6 · SWOT detail", snap)}
    </div>""")
    pages.append(f"""
    <div class="page page-break" id="ch6-grid">
      {_page_header(company_nm)}
      <div class="chapter-label">Chapter 6</div>
      <h1 class="chapter">SWOT — Combined Matrix</h1>
      <div class="swot-grid">
        <div class="swot-item swot-s"><h3>Strengths</h3>{_bullets(swot.get('strengths') or [])}</div>
        <div class="swot-item swot-w"><h3>Weaknesses</h3>{_bullets(swot.get('weaknesses') or [])}</div>
        <div class="swot-item swot-o"><h3>Opportunities</h3>{_bullets(swot.get('opportunities') or [])}</div>
        <div class="swot-item swot-t"><h3>Threats</h3>{_bullets(swot.get('threats') or [])}</div>
      </div>
      {_page_footer("Ch 6 · SWOT matrix", snap)}
    </div>""")

    # Chapter 7 PESTLE
    toc.append(("ch7", "Chapter 7 — Macro Environment: PESTLE"))
    pestle = report.get("pestle") or {}
    pestle_blocks = [f"<div class='pestle-item'><h3>{_e(k)}</h3>{_bullets(items)}</div>" for k, items in pestle.items()]
    pages.append(f"""
    <div class="page page-break" id="ch7">
      {_page_header(company_nm)}
      <div class="chapter-label">Chapter 7</div>
      <h1 class="chapter">Macro Environment — PESTLE</h1>
      <p class="muted">Political, Economic, Social, Technological, Legal and Environmental forces that frame the investment case.</p>
      {''.join(pestle_blocks[:3])}
      {_page_footer("Ch 7 · PESTLE (1)", snap)}
    </div>""")
    pages.append(f"""
    <div class="page page-break" id="ch7b">
      {_page_header(company_nm)}
      <div class="chapter-label">Chapter 7</div>
      <h1 class="chapter">PESTLE </h1>
      {''.join(pestle_blocks[3:])}
      <h2>Combined PESTLE overview</h2>
      <div class="stat-grid">
        {''.join(f"<div class='stat'><div class='stat-k'>{_e(k)}</div><div class='stat-v'>{len(v)} factors</div></div>" for k,v in pestle.items())}
      </div>
      {_page_footer("Ch 7 · PESTLE (2)", snap)}
    </div>""")

    # Chapter 8 Risks
    toc.append(("ch8", "Chapter 8 — Investment Risk Register"))
    risks = report.get("risks") or {}
    pages.append(f"""
    <div class="page page-break" id="ch8">
      {_page_header(company_nm)}
      <div class="chapter-label">Chapter 8</div>
      <h1 class="chapter">Investment Risk Register</h1>
      <h2>Operational risks</h2>
      {_bullets(risks.get('operational') or [])}
      <h2>Economic &amp; macro risks</h2>
      {_bullets(risks.get('economic') or [])}
      <h2>Market &amp; listing risks</h2>
      {_bullets(risks.get('market') or [])}
      <p class="narrative" style="margin-top:12px">
        Risk is not binary. Position sizing, time horizon and portfolio diversification determine how much of the
        above catalogue is tolerable for any individual investor.
      </p>
      {_page_footer("Ch 8 · Risks", snap)}
    </div>""")

    # Chapter 9 Dividends
    toc.append(("ch9", "Chapter 9 — Shareholder Distributions"))
    dy = snap.get("dividend_yield")
    if dy is not None:
        dy_disp = f"{dy*100:.2f}%" if abs(float(dy)) <= 1.5 else f"{float(dy):.2f}%"
        pages.append(f"""
        <div class="page page-break" id="ch9">
          {_page_header(company_nm)}
          <div class="chapter-label">Chapter 9</div>
          <h1 class="chapter">Shareholder Distributions</h1>
          <div class="stat-grid">
            <div class="stat"><div class="stat-k">Dividend Yield</div><div class="stat-v">{_e(dy_disp)}</div></div>
          </div>
          <p class="narrative">
            Dividend yield measures annual cash returned to shareholders as a percentage of price.
            Sustainability depends on earnings coverage and free-cash-flow coverage — not on yield level alone.
          </p>
          {_svg_line([1, 1.05, 1.08, 1.1, 1.12], color='#0e7490')}
          <p class="trend"><strong>Interpretation:</strong> Treat the disclosed yield as a starting point.
          Confirm payment history and cash-flow coverage in primary filings before relying on income assumptions.</p>
          {_page_footer("Ch 9 · Dividends", snap)}
        </div>""")
    else:
        pages.append(f"""
        <div class="page page-break" id="ch9">
          {_page_header(company_nm)}
          <div class="chapter-label">Chapter 9</div>
          <h1 class="chapter">Shareholder Distributions</h1>
          <p class="muted">No dividend yield was available from public sources for this listing. This chapter is intentionally brief.</p>
          {_page_footer("Ch 9 · Dividends", snap)}
        </div>""")

    # Chapter 10 Price
    toc.append(("ch10", "Chapter 10 — Market Price Trajectory"))
    ph = report.get("price_history") or {}
    closes = ph.get("closes") or []
    chart_html = f"<div class=\"chart-wrap\">{_svg_line(closes if ph.get('available') else [1, 1.02, 0.98, 1.05, 1.03], width=480, height=140)}</div>"
    ph_note = (f"Series points: {len(closes)} (approx last 6–12 months from free market data)."
               if ph.get("available") else "Full daily history was not available from free feeds; chart may be illustrative.")
    pages.append(f"""
    <div class="page page-break" id="ch10">
      {_page_header(company_nm)}
      <div class="chapter-label">Chapter 10</div>
      <h1 class="chapter">Market Price Trajectory</h1>
      <p class="narrative">
        Last compiled price level: <strong>{_e(snap.get('price'))} {_e(snap.get('currency') or '')}</strong>.
        52-week range: {_e(snap.get('week52_low'))} – {_e(snap.get('week52_high'))}.
        {_e(ph_note)}
      </p>
      {chart_html}
      <p class="trend"><strong>Interpretation:</strong>
      Price alone does not equal value. Relate the current level to earnings power (Chapter 5),
      cash generation (Chapter 4) and the risk register (Chapter 8).
      </p>
      {_page_footer("Ch 10 · Price", snap)}
    </div>""")

    # Recommendation
    toc.append(("ch-rec", "Synthesis & Investment Recommendation"))
    rec = report.get("recommendation") or {}
    s_str = ", ".join((swot.get("strengths") or ["franchise visibility"])[:2])
    w_str = ", ".join((swot.get("weaknesses") or ["data gaps on free sources"])[:2])
    pages.append(f"""
    <div class="page page-break" id="ch-rec">
      {_page_header(company_nm)}
      <div class="chapter-label">Synthesis</div>
      <h1 class="chapter">Integrated Summary</h1>
      <p class="narrative">{_e(report.get('investment_summary') or '')}</p>
      <h2>What the statements suggest</h2>
      {_bullets(report.get('financial_highlights') or [])}
      <h2>Strategic balance</h2>
      <p class="narrative">
        Strengths centre on {_e(s_str)}.
        Offsetting pressures include {_e(w_str)}.
      </p>
      {_page_footer("Synthesis", snap)}
    </div>""")
    pages.append(f"""
    <div class="page page-break" id="ch-rec2">
      {_page_header(company_nm)}
      <div class="chapter-label">Recommendation</div>
      <h1 class="chapter">Investment Recommendation</h1>
      <div class="rec-box">
        <div class="rec-action">{_e(rec.get('action') or 'HOLD')}</div>
        <p style="margin:8px 0 0;color:#334155">{_e(rec.get('summary') or '')}</p>
      </div>
      <h2>Detailed rationale</h2>
      {_bullets(rec.get('reasons') or [])}
      <h2>Illustrative sensitivity (earnings × multiple)</h2>
      <p class="muted">Not a forecast — shows how implied price moves if EPS ±10% and P/E shifts by ±2 turns.</p>
      {_sensitivity_html(report.get('sensitivity') or [])}
      <h2>Peer universe note</h2>
      <p class="narrative">{_e((report.get('peers') or {}).get('note') or 'Peer counts unavailable for this industry in the local universe.')}</p>
      <h2>Data completeness</h2>
      <p class="narrative">Score {_e((report.get('completeness') or {}).get('score_pct'))}% · Sources: {_e(', '.join((report.get('completeness') or {}).get('sources_active') or []))} · As of {_e(str((report.get('completeness') or {}).get('as_of') or '')[:19])}</p>
      <p class="muted" style="margin-top:14px">
        This recommendation is an automated synthesis of the public data compiled in this report.
        It is not personalised investment advice and does not replace independent due diligence.
      </p>
      {_page_footer("Recommendation", snap)}
    </div>""")

    toc.append(("thanks", "Closing"))
    pages.append("""
    <div class="page page-break thankyou" id="thanks">
      <h1>Thank You</h1>
      <p class="brand">FinSight</p>
      <p class="author">Rudra Nath Sinha</p>
    </div>""")

    index_html = _index(toc, company_nm)
    comp = report.get("completeness") or {}
    guide = _how_to_read() + _methodology(comp, report.get("field_sources") or {})
    gloss = _glossary(report.get("term_explain") or {})
    if pages and "thankyou" in pages[-1]:
        mid = "".join(pages[1:-1]) + gloss + pages[-1]
    else:
        mid = "".join(pages[1:]) + gloss
    body = pages[0] + index_html + guide + mid
    return _shell(report.get("title") or "FinSight Report", body)


def render_financial_html(report: dict) -> str:
    report = dict(report)
    report["report_type"] = "financial"
    snap = report.get("snapshot") or {}
    report["title"] = f"Financial Analysis Report — {snap.get('name') or snap.get('symbol')}"
    return render_equity_html(report)


def render_report_html(report: dict) -> str:
    if (report.get("report_type") or "").lower() == "financial":
        return render_financial_html(report)
    return render_equity_html(report)
