/* © All rights reserved FinSight prepared by Rudra Nath Sinha */
/* Live data helper — Flask /api/live/* + health + PDF download */

(function (global) {
  const DEFAULT_BASE = (function () {
    try {
      if (typeof location !== 'undefined' && location.port === '5000') return '';
      // file:// or other static hosts → talk to local Flask
      if (typeof location !== 'undefined' && (location.protocol === 'file:' || location.port === '' || location.port === '5500' || location.port === '8080')) {
        return 'http://127.0.0.1:5000';
      }
    } catch (_) {}
    return '';
  })();

  const BASE = global.FINSIGHT_LIVE_BASE != null ? global.FINSIGHT_LIVE_BASE : DEFAULT_BASE;

  function classifyError(status, body, url) {
    const code = (body && body.code) || null;
    const msg = (body && body.error) || null;
    if (status === 0) {
      return {
        kind: 'backend_down',
        message: 'Cannot reach FinSight backend. Start it with: cd webapp/backend && python3 app.py (port 5000).',
        status,
        code: 'BACKEND_DOWN',
        url,
      };
    }
    if (status === 404 || code === 'NO_DATA') {
      return {
        kind: 'no_data',
        message: msg || 'No data available for this symbol.',
        status,
        code: code || 'NO_DATA',
        url,
      };
    }
    if (status >= 500) {
      return {
        kind: 'upstream',
        message: msg || 'Upstream market data error. Try again in a moment.',
        status,
        code: code || 'UPSTREAM',
        url,
      };
    }
    return {
      kind: 'http',
      message: msg || ('Request failed (' + status + ')'),
      status,
      code: code || 'HTTP',
      url,
    };
  }

  async function get(path) {
    const url = BASE + path;
    let res;
    try {
      res = await fetch(url, { headers: { Accept: 'application/json' } });
    } catch (e) {
      const err = new Error('Cannot reach Flask at ' + (BASE || (typeof location !== 'undefined' ? location.origin : 'localhost:5000')) + ' — run: cd webapp/backend && python3 app.py');
      err.meta = classifyError(0, null, url);
      err.code = 'BACKEND_DOWN';
      throw err;
    }
    if (!res.ok) {
      let body = null;
      try { body = await res.json(); } catch (_) {}
      const meta = classifyError(res.status, body, url);
      const err = new Error(meta.message);
      err.meta = meta;
      err.code = meta.code;
      err.status = res.status;
      throw err;
    }
    return res.json();
  }

  async function health() {
    try {
      const data = await get('/api/health');
      return { ok: true, data };
    } catch (e) {
      return { ok: false, error: e, meta: e.meta || classifyError(0, null, BASE + '/api/health') };
    }
  }

  /**
   * Server-side PDF via WeasyPrint. Falls back to caller if engine fails.
   * @param {string} html full HTML document
   * @param {string} filename e.g. AAPL-equity-research.pdf
   */
  async function downloadPdf(html, filename) {
    const url = BASE + '/api/reports/pdf';
    let res;
    try {
      res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/pdf' },
        body: JSON.stringify({ html, filename: filename || 'finsight-report.pdf' }),
      });
    } catch (e) {
      const err = new Error('PDF service unreachable — is Flask running on port 5000?');
      err.code = 'BACKEND_DOWN';
      throw err;
    }
    if (!res.ok) {
      let body = null;
      try { body = await res.json(); } catch (_) {}
      const err = new Error((body && body.error) || ('PDF failed (' + res.status + ')'));
      err.code = (body && body.code) || 'PDF_ENGINE';
      throw err;
    }
    const blob = await res.blob();
    const a = document.createElement('a');
    const obj = URL.createObjectURL(blob);
    a.href = obj;
    a.download = filename || 'finsight-report.pdf';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(obj), 4000);
    return true;
  }

  /** Friendly HTML banner for backend / empty-data states */
  function errorBannerHtml(meta, opts) {
    opts = opts || {};
    const kind = (meta && meta.kind) || 'http';
    const title =
      kind === 'backend_down' ? 'Backend offline' :
      kind === 'no_data' ? 'No data for this symbol' :
      kind === 'upstream' ? 'Market data temporarily unavailable' :
      'Something went wrong';
    const detail = (meta && meta.message) || 'Please try again.';
    const tip =
      kind === 'backend_down'
        ? 'Start the Flask server: <code class="text-xs bg-slate-100 dark:bg-slate-800 px-1 rounded">cd webapp/backend && python3 app.py</code> then refresh.'
        : kind === 'no_data'
          ? 'Try another ticker, or check that the symbol is listed on a supported exchange.'
          : 'Wait a few seconds and retry. If it persists, restart the backend.';
    return `
      <div class="rounded-xl border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/40 p-4 my-3" role="alert">
        <div class="flex items-start gap-3">
          <div class="mt-0.5 text-amber-600 dark:text-amber-400">
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/></svg>
          </div>
          <div class="min-w-0 flex-1">
            <div class="font-semibold text-amber-900 dark:text-amber-200">${title}</div>
            <p class="text-sm text-amber-800/90 dark:text-amber-200/90 mt-1">${detail}</p>
            <p class="text-xs text-amber-700/80 dark:text-amber-300/80 mt-2">${tip}</p>
            ${opts.retryId ? `<button type="button" id="${opts.retryId}" class="mt-3 px-3 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-xs font-semibold">Retry</button>` : ''}
          </div>
        </div>
      </div>`;
  }

  function setBackendChip(ok, detail) {
    const el = document.getElementById('backendStatus');
    if (!el) return;
    if (ok) {
      el.textContent = 'Backend online';
      el.className = 'hidden sm:inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400';
      el.title = detail || 'Flask API reachable';
    } else {
      el.textContent = 'Backend offline';
      el.className = 'hidden sm:inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-rose-50 dark:bg-rose-900/30 text-rose-700 dark:text-rose-400';
      el.title = detail || 'Start: cd webapp/backend && python3 app.py';
    }
  }

  let _monitorStarted = false;
  async function pollHealthOnce() {
    const r = await health();
    setBackendChip(r.ok, r.ok ? 'OK' : ((r.meta && r.meta.message) || 'offline'));
    return r.ok;
  }
  function startBackendMonitor(intervalMs) {
    if (_monitorStarted) return;
    _monitorStarted = true;
    const tick = async () => { try { await pollHealthOnce(); } catch (_) { setBackendChip(false); } };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', tick);
    else tick();
    setInterval(tick, intervalMs || 30000);
  }

  global.LiveAPI = {
    base: BASE,
    get,
    health,
    downloadPdf,
    errorBannerHtml,
    setBackendChip,
    pollHealthOnce,
    startBackendMonitor,
    quote: (sym) => get('/api/live/quote/' + encodeURIComponent(sym)),
    history: (sym, period, interval) =>
      get(`/api/live/history/${encodeURIComponent(sym)}?period=${encodeURIComponent(period || '1y')}&interval=${encodeURIComponent(interval || '1d')}`),
    financials: (sym) => get('/api/live/financials/' + encodeURIComponent(sym)),
    dividends: async (sym) => {
      const body = await get('/api/live/dividends/' + encodeURIComponent(sym));
      // Normalize to always return { symbol, dividends: [] }
      if (Array.isArray(body)) return { symbol: sym, dividends: body };
      if (body && Array.isArray(body.dividends)) return body;
      return { symbol: sym, dividends: [] };
    },
    profile: (sym) => get('/api/stocks/' + encodeURIComponent(sym)),
  };
})(window);

// Auto-start backend health chip when this script loads
try { startBackendMonitor(30000); } catch (_) {}
