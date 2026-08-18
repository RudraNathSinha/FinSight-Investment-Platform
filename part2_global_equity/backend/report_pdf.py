"""
ReportLab PDF exporter for Equity & Financial Analysis reports.
Produces downloadable multi-page PDFs from report_engine payloads.
"""
from __future__ import annotations

import io
import os
from typing import Any, Dict, List, Optional

from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_JUSTIFY, TA_LEFT, TA_RIGHT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import (
    HRFlowable,
    KeepTogether,
    ListFlowable,
    ListItem,
    PageBreak,
    Paragraph,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)

BRAND = colors.HexColor("#0369a1")
INK = colors.HexColor("#0f172a")
MUTED = colors.HexColor("#64748b")
LINE = colors.HexColor("#e2e8f0")
SOFT = colors.HexColor("#f8fafc")
WARN_BG = colors.HexColor("#f0f9ff")
WARN_FG = colors.HexColor("#0c4a6e")


def _styles():
    base = getSampleStyleSheet()
    styles = {
        "title": ParagraphStyle(
            "RTitle", parent=base["Title"], fontSize=16, textColor=BRAND,
            spaceAfter=4, alignment=TA_LEFT, leading=20,
        ),
        "sub": ParagraphStyle(
            "RSub", parent=base["Normal"], fontSize=9, textColor=MUTED, spaceAfter=8,
        ),
        "h1": ParagraphStyle(
            "RH1", parent=base["Heading1"], fontSize=12, textColor=BRAND,
            spaceBefore=10, spaceAfter=6, leading=15,
        ),
        "h2": ParagraphStyle(
            "RH2", parent=base["Heading2"], fontSize=10.5, textColor=INK,
            spaceBefore=8, spaceAfter=4, leading=13,
        ),
        "body": ParagraphStyle(
            "RBody", parent=base["Normal"], fontSize=9, textColor=INK,
            alignment=TA_JUSTIFY, leading=12, spaceAfter=4,
        ),
        "muted": ParagraphStyle(
            "RMuted", parent=base["Normal"], fontSize=8, textColor=MUTED, leading=10,
        ),
        "disc": ParagraphStyle(
            "RDisc", parent=base["Normal"], fontSize=7.5, textColor=WARN_FG,
            leading=9.5, spaceAfter=8,
        ),
        "bullet": ParagraphStyle(
            "RBullet", parent=base["Normal"], fontSize=8.5, textColor=INK, leading=11,
        ),
        "footer": ParagraphStyle(
            "RFooter", parent=base["Normal"], fontSize=7, textColor=MUTED, alignment=TA_CENTER,
        ),
        "statk": ParagraphStyle(
            "RStatK", parent=base["Normal"], fontSize=7, textColor=MUTED, leading=9,
        ),
        "statv": ParagraphStyle(
            "RStatV", parent=base["Normal"], fontSize=9, textColor=INK, leading=11, fontName="Helvetica-Bold",
        ),
        "th": ParagraphStyle(
            "RTh", parent=base["Normal"], fontSize=7.5, textColor=INK, fontName="Helvetica-Bold",
        ),
        "td": ParagraphStyle(
            "RTd", parent=base["Normal"], fontSize=7.5, textColor=INK, leading=9,
        ),
    }
    return styles


def _p(text: Any, style) -> Paragraph:
    s = "" if text is None else str(text)
    s = s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
    return Paragraph(s, style)


def _bullets(items: List[str], styles) -> List:
    if not items:
        return [_p("No items available.", styles["muted"])]
    flow = []
    for it in items:
        flow.append(_p(f"• {it}", styles["bullet"]))
    return flow


def _stat_table(d: Dict[str, Any], styles, cols: int = 4) -> Table:
    items = list(d.items())
    rows = []
    row = []
    for i, (k, v) in enumerate(items):
        cell = [_p(str(k).upper(), styles["statk"]), _p(str(v) if v is not None else "—", styles["statv"])]
        row.append(cell)
        if len(row) == cols:
            rows.append(row)
            row = []
    if row:
        while len(row) < cols:
            row.append([_p("", styles["statk"]), _p("", styles["statv"])])
        rows.append(row)
    # flatten to reportlab nested tables per row
    out_rows = []
    for r in rows:
        inner = []
        for cell in r:
            t = Table([[cell[0]], [cell[1]]], colWidths=[40 * mm])
            t.setStyle(TableStyle([
                ("BACKGROUND", (0, 0), (-1, -1), SOFT),
                ("BOX", (0, 0), (-1, -1), 0.4, LINE),
                ("LEFTPADDING", (0, 0), (-1, -1), 4),
                ("RIGHTPADDING", (0, 0), (-1, -1), 4),
                ("TOPPADDING", (0, 0), (-1, -1), 3),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
            ]))
            inner.append(t)
        out_rows.append(inner)
    if not out_rows:
        return Spacer(1, 1)
    tw = Table(out_rows, colWidths=[45 * mm] * cols)
    tw.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 2),
        ("RIGHTPADDING", (0, 0), (-1, -1), 2),
        ("TOPPADDING", (0, 0), (-1, -1), 2),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 2),
    ]))
    return tw


