"""
FinSight institutional report API routes.
Mounted early on the FastAPI app so they are never shadowed.
"""
from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Query
from fastapi.responses import HTMLResponse, JSONResponse, Response

router = APIRouter(tags=["reports"])


def _load_builders():
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


def _kind(k: Optional[str]) -> str:
    return "equity"  # product is equity research only


@router.get("/api/report-ping")
def report_ping():
    """Health check — if this 404s, the server is running old code."""
    build_report, _, _, err = _load_builders()
    return {
        "ok": True,
        "report_engine": err is None,
        "error": err,
        "endpoints": [
            "/api/report-ping",
            "/api/reports/html?symbol=TSLA&kind=equity&exchange=NASDAQ",
            "/api/reports/pdf?symbol=TSLA&kind=equity&exchange=NASDAQ",
            "/api/reports/json?symbol=TSLA&kind=equity&exchange=NASDAQ",
        ],
    }


@router.get("/api/reports/html")
def reports_html(
    symbol: str = Query(..., description="Ticker"),
    kind: str = Query("equity"),
    exchange: Optional[str] = Query(None),
):
    build_report, render_html, _, err = _load_builders()
    if err or not build_report:
        return HTMLResponse(
            f"<html><body style='font-family:sans-serif;padding:24px'>"
            f"<h1>Report engine unavailable</h1><pre>{err}</pre></body></html>",
            status_code=500,
        )
    try:
        report = build_report(_kind(kind), symbol.strip().upper(), (exchange or "").strip() or None)
        return HTMLResponse(render_html(report))
    except Exception as e:
        return HTMLResponse(
            f"<html><body style='font-family:sans-serif;padding:24px'>"
            f"<h1>Report generation failed</h1><pre>{e}</pre></body></html>",
            status_code=500,
        )


@router.get("/api/reports/pdf")
def reports_pdf(
    symbol: str = Query(..., description="Ticker"),
    kind: str = Query("equity"),
    exchange: Optional[str] = Query(None),
):
    build_report, _, build_pdf, err = _load_builders()
    if err or not build_report:
        return JSONResponse({"available": False, "error": str(err)}, status_code=500)
    try:
        k = _kind(kind)
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


@router.get("/api/reports/json")
def reports_json(
    symbol: str = Query(..., description="Ticker"),
    kind: str = Query("equity"),
    exchange: Optional[str] = Query(None),
):
    build_report, _, _, err = _load_builders()
    if err or not build_report:
        return JSONResponse({"available": False, "error": str(err)}, status_code=500)
    try:
        report = build_report(_kind(kind), symbol.strip().upper(), (exchange or "").strip() or None)
        report["available"] = True
        return report
    except Exception as e:
        return JSONResponse({"available": False, "error": str(e)[:500]}, status_code=500)


# Path-style aliases
@router.get("/api/report/{kind}/{symbol}/html")
def report_html_path(kind: str, symbol: str, exchange: Optional[str] = None):
    return reports_html(symbol=symbol, kind=kind, exchange=exchange)


@router.get("/api/report/{kind}/{symbol}/pdf")
def report_pdf_path(kind: str, symbol: str, exchange: Optional[str] = None):
    return reports_pdf(symbol=symbol, kind=kind, exchange=exchange)


@router.get("/api/report/{kind}/{symbol}")
def report_json_path(kind: str, symbol: str, exchange: Optional[str] = None):
    return reports_json(symbol=symbol, kind=kind, exchange=exchange)
