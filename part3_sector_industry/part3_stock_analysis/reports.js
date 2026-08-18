/* FinSight: reports here are sector-rank context notes, not the institutional equity pack from Global Equity Universe */
/* © All rights reserved FinSight prepared by Rudra Nath Sinha */

/* FinSight — Report generators (Equity Research + Valuation + Financial Model)
   Templates adapted from sample equity research (broker-style) and business valuation reports. */
(function (global) {
  const R = {};

  function money(v, d=0) {
    if (v == null || isNaN(v)) return '—';
    const n = Number(v);
    const abs = Math.abs(n);
    const sign = n < 0 ? '-' : '';
    if (abs >= 1e12) return sign + '$' + (abs/1e12).toFixed(2) + 'T';
    if (abs >= 1e9) return sign + '$' + (abs/1e9).toFixed(2) + 'B';
    if (abs >= 1e6) return sign + '$' + (abs/1e6).toFixed(2) + 'M';
    if (abs >= 1e3) return sign + '$' + (abs/1e3).toFixed(1) + 'K';
    return sign + '$' + abs.toFixed(d);
  }
  function px(v) {
    if (v == null || isNaN(v)) return '—';
    return '$' + Number(v).toFixed(2);
  }
  function pct(v, already=false) {
    if (v == null || isNaN(v)) return '—';
    const n = already ? Number(v) : Number(v) * 100;
    return (n >= 0 ? '' : '') + n.toFixed(1) + '%';
  }
  function num(v, d=2) {
    if (v == null || isNaN(v)) return '—';
    return Number(v).toLocaleString(undefined, { maximumFractionDigits: d });
  }
  function today() {
    return new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  }

  function shell(title, subtitle, bodyHtml) {
    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<title>${title}</title>
<style>
  @page { margin: 18mm; }
  * { box-sizing: border-box; }
  body { font-family: Georgia, 'Times New Roman', serif; color: #0f172a; line-height: 1.45; margin: 0; padding: 32px; font-size: 12.5px; }
  h1 { font-size: 22px; margin: 0 0 4px; color: #0f172a; }
  h2 { font-size: 15px; margin: 22px 0 8px; color: #1e3a5f; border-bottom: 2px solid #1e3a5f; padding-bottom: 4px; }
  h3 { font-size: 13px; margin: 14px 0 6px; color: #334155; }
  .header { display:flex; justify-content:space-between; align-items:flex-start; border-bottom: 3px solid #1a7ff5; padding-bottom: 12px; margin-bottom: 18px; }
  .brand { font-family: Inter, system-ui, sans-serif; font-weight: 800; color: #1a7ff5; font-size: 18px; letter-spacing: -0.02em; }
  .meta { font-family: Inter, system-ui, sans-serif; font-size: 11px; color: #64748b; text-align: right; }
  .badge { display:inline-block; padding: 3px 10px; border-radius: 4px; font-family: Inter, system-ui, sans-serif; font-weight: 700; font-size: 12px; }
  .badge-buy { background:#dcfce7; color:#166534; }
  .badge-hold { background:#fef9c3; color:#854d0e; }
  .badge-sell { background:#fee2e2; color:#991b1b; }
  table { width: 100%; border-collapse: collapse; margin: 8px 0 14px; font-size: 11.5px; }
  th, td { border: 1px solid #e2e8f0; padding: 6px 8px; text-align: right; }
  th { background: #1e3a5f; color: #fff; font-family: Inter, system-ui, sans-serif; font-weight: 600; text-align: center; }
  td:first-child, th:first-child { text-align: left; }
  tr:nth-child(even) td { background: #f8fafc; }
  .kpi { display:grid; grid-template-columns: repeat(4,1fr); gap: 10px; margin: 12px 0; }
  .kpi .box { border: 1px solid #e2e8f0; border-radius: 8px; padding: 10px; background:#f8fafc; }
  .kpi .lab { font-family: Inter, system-ui, sans-serif; font-size: 10px; color:#64748b; text-transform:uppercase; letter-spacing:0.04em; }
  .kpi .val { font-family: Inter, system-ui, sans-serif; font-size: 16px; font-weight: 700; margin-top: 2px; }
  .callout { background:#eff6ff; border-left: 4px solid #1a7ff5; padding: 10px 12px; margin: 12px 0; font-size: 12px; }
  .disclaimer { margin-top: 28px; padding-top: 12px; border-top: 1px solid #cbd5e1; font-size: 10px; color:#64748b; font-family: Inter, system-ui, sans-serif; page-break-before: always; }
  ul { margin: 6px 0 10px 18px; padding: 0; }
  li { margin-bottom: 4px; }
  .muted { color:#64748b; }
  .page { page-break-after: always; padding-bottom: 8px; }
  .page:last-of-type { page-break-after: auto; }
  .cover-rule { height: 3px; background: linear-gradient(90deg,#1a7ff5,#59c0ff); border:0; margin: 8px 0 16px; }
  .finsight-report-badge { display:inline-block; font-size:10px; font-weight:700; letter-spacing:0.06em; text-transform:uppercase; color:#1a7ff5; border:1px solid #bfdbfe; background:#eff6ff; padding:3px 8px; border-radius:999px; font-family: Inter, system-ui, sans-serif; }
  .page-foot { margin-top: 18px; padding-top: 8px; border-top: 1px solid #e2e8f0; font-size: 9px; color:#94a3b8; font-family: Inter, system-ui, sans-serif; display:flex; justify-content:space-between; }
  table { width:100%; border-collapse: collapse; }
  th { background:#f8fafc; }
  .section-title { font-family: Inter, system-ui, sans-serif; font-size: 11px; text-transform: uppercase; letter-spacing: 0.06em; color: #1a7ff5; margin: 0 0 8px; }
  .insight { background:#f8fafc; border-left: 3px solid #64748b; padding: 8px 10px; margin: 8px 0 14px; font-size: 11.5px; }
  .actions { position: sticky; top: 0; background: #fff; padding: 10px 0; margin-bottom: 12px; border-bottom: 1px solid #e2e8f0; font-family: Inter, system-ui, sans-serif; z-index: 5; }
  .actions button { background:#1a7ff5; color:#fff; border:0; border-radius:6px; padding:8px 14px; font-weight:600; cursor:pointer; margin-right:8px; }
  .actions button.secondary { background:#64748b; }
  @media print {
    .actions { display:none; }
    body { padding: 0; }
  }
</style>
</head>
<body>
  <div class="actions">
    <button onclick="window.print()">Print</button>
    <button class="secondary" id="btnServerPdf" type="button">Download PDF</button>
    <button class="secondary" onclick="window.close()">Close</button>
    <span id="pdfStatus" style="margin-left:10px;font-size:12px;color:#64748b;"></span>
  </div>
  <script>
    (function(){
      var btn = document.getElementById('btnServerPdf');
      if (!btn) return;
      btn.addEventListener('click', async function(){
        var status = document.getElementById('pdfStatus');
        status.textContent = 'Generating PDF…';
        try {
          var html = '<!DOCTYPE html>' + document.documentElement.outerHTML;
          // strip the sticky actions bar from the printed payload
          html = html.replace(/<div class="actions"[\s\S]*?<\/div>/, '');
          var filename = (document.title || 'finsight-report').replace(/[^a-zA-Z0-9._-]+/g,'_') + '.pdf';
          var bases = ['', 'http://127.0.0.1:5000'];
          var lastErr = null;
          for (var i=0;i<bases.length;i++){
            try {
              var res = await fetch(bases[i] + '/api/reports/pdf', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Accept': 'application/pdf' },
                body: JSON.stringify({ html: html, filename: filename })
              });
              if (!res.ok) {
                var body = null; try { body = await res.json(); } catch(e){}
                throw new Error((body && body.error) || ('PDF failed ' + res.status));
              }
              var blob = await res.blob();
              var a = document.createElement('a');
              var obj = URL.createObjectURL(blob);
              a.href = obj; a.download = filename;
              document.body.appendChild(a); a.click(); a.remove();
              setTimeout(function(){ URL.revokeObjectURL(obj); }, 4000);
              status.textContent = 'PDF downloaded.';
              return;
            } catch (e) { lastErr = e; }
          }
          status.textContent = 'Server PDF unavailable — use Print instead. ' + (lastErr && lastErr.message ? lastErr.message : '');
        } catch (e) {
          status.textContent = 'PDF error: ' + e.message;
        }
      });
    })();
  </script>
  <div class="header">
    <div>
      <div class="brand">FinSight Analytics</div>
      <div class="finsight-report-badge">Investor Education Report</div>
      <h1>${title}</h1>
      <div class="muted">${subtitle}</div>
    </div>
    <div class="meta">
      Report date: ${today()}<br/>
      FinSight Equity Research Desk<br/>
      © All rights reserved FinSight · prepared by Rudra Nath Sinha
    </div>
  </div>
  ${bodyHtml}
  <div class="page-foot"><span>© All rights reserved FinSight prepared by Rudra Nath Sinha</span><span>Verify against primary filings</span></div>
  <div class="disclaimer"><div style="margin-bottom:8px;font-weight:600;">© All rights reserved FinSight prepared by Rudra Nath Sinha</div>
    <strong>Disclaimer:</strong> This report is generated automatically by FinSight for educational and illustrative purposes only. It is <strong>not</strong> SEBI-registered research or personalised investment advice.
    It is not investment advice, a USPAP appraisal, or a regulated research product. Data may be incomplete or delayed.
    Assumptions (including Damodaran-linked discount rates where used) are simplified. Always verify with primary filings and professional advisors.
  </div>
</body>
</html>`;
  }

  async function openReport(html, opts) {
    opts = opts || {};
    // Always open preview window for review
    const w = window.open('', '_blank');
    if (!w) {
      alert('Please allow pop-ups to view the report.');
      return;
    }
    w.document.open();
    w.document.write(html);
    w.document.close();

    // Optional auto server-side PDF download
    if (opts.autoPdf && global.LiveAPI && global.LiveAPI.downloadPdf) {
      try {
        const filename = (opts.filename || 'finsight-report.pdf');
        // strip actions bar
        const clean = html.replace(/<div class="actions"[\s\S]*?<\/div>/, '');
        await global.LiveAPI.downloadPdf(clean, filename);
      } catch (e) {
        console.warn('Server PDF skipped:', e.message);
      }
    }
  }

  function ratingFromUpside(upside) {
    if (upside == null) return { key: 'HOLD', cls: 'badge-hold' };
    if (upside >= 15) return { key: 'BUY', cls: 'badge-buy' };
    if (upside <= -10) return { key: 'SELL', cls: 'badge-sell' };
    return { key: 'HOLD', cls: 'badge-hold' };
  }

  async function gather(sym) {
    const uni = (global.UNIVERSE || []).find(u => u.Symbol === sym) || {};
    let rank = null;
    if (uni.Sector && global.loadSectorRankings) {
      try {
        const all = await global.loadSectorRankings(uni.Sector);
        rank = (all || []).find(r => r.Symbol === sym) || null;
      } catch (_) {}
    }
    let quote = {};
    let financials = {};
    let history = [];
    try { quote = await global.LiveAPI.quote(sym); } catch (_) {}
    try { financials = await global.LiveAPI.financials(sym); } catch (_) {}
    try { history = await global.LiveAPI.history(sym, '1y', '1d'); } catch (_) {}
    return { sym, uni, rank, quote, financials, history };
  }

  function parseMatrix(records) {
    if (!records || !records.length) return { periods: [], map: {} };
    const dateCols = Object.keys(records[0]).filter(k => k !== 'Metric').sort();
    const map = {};
    records.forEach(r => {
      const m = (r.Metric || '').trim();
      if (!m) return;
      map[m] = {};
      dateCols.forEach(c => {
        const v = r[c];
        map[m][c] = (v == null || v === '' || isNaN(Number(v))) ? null : Number(v);
      });
    });
    return { periods: dateCols, map };
  }

  function lookup(map, names, period) {
    for (const a of names) {
      if (map[a] && map[a][period] != null) return map[a][period];
    }
    const keys = Object.keys(map);
    for (const a of names) {
      const hit = keys.find(k => k.toLowerCase() === a.toLowerCase());
      if (hit && map[hit][period] != null) return map[hit][period];
    }
    return null;
  }

  function dcfModel(quote, financials) {
    const DISCOUNT = 0.0835; // Damodaran median US CoC ~8.35%
    const TG = 0.025;
    const YEARS = 4;
    const inc = parseMatrix(financials.income_statement || []);
    const cf = parseMatrix(financials.cashflow || []);
    const periods = (inc.periods || []).slice(-4);
    const last = periods[periods.length - 1];
    const prev = periods.length > 1 ? periods[periods.length - 2] : null;
    const rev0 = last ? lookup(inc.map, ['Total Revenue', 'Operating Revenue', 'Revenue'], last) : null;
    const revPrev = prev ? lookup(inc.map, ['Total Revenue', 'Operating Revenue', 'Revenue'], prev) : null;
    let fcf0 = last ? lookup(cf.map, ['Free Cash Flow'], last) : null;
    const ocf0 = last ? lookup(cf.map, ['Operating Cash Flow', 'Cash Flow From Continuing Operating Activities'], last) : null;
    const capex0 = last ? lookup(cf.map, ['Capital Expenditure'], last) : null;
    if (fcf0 == null && ocf0 != null && capex0 != null) fcf0 = capex0 < 0 ? ocf0 + capex0 : ocf0 - Math.abs(capex0);
    let g = 0.06;
    if (rev0 && revPrev) g = Math.max(-0.05, Math.min(0.25, (rev0 - revPrev) / Math.abs(revPrev)));
    const margin = (fcf0 && rev0) ? fcf0 / rev0 : 0.08;
    const shares = quote.sharesOutstanding || (last ? lookup(inc.map, ['Diluted Average Shares', 'Basic Average Shares'], last) : null);
    const debt = quote.totalDebt || 0;
    const cash = quote.totalCash || quote.cash || 0;
    let rev = rev0, fcf = fcf0;
    const rows = [];
    let pv = 0;
    for (let t = 1; t <= YEARS; t++) {
      const w = (t - 1) / Math.max(1, YEARS - 1);
      const gt = g * (1 - w) + TG * w;
      rev = rev != null ? rev * (1 + gt) : null;
      const fcfT = rev != null ? rev * margin : (fcf != null ? fcf * (1 + gt) : null);
      fcf = fcfT;
      const disc = fcfT != null ? fcfT / Math.pow(1 + DISCOUNT, t) : null;
      if (disc != null) pv += disc;
      rows.push({ t, g: gt, rev, fcf: fcfT, disc });
    }
    const lastFcf = rows[rows.length - 1]?.fcf;
    let tv = null, pvTv = null;
    if (lastFcf != null && DISCOUNT > TG) {
      tv = (lastFcf * (1 + TG)) / (DISCOUNT - TG);
      pvTv = tv / Math.pow(1 + DISCOUNT, YEARS);
      pv += pvTv;
    }
    const equity = pv - ((debt || 0) - (cash || 0));
    const vps = shares ? equity / shares : null;
    const price = quote.currentPrice ?? quote.previousClose ?? null;
    const upside = (vps != null && price) ? (vps / price - 1) * 100 : null;
    return { DISCOUNT, TG, YEARS, rows, tv, pvTv, pv, equity, shares, vps, price, upside, g0: g, margin, rev0, fcf0 };
  }

  R.equityResearch = async function (sym) {
    const d = await gather(sym);
    const q = d.quote || {};
    const fin = d.financials || {};
    const model = dcfModel(q, fin);
    const rating = ratingFromUpside(model.upside);
    const company = q.longName || q.shortName || d.uni.CompanyName || sym;
    const sector = q.sector || d.uni.Sector || '—';
    const industry = q.industry || d.uni.Industry || '—';
    const price = model.price;
    const target = model.vps;

    const inc = parseMatrix(fin.income_statement || []);
    const bs = parseMatrix(fin.balance_sheet || []);
    const cf = parseMatrix(fin.cashflow || []);
    const incP = (inc.periods || []).slice(-4);
    const bsP = (bs.periods || []).slice(-4);
    const cfP = (cf.periods || []).slice(-4);

    function colYear(c) {
      const m = String(c).match(/(20\d{2})/);
      return m ? m[1] : String(c).slice(0, 10);
    }
    function rowMoney(label, names, matrix, periods) {
      return '<tr><td>' + label + '</td>' + periods.map(p => '<td>' + money(lookup(matrix.map, names, p)) + '</td>').join('') + '</tr>';
    }
    function insightFromSeries(label, names, matrix, periods) {
      if (!periods.length) return label + ': data unavailable.';
      const vals = periods.map(p => lookup(matrix.map, names, p)).filter(v => v != null);
      if (vals.length < 2) return label + ': limited history; latest ' + money(vals[0]) + '.';
      const first = vals[0], last = vals[vals.length - 1];
      const chg = first ? ((last - first) / Math.abs(first)) * 100 : null;
      if (chg == null) return label + ': latest ' + money(last) + '.';
      if (chg > 20) return label + ' expanded ~' + chg.toFixed(0) + '% across the window — supportive for earnings power.';
      if (chg < -15) return label + ' declined ~' + Math.abs(chg).toFixed(0) + '% — monitor demand and costs.';
      return label + ' relatively stable (~' + chg.toFixed(0) + '% cumulative).';
    }

    const summary = (q.longBusinessSummary || '').trim();
    let profileParas = [];
    if (summary.length > 80) {
      const sentences = summary.replace(/\s+/g, ' ').split(/(?<=\.)\s+/).filter(Boolean);
      const chunk = Math.max(1, Math.ceil(sentences.length / 4));
      for (let i = 0; i < 4; i++) {
        const part = sentences.slice(i * chunk, (i + 1) * chunk).join(' ');
        if (part) profileParas.push(part);
      }
    }
    if (!profileParas.length) {
      profileParas = [
        company + ' (' + sym + ') operates in the ' + industry + ' industry within the ' + sector + ' sector.',
        'Coverage uses publicly available market data, reported financial statements and a simplified multi-year cash-flow framework.',
        'Investors typically evaluate growth durability, margin structure, balance-sheet flexibility and capital-return policy.',
        'The following pages synthesize fundamentals, statement trends, ratios, valuation assumptions and a formal recommendation.'
      ];
    }
    let words = profileParas.join(' ').split(/\s+/);
    if (words.length > 160) {
      words = words.slice(0, 150);
      profileParas = [words.slice(0, 40).join(' '), words.slice(40, 80).join(' '), words.slice(80, 120).join(' '), words.slice(120).join(' ') + '.'];
    }

    const officers = (q.companyOfficers || []).slice(0, 8);
    const officerHtml = officers.length
      ? '<table><thead><tr><th>Name</th><th>Title</th><th>Age</th></tr></thead><tbody>' +
        officers.map(o => '<tr><td>' + (o.name||'—') + '</td><td>' + (o.title||'—') + '</td><td>' + (o.age??'—') + '</td></tr>').join('') +
        '</tbody></table>'
      : '<p class="muted">Officer roster not returned by the live feed. Refer to the latest proxy / annual report.</p>';

    const highlights = [
      '<strong>Scale:</strong> Market cap ' + money(q.marketCap) + '; enterprise value ' + money(q.enterpriseValue) + '; revenue base ' + money(q.totalRevenue || model.rev0) + '.',
      '<strong>Profitability:</strong> Gross ' + (q.grossMargins!=null?pct(q.grossMargins):'—') + ', operating ' + (q.operatingMargins!=null?pct(q.operatingMargins):'—') + ', net ' + (q.profitMargins!=null?pct(q.profitMargins):'—') + '; ROE ' + (q.returnOnEquity!=null?pct(q.returnOnEquity):'—') + '.',
      '<strong>Growth:</strong> Revenue ' + (q.revenueGrowth!=null?pct(q.revenueGrowth):'—') + '; earnings ' + (q.earningsGrowth!=null?pct(q.earningsGrowth):'—') + ' (trailing).',
      '<strong>Valuation:</strong> Trailing PE ' + num(q.trailingPE) + 'x, forward PE ' + num(q.forwardPE) + 'x, EV/EBITDA ' + num(q.enterpriseToEbitda) + 'x, P/B ' + num(q.priceToBook) + 'x.',
      '<strong>Capital returns:</strong> Dividend yield ' + (q.dividendYield!=null?pct(q.dividendYield):'—') + '; payout ' + (q.payoutRatio!=null?pct(q.payoutRatio):'—') + '.',
      '<strong>Model:</strong> DCF value ' + px(target) + ' vs price ' + px(price) + ' (' + (model.upside==null?'n/a':(model.upside>=0?'+':'')+model.upside.toFixed(1)+'%') + ') → ' + rating.key + '.'
    ];

    const buildUp = [
      ['Risk-free rate of return', '3.00%', 'US Treasury proxy in the sample build-up schedule.'],
      ['Premium for equity investment', '6.10%', 'Equity risk premium for listed equities.'],
      ['Premium for small company size', '9.85%', 'Size premium (more relevant for smaller caps).'],
      ['Industry-specific risk premium', '1.02%', 'Illustrative industry overlay.'],
      ['Company-specific risk premium', '2.50%', 'Idiosyncratic execution risk buffer.'],
      ['Equity Discount Rate (sum)', '22.47%', 'Sum of risk-free rate and premia above.'],
      ['Net Cash Flow Growth Rate', '3.52%', 'Long-term NCF growth in the sample schedule.'],
      ['Capitalization Rate', '18.95%', 'Equity discount rate less long-term NCF growth.']
    ];

    const body = `
      <div class="page">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;">
          <div>
            <div style="font-size:18px;font-weight:700;font-family:Inter,system-ui,sans-serif;">${company} (${sym})</div>
            <div class="muted">${sector} · ${industry}</div>
          </div>
          <div style="text-align:right;">
            <span class="badge ${rating.cls}">${rating.key}</span>
            <div class="muted" style="margin-top:6px;">TP ${px(target)} · CMP ${px(price)} · Upside ${model.upside==null?'—':(model.upside>=0?'+':'')+model.upside.toFixed(1)+'%'}</div>
          </div>
        </div>
        <div class="section-title">Company Profile</div>
        ${profileParas.map(p => '<p>' + p + '</p>').join('')}
        <div class="section-title">Key Highlights</div>
        <ul>${highlights.map(h => '<li>' + h + '</li>').join('')}</ul>
        <div class="kpi">
          <div class="box"><div class="lab">Market Cap</div><div class="val">${money(q.marketCap)}</div></div>
          <div class="box"><div class="lab">Enterprise Value</div><div class="val">${money(q.enterpriseValue)}</div></div>
          <div class="box"><div class="lab">Trailing PE</div><div class="val">${num(q.trailingPE)}</div></div>
          <div class="box"><div class="lab">Forward PE</div><div class="val">${num(q.forwardPE)}</div></div>
          <div class="box"><div class="lab">EV/EBITDA</div><div class="val">${num(q.enterpriseToEbitda)}</div></div>
          <div class="box"><div class="lab">Profit Margin</div><div class="val">${q.profitMargins!=null?pct(q.profitMargins):'—'}</div></div>
          <div class="box"><div class="lab">ROE</div><div class="val">${q.returnOnEquity!=null?pct(q.returnOnEquity):'—'}</div></div>
          <div class="box"><div class="lab">Beta</div><div class="val">${num(q.beta)}</div></div>
        </div>
      </div>

      <div class="page">
        <h2>Executive Summary Points</h2>
        <ul>
          <li>${company} trades at ${px(price)} against model value ${px(target)} (r=8.35%, g=2.5%).</li>
          <li>Margins: gross ${q.grossMargins!=null?pct(q.grossMargins):'—'} / operating ${q.operatingMargins!=null?pct(q.operatingMargins):'—'} / net ${q.profitMargins!=null?pct(q.profitMargins):'—'}.</li>
          <li>Growth: revenue ${q.revenueGrowth!=null?pct(q.revenueGrowth):'—'} · earnings ${q.earningsGrowth!=null?pct(q.earningsGrowth):'—'}.</li>
          <li>Balance sheet: cash ${money(q.totalCash)} · debt ${money(q.totalDebt)} · book/sh ${num(q.bookValue)}.</li>
          <li>Capital return: dividend yield ${q.dividendYield!=null?pct(q.dividendYield):'—'}; beta ${num(q.beta)}.</li>
          <li>Stance <strong>${rating.key}</strong> maps model gap to desk thresholds.</li>
        </ul>
        <h2>Income Statement (Annual)</h2>
        ${incP.length ? `<table><thead><tr><th>Line</th>${incP.map(p=>'<th>'+colYear(p)+'</th>').join('')}</tr></thead><tbody>
          ${rowMoney('Revenue', ['Total Revenue','Operating Revenue','Revenue'], inc, incP)}
          ${rowMoney('Cost of Revenue', ['Cost Of Revenue','Cost of Revenue'], inc, incP)}
          ${rowMoney('Gross Profit', ['Gross Profit'], inc, incP)}
          ${rowMoney('Operating Income', ['Operating Income','Operating Income Loss'], inc, incP)}
          ${rowMoney('Net Income', ['Net Income','Net Income Common Stockholders'], inc, incP)}
        </tbody></table>
        <div class="insight"><strong>Insight — Income.</strong> ${insightFromSeries('Revenue', ['Total Revenue','Revenue'], inc, incP)} ${insightFromSeries('Net income', ['Net Income'], inc, incP)}</div>` : '<p class="muted">Income statement unavailable.</p>'}
      </div>

      <div class="page">
        <h2>Balance Sheet — Assets</h2>
        ${bsP.length ? `<table><thead><tr><th>Line</th>${bsP.map(p=>'<th>'+colYear(p)+'</th>').join('')}</tr></thead><tbody>
          ${rowMoney('Cash & Equivalents', ['Cash And Cash Equivalents','Cash Cash Equivalents And Short Term Investments'], bs, bsP)}
          ${rowMoney('Receivables', ['Receivables','Accounts Receivable'], bs, bsP)}
          ${rowMoney('Inventory', ['Inventory'], bs, bsP)}
          ${rowMoney('Total Current Assets', ['Current Assets','Total Current Assets'], bs, bsP)}
          ${rowMoney('Net PPE', ['Net PPE','Properties Plant And Equipment Net'], bs, bsP)}
          ${rowMoney('Total Assets', ['Total Assets'], bs, bsP)}
        </tbody></table>
        <div class="insight"><strong>Insight — Assets.</strong> ${insightFromSeries('Total assets', ['Total Assets'], bs, bsP)}</div>` : '<p class="muted">Balance sheet unavailable.</p>'}
        <h2>Balance Sheet — Liabilities</h2>
        ${bsP.length ? `<table><thead><tr><th>Line</th>${bsP.map(p=>'<th>'+colYear(p)+'</th>').join('')}</tr></thead><tbody>
          ${rowMoney('Accounts Payable', ['Accounts Payable'], bs, bsP)}
          ${rowMoney('Current Debt', ['Current Debt','Current Debt And Capital Lease Obligation'], bs, bsP)}
          ${rowMoney('Total Current Liabilities', ['Current Liabilities','Total Current Liabilities'], bs, bsP)}
          ${rowMoney('Long-Term Debt', ['Long Term Debt','Long Term Debt And Capital Lease Obligation'], bs, bsP)}
          ${rowMoney('Total Liabilities', ['Total Liabilities Net Minority Interest','Total Liabilities'], bs, bsP)}
        </tbody></table>
        <div class="insight"><strong>Insight — Liabilities.</strong> ${insightFromSeries('Total liabilities', ['Total Liabilities Net Minority Interest','Total Liabilities'], bs, bsP)} Quote total debt ${money(q.totalDebt)}.</div>` : ''}
      </div>

      <div class="page">
        <h2>Balance Sheet — Equity</h2>
        ${bsP.length ? `<table><thead><tr><th>Line</th>${bsP.map(p=>'<th>'+colYear(p)+'</th>').join('')}</tr></thead><tbody>
          ${rowMoney('Common Stock', ['Common Stock'], bs, bsP)}
          ${rowMoney('Retained Earnings', ['Retained Earnings'], bs, bsP)}
          ${rowMoney('Stockholders Equity', ['Stockholders Equity','Total Equity Gross Minority Interest'], bs, bsP)}
        </tbody></table>
        <div class="insight"><strong>Insight — Equity.</strong> ${insightFromSeries('Equity', ['Stockholders Equity','Total Equity Gross Minority Interest'], bs, bsP)} Book value/share ${num(q.bookValue)}.</div>` : ''}
        <h2>Working Capital & Leverage</h2>
        <p>Current ratio ${num(q.currentRatio)}; debt-to-equity ${num(q.debtToEquity)}. Coverage and leverage condition how sensitive equity value is to rates and cycle.</p>
      </div>

      <div class="page">
        <h2>Cash Flow — Operating</h2>
        ${cfP.length ? `<table><thead><tr><th>Line</th>${cfP.map(p=>'<th>'+colYear(p)+'</th>').join('')}</tr></thead><tbody>
          ${rowMoney('Net Income', ['Net Income','Net Income From Continuing Operations'], cf, cfP)}
          ${rowMoney('Depreciation & Amortization', ['Depreciation And Amortization','Reconciled Depreciation'], cf, cfP)}
          ${rowMoney('Operating Cash Flow', ['Operating Cash Flow','Cash Flow From Continuing Operating Activities'], cf, cfP)}
        </tbody></table>
        <div class="insight"><strong>Insight — OCF.</strong> ${insightFromSeries('Operating cash flow', ['Operating Cash Flow','Cash Flow From Continuing Operating Activities'], cf, cfP)}</div>` : '<p class="muted">Cash flow unavailable.</p>'}
        <h2>Cash Flow — Investing</h2>
        ${cfP.length ? `<table><thead><tr><th>Line</th>${cfP.map(p=>'<th>'+colYear(p)+'</th>').join('')}</tr></thead><tbody>
          ${rowMoney('Capital Expenditure', ['Capital Expenditure'], cf, cfP)}
          ${rowMoney('Investing Cash Flow', ['Investing Cash Flow','Cash Flow From Continuing Investing Activities'], cf, cfP)}
        </tbody></table>
        <div class="insight"><strong>Insight — Investing.</strong> ${insightFromSeries('Capex', ['Capital Expenditure'], cf, cfP)}</div>` : ''}
      </div>

      <div class="page">
        <h2>Cash Flow — Financing & Free Cash Flow</h2>
        ${cfP.length ? `<table><thead><tr><th>Line</th>${cfP.map(p=>'<th>'+colYear(p)+'</th>').join('')}</tr></thead><tbody>
          ${rowMoney('Dividends Paid', ['Cash Dividends Paid','Common Stock Dividend Paid'], cf, cfP)}
          ${rowMoney('Financing Cash Flow', ['Financing Cash Flow','Cash Flow From Continuing Financing Activities'], cf, cfP)}
          ${rowMoney('Free Cash Flow', ['Free Cash Flow'], cf, cfP)}
        </tbody></table>
        <div class="insight"><strong>Insight — FCF.</strong> ${insightFromSeries('Free cash flow', ['Free Cash Flow'], cf, cfP)} Model base FCF ${money(model.fcf0)}; margin ~${(model.margin*100).toFixed(1)}% of sales.</div>` : ''}
        <h2>Cash Conversion Commentary</h2>
        <p>Quality of earnings is highest when OCF exceeds net income and FCF stays positive after growth and maintenance capex. Test distributions against trough FCF.</p>
      </div>

      <div class="page">
        <h2>Cash Flow Synthesis</h2>
        <ul>
          <li>Operating: watch working-capital swings that temporarily inflate or suppress OCF.</li>
          <li>Investing: separate growth versus maintenance capex.</li>
          <li>Financing: issuance versus retirement signals capital-structure intent.</li>
          <li>DCF uses FCF as the primary value driver; adjust for one-offs in live coverage.</li>
        </ul>
        <div class="callout">Model inputs — Revenue ${money(model.rev0)}, FCF ${money(model.fcf0)}, stage growth ${(model.g0*100).toFixed(1)}% → 2.5%.</div>
      </div>

      <div class="page">
        <h2>Statistics Desk</h2>
        <table>
          <thead><tr><th>Metric</th><th>Value</th><th>Insight</th></tr></thead>
          <tbody>
            <tr><td>Market Cap</td><td>${money(q.marketCap)}</td><td>Absolute equity scale and liquidity context.</td></tr>
            <tr><td>Enterprise Value</td><td>${money(q.enterpriseValue)}</td><td>Equity plus net debt claims.</td></tr>
            <tr><td>Trailing / Forward PE</td><td>${num(q.trailingPE)} / ${num(q.forwardPE)}</td><td>Forward below trailing often signals expected recovery.</td></tr>
            <tr><td>EV/EBITDA</td><td>${num(q.enterpriseToEbitda)}</td><td>Capital-structure-aware operating multiple.</td></tr>
            <tr><td>Profit Margin</td><td>${q.profitMargins!=null?pct(q.profitMargins):'—'}</td><td>Bottom-line share of sales.</td></tr>
            <tr><td>ROE / ROA</td><td>${q.returnOnEquity!=null?pct(q.returnOnEquity):'—'} / ${q.returnOnAssets!=null?pct(q.returnOnAssets):'—'}</td><td>Capital efficiency.</td></tr>
            <tr><td>Revenue / EPS Growth</td><td>${q.revenueGrowth!=null?pct(q.revenueGrowth):'—'} / ${q.earningsGrowth!=null?pct(q.earningsGrowth):'—'}</td><td>Top-line versus earnings leverage.</td></tr>
            <tr><td>Beta</td><td>${num(q.beta)}</td><td>Systematic market risk.</td></tr>
            <tr><td>52-Week Range</td><td>${num(q.fiftyTwoWeekLow)} – ${num(q.fiftyTwoWeekHigh)}</td><td>Recent trading band.</td></tr>
            <tr><td>Avg Volume</td><td>${num(q.averageVolume,0)}</td><td>Liquidity for sizing.</td></tr>
            <tr><td>Shares Out</td><td>${num(q.sharesOutstanding,0)}</td><td>Bridge to per-share value.</td></tr>
            <tr><td>Book / Share</td><td>${num(q.bookValue)}</td><td>Accounting residual equity.</td></tr>
          </tbody>
        </table>
      </div>

      <div class="page">
        <h2>Ratio Analysis</h2>
        <table>
          <thead><tr><th>Ratio</th><th>Latest</th><th>Description</th></tr></thead>
          <tbody>
            <tr><td>PE (TTM)</td><td>${num(q.trailingPE)}x</td><td>Price versus trailing earnings.</td></tr>
            <tr><td>PE (Forward)</td><td>${num(q.forwardPE)}x</td><td>Price versus expected earnings.</td></tr>
            <tr><td>PS (TTM)</td><td>${num(q.priceToSalesTrailing12Months)}x</td><td>Price versus sales.</td></tr>
            <tr><td>PB</td><td>${num(q.priceToBook)}x</td><td>Price versus book equity.</td></tr>
            <tr><td>EV/Sales</td><td>${num(q.enterpriseToRevenue)}x</td><td>Firm value versus sales.</td></tr>
            <tr><td>EV/EBITDA</td><td>${num(q.enterpriseToEbitda)}x</td><td>Firm value versus EBITDA.</td></tr>
            <tr><td>Debt/Equity</td><td>${num(q.debtToEquity)}</td><td>Book leverage.</td></tr>
            <tr><td>Current Ratio</td><td>${num(q.currentRatio)}</td><td>Near-term coverage.</td></tr>
            <tr><td>ROE</td><td>${q.returnOnEquity!=null?pct(q.returnOnEquity):'—'}</td><td>Earnings on equity.</td></tr>
            <tr><td>Dividend Yield</td><td>${q.dividendYield!=null?pct(q.dividendYield):'—'}</td><td>Income at current price.</td></tr>
          </tbody>
        </table>
        <div class="insight"><strong>Analysis.</strong> Read multiples with growth and ROE. Premium PE needs durable growth and high ROE; discount PE can still be expensive if earnings are cyclically peak.</div>
        <h3>Forecast anchor</h3>
        <table><thead><tr><th>Year</th><th>Growth</th><th>Revenue</th><th>FCF</th><th>PV</th></tr></thead>
        <tbody>${model.rows.map(r => '<tr><td>Y+'+r.t+'</td><td>'+(r.g*100).toFixed(1)+'%</td><td>'+money(r.rev)+'</td><td>'+money(r.fcf)+'</td><td>'+money(r.disc)+'</td></tr>').join('')}</tbody></table>
      </div>

      <div class="page">
        <h2>Valuation — Assumptions</h2>
        <ul>
          <li><strong>Discount rate 8.35%:</strong> Damodaran median US firm cost of capital context — primary DCF rate.</li>
          <li><strong>ERP ~4.33%:</strong> Implied equity risk premium reference (informational).</li>
          <li><strong>Terminal growth 2.5%:</strong> Long-run nominal growth cap.</li>
          <li><strong>Horizon ${model.YEARS} years:</strong> Growth fades from ~${(model.g0*100).toFixed(1)}% to terminal g.</li>
          <li><strong>FCF margin ~${(model.margin*100).toFixed(1)}%:</strong> Near trailing FCF/sales.</li>
        </ul>
        <h3>Illustrative discount build-up</h3>
        <table><thead><tr><th>Risk Element</th><th>Value</th><th>Rationale</th></tr></thead>
        <tbody>${buildUp.map(r => '<tr><td>'+r[0]+'</td><td>'+r[1]+'</td><td>'+r[2]+'</td></tr>').join('')}</tbody></table>
        <p class="muted">Build-up is shown for transparency; headline TP uses the 8.35% Damodaran case.</p>
      </div>

      <div class="page">
        <h2>Valuation — Explicit Forecast</h2>
        <table><thead><tr><th>Year</th><th>Growth</th><th>Revenue</th><th>FCF</th><th>DF</th><th>PV</th></tr></thead>
        <tbody>${model.rows.map(r => '<tr><td>Y+'+r.t+'</td><td>'+(r.g*100).toFixed(2)+'%</td><td>'+money(r.rev)+'</td><td>'+money(r.fcf)+'</td><td>'+(1/Math.pow(1+model.DISCOUNT,r.t)).toFixed(3)+'</td><td>'+money(r.disc)+'</td></tr>').join('')}</tbody></table>
        <div class="insight">Staged growth from ${(model.g0*100).toFixed(1)}% to 2.5%; FCF = revenue × trailing margin.</div>
      </div>

      <div class="page">
        <h2>Valuation — Terminal Value & Equity Bridge</h2>
        <table><thead><tr><th>Component</th><th>Value</th></tr></thead>
        <tbody>
          <tr><td>Sum PV explicit FCF</td><td>${money(model.pv - (model.pvTv||0))}</td></tr>
          <tr><td>Terminal value</td><td>${money(model.tv)}</td></tr>
          <tr><td>PV of terminal</td><td>${money(model.pvTv)}</td></tr>
          <tr><td>Enterprise PV</td><td>${money(model.pv)}</td></tr>
          <tr><td>Equity value</td><td>${money(model.equity)}</td></tr>
          <tr><td>Shares</td><td>${num(model.shares,0)}</td></tr>
          <tr><td><strong>Intrinsic / share</strong></td><td><strong>${px(model.vps)}</strong></td></tr>
          <tr><td>Market price</td><td>${px(model.price)}</td></tr>
          <tr><td>Upside / (downside)</td><td>${model.upside==null?'—':(model.upside>=0?'+':'')+model.upside.toFixed(1)+'%'}</td></tr>
        </tbody></table>
        <p>TV = FCF_n×(1+g)/(r−g); r=8.35%, g=2.5%. Net debt bridges enterprise to equity.</p>
      </div>

      <div class="page">
        <h2>Valuation — Graphical Interpretation</h2>
        <p>In the FinSight Valuation → Visualization tab, charts show revenue trajectory, profit stack, EBITDA vs net cash flow, and cash uses. They use the same staged-growth engine as the tables above.</p>
        <ul>
          <li><strong>Revenue:</strong> compounds at fading growth; steeper near-term growth lifts terminal sales but is discounted harder if r rises.</li>
          <li><strong>Profit stack:</strong> gross → operating → net shows margin leakage.</li>
          <li><strong>EBITDA vs NCF:</strong> gap approximates reinvestment and distributions.</li>
          <li><strong>Cash uses:</strong> capex and WC bridge EBITDA to free cash flow.</li>
        </ul>
        <div class="callout">Re-run Valuation after each earnings print to refresh base FCF, margins and growth fade.</div>
      </div>

      <div class="page">
        <h2>Key Management</h2>
        <p>Leadership and capital-allocation track record are qualitative overlays on the quantitative model.</p>
        ${officerHtml}
        <p class="muted">Cross-check Form 10-K/20-F and DEF 14A (or local equivalent) for official biographies and ownership.</p>
      </div>

      <div class="page">
        <h2>Final Recommendation</h2>
        <p>We assign <span class="badge ${rating.cls}">${rating.key}</span> on <strong>${company} (${sym})</strong> with model target <strong>${px(target)}</strong> versus market <strong>${px(price)}</strong>.</p>
        <h3>Supporting points</h3>
        <ul>
          <li>Intrinsic ${px(target)} implies ${model.upside==null?'n/a':(model.upside>=0?'+':'')+(model.upside!=null?model.upside.toFixed(1)+'%':'')} versus market at r=${(model.DISCOUNT*100).toFixed(2)}%, g=${(model.TG*100).toFixed(1)}%.</li>
          <li>Enterprise PV ${money(model.pv)}; equity ${money(model.equity)} on ${num(model.shares,0)} shares.</li>
          <li>Net margin ${q.profitMargins!=null?pct(q.profitMargins):'—'}; ROE ${q.returnOnEquity!=null?pct(q.returnOnEquity):'—'}.</li>
          <li>Revenue growth ${q.revenueGrowth!=null?pct(q.revenueGrowth):'—'} feeds stage-entry growth ${(model.g0*100).toFixed(1)}%.</li>
          <li>Market PE ${num(q.trailingPE)}x and EV/EBITDA ${num(q.enterpriseToEbitda)}x should be reconciled to the DCF gap.</li>
        </ul>
        <h3>Risks</h3>
        <ul>
          <li>Forecast risk on FCF margin and growth fade.</li>
          <li>Rate risk compressing terminal value.</li>
          <li>Competitive, regulatory and execution risk in ${industry}.</li>
          <li>Data risk from automated feeds; not an audit.</li>
        </ul>
        <p><strong>Bottom line:</strong> ${rating.key} maps desk thresholds (~+15% BUY, ~−10% SELL, else HOLD) to the DCF output. Respect liquidity (avg volume ${num(q.averageVolume,0)}) when sizing.</p>
      </div>
    `;

    openReport(shell('Equity Research Report — ' + sym, company, body));
  };

  R.valuation = async function (sym) {
    const d = await gather(sym);
    const q = d.quote || {};
    const fin = d.financials || {};
    const model = dcfModel(q, fin);
    const company = q.longName || q.shortName || d.uni.CompanyName || sym;
    const sector = q.sector || d.uni.Sector || '—';
    const industry = q.industry || d.uni.Industry || '—';
    const price = model.price;
    const country = q.country || d.uni.Country || '—';

    // Longer history for 90-day tables
    let hist = Array.isArray(d.history) ? d.history.slice() : [];
    if (hist.length < 100) {
      try {
        const h2 = await global.LiveAPI.history(sym, '6mo', '1d');
        if (Array.isArray(h2) && h2.length > hist.length) hist = h2;
      } catch (_) {}
    }
    const histRows = hist.map(r => {
      const date = String(r.Date || r.Datetime || '').slice(0, 10);
      const open = Number(r.Open);
      const high = Number(r.High);
      const low = Number(r.Low);
      const close = Number(r.Close);
      const adj = Number(r['Adj Close'] != null ? r['Adj Close'] : r.AdjClose != null ? r.AdjClose : close);
      const volume = Number(r.Volume);
      return {
        date,
        open: isNaN(open) ? null : open,
        high: isNaN(high) ? null : high,
        low: isNaN(low) ? null : low,
        close: isNaN(close) ? null : close,
        adj: isNaN(adj) ? null : adj,
        volume: isNaN(volume) ? null : volume,
      };
    }).filter(r => r.date && r.close != null).sort((a, b) => a.date.localeCompare(b.date));
    for (let i = 0; i < histRows.length; i++) {
      if (i === 0 || histRows[i - 1].close == null) histRows[i].change = null;
      else histRows[i].change = histRows[i].close - histRows[i - 1].close;
    }
    const last90 = histRows.slice(-90);
    const last10 = histRows.slice(-10);
    const lastYear = histRows.slice(-252);

    function fmtPx(v) {
      if (v == null || isNaN(v)) return '—';
      return Number(v).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    }
    function fmtChg(v) {
      if (v == null || isNaN(v)) return '—';
      const s = (v > 0 ? '+' : '') + Number(v).toFixed(2);
      return s;
    }
    function fmtVol(v) {
      if (v == null || isNaN(v)) return '—';
      if (v >= 1e9) return (v / 1e9).toFixed(2) + 'B';
      if (v >= 1e6) return (v / 1e6).toFixed(2) + 'M';
      if (v >= 1e3) return (v / 1e3).toFixed(1) + 'K';
      return String(Math.round(v));
    }
    function clsChg(v) {
      if (v == null || isNaN(v)) return '';
      return v > 0 ? 'color:#059669;font-weight:600' : v < 0 ? 'color:#dc2626;font-weight:600' : '';
    }

    // SVG sparkline for 1y price
    function priceSparkSvg(rows) {
      const pts = rows.filter(r => r.close != null);
      if (pts.length < 2) return '<p class="muted">Insufficient price history to render chart.</p>';
      const w = 720, h = 200, pad = 16;
      const xs = pts.map((_, i) => i);
      const ys = pts.map(r => r.close);
      const minY = Math.min(...ys), maxY = Math.max(...ys);
      const xScale = (i) => pad + (i / (pts.length - 1)) * (w - 2 * pad);
      const yScale = (v) => h - pad - ((v - minY) / (maxY - minY || 1)) * (h - 2 * pad);
      const path = pts.map((r, i) => (i === 0 ? 'M' : 'L') + xScale(i).toFixed(1) + ',' + yScale(r.close).toFixed(1)).join(' ');
      const area = path + ' L' + xScale(pts.length - 1).toFixed(1) + ',' + (h - pad) + ' L' + pad + ',' + (h - pad) + ' Z';
      const first = pts[0].close, last = pts[pts.length - 1].close;
      const up = last >= first;
      const stroke = up ? '#059669' : '#dc2626';
      const fill = up ? 'rgba(5,150,105,0.12)' : 'rgba(220,38,38,0.12)';
      return `<svg viewBox="0 0 ${w} ${h}" width="100%" height="200" style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;">
        <path d="${area}" fill="${fill}"/>
        <path d="${path}" fill="none" stroke="${stroke}" stroke-width="2"/>
        <text x="${pad}" y="14" font-size="11" fill="#64748b" font-family="Inter,system-ui,sans-serif">${pts[0].date}</text>
        <text x="${w - pad}" y="14" font-size="11" fill="#64748b" text-anchor="end" font-family="Inter,system-ui,sans-serif">${pts[pts.length-1].date}</text>
        <text x="${pad}" y="${h - 4}" font-size="10" fill="#64748b" font-family="Inter,system-ui,sans-serif">Low ${fmtPx(minY)}</text>
        <text x="${w - pad}" y="${h - 4}" font-size="10" fill="#64748b" text-anchor="end" font-family="Inter,system-ui,sans-serif">High ${fmtPx(maxY)}</text>
      </svg>`;
    }

    // Company description points
    const summary = (q.longBusinessSummary || '').trim();
    let descPoints = [];
    if (summary.length > 40) {
      const sentences = summary.replace(/\s+/g, ' ').split(/(?<=\.)\s+/).filter(Boolean);
      descPoints = sentences.slice(0, 10);
    }
    if (descPoints.length < 4) {
      descPoints = [
        company + ' (' + sym + ') is a publicly traded company classified in the ' + industry + ' industry within the ' + sector + ' sector.',
        'The equity is covered in this report under a going-concern premise using publicly available market quotes and financial statement data.',
        'Primary value drivers typically include revenue durability, margin structure, free-cash-flow conversion and capital intensity.',
        'Investors also monitor leverage, liquidity, competitive positioning and capital-return policy when assessing fair value.',
        'This assignment synthesizes asset-, market- and income-based indications into a weighted conclusion of equity value.',
        'All figures are illustrative and should be reconciled to the issuer’s latest audited filings before any investment decision.'
      ];
    }

    const officers = (q.companyOfficers || []).slice(0, 8);
    const officerHtml = officers.length
      ? '<table><thead><tr><th>Name</th><th>Title</th><th>Age</th></tr></thead><tbody>' +
        officers.map(o => '<tr><td>' + (o.name || '—') + '</td><td>' + (o.title || '—') + '</td><td>' + (o.age != null ? o.age : '—') + '</td></tr>').join('') +
        '</tbody></table>'
      : '<p class="muted">Named officers were not returned by the live feed. Refer to the latest annual report / proxy for the official roster of key personnel.</p>';

    const finPerf = [
      'Market capitalization stands at ' + money(q.marketCap) + ' with enterprise value of ' + money(q.enterpriseValue) + ', framing absolute scale for the equity and the firm.',
      'Trailing profitability: gross margin ' + (q.grossMargins != null ? pct(q.grossMargins) : '—') + ', operating margin ' + (q.operatingMargins != null ? pct(q.operatingMargins) : '—') + ', net margin ' + (q.profitMargins != null ? pct(q.profitMargins) : '—') + '.',
      'Return metrics: ROE ' + (q.returnOnEquity != null ? pct(q.returnOnEquity) : '—') + ' and ROA ' + (q.returnOnAssets != null ? pct(q.returnOnAssets) : '—') + ' summarize earnings power on equity and assets.',
      'Growth pulse: revenue growth ' + (q.revenueGrowth != null ? pct(q.revenueGrowth) : '—') + ' and earnings growth ' + (q.earningsGrowth != null ? pct(q.earningsGrowth) : '—') + ' on a trailing basis.',
      'Cash and leverage: total cash ' + money(q.totalCash != null ? q.totalCash : q.cash) + ', total debt ' + money(q.totalDebt) + ', debt-to-equity ' + num(q.debtToEquity) + ', current ratio ' + num(q.currentRatio) + '.',
      'Income / capital return: dividend yield ' + (q.dividendYield != null ? pct(q.dividendYield) : '—') + '; trailing EPS ' + num(q.trailingEps) + '; free-cash-flow base in the model ' + money(model.fcf0) + '.'
    ];

    // Price performance insights
    let yRet = null, yHigh = null, yLow = null, yVolAvg = null;
    if (lastYear.length >= 2) {
      const f = lastYear[0].close, l = lastYear[lastYear.length - 1].close;
      yRet = f ? ((l / f) - 1) * 100 : null;
      yHigh = Math.max(...lastYear.map(r => r.high != null ? r.high : r.close));
      yLow = Math.min(...lastYear.map(r => r.low != null ? r.low : r.close));
      const vols = lastYear.map(r => r.volume).filter(v => v != null);
      yVolAvg = vols.length ? vols.reduce((a, b) => a + b, 0) / vols.length : null;
    }
    const priceInsights = [
      'One-year total price change is approximately ' + (yRet == null ? 'n/a' : ((yRet >= 0 ? '+' : '') + yRet.toFixed(1) + '%')) + ' from the first to the last close in the plotted window.',
      'The observed range spans roughly ' + fmtPx(yLow) + ' (low) to ' + fmtPx(yHigh) + ' (high); the latest close is ' + fmtPx(price) + '.',
      'Average daily volume over the window is about ' + fmtVol(yVolAvg) + ', which informs liquidity for institutional position sizing.',
      (yRet != null && yRet > 15)
        ? 'Strong positive momentum over the year raises the bar for further multiple expansion and places more weight on earnings delivery in the DCF.'
        : (yRet != null && yRet < -15)
          ? 'Material drawdown over the year may embed a discount that the income approach can either justify or challenge depending on FCF recovery.'
          : 'Price action has been relatively moderate versus extremes; valuation conclusions will lean more on fundamentals than on pure momentum.'
    ];

    // Approaches
    const ni = q.netIncomeToCommon != null ? q.netIncomeToCommon : q.netIncome;
    const ebitda = q.ebitda;
    const rev = q.totalRevenue != null ? q.totalRevenue : model.rev0;
    const mcap = q.marketCap;
    const netDebt = (q.totalDebt || 0) - (q.totalCash || q.cash || 0);
    const peVal = (q.trailingPE && ni) ? q.trailingPE * ni : null;
    const evEbitdaEquity = (q.enterpriseToEbitda && ebitda) ? (q.enterpriseToEbitda * ebitda) - netDebt : null;
    const psEquity = (q.priceToSalesTrailing12Months && rev) ? q.priceToSalesTrailing12Months * rev : mcap;
    const book = (q.bookValue && q.sharesOutstanding) ? q.bookValue * q.sharesOutstanding : null;
    const tangibleBook = (q.bookValue && q.sharesOutstanding)
      ? (q.bookValue * q.sharesOutstanding) * 0.9
      : book;

    // Asset approach table
    const assetRows = [
      { item: 'Total assets (quote / implied)', value: q.totalAssets != null ? q.totalAssets : (book != null && q.totalDebt != null ? book + (q.totalDebt || 0) : null) },
      { item: 'Less: total liabilities (approx.)', value: q.totalDebt != null ? -(q.totalDebt) : null },
      { item: 'Book value of equity', value: book },
      { item: 'Tangible book proxy (illustrative 10% intangible haircut)', value: tangibleBook },
      { item: 'Asset-based indication (equity)', value: book },
    ];
    // Market approach
    const marketRows = [
      { item: 'Trailing PE × Net Income', value: peVal },
      { item: 'EV/EBITDA × EBITDA − Net Debt', value: evEbitdaEquity },
      { item: 'Price/Sales × Revenue (equity proxy)', value: psEquity },
      { item: 'Observed market capitalization', value: mcap },
    ];
    const marketVals = marketRows.map(r => r.value).filter(v => v != null && !isNaN(v));
    const marketAvg = marketVals.length ? marketVals.reduce((a, b) => a + b, 0) / marketVals.length : null;

    // Income approach = DCF equity
    const incomeRows = [
      { item: 'Sum of PV of explicit FCF', value: model.pv - (model.pvTv || 0) },
      { item: 'PV of terminal value', value: model.pvTv },
      { item: 'Enterprise value (total PV)', value: model.pv },
      { item: 'Less: net debt', value: -netDebt },
      { item: 'Income-based equity value (DCF)', value: model.equity },
      { item: 'Income-based value / share', value: model.vps, isPx: true },
    ];

    const methods = [
      { name: 'Income approach (DCF)', value: model.equity, weight: 0.45 },
      { name: 'Market approach (average of PE / EV/EBITDA / PS indications)', value: marketAvg, weight: 0.35 },
      { name: 'Asset approach (book equity)', value: book, weight: 0.20 },
    ];
    let wSum = 0, vSum = 0;
    methods.forEach(m => {
      if (m.value != null && !isNaN(m.value)) { wSum += m.weight; vSum += m.value * m.weight; }
    });
    const indicated = wSum ? vSum / wSum : null;
    const indicatedPS = indicated && model.shares ? indicated / model.shares : null;

    function histTable(rows) {
      return `<table>
        <thead><tr>
          <th>Date</th><th>Open</th><th>High</th><th>Low</th><th>Close</th><th>Adj. Close</th><th>Change</th><th>Volume</th>
        </tr></thead>
        <tbody>
          ${rows.map(r => `<tr>
            <td>${r.date}</td>
            <td>${fmtPx(r.open)}</td>
            <td>${fmtPx(r.high)}</td>
            <td>${fmtPx(r.low)}</td>
            <td>${fmtPx(r.close)}</td>
            <td>${fmtPx(r.adj)}</td>
            <td style="${clsChg(r.change)}">${fmtChg(r.change)}</td>
            <td>${fmtVol(r.volume)}</td>
          </tr>`).join('')}
        </tbody>
      </table>`;
    }
    function histInsights(rows, label) {
      if (!rows.length) return '<p class="muted">No rows available for ' + label + '.</p>';
      const closes = rows.map(r => r.close).filter(v => v != null);
      const vols = rows.map(r => r.volume).filter(v => v != null);
      const chgs = rows.map(r => r.change).filter(v => v != null);
      const first = closes[0], last = closes[closes.length - 1];
      const ret = first ? ((last / first) - 1) * 100 : null;
      const upDays = chgs.filter(c => c > 0).length;
      const downDays = chgs.filter(c => c < 0).length;
      const avgVol = vols.length ? vols.reduce((a, b) => a + b, 0) / vols.length : null;
      const maxC = Math.max(...closes), minC = Math.min(...closes);
      return `<table>
        <thead><tr><th>Insight metric</th><th>Value</th><th>Interpretation</th></tr></thead>
        <tbody>
          <tr><td>Period return</td><td>${ret==null?'—':((ret>=0?'+':'')+ret.toFixed(2)+'%')}</td><td>Close-to-close move across the ${label} window.</td></tr>
          <tr><td>High / Low close</td><td>${fmtPx(maxC)} / ${fmtPx(minC)}</td><td>Range of daily closes in the sample.</td></tr>
          <tr><td>Up / Down sessions</td><td>${upDays} / ${downDays}</td><td>Breadth of positive versus negative daily changes.</td></tr>
          <tr><td>Average volume</td><td>${fmtVol(avgVol)}</td><td>Typical daily turnover over the window.</td></tr>
          <tr><td>Latest close</td><td>${fmtPx(last)}</td><td>Most recent session in the extracted sample.</td></tr>
        </tbody>
      </table>`;
    }

    // Split 90 days across two pages (~45 each)
    const mid = Math.ceil(last90.length / 2);
    const last90a = last90.slice(0, mid);
    const last90b = last90.slice(mid);

    const body = `
      <!-- PAGE 1: Background -->
      <div class="page">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:12px;">
          <div>
            <div style="font-size:18px;font-weight:700;font-family:Inter,system-ui,sans-serif;">${company} (${sym})</div>
            <div class="muted">${sector} · ${industry} · ${country}</div>
          </div>
          <div style="text-align:right;font-family:Inter,system-ui,sans-serif;font-size:12px;">
            <div><strong>Effective date:</strong> ${today()}</div>
            <div class="muted">Going concern · Fair market value (illustrative)</div>
          </div>
        </div>

        <div class="section-title">Company Background</div>
        <ul>
          ${descPoints.map(p => '<li>' + p + '</li>').join('')}
        </ul>

        <div class="section-title">Key Personnel</div>
        ${officerHtml}

        <div class="section-title">Financial Performance Highlights</div>
        <ul>
          ${finPerf.map(p => '<li>' + p + '</li>').join('')}
        </ul>
      </div>

      <!-- PAGE 2: Snapshot + 1y chart -->
      <div class="page">
        <h2>Company Snapshot</h2>
        <table>
          <thead><tr><th>Field</th><th>Detail</th></tr></thead>
          <tbody>
            <tr><td>Ticker</td><td>${sym}</td></tr>
            <tr><td>Company</td><td>${company}</td></tr>
            <tr><td>Sector</td><td>${sector}</td></tr>
            <tr><td>Industry</td><td>${industry}</td></tr>
            <tr><td>Country / Exchange</td><td>${country} · ${q.exchange || q.fullExchangeName || '—'}</td></tr>
            <tr><td>Currency</td><td>${q.currency || 'USD'}</td></tr>
            <tr><td>Last Price</td><td>${px(price)}</td></tr>
            <tr><td>Market Capitalization</td><td>${money(q.marketCap)}</td></tr>
            <tr><td>Enterprise Value</td><td>${money(q.enterpriseValue)}</td></tr>
            <tr><td>Shares Outstanding</td><td>${num(q.sharesOutstanding, 0)}</td></tr>
            <tr><td>Float Shares</td><td>${num(q.floatShares, 0)}</td></tr>
            <tr><td>Trailing PE</td><td>${num(q.trailingPE)}</td></tr>
            <tr><td>Forward PE</td><td>${num(q.forwardPE)}</td></tr>
            <tr><td>Price / Book</td><td>${num(q.priceToBook)}</td></tr>
            <tr><td>EV / EBITDA</td><td>${num(q.enterpriseToEbitda)}</td></tr>
            <tr><td>Dividend Yield</td><td>${q.dividendYield != null ? pct(q.dividendYield) : '—'}</td></tr>
            <tr><td>Beta</td><td>${num(q.beta)}</td></tr>
            <tr><td>52-Week Range</td><td>${num(q.fiftyTwoWeekLow)} – ${num(q.fiftyTwoWeekHigh)}</td></tr>
            <tr><td>Employees</td><td>${num(q.fullTimeEmployees, 0)}</td></tr>
          </tbody>
        </table>

        <h2>Stock Price — Last One Year</h2>
        ${priceSparkSvg(lastYear.length ? lastYear : histRows)}
        <div class="section-title" style="margin-top:12px;">Chart Insights</div>
        <ul>
          ${priceInsights.map(p => '<li>' + p + '</li>').join('')}
        </ul>
      </div>

      <!-- PAGE 3: Assumptions -->
      <div class="page">
        <h2>Valuation Assumptions</h2>
        <p>The income approach (discounted free cash flow) is parameterized as follows. Each assumption is stated with its value, definition and rationale so the user can audit sensitivity.</p>
        <table>
          <thead><tr><th>Parameter</th><th>Value</th><th>Explanation &amp; Reason</th></tr></thead>
          <tbody>
            <tr>
              <td>Discount rate (r)</td>
              <td>${(model.DISCOUNT * 100).toFixed(2)}%</td>
              <td>Cost of capital applied to projected free cash flows. Anchored to Aswath Damodaran’s published median US firm cost of capital context (~8.35%). A higher r reduces present values, especially terminal value.</td>
            </tr>
            <tr>
              <td>Terminal / stable growth (g)</td>
              <td>${(model.TG * 100).toFixed(2)}%</td>
              <td>Perpetual growth after the explicit horizon. Capped near long-run nominal growth so that stable growth does not exceed economy-wide risk-free / nominal territory (Damodaran guidance).</td>
            </tr>
            <tr>
              <td>Explicit forecast horizon</td>
              <td>${model.YEARS} years</td>
              <td>Number of discrete annual periods before terminal value. Balances visibility into near-term fundamentals against uncertainty in distant cash flows.</td>
            </tr>
            <tr>
              <td>Stage-entry revenue growth</td>
              <td>${(model.g0 * 100).toFixed(2)}%</td>
              <td>Starting growth rate inferred from trailing annual revenue change (capped between −5% and +25%). Fades linearly toward terminal g over the horizon.</td>
            </tr>
            <tr>
              <td>Free cash flow margin</td>
              <td>${(model.margin * 100).toFixed(2)}% of sales</td>
              <td>Trailing FCF divided by trailing revenue when both are available; otherwise a conservative 8% fallback. Held constant in the base case so value is driven by growth and discounting.</td>
            </tr>
            <tr>
              <td>Revenue base (year 0)</td>
              <td>${money(model.rev0)}</td>
              <td>Latest annual total revenue from the income statement feed — the compound base for forward sales.</td>
            </tr>
            <tr>
              <td>FCF base (year 0)</td>
              <td>${money(model.fcf0)}</td>
              <td>Latest free cash flow, or Operating Cash Flow adjusted for capital expenditure when FCF is not reported directly.</td>
            </tr>
            <tr>
              <td>Net debt</td>
              <td>${money(netDebt)}</td>
              <td>Interest-bearing debt minus cash. Subtracted from enterprise present value to reach equity value.</td>
            </tr>
            <tr>
              <td>Shares outstanding</td>
              <td>${num(model.shares, 0)}</td>
              <td>Diluted / reported share count used to convert equity value into value per share.</td>
            </tr>
            <tr>
              <td>Risk-free rate (build-up context)</td>
              <td>3.00%</td>
              <td>US Treasury proxy used in the illustrative equity discount build-up schedule (scenario table, not the primary DCF rate).</td>
            </tr>
            <tr>
              <td>Equity risk premium (context)</td>
              <td>4.33% – 6.10%</td>
              <td>Damodaran implied ERP context and sample build-up premium for public equity risk.</td>
            </tr>
            <tr>
              <td>Size / industry / company premia (scenario)</td>
              <td>9.85% / 1.02% / 2.50%</td>
              <td>Illustrative premia from sample appraisal structure; useful for sensitivity when valuing smaller or more idiosyncratic names.</td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- PAGE 4: Forecast tables -->
      <div class="page">
        <h2>Forecast Outputs from Assumptions</h2>
        <h3>Explicit free cash flow forecast</h3>
        <table>
          <thead>
            <tr><th>Year</th><th>Growth</th><th>Revenue</th><th>FCF</th><th>Discount factor</th><th>PV of FCF</th></tr>
          </thead>
          <tbody>
            ${model.rows.map(r => `<tr>
              <td>Y+${r.t}</td>
              <td>${(r.g * 100).toFixed(2)}%</td>
              <td>${money(r.rev)}</td>
              <td>${money(r.fcf)}</td>
              <td>${(1 / Math.pow(1 + model.DISCOUNT, r.t)).toFixed(4)}</td>
              <td>${money(r.disc)}</td>
            </tr>`).join('')}
          </tbody>
        </table>
        <div class="insight">Growth fades from ${(model.g0 * 100).toFixed(1)}% toward ${(model.TG * 100).toFixed(1)}%. Each year’s FCF is discounted at ${(model.DISCOUNT * 100).toFixed(2)}%.</div>

        <h3>Terminal value &amp; equity bridge</h3>
        <table>
          <thead><tr><th>Component</th><th>Value</th></tr></thead>
          <tbody>
            <tr><td>Sum of PV of explicit FCF</td><td>${money(model.pv - (model.pvTv || 0))}</td></tr>
            <tr><td>Terminal value TV = FCF<sub>n</sub>×(1+g)/(r−g)</td><td>${money(model.tv)}</td></tr>
            <tr><td>PV of terminal value</td><td>${money(model.pvTv)}</td></tr>
            <tr><td>Enterprise value (total PV)</td><td>${money(model.pv)}</td></tr>
            <tr><td>Less: net debt</td><td>${money(netDebt)}</td></tr>
            <tr><td><strong>Equity value</strong></td><td><strong>${money(model.equity)}</strong></td></tr>
            <tr><td>Shares</td><td>${num(model.shares, 0)}</td></tr>
            <tr><td><strong>Value per share</strong></td><td><strong>${px(model.vps)}</strong></td></tr>
            <tr><td>Market price</td><td>${px(price)}</td></tr>
            <tr><td>Implied premium / (discount)</td><td>${model.upside == null ? '—' : ((model.upside >= 0 ? '+' : '') + model.upside.toFixed(1) + '%')}</td></tr>
          </tbody>
        </table>
      </div>

      <!-- PAGE 5: Graphical / comparative presentation -->
      <div class="page">
        <h2>Forecast Visualization (tabular)</h2>
        <h3>Revenue path</h3>
        <table>
          <thead><tr><th>Year</th>${model.rows.map(r => '<th>Y+' + r.t + '</th>').join('')}</tr></thead>
          <tbody>
            <tr><td>Revenue</td>${model.rows.map(r => '<td>' + money(r.rev) + '</td>').join('')}</tr>
            <tr><td>YoY growth</td>${model.rows.map(r => '<td>' + (r.g * 100).toFixed(1) + '%</td>').join('')}</tr>
          </tbody>
        </table>
        <h3>Free cash flow path</h3>
        <table>
          <thead><tr><th>Year</th>${model.rows.map(r => '<th>Y+' + r.t + '</th>').join('')}</tr></thead>
          <tbody>
            <tr><td>FCF</td>${model.rows.map(r => '<td>' + money(r.fcf) + '</td>').join('')}</tr>
            <tr><td>PV(FCF)</td>${model.rows.map(r => '<td>' + money(r.disc) + '</td>').join('')}</tr>
          </tbody>
        </table>
        <div class="insight">
          <strong>Reading the paths.</strong> Rising revenue with stable FCF margins increases terminal value, but cash flows further out are discounted more heavily.
          A large share of enterprise value in PV(terminal) is normal for growing firms and heightens sensitivity to r and g.
        </div>
        <h3>Value composition</h3>
        <table>
          <thead><tr><th>Bucket</th><th>Amount</th><th>Share of enterprise PV</th></tr></thead>
          <tbody>
            <tr>
              <td>Explicit period PV</td>
              <td>${money(model.pv - (model.pvTv || 0))}</td>
              <td>${model.pv ? (((model.pv - (model.pvTv || 0)) / model.pv) * 100).toFixed(1) + '%' : '—'}</td>
            </tr>
            <tr>
              <td>Terminal PV</td>
              <td>${money(model.pvTv)}</td>
              <td>${model.pv && model.pvTv != null ? ((model.pvTv / model.pv) * 100).toFixed(1) + '%' : '—'}</td>
            </tr>
            <tr><td>Enterprise PV</td><td>${money(model.pv)}</td><td>100%</td></tr>
          </tbody>
        </table>
      </div>

      <!-- PAGE 6: Financial inputs -->
      <div class="page">
        <h2>Financial Inputs Data Table</h2>
        <p class="muted">Sources: live quote feed and annual financial statement extracts used throughout FinSight Stock Listing (Financials / Statistics).</p>
        <table>
          <thead><tr><th>Input</th><th>Value</th><th>Source / notes</th></tr></thead>
          <tbody>
            <tr><td>Last price</td><td>${px(price)}</td><td>Live quote (current or previous close)</td></tr>
            <tr><td>Market capitalization</td><td>${money(q.marketCap)}</td><td>Live quote</td></tr>
            <tr><td>Enterprise value</td><td>${money(q.enterpriseValue)}</td><td>Live quote</td></tr>
            <tr><td>Total revenue (TTM / latest)</td><td>${money(rev)}</td><td>Quote TTM or income statement</td></tr>
            <tr><td>Gross profit</td><td>${money(q.grossProfits)}</td><td>Live quote</td></tr>
            <tr><td>EBITDA</td><td>${money(ebitda)}</td><td>Live quote</td></tr>
            <tr><td>Net income to common</td><td>${money(ni)}</td><td>Live quote / income statement</td></tr>
            <tr><td>Trailing EPS</td><td>${num(q.trailingEps)}</td><td>Live quote</td></tr>
            <tr><td>Trailing PE</td><td>${num(q.trailingPE)}</td><td>Live quote</td></tr>
            <tr><td>Forward PE</td><td>${num(q.forwardPE)}</td><td>Live quote</td></tr>
            <tr><td>Price / Book</td><td>${num(q.priceToBook)}</td><td>Live quote</td></tr>
            <tr><td>Price / Sales</td><td>${num(q.priceToSalesTrailing12Months)}</td><td>Live quote</td></tr>
            <tr><td>EV / Revenue</td><td>${num(q.enterpriseToRevenue)}</td><td>Live quote</td></tr>
            <tr><td>EV / EBITDA</td><td>${num(q.enterpriseToEbitda)}</td><td>Live quote</td></tr>
            <tr><td>Gross margin</td><td>${q.grossMargins != null ? pct(q.grossMargins) : '—'}</td><td>Live quote</td></tr>
            <tr><td>Operating margin</td><td>${q.operatingMargins != null ? pct(q.operatingMargins) : '—'}</td><td>Live quote</td></tr>
            <tr><td>Profit margin</td><td>${q.profitMargins != null ? pct(q.profitMargins) : '—'}</td><td>Live quote</td></tr>
            <tr><td>ROE</td><td>${q.returnOnEquity != null ? pct(q.returnOnEquity) : '—'}</td><td>Live quote</td></tr>
            <tr><td>ROA</td><td>${q.returnOnAssets != null ? pct(q.returnOnAssets) : '—'}</td><td>Live quote</td></tr>
            <tr><td>Revenue growth</td><td>${q.revenueGrowth != null ? pct(q.revenueGrowth) : '—'}</td><td>Live quote</td></tr>
            <tr><td>Earnings growth</td><td>${q.earningsGrowth != null ? pct(q.earningsGrowth) : '—'}</td><td>Live quote</td></tr>
            <tr><td>Total cash</td><td>${money(q.totalCash != null ? q.totalCash : q.cash)}</td><td>Live quote / balance sheet</td></tr>
            <tr><td>Total debt</td><td>${money(q.totalDebt)}</td><td>Live quote / balance sheet</td></tr>
            <tr><td>Net debt</td><td>${money(netDebt)}</td><td>Debt − cash</td></tr>
            <tr><td>Debt / Equity</td><td>${num(q.debtToEquity)}</td><td>Live quote</td></tr>
            <tr><td>Current ratio</td><td>${num(q.currentRatio)}</td><td>Live quote</td></tr>
            <tr><td>Book value / share</td><td>${num(q.bookValue)}</td><td>Live quote</td></tr>
            <tr><td>Shares outstanding</td><td>${num(q.sharesOutstanding, 0)}</td><td>Live quote</td></tr>
            <tr><td>Beta</td><td>${num(q.beta)}</td><td>Live quote</td></tr>
            <tr><td>Dividend yield</td><td>${q.dividendYield != null ? pct(q.dividendYield) : '—'}</td><td>Live quote</td></tr>
            <tr><td>Model FCF base</td><td>${money(model.fcf0)}</td><td>Cash flow statement / derived</td></tr>
            <tr><td>Model revenue base</td><td>${money(model.rev0)}</td><td>Income statement</td></tr>
          </tbody>
        </table>
      </div>

      <!-- PAGE 7: Three approaches -->
      <div class="page">
        <h2>Valuation Approaches &amp; Methods</h2>
        <p>No single method is definitive. Asset, market and income indications are developed side by side and then reconciled with explicit weights.</p>

        <h3>1. Asset approach</h3>
        <table>
          <thead><tr><th>Item</th><th>Value</th></tr></thead>
          <tbody>
            ${assetRows.map(r => `<tr><td>${r.item}</td><td>${money(r.value)}</td></tr>`).join('')}
          </tbody>
        </table>
        <div class="insight"><strong>Insight — Asset.</strong> Book equity of ${money(book)} is an accounting residual, not a cash exit value. It anchors downside thinking for asset-heavy firms but often understates going-concern franchise value when ROE is high and growth is positive.</div>

        <h3>2. Market approach</h3>
        <table>
          <thead><tr><th>Indication</th><th>Equity value</th></tr></thead>
          <tbody>
            ${marketRows.map(r => `<tr><td>${r.item}</td><td>${money(r.value)}</td></tr>`).join('')}
            <tr><td><strong>Average market indication</strong></td><td><strong>${money(marketAvg)}</strong></td></tr>
          </tbody>
        </table>
        <div class="insight"><strong>Insight — Market.</strong> Multiples applied to the company’s own earnings, EBITDA and sales produce an average indication of ${money(marketAvg)}. Divergence versus market cap ${money(mcap)} highlights where the tape prices growth or risk differently than trailing fundamentals.</div>

        <h3>3. Income approach (DCF)</h3>
        <table>
          <thead><tr><th>Item</th><th>Value</th></tr></thead>
          <tbody>
            ${incomeRows.map(r => `<tr><td>${r.item}</td><td>${r.isPx ? px(r.value) : money(r.value)}</td></tr>`).join('')}
          </tbody>
        </table>
        <div class="insight"><strong>Insight — Income.</strong> DCF equity value ${money(model.equity)} (${px(model.vps)} / share) capitalizes expected free cash flow at ${(model.DISCOUNT * 100).toFixed(2)}%. Results are most sensitive to terminal growth, discount rate and the FCF margin assumption.</div>

        <h3>Reconciliation</h3>
        <table>
          <thead><tr><th>Approach</th><th>Indication</th><th>Weight</th><th>Weighted value</th></tr></thead>
          <tbody>
            ${methods.map(m => `<tr>
              <td>${m.name}</td>
              <td>${money(m.value)}</td>
              <td>${(m.weight * 100).toFixed(0)}%</td>
              <td>${m.value != null ? money(m.value * m.weight) : '—'}</td>
            </tr>`).join('')}
            <tr>
              <td><strong>Concluded equity value</strong></td>
              <td colspan="2"></td>
              <td><strong>${money(indicated)}</strong></td>
            </tr>
            <tr>
              <td><strong>Concluded value / share</strong></td>
              <td colspan="2"></td>
              <td><strong>${px(indicatedPS)}</strong></td>
            </tr>
            <tr>
              <td>Market price (reference)</td>
              <td colspan="2"></td>
              <td>${px(price)}</td>
            </tr>
          </tbody>
        </table>
        <div class="insight"><strong>Insight — Reconciliation.</strong> Weights emphasize income (45%) and market (35%) evidence for a going-concern listed equity, with asset value (20%) as a stabilizing anchor. Concluded per-share value ${px(indicatedPS)} versus market ${px(price)}.</div>
      </div>

      <!-- PAGES 8–9: 90 trading days -->
      <div class="page">
        <h2>Market Evidence — Last 90 Trading Days (1 / 2)</h2>
        <p class="muted">${last90.length} sessions extracted from the daily history feed. Columns: Open, High, Low, Close, Adj. Close, Change, Volume.</p>
        ${histTable(last90a)}
      </div>

      <div class="page">
        <h2>Market Evidence — Last 90 Trading Days (2 / 2)</h2>
        ${histTable(last90b)}
        <h3>Tabular insight — 90-day window</h3>
        ${histInsights(last90, '90-day')}
      </div>

      <!-- PAGE 10: 10 trading days -->
      <div class="page">
        <h2>Market Evidence — Last 10 Trading Days</h2>
        ${histTable(last10)}
        <h3>Tabular insight — 10-day window</h3>
        ${histInsights(last10, '10-day')}
      </div>

      <!-- PAGE 11: Limitations -->
      <div class="page">
        <h2>Limitations &amp; Conditions</h2>
        <ul>
          <li>This report is an automated, educational illustration produced by FinSight. It is not a USPAP appraisal, fairness opinion, or regulated research product.</li>
          <li>Inputs depend on third-party market data and financial statement extracts that may be incomplete, restated, or delayed.</li>
          <li>Discount rates, growth fades and FCF margins are simplified. Alternate assumptions can change concluded value materially.</li>
          <li>Market and asset approaches using a company’s own multiples are descriptive, not a full guideline-company or precedent-transaction study.</li>
          <li>Trading-day tables reflect the available history feed; exchange holidays and missing bars can shorten the sample.</li>
          <li>No on-site inspection, management interview, or audit of the subject company was performed.</li>
        </ul>
        <h2>Disclaimer</h2>
        <p>This document is provided solely for educational and illustrative purposes. It does not constitute investment advice, an offer to sell, or a solicitation to buy any security.
        Readers must verify all figures against primary filings and consult qualified professional advisors before making investment, credit, or transactional decisions.
        FinSight and its authors accept no liability for actions taken on the basis of this automated report.</p>
        <div class="callout">
          <strong>Conclusion snapshot:</strong> Concluded equity value ${money(indicated)}
          (${px(indicatedPS)} / share) versus market price ${px(price)},
          reconciling income, market and asset indications as of ${today()}.
        </div>
      </div>
    `;

    openReport(shell('Business Valuation Report — ' + sym, company, body));
  };


  R.financialModel = async function (sym) {
    const d = await gather(sym);
    const q = d.quote || {};
    const fin = d.financials || {};
    const model = dcfModel(q, fin);
    const company = q.longName || q.shortName || d.uni.CompanyName || sym;
    const sector = q.sector || d.uni.Sector || '—';
    const industry = q.industry || d.uni.Industry || '—';
    const price = model.price;

    const inc = parseMatrix(fin.income_statement || []);
    const bs = parseMatrix(fin.balance_sheet || []);
    const cf = parseMatrix(fin.cashflow || []);
    const incP = (inc.periods || []).slice(-4);
    const bsP = (bs.periods || []).slice(-4);
    const cfP = (cf.periods || []).slice(-4);

    function colYear(c) {
      const m = String(c).match(/(20\d{2})/);
      return m ? m[1] : String(c).slice(0, 10);
    }
    function rowMoney(label, names, matrix, periods) {
      return '<tr><td>' + label + '</td>' + periods.map(p => '<td>' + money(lookup(matrix.map, names, p)) + '</td>').join('') + '</tr>';
    }
    function lastVal(names, matrix, periods) {
      if (!periods.length) return null;
      for (let i = periods.length - 1; i >= 0; i--) {
        const v = lookup(matrix.map, names, periods[i]);
        if (v != null && !isNaN(v)) return v;
      }
      return null;
    }

    const rev0 = model.rev0 != null ? model.rev0 : (q.totalRevenue != null ? q.totalRevenue : lastVal(['Total Revenue', 'Revenue'], inc, incP));
    const ni0 = q.netIncomeToCommon != null ? q.netIncomeToCommon : lastVal(['Net Income', 'Net Income Common Stockholders'], inc, incP);
    const ebitda0 = q.ebitda != null ? q.ebitda : lastVal(['EBITDA', 'Normalized EBITDA'], inc, incP);
    const ocf0 = lastVal(['Operating Cash Flow', 'Cash Flow From Continuing Operating Activities'], cf, cfP);
    const fcf0 = model.fcf0;
    const capex0 = lastVal(['Capital Expenditure'], cf, cfP);
    const cash0 = q.totalCash != null ? q.totalCash : (q.cash != null ? q.cash : lastVal(['Cash And Cash Equivalents', 'Cash Cash Equivalents And Short Term Investments'], bs, bsP));
    const debt0 = q.totalDebt != null ? q.totalDebt : lastVal(['Total Debt'], bs, bsP);
    const equityBook = (q.bookValue && q.sharesOutstanding) ? q.bookValue * q.sharesOutstanding : lastVal(['Stockholders Equity', 'Total Equity Gross Minority Interest'], bs, bsP);
    const shares = model.shares || q.sharesOutstanding;
    const netDebt = (debt0 || 0) - (cash0 || 0);
    const mcap = q.marketCap;
    const ev = q.enterpriseValue != null ? q.enterpriseValue : (mcap != null ? mcap + netDebt : null);

    // LBO illustrative parameters derived from live data
    const entryEV = ev != null ? ev : (mcap != null ? mcap * 1.1 : null);
    const entryEquityPct = 0.40; // 40% equity / 60% debt typical PE sketch
    const entryDebtPct = 0.60;
    const entryEquity = entryEV != null ? entryEV * entryEquityPct : null;
    const entryDebt = entryEV != null ? entryEV * entryDebtPct : null;
    const debtRate = 0.07; // illustrative interest
    const holdYears = 5;
    const exitMult = q.enterpriseToEbitda != null ? Math.max(6, Math.min(14, Number(q.enterpriseToEbitda))) : 10;
    // Project EBITDA with mild growth
    const ebitdaGrowth = q.revenueGrowth != null ? Math.max(0.02, Math.min(0.12, Number(q.revenueGrowth))) : 0.05;
    const ebitdaPath = [];
    let eb = ebitda0;
    for (let t = 1; t <= holdYears; t++) {
      eb = eb != null ? eb * (1 + ebitdaGrowth) : null;
      ebitdaPath.push({ t, ebitda: eb });
    }
    const exitEBITDA = ebitdaPath.length ? ebitdaPath[ebitdaPath.length - 1].ebitda : ebitda0;
    const exitEV = exitEBITDA != null ? exitEBITDA * exitMult : null;
    // Simple debt paydown: use portion of FCF
    const annualFCF = fcf0 != null ? fcf0 : (ebitda0 != null ? ebitda0 * 0.4 : null);
    let debtBal = entryDebt;
    const debtSched = [];
    for (let t = 1; t <= holdYears; t++) {
      const interest = debtBal != null ? debtBal * debtRate : null;
      const paydown = annualFCF != null ? Math.min(Math.max(annualFCF * 0.5, 0), debtBal != null ? debtBal : 0) : 0;
      const endDebt = debtBal != null ? Math.max(0, debtBal - paydown) : null;
      debtSched.push({ t, begin: debtBal, interest, paydown, end: endDebt });
      debtBal = endDebt;
    }
    const exitDebt = debtSched.length ? debtSched[debtSched.length - 1].end : entryDebt;
    const exitEquityValue = (exitEV != null && exitDebt != null) ? exitEV - exitDebt : null;
    const moc = (exitEquityValue != null && entryEquity) ? exitEquityValue / entryEquity : null;
    // IRR approximation from MOIC over holdYears: (MOIC)^(1/n) - 1
    const irr = (moc != null && moc > 0) ? Math.pow(moc, 1 / holdYears) - 1 : null;

    // NPV of DCF already in model.pv; show IRR on equity vs price path as secondary
    const npvEquity = model.equity;
    const dcfIrrProxy = (model.vps != null && price) ? (model.vps / price) - 1 : null;

    const body = `
      <!-- PAGE 1: Framework -->
      <div class="page">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:12px;">
          <div>
            <div style="font-size:18px;font-weight:700;font-family:Inter,system-ui,sans-serif;">${company} (${sym})</div>
            <div class="muted">${sector} · ${industry}</div>
          </div>
          <div style="text-align:right;font-family:Inter,system-ui,sans-serif;font-size:12px;">
            <div><strong>Financial Model Pack</strong></div>
            <div class="muted">${today()}</div>
          </div>
        </div>

        <div class="section-title">Core Components of Financial Modeling</div>
        <p>A complete financial model combines linked statements, valuation engines and transaction structures so that a change in one driver (for example revenue growth) flows through profitability, cash, leverage and value. This pack builds those layers for <strong>${company}</strong> using the same live quote and financial-statement data available in Stock Listing.</p>

        <h3>1. Three-Statement Model</h3>
        <p>The three-statement model is the cornerstone of financial modeling. It connects the <strong>income statement</strong>, <strong>balance sheet</strong> and <strong>cash flow statement</strong> so that changes in one area ripple through the others and give a holistic view of financial health.</p>
        <ul>
          <li><strong>Income statement:</strong> tracks revenues, expenses and profits over a period.</li>
          <li><strong>Balance sheet:</strong> summarizes assets, liabilities and equity at a point in time.</li>
          <li><strong>Cash flow statement:</strong> details cash inflows and outflows from operations, investing and financing.</li>
        </ul>
        <p>In a fully dynamic workbook these statements are linked with formulas so that adjusting revenue growth updates cash flow and equity balances automatically. The tables on the next page use the issuer’s reported annual history as the factual base for that linkage.</p>

        <h3>2. Discounted Cash Flow (DCF)</h3>
        <p>DCF models value the firm by estimating the present value of expected free cash flows. Core steps:</p>
        <ul>
          <li><strong>Forecast free cash flows</strong> from revenue growth, margins and reinvestment (capex / working capital).</li>
          <li><strong>Calculate terminal value</strong> with a perpetuity growth (or exit multiple) assumption.</li>
          <li><strong>Discount to present value</strong> at an appropriate cost of capital (here, a Damodaran-linked median US cost of capital of 8.35%).</li>
        </ul>
        <p>Outputs include enterprise and equity value, value per share, and implied upside versus the market price. NPV of the projected cash flows is the enterprise present value; IRR-style checks compare model value to the current market price.</p>

        <h3>3. Leveraged Buyout (LBO) Sketch</h3>
        <p>LBO models are used by private equity to test acquisitions financed largely with debt. Key blocks:</p>
        <ul>
          <li><strong>Entry price and funding mix</strong> (equity vs debt).</li>
          <li><strong>Debt schedule</strong> with interest and paydown.</li>
          <li><strong>Operating projections</strong> on a three-statement foundation (EBITDA path).</li>
          <li><strong>Exit multiple and returns</strong> (MOIC, IRR).</li>
        </ul>
        <p>The LBO section later in this pack is an <em>illustrative</em> structure parameterized with ${sym}’s live EV, EBITDA and free-cash-flow scale — not a live deal model.</p>

        <div class="callout">
          <strong>Subject snapshot:</strong> Price ${px(price)} · Market cap ${money(mcap)} · EV ${money(ev)} ·
          Revenue base ${money(rev0)} · EBITDA ${money(ebitda0)} · FCF ${money(fcf0)} · Net debt ${money(netDebt)}.
        </div>
      </div>

      <!-- PAGE 2: 3-statement -->
      <div class="page">
        <h2>Three-Statement Historical Model</h2>
        <p class="muted">Annual history from the financials feed used in Stock Listing → Financials. Periods shown are the latest available fiscal years.</p>

        <h3>Income Statement</h3>
        ${incP.length ? `<table>
          <thead><tr><th>Line</th>${incP.map(p => '<th>' + colYear(p) + '</th>').join('')}</tr></thead>
          <tbody>
            ${rowMoney('Revenue', ['Total Revenue', 'Operating Revenue', 'Revenue'], inc, incP)}
            ${rowMoney('Cost of Revenue', ['Cost Of Revenue', 'Cost of Revenue'], inc, incP)}
            ${rowMoney('Gross Profit', ['Gross Profit'], inc, incP)}
            ${rowMoney('Operating Income', ['Operating Income', 'Operating Income Loss'], inc, incP)}
            ${rowMoney('Net Income', ['Net Income', 'Net Income Common Stockholders'], inc, incP)}
            ${rowMoney('EBITDA', ['EBITDA', 'Normalized EBITDA'], inc, incP)}
            ${rowMoney('Basic EPS', ['Basic EPS'], inc, incP)}
            ${rowMoney('Diluted EPS', ['Diluted EPS'], inc, incP)}
          </tbody>
        </table>` : '<p class="muted">Income statement periods unavailable.</p>'}

        <h3>Balance Sheet</h3>
        ${bsP.length ? `<table>
          <thead><tr><th>Line</th>${bsP.map(p => '<th>' + colYear(p) + '</th>').join('')}</tr></thead>
          <tbody>
            ${rowMoney('Cash & Equivalents', ['Cash And Cash Equivalents', 'Cash Cash Equivalents And Short Term Investments'], bs, bsP)}
            ${rowMoney('Total Current Assets', ['Current Assets', 'Total Current Assets'], bs, bsP)}
            ${rowMoney('Net PPE', ['Net PPE', 'Properties Plant And Equipment Net'], bs, bsP)}
            ${rowMoney('Total Assets', ['Total Assets'], bs, bsP)}
            ${rowMoney('Total Current Liabilities', ['Current Liabilities', 'Total Current Liabilities'], bs, bsP)}
            ${rowMoney('Long-Term Debt', ['Long Term Debt', 'Long Term Debt And Capital Lease Obligation'], bs, bsP)}
            ${rowMoney('Total Liabilities', ['Total Liabilities Net Minority Interest', 'Total Liabilities'], bs, bsP)}
            ${rowMoney('Stockholders Equity', ['Stockholders Equity', 'Total Equity Gross Minority Interest'], bs, bsP)}
          </tbody>
        </table>` : '<p class="muted">Balance sheet periods unavailable.</p>'}

        <h3>Cash Flow Statement</h3>
        ${cfP.length ? `<table>
          <thead><tr><th>Line</th>${cfP.map(p => '<th>' + colYear(p) + '</th>').join('')}</tr></thead>
          <tbody>
            ${rowMoney('Net Income', ['Net Income', 'Net Income From Continuing Operations'], cf, cfP)}
            ${rowMoney('Depreciation & Amortization', ['Depreciation And Amortization', 'Reconciled Depreciation'], cf, cfP)}
            ${rowMoney('Operating Cash Flow', ['Operating Cash Flow', 'Cash Flow From Continuing Operating Activities'], cf, cfP)}
            ${rowMoney('Capital Expenditure', ['Capital Expenditure'], cf, cfP)}
            ${rowMoney('Investing Cash Flow', ['Investing Cash Flow', 'Cash Flow From Continuing Investing Activities'], cf, cfP)}
            ${rowMoney('Financing Cash Flow', ['Financing Cash Flow', 'Cash Flow From Continuing Financing Activities'], cf, cfP)}
            ${rowMoney('Free Cash Flow', ['Free Cash Flow'], cf, cfP)}
          </tbody>
        </table>` : '<p class="muted">Cash flow periods unavailable.</p>'}

        <div class="insight">
          <strong>Linkage note.</strong> Net income feeds retained earnings on the balance sheet and is the starting point of operating cash flow.
          Capex and working-capital changes bridge EBITDA to free cash flow; debt and equity issuance/repayment appear in financing cash flow and change period-end leverage.
        </div>
      </div>

      <!-- PAGE 3: DCF -->
      <div class="page">
        <h2>Discounted Cash Flow Model</h2>
        <p>The DCF below uses the same engine as the Valuation module: staged revenue growth, constant trailing FCF margin, Damodaran-linked discount rate and Gordon growth terminal value.</p>

        <h3>Key DCF assumptions</h3>
        <table>
          <thead><tr><th>Parameter</th><th>Value</th><th>Role in the model</th></tr></thead>
          <tbody>
            <tr><td>Discount rate (r)</td><td>${(model.DISCOUNT * 100).toFixed(2)}%</td><td>Cost of capital for discounting FCF and terminal value</td></tr>
            <tr><td>Terminal growth (g)</td><td>${(model.TG * 100).toFixed(2)}%</td><td>Perpetuity growth after year ${model.YEARS}</td></tr>
            <tr><td>Horizon</td><td>${model.YEARS} years</td><td>Explicit forecast length</td></tr>
            <tr><td>Stage-entry growth</td><td>${(model.g0 * 100).toFixed(2)}%</td><td>Fades linearly to terminal g</td></tr>
            <tr><td>FCF / Sales margin</td><td>${(model.margin * 100).toFixed(2)}%</td><td>Converts projected revenue to FCF</td></tr>
            <tr><td>Revenue base</td><td>${money(model.rev0)}</td><td>Latest annual revenue</td></tr>
            <tr><td>FCF base</td><td>${money(model.fcf0)}</td><td>Latest FCF (or OCF − |Capex|)</td></tr>
            <tr><td>Net debt</td><td>${money(netDebt)}</td><td>Bridge from enterprise to equity value</td></tr>
            <tr><td>Shares</td><td>${num(shares, 0)}</td><td>Per-share conversion</td></tr>
          </tbody>
        </table>

        <h3>Forecast free cash flows</h3>
        <table>
          <thead><tr><th>Year</th><th>Growth</th><th>Revenue</th><th>FCF</th><th>Discount factor</th><th>PV of FCF</th></tr></thead>
          <tbody>
            ${model.rows.map(r => `<tr>
              <td>Y+${r.t}</td>
              <td>${(r.g * 100).toFixed(2)}%</td>
              <td>${money(r.rev)}</td>
              <td>${money(r.fcf)}</td>
              <td>${(1 / Math.pow(1 + model.DISCOUNT, r.t)).toFixed(4)}</td>
              <td>${money(r.disc)}</td>
            </tr>`).join('')}
          </tbody>
        </table>

        <h3>Terminal value &amp; NPV bridge</h3>
        <table>
          <thead><tr><th>Component</th><th>Value</th></tr></thead>
          <tbody>
            <tr><td>Sum of PV of explicit FCF (NPV of forecast period)</td><td>${money(model.pv - (model.pvTv || 0))}</td></tr>
            <tr><td>Terminal value TV = FCF<sub>n</sub>×(1+g)/(r−g)</td><td>${money(model.tv)}</td></tr>
            <tr><td>PV of terminal value</td><td>${money(model.pvTv)}</td></tr>
            <tr><td><strong>Enterprise NPV (total PV)</strong></td><td><strong>${money(model.pv)}</strong></td></tr>
            <tr><td>Less: net debt</td><td>${money(netDebt)}</td></tr>
            <tr><td><strong>Equity value</strong></td><td><strong>${money(model.equity)}</strong></td></tr>
            <tr><td><strong>Value per share</strong></td><td><strong>${px(model.vps)}</strong></td></tr>
            <tr><td>Market price</td><td>${px(price)}</td></tr>
            <tr><td>Implied premium / (discount) vs market</td><td>${model.upside == null ? '—' : ((model.upside >= 0 ? '+' : '') + model.upside.toFixed(1) + '%')}</td></tr>
          </tbody>
        </table>
        <div class="insight">
          <strong>DCF insight.</strong> Enterprise NPV of ${money(model.pv)} is the present value of expected free cash flows under the stated assumptions.
          About ${model.pv && model.pvTv != null ? ((model.pvTv / model.pv) * 100).toFixed(0) : '—'}% of that value sits in the terminal PV, so conclusions are sensitive to r and g.
          Versus the market price ${px(price)}, the model implies ${model.upside == null ? 'n/a' : ((model.upside >= 0 ? 'upside of +' : 'downside of ') + Math.abs(model.upside).toFixed(1) + '%')}.
        </div>
      </div>

      <!-- PAGE 4: LBO -->
      <div class="page">
        <h2>Leveraged Buyout (LBO) — Illustrative Structure</h2>
        <p>This section sketches how a private-equity style LBO <em>could</em> look if ${company} were acquired at a value near current enterprise value, funded with a mix of debt and equity, held for ${holdYears} years, and exited at an EV/EBITDA multiple consistent with the current trading range. It is educational only — not a prediction of any transaction.</p>

        <h3>Entry price &amp; funding sources</h3>
        <table>
          <thead><tr><th>Item</th><th>Value</th><th>Notes</th></tr></thead>
          <tbody>
            <tr><td>Entry enterprise value</td><td>${money(entryEV)}</td><td>Anchored to live EV / market scale</td></tr>
            <tr><td>Equity contribution (${(entryEquityPct * 100).toFixed(0)}%)</td><td>${money(entryEquity)}</td><td>Sponsor equity check</td></tr>
            <tr><td>Debt funding (${(entryDebtPct * 100).toFixed(0)}%)</td><td>${money(entryDebt)}</td><td>Acquisition debt principal</td></tr>
            <tr><td>Assumed interest rate</td><td>${(debtRate * 100).toFixed(1)}%</td><td>Illustrative blended cost of debt</td></tr>
            <tr><td>Hold period</td><td>${holdYears} years</td><td>Standard PE hold sketch</td></tr>
            <tr><td>Entry EBITDA</td><td>${money(ebitda0)}</td><td>Live / statement EBITDA</td></tr>
            <tr><td>Entry EV / EBITDA</td><td>${ebitda0 && entryEV ? (entryEV / ebitda0).toFixed(1) + 'x' : '—'}</td><td>Implied entry multiple</td></tr>
          </tbody>
        </table>

        <h3>Debt schedule</h3>
        <table>
          <thead><tr><th>Year</th><th>Opening debt</th><th>Interest</th><th>Principal paydown</th><th>Closing debt</th></tr></thead>
          <tbody>
            ${debtSched.map(r => `<tr>
              <td>Y+${r.t}</td>
              <td>${money(r.begin)}</td>
              <td>${money(r.interest)}</td>
              <td>${money(r.paydown)}</td>
              <td>${money(r.end)}</td>
            </tr>`).join('')}
          </tbody>
        </table>
        <p class="muted">Paydown assumes ~50% of trailing free cash flow capacity (${money(annualFCF)} / year) is applied to principal — a simple cash-sweep proxy.</p>

        <h3>Performance projection (EBITDA path)</h3>
        <table>
          <thead><tr><th>Year</th><th>EBITDA</th><th>YoY growth</th></tr></thead>
          <tbody>
            <tr><td>Entry (Y0)</td><td>${money(ebitda0)}</td><td>—</td></tr>
            ${ebitdaPath.map(r => `<tr>
              <td>Y+${r.t}</td>
              <td>${money(r.ebitda)}</td>
              <td>${(ebitdaGrowth * 100).toFixed(1)}%</td>
            </tr>`).join('')}
          </tbody>
        </table>

        <h3>Exit &amp; returns</h3>
        <table>
          <thead><tr><th>Item</th><th>Value</th></tr></thead>
          <tbody>
            <tr><td>Exit EV / EBITDA multiple</td><td>${exitMult.toFixed(1)}x</td></tr>
            <tr><td>Exit EBITDA</td><td>${money(exitEBITDA)}</td></tr>
            <tr><td>Exit enterprise value</td><td>${money(exitEV)}</td></tr>
            <tr><td>Exit net debt (approx. closing debt)</td><td>${money(exitDebt)}</td></tr>
            <tr><td>Exit equity value</td><td>${money(exitEquityValue)}</td></tr>
            <tr><td>Entry equity</td><td>${money(entryEquity)}</td></tr>
            <tr><td><strong>MOIC (cash-on-cash)</strong></td><td><strong>${moc == null ? '—' : moc.toFixed(2) + 'x'}</strong></td></tr>
            <tr><td><strong>Approx. equity IRR</strong></td><td><strong>${irr == null ? '—' : ((irr * 100).toFixed(1) + '%')}</strong></td></tr>
          </tbody>
        </table>
        <div class="insight">
          <strong>LBO insight.</strong> Returns hinge on EBITDA growth (${(ebitdaGrowth * 100).toFixed(1)}% assumed), debt paydown from free cash flow, and the exit multiple (${exitMult.toFixed(1)}x).
          A MOIC of ${moc == null ? 'n/a' : moc.toFixed(2) + 'x'} over ${holdYears} years corresponds to an approximate IRR of ${irr == null ? 'n/a' : (irr * 100).toFixed(1) + '%'}.
          Higher rates, lower exit multiples or weaker FCF would compress both metrics.
        </div>
      </div>

      <!-- PAGE 5: Analysis & insights -->
      <div class="page">
        <h2>Integrated Analysis &amp; Insights</h2>

        <h3>Three-statement health</h3>
        <ul>
          <li><strong>Profitability:</strong> Gross margin ${q.grossMargins != null ? pct(q.grossMargins) : '—'}, operating margin ${q.operatingMargins != null ? pct(q.operatingMargins) : '—'}, net margin ${q.profitMargins != null ? pct(q.profitMargins) : '—'}. These margins set the ceiling for sustainable FCF conversion in the DCF.</li>
          <li><strong>Returns:</strong> ROE ${q.returnOnEquity != null ? pct(q.returnOnEquity) : '—'} and ROA ${q.returnOnAssets != null ? pct(q.returnOnAssets) : '—'} indicate how hard equity and assets work; high ROE with modest leverage supports premium valuations.</li>
          <li><strong>Liquidity &amp; leverage:</strong> Cash ${money(cash0)}, total debt ${money(debt0)}, net debt ${money(netDebt)}, current ratio ${num(q.currentRatio)}, debt/equity ${num(q.debtToEquity)}. Leverage capacity is the binding constraint in any LBO debt schedule.</li>
          <li><strong>Cash conversion:</strong> Operating cash flow ${money(ocf0)} versus free cash flow ${money(fcf0)} shows reinvestment intensity after capex ${money(capex0 != null ? Math.abs(capex0) : null)}.</li>
        </ul>

        <h3>DCF takeaways</h3>
        <ul>
          <li>Enterprise NPV ${money(model.pv)} and equity value ${money(model.equity)} (${px(model.vps)} / share) under r=${(model.DISCOUNT * 100).toFixed(2)}% and g=${(model.TG * 100).toFixed(1)}%.</li>
          <li>Market price ${px(price)} implies ${model.upside == null ? 'n/a' : ((model.upside >= 0 ? 'a ' + model.upside.toFixed(1) + '% premium to' : 'a ' + Math.abs(model.upside).toFixed(1) + '% discount from') + ' model value')} — use as a valuation gap, not a trading signal alone.</li>
          <li>Terminal value share of enterprise PV is material; stress-test r (+100 bps) and g (−50 bps) before relying on the base case.</li>
        </ul>

        <h3>LBO takeaways</h3>
        <ul>
          <li>Illustrative entry EV ${money(entryEV)} funded ${(entryEquityPct * 100).toFixed(0)}% equity / ${(entryDebtPct * 100).toFixed(0)}% debt produces entry equity of ${money(entryEquity)}.</li>
          <li>With EBITDA growth ${(ebitdaGrowth * 100).toFixed(1)}%, partial FCF sweep and exit at ${exitMult.toFixed(1)}x, modeled MOIC is ${moc == null ? 'n/a' : moc.toFixed(2) + 'x'} and IRR about ${irr == null ? 'n/a' : (irr * 100).toFixed(1) + '%'}.</li>
          <li>Deal attractiveness for a real PE process would further require quality of earnings, working-capital normalization, covenant headroom and exit-market depth — none of which are fully modeled here.</li>
        </ul>

        <h3>Cross-model consistency</h3>
        <p>The three-statement history supplies the factual base (revenue, margins, cash, debt). The DCF converts that base into an intrinsic enterprise/equity value. The LBO tests whether a leveraged hold at a similar entry EV could clear typical PE return hurdles. When DCF value per share is well above market while LBO IRR looks thin, the gap often reflects high entry multiples or low FCF relative to EV — useful for framing strategic versus financial-buyer logic.</p>
      </div>

      <!-- PAGE 6: Model outputs + disclaimer -->
      <div class="page">
        <h2>Model Output Summary</h2>
        <div class="kpi">
          <div class="box"><div class="lab">DCF Equity Value</div><div class="val">${money(model.equity)}</div></div>
          <div class="box"><div class="lab">DCF Value / Share</div><div class="val">${px(model.vps)}</div></div>
          <div class="box"><div class="lab">Market Price</div><div class="val">${px(price)}</div></div>
          <div class="box"><div class="lab">DCF Upside</div><div class="val">${model.upside == null ? '—' : ((model.upside >= 0 ? '+' : '') + model.upside.toFixed(1) + '%')}</div></div>
          <div class="box"><div class="lab">Enterprise NPV</div><div class="val">${money(model.pv)}</div></div>
          <div class="box"><div class="lab">LBO MOIC</div><div class="val">${moc == null ? '—' : moc.toFixed(2) + 'x'}</div></div>
          <div class="box"><div class="lab">LBO IRR (approx.)</div><div class="val">${irr == null ? '—' : ((irr * 100).toFixed(1) + '%')}</div></div>
          <div class="box"><div class="lab">Net Debt</div><div class="val">${money(netDebt)}</div></div>
        </div>

        <h3>Assumption recap</h3>
        <table>
          <thead><tr><th>Module</th><th>Core assumptions</th></tr></thead>
          <tbody>
            <tr><td>3-Statement</td><td>Reported annual income, balance sheet and cash flow history from the live financials feed</td></tr>
            <tr><td>DCF</td><td>r=${(model.DISCOUNT * 100).toFixed(2)}%, g=${(model.TG * 100).toFixed(1)}%, horizon ${model.YEARS}y, FCF margin ${(model.margin * 100).toFixed(1)}%, growth fade from ${(model.g0 * 100).toFixed(1)}%</td></tr>
            <tr><td>LBO</td><td>Entry EV ≈ live EV, ${(entryEquityPct * 100).toFixed(0)}% equity / ${(entryDebtPct * 100).toFixed(0)}% debt, rate ${(debtRate * 100).toFixed(1)}%, hold ${holdYears}y, exit ${exitMult.toFixed(1)}x EBITDA, FCF sweep ~50%</td></tr>
          </tbody>
        </table>

        <h2>Disclaimer</h2>
        <p>This financial model pack is generated automatically by FinSight for <strong>educational and illustrative purposes only</strong>. It is not investment advice, a fairness opinion, a USPAP appraisal, or a regulated research product.</p>
        <ul>
          <li>Statement tables depend on third-party data that may be incomplete, delayed or restated.</li>
          <li>DCF and LBO results are highly sensitive to growth, margin, discount-rate, leverage and exit-multiple assumptions.</li>
          <li>The LBO section does not represent any proposed transaction and omits fees, taxes, covenants, PIK toggles and structural subordination that appear in live deal models.</li>
          <li>Always verify figures against primary filings and consult qualified advisors before making investment, credit or transactional decisions.</li>
        </ul>
        <div class="callout">
          <strong>Bottom line for ${sym}:</strong>
          DCF value ${px(model.vps)} / share vs market ${px(price)}
          (${model.upside == null ? 'n/a' : ((model.upside >= 0 ? '+' : '') + model.upside.toFixed(1) + '%')});
          illustrative LBO MOIC ${moc == null ? 'n/a' : moc.toFixed(2) + 'x'} / IRR ${irr == null ? 'n/a' : (irr * 100).toFixed(1) + '%'}.
          Prepared ${today()}.
        </div>
      </div>
    `;

    openReport(shell('Financial Model Report — ' + sym, company, body));
  };


  global.ReportBuilder = R;
  global.FinSightReports = R;
})(window);