def _matrix(mx: Dict[str, Any], styles) -> Any:
    periods = mx.get("periods") or []
    rows = mx.get("rows") or []
    if not periods or not rows:
        return _p("Statement data not available from public sources for this listing.", styles["muted"])
    header = [_p("Metric", styles["th"])] + [_p(str(p), styles["th"]) for p in periods]
    data = [header]
    for r in rows:
        data.append(
            [_p(r.get("metric"), styles["td"])]
            + [_p(v, styles["td"]) for v in (r.get("values") or [])]
        )
    n = len(periods) + 1
    w = 180 * mm
    first = 42 * mm
    rest = (w - first) / max(1, n - 1)
    col_w = [first] + [rest] * (n - 1)
    t = Table(data, colWidths=col_w, repeatRows=1)
    style_cmds = [
        ("BACKGROUND", (0, 0), (-1, 0), SOFT),
        ("GRID", (0, 0), (-1, -1), 0.4, LINE),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("ALIGN", (1, 0), (-1, -1), "RIGHT"),
        ("ALIGN", (0, 0), (0, -1), "LEFT"),
        ("LEFTPADDING", (0, 0), (-1, -1), 3),
        ("RIGHTPADDING", (0, 0), (-1, -1), 3),
        ("TOPPADDING", (0, 0), (-1, -1), 3),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
    ]
    for i in range(1, len(data)):
        if i % 2 == 0:
            style_cmds.append(("BACKGROUND", (0, i), (-1, i), colors.HexColor("#fafbfc")))
    t.setStyle(TableStyle(style_cmds))
    return t


def _header_block(report: dict, styles, badge: str) -> List:
    snap = report.get("snapshot") or {}
    flow = [
        _p(f"{badge} · FinSight", styles["muted"]),
        _p(report.get("title") or "Report", styles["title"]),
        _p(report.get("subtitle") or "", styles["sub"]),
        HRFlowable(width="100%", thickness=2, color=BRAND, spaceAfter=6),
            ]
    return flow


def _footer_canvas(report: dict):
    """Draw fixed footer + disclaimer band at the bottom of every PDF page."""
    snap = report.get("snapshot") or {}
    company = (snap.get("name") or snap.get("symbol") or "").strip()
    ex = (snap.get("exchange") or "").strip()
    disc = (
        "FinSight is an educational analytics workspace. It is not SEBI-registered research or personalised "
        "investment advice. Data may be incomplete. Models are illustrative. Verify with primary filings "
        "and a licensed adviser. © All rights reserved FinSight prepared by Rudra Nath Sinha."
    )

    def _draw(canvas, doc):
        canvas.saveState()
        page_w, page_h = A4
        # Top rule above footer block
        y_top = 16 * mm
        canvas.setStrokeColor(LINE)
        canvas.setLineWidth(0.4)
        canvas.line(16 * mm, y_top, page_w - 16 * mm, y_top)
        # Disclaimer (wrapped)
        canvas.setFont("Helvetica", 6)
        canvas.setFillColor(MUTED)
        # simple wrap
        max_w = page_w - 32 * mm
        words = disc.split()
        lines, cur = [], ""
        for w in words:
            trial = (cur + " " + w).strip()
            if canvas.stringWidth(trial, "Helvetica", 6) <= max_w:
                cur = trial
            else:
                if cur:
                    lines.append(cur)
                cur = w
        if cur:
            lines.append(cur)
        y = 13.5 * mm
        for line in lines[:3]:
            canvas.drawString(16 * mm, y, line)
            y -= 2.6 * mm
        # Brand line + page number
        canvas.setFont("Helvetica", 7)
        canvas.setFillColor(MUTED)
        left = f"FinSight v1.2 · {company} · {ex}"
        canvas.drawString(16 * mm, 5.5 * mm, left[:90])
        canvas.drawRightString(page_w - 16 * mm, 5.5 * mm, f"Page {doc.page}")
        canvas.restoreState()

    return _draw


def build_equity_pdf(report: dict, path: Optional[str] = None) -> bytes:
    styles = _styles()
    buf = io.BytesIO()
    doc = SimpleDocTemplate(
        path or buf, pagesize=A4,
        leftMargin=16 * mm, rightMargin=16 * mm,
        topMargin=14 * mm, bottomMargin=22 * mm,
        title=report.get("title") or "Equity Research Report",
        author="FinSight",
    )
    story: List = []
    story.extend(_header_block(report, styles, "EQUITY RESEARCH REPORT"))
    story.append(_p("Investment snapshot", styles["h1"]))
    story.append(_stat_table(report.get("header_stats") or {}, styles, 4))
    story.append(Spacer(1, 6))
    story.append(_p("Investment summary", styles["h1"]))
    story.append(_p(report.get("investment_summary") or "", styles["body"]))
    story.append(_p("About the company", styles["h1"]))
    snap = report.get("snapshot") or {}
    story.append(_p((snap.get("description") or "No description available.")[:2000], styles["body"]))
    story.append(_p("Financial touchpoints", styles["h1"]))
    story.extend(_bullets(report.get("financial_highlights") or [], styles))

    story.append(PageBreak())
    story.extend(_header_block(report, styles, "EQUITY RESEARCH REPORT"))
    story.append(_p("Historical income statement", styles["h1"]))
    story.append(_matrix(report.get("income_matrix") or {}, styles))
    story.append(Spacer(1, 8))
    story.append(_p("Historical balance sheet", styles["h1"]))
    story.append(_matrix(report.get("balance_matrix") or {}, styles))

    story.append(PageBreak())
    story.extend(_header_block(report, styles, "EQUITY RESEARCH REPORT"))
    story.append(_p("Historical cash flow", styles["h1"]))
    story.append(_matrix(report.get("cashflow_matrix") or {}, styles))
    story.append(_p("Ratio & KPI dashboard", styles["h1"]))
    for group, items in (report.get("ratios") or {}).items():
        story.append(_p(group, styles["h2"]))
        d = {k: v for k, v in items}
        story.append(_stat_table(d, styles, 3))

    story.append(PageBreak())
    story.extend(_header_block(report, styles, "EQUITY RESEARCH REPORT"))
    story.append(_p("Valuation context", styles["h1"]))
    val = report.get("valuation") or {}
    ill = val.get("illustrative_range") or {}
    story.append(_stat_table({
        "Last price": val.get("price"),
        "Trailing P/E": val.get("pe"),
        "EPS": val.get("eps"),
        "P/B": val.get("pb"),
        "Beta": val.get("beta"),
        "Illustrative low": ill.get("eps_based_low"),
        "Illustrative high": ill.get("eps_based_high"),
    }, styles, 3))
    story.extend(_bullets(val.get("notes") or [], styles))
    story.append(_p("SWOT analysis", styles["h1"]))
    swot = report.get("swot") or {}
    for label, key in [("Strengths", "strengths"), ("Weaknesses", "weaknesses"),
                       ("Opportunities", "opportunities"), ("Threats", "threats")]:
        story.append(_p(label, styles["h2"]))
        story.extend(_bullets(swot.get(key) or [], styles))
    story.append(_p("Investment risks", styles["h1"]))
    risks = report.get("risks") or {}
    for label, key in [("Operational", "operational"), ("Economic", "economic"), ("Market / listing", "market")]:
        story.append(_p(label, styles["h2"]))
        story.extend(_bullets(risks.get(key) or [], styles))
    story.append(_p("Methodology", styles["h1"]))
    story.extend(_bullets([
        "Primary data: stockanalysis.com scrape for the selected symbol and exchange.",
        "Secondary: multi-source market data where scrape coverage is incomplete.",
        "Illustrative valuation uses transparent CAPM and sector P/E bands — not formal targets.",
        "Verify all figures against the issuer’s primary exchange filings before capital decisions.",
    ], styles))

    doc.build(story, onFirstPage=_footer_canvas(report), onLaterPages=_footer_canvas(report))
    if path:
        with open(path, "rb") as f:
            return f.read()
    return buf.getvalue()


def build_financial_pdf(report: dict, path: Optional[str] = None) -> bytes:
    styles = _styles()
    buf = io.BytesIO()
    doc = SimpleDocTemplate(
        path or buf, pagesize=A4,
        leftMargin=16 * mm, rightMargin=16 * mm,
        topMargin=14 * mm, bottomMargin=22 * mm,
        title=report.get("title") or "Financial Analysis Report",
        author="FinSight",
    )
    story: List = []
    story.extend(_header_block(report, styles, "FINANCIAL ANALYSIS REPORT"))
    story.append(_p("Abstract", styles["h1"]))
    story.append(_p(report.get("abstract") or "", styles["body"]))
    story.append(_p(f"Keywords: {', '.join(report.get('keywords') or [])}", styles["muted"]))
    snap = report.get("snapshot") or {}
    story.append(_p("1. Introduction", styles["h1"]))
    story.append(_p((snap.get("description") or "")[:1500] or "Introduction data limited for this listing.", styles["body"]))
    story.append(_stat_table({
        "Sector": snap.get("sector"),
        "Industry": snap.get("industry"),
        "Country": snap.get("country"),
        "Exchange": snap.get("exchange"),
        "Market Cap": snap.get("market_cap"),
        "Price": snap.get("price"),
    }, styles, 3))

    story.append(PageBreak())
    story.extend(_header_block(report, styles, "FINANCIAL ANALYSIS REPORT"))
    story.append(_p("2. Analysis of expenses", styles["h1"]))
    exp = report.get("expenses") or {}
    story.extend(_bullets(exp.get("narrative") or [], styles))
    for b in exp.get("blocks") or []:
        story.append(_p(b.get("title") or "", styles["h2"]))
        story.append(_p(b.get("note") or "", styles["body"]))
    story.append(_p("Income statement extract", styles["h1"]))
    story.append(_matrix(report.get("income_matrix") or {}, styles))

    story.append(PageBreak())
    story.extend(_header_block(report, styles, "FINANCIAL ANALYSIS REPORT"))
    story.append(_p("Balance sheet extract", styles["h1"]))
    story.append(_matrix(report.get("balance_matrix") or {}, styles))
    story.append(Spacer(1, 6))
    story.append(_p("Cash flow extract", styles["h1"]))
    story.append(_matrix(report.get("cashflow_matrix") or {}, styles))
    story.append(_p("Ratio panel", styles["h1"]))
    for group, items in (report.get("ratios") or {}).items():
        story.append(_p(group, styles["h2"]))
        story.append(_stat_table({k: v for k, v in items}, styles, 3))

    story.append(PageBreak())
    story.extend(_header_block(report, styles, "FINANCIAL ANALYSIS REPORT"))
    story.append(_p("3. Shareholders & listing notes", styles["h1"]))
    story.extend(_bullets([
        "Beneficial ownership detail is often incomplete on free quote pages.",
        "Cross-check float, insiders, and institutions on the primary exchange filings.",
        "Secondary listings may differ in liquidity and disclosure from the home market.",
    ], styles))
    story.append(_p("4. SWOT analysis", styles["h1"]))
    swot = report.get("swot") or {}
    for label, key in [("Strengths", "strengths"), ("Weaknesses", "weaknesses"),
                       ("Opportunities", "opportunities"), ("Threats", "threats")]:
        story.append(_p(label, styles["h2"]))
        story.extend(_bullets(swot.get(key) or [], styles))
    story.append(_p("5. Conclusion", styles["h1"]))
    conc = report.get("conclusion") or {}
    story.append(_p("5.1 Results", styles["h2"]))
    story.extend(_bullets(conc.get("results") or [], styles))
    story.append(_p("5.2 Limitations", styles["h2"]))
    story.extend(_bullets(conc.get("limitations") or [], styles))
    story.append(_p("Data sources", styles["h1"]))
    story.extend(_bullets([
        ", ".join(report.get("sources") or ["Public free sources"]),
        f"Scrape path: {report.get('scrape_url') or 'n/a'}",
        f"Generated at {report.get('generated_at')}",
    ], styles))

    doc.build(story, onFirstPage=_footer_canvas(report), onLaterPages=_footer_canvas(report))
    if path:
        with open(path, "rb") as f:
            return f.read()
    return buf.getvalue()


def build_pdf(report: dict, path: Optional[str] = None) -> bytes:
    if (report.get("report_type") or "").lower() == "financial":
        return build_financial_pdf(report, path)
    return build_equity_pdf(report, path)
