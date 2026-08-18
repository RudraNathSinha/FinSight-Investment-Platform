/* © All rights reserved FinSight prepared by Rudra Nath Sinha */
/* ============================================================
   FinSight – Part 3: Stock Analysis for Investors
   Wired to FastAPI + yfinance live endpoints
   ============================================================ */

let UNIVERSE = [];
  window.UNIVERSE = UNIVERSE;
let SECTORS = [];
let STOCK_RANKINGS = {};
let charts = {};
let selectedSym = null;
let multiSelect = [];
let carryToReports = false; // set when user analyzes a stock
let lastMainTab = "listing";
let liveCache = {}; // symbol -> { quote, history, financials }

function fsEmpty(opts) {
  if (window.FinSightUI && FinSightUI.emptyState) return FinSightUI.emptyState(opts);
  const o = opts || {};
  return `<div class="rounded-xl border border-dashed border-slate-300 dark:border-slate-700 p-6 text-center text-sm text-slate-500"><strong class="text-slate-700 dark:text-slate-200">${o.title || 'No data available'}</strong><p class="mt-1">${o.detail || ''}</p></div>`;
}
function fsBlank(v) { return v == null || v === '' || (typeof v === 'number' && isNaN(v)); }
function ratioFmt(v, dec) {
  if (v == null || v === '' || isNaN(Number(v))) return '—';
  return Number(v).toFixed(dec != null ? dec : 3);
}
function fmtRatioCell(v) {
  if (v == null || isNaN(Number(v))) return '—';
  return Number(v).toFixed(3);
}



const SECTOR_FILE = {
  'Communication Services': 'Communication_Services',
  'Consumer Discretionary': 'Consumer_Discretionary',
  'Consumer Staples': 'Consumer_Staples',
  'Energy': 'Energy',
  'Financials': 'Financials',
  'Healthcare': 'Healthcare',
  'Industrials': 'Industrials',
  'Materials': 'Materials',
  'Real Estate': 'Real_Estate',
  'Technology': 'Technology',
  'Utilities': 'Utilities'
};

const PERIOD_MAP = {
  '1d':  { period: '1d',  interval: '5m' },
  '7d':  { period: '5d',  interval: '15m' },
  '1mo': { period: '1mo', interval: '1d' },
  '6mo': { period: '6mo', interval: '1d' },
  '1y':  { period: '1y',  interval: '1d' },
  '5y':  { period: '5y',  interval: '1wk' },
  '10y': { period: '10y', interval: '1wk' },
};

const fmt = {
  num: (v, d=2) => v == null || isNaN(v) ? '—' : Number(v).toLocaleString(undefined,{maximumFractionDigits:d}),
  pct: (v, isRatio=false) => {
    if (v == null || isNaN(v)) return '—';
    const n = isRatio ? Number(v) * 100 : Number(v);
    return n.toFixed(2) + '%';
  },
  mcap: (v) => {
    if (v == null || isNaN(v)) return '—';
    const n = Number(v);
    if (n >= 1e12) return '$' + (n/1e12).toFixed(2) + 'T';
    if (n >= 1e9)  return '$' + (n/1e9).toFixed(2) + 'B';
    if (n >= 1e6)  return '$' + (n/1e6).toFixed(2) + 'M';
    if (n >= 1e3)  return '$' + (n/1e3).toFixed(1) + 'K';
    return '$' + n.toLocaleString();
  },
  rankBadge: (r) => {
    if (r === 1) return 'rank-1';
    if (r === 2) return 'rank-2';
    if (r === 3) return 'rank-3';
    return 'rank-other';
  },
  money: (v) => {
    if (v == null || isNaN(v)) return '—';
    return Number(v).toLocaleString(undefined, { maximumFractionDigits: 2 });
  }
};

function chartColors() {
  const dark = document.documentElement.classList.contains('dark');
  return {
    text: dark ? '#94a3b8' : '#64748b',
    grid: dark ? 'rgba(148,163,184,0.1)' : 'rgba(100,116,139,0.12)',
    line: '#339fff',
    fill: 'rgba(51,159,255,0.12)'
  };
}

async function fetchJson(url) {
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) {
    throw new Error('Failed to fetch ' + url + ' (' + res.status + ')');
  }
  return res.json();
}

async function loadData() {
  const candidates = ['../data/', '/data/', 'data/'];
  let lastErr = null;
  for (const base of candidates) {
    try {
      const [u, s] = await Promise.all([
        fetchJson(base + 'stocks_universe.json'),
        fetchJson(base + 'sectors.json')
      ]);
      UNIVERSE = u || [];
      window.UNIVERSE = UNIVERSE;
      SECTORS = s || [];
      console.info('[FinSight Part3] data loaded from', base, 'universe', UNIVERSE.length);
      return;
    } catch (e) {
      lastErr = e;
      console.warn('[FinSight Part3] data base failed:', base, e.message);
    }
  }
  throw lastErr || new Error('Could not load data from any known path');
}

async function loadSectorRankings(sector) {
  if (STOCK_RANKINGS[sector]) return STOCK_RANKINGS[sector];
  const file = SECTOR_FILE[sector];
  if (!file) return [];
  try {
    const data = await fetch(`../data/stock_rankings/${file}.json`).then(r => r.json());
    STOCK_RANKINGS[sector] = data;
    return data;
  } catch { return []; }
}

/* ---- Live data from pre-fetched JSON (yfinance → data/live/{SYM}.json) ---- */
const LIVE_JSON_BASE = '../data/live/';

async function loadLiveBundle(sym) {
  sym = (sym || '').toUpperCase();
  if (liveCache[sym]?.bundle) return liveCache[sym].bundle;
  try {
    const res = await fetch(LIVE_JSON_BASE + encodeURIComponent(sym) + '.json', { cache: 'no-store' });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const data = await res.json();
    liveCache[sym] = liveCache[sym] || {};
    liveCache[sym].bundle = data;
    liveCache[sym].quote = data.quote || null;
    liveCache[sym].history = data.history || {};
    liveCache[sym].financials = data.financials || null;
    liveCache[sym].dividends = data.dividends || [];
    return data;
  } catch (e) {
    console.warn('No live JSON for', sym, e.message);
    liveCache[sym] = liveCache[sym] || {};
    liveCache[sym].bundle = null;
    return null;
  }
}

async function fetchLiveQuote(sym) {
  sym = (sym || '').toUpperCase();
  if (liveCache[sym]?.quote) return liveCache[sym].quote;
  const bundle = await loadLiveBundle(sym);
  return bundle?.quote || null;
}

async function fetchLiveHistory(sym, periodKey = '1y') {
  sym = (sym || '').toUpperCase();
  await loadLiveBundle(sym);
  const hist = liveCache[sym]?.history?.[periodKey];
  return Array.isArray(hist) ? hist : [];
}

async function fetchLiveFinancials(sym) {
  sym = (sym || '').toUpperCase();
  await loadLiveBundle(sym);
  return liveCache[sym]?.financials || null;
}

async function fetchLiveDividends(sym) {
  sym = (sym || '').toUpperCase();
  await loadLiveBundle(sym);
  return liveCache[sym]?.dividends || [];
}

function initTabs() {
  document.querySelectorAll('#mainTabs .tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const prev = document.querySelector('#mainTabs .tab-btn.active');
      if (prev) lastMainTab = prev.dataset.tab || lastMainTab;
      document.querySelectorAll('#mainTabs .tab-btn').forEach(t => t.classList.remove('active'));
      btn.classList.add('active');
      document.querySelectorAll('.tab-panel').forEach(p => p.classList.add('hidden'));
      const panel = document.getElementById('panel-' + btn.dataset.tab);
      if (panel) {
        panel.classList.remove('hidden');
        if (!panel.dataset.rendered) {
          renderPanel(btn.dataset.tab);
          panel.dataset.rendered = '1';
        }
      }
    });
  });
  const params = new URLSearchParams(location.search);
  const pre = params.get('symbol');
  document.querySelector('[data-tab="listing"]').click();
  if (pre) setTimeout(() => selectStock(pre.toUpperCase()), 300);
}

function renderPanel(name) {
  ({ listing: renderListing, selection: renderSelection, reports: renderReports })[name]?.();
}

/* ==================== STOCK LISTING ==================== */
function renderListing() {
  const el = document.getElementById('panel-listing');
  el.innerHTML = `
    <div class="mb-5">
      <h2 class="text-xl font-bold mb-1">Stock Listing & Profile</h2>
      <p class="text-sm text-slate-500">Search any ticker. Rankings load from offline data. Live price/charts/financials load from pre-fetched JSON (run the yfinance notebook or _fetch_stock.py to update).</p>
    </div>

    <div class="card p-4 mb-5 relative max-w-xl">
      <label class="text-xs font-medium text-slate-500 mb-1 block">Enter Stock Name / Symbol</label>
      <input id="listSearch" type="text" placeholder="e.g. AAPL, LITE, JPM..."
        class="w-full px-3 py-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" autocomplete="off" />
      <div id="listDropdown" class="search-dropdown hidden"></div>
    </div>

    <div id="listResult">
      <div class="text-center py-16 text-slate-400 text-sm">Search and select a stock to begin analysis.</div>
    </div>
  `;

  const input = document.getElementById('listSearch');
  const dropdown = document.getElementById('listDropdown');
  input.addEventListener('input', () => {
    const q = input.value.trim().toLowerCase();
    if (q.length < 1) { dropdown.classList.add('hidden'); return; }
    const hits = UNIVERSE.filter(s =>
      (s.Symbol && s.Symbol.toLowerCase().includes(q)) ||
      (s.CompanyName && s.CompanyName.toLowerCase().includes(q))
    ).slice(0, 18);
    if (!hits.length) { dropdown.classList.add('hidden'); return; }
    dropdown.innerHTML = hits.map(s => `
      <div class="search-item" data-sym="${s.Symbol}">
        <div class="sym">${s.Symbol}</div>
        <div class="meta">${s.CompanyName || ''} · ${s.Sector || ''} · ${s.Industry || ''} · ${s.Country || ''}</div>
      </div>
    `).join('');
    dropdown.classList.remove('hidden');
    dropdown.querySelectorAll('.search-item').forEach(item => {
      item.addEventListener('click', () => {
        input.value = item.dataset.sym;
        dropdown.classList.add('hidden');
        selectStock(item.dataset.sym);
      });
    });
  });
  input.addEventListener('blur', () => setTimeout(() => dropdown.classList.add('hidden'), 200));
}

async function selectStock(sym) {
  selectedSym = sym;
  carryToReports = true;
  const el = document.getElementById('listResult');
  el.innerHTML = `<div class="flex justify-center py-12"><div class="w-8 h-8 border-4 border-brand-500 border-t-transparent rounded-full animate-spin"></div></div>`;

  const uni = UNIVERSE.find(u => u.Symbol === sym);
  let rank = null;
  if (uni) {
    const all = await loadSectorRankings(uni.Sector);
    rank = all.find(r => r.Symbol === sym);
  }

  // Prefetch live quote in parallel
  const quotePromise = fetchLiveQuote(sym);

  const company = rank?.['Company Name'] || uni?.CompanyName || sym;
  const sector = rank?.Sector || uni?.Sector || '—';
  const industry = rank?.Industry || uni?.Industry || '—';
  const country = rank?.Country || uni?.Country || '—';

  const quote = await quotePromise;
  const liveMissing = !quote;

  el.innerHTML = `
  
    <div class="flex flex-wrap items-start justify-between gap-3 mb-4">
      <div>
        <h3 class="text-2xl font-extrabold">${sym}</h3>
        <p class="text-slate-500">${quote?.longName || quote?.shortName || company}</p>
        <p class="text-xs text-slate-400 mt-0.5">${quote?.sector || sector} · ${quote?.industry || industry} · ${quote?.country || country}</p>
      </div>
      <div class="flex flex-wrap gap-2 items-center">
        ${quote && (quote.currentPrice || quote.previousClose) ? `
          <div class="text-right mr-2">
            <p class="text-2xl font-extrabold">${fmt.money(quote.currentPrice || quote.previousClose)}</p>
            <p class="text-xs text-slate-400">${quote.currency || 'USD'} · ${quote.exchange || ''}</p>
          </div>
        ` : ''}
        ${rank ? `<span class="badge ${fmt.rankBadge(rank.Final_Rank)} text-sm px-3 py-1">Rank #${rank.Final_Rank}</span>` : ''}
        ${rank ? `<span class="badge rank-other text-sm px-3 py-1">Score ${fmt.num(rank.Ensemble_Score,1)}</span>` : ''}
      </div>
    </div>

    <div class="flex gap-1 overflow-x-auto py-2 mb-4 scrollbar-hide border-b border-slate-200 dark:border-slate-800" id="subTabs">
      <button class="sub-tab active" data-sub="overview">Overview</button>
      <button class="sub-tab" data-sub="financials">Financials</button>
      <button class="sub-tab" data-sub="valuation">Valuation</button>
      <button class="sub-tab" data-sub="statistics">Statistics</button>
      <button class="sub-tab" data-sub="dividends">Dividends</button>
      <button class="sub-tab" data-sub="ranking">Ranking Detail</button>
    </div>
    <div id="subContent"></div>
  `;

  const ctx = { sym, company, sector, industry, country, rank, uni, quote };
  document.querySelectorAll('#subTabs .sub-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('#subTabs .sub-tab').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      renderSub(btn.dataset.sub, ctx);
    });
  });
  renderSub('overview', ctx);
}

async function renderSub(name, ctx) {
  const el = document.getElementById('subContent');
  const { sym, company, sector, industry, country, rank } = ctx;

  if (name === 'overview') {
    el.innerHTML = `
      <div class="card p-4 sm:p-5 mb-4 sm:mb-5">
        <h4 class="text-sm font-semibold mb-3">Company Snapshot</h4>
        <dl class="grid sm:grid-cols-2 gap-x-6 gap-y-2 text-sm" id="ovSnapshot">
          <div class="flex justify-between gap-3 min-w-0"><dt class="text-slate-500 shrink-0">Ticker</dt><dd class="font-semibold">${sym}</dd></div>
          <div class="flex justify-between gap-3 min-w-0"><dt class="text-slate-500 shrink-0">Company</dt><dd class="font-medium text-right truncate max-w-[60%]" title="${company}">${company}</dd></div>
          <div class="flex justify-between gap-3 min-w-0"><dt class="text-slate-500 shrink-0">Sector</dt><dd class="text-right truncate">${sector}</dd></div>
          <div class="flex justify-between gap-3 min-w-0"><dt class="text-slate-500 shrink-0">Industry</dt><dd class="text-right truncate">${industry}</dd></div>
          <div class="flex justify-between gap-3 min-w-0"><dt class="text-slate-500 shrink-0">Country</dt><dd>${country}</dd></div>
        </dl>
        <p class="text-xs text-slate-400 mt-3" id="ovLiveStatus">Loading live quote…</p>
      </div>

      <div class="card p-4 sm:p-5 mb-4 sm:mb-5" id="ovSummary">
        <h4 class="text-sm font-semibold mb-2">Business Summary</h4>
        <p class="text-sm text-slate-500">Loading…</p>
      </div>

      <div class="card p-4 sm:p-5">
        <div class="flex flex-wrap items-center justify-between gap-2 mb-3">
          <h4 class="text-sm font-semibold">Price Chart</h4>
          <div class="flex gap-1 flex-wrap overflow-x-auto" id="periodBtns">
            ${['1d','5d','1mo','6mo','1y','5y','10y','max'].map(p =>
              `<button class="sub-tab ${p==='1y'?'active':''}" data-period="${p}">${p}</button>`
            ).join('')}
          </div>
        </div>
        <div class="chart-container" style="height:260px"><canvas id="priceChart"></canvas></div>
        <p class="text-xs text-slate-400 mt-2" id="priceStatus"></p>
      </div>
    `;
    loadOverviewLive(sym);
    document.querySelectorAll('#periodBtns .sub-tab').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('#periodBtns .sub-tab').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        loadPriceChart(sym, btn.dataset.period);
      });
    });
  } else if (name === 'financials') {
    el.innerHTML = `
      <div class="flex gap-1 overflow-x-auto task-bar mb-4" id="finTabs">
        ${['Highlights','Income Statement','Balance Sheet','Cash Flow','Ratios'].map((t,i) =>
          `<button class="sub-tab ${i===0?'active':''}" data-fin="${t}">${t}</button>`
        ).join('')}
      </div>
      <div id="finBody"><div class="flex justify-center py-10"><div class="w-8 h-8 border-4 border-brand-500 border-t-transparent rounded-full animate-spin"></div></div></div>
    `;
    loadFinancialsLive(sym);
  } else if (name === 'valuation') {
    el.innerHTML = `<div id="valBody"><div class="flex justify-center py-10"><div class="w-8 h-8 border-4 border-brand-500 border-t-transparent rounded-full animate-spin"></div></div></div>`;
    renderValuation(sym, ctx);
  } else if (name === 'statistics') {
    el.innerHTML = `<div id="statBody"><div class="flex justify-center py-10"><div class="w-8 h-8 border-4 border-brand-500 border-t-transparent rounded-full animate-spin"></div></div></div>`;
    loadStatisticsLive(sym);
  } else if (name === 'dividends') {
    el.innerHTML = `<div id="divBody"><div class="flex justify-center py-10"><div class="w-8 h-8 border-4 border-brand-500 border-t-transparent rounded-full animate-spin"></div></div></div>`;
    loadDividendsLive(sym);
  } else if (name === 'ranking') {
    el.innerHTML = `<div id="rankDetailBody"><div class="flex justify-center py-10"><div class="w-8 h-8 border-4 border-brand-500 border-t-transparent rounded-full animate-spin"></div></div></div>`;
    renderRankingDetail(sym, rank);
  }
}

async function renderRankingDetail(sym, rank) {
  const body = document.getElementById('rankDetailBody');
  if (!body) return;

  let period = '1y';
  let metric = 'price'; // price | change | totalReturn
  let page = 0;
  const PAGE_SIZE = 20;
  let rows = []; // normalized historical rows newest-first for table

  const PERIODS = [
    { v: '1mo', l: '1M' }, { v: '3mo', l: '3M' }, { v: '6mo', l: '6M' },
    { v: '1y', l: '1Y' }, { v: '2y', l: '2Y' }, { v: '5y', l: '5Y' },
    { v: '10y', l: '10Y' }, { v: 'max', l: 'Max' },
  ];

  function pick(r, ...keys) {
    for (const k of keys) {
      if (r[k] != null && r[k] !== '') return r[k];
    }
    return null;
  }

  function normalize(hist) {
    if (!Array.isArray(hist)) return [];
    const out = hist.map(r => {
      const date = String(pick(r, 'Date', 'Datetime', 'date', 'index') || '').slice(0, 10);
      const open = Number(pick(r, 'Open'));
      const high = Number(pick(r, 'High'));
      const low = Number(pick(r, 'Low'));
      const close = Number(pick(r, 'Close'));
      const adj = Number(pick(r, 'Adj Close', 'AdjClose', 'Stock Splits') != null && pick(r, 'Adj Close', 'AdjClose') != null
        ? pick(r, 'Adj Close', 'AdjClose')
        : close);
      // yfinance auto-adjusts Close often; prefer explicit Adj Close when present
      const adjClose = Number(pick(r, 'Adj Close', 'AdjClose'));
      const useAdj = adjClose != null && !isNaN(adjClose) ? adjClose : close;
      const volume = Number(pick(r, 'Volume'));
      return {
        date,
        open: isNaN(open) ? null : open,
        high: isNaN(high) ? null : high,
        low: isNaN(low) ? null : low,
        close: isNaN(close) ? null : close,
        adjClose: isNaN(useAdj) ? null : useAdj,
        volume: isNaN(volume) ? null : volume,
      };
    }).filter(r => r.date && r.close != null);
    // chronological ascending for charts / change calc
    out.sort((a, b) => a.date.localeCompare(b.date));
    // change vs prior close
    for (let i = 0; i < out.length; i++) {
      if (i === 0 || out[i - 1].close == null || out[i].close == null) {
        out[i].change = null;
        out[i].changePct = null;
      } else {
        out[i].change = out[i].close - out[i - 1].close;
        out[i].changePct = (out[i].change / Math.abs(out[i - 1].close)) * 100;
      }
      // total return from first close in window using adj when possible
      const base = out[0].adjClose ?? out[0].close;
      const cur = out[i].adjClose ?? out[i].close;
      out[i].totalReturnPct = (base && cur != null) ? ((cur / base) - 1) * 100 : null;
    }
    return out;
  }

  async function load() {
    body.innerHTML = `<div class="flex justify-center py-10"><div class="w-8 h-8 border-4 border-brand-500 border-t-transparent rounded-full animate-spin"></div></div>`;
    try {
      const hist = await LiveAPI.history(sym, period, '1d');
      rows = normalize(hist);
      page = 0;
      paint();
    } catch (e) {
      rows = [];
      paint(e.message);
    }
  }

  function metricSeries(data) {
    if (metric === 'change') return data.map(r => r.changePct);
    if (metric === 'totalReturn') return data.map(r => r.totalReturnPct);
    return data.map(r => r.close);
  }

  function metricLabel() {
    if (metric === 'change') return 'Price Change (%)';
    if (metric === 'totalReturn') return 'Total Return (%)';
    return 'Stock Price';
  }

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

  function paint(errMsg) {
    const methods = rank ? [
      ['SAW', rank.SAW], ['TOPSIS', rank.TOPSIS], ['VIKOR', rank.VIKOR],
      ['GRA', rank.GRA], ['WASPAS', rank.WASPAS], ['COPRAS', rank.COPRAS], ['PCA', rank.PCA]
    ] : [];

    // table is newest first
    const tableRows = rows.slice().reverse();
    const totalPages = Math.max(1, Math.ceil(tableRows.length / PAGE_SIZE));
    if (page > totalPages - 1) page = totalPages - 1;
    if (page < 0) page = 0;
    const slice = tableRows.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE);

    body.innerHTML = `
      <!-- PRICE HISTORY -->
      <div class="card p-4 mb-5">
        <div class="flex flex-wrap items-center justify-between gap-3 mb-3">
          <div>
            <h3 class="text-sm font-semibold">Price History</h3>
            <p class="text-[11px] text-slate-400">Daily OHLC for ${sym}. Change is vs prior close; total return is cumulative from the first bar in the selected range (adj. close when available).</p>
          </div>
          <div class="flex flex-wrap items-center gap-2">
            <label class="text-xs text-slate-500">Metric
              <select id="rdMetric" class="ml-1 text-xs border border-slate-200 dark:border-slate-700 rounded-lg px-2 py-1 bg-white dark:bg-slate-900">
                <option value="price" ${metric==='price'?'selected':''}>Stock Price</option>
                <option value="change" ${metric==='change'?'selected':''}>Price Change (%)</option>
                <option value="totalReturn" ${metric==='totalReturn'?'selected':''}>Total Return (%)</option>
              </select>
            </label>
            <div class="flex flex-wrap gap-1" id="rdPeriods">
              ${PERIODS.map(p => `
                <button type="button" data-p="${p.v}"
                  class="px-2 py-1 text-xs rounded-lg border ${period===p.v ? 'bg-brand-500 text-white border-brand-500' : 'border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800'}">${p.l}</button>
              `).join('')}
            </div>
          </div>
        </div>
        ${errMsg ? `<p class="text-sm text-amber-600 mb-3">History unavailable: ${errMsg}</p>` : ''}
        <div class="chart-container" style="height:320px"><canvas id="rdPriceChart"></canvas></div>
        <p class="text-[11px] text-slate-400 mt-2">${rows.length ? `${rows.length} trading days · ${rows[0].date} → ${rows[rows.length-1].date} · chart: ${metricLabel()}` : 'No rows for this period.'}</p>
      </div>

      <!-- HISTORICAL DATA TABLE -->
      <div class="card p-4 mb-5">
        <div class="flex flex-wrap items-center justify-between gap-2 mb-3">
          <h3 class="text-sm font-semibold">Historical Data</h3>
          <p class="text-[11px] text-slate-400">${tableRows.length} rows · page ${page + 1} of ${totalPages}</p>
        </div>
        <div class="overflow-x-auto">
          <table class="data-table is-table w-full">
            <thead>
              <tr>
                <th class="text-left">Date</th>
                <th class="text-right">Open</th>
                <th class="text-right">High</th>
                <th class="text-right">Low</th>
                <th class="text-right">Close</th>
                <th class="text-right">Adj Close</th>
                <th class="text-right">Change</th>
                <th class="text-right">Volume</th>
              </tr>
            </thead>
            <tbody>
              ${!slice.length ? `<tr><td colspan="8">${fsEmpty({ title: 'No ranking rows', detail: 'No historical ranking rows for this page.' })}</td></tr>` :
                slice.map(r => {
                  const cls = r.change > 0 ? 'pos' : r.change < 0 ? 'neg' : '';
                  return `<tr>
                    <td class="text-left">${r.date}</td>
                    <td class="text-right">${fmtPx(r.open)}</td>
                    <td class="text-right">${fmtPx(r.high)}</td>
                    <td class="text-right">${fmtPx(r.low)}</td>
                    <td class="text-right">${fmtPx(r.close)}</td>
                    <td class="text-right">${fmtPx(r.adjClose)}</td>
                    <td class="text-right ${cls}">${fmtChg(r.change)}${r.changePct!=null?` <span class="text-[10px] opacity-70">(${fmtChg(r.changePct)}%)</span>`:''}</td>
                    <td class="text-right">${fmtVol(r.volume)}</td>
                  </tr>`;
                }).join('')}
            </tbody>
          </table>
        </div>
        <div class="flex items-center justify-between mt-3">
          <button type="button" id="rdPrev" class="px-3 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-slate-700 disabled:opacity-40" ${page<=0?'disabled':''}>← Previous</button>
          <span class="text-xs text-slate-500">Page ${page + 1} / ${totalPages}</span>
          <button type="button" id="rdNext" class="px-3 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-slate-700 disabled:opacity-40" ${page>=totalPages-1?'disabled':''}>Next →</button>
        </div>
      </div>

      <!-- MCDM RANKING -->
      <div class="card p-4 mb-2">
        <div class="mb-3">
          <h3 class="text-sm font-semibold">MCDM Ranking Scores</h3>
          <p class="text-[11px] text-slate-400 mt-1">
            These multi-criteria decision-making (MCDM) scores are the offline ranking model used to rank
            <strong>${sym}</strong> within its industry/sector universe. Higher scores generally indicate a stronger relative standing under that method.
            Methods: SAW, TOPSIS, VIKOR, GRA, WASPAS, COPRAS, PCA.
          </p>
        </div>
        ${!rank ? `<p class="text-sm text-slate-400">No offline ranking data for ${sym}.</p>` : `
        <div class="grid md:grid-cols-2 gap-5">
          <div>
            <table class="data-table w-full">
              <thead><tr><th class="text-left">Method</th><th class="text-right">Score</th></tr></thead>
              <tbody>
                ${methods.map(([m,v]) => `<tr><td class="font-medium">${m}</td><td class="text-right">${fmt.num(v,4)}</td></tr>`).join('')}
              </tbody>
            </table>
            ${rank.Rank != null || rank.Composite != null || rank.Final_Rank != null ? `
            <p class="text-xs text-slate-500 mt-3">
              ${rank.Final_Rank != null ? `Final rank: <strong>${rank.Final_Rank}</strong>. ` : ''}
              ${rank.Rank != null ? `Rank: <strong>${rank.Rank}</strong>. ` : ''}
              ${rank.Composite != null ? `Composite: <strong>${fmt.num(rank.Composite,4)}</strong>.` : ''}
            </p>` : ''}
          </div>
          <div>
            <div class="chart-container" style="height:260px"><canvas id="methodBar"></canvas></div>
          </div>
        </div>`}
      </div>
    `;

    // events
    document.getElementById('rdMetric')?.addEventListener('change', (e) => {
      metric = e.target.value;
      paint();
    });
    document.querySelectorAll('#rdPeriods button').forEach(btn => {
      btn.addEventListener('click', () => {
        period = btn.dataset.p;
        load();
      });
    });
    document.getElementById('rdPrev')?.addEventListener('click', () => { if (page > 0) { page--; paint(); } });
    document.getElementById('rdNext')?.addEventListener('click', () => {
      const tp = Math.max(1, Math.ceil(tableRows.length / PAGE_SIZE));
      if (page < tp - 1) { page++; paint(); }
    });

    // price chart
    const dark = document.documentElement.classList.contains('dark');
    if (charts.rdPrice) charts.rdPrice.destroy();
    const canvas = document.getElementById('rdPriceChart');
    if (canvas && rows.length) {
      const series = metricSeries(rows);
      const isPct = metric !== 'price';
      charts.rdPrice = new Chart(canvas, {
        type: 'line',
        data: {
          labels: rows.map(r => r.date),
          datasets: [{
            label: metricLabel(),
            data: series,
            borderColor: metric === 'change' ? '#8b5cf6' : metric === 'totalReturn' ? '#f59e0b' : '#339fff',
            backgroundColor: 'rgba(51,159,255,0.12)',
            fill: metric === 'price',
            tension: 0.15,
            pointRadius: 0,
            borderWidth: 2,
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { display: false },
            tooltip: {
              callbacks: {
                label: (ctx) => {
                  const v = ctx.parsed.y;
                  if (v == null) return '';
                  return isPct ? (v > 0 ? '+' : '') + v.toFixed(2) + '%' : '$' + fmtPx(v);
                }
              }
            }
          },
          scales: {
            x: { ticks: { color: dark ? '#94a3b8' : '#64748b', maxTicksLimit: 8, font: { size: 9 } }, grid: { display: false } },
            y: {
              ticks: {
                color: dark ? '#94a3b8' : '#64748b',
                font: { size: 9 },
                callback: (v) => isPct ? v.toFixed(1) + '%' : fmtPx(v)
              },
              grid: { color: dark ? 'rgba(148,163,184,0.1)' : 'rgba(100,116,139,0.12)' }
            }
          }
        }
      });
    }

    // MCDM chart
    if (rank && methods.length) {
      if (charts.methodBar) charts.methodBar.destroy();
      const mCanvas = document.getElementById('methodBar');
      if (mCanvas) {
        charts.methodBar = new Chart(mCanvas, {
          type: 'bar',
          data: {
            labels: methods.map(m => m[0]),
            datasets: [{
              data: methods.map(m => m[1]),
              backgroundColor: ['#339fff','#10b981','#f59e0b','#ef4444','#8b5cf6','#ec4899','#06b6d4'],
              borderRadius: 4
            }]
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: {
              x: { ticks: { color: dark ? '#94a3b8' : '#64748b' }, grid: { display: false } },
              y: { ticks: { color: dark ? '#94a3b8' : '#64748b' }, grid: { color: dark ? 'rgba(148,163,184,0.1)' : 'rgba(100,116,139,0.12)' } }
            }
          }
        });
      }
    }
  }

  load();
}


async function loadOverviewLive(sym) {
  const status = document.getElementById('ovLiveStatus');
  try {
    const q = await LiveAPI.quote(sym);
    status.textContent = 'Live data connected';
    status.className = 'text-xs text-emerald-600 mt-3';
    if (window.LiveAPI && LiveAPI.setBackendChip) LiveAPI.setBackendChip(true);
    const snap = document.getElementById('ovSnapshot');
    const extra = [
      ['Exchange', q.exchange],
      ['Price', q.currentPrice != null ? '$' + Number(q.currentPrice).toLocaleString(undefined,{maximumFractionDigits:2}) : (q.previousClose != null ? '$' + Number(q.previousClose).toLocaleString(undefined,{maximumFractionDigits:2}) : null)],
      ['Market Cap', q.marketCap != null ? fmt.mcap(q.marketCap) : null],
      ['Trailing PE', q.trailingPE != null ? ratioFmt(q.trailingPE) : null],
      ['Div Yield', q.dividendYield != null ? (q.dividendYield * 100).toFixed(2) + '%' : null],
      ['Employees', q.fullTimeEmployees != null ? Number(q.fullTimeEmployees).toLocaleString() : null],
    ];
    extra.forEach(([k, v]) => {
      if (v == null) return;
      const row = document.createElement('div');
      row.className = 'flex justify-between';
      row.innerHTML = `<dt class="text-slate-500">${k}</dt><dd class="font-medium text-right max-w-[55%] truncate">${v}</dd>`;
      snap.appendChild(row);
    });
    const sum = document.getElementById('ovSummary');
    if (q.longBusinessSummary) {
      sum.innerHTML = `<h4 class="text-sm font-semibold mb-2">Business Summary</h4><p class="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">${q.longBusinessSummary}</p>`;
    } else {
      sum.innerHTML = `<h4 class="text-sm font-semibold mb-2">Business Summary</h4><p class="text-sm text-slate-400">No summary available.</p>`;
    }
  } catch (e) {
    const meta = e.meta || { kind: e.code === 'BACKEND_DOWN' ? 'backend_down' : 'upstream', message: e.message };
    status.innerHTML = '';
    status.className = 'mt-3';
    status.innerHTML = (window.LiveAPI && LiveAPI.errorBannerHtml)
      ? LiveAPI.errorBannerHtml(meta, { retryId: 'ovRetryLive' })
      : ('<span class="text-xs text-amber-600">' + (e.message || 'Live data unavailable') + '</span>');
    const btn = document.getElementById('ovRetryLive');
    if (btn) btn.onclick = () => loadOverviewLive(sym);

  }
  loadPriceChart(sym, '1y');
}

async function loadPriceChart(sym, period) {
  const st = document.getElementById('priceStatus');
  if (st) st.textContent = 'Loading history…';
  try {
    const interval = (period === '1d' || period === '5d') ? '5m' : '1d';
    const rows = await LiveAPI.history(sym, period, interval);
    if (!rows || !rows.length) throw Object.assign(new Error('No price history for this symbol/period.'), { meta: { kind: 'no_data', message: 'No price history for this symbol/period.' } });
    // Axis labels: DD/MM/YY (day/month/year)
    const labels = rows.map((r) => {
      const raw = (r.Date || r.Datetime || r.date || '').toString();
      const m = raw.match(/(\d{4})-(\d{2})-(\d{2})/);
      if (m) return m[3] + '/' + m[2] + '/' + m[1].slice(2);
      const d = new Date(raw);
      if (!isNaN(d.getTime())) {
        const dd = String(d.getDate()).padStart(2, '0');
        const mm = String(d.getMonth() + 1).padStart(2, '0');
        const yy = String(d.getFullYear()).slice(2);
        return dd + '/' + mm + '/' + yy;
      }
      return raw.slice(0, 10);
    });
    const closes = rows.map(r => r.Close);
    const dark = document.documentElement.classList.contains('dark');
    if (charts.priceChart) charts.priceChart.destroy();
    charts.priceChart = new Chart(document.getElementById('priceChart'), {
      type: 'line',
      data: {
        labels,
        datasets: [{
          label: 'Close',
          data: closes,
          borderColor: '#339fff',
          backgroundColor: 'rgba(51,159,255,0.1)',
          fill: true,
          tension: 0.15,
          pointRadius: 0,
          borderWidth: 2
        }]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          x: {
            ticks: {
              color: dark ? '#94a3b8' : '#64748b',
              maxTicksLimit: 8,
              font: { size: 10 },
              autoSkip: true,
              maxRotation: 45,
              minRotation: 0
            },
            grid: { display: false }
          },
          y: { ticks: { color: dark ? '#94a3b8' : '#64748b' }, grid: { color: dark ? 'rgba(148,163,184,0.1)' : 'rgba(100,116,139,0.12)' } }
        }
      }
    });
    if (st) st.textContent = `${rows.length} points · period ${period}`;
  } catch (e) {
    const meta = e.meta || { kind: e.code === 'BACKEND_DOWN' ? 'backend_down' : (e.message && e.message.includes('Empty') ? 'no_data' : 'upstream'), message: e.message };
    if (st) {
      st.className = 'mt-2';
      st.innerHTML = (window.LiveAPI && LiveAPI.errorBannerHtml) ? LiveAPI.errorBannerHtml(meta) : ('History unavailable: ' + e.message);
    }
  }
}

async function loadFinancialsLive(sym) {
  const body = document.getElementById('finBody');
  try {
    const data = await LiveAPI.financials(sym);
    const quote = await LiveAPI.quote(sym).catch(() => ({}));
    function tableFrom(records) {
      if (!records || !records.length) return fsEmpty({ title: 'No statement rows', detail: 'Upstream feed returned no rows for this statement.', tip: 'Try another symbol or period.' });
      const cols = Object.keys(records[0]);
      return `<div class="overflow-x-auto"><table class="data-table w-full">
        <thead><tr>${cols.map(c => `<th>${c}</th>`).join('')}</tr></thead>
        <tbody>${records.slice(0, 40).map(r => `<tr>${cols.map(c => `<td class="text-xs">${r[c] ?? '—'}</td>`).join('')}</tr>`).join('')}</tbody>
      </table></div>`;
    }
    const panels = {
      'Highlights': () => {
        const cards = [
          {
            label: 'Market Cap',
            value: quote.marketCap != null ? fmt.mcap(quote.marketCap) : null,
            desc: 'Total market value of all shares (price × shares outstanding), shown in USD trillions (T), billions (B), or millions (M).'
          },
          {
            label: 'Trailing PE',
            value: quote.trailingPE != null ? Number(quote.trailingPE).toFixed(2) : null,
            desc: 'Price-to-Earnings using the last 12 months of earnings. Higher can mean the stock is expensive relative to recent profits.'
          },
          {
            label: 'Forward PE',
            value: quote.forwardPE != null ? Number(quote.forwardPE).toFixed(2) : null,
            desc: 'Price-to-Earnings based on expected next-year earnings. Often lower than trailing PE if growth is anticipated.'
          },
          {
            label: 'Profit Margin',
            value: quote.profitMargins != null ? (quote.profitMargins * 100).toFixed(2) + '%' : null,
            desc: 'Net income as a share of revenue. Shows how much profit the company keeps from each dollar of sales.'
          },
          {
            label: 'ROE',
            value: quote.returnOnEquity != null ? (quote.returnOnEquity * 100).toFixed(2) + '%' : null,
            desc: 'Return on Equity — net income relative to shareholders’ equity. Measures how efficiently equity capital is used.'
          },
          {
            label: 'Revenue Growth',
            value: quote.revenueGrowth != null ? (quote.revenueGrowth * 100).toFixed(2) + '%' : null,
            desc: 'Year-over-year change in revenue. Positive means sales are growing; negative means they are shrinking.'
          },
          {
            label: 'EPS (TTM)',
            value: quote.trailingEps != null ? Number(quote.trailingEps).toFixed(2) : null,
            desc: 'Earnings Per Share over the trailing twelve months — profit attributable to each share of stock.'
          },
          {
            label: 'Book Value',
            value: quote.bookValue != null ? Number(quote.bookValue).toFixed(2) : null,
            desc: 'Accounting net assets per share (assets minus liabilities). Often compared with market price via Price/Book.'
          },
          {
            label: 'Beta',
            value: quote.beta != null ? Number(quote.beta).toFixed(2) : null,
            desc: 'Sensitivity to market moves. Beta ≈ 1 moves with the market; > 1 is more volatile; < 1 is less volatile.'
          },
        ];
        const isEmpty = (v) => v == null || v === '' || v === '—' || v === '0' || v === '0.00' || v === '0.00%';
        const sorted = [...cards].sort((a, b) => {
          const ae = isEmpty(a.value) ? 1 : 0;
          const be = isEmpty(b.value) ? 1 : 0;
          return ae - be;
        });
        return `<div class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
          ${sorted.map(c => `
            <div class="card p-4 flex flex-col">
              <p class="text-xs font-medium text-slate-500 uppercase tracking-wide">${c.label}</p>
              <p class="text-xl font-bold mt-1 mb-2">${c.value ?? '—'}</p>
              <p class="text-[11px] leading-relaxed text-slate-400 mt-auto">${c.desc}</p>
            </div>
          `).join('')}
        </div>`;
      },

      'Income Statement': () => null, // rendered by renderIncomeStatement()
      'Balance Sheet': () => null, // renderBalanceSheet()
      'Cash Flow': () => null, // renderCashFlow()
      'Ratios': () => null, // renderRatiosKPIs()
    };
    function show(key) {
      if (key === 'Income Statement') {
        renderIncomeStatement(body, data);
        return;
      }
      if (key === 'Balance Sheet') {
        renderBalanceSheet(body, data);
        return;
      }
      if (key === 'Cash Flow') {
        renderCashFlow(body, data);
        return;
      }
      if (key === 'Ratios') {
        renderRatiosKPIs(body, data, quote, sym);
        return;
      }
      const html = (panels[key] || panels['Highlights'])();
      body.innerHTML = `<div class="card p-4">${html}</div>`;
    }
    show('Highlights');
    document.querySelectorAll('#finTabs .sub-tab').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('#finTabs .sub-tab').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        show(btn.dataset.fin);
      });
    });
  } catch (e) {
    body.innerHTML = `<div class="card p-6 text-center text-amber-600 text-sm">Financials unavailable: ${e.message}<br><span class="text-xs text-slate-400">Ensure Flask is running on port 5000</span></div>`;
  }
}

/* ==================== Income Statement (structured) ==================== */
const IS_TIPS = {
  'Revenue': { def: 'Total sales generated from core operations.', formula: 'Sum of product & service sales (Top line)' },
  'Revenue Growth (YoY)': { def: 'Year-over-year change in revenue.', formula: '(Revenueₜ − Revenueₜ₋₁) / Revenueₜ₋₁ × 100%' },
  'Cost of Revenue': { def: 'Direct costs to produce goods or deliver services sold.', formula: 'Beginning inventory + Purchases − Ending inventory (approx.)' },
  'Cost of Revenue Growth (YoY)': { def: 'Year-over-year change in cost of revenue.', formula: '(CoRₜ − CoRₜ₋₁) / CoRₜ₋₁ × 100%' },
  'Gross Profit': { def: 'Profit after direct costs of sales.', formula: 'Revenue − Cost of Revenue' },
  'Gross Profit Growth (YoY)': { def: 'Year-over-year change in gross profit.', formula: '(GPₜ − GPₜ₋₁) / GPₜ₋₁ × 100%' },
  'Selling General & Admin': { def: 'Operating overhead: selling, general and administrative expenses.', formula: 'SG&A expense line from income statement' },
  'SG&A Growth (YoY)': { def: 'Year-over-year change in SG&A.', formula: '(SG&Aₜ − SG&Aₜ₋₁) / SG&Aₜ₋₁ × 100%' },
  'Research & Development': { def: 'Spending on research and product development.', formula: 'R&D expense line from income statement' },
  'R&D Growth (YoY)': { def: 'Year-over-year change in R&D.', formula: '(R&Dₜ − R&Dₜ₋₁) / R&Dₜ₋₁ × 100%' },
  'Operating Expense': { def: 'Total operating costs including SG&A, R&D and related items.', formula: 'Sum of operating expense lines' },
  'Operating Expense Growth (YoY)': { def: 'Year-over-year change in operating expenses.', formula: '(OpExₜ − OpExₜ₋₁) / OpExₜ₋₁ × 100%' },
  'Operating Income': { def: 'Profit from operations before interest and taxes (EBIT-like).', formula: 'Gross Profit − Operating Expenses' },
  'Operating Income Growth (YoY)': { def: 'Year-over-year change in operating income.', formula: '(OIₜ − OIₜ₋₁) / OIₜ₋₁ × 100%' },
  'Interest & Investment Income': { def: 'Income from interest and investments (non-operating).', formula: 'Interest income + investment income lines' },
  'Interest & Inv. Income Growth (YoY)': { def: 'YoY change in interest and investment income.', formula: '(IIₜ − IIₜ₋₁) / IIₜ₋₁ × 100%' },
  'Earnings from Equity Investments': { def: 'Share of profits/losses from equity-method investees.', formula: 'Equity in earnings of affiliates' },
  'Equity Earnings Growth (YoY)': { def: 'YoY change in equity-method earnings.', formula: '(EEₜ − EEₜ₋₁) / EEₜ₋₁ × 100%' },
  'Currency Exchange Gain (Loss)': { def: 'Gains or losses from foreign-currency translation/transactions.', formula: 'FX gain/(loss) line' },
  'FX Gain/Loss Growth (YoY)': { def: 'YoY change in currency exchange gain/loss.', formula: '(FXₜ − FXₜ₋₁) / |FXₜ₋₁| × 100%' },
  'Gain/Loss on Sale of Investments': { def: 'Realized gains or losses from selling investments.', formula: 'Proceeds − carrying value of investments sold' },
  'Gain/Loss on Sale of Inv. Growth (YoY)': { def: 'YoY change in investment sale gains/losses.', formula: '(Gₜ − Gₜ₋₁) / |Gₜ₋₁| × 100%' },
  'Gain/Loss on Sale of Assets': { def: 'Gains or losses from disposing of operating assets.', formula: 'Sale proceeds − book value of assets' },
  'Gain/Loss on Sale of Assets Growth (YoY)': { def: 'YoY change in asset-sale gains/losses.', formula: '(Gₜ − Gₜ₋₁) / |Gₜ₋₁| × 100%' },
  'Income Tax Expense': { def: 'Income taxes recognized for the period.', formula: 'Current tax + Deferred tax' },
  'Net Income': { def: 'Bottom-line profit after all expenses and taxes.', formula: 'Income before tax − Income tax expense' },
  'Net Income to Common': { def: 'Net income available to common shareholders.', formula: 'Net Income − Preferred dividends' },
  'Net Income to Common Growth (YoY)': { def: 'YoY change in net income to common.', formula: '(NIₜ − NIₜ₋₁) / NIₜ₋₁ × 100%' },
  'Shares Outstanding (Basic)': { def: 'Weighted-average basic shares used for basic EPS.', formula: 'Time-weighted average shares outstanding' },
  'Shares Outstanding (Diluted)': { def: 'Diluted share count including convertibles/options.', formula: 'Basic shares + dilutive securities' },
  'EPS (Basic)': { def: 'Earnings per basic share.', formula: 'Net Income to Common / Basic shares' },
  'EPS (Diluted)': { def: 'Earnings per diluted share.', formula: 'Net Income to Common / Diluted shares' },
  'EPS Growth (YoY)': { def: 'Year-over-year change in diluted EPS (falls back to basic).', formula: '(EPSₜ − EPSₜ₋₁) / EPSₜ₋₁ × 100%' },
};

const IS_ALIASES = {
  Revenue: ['Total Revenue', 'Operating Revenue', 'Revenue'],
  'Cost of Revenue': ['Cost Of Revenue', 'Cost of Revenue', 'Reconciled Cost Of Revenue'],
  'Gross Profit': ['Gross Profit'],
  'Selling General & Admin': ['Selling General And Administration', 'Selling General Administrative', 'Selling And Marketing Expense'],
  'Research & Development': ['Research And Development', 'Research Development'],
  'Operating Expense': ['Operating Expense', 'Total Expenses', 'Operating Expenses'],
  'Operating Income': ['Operating Income', 'Operating Income Loss'],
  'Interest & Investment Income': ['Interest Income Non Operating', 'Net Non Operating Interest Income Expense', 'Interest Income', 'Investment Income Non Operating', 'Net Interest Income'],
  'Earnings from Equity Investments': ['Earnings From Equity Interest Net Of Tax', 'Earnings From Equity Interest', 'Net Income From Continuing Operation Net Minority Interest'],
  'Currency Exchange Gain (Loss)': ['Other Non Operating Income Expenses', 'Gain On Sale Of Security', 'Foreign Exchange Gains Losses'],
  'Gain/Loss on Sale of Investments': ['Gain On Sale Of Security', 'Gain Loss On Sale Of Investment'],
  'Gain/Loss on Sale of Assets': ['Gain On Sale Of Business', 'Gain On Sale Of Ppe', 'Gain Loss On Sale Of PPE'],
  'Income Tax Expense': ['Tax Provision', 'Income Tax Expense'],
  'Net Income': ['Net Income', 'Net Income Including Noncontrolling Interests'],
  'Net Income to Common': ['Net Income Common Stockholders', 'Net Income Continuous Operations'],
  'Shares Outstanding (Basic)': ['Basic Average Shares', 'Share Issued'],
  'Shares Outstanding (Diluted)': ['Diluted Average Shares'],
  'EPS (Basic)': ['Basic EPS'],
  'EPS (Diluted)': ['Diluted EPS'],
};

function isParseMatrix(records) {
  // Accept:
  //  A) records: [{Metric, '2024-09-30': val, ...}, ...]
  //  B) matrix object: { periods:[], items:[], matrix:{ item: { period: val } } }
  if (!records) return { periods: [], map: {} };

  // B) matrix dict from older API shape
  if (!Array.isArray(records) && typeof records === 'object') {
    if (records.matrix && (records.periods || records.items)) {
      const periods = (records.periods || []).map(String);
      const map = {};
      const matrix = records.matrix || {};
      Object.keys(matrix).forEach(item => {
        map[item] = {};
        periods.forEach(p => {
          const v = matrix[item] ? matrix[item][p] : null;
          map[item][p] = (v == null || v === '' || isNaN(Number(v))) ? null : Number(v);
        });
      });
      return { periods, map };
    }
    // single empty object
    return { periods: [], map: {} };
  }

  if (!records.length) return { periods: [], map: {} };
  // A) list of row objects — Metric or item / index field
  const metricKey = ['Metric', 'item', 'index', 'Index'].find(k => records[0][k] != null) || 'Metric';
  const dateCols = Object.keys(records[0]).filter(k => k !== metricKey && k !== 'index').sort();
  const map = {};
  records.forEach(r => {
    const m = String(r[metricKey] || r.Metric || r.item || '').trim();
    if (!m) return;
    map[m] = {};
    dateCols.forEach(c => {
      const v = r[c];
      map[m][c] = (v == null || v === '' || isNaN(Number(v))) ? null : Number(v);
    });
  });
  return { periods: dateCols, map };
}

function isLookup(map, aliases, period) {
  for (const a of aliases) {
    if (map[a] && map[a][period] != null) return map[a][period];
  }
  // fuzzy: case-insensitive contains
  const keys = Object.keys(map);
  for (const a of aliases) {
    const hit = keys.find(k => k.toLowerCase() === a.toLowerCase());
    if (hit && map[hit][period] != null) return map[hit][period];
  }
  return null;
}

/** Cap numeric display at 3 decimal places (Part 3 policy). */
function max3(n) {
  if (n == null || isNaN(Number(n))) return n;
  return Number(Number(n).toFixed(3));
}

function isYoY(curr, prev) {
  if (curr == null || prev == null || prev === 0) return null;
  return ((curr - prev) / Math.abs(prev)) * 100;
}

/** YoY % series for period columns ordered newest → oldest (2025, 2024, …).
 *  Growth in column i compares value[i] to the prior year value[i+1].
 *  Oldest column has no prior → null.
 */
function yoySeries(vals) {
  if (!vals || !vals.length) return [];
  return vals.map((v, i) => {
    if (i >= vals.length - 1) return null;
    return isYoY(v, vals[i + 1]);
  });
}

function isFmtMoney(v) {
  if (v == null || isNaN(v)) return '—';
  const n = Number(v);
  const sign = n < 0 ? '-' : '';
  const a = Math.abs(n);
  if (a >= 1e12) return sign + '$' + (a/1e12).toFixed(2) + 'T';
  if (a >= 1e9)  return sign + '$' + (a/1e9).toFixed(2) + 'B';
  if (a >= 1e6)  return sign + '$' + (a/1e6).toFixed(2) + 'M';
  if (a >= 1e3)  return sign + '$' + (a/1e3).toFixed(1) + 'K';
  return sign + '$' + a.toFixed(3);
}

function isFmtPct(v) {
  if (v == null || isNaN(v)) return '—';
  const n = Number(v);
  const cls = n > 0 ? 'pos' : n < 0 ? 'neg' : '';
  // max 3 decimal places
  return { text: (n > 0 ? '+' : '') + n.toFixed(3) + '%', cls };
}

function isFmtShares(v) {
  if (v == null || isNaN(v)) return '—';
  const n = Number(v);
  if (n >= 1e9) return (n/1e9).toFixed(2) + 'B';
  if (n >= 1e6) return (n/1e6).toFixed(2) + 'M';
  return n.toLocaleString(undefined, { maximumFractionDigits: 0 });
}

function isFmtEps(v) {
  if (v == null || isNaN(v)) return '—';
  return Number(v).toFixed(3);
}

function isPeriodLabel(col) {
  // '2024-09-30 00:00:00' or '2024-09-30'
  const s = String(col).slice(0, 10);
  return s;
}

function isYearFromCol(col) {
  const s = String(col);
  const m = s.match(/(20\d{2})/);
  return m ? parseInt(m[1], 10) : null;
}

function isFilterPeriods(periods, mode) {
  // Prefer calendar years 2021–2025 when annual; display newest year first (2025 → 2021)
  if (mode === 'annual') {
    const byYear = {};
    periods.forEach(p => {
      const y = isYearFromCol(p);
      if (y && y >= 2021 && y <= 2025) {
        if (!byYear[y] || String(p) > String(byYear[y])) byYear[y] = p;
      }
    });
    const years = Object.keys(byYear).map(Number).sort((a, b) => b - a); // newest first
    if (!years.length) {
      return periods.slice().sort((a, b) => String(b).localeCompare(String(a))).slice(0, 5);
    }
    return years.map(y => byYear[y]);
  }
  // quarterly: last 8 periods, newest first
  return periods.slice().sort((a, b) => String(b).localeCompare(String(a))).slice(0, 8);
}

function isBuildRows(map, periods) {
  const L = (key) => periods.map(p => isLookup(map, IS_ALIASES[key] || [key], p));
  const rev = L('Revenue');
  const cor = L('Cost of Revenue');
  const gp  = L('Gross Profit');
  const sga = L('Selling General & Admin');
  const rnd = L('Research & Development');
  const opex= L('Operating Expense');
  const oi  = L('Operating Income');
  const ii  = L('Interest & Investment Income');
  const ee  = L('Earnings from Equity Investments');
  const fx  = L('Currency Exchange Gain (Loss)');
  const gsi = L('Gain/Loss on Sale of Investments');
  const gsa = L('Gain/Loss on Sale of Assets');
  const tax = L('Income Tax Expense');
  const ni  = L('Net Income');
  const nic = L('Net Income to Common');
  const sb  = L('Shares Outstanding (Basic)');
  const sd  = L('Shares Outstanding (Diluted)');
  const eb  = L('EPS (Basic)');
  const ed  = L('EPS (Diluted)');

  function growthSeries(vals) {
    return yoySeries(vals);
  }

  const rows = [
    { label: 'Revenue', vals: rev, kind: 'money' },
    { label: 'Revenue Growth (YoY)', vals: growthSeries(rev), kind: 'pct', isGrowth: true },
    { label: 'Cost of Revenue', vals: cor, kind: 'money' },
    { label: 'Cost of Revenue Growth (YoY)', vals: growthSeries(cor), kind: 'pct', isGrowth: true },
    { label: 'Gross Profit', vals: gp, kind: 'money' },
    { label: 'Gross Profit Growth (YoY)', vals: growthSeries(gp), kind: 'pct', isGrowth: true },
    { label: 'Selling General & Admin', vals: sga, kind: 'money' },
    { label: 'SG&A Growth (YoY)', vals: growthSeries(sga), kind: 'pct', isGrowth: true },
    { label: 'Research & Development', vals: rnd, kind: 'money' },
    { label: 'R&D Growth (YoY)', vals: growthSeries(rnd), kind: 'pct', isGrowth: true },
    { label: 'Operating Expense', vals: opex, kind: 'money' },
    { label: 'Operating Expense Growth (YoY)', vals: growthSeries(opex), kind: 'pct', isGrowth: true },
    { label: 'Operating Income', vals: oi, kind: 'money' },
    { label: 'Operating Income Growth (YoY)', vals: growthSeries(oi), kind: 'pct', isGrowth: true },
    { label: 'Interest & Investment Income', vals: ii, kind: 'money' },
    { label: 'Interest & Inv. Income Growth (YoY)', vals: growthSeries(ii), kind: 'pct', isGrowth: true },
    { label: 'Earnings from Equity Investments', vals: ee, kind: 'money' },
    { label: 'Equity Earnings Growth (YoY)', vals: growthSeries(ee), kind: 'pct', isGrowth: true },
    { label: 'Currency Exchange Gain (Loss)', vals: fx, kind: 'money' },
    { label: 'FX Gain/Loss Growth (YoY)', vals: growthSeries(fx), kind: 'pct', isGrowth: true },
    { label: 'Gain/Loss on Sale of Investments', vals: gsi, kind: 'money' },
    { label: 'Gain/Loss on Sale of Inv. Growth (YoY)', vals: growthSeries(gsi), kind: 'pct', isGrowth: true },
    { label: 'Gain/Loss on Sale of Assets', vals: gsa, kind: 'money' },
    { label: 'Gain/Loss on Sale of Assets Growth (YoY)', vals: growthSeries(gsa), kind: 'pct', isGrowth: true },
    { label: 'Income Tax Expense', vals: tax, kind: 'money' },
    { label: 'Net Income', vals: ni, kind: 'money' },
    { label: 'Net Income Growth (YoY)', vals: growthSeries(ni), kind: 'pct', isGrowth: true },
    { label: 'Net Income to Common', vals: nic, kind: 'money' },
    { label: 'Net Income to Common Growth (YoY)', vals: growthSeries(nic), kind: 'pct', isGrowth: true },
    { label: 'Shares Outstanding (Basic)', vals: sb, kind: 'shares' },
    { label: 'Shares Outstanding (Diluted)', vals: sd, kind: 'shares' },
    { label: 'EPS (Basic)', vals: eb, kind: 'eps' },
    { label: 'EPS (Diluted)', vals: ed, kind: 'eps' },
    { label: 'EPS Growth (YoY)', vals: growthSeries(ed.map((v,i) => v != null ? v : eb[i])), kind: 'pct', isGrowth: true },
  ];
  return rows;
}

function isCell(val, kind) {
  if (kind === 'pct') {
    const p = isFmtPct(val);
    if (typeof p === 'string') return { text: p, cls: '' };
    return p;
  }
  if (kind === 'money') return { text: isFmtMoney(val), cls: val != null && val < 0 ? 'neg' : '' };
  if (kind === 'shares') return { text: isFmtShares(val), cls: '' };
  if (kind === 'eps') return { text: isFmtEps(val), cls: val != null && val < 0 ? 'neg' : '' };
  return { text: val == null ? '—' : String(val), cls: '' };
}

function finInsightFromVals(label, vals, kind) {
  const nums = (vals || []).filter(v => v != null && !isNaN(v));
  if (!nums.length) return 'No numeric values available in the selected periods for this line.';
  const last = nums[nums.length - 1];
  const first = nums[0];
  if (kind === 'pct') {
    const avg = nums.reduce((a,b)=>a+b,0) / nums.length;
    if (avg > 5) return `Growth has been positive on average (~${avg.toFixed(1)}% across shown periods), with the latest reading at ${last.toFixed(1)}%.`;
    if (avg < -5) return `Growth has been under pressure on average (~${avg.toFixed(1)}%), latest at ${last.toFixed(1)}%.`;
    return `Growth has been relatively modest (avg ~${avg.toFixed(1)}%); latest reading ${last.toFixed(1)}%.`;
  }
  if (kind === 'money' || kind === 'eps') {
    if (first != null && last != null && first !== 0) {
      const chg = ((last - first) / Math.abs(first)) * 100;
      if (chg > 15) return `Expanded about ${chg.toFixed(0)}% from the earliest to the latest column shown — a constructive trend for this line.`;
      if (chg < -15) return `Declined about ${Math.abs(chg).toFixed(0)}% across the window — watch margin and demand drivers.`;
      return `Relatively stable across the window (~${chg.toFixed(0)}% change from first to last period).`;
    }
  }
  return 'Review the period columns for level and direction; combine with peer and cash-flow context.';
}

function openFinDefPopup(label, tip, insight) {
  document.getElementById('finDefBackdrop')?.remove();
  const bd = document.createElement('div');
  bd.id = 'finDefBackdrop';
  bd.className = 'fin-def-backdrop';
  bd.innerHTML = `
    <div class="fin-def-panel" role="dialog" aria-modal="true">
      <div class="flex items-start justify-between gap-2 mb-1">
        <h4>${label}</h4>
        <button type="button" class="p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-800" data-close>&times;</button>
      </div>
      <p><strong>Definition.</strong> ${(tip && tip.def) || 'Financial statement line item.'}</p>
      <p><strong>Formula.</strong></p>
      <div class="formula">${(tip && tip.formula) || '—'}</div>
      <div class="insight"><strong>Insight.</strong> ${insight || ''}</div>
    </div>`;
  document.body.appendChild(bd);
  const close = () => bd.remove();
  bd.addEventListener('click', e => { if (e.target === bd || e.target.closest('[data-close]')) close(); });
}

// Close any open Series menus when clicking outside
document.addEventListener('click', (e) => {
  if (e.target.closest && (e.target.closest('.series-menu-panel') || e.target.closest('[id^="bsMenuBtn-"]') || e.target.closest('[id^="cfMenuBtn-"]'))) return;
  document.querySelectorAll('.series-menu-panel').forEach(m => m.classList.add('hidden'));
});
/* series-menu-panel-close */

function finBindTable(root, tipMap) {
  if (!root) return;
  root._finTipMap = tipMap || {};
  // Event delegation so re-renders and dynamic rows stay wired
  if (root._finBound) return;
  root._finBound = true;
  root.addEventListener('click', (e) => {
    const arrow = e.target.closest('button.grow-arrow');
    if (arrow && root.contains(arrow)) {
      e.preventDefault();
      e.stopPropagation();
      const id = arrow.getAttribute('data-grow-target');
      // Scope to the same table — multiple sections reuse g0/g1 ids
      const table = arrow.closest('table') || root;
      const row = table.querySelector('tr.fin-growth-row[data-grow-id="' + id + '"]');
      if (!row) return;
      const open = row.classList.toggle('open');
      arrow.textContent = open ? '▼' : '▶';
      arrow.setAttribute('aria-expanded', open ? 'true' : 'false');
      return;
    }
    const el = e.target.closest('.fin-label[data-fin-label]');
    if (!el || !root.contains(el)) return;
    const label = el.getAttribute('data-fin-label');
    const map = root._finTipMap || {};
    const tip = map[label] || { def: label, formula: '—' };
    let insight = el.dataset.insight || '';
    try {
      let vals = [];
      try { vals = JSON.parse(decodeURIComponent(el.dataset.vals || '%5B%5D')); } catch (_) { vals = []; }
      const kind = el.dataset.kind || 'money';
      insight = finInsightFromVals(label, vals, kind);
    } catch (_) {}
    openFinDefPopup(label, tip, insight);
  });
}

function isTipLabel(label) {
  // legacy no-op wrapper — tables use finRenderPairs
  return label;
}

/** Pair base rows with following growth rows; hide growth until expanded */
function finRenderPairs(rows, periods, tipMap) {
  const heads = periods.map(p => {
    const y = isYearFromCol(p);
    return y != null ? String(y) : isPeriodLabel(p).slice(0, 4);
  });
  const pairs = [];
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    if (r.isGrowth) continue;
    const growth = rows[i + 1] && rows[i + 1].isGrowth ? rows[i + 1] : null;
    pairs.push({ base: r, growth });
    if (growth) i++;
  }
  if (typeof window.__finGrowSeq !== 'number') window.__finGrowSeq = 0;
  const body = pairs.map(({ base, growth }) => {
    const id = 'g' + (window.__finGrowSeq++);
    const tip = tipMap[base.label];
    const cells = base.vals.map(v => {
      const c = isCell(v, base.kind);
      return `<td class="text-right ${c.cls}">${c.text}</td>`;
    }).join('');
    const arrow = growth
      ? `<button type="button" class="grow-arrow" data-grow-target="${id}" aria-expanded="false" title="Show YoY growth">▶</button>`
      : `<span class="grow-arrow-placeholder" aria-hidden="true"></span>`;
    const enc = (v) => encodeURIComponent(JSON.stringify(v));
    const labelBtn = `<button type="button" class="fin-label" data-fin-label="${base.label.replace(/"/g,'&quot;')}" data-kind="${base.kind}" data-vals="${enc(base.vals)}"><span>${base.label}</span></button>`;
    // Arrow is a SIBLING of the label button (not nested) so clicks expand YoY correctly
    let html = `<tr><td><div class="fin-line-cell">${arrow}${labelBtn}</div></td>${cells}</tr>`;
    if (growth) {
      const gcells = growth.vals.map(v => {
        const c = isCell(v, 'pct');
        return `<td class="text-right ${c.cls}">${c.text}</td>`;
      }).join('');
      const gLab = growth.label;
      const gBtn = `<button type="button" class="fin-label" data-fin-label="${gLab.replace(/"/g,'&quot;')}" data-kind="pct" data-vals="${enc(growth.vals)}"><span>${gLab}</span></button>`;
      html += `<tr class="fin-growth-row" data-grow-id="${id}"><td><div class="fin-line-cell"><span class="grow-arrow-placeholder" aria-hidden="true"></span>${gBtn}</div></td>${gcells}</tr>`;
    }
    return html;
  }).join('');
  return `<div class="fin-scroll"><table class="data-table is-table w-full">
    <thead><tr><th class="text-left">Line Item</th>${heads.map(h => `<th class="text-right">${h}</th>`).join('')}</tr></thead>
    <tbody>${body}</tbody>
  </table></div>`;
}

function isRenderTable(rows, periods) {
  return finRenderPairs(rows, periods, IS_TIPS);
}

function renderIncomeStatement(body, data) {
  let mode = 'annual'; // annual | quarterly
  let chartMode = 'annual';

  function getSource(m) {
    return m === 'quarterly' ? (data.quarterly_income || []) : (data.income_statement || []);
  }

  function paint() {
    const src = getSource(mode);
    const { periods: allP, map } = isParseMatrix(src);
    const periods = isFilterPeriods(allP, mode);
    const rows = isBuildRows(map, periods);

    // summary metrics for side table
    const summaryLabels = ['Revenue', 'Gross Profit', 'Operating Income', 'Net Income', 'EPS (Diluted)'];
    const summaryRows = rows.filter(r => summaryLabels.includes(r.label) || r.label === 'EPS (Basic)');
    // prefer diluted EPS; if all null use basic
    let epsRow = rows.find(r => r.label === 'EPS (Diluted)');
    if (epsRow && epsRow.vals.every(v => v == null)) epsRow = rows.find(r => r.label === 'EPS (Basic)');
    const sideRows = ['Revenue', 'Gross Profit', 'Operating Income', 'Net Income']
      .map(l => rows.find(r => r.label === l))
      .filter(Boolean);
    if (epsRow) sideRows.push({ ...epsRow, label: 'EPS' });

    body.innerHTML = `
      <div class="card p-4 mb-5">
        <div class="flex flex-wrap items-center justify-between gap-3 mb-4">
          <h3 class="text-sm font-semibold">Income Statement</h3>
          <div class="flex items-center gap-2">
            <label class="text-xs text-slate-500">Period</label>
            <select id="isMode" class="text-sm border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-1.5 bg-white dark:bg-slate-900">
              <option value="annual" ${mode==='annual'?'selected':''}>Annual</option>
              <option value="quarterly" ${mode==='quarterly'?'selected':''}>Quarterly</option>
            </select>
          </div>
        </div>
        ${periods.length ? isRenderTable(rows, periods) : '<p class="text-sm text-slate-400">No income statement data available for this symbol.</p>'}
        <p class="text-[11px] text-slate-400 mt-2">Click a line for definition, formula &amp; insight. Use ▶ to expand YoY growth. Values in USD (T/B/M).</p>
      </div>

      <div class="grid grid-cols-1 lg:grid-cols-5 gap-4 sm:gap-5 fin-stack">
        <div class="card p-3 sm:p-4 lg:col-span-3 min-w-0">
          <div class="flex flex-wrap items-center justify-between gap-2 mb-3">
            <h3 class="text-sm font-semibold">Revenue &amp; Profit</h3>
            <select id="isChartMode" class="text-xs border border-slate-200 dark:border-slate-700 rounded-lg px-2 py-1 bg-white dark:bg-slate-900">
              <option value="annual" ${chartMode==='annual'?'selected':''}>Annual</option>
              <option value="quarterly" ${chartMode==='quarterly'?'selected':''}>Quarterly</option>
            </select>
          </div>
          <div class="chart-container" style="height:260px"><canvas id="isRevChart"></canvas></div>
        </div>
        <div class="card p-3 sm:p-4 lg:col-span-2 min-w-0">
          <h3 class="text-sm font-semibold mb-3">Key Lines</h3>
          <div id="isSideTable"></div>
        </div>
      </div>
    `;

    finBindTable(body, IS_TIPS);

    document.getElementById('isMode').addEventListener('change', (e) => {
      mode = e.target.value;
      paint();
    });
    document.getElementById('isChartMode').addEventListener('change', (e) => {
      chartMode = e.target.value;
      drawChart();
      drawSide();
    });

    function chartData() {
      const srcC = getSource(chartMode);
      const parsed = isParseMatrix(srcC);
      const ps = isFilterPeriods(parsed.periods, chartMode);
      const r = isBuildRows(parsed.map, ps);
      const pick = (label) => (r.find(x => x.label === label) || {}).vals || [];
      return {
        labels: ps.map(p => { const y = isYearFromCol(p); return y != null ? String(y) : isPeriodLabel(p).slice(0,4); }),
        revenue: pick('Revenue'),
        gross: pick('Gross Profit'),
        operating: pick('Operating Income'),
        net: pick('Net Income'),
        periods: ps,
        rows: r,
      };
    }

    function drawChart() {
      const cd = chartData();
      const dark = document.documentElement.classList.contains('dark');
      if (charts.isRevChart) charts.isRevChart.destroy();
      const canvas = document.getElementById('isRevChart');
      if (!canvas) return;
      charts.isRevChart = new Chart(canvas, {
        type: 'bar',
        data: {
          labels: cd.labels,
          datasets: [
            { type: 'bar', label: 'Revenue', data: cd.revenue, backgroundColor: 'rgba(51,159,255,0.7)', borderRadius: 4, yAxisID: 'y' },
            { type: 'line', label: 'Gross Profit', data: cd.gross, borderColor: '#10b981', backgroundColor: 'transparent', tension: 0.2, yAxisID: 'y' },
            { type: 'line', label: 'Operating Income', data: cd.operating, borderColor: '#f59e0b', backgroundColor: 'transparent', tension: 0.2, yAxisID: 'y' },
            { type: 'line', label: 'Net Income', data: cd.net, borderColor: '#8b5cf6', backgroundColor: 'transparent', tension: 0.2, yAxisID: 'y' },
          ]
        },
        options: {
          responsive: true, maintainAspectRatio: false,
          plugins: {
            legend: { labels: { color: dark ? '#94a3b8' : '#64748b', boxWidth: 12, font: { size: 11 } } },
            tooltip: {
              callbacks: {
                label: (ctx) => ctx.dataset.label + ': ' + isFmtMoney(ctx.parsed.y)
              }
            }
          },
          scales: {
            x: { ticks: { color: dark ? '#94a3b8' : '#64748b', font: { size: 10 } }, grid: { display: false } },
            y: {
              ticks: {
                color: dark ? '#94a3b8' : '#64748b',
                callback: (v) => isFmtMoney(v)
              },
              grid: { color: dark ? 'rgba(148,163,184,0.1)' : 'rgba(100,116,139,0.12)' }
            }
          }
        }
      });
    }

    function drawSide() {
      const cd = chartData();
      const want = [
        { label: 'Revenue', kind: 'money' },
        { label: 'Gross Profit', kind: 'money' },
        { label: 'Operating Income', kind: 'money' },
        { label: 'Net Income', kind: 'money' },
        { label: 'EPS (Diluted)', kind: 'eps', fallback: 'EPS (Basic)' },
      ];
      const rows = want.map(w => {
        let row = cd.rows.find(r => r.label === w.label);
        if ((!row || row.vals.every(v => v == null)) && w.fallback) {
          row = cd.rows.find(r => r.label === w.fallback);
        }
        return { label: w.label === 'EPS (Diluted)' ? 'EPS' : w.label, vals: row ? row.vals : [], kind: w.kind };
      });
      const el = document.getElementById('isSideTable');
      if (!el) return;
      el.innerHTML = isRenderTable(rows, cd.periods);
      finBindTable(el, IS_TIPS);
    }

    drawChart();
    drawSide();
  }

  paint();
}



/* ==================== Balance Sheet (Assets / Liabilities / Equity) ==================== */
const BS_TIPS = {
  'Cash & Cash Equivalents': { def: 'Highly liquid assets available immediately (cash, bank deposits, short-term money-market instruments).', formula: 'Cash + Cash equivalents' },
  'Short-Term Investments': { def: 'Marketable securities expected to be converted to cash within a year.', formula: 'ST marketable securities / investments' },
  'Cash & Short-Term Investments': { def: 'Combined liquid resources from cash and short-term investments.', formula: 'Cash & equivalents + Short-term investments' },
  'Accounts Receivable': { def: 'Amounts customers owe for goods/services already delivered.', formula: 'Trade receivables (gross − allowances)' },
  'Other Receivables': { def: 'Non-trade amounts owed to the company (tax refunds, affiliates, etc.).', formula: 'Other receivables line' },
  'Receivables': { def: 'Total receivables including trade and other.', formula: 'Accounts receivable + Other receivables' },
  'Inventory': { def: 'Goods held for sale or in production.', formula: 'Raw materials + WIP + Finished goods' },
  'Other Current Assets': { def: 'Other assets expected to be realized within one year.', formula: 'Prepaid expenses and other current assets' },
  'Total Current Assets': { def: 'Sum of all assets expected to convert to cash within one year.', formula: 'Cash + ST investments + Receivables + Inventory + Other CA' },
  'Property, Plant & Equipment (PPE)': { def: 'Tangible long-term operating assets net of depreciation.', formula: 'Gross PPE − Accumulated depreciation' },
  'Long-Term Investments': { def: 'Investments not intended to be sold within one year.', formula: 'LT equity/debt securities + affiliates' },
  'Other Intangible Assets': { def: 'Non-physical assets such as patents, trademarks, goodwill (as reported).', formula: 'Goodwill + Other intangibles' },
  'Long-Term Deferred Tax Assets': { def: 'Future tax benefits recognized as non-current assets.', formula: 'Deferred tax assets (non-current)' },
  'Other Long-Term Assets': { def: 'Other non-current assets not classified elsewhere.', formula: 'Other non-current assets line' },
  'Total Assets': { def: 'Sum of all current and non-current assets.', formula: 'Total current assets + Total non-current assets' },
  'Accounts Payable': { def: 'Amounts owed to suppliers for goods/services received.', formula: 'Trade payables' },
  'Current Portion of Leases': { def: 'Lease liabilities due within one year.', formula: 'Current capital / finance lease obligation' },
  'Other Current Liabilities': { def: 'Other obligations due within one year.', formula: 'Accrued expenses + other current liabilities' },
  'Total Current Liabilities': { def: 'Sum of obligations due within one year.', formula: 'AP + ST debt + Current leases + Other CL' },
  'Long-Term Leases': { def: 'Lease liabilities due after one year.', formula: 'Long-term capital / finance lease obligation' },
  'Other Long-Term Liabilities': { def: 'Other non-current obligations.', formula: 'LT debt, deferred items, other LT liabilities' },
  'Total Long-Term Liabilities': { def: 'Sum of non-current liabilities.', formula: 'LT debt + LT leases + Other LT liabilities' },
  'Total Liabilities': { def: 'Sum of current and long-term liabilities.', formula: 'Total current liabilities + Total LT liabilities' },
  'Common Stock': { def: 'Par or stated value of issued common shares.', formula: 'Common stock at par / stated value' },
  'Additional Paid-In Capital': { def: 'Capital received from shareholders above par value.', formula: 'Share premium / APIC' },
  'Accumulated Other Comprehensive Income': { def: 'Cumulative OCI items (FX, pensions, securities) not in net income.', formula: 'AOCI balance' },
  'Retained Earnings': { def: 'Cumulative profits retained in the business after dividends.', formula: 'Prior RE + Net income − Dividends' },
  "Shareholders' Equity": { def: 'Residual interest in assets after deducting liabilities.', formula: 'Total assets − Total liabilities' },
  'Total Liabilities & Equity': { def: 'Balance-sheet identity check: liabilities plus equity equals assets.', formula: 'Total liabilities + Shareholders’ equity' },
};

const BS_ALIASES = {
  'Cash & Cash Equivalents': ['Cash And Cash Equivalents', 'Cash Cash Equivalents And Short Term Investments', 'Cash Financial'],
  'Short-Term Investments': ['Other Short Term Investments', 'Available For Sale Securities Current', 'Trading Securities'],
  'Cash & Short-Term Investments': ['Cash Cash Equivalents And Short Term Investments'],
  'Accounts Receivable': ['Accounts Receivable', 'Receivables'],
  'Other Receivables': ['Other Receivables'],
  'Receivables': ['Receivables', 'Accounts Receivable'],
  'Inventory': ['Inventory'],
  'Other Current Assets': ['Other Current Assets', 'Prepaid Assets'],
  'Total Current Assets': ['Current Assets'],
  'Property, Plant & Equipment (PPE)': ['Net PPE', 'Gross PPE', 'Properties'],
  'Long-Term Investments': ['Investments And Advances', 'Investmentin Financial Assets', 'Long Term Equity Investment'],
  'Other Intangible Assets': ['Goodwill And Other Intangible Assets', 'Other Intangible Assets', 'Goodwill'],
  'Long-Term Deferred Tax Assets': ['Non Current Deferred Assets', 'Deferred Tax Assets'],
  'Other Long-Term Assets': ['Other Non Current Assets'],
  'Total Assets': ['Total Assets'],
  'Accounts Payable': ['Accounts Payable', 'Payables'],
  'Current Portion of Leases': ['Current Capital Lease Obligation', 'Current Debt And Capital Lease Obligation'],
  'Other Current Liabilities': ['Other Current Liabilities', 'Current Deferred Liabilities', 'Current Accrued Expenses'],
  'Total Current Liabilities': ['Current Liabilities'],
  'Long-Term Leases': ['Long Term Capital Lease Obligation', 'Long Term Debt And Capital Lease Obligation'],
  'Other Long-Term Liabilities': ['Other Non Current Liabilities', 'Long Term Deferred Liabilities', 'Non Current Deferred Liabilities'],
  'Total Long-Term Liabilities': ['Total Non Current Liabilities Net Minority Interest', 'Total Non Current Liabilities'],
  'Total Liabilities': ['Total Liabilities Net Minority Interest', 'Total Liabilities'],
  'Common Stock': ['Common Stock'],
  'Additional Paid-In Capital': ['Additional Paid In Capital', 'Capital Stock'],
  'Accumulated Other Comprehensive Income': ['Gains Losses Not Affecting Retained Earnings', 'Other Equity Interest'],
  'Retained Earnings': ['Retained Earnings'],
  "Shareholders' Equity": ['Stockholders Equity', 'Total Equity Gross Minority Interest', 'Common Stock Equity'],
  'Total Liabilities & Equity': ['Total Liabilities Net Minority Interest', 'Total Capitalization', 'Total Assets'],
};

const BS_SECTIONS = [
  {
    id: 'assets',
    title: 'Assets',
    lines: [
      'Cash & Cash Equivalents', 'Short-Term Investments', 'Cash & Short-Term Investments',
      'Accounts Receivable', 'Other Receivables', 'Receivables', 'Inventory',
      'Other Current Assets', 'Total Current Assets',
      'Property, Plant & Equipment (PPE)', 'Long-Term Investments', 'Other Intangible Assets',
      'Long-Term Deferred Tax Assets', 'Other Long-Term Assets', 'Total Assets',
    ],
    chartDefaults: ['Cash & Cash Equivalents', 'Total Current Assets', 'Total Assets'],
  },
  {
    id: 'liab',
    title: 'Liabilities',
    lines: [
      'Accounts Payable', 'Current Portion of Leases', 'Other Current Liabilities',
      'Total Current Liabilities', 'Long-Term Leases', 'Other Long-Term Liabilities',
      'Total Long-Term Liabilities', 'Total Liabilities',
    ],
    chartDefaults: ['Total Current Liabilities', 'Total Long-Term Liabilities', 'Total Liabilities'],
  },
  {
    id: 'equity',
    title: "Shareholders' Equity",
    lines: [
      'Common Stock', 'Additional Paid-In Capital', 'Accumulated Other Comprehensive Income',
      'Retained Earnings', "Shareholders' Equity", 'Total Liabilities & Equity',
    ],
    chartDefaults: ['Retained Earnings', "Shareholders' Equity"],
  },
];

const BS_COLORS = ['#339fff','#10b981','#f59e0b','#8b5cf6','#ef4444','#06b6d4','#ec4899','#84cc16','#f97316','#6366f1','#14b8a6','#a855f7'];

function bsTipLabel(label) {
  const tip = BS_TIPS[label];
  if (!tip) return label;
  return `<span class="fin-tip">${label}<span class="tip-box"><strong>${label}</strong><br>${tip.def}<br><em>Formula:</em> ${tip.formula}</span></span>`;
}

function bsGrowthTip(label) {
  const g = label + ' Growth (YoY)';
  return `<span class="fin-tip">${g}<span class="tip-box"><strong>${g}</strong><br>Year-over-year percentage change in ${label}.<br><em>Formula:</em> (Valueₜ − Valueₜ₋₁) / |Valueₜ₋₁| × 100%</span></span>`;
}

function bsBuildSectionRows(map, periods, lines) {
  const rows = [];
  lines.forEach(label => {
    const aliases = BS_ALIASES[label] || [label];
    const vals = periods.map(p => isLookup(map, aliases, p));
    rows.push({ label, vals, kind: 'money', isGrowth: false });
    const growth = yoySeries(vals);
    rows.push({ label: label + ' Growth (YoY)', baseLabel: label, vals: growth, kind: 'pct', isGrowth: true });
  });
  return rows;
}

function bsRenderTable(rows, periods) {
  const tips = typeof BS_TIPS !== 'undefined' ? BS_TIPS : {};
  // merge growth tips into map for growth labels
  const map = { ...tips };
  rows.forEach(r => {
    if (r.isGrowth && r.baseLabel) {
      map[r.label] = { def: 'Year-over-year percentage change in ' + r.baseLabel + '.', formula: '(Valueₜ − Valueₜ₋₁) / |Valueₜ₋₁| × 100%' };
    }
  });
  return finRenderPairs(rows, periods, map);
}

function bsSeriesMenu(sectionId, lines, selected) {
  return `<div class="relative inline-block" id="bsMenuWrap-${sectionId}">
    <button type="button" class="text-xs border border-slate-200 dark:border-slate-700 rounded-lg px-2 py-1 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800"
      id="bsMenuBtn-${sectionId}">Series ▾</button>
    <div id="bsMenu-${sectionId}" class="series-menu-panel hidden absolute right-0 mt-1 z-50 w-64 max-h-56 overflow-y-auto rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-xl p-2">
      ${lines.map((l, i) => `
        <label class="flex items-center gap-2 px-1 py-1 text-[11px] hover:bg-slate-50 dark:hover:bg-slate-800 rounded cursor-pointer">
          <input type="checkbox" class="bs-series-cb" data-section="${sectionId}" value="${l.replace(/"/g, '&quot;')}"
            ${selected.has(l) ? 'checked' : ''} />
          <span class="inline-block w-2 h-2 rounded-full" style="background:${BS_COLORS[i % BS_COLORS.length]}"></span>
          <span>${l}</span>
        </label>
      `).join('')}
    </div>
  </div>`;
}

function renderBalanceSheet(body, data) {
  let mode = 'annual';
  // selected series per section
  const selected = {};
  BS_SECTIONS.forEach(s => { selected[s.id] = new Set(s.chartDefaults); });

  function getSource(m) {
    return m === 'quarterly' ? (data.quarterly_balance || []) : (data.balance_sheet || []);
  }

  function paint() {
    const src = getSource(mode);
    const { periods: allP, map } = isParseMatrix(src);
    const periods = isFilterPeriods(allP, mode);

    body.innerHTML = `
      <div class="flex flex-wrap items-center justify-between gap-3 mb-4">
        <h3 class="text-sm font-semibold">Balance Sheet</h3>
        <div class="flex items-center gap-2">
          <label class="text-xs text-slate-500">Period</label>
          <select id="bsMode" class="text-sm border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-1.5 bg-white dark:bg-slate-900">
            <option value="annual" ${mode==='annual'?'selected':''}>Annual</option>
            <option value="quarterly" ${mode==='quarterly'?'selected':''}>Quarterly</option>
          </select>
        </div>
      </div>
      <p class="text-[11px] text-slate-400 mb-4">Hover any line for definition &amp; formula. Growth rows are YoY %. Positive growth in green, negative in red. Values in USD (T/B/M).</p>
      <div id="bsSections" class="space-y-6"></div>
    `;

    document.getElementById('bsMode').addEventListener('change', (e) => {
      mode = e.target.value;
      paint();
    });

    const container = document.getElementById('bsSections');
    if (!periods.length) {
      container.innerHTML = '<div class="card p-6 text-sm text-slate-400">No balance sheet data available for this symbol.</div>';
      return;
    }

    BS_SECTIONS.forEach((sec, secIdx) => {
      const rows = bsBuildSectionRows(map, periods, sec.lines);
      const wrap = document.createElement('div');
      wrap.className = 'card p-4';
      wrap.innerHTML = `
        <div class="flex flex-wrap items-center justify-between gap-2 mb-3">
          <h4 class="text-sm font-bold">${sec.title}</h4>
          ${bsSeriesMenu(sec.id, sec.lines, selected[sec.id])}
        </div>
        <div class="grid lg:grid-cols-5 gap-4">
          <div class="lg:col-span-3 min-w-0">${bsRenderTable(rows, periods)}</div>
          <div class="lg:col-span-2">
            <div class="chart-container" style="height:260px"><canvas id="bsChart-${sec.id}"></canvas></div>
          </div>
        </div>
      `;
      container.appendChild(wrap);

      // menu toggle (stop document handler from closing in same tick)
      const btn = wrap.querySelector('#bsMenuBtn-' + sec.id);
      const menu = wrap.querySelector('#bsMenu-' + sec.id);
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        // close other open series menus
        document.querySelectorAll('.series-menu-panel').forEach(m => {
          if (m !== menu) m.classList.add('hidden');
        });
        menu.classList.toggle('hidden');
      });
      menu.addEventListener('click', (e) => e.stopPropagation());

      menu.querySelectorAll('.bs-series-cb').forEach(cb => {
        cb.addEventListener('change', () => {
          if (cb.checked) selected[sec.id].add(cb.value);
          else selected[sec.id].delete(cb.value);
          drawBsChart(sec, map, periods);
        });
      });

      drawBsChart(sec, map, periods);
    });
    finBindTable(body, BS_TIPS);
  }

  function drawBsChart(sec, map, periods) {
    const canvas = document.getElementById('bsChart-' + sec.id);
    if (!canvas) return;
    const dark = document.documentElement.classList.contains('dark');
    const labels = periods.map(isPeriodLabel);
    const seriesNames = [...selected[sec.id]];
    const datasets = seriesNames.map((name, i) => {
      const aliases = BS_ALIASES[name] || [name];
      const dataPts = periods.map(p => isLookup(map, aliases, p));
      const color = BS_COLORS[sec.lines.indexOf(name) % BS_COLORS.length] || BS_COLORS[i % BS_COLORS.length];
      return {
        label: name,
        data: dataPts,
        borderColor: color,
        backgroundColor: color + '33',
        tension: 0.2,
        borderWidth: 2,
        pointRadius: 2,
        fill: false,
      };
    });

    const chartKey = 'bsChart_' + sec.id;
    if (charts[chartKey]) charts[chartKey].destroy();
    charts[chartKey] = new Chart(canvas, {
      type: 'line',
      data: { labels, datasets },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { labels: { color: dark ? '#94a3b8' : '#64748b', boxWidth: 10, font: { size: 10 } } },
          tooltip: {
            callbacks: {
              label: (ctx) => ctx.dataset.label + ': ' + isFmtMoney(ctx.parsed.y)
            }
          }
        },
        scales: {
          x: { ticks: { color: dark ? '#94a3b8' : '#64748b', font: { size: 9 }, maxRotation: 0 }, grid: { display: false } },
          y: {
            ticks: {
              color: dark ? '#94a3b8' : '#64748b',
              callback: (v) => isFmtMoney(v),
              font: { size: 9 }
            },
            grid: { color: dark ? 'rgba(148,163,184,0.1)' : 'rgba(100,116,139,0.12)' }
          }
        }
      }
    });
  }

  paint();
}



/* ==================== Cash Flow Statement ==================== */
const CF_TIPS = {
  'Net Income': { def: 'Starting point of the operating section — accounting profit for the period.', formula: 'Net income from the income statement' },
  'Depreciation & Amortization': { def: 'Non-cash charges for wearing out tangible and intangible assets.', formula: 'Depreciation + Amortization' },
  'Stock-Based Compensation': { def: 'Non-cash expense from employee equity awards.', formula: 'SBC expense added back to net income' },
  'Other Adjustments': { def: 'Other non-cash items and adjustments reconciling net income to cash.', formula: 'Various non-cash adjustments' },
  'Change in Receivables': { def: 'Cash impact of changes in amounts owed by customers. Increase in AR reduces cash.', formula: '−Δ Accounts receivable' },
  'Change in Inventory': { def: 'Cash impact of inventory changes. Inventory build uses cash.', formula: '−Δ Inventory' },
  'Change in Accounts Payable': { def: 'Cash impact of payables. Higher payables free up cash.', formula: '+Δ Accounts payable' },
  'Change in Income Taxes': { def: 'Cash impact of changes in tax payables/receivables or taxes paid.', formula: 'Δ Tax balances / taxes paid' },
  'Change in Unearned Revenue': { def: 'Cash from deferred/unearned revenue balances.', formula: '+Δ Unearned / deferred revenue' },
  'Change in Other Operating Activities': { def: 'Other working-capital and operating cash changes.', formula: 'Other operating WC changes' },
  'Operating Cash Flow': { def: 'Cash generated (or used) by core operations.', formula: 'Net income + non-cash items + Δ working capital' },
  'Capital Expenditures': { def: 'Cash spent on property, plant and equipment.', formula: 'Purchases of PPE (usually negative)' },
  'Purchases of Intangible Assets': { def: 'Cash spent acquiring intangible assets.', formula: 'Purchase of intangibles' },
  'Purchase of Investments': { def: 'Cash used to buy investment securities.', formula: 'Purchases of marketable securities / investments' },
  'Proceeds from Sale of Investments': { def: 'Cash received from selling investments.', formula: 'Sales / maturities of investments' },
  'Other Investing Activities': { def: 'Other investing inflows and outflows.', formula: 'Net other investing items' },
  'Investing Cash Flow': { def: 'Net cash from investing activities.', formula: 'CapEx + acquisitions + investment purchases/sales + other' },
  'Issuance of Common Stock': { def: 'Cash raised by issuing common shares.', formula: 'Proceeds from share issuance' },
  'Purchases of Common Stock': { def: 'Cash used to repurchase common shares.', formula: 'Share buybacks (usually negative)' },
  'Net Common Stock Issued': { def: 'Net cash from issuing minus repurchasing common stock.', formula: 'Issuance − Repurchases' },
  'Other Financing Activities': { def: 'Debt draws/repayments, dividends, and other financing items as reported.', formula: 'Net other financing cash flows' },
  'Financing Cash Flow': { def: 'Net cash from financing activities.', formula: 'Equity + debt + dividends + other financing' },
  'Net Cash Flow': { def: 'Overall change in cash for the period.', formula: 'Operating CF + Investing CF + Financing CF' },
  'Free Cash Flow': { def: 'Cash available after maintaining productive capacity.', formula: 'Operating Cash Flow − Capital Expenditures' },
};

const CF_ALIASES = {
  'Net Income': ['Net Income From Continuing Operations', 'Net Income', 'Cash FlowsFrom Used In Operating Activities Direct'],
  'Depreciation & Amortization': ['Depreciation And Amortization', 'Depreciation', 'Depreciation Amortization Depletion'],
  'Stock-Based Compensation': ['Stock Based Compensation', 'Share Based Compensation'],
  'Other Adjustments': ['Other Non Cash Items', 'Deferred Income Tax', 'Asset Impairment Charge', 'Amortization Of Securities'],
  'Change in Receivables': ['Changes In Account Receivables', 'Change In Receivables'],
  'Change in Inventory': ['Change In Inventory', 'Changes In Inventories'],
  'Change in Accounts Payable': ['Change In Payable', 'Change In Account Payable', 'Changes In Account Payable'],
  'Change in Income Taxes': ['Change In Tax Payable', 'Income Tax Paid Supplemental Data', 'Taxes Refund Paid'],
  'Change in Unearned Revenue': ['Change In Payables And Accrued Expense', 'Change In Other Current Liabilities'],
  'Change in Other Operating Activities': ['Change In Working Capital', 'Change In Other Working Capital', 'Other Working Capital'],
  'Operating Cash Flow': ['Operating Cash Flow', 'Cash Flow From Continuing Operating Activities'],
  'Capital Expenditures': ['Capital Expenditure', 'Purchase Of PPE', 'Net PPE Purchase And Sale'],
  'Purchases of Intangible Assets': ['Purchase Of Intangibles', 'Purchase Of Business', 'Net Business Purchase And Sale'],
  'Purchase of Investments': ['Purchase Of Investment', 'Purchase Of Securities'],
  'Proceeds from Sale of Investments': ['Sale Of Investment', 'Net Investment Purchase And Sale'],
  'Other Investing Activities': ['Net Other Investing Changes', 'Investing Cash Flow'],
  'Investing Cash Flow': ['Investing Cash Flow', 'Cash Flow From Continuing Investing Activities'],
  'Issuance of Common Stock': ['Common Stock Issuance', 'Proceeds From Stock Option Exercised', 'Issuance Of Capital Stock'],
  'Purchases of Common Stock': ['Common Stock Payments', 'Repurchase Of Capital Stock', 'Purchase Of Business'],
  'Net Common Stock Issued': ['Net Common Stock Issuance', 'Net Issuance Payments Of Common Stock'],
  'Other Financing Activities': ['Net Other Financing Charges', 'Cash Dividends Paid', 'Long Term Debt Payments', 'Long Term Debt Issuance', 'Net Issuance Payments Of Debt'],
  'Financing Cash Flow': ['Financing Cash Flow', 'Cash Flow From Continuing Financing Activities'],
  'Net Cash Flow': ['Changes In Cash', 'Beginning Cash Position', 'End Cash Position', 'Effect Of Exchange Rate Changes'],
  'Free Cash Flow': ['Free Cash Flow'],
};

const CF_SECTIONS = [
  {
    id: 'ops',
    title: 'Operating Activities',
    lines: [
      'Net Income', 'Depreciation & Amortization', 'Stock-Based Compensation', 'Other Adjustments',
      'Change in Receivables', 'Change in Inventory', 'Change in Accounts Payable',
      'Change in Income Taxes', 'Change in Unearned Revenue', 'Change in Other Operating Activities',
      'Operating Cash Flow',
    ],
    chartDefaults: ['Net Income', 'Operating Cash Flow'],
  },
  {
    id: 'inv',
    title: 'Investing Activities',
    lines: [
      'Capital Expenditures', 'Purchases of Intangible Assets', 'Purchase of Investments',
      'Proceeds from Sale of Investments', 'Other Investing Activities', 'Investing Cash Flow',
    ],
    chartDefaults: ['Capital Expenditures', 'Investing Cash Flow'],
  },
  {
    id: 'fin',
    title: 'Financing Activities',
    lines: [
      'Issuance of Common Stock', 'Purchases of Common Stock', 'Net Common Stock Issued',
      'Other Financing Activities', 'Financing Cash Flow',
    ],
    chartDefaults: ['Financing Cash Flow', 'Net Common Stock Issued'],
  },
  {
    id: 'net',
    title: 'Net Cash Flow & Free Cash Flow',
    lines: ['Net Cash Flow', 'Free Cash Flow'],
    chartDefaults: ['Net Cash Flow', 'Free Cash Flow'],
  },
];

function cfTipLabel(label) {
  const tip = CF_TIPS[label];
  if (!tip) return label;
  return `<span class="fin-tip">${label}<span class="tip-box"><strong>${label}</strong><br>${tip.def}<br><em>Formula:</em> ${tip.formula}</span></span>`;
}

function cfGrowthTip(label) {
  const g = label + ' Growth (YoY)';
  return `<span class="fin-tip">${g}<span class="tip-box"><strong>${g}</strong><br>Year-over-year percentage change in ${label}.<br><em>Formula:</em> (Valueₜ − Valueₜ₋₁) / |Valueₜ₋₁| × 100%</span></span>`;
}

function cfDerived(map, periods) {
  // Compute Free Cash Flow and Net Cash Flow if missing
  const ocf = periods.map(p => isLookup(map, CF_ALIASES['Operating Cash Flow'], p));
  const capex = periods.map(p => isLookup(map, CF_ALIASES['Capital Expenditures'], p));
  const icf = periods.map(p => isLookup(map, CF_ALIASES['Investing Cash Flow'], p));
  const fcfFin = periods.map(p => isLookup(map, CF_ALIASES['Financing Cash Flow'], p));

  // FCF = OCF - CapEx (CapEx often negative already; use OCF + CapEx if CapEx < 0, else OCF - CapEx)
  if (!map['Free Cash Flow']) map['Free Cash Flow'] = {};
  periods.forEach((p, i) => {
    if (map['Free Cash Flow'][p] != null) return;
    const o = ocf[i], c = capex[i];
    if (o == null || c == null) return;
    map['Free Cash Flow'][p] = c < 0 ? o + c : o - Math.abs(c);
  });

  // Net cash flow ≈ OCF + ICF + FCF_financing
  if (!map['Changes In Cash']) map['Changes In Cash'] = {};
  // expose under a synthetic key used by alias Net Cash Flow via Changes In Cash already in aliases
  periods.forEach((p, i) => {
    const existing = isLookup(map, CF_ALIASES['Net Cash Flow'], p);
    if (existing != null) return;
    const o = ocf[i], inv = icf[i], fin = fcfFin[i];
    if (o == null && inv == null && fin == null) return;
    map['Changes In Cash'][p] = (o || 0) + (inv || 0) + (fin || 0);
  });
  return map;
}

function cfBuildRows(map, periods, lines) {
  const rows = [];
  lines.forEach(label => {
    const aliases = CF_ALIASES[label] || [label];
    const vals = periods.map(p => isLookup(map, aliases, p));
    rows.push({ label, vals, kind: 'money', isGrowth: false });
    const growth = yoySeries(vals);
    rows.push({ label: label + ' Growth (YoY)', baseLabel: label, vals: growth, kind: 'pct', isGrowth: true });
  });
  return rows;
}

function cfRenderTable(rows, periods) {
  const tips = typeof CF_TIPS !== 'undefined' ? CF_TIPS : {};
  const map = { ...tips };
  rows.forEach(r => {
    if (r.isGrowth && r.baseLabel) {
      map[r.label] = { def: 'Year-over-year percentage change in ' + r.baseLabel + '.', formula: '(Valueₜ − Valueₜ₋₁) / |Valueₜ₋₁| × 100%' };
    }
  });
  return finRenderPairs(rows, periods, map);
}

function cfSeriesMenu(sectionId, lines, selected) {
  return `<div class="relative inline-block">
    <button type="button" class="text-xs border border-slate-200 dark:border-slate-700 rounded-lg px-2 py-1 bg-white dark:bg-slate-900"
      id="cfMenuBtn-${sectionId}">Series ▾</button>
    <div id="cfMenu-${sectionId}" class="series-menu-panel hidden absolute right-0 mt-1 z-50 w-64 max-h-56 overflow-y-auto rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-xl p-2">
      ${lines.map((l, i) => `
        <label class="flex items-center gap-2 px-1 py-1 text-[11px] hover:bg-slate-50 dark:hover:bg-slate-800 rounded cursor-pointer">
          <input type="checkbox" class="cf-series-cb" data-section="${sectionId}" value="${l.replace(/"/g, '&quot;')}"
            ${selected.has(l) ? 'checked' : ''} />
          <span class="inline-block w-2 h-2 rounded-full" style="background:${BS_COLORS[i % BS_COLORS.length]}"></span>
          <span>${l}</span>
        </label>
      `).join('')}
    </div>
  </div>`;
}

function renderCashFlow(body, data) {
  let mode = 'annual';
  const selected = {};
  CF_SECTIONS.forEach(s => { selected[s.id] = new Set(s.chartDefaults); });

  function getSource(m) {
    return m === 'quarterly' ? (data.quarterly_cashflow || []) : (data.cashflow || []);
  }

  function paint() {
    const src = getSource(mode);
    let { periods: allP, map } = isParseMatrix(src);
    const periods = isFilterPeriods(allP, mode);
    map = cfDerived(map, periods);

    body.innerHTML = `
      <div class="flex flex-wrap items-center justify-between gap-3 mb-4">
        <h3 class="text-sm font-semibold">Cash Flow Statement</h3>
        <div class="flex items-center gap-2">
          <label class="text-xs text-slate-500">Period</label>
          <select id="cfMode" class="text-sm border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-1.5 bg-white dark:bg-slate-900">
            <option value="annual" ${mode==='annual'?'selected':''}>Annual</option>
            <option value="quarterly" ${mode==='quarterly'?'selected':''}>Quarterly</option>
          </select>
        </div>
      </div>
      <p class="text-[11px] text-slate-400 mb-4">Hover any line for definition &amp; formula. Growth is YoY %. Positive in green, negative in red. Values in USD (T/B/M).</p>
      <div id="cfSections" class="space-y-6"></div>
    `;

    document.getElementById('cfMode').addEventListener('change', (e) => {
      mode = e.target.value;
      paint();
    });

    const container = document.getElementById('cfSections');
    if (!periods.length) {
      container.innerHTML = '<div class="card p-6 text-sm text-slate-400">No cash flow data available for this symbol.</div>';
      return;
    }

    CF_SECTIONS.forEach(sec => {
      const rows = cfBuildRows(map, periods, sec.lines);
      const wrap = document.createElement('div');
      wrap.className = 'card p-4';
      wrap.innerHTML = `
        <div class="flex flex-wrap items-center justify-between gap-2 mb-3">
          <h4 class="text-sm font-bold">${sec.title}</h4>
          ${cfSeriesMenu(sec.id, sec.lines, selected[sec.id])}
        </div>
        <div class="grid lg:grid-cols-5 gap-4">
          <div class="lg:col-span-3">${cfRenderTable(rows, periods)}</div>
          <div class="lg:col-span-2">
            <div class="chart-container" style="height:260px"><canvas id="cfChart-${sec.id}"></canvas></div>
          </div>
        </div>
      `;
      container.appendChild(wrap);

      const btn = wrap.querySelector('#cfMenuBtn-' + sec.id);
      const menu = wrap.querySelector('#cfMenu-' + sec.id);
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        document.querySelectorAll('.series-menu-panel').forEach(m => {
          if (m !== menu) m.classList.add('hidden');
        });
        menu.classList.toggle('hidden');
      });
      menu.addEventListener('click', (e) => e.stopPropagation());
      menu.querySelectorAll('.cf-series-cb').forEach(cb => {
        cb.addEventListener('change', () => {
          if (cb.checked) selected[sec.id].add(cb.value);
          else selected[sec.id].delete(cb.value);
          drawCfChart(sec, map, periods);
        });
      });
      drawCfChart(sec, map, periods);
    });
    finBindTable(body, CF_TIPS);
  }

  function drawCfChart(sec, map, periods) {
    const canvas = document.getElementById('cfChart-' + sec.id);
    if (!canvas) return;
    const dark = document.documentElement.classList.contains('dark');
    const labels = periods.map(isPeriodLabel);
    const seriesNames = [...selected[sec.id]];
    const datasets = seriesNames.map((name, i) => {
      const aliases = CF_ALIASES[name] || [name];
      const dataPts = periods.map(p => isLookup(map, aliases, p));
      const color = BS_COLORS[sec.lines.indexOf(name) % BS_COLORS.length] || BS_COLORS[i % BS_COLORS.length];
      return {
        label: name,
        data: dataPts,
        borderColor: color,
        backgroundColor: color + '33',
        tension: 0.2,
        borderWidth: 2,
        pointRadius: 2,
        fill: false,
      };
    });
    const chartKey = 'cfChart_' + sec.id;
    if (charts[chartKey]) charts[chartKey].destroy();
    charts[chartKey] = new Chart(canvas, {
      type: 'line',
      data: { labels, datasets },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { labels: { color: dark ? '#94a3b8' : '#64748b', boxWidth: 10, font: { size: 10 } } },
          tooltip: { callbacks: { label: (ctx) => ctx.dataset.label + ': ' + isFmtMoney(ctx.parsed.y) } }
        },
        scales: {
          x: { ticks: { color: dark ? '#94a3b8' : '#64748b', font: { size: 9 } }, grid: { display: false } },
          y: {
            ticks: { color: dark ? '#94a3b8' : '#64748b', callback: (v) => isFmtMoney(v), font: { size: 9 } },
            grid: { color: dark ? 'rgba(148,163,184,0.1)' : 'rgba(100,116,139,0.12)' }
          }
        }
      }
    });
  }

  paint();
}



/* ==================== Ratios & KPIs ==================== */
const RATIO_TIPS = {
  'Market Cap': { def: 'Equity market value of the company.', formula: 'Share price × Shares outstanding' },
  'Enterprise Value': { def: 'Value of core operations to all capital providers.', formula: 'Market Cap + Total Debt − Cash' },
  'PE': { def: 'Price-to-Earnings: how much investors pay per dollar of earnings.', formula: 'Market Cap / Net Income  (or Price / EPS)' },
  'PS': { def: 'Price-to-Sales.', formula: 'Market Cap / Revenue' },
  'PB': { def: 'Price-to-Book.', formula: 'Market Cap / Shareholders’ Equity' },
  'P/TBV': { def: 'Price to tangible book value (excludes intangibles).', formula: 'Market Cap / (Equity − Intangibles)' },
  'P/FCF': { def: 'Price to free cash flow.', formula: 'Market Cap / Free Cash Flow' },
  'P/OCF': { def: 'Price to operating cash flow.', formula: 'Market Cap / Operating Cash Flow' },
  'EV/Sales': { def: 'Enterprise value relative to sales.', formula: 'EV / Revenue' },
  'EV/EBITDA': { def: 'EV relative to EBITDA.', formula: 'EV / (Operating Income + D&A)' },
  'EV/EBIT': { def: 'EV relative to operating income (EBIT).', formula: 'EV / Operating Income' },
  'EV/FCF': { def: 'EV relative to free cash flow.', formula: 'EV / Free Cash Flow' },
  'Debt/Equity': { def: 'Leverage vs book equity.', formula: 'Total Debt / Shareholders’ Equity' },
  'Debt/EBITDA': { def: 'Debt load vs operating cash proxy.', formula: 'Total Debt / EBITDA' },
  'Debt/FCF': { def: 'Debt relative to free cash flow.', formula: 'Total Debt / Free Cash Flow' },
  'Net Debt/Equity': { def: 'Debt net of cash vs equity.', formula: '(Total Debt − Cash) / Equity' },
  'Net Debt/EBITDA': { def: 'Net leverage vs EBITDA.', formula: '(Total Debt − Cash) / EBITDA' },
  'Net Debt/FCF': { def: 'Net debt vs free cash flow.', formula: '(Total Debt − Cash) / FCF' },
  'Asset Turnover': { def: 'Sales generated per unit of assets.', formula: 'Revenue / Total Assets' },
  'ROE': { def: 'Return on equity.', formula: 'Net Income / Shareholders’ Equity' },
  'ROA': { def: 'Return on assets.', formula: 'Net Income / Total Assets' },
  'ROIC': { def: 'Return on invested capital (approx.).', formula: 'Operating Income × (1 − tax) / (Equity + Debt − Cash)' },
  'ROCE': { def: 'Return on capital employed (approx.).', formula: 'Operating Income / (Total Assets − Current Liabilities)' },
  'Earnings Yield': { def: 'Earnings as a percentage of price.', formula: 'Net Income / Market Cap × 100%' },
  'FCF Yield': { def: 'Free cash flow as a percentage of market value.', formula: 'FCF / Market Cap × 100%' },
  'Buyback Yield / Dilution': { def: 'Net share reduction (positive = buybacks) or dilution (negative).', formula: '−Δ Shares / Prior Shares × 100%' },
  'Total Shareholder Return': { def: 'Approx. capital gain over the period (dividends not always included).', formula: '(Priceₜ − Priceₜ₋₁) / Priceₜ₋₁ × 100%' },
};

function ratioTip(label) {
  return `<button type="button" class="fin-label" data-fin-label="${label.replace(/"/g,'&quot;')}" data-kind="x"><span>${label}</span></button>`;
}
function ratioGrowthTip(label) {
  const g = label + ' Growth (YoY)';
  return `<button type="button" class="fin-label" data-fin-label="${g.replace(/"/g,'&quot;')}" data-kind="pct"><span>${g}</span></button>`;
}

function rkSafeDiv(a, b) {
  if (a == null || b == null || b === 0 || isNaN(a) || isNaN(b)) return null;
  return a / b;
}

function rkPriceNear(historyRows, dateStr) {
  if (!historyRows || !historyRows.length || !dateStr) return null;
  const target = String(dateStr).slice(0, 10);
  // history may have Date or Datetime
  let best = null, bestDiff = Infinity;
  for (const r of historyRows) {
    const d = String(r.Date || r.Datetime || '').slice(0, 10);
    if (!d) continue;
    const diff = Math.abs(Date.parse(d) - Date.parse(target));
    if (isNaN(diff)) continue;
    if (diff < bestDiff) { bestDiff = diff; best = r.Close; }
  }
  return best;
}

function rkLookupAny(map, names, period) {
  return isLookup(map, names, period);
}

function rkBuildPeriodMetrics(incMap, bsMap, cfMap, periods, historyRows, quote) {
  // returns array of metric objects aligned to periods
  const out = periods.map((p, idx) => {
    const revenue = rkLookupAny(incMap, ['Total Revenue', 'Operating Revenue', 'Revenue'], p);
    const netIncome = rkLookupAny(incMap, ['Net Income', 'Net Income Common Stockholders', 'Net Income Continuous Operations'], p);
    const opInc = rkLookupAny(incMap, ['Operating Income', 'Operating Income Loss'], p);
    const da = rkLookupAny(incMap, ['Reconciled Depreciation', 'Depreciation And Amortization'], p)
      ?? rkLookupAny(cfMap, ['Depreciation And Amortization', 'Depreciation'], p);
    const ebitda = (opInc != null || da != null) ? (opInc || 0) + (da || 0) : null;
    const shares = rkLookupAny(incMap, ['Diluted Average Shares', 'Basic Average Shares'], p)
      ?? rkLookupAny(bsMap, ['Ordinary Shares Number', 'Share Issued'], p);
    const equity = rkLookupAny(bsMap, ['Stockholders Equity', 'Common Stock Equity', 'Total Equity Gross Minority Interest'], p);
    const assets = rkLookupAny(bsMap, ['Total Assets'], p);
    const cash = rkLookupAny(bsMap, ['Cash And Cash Equivalents', 'Cash Cash Equivalents And Short Term Investments'], p);
    const intang = rkLookupAny(bsMap, ['Goodwill And Other Intangible Assets', 'Other Intangible Assets', 'Goodwill'], p);
    const currLiab = rkLookupAny(bsMap, ['Current Liabilities'], p);
    const debt = (() => {
      const a = rkLookupAny(bsMap, ['Total Debt'], p);
      if (a != null) return a;
      const st = rkLookupAny(bsMap, ['Current Debt', 'Current Debt And Capital Lease Obligation'], p) || 0;
      const lt = rkLookupAny(bsMap, ['Long Term Debt', 'Long Term Debt And Capital Lease Obligation'], p) || 0;
      const s = st + lt;
      return s === 0 ? null : s;
    })();
    const ocf = rkLookupAny(cfMap, ['Operating Cash Flow', 'Cash Flow From Continuing Operating Activities'], p);
    let fcf = rkLookupAny(cfMap, ['Free Cash Flow'], p);
    const capex = rkLookupAny(cfMap, ['Capital Expenditure'], p);
    if (fcf == null && ocf != null && capex != null) fcf = capex < 0 ? ocf + capex : ocf - Math.abs(capex);

    let price = rkPriceNear(historyRows, p);
    // fallback current quote for latest period
    if (price == null && idx === periods.length - 1 && quote) {
      price = quote.currentPrice ?? quote.previousClose ?? null;
    }
    let mcap = (price != null && shares != null) ? price * shares : null;
    if (mcap == null && idx === periods.length - 1 && quote && quote.marketCap) mcap = quote.marketCap;

    let ev = null;
    if (mcap != null) {
      ev = mcap + (debt || 0) - (cash || 0);
    }
    if (ev == null && idx === periods.length - 1 && quote && quote.enterpriseValue) ev = quote.enterpriseValue;

    const tbv = (equity != null) ? equity - (intang || 0) : null;
    const netDebt = (debt != null || cash != null) ? (debt || 0) - (cash || 0) : null;
    const taxRate = 0.21; // approx for ROIC

    // prior shares for buyback yield
    const prevP = idx > 0 ? periods[idx - 1] : null;
    const prevShares = prevP ? (rkLookupAny(incMap, ['Diluted Average Shares', 'Basic Average Shares'], prevP)
      ?? rkLookupAny(bsMap, ['Ordinary Shares Number', 'Share Issued'], prevP)) : null;
    const buyback = (shares != null && prevShares != null && prevShares !== 0)
      ? (-(shares - prevShares) / Math.abs(prevShares)) * 100 : null;

    const prevPrice = prevP ? rkPriceNear(historyRows, prevP) : null;
    const tsr = (price != null && prevPrice != null && prevPrice !== 0)
      ? ((price - prevPrice) / Math.abs(prevPrice)) * 100 : null;

    return {
      period: p,
      mcap, ev, price, shares, revenue, netIncome, opInc, ebitda, equity, assets, cash, debt, netDebt,
      ocf, fcf, tbv, currLiab,
      pe: rkSafeDiv(mcap, netIncome),
      ps: rkSafeDiv(mcap, revenue),
      pb: rkSafeDiv(mcap, equity),
      ptbv: rkSafeDiv(mcap, tbv),
      pfcf: rkSafeDiv(mcap, fcf),
      pocf: rkSafeDiv(mcap, ocf),
      evSales: rkSafeDiv(ev, revenue),
      evEbitda: rkSafeDiv(ev, ebitda),
      evEbit: rkSafeDiv(ev, opInc),
      evFcf: rkSafeDiv(ev, fcf),
      debtEquity: rkSafeDiv(debt, equity),
      debtEbitda: rkSafeDiv(debt, ebitda),
      debtFcf: rkSafeDiv(debt, fcf),
      netDebtEquity: rkSafeDiv(netDebt, equity),
      netDebtEbitda: rkSafeDiv(netDebt, ebitda),
      netDebtFcf: rkSafeDiv(netDebt, fcf),
      assetTurnover: rkSafeDiv(revenue, assets),
      roe: rkSafeDiv(netIncome, equity),
      roa: rkSafeDiv(netIncome, assets),
      roic: rkSafeDiv((opInc != null ? opInc * (1 - taxRate) : null), ((equity || 0) + (debt || 0) - (cash || 0)) || null),
      roce: rkSafeDiv(opInc, (assets != null && currLiab != null) ? (assets - currLiab) : null),
      earningsYield: rkSafeDiv(netIncome, mcap) != null ? rkSafeDiv(netIncome, mcap) * 100 : null,
      fcfYield: rkSafeDiv(fcf, mcap) != null ? rkSafeDiv(fcf, mcap) * 100 : null,
      buybackYield: buyback,
      tsr,
    };
  });
  return out;
}

function rkSeriesFromMetrics(metrics, key, asPctPoints=false) {
  return metrics.map(m => {
    const v = m[key];
    if (v == null || isNaN(v)) return null;
    return v;
  });
}

function rkGrowth(vals) {
  return yoySeries(vals);
}

function rkFmtRatio(v, kind) {
  if (v == null || isNaN(v)) return { text: '—', cls: '' };
  if (kind === 'money') return { text: isFmtMoney(v), cls: v < 0 ? 'neg' : '' };
  if (kind === 'pct') {
    const p = isFmtPct(v);
    return typeof p === 'string' ? { text: p, cls: '' } : p;
  }
  if (kind === 'x') {
    // multiple like 12.3x
    return { text: Number(v).toFixed(3) + 'x', cls: v < 0 ? 'neg' : '' };
  }
  if (kind === 'decimal') {
    return { text: Number(v).toFixed(2), cls: v < 0 ? 'neg' : '' };
  }
  return { text: String(v), cls: '' };
}

function rkRenderTable(rows, periods) {
  const map = { ...RATIO_TIPS };
  rows.forEach(r => {
    if (r.isGrowth && r.baseLabel) {
      map[r.label] = { def: 'Year-over-year change in ' + r.baseLabel + '.', formula: '(Vₜ − Vₜ₋₁) / |Vₜ₋₁| × 100%' };
    }
  });
  return finRenderPairs(rows, periods, map);
}

function rkSectionBlock(id, title, lines, periods, selected, colors) {
  return `
    <div class="card p-4 mb-5" data-rk-section="${id}">
      <div class="flex flex-wrap items-center justify-between gap-2 mb-3">
        <h4 class="text-sm font-bold">${title}</h4>
        <div class="relative inline-block">
          <button type="button" class="text-xs border border-slate-200 dark:border-slate-700 rounded-lg px-2 py-1 bg-white dark:bg-slate-900 rk-menu-btn" data-id="${id}">Series ▾</button>
          <div class="hidden absolute right-0 mt-1 z-40 w-56 max-h-52 overflow-y-auto rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-lg p-2 rk-menu" data-id="${id}">
            ${lines.map((l, i) => `
              <label class="flex items-center gap-2 px-1 py-1 text-[11px] hover:bg-slate-50 dark:hover:bg-slate-800 rounded cursor-pointer">
                <input type="checkbox" class="rk-series-cb" data-id="${id}" value="${l.key}" ${selected.has(l.key) ? 'checked' : ''} />
                <span class="inline-block w-2 h-2 rounded-full" style="background:${colors[i % colors.length]}"></span>
                <span>${l.label}</span>
              </label>
            `).join('')}
          </div>
        </div>
      </div>
      <div class="grid lg:grid-cols-5 gap-4">
        <div class="lg:col-span-3" id="rkTable-${id}"></div>
        <div class="lg:col-span-2"><div class="chart-container" style="height:250px"><canvas id="rkChart-${id}"></canvas></div></div>
      </div>
    </div>`;
}

async function renderRatiosKPIs(body, data, quote, sym) {
  body.innerHTML = `<div class="flex justify-center py-10"><div class="w-8 h-8 border-4 border-brand-500 border-t-transparent rounded-full animate-spin"></div></div>`;

  let mode = 'annual';
  let historyRows = [];
  try {
    historyRows = await LiveAPI.history(sym, '10y', '1wk');
  } catch (_) { historyRows = []; }

  const selected = {
    valuation: new Set(['mcap', 'ev']),
    price: new Set(['pe', 'ps', 'pb']),
    ev: new Set(['evSales', 'evEbitda', 'evFcf']),
    efficiency: new Set(['roe', 'roa', 'debtEquity']),
    yields: new Set(['earningsYield', 'fcfYield', 'tsr']),
  };

  const SECTIONS = [
    {
      id: 'valuation', title: 'Total Valuation',
      lines: [
        { key: 'mcap', label: 'Market Cap', kind: 'money', growth: true },
        { key: 'ev', label: 'Enterprise Value', kind: 'money', growth: true },
      ]
    },
    {
      id: 'price', title: 'Price Ratios',
      lines: [
        { key: 'pe', label: 'PE', kind: 'x' },
        { key: 'ps', label: 'PS', kind: 'x' },
        { key: 'pb', label: 'PB', kind: 'x' },
        { key: 'ptbv', label: 'P/TBV', kind: 'x' },
        { key: 'pfcf', label: 'P/FCF', kind: 'x' },
        { key: 'pocf', label: 'P/OCF', kind: 'x' },
      ]
    },
    {
      id: 'ev', title: 'EV Ratios',
      lines: [
        { key: 'evSales', label: 'EV/Sales', kind: 'x' },
        { key: 'evEbitda', label: 'EV/EBITDA', kind: 'x' },
        { key: 'evEbit', label: 'EV/EBIT', kind: 'x' },
        { key: 'evFcf', label: 'EV/FCF', kind: 'x' },
      ]
    },
    {
      id: 'efficiency', title: 'Financial Efficiency',
      lines: [
        { key: 'debtEquity', label: 'Debt/Equity', kind: 'x' },
        { key: 'debtEbitda', label: 'Debt/EBITDA', kind: 'x' },
        { key: 'debtFcf', label: 'Debt/FCF', kind: 'x' },
        { key: 'netDebtEquity', label: 'Net Debt/Equity', kind: 'x' },
        { key: 'netDebtEbitda', label: 'Net Debt/EBITDA', kind: 'x' },
        { key: 'netDebtFcf', label: 'Net Debt/FCF', kind: 'x' },
        { key: 'assetTurnover', label: 'Asset Turnover', kind: 'decimal' },
        { key: 'roe', label: 'ROE', kind: 'pct' }, // store as ratio*100 for display? we'll convert
        { key: 'roa', label: 'ROA', kind: 'pct' },
        { key: 'roic', label: 'ROIC', kind: 'pct' },
        { key: 'roce', label: 'ROCE', kind: 'pct' },
      ]
    },
    {
      id: 'yields', title: 'Yields',
      lines: [
        { key: 'earningsYield', label: 'Earnings Yield', kind: 'pct' },
        { key: 'fcfYield', label: 'FCF Yield', kind: 'pct' },
        { key: 'buybackYield', label: 'Buyback Yield / Dilution', kind: 'pct' },
        { key: 'tsr', label: 'Total Shareholder Return', kind: 'pct' },
      ]
    },
  ];

  function getMaps(m) {
    const inc = isParseMatrix(m === 'quarterly' ? (data.quarterly_income || []) : (data.income_statement || []));
    const bs = isParseMatrix(m === 'quarterly' ? (data.quarterly_balance || []) : (data.balance_sheet || []));
    const cf = isParseMatrix(m === 'quarterly' ? (data.quarterly_cashflow || []) : (data.cashflow || []));
    // align periods primarily to income statement
    const periods = isFilterPeriods(inc.periods.length ? inc.periods : bs.periods, m === 'quarterly' ? 'quarterly' : 'annual');
    return { inc, bs, cf, periods };
  }

  function paint() {
    body.innerHTML = `
      <div class="flex flex-wrap items-center justify-between gap-3 mb-4">
        <h3 class="text-sm font-semibold">Ratios</h3>
        <div class="flex items-center gap-2">
          <label class="text-xs text-slate-500">Period</label>
          <select id="rkMode" class="text-sm border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-1.5 bg-white dark:bg-slate-900">
            <option value="annual" ${mode==='annual'?'selected':''}>Annual</option>
            <option value="quarterly" ${mode==='quarterly'?'selected':''}>Quarterly</option>
          </select>
        </div>
      </div>
      <div id="rkBody"></div>
    `;
    document.getElementById('rkMode').addEventListener('change', (e) => { mode = e.target.value; paint(); });

    const host = document.getElementById('rkBody');

    const { inc, bs, cf, periods } = getMaps(mode);
    if (!periods.length) {
      host.innerHTML = '<div class="card p-6 text-sm text-slate-400">Insufficient statement data to compute ratios.</div>';
      return;
    }
    const metrics = rkBuildPeriodMetrics(inc.map, bs.map, cf.map, periods, historyRows, quote);

    // Convert ROE/ROA/ROIC/ROCE to percentage points for display kind pct
    metrics.forEach(m => {
      ['roe','roa','roic','roce'].forEach(k => { if (m[k] != null) m[k] = m[k] * 100; });
    });

    // Annual revenue snapshot (from KPIs)
    const ann = isParseMatrix(data.income_statement || []);
    const annP = isFilterPeriods(ann.periods, 'annual');
    const annRev = annP.map(p => isLookup(ann.map, IS_ALIASES.Revenue || ['Total Revenue','Revenue'], p));
    const annLabels = annP.map(p => { const y = isYearFromCol(p); return y != null ? String(y) : isPeriodLabel(p).slice(0,4); });

    host.innerHTML = `
      <div class="card p-3 sm:p-4 mb-4">
        <h4 class="text-sm font-semibold mb-2">Annual Revenue Snapshot</h4>
        <div class="grid grid-cols-1 lg:grid-cols-5 gap-3 fin-stack">
          <div class="lg:col-span-3 min-w-0"><div class="chart-container" style="height:220px"><canvas id="rkAnnRevChart"></canvas></div></div>
          <div class="lg:col-span-2 min-w-0 overflow-x-auto">
            <table class="data-table is-table w-full">
              <thead><tr><th class="text-left">Year</th><th class="text-right">Revenue</th></tr></thead>
              <tbody>
                ${annP.map((p,i) => `<tr><td>${annLabels[i]}</td><td class="text-right">${isFmtMoney(annRev[i])}</td></tr>`).join('') ||  `<tr><td colspan="2">${fsEmpty({ title: 'No annual revenue series', detail: 'Revenue history is unavailable for this symbol.' })}</td></tr>` }
              </tbody>
            </table>
          </div>
        </div>
      </div>
      <p class="text-[11px] text-slate-400 mb-4">Ratios are calculated from statements and prices. Click a metric label for definition, formula and insight. Growth in green/red.</p>
      <div id="rkSections"></div>`;
    const dark = document.documentElement.classList.contains('dark');
    if (charts.rkAnnRev) charts.rkAnnRev.destroy();
    const c = document.getElementById('rkAnnRevChart');
    if (c) {
      charts.rkAnnRev = new Chart(c, {
        type: 'bar',
        data: { labels: annLabels, datasets: [{ label: 'Revenue', data: annRev, backgroundColor: 'rgba(51,159,255,0.75)', borderRadius: 4 }] },
        options: {
          responsive: true, maintainAspectRatio: false,
          plugins: { legend: { display: false }, tooltip: { callbacks: { label: x => isFmtMoney(x.parsed.y) } } },
          scales: {
            x: { ticks: { color: dark?'#94a3b8':'#64748b' }, grid: { display: false } },
            y: { ticks: { color: dark?'#94a3b8':'#64748b', callback: v => isFmtMoney(v) }, grid: { color: dark?'rgba(148,163,184,0.1)':'rgba(100,116,139,0.12)' } }
          }
        }
      });
    }

    const secHost = document.getElementById('rkSections');

    SECTIONS.forEach(sec => {
      const wrap = document.createElement('div');
      wrap.innerHTML = rkSectionBlock(sec.id, sec.title, sec.lines, periods, selected[sec.id], BS_COLORS);
      secHost.appendChild(wrap.firstElementChild);

      // build table rows
      const rows = [];
      sec.lines.forEach(line => {
        const vals = metrics.map(m => m[line.key]);
        rows.push({ label: line.label, vals, kind: line.kind, isGrowth: false });
        if (line.growth) {
          rows.push({ label: line.label + ' Growth (YoY)', baseLabel: line.label, vals: rkGrowth(vals), kind: 'pct', isGrowth: true });
        }
      });
      const tableEl = document.getElementById('rkTable-' + sec.id);
      if (tableEl) tableEl.innerHTML = rkRenderTable(rows, periods);

      // menu
      const btn = document.querySelector(`.rk-menu-btn[data-id="${sec.id}"]`);
      const menu = document.querySelector(`.rk-menu[data-id="${sec.id}"]`);
      if (btn && menu) {
        btn.addEventListener('click', (e) => { e.stopPropagation(); menu.classList.toggle('hidden'); });
        document.addEventListener('click', () => menu.classList.add('hidden'));
        menu.addEventListener('click', (e) => e.stopPropagation());
        menu.querySelectorAll('.rk-series-cb').forEach(cb => {
          cb.addEventListener('change', () => {
            if (cb.checked) selected[sec.id].add(cb.value);
            else selected[sec.id].delete(cb.value);
            drawRkChart(sec, metrics, periods);
          });
        });
      }
      drawRkChart(sec, metrics, periods);
    });
    const hostTips = document.getElementById('rkBody');
    if (hostTips) finBindTable(hostTips, RATIO_TIPS);
  }

  function drawRkChart(sec, metrics, periods) {
    const canvas = document.getElementById('rkChart-' + sec.id);
    if (!canvas) return;
    const dark = document.documentElement.classList.contains('dark');
    const labels = periods.map(isPeriodLabel);
    const keys = [...selected[sec.id]];
    const datasets = keys.map((key, i) => {
      const line = sec.lines.find(l => l.key === key);
      const color = BS_COLORS[i % BS_COLORS.length];
      return {
        label: line ? line.label : key,
        data: metrics.map(m => m[key]),
        borderColor: color,
        backgroundColor: color + '33',
        tension: 0.2,
        borderWidth: 2,
        pointRadius: 2,
        fill: false,
      };
    });
    const chartKey = 'rkChart_' + sec.id;
    if (charts[chartKey]) charts[chartKey].destroy();
    charts[chartKey] = new Chart(canvas, {
      type: 'line',
      data: { labels, datasets },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: {
          legend: { labels: { color: dark ? '#94a3b8' : '#64748b', boxWidth: 10, font: { size: 10 } } },
        },
        scales: {
          x: { ticks: { color: dark ? '#94a3b8' : '#64748b', font: { size: 9 } }, grid: { display: false } },
          y: { ticks: { color: dark ? '#94a3b8' : '#64748b', font: { size: 9 } }, grid: { color: dark ? 'rgba(148,163,184,0.1)' : 'rgba(100,116,139,0.12)' } }
        }
      }
    });
  }


  paint();
}


async function loadStatisticsLive(sym) {
  const body = document.getElementById('statBody');
  try {
    const q = await LiveAPI.quote(sym);

    function pct(v) {
      if (v == null || isNaN(v)) return null;
      return (Number(v) * 100).toFixed(3) + '%';
    }
    function num(v, d=2) {
      if (v == null || isNaN(v)) return null;
      return Number(v).toLocaleString(undefined, { maximumFractionDigits: d });
    }
    function insightValuation() {
      const parts = [];
      if (q.marketCap != null) parts.push(`Market value of equity is ${fmt.mcap(q.marketCap)}.`);
      if (q.enterpriseValue != null && q.marketCap != null) {
        const gap = q.enterpriseValue - q.marketCap;
        parts.push(gap > 0
          ? `EV exceeds market cap by ${fmt.mcap(gap)}, implying net debt on the balance sheet.`
          : `EV is below market cap, suggesting a net-cash position.`);
      }
      return parts.join(' ') || 'Valuation size anchors how expensive the firm is in absolute terms.';
    }
    function insightShares() {
      const parts = [];
      if (q.floatShares != null && q.sharesOutstanding != null && q.sharesOutstanding > 0) {
        const f = q.floatShares / q.sharesOutstanding;
        parts.push(`Float is about ${(f*100).toFixed(0)}% of shares outstanding — ${f > 0.85 ? 'highly liquid free float' : f > 0.5 ? 'moderate free float' : 'relatively tight float'}.`);
      }
      if (q.heldPercentInstitutions != null) {
        const inst = q.heldPercentInstitutions * (q.heldPercentInstitutions <= 1 ? 100 : 1);
        parts.push(`Institutions hold ~${inst.toFixed(0)}%${inst > 70 ? ' (heavy institutional ownership can mean both support and crowded trades)' : ''}.`);
      }
      if (q.heldPercentInsiders != null) {
        const ins = q.heldPercentInsiders * (q.heldPercentInsiders <= 1 ? 100 : 1);
        parts.push(`Insiders own ~${ins.toFixed(1)}%.`);
      }
      return parts.join(' ') || 'Share structure affects liquidity and ownership influence.';
    }
    function insightValRatios() {
      const parts = [];
      if (q.trailingPE != null) parts.push(`Trailing PE ${Number(q.trailingPE).toFixed(1)}x ${q.trailingPE > 30 ? 'is elevated vs a classic 15–20x band' : q.trailingPE < 12 ? 'looks optically cheap on recent earnings' : 'is in a moderate range'}.`);
      if (q.forwardPE != null && q.trailingPE != null && q.forwardPE < q.trailingPE) parts.push('Forward PE below trailing PE implies expected earnings growth.');
      if (q.priceToBook != null) parts.push(`P/B ${ratioFmt(q.priceToBook)}x ${q.priceToBook > 5 ? 'prices in substantial franchise value above book' : q.priceToBook < 1 ? 'is below book value' : 'is near typical industrial levels'}.`);
      return parts.join(' ') || 'Multiples summarize price relative to earnings, sales, book and cash generation.';
    }
    function insightMargins() {
      const g = q.grossMargins, o = q.operatingMargins, p = q.profitMargins;
      const parts = [];
      if (g != null) parts.push(`Gross margin ${(g*100).toFixed(1)}% shows product-level profitability.`);
      if (o != null) parts.push(`Operating margin ${(o*100).toFixed(1)}% reflects cost control after overhead.`);
      if (p != null) parts.push(`Net margin ${(p*100).toFixed(1)}% is what ultimately accrues to shareholders.`);
      if (g != null && p != null && g > 0 && p / g < 0.3) parts.push('A wide gap from gross to net suggests heavy opex, interest or tax drag.');
      return parts.join(' ') || 'Margins measure how much of each sales dollar is kept at successive profit stages.';
    }
    function insightReturns() {
      const parts = [];
      if (q.returnOnEquity != null) {
        const roe = q.returnOnEquity * 100;
        parts.push(`ROE ${roe.toFixed(1)}% ${roe > 20 ? 'is strong' : roe > 10 ? 'is solid' : 'is modest'} versus a rough 10–15% cost-of-equity hurdle.`);
      }
      if (q.returnOnAssets != null) parts.push(`ROA ${(q.returnOnAssets*100).toFixed(1)}% shows asset productivity.`);
      if (q.beta != null) parts.push(`Beta ${Number(q.beta).toFixed(3)} ${q.beta > 1.2 ? 'implies above-market volatility' : q.beta < 0.8 ? 'implies defensive, lower market sensitivity' : 'is close to market risk'}.`);
      return parts.join(' ') || 'Returns and beta describe profitability on capital and market risk.';
    }
    function insightAnalyst() {
      const parts = [];
      if (q.targetMeanPrice != null && (q.currentPrice || q.previousClose)) {
        const px = q.currentPrice ?? q.previousClose;
        const up = (q.targetMeanPrice / px - 1) * 100;
        parts.push(`Mean target ${fmt.num(q.targetMeanPrice, 2)} implies ${up >= 0 ? '+' : ''}${up.toFixed(1)}% vs last price.`);
      }
      if (q.recommendationKey) parts.push(`Street stance: ${String(q.recommendationKey).replace(/_/g, ' ')}.`);
      if (q.numberOfAnalystOpinions) parts.push(`Based on ${q.numberOfAnalystOpinions} analysts.`);
      return parts.join(' ') || 'Analyst targets are opinions, not guarantees — use as one input among many.';
    }

    const blocks = [
      {
        title: 'Total Valuation',
        insight: insightValuation(),
        rows: [
          { k: 'Market Cap', v: q.marketCap != null ? fmt.mcap(q.marketCap) : null, def: 'Equity value = price × shares outstanding.' },
          { k: 'Enterprise Value', v: q.enterpriseValue != null ? fmt.mcap(q.enterpriseValue) : null, def: 'EV ≈ market cap + debt − cash; value of core operations.' },
          { k: 'Currency', v: q.currency, def: 'Reporting / quoting currency for price and fundamentals.' },
        ]
      },
      {
        title: 'Share Statistics',
        insight: insightShares(),
        rows: [
          { k: 'Shares Outstanding', v: num(q.sharesOutstanding, 0), def: 'Total issued shares used in per-share metrics.' },
          { k: 'Float', v: num(q.floatShares, 0), def: 'Shares available to public trading (ex tightly held).' },
          { k: 'Insider %', v: pct(q.heldPercentInsiders), def: 'Portion of shares held by insiders/management.' },
          { k: 'Institution %', v: pct(q.heldPercentInstitutions), def: 'Portion held by funds, pensions and other institutions.' },
        ]
      },
      {
        title: 'Valuation Ratios',
        insight: insightValRatios(),
        rows: [
          { k: 'Trailing PE', v: num(q.trailingPE), def: 'Price / last 12 months EPS. Higher = more expensive on past earnings.' },
          { k: 'Forward PE', v: num(q.forwardPE), def: 'Price / expected next-year EPS.' },
          { k: 'Price/Book', v: num(q.priceToBook), def: 'Price / book value per share.' },
          { k: 'EV/Revenue', v: num(q.enterpriseToRevenue), def: 'Enterprise value / sales.' },
          { k: 'EV/EBITDA', v: num(q.enterpriseToEbitda), def: 'EV / EBITDA; common operating multiple.' },
        ]
      },
      {
        title: 'Margins',
        insight: insightMargins(),
        rows: [
          { k: 'Gross', v: pct(q.grossMargins), def: 'Gross profit / revenue after direct costs.' },
          { k: 'Operating', v: pct(q.operatingMargins), def: 'Operating income / revenue after operating expenses.' },
          { k: 'Profit', v: pct(q.profitMargins), def: 'Net income / revenue after all expenses and tax.' },
        ]
      },
      {
        title: 'Returns',
        insight: insightReturns(),
        rows: [
          { k: 'ROE', v: pct(q.returnOnEquity), def: 'Net income / shareholders’ equity.' },
          { k: 'ROA', v: pct(q.returnOnAssets), def: 'Net income / total assets.' },
          { k: 'Beta', v: num(q.beta), def: 'Sensitivity to market moves; 1 ≈ market risk.' },
        ]
      },
      {
        title: 'Analyst',
        insight: insightAnalyst(),
        rows: [
          { k: 'Target Mean', v: q.targetMeanPrice != null ? '$' + num(q.targetMeanPrice) : null, def: 'Average analyst 12-month price target.' },
          { k: 'Recommendation', v: q.recommendationKey ? String(q.recommendationKey).replace(/_/g, ' ') : null, def: 'Consensus recommendation category from covering analysts.' },
          { k: '# Analysts', v: num(q.numberOfAnalystOpinions, 0), def: 'Number of analysts in the consensus set.' },
        ]
      },
    ];

    body.innerHTML = `<div class="grid md:grid-cols-2 gap-4">${blocks.map(b => `
      <div class="card p-4 flex flex-col">
        <h4 class="text-sm font-semibold mb-2">${b.title}</h4>
        <dl class="space-y-2 text-sm mb-3">
          ${b.rows.map(r => `
            <div>
              <div class="flex justify-between gap-3">
                <dt class="text-slate-500"><span class="fin-tip">${r.k}<span class="tip-box"><strong>${r.k}</strong><br>${r.def}</span></span></dt>
                <dd class="font-medium">${r.v ?? '—'}</dd>
              </div>
            </div>
          `).join('')}
        </dl>
        <p class="text-[11px] leading-relaxed text-slate-400 mt-auto border-t border-slate-100 dark:border-slate-800 pt-2">${b.insight}</p>
      </div>
    `).join('')}</div>`;
  } catch (e) {
    body.innerHTML = `<div class="card p-6 text-center text-amber-600 text-sm">Statistics unavailable: ${e.message}</div>`;
  }
}

async function loadDividendsLive(sym) {
  const body = document.getElementById('divBody');
  try {
    const [divsPayload, q] = await Promise.all([
      LiveAPI.dividends(sym).catch((e) => ({ dividends: [], _err: e })),
      LiveAPI.quote(sym).catch(() => ({}))
    ]);
    // API returns { symbol, dividends: [{Date, Dividend}, ...] } — unwrap safely
    const rawList = Array.isArray(divsPayload)
      ? divsPayload
      : (divsPayload && Array.isArray(divsPayload.dividends) ? divsPayload.dividends : []);
    // normalize & sort ascending by date
    const divs = (rawList || []).map(r => ({
      date: String(r.Date || r.date || '').slice(0, 10),
      amount: Number(r.Dividend != null ? r.Dividend : r.amount)
    })).filter(r => r.date && !isNaN(r.amount)).sort((a, b) => a.date.localeCompare(b.date));

    const yieldPct = q.dividendYield != null ? q.dividendYield * 100 : null;
    const rate = q.dividendRate;
    const avg5 = q.fiveYearAvgDividendYield != null ? Number(q.fiveYearAvgDividendYield) : null;
    const payout = q.payoutRatio != null ? q.payoutRatio * (q.payoutRatio <= 1.5 ? 100 : 1) : null;

    // Annual aggregate for table (calendar year)
    const byYear = {};
    divs.forEach(d => {
      const y = d.date.slice(0, 4);
      byYear[y] = (byYear[y] || 0) + d.amount;
    });
    const years = Object.keys(byYear).sort((a,b) => Number(b) - Number(a));
    // keep last up to 10 years for span clarity
    const yearCols = years.slice(-10);
    const annualTotals = yearCols.map(y => byYear[y]);
    const annualGrowth = annualTotals.map((v, i) => i === 0 || annualTotals[i-1] === 0 ? null : ((v - annualTotals[i-1]) / Math.abs(annualTotals[i-1])) * 100);

    // TTM dividend sum
    const cutoff = new Date();
    cutoff.setFullYear(cutoff.getFullYear() - 1);
    const ttm = divs.filter(d => new Date(d.date) >= cutoff).reduce((s, d) => s + d.amount, 0);

    // streak / count
    const first = divs[0]?.date;
    const last = divs[divs.length - 1]?.date;
    const yearsSpan = first && last ? (new Date(last).getFullYear() - new Date(first).getFullYear() + 1) : null;

    function yieldInsight() {
      if (yieldPct == null) return 'Yield unavailable — company may not pay a dividend or data is missing.';
      if (yieldPct >= 4) return 'Yield is relatively high; check payout sustainability and whether price has declined.';
      if (yieldPct >= 2) return 'Moderate income yield — typical of many mature dividend payers.';
      if (yieldPct > 0) return 'Low yield — more of a growth or token dividend profile than an income stock.';
      return 'No meaningful trailing yield.';
    }
    function rateInsight() {
      if (rate == null) return 'Annualized dividend rate not reported in the quote feed.';
      return `Forward/indicated annual cash dividend of about $${Number(rate).toFixed(3)} per share.`;
    }
    function avgInsight() {
      if (avg5 == null || yieldPct == null) return 'Five-year average yield helps judge if today’s yield is rich or thin vs history.';
      if (yieldPct > avg5 + 0.5) return `Current yield (${yieldPct.toFixed(3)}%) is above the 5Y average (${avg5.toFixed(3)}%) — either higher payout or a lower price.`;
      if (yieldPct < avg5 - 0.5) return `Current yield is below the 5Y average — price strength or a lower payout can drive this.`;
      return 'Current yield is close to its five-year average.';
    }
    function ttmInsight() {
      if (!divs.length) return 'No dividend history in the feed.';
      return `TTM cash dividends sum to $${ttm.toFixed(3)} / share across ${divs.filter(d => new Date(d.date) >= cutoff).length} payments. History spans ${first} → ${last}${yearsSpan ? ` (~${yearsSpan} years)` : ''}.`;
    }

    let range = 'all'; // all | 10y | 5y | 1y
    let chartType = 'bar'; // bar | line

    function filterDivs() {
      if (range === 'all' || !divs.length) return divs;
      const end = new Date(divs[divs.length - 1].date);
      const start = new Date(end);
      if (range === '10y') start.setFullYear(start.getFullYear() - 10);
      if (range === '5y') start.setFullYear(start.getFullYear() - 5);
      if (range === '1y') start.setFullYear(start.getFullYear() - 1);
      return divs.filter(d => new Date(d.date) >= start);
    }

    function paint() {
      const series = filterDivs();
      body.innerHTML = `
        <div class="grid md:grid-cols-2 xl:grid-cols-4 gap-3 mb-5">
          <div class="card p-4 flex flex-col">
            <p class="text-xs font-medium text-slate-500 uppercase tracking-wide"><span class="fin-tip">Dividend Yield<span class="tip-box"><strong>Dividend Yield</strong><br>Annual dividends / current price.<br><em>Formula:</em> DPS / Price</span></span></p>
            <p class="text-xl font-bold mt-1 mb-2">${yieldPct != null ? yieldPct.toFixed(3) + '%' : '—'}</p>
            <p class="text-[11px] text-slate-400 mt-auto">${yieldInsight()}</p>
          </div>
          <div class="card p-4 flex flex-col">
            <p class="text-xs font-medium text-slate-500 uppercase tracking-wide"><span class="fin-tip">Dividend Rate<span class="tip-box"><strong>Dividend Rate</strong><br>Indicated annual dividend per share in currency units.</span></span></p>
            <p class="text-xl font-bold mt-1 mb-2">${rate != null ? '$' + Number(rate).toFixed(3) : '—'}</p>
            <p class="text-[11px] text-slate-400 mt-auto">${rateInsight()}</p>
          </div>
          <div class="card p-4 flex flex-col">
            <p class="text-xs font-medium text-slate-500 uppercase tracking-wide"><span class="fin-tip">5Y Avg Yield<span class="tip-box"><strong>5Y Average Yield</strong><br>Average dividend yield over the last five years.</span></span></p>
            <p class="text-xl font-bold mt-1 mb-2">${avg5 != null ? avg5.toFixed(3) + '%' : '—'}</p>
            <p class="text-[11px] text-slate-400 mt-auto">${avgInsight()}</p>
          </div>
          <div class="card p-4 flex flex-col">
            <p class="text-xs font-medium text-slate-500 uppercase tracking-wide"><span class="fin-tip">TTM Dividends<span class="tip-box"><strong>TTM Dividends</strong><br>Sum of dividends paid in the trailing twelve months per share.</span></span></p>
            <p class="text-xl font-bold mt-1 mb-2">${divs.length ? '$' + ttm.toFixed(3) : '—'}</p>
            <p class="text-[11px] text-slate-400 mt-auto">${ttmInsight()}</p>
          </div>
        </div>

        ${payout != null ? `
        <div class="card p-4 mb-5">
          <div class="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p class="text-xs text-slate-500"><span class="fin-tip">Payout Ratio<span class="tip-box"><strong>Payout Ratio</strong><br>Share of earnings paid as dividends.<br><em>Formula:</em> Dividends / Earnings</span></span></p>
              <p class="text-lg font-bold">${payout.toFixed(1)}%</p>
            </div>
            <p class="text-[11px] text-slate-400 max-w-xl">${payout > 80 ? 'High payout — limited reinvestment capacity; sensitive to earnings dips.' : payout > 40 ? 'Balanced payout — room for both dividends and reinvestment.' : payout > 0 ? 'Conservative payout — more earnings retained for growth.' : 'Payout not meaningful or not reported.'}</p>
          </div>
        </div>` : ''}

        <div class="card p-4 mb-5">
          <div class="flex flex-wrap items-center justify-between gap-3 mb-3">
            <h4 class="text-sm font-semibold">Dividend History</h4>
            <div class="flex flex-wrap gap-2 items-center">
              <label class="text-xs text-slate-500">Span
                <select id="divRange" class="ml-1 text-xs border border-slate-200 dark:border-slate-700 rounded-lg px-2 py-1 bg-white dark:bg-slate-900">
                  <option value="all" ${range==='all'?'selected':''}>All available</option>
                  <option value="10y" ${range==='10y'?'selected':''}>10 years</option>
                  <option value="5y" ${range==='5y'?'selected':''}>5 years</option>
                  <option value="1y" ${range==='1y'?'selected':''}>1 year</option>
                </select>
              </label>
              <label class="text-xs text-slate-500">Chart
                <select id="divChartType" class="ml-1 text-xs border border-slate-200 dark:border-slate-700 rounded-lg px-2 py-1 bg-white dark:bg-slate-900">
                  <option value="bar" ${chartType==='bar'?'selected':''}>Bar</option>
                  <option value="line" ${chartType==='line'?'selected':''}>Line</option>
                </select>
              </label>
            </div>
          </div>
          ${!series.length ? '<p class="text-sm text-slate-400">No dividend history for this symbol.</p>' : `
          <div class="grid lg:grid-cols-5 gap-4">
            <div class="lg:col-span-3">
              <div class="chart-container" style="height:280px"><canvas id="divChart"></canvas></div>
              <p class="text-[11px] text-slate-400 mt-2">Showing ${series.length} payments from ${series[0].date} to ${series[series.length-1].date}.</p>
            </div>
            <div class="lg:col-span-2">
              <div class="chart-container" style="height:280px"><canvas id="divAnnualChart"></canvas></div>
              <p class="text-[11px] text-slate-400 mt-2">Calendar-year totals (last ${yearCols.length} years with data).</p>
            </div>
          </div>`}
        </div>

        <div class="card p-4 mb-5">
          <h4 class="text-sm font-semibold mb-3">Annual Dividend Summary</h4>
          ${!yearCols.length ? '<p class="text-sm text-slate-400">No annualized history.</p>' : `
          <div class="overflow-x-auto">
            <table class="data-table is-table w-full">
              <thead>
                <tr>
                  <th class="text-left">Line Item</th>
                  ${yearCols.map(y => `<th class="text-right">${y}</th>`).join('')}
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td><span class="fin-tip">Annual dividends / share<span class="tip-box"><strong>Annual dividends</strong><br>Sum of cash dividends paid in the calendar year per share.</span></span></td>
                  ${annualTotals.map(v => `<td class="text-right">$${v.toFixed(3)}</td>`).join('')}
                </tr>
                <tr>
                  <td><span class="fin-tip">YoY growth<span class="tip-box"><strong>YoY growth</strong><br>Year-over-year change in annual dividends.<br><em>Formula:</em> (Dₜ − Dₜ₋₁) / |Dₜ₋₁| × 100%</span></span></td>
                  ${annualGrowth.map(v => {
                    if (v == null) return '<td class="text-right">—</td>';
                    const cls = v > 0 ? 'pos' : v < 0 ? 'neg' : '';
                    return `<td class="text-right ${cls}">${v > 0 ? '+' : ''}${v.toFixed(1)}%</td>`;
                  }).join('')}
                </tr>
              </tbody>
            </table>
          </div>
          <p class="text-[11px] text-slate-400 mt-2">Green = dividend increased vs prior year; red = decreased. Useful for spotting cuts, freezes or growth streaks.</p>`}
        </div>

        <div class="card p-4">
          <h4 class="text-sm font-semibold mb-3">Payment log (selected span)</h4>
          ${!series.length ? '<p class="text-sm text-slate-400">No rows.</p>' : `
          <div class="overflow-x-auto max-h-64">
            <table class="data-table is-table w-full">
              <thead><tr><th class="text-left">Ex-date</th><th class="text-right">Dividend / share</th></tr></thead>
              <tbody>
                ${series.slice().reverse().map(r => `<tr><td>${r.date}</td><td class="text-right">$${r.amount.toFixed(3)}</td></tr>`).join('')}
              </tbody>
            </table>
          </div>`}
        </div>
      `;

      document.getElementById('divRange')?.addEventListener('change', (e) => { range = e.target.value; paint(); });
      document.getElementById('divChartType')?.addEventListener('change', (e) => { chartType = e.target.value; paint(); });

      if (!series.length) return;
      const dark = document.documentElement.classList.contains('dark');
      if (charts.divChart) charts.divChart.destroy();
      charts.divChart = new Chart(document.getElementById('divChart'), {
        type: chartType,
        data: {
          labels: series.map(r => r.date),
          datasets: [{
            label: 'Dividend',
            data: series.map(r => r.amount),
            backgroundColor: chartType === 'bar' ? 'rgba(16,185,129,0.75)' : 'transparent',
            borderColor: '#10b981',
            borderWidth: chartType === 'line' ? 2 : 0,
            tension: 0.15,
            pointRadius: chartType === 'line' ? 2 : 0,
            borderRadius: 2,
            fill: chartType === 'line'
          }]
        },
        options: {
          responsive: true, maintainAspectRatio: false,
          plugins: { legend: { display: false } },
          scales: {
            x: { ticks: { color: dark ? '#94a3b8' : '#64748b', maxTicksLimit: 10, font: { size: 9 } }, grid: { display: false } },
            y: { ticks: { color: dark ? '#94a3b8' : '#64748b', font: { size: 9 } }, grid: { color: dark ? 'rgba(148,163,184,0.1)' : 'rgba(100,116,139,0.12)' } }
          }
        }
      });

      if (charts.divAnnual) charts.divAnnual.destroy();
      const aCanvas = document.getElementById('divAnnualChart');
      if (aCanvas && yearCols.length) {
        charts.divAnnual = new Chart(aCanvas, {
          type: 'bar',
          data: {
            labels: yearCols,
            datasets: [{ label: 'Annual DPS', data: annualTotals, backgroundColor: 'rgba(51,159,255,0.7)', borderRadius: 4 }]
          },
          options: {
            responsive: true, maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: {
              x: { ticks: { color: dark ? '#94a3b8' : '#64748b', font: { size: 9 } }, grid: { display: false } },
              y: { ticks: { color: dark ? '#94a3b8' : '#64748b', font: { size: 9 } }, grid: { color: dark ? 'rgba(148,163,184,0.1)' : 'rgba(100,116,139,0.12)' } }
            }
          }
        });
      }
    }

    paint();
  } catch (e) {
    body.innerHTML = `<div class="card p-6 text-center text-slate-500 text-sm">
      <p class="font-medium text-slate-700 dark:text-slate-300 mb-1">No dividend history for this symbol</p>
      <p class="text-xs">Many growth stocks do not pay dividends. Quote yield fields (if any) still appear when the company pays.</p>
    </div>`;
  }
}


/* ==================== Valuation — Assumptions / Income Forecast / Visualization ==================== */
/**
 * Discount-rate build-up aligned to sample business valuation report structure.
 * High-level Damodaran context retained for the three summary cards.
 */
const VAL_ASSUMPTIONS = {
  discountRate: 0.0835,
  discountRateLabel: '8.35%',
  discountRateSource: 'Aswath Damodaran — median US cost of capital (Data Update 6 for 2025)',
  erp: 0.0433,
  erpLabel: '4.33%',
  erpSource: 'Aswath Damodaran — implied ERP on S&P 500 at start of 2025',
  terminalGrowth: 0.025,
  terminalGrowthLabel: '2.5%',
  terminalGrowthSource: 'Long-run nominal growth cap (Damodaran: stable growth ≤ risk-free / economy growth)',
  years: 5,
  // Build-up table (sample valuation report structure)
  buildUp: [
    { element: 'Risk-free rate of return', value: 0.0300, notes: 'Current US Treasury bond yield is used.' },
    { element: 'Premium for equity investment', value: 0.0610, notes: 'Risk premium for investing in public company stock.' },
    { element: 'Premium for small company size', value: 0.0985, notes: 'Risk premium for investing in a small company.' },
    { element: 'Industry-specific risk premium', value: 0.0102, notes: 'SIC 8742, Management Consulting Services (illustrative; adjust by industry).' },
    { element: 'Company-specific risk premium', value: 0.0250, notes: 'Company-specific risk premium.' },
    { element: 'Equity Discount Rate', value: 0.2247, notes: 'Sum of the risk-free return plus the risk premia above.', bold: true },
    { element: 'Net Cash Flow Growth Rate', value: 0.0352, notes: 'Long-term growth rate in subject business Net Cash Flow.' },
    { element: 'Capitalization Rate', value: 0.1895, notes: 'Difference between the Equity Discount Rate and NCF Growth Rate above.', bold: true },
  ],
};

function valFmtPct(x) {
  if (x == null || isNaN(x)) return '—';
  return (Number(x) * 100).toFixed(3) + '%';
}
function valFmtMoney(x) {
  return isFmtMoney(x);
}
function valFmtPx(x) {
  if (x == null || isNaN(x)) return '—';
  return '$' + Number(x).toFixed(3);
}

function valPickBase(map, aliases, periods) {
  // Prefer calendar 2025, then 2024 only (never older) — periods may be newest-first
  if (!periods || !periods.length) return { val: null, period: null };
  const scored = periods.map(p => ({ p, y: isYearFromCol(p) }));
  const prefer = [2025, 2024];
  for (const y of prefer) {
    const hit = scored.find(s => s.y === y);
    if (hit) {
      const v = isLookup(map, aliases, hit.p);
      if (v != null && !isNaN(v)) return { val: v, period: hit.p };
    }
  }
  // Fallback: newest non-null among 2024–2025 only
  for (const s of scored) {
    if (s.y != null && s.y >= 2024 && s.y <= 2025) {
      const v = isLookup(map, aliases, s.p);
      if (v != null && !isNaN(v)) return { val: v, period: s.p };
    }
  }
  return { val: null, period: null };
}

async function renderValuation(sym, ctx) {
  const body = document.getElementById('valBody');
  if (!body) return;
  body.innerHTML = `<div class="flex justify-center py-10"><div class="w-8 h-8 border-4 border-brand-500 border-t-transparent rounded-full animate-spin"></div></div>`;

  let method = 'DCF';
  let tab = 'assumptions'; // assumptions | forecast | viz
  let quote = ctx.quote || {};
  let financials = null;
  try {
    if (!quote.marketCap) quote = await LiveAPI.quote(sym).catch(() => ({}));
    financials = await LiveAPI.financials(sym);
  } catch (e) {
    body.innerHTML = `<div class="card p-6 text-amber-600 text-sm">Could not load data for valuation: ${e.message}</div>`;
    return;
  }

  const inc = isParseMatrix(financials.income_statement || []);
  const cf = isParseMatrix(financials.cashflow || []);
  const bs = isParseMatrix(financials.balance_sheet || []);
  const periods = isFilterPeriods(inc.periods.length ? inc.periods : cf.periods, 'annual');
  // periods are newest → oldest (2025, 2024, …)
  const lastP = periods.length ? periods[0] : null;
  const prevP = periods.length > 1 ? periods[1] : null;

  // Base year picks (last available non-null)
  const pick = (aliases, src = inc) => valPickBase(src.map, aliases, src.periods.length ? isFilterPeriods(src.periods, 'annual') : periods);

  const revB = pick(['Total Revenue', 'Operating Revenue', 'Revenue']);
  const cogsB = pick(['Cost Of Revenue', 'Cost of Revenue', 'Reconciled Cost Of Revenue']);
  const gpB = pick(['Gross Profit']);
  const opexB = pick(['Operating Expense', 'Operating Expenses', 'Total Expenses']);
  const oiB = pick(['Operating Income', 'Operating Income Loss']);
  const otherB = pick(['Other Non Operating Income Expenses', 'Other Income Expense', 'Net Non Operating Interest Income Expense']);
  const ebtB = pick(['Pretax Income', 'Income Before Tax', 'EBT']);
  const taxB = pick(['Tax Provision', 'Income Tax Expense']);
  const niB = pick(['Net Income', 'Net Income Common Stockholders']);
  const daB = pick(['Depreciation And Amortization', 'Reconciled Depreciation'], cf);
  if (daB.val == null) {
    const d2 = pick(['Depreciation And Amortization', 'Depreciation']);
    if (d2.val != null) { daB.val = d2.val; daB.period = d2.period; }
  }
  const intB = pick(['Interest Expense', 'Interest Expense Non Operating']);
  const ocfB = pick(['Operating Cash Flow', 'Cash Flow From Continuing Operating Activities'], cf);
  const capexB = pick(['Capital Expenditure', 'Capital Expenditures'], cf);
  let fcfB = pick(['Free Cash Flow'], cf);
  if (fcfB.val == null && ocfB.val != null && capexB.val != null) {
    fcfB.val = capexB.val < 0 ? ocfB.val + capexB.val : ocfB.val - Math.abs(capexB.val);
    fcfB.period = ocfB.period;
  }
  const divB = pick(['Cash Dividends Paid', 'Common Stock Dividend Paid', 'Payment Of Dividends'], cf);
  const sharesB = pick(['Diluted Average Shares', 'Basic Average Shares']);
  const cashB = pick(['Cash And Cash Equivalents', 'Cash Cash Equivalents And Short Term Investments'], bs);
  const debtB = pick(['Total Debt'], bs);
  let debt0 = debtB.val;
  if (debt0 == null) {
    const cd = pick(['Current Debt', 'Current Debt And Capital Lease Obligation'], bs);
    const ld = pick(['Long Term Debt', 'Long Term Debt And Capital Lease Obligation'], bs);
    if (cd.val != null || ld.val != null) debt0 = (cd.val || 0) + (ld.val || 0);
  }

  const revenue0 = revB.val;
  const ni0 = niB.val;
  const fcf0 = fcfB.val;
  const shares = sharesB.val;
  const cash = cashB.val;
  const debt = debt0;

  // Growth
  let gRev = null;
  const revenuePrev = prevP ? isLookup(inc.map, ['Total Revenue', 'Operating Revenue', 'Revenue'], prevP) : null;
  if (revenue0 != null && revenuePrev != null && revenuePrev !== 0) gRev = (revenue0 - revenuePrev) / Math.abs(revenuePrev);
  if (periods.length >= 3) {
    const rFirst = isLookup(inc.map, ['Total Revenue', 'Operating Revenue', 'Revenue'], periods[0]);
    if (rFirst && revenue0 && rFirst > 0) {
      const yrs = Math.max(1, periods.length - 1);
      const cagr = Math.pow(revenue0 / rFirst, 1 / yrs) - 1;
      gRev = gRev == null ? cagr : (gRev * 0.4 + cagr * 0.6);
    }
  }
  if (gRev == null) gRev = 0.06;
  const highGrowth = Math.max(-0.05, Math.min(0.25, gRev));
  const marginFCF = (fcf0 != null && revenue0) ? fcf0 / revenue0 : 0.08;
  const dps0 = quote.dividendRate != null ? quote.dividendRate
    : (quote.trailingEps != null ? quote.trailingEps * 0.3 : null);

  // Ratios from base year for forecast bridge
  function ratio(num, den) {
    if (num == null || den == null || den === 0) return null;
    return num / den;
  }
  const r = {
    returnsDisc: 0.02, // illustrative returns/discounts as % of gross
    cogs: ratio(cogsB.val, revenue0) ?? 0.55,
    opex: ratio(opexB.val, revenue0) ?? 0.25,
    other: ratio(otherB.val, revenue0) ?? 0,
    tax: (ebtB.val && taxB.val != null && ebtB.val !== 0) ? Math.abs(taxB.val / ebtB.val) : 0.21,
    da: ratio(daB.val, revenue0) ?? 0.04,
    interest: ratio(intB.val, revenue0) ?? 0.01,
    wcChange: -0.01, // % of sales — mild WC use
    capex: ratio(capexB.val != null ? Math.abs(capexB.val) : null, revenue0) ?? 0.05,
    dividends: ratio(divB.val != null ? Math.abs(divB.val) : null, revenue0) ?? 0.02,
    ni: ratio(ni0, revenue0) ?? 0.10,
  };

  function stageGrowth(t) {
    const w = (t - 1) / Math.max(1, VAL_ASSUMPTIONS.years - 1);
    return highGrowth * (1 - w) + VAL_ASSUMPTIONS.terminalGrowth * w;
  }

  /** Full income & expense forecast for 5 years from base */
  function buildFullForecast() {
    const rows = [];
    let gross = revenue0;
    for (let t = 1; t <= VAL_ASSUMPTIONS.years; t++) {
      const g = stageGrowth(t);
      gross = gross != null ? gross * (1 + g) : null;
      if (gross == null) {
        rows.push({ year: t, label: 'Y+' + t, growth: g });
        continue;
      }
      const returns = gross * r.returnsDisc;
      const netSales = gross - returns;
      const cogs = netSales * r.cogs;
      const gp = netSales - cogs;
      const opex = netSales * r.opex;
      const oi = gp - opex;
      const other = netSales * r.other;
      const ebt = oi + other;
      const taxes = ebt > 0 ? ebt * r.tax : 0;
      const ni = ebt - taxes;
      const da = netSales * r.da;
      const interest = netSales * r.interest;
      const ebitda = oi + da;
      const wc = netSales * r.wcChange;
      const capex = netSales * r.capex;
      const divs = netSales * r.dividends;
      // Net cash flow ≈ NI + DA − interest adjustment already in NI path + WC + (−capex) − dividends
      // Align with sample: NCF = NI + DA + Interest (add-back if after interest) + ΔWC − Capex − Dividends
      const ncf = ni + da + interest + wc - capex - divs;
      rows.push({
        year: t, label: 'Y+' + t, growth: g,
        gross, returns, netSales, cogs, gp, opex, oi, other, ebt, taxes, ni,
        da, interest, ebitda, wc, capex, divs, ncf,
        fcf: ncf,
        dps: dps0 != null ? dps0 * Math.pow(1 + g, t) : null,
        revenue: gross,
      });
    }
    return rows;
  }

  function dcfValue(forecast) {
    const discR = VAL_ASSUMPTIONS.discountRate;
    const gT = VAL_ASSUMPTIONS.terminalGrowth;
    let pv = 0;
    const detail = [];
    forecast.forEach((row, i) => {
      const t = i + 1;
      const cashf = row.ncf != null ? row.ncf : row.fcf;
      const disc = cashf != null ? cashf / Math.pow(1 + discR, t) : null;
      if (disc != null) pv += disc;
      detail.push({ t, cf: cashf, disc });
    });
    const last = forecast[forecast.length - 1];
    const lastFcf = last?.ncf ?? last?.fcf;
    let tv = null, pvTv = null;
    if (lastFcf != null && discR > gT) {
      tv = (lastFcf * (1 + gT)) / (discR - gT);
      pvTv = tv / Math.pow(1 + discR, forecast.length);
      pv += pvTv;
    }
    const netDebt = (debt || 0) - (cash || 0);
    const equityVal = pv - netDebt;
    const shareCount = shares || quote.sharesOutstanding || null;
    const valuePerShare = (equityVal != null && shareCount) ? equityVal / shareCount : null;
    return { enterprisePV: pv, terminalValue: tv, pvTerminal: pvTv, netDebt, equityVal, shareCount, valuePerShare, detail };
  }

  function ddmValue(forecast) {
    const discR = VAL_ASSUMPTIONS.discountRate;
    const gT = VAL_ASSUMPTIONS.terminalGrowth;
    let pv = 0;
    const detail = [];
    forecast.forEach((row, i) => {
      const t = i + 1;
      const div = row.dps;
      const disc = div != null ? div / Math.pow(1 + discR, t) : null;
      if (disc != null) pv += disc;
      detail.push({ t, div, disc });
    });
    const lastDps = forecast[forecast.length - 1]?.dps;
    let tv = null, pvTv = null;
    if (lastDps != null && discR > gT) {
      tv = (lastDps * (1 + gT)) / (discR - gT);
      pvTv = tv / Math.pow(1 + discR, forecast.length);
      pv += pvTv;
    }
    return { equityVal: pv, terminalValue: tv, pvTerminal: pvTv, valuePerShare: pv, detail };
  }

  function baseYearLabel() {
    // Display heading fixed as 2025 (data may be 2025 or 2024 per valPickBase)
    return '2025';
  }

  function paint() {
    const forecast = buildFullForecast();
    const result = method === 'DDM' ? ddmValue(forecast) : dcfValue(forecast);
    const price = quote.currentPrice ?? quote.previousClose ?? null;
    const upside = (result.valuePerShare != null && price) ? (result.valuePerShare / price - 1) * 100 : null;
    const baseY = baseYearLabel();

    body.innerHTML = `
      <div class="mb-4">
        <h3 class="text-lg font-bold">Valuation</h3>
        <p class="text-sm text-slate-500">${sym} · ${VAL_ASSUMPTIONS.years}-year explicit forecast from trailing fundamentals · illustrative model only</p>
      </div>

      <div class="flex gap-1 overflow-x-auto task-bar mb-4" id="valTabs">
        <button class="sub-tab ${tab==='assumptions'?'active':''}" data-valtab="assumptions">Assumptions</button>
        <button class="sub-tab ${tab==='forecast'?'active':''}" data-valtab="forecast">Income &amp; Expense Forecast</button>
        <button class="sub-tab ${tab==='viz'?'active':''}" data-valtab="viz">Visualization</button>
      </div>

      <div class="card p-3 sm:p-4 mb-4">
        <div class="flex flex-wrap items-center justify-between gap-3">
          <div>
            <label class="text-xs font-medium text-slate-500 mb-1 block">Valuation method</label>
            <select id="valMethod" class="text-sm border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 bg-white dark:bg-slate-900">
              <option value="DCF" ${method==='DCF'?'selected':''}>DCF — Discounted Net Cash Flow</option>
              <option value="DDM" ${method==='DDM'?'selected':''}>DDM — Dividend Discount Model</option>
            </select>
          </div>
          <div class="text-right">
            <p class="text-xs text-slate-500">Model value / share</p>
            <p class="text-2xl font-extrabold text-brand-600">${valFmtPx(result.valuePerShare)}</p>
            <p class="text-xs ${upside!=null && upside>=0?'pos':'neg'}">${upside==null?'—':((upside>=0?'+':'')+upside.toFixed(1)+'% vs market')}</p>
            <p class="text-[11px] text-slate-400">Market: ${valFmtPx(price)}</p>
          </div>
        </div>
      </div>

      <div id="valPanel"></div>
    `;

    document.getElementById('valMethod')?.addEventListener('change', (e) => {
      method = e.target.value;
      paint();
    });
    document.querySelectorAll('#valTabs .sub-tab').forEach(btn => {
      btn.addEventListener('click', () => {
        tab = btn.dataset.valtab;
        paint();
      });
    });

    const panel = document.getElementById('valPanel');
    if (tab === 'assumptions') {
      panel.innerHTML = renderAssumptionsTab(highGrowth, marginFCF, result);
    } else if (tab === 'forecast') {
      panel.innerHTML = renderForecastTab(forecast, baseY, {
        gross: revenue0,
        returns: revenue0 != null ? revenue0 * r.returnsDisc : null,
        netSales: revenue0 != null ? revenue0 * (1 - r.returnsDisc) : null,
        cogs: cogsB.val,
        gp: gpB.val,
        opex: opexB.val,
        oi: oiB.val,
        other: otherB.val,
        ebt: ebtB.val,
        taxes: taxB.val,
        ni: ni0,
        da: daB.val,
        interest: intB.val,
        ebitda: (oiB.val != null && daB.val != null) ? oiB.val + daB.val : null,
        wc: revenue0 != null ? revenue0 * r.wcChange : null,
        capex: capexB.val != null ? Math.abs(capexB.val) : null,
        divs: divB.val != null ? Math.abs(divB.val) : null,
        ncf: fcf0,
      });
    } else {
      panel.innerHTML = renderVizTab();
      drawVizCharts(forecast, baseY);
    }
  }

  function renderAssumptionsTab(highGrowth, marginFCF, result) {
    return `
      <div class="card p-4 mb-5">
        <h4 class="text-sm font-semibold mb-2">Key Assumptions (analyst-sourced)</h4>
        <div class="grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm">
          <div class="p-3 rounded-lg bg-slate-50 dark:bg-slate-800/50">
            <p class="text-xs text-slate-500">Discount rate (r)</p>
            <p class="text-lg font-bold">${VAL_ASSUMPTIONS.discountRateLabel}</p>
            <p class="text-[11px] text-slate-400 mt-1">${VAL_ASSUMPTIONS.discountRateSource}</p>
          </div>
          <div class="p-3 rounded-lg bg-slate-50 dark:bg-slate-800/50">
            <p class="text-xs text-slate-500">Equity risk premium (context)</p>
            <p class="text-lg font-bold">${VAL_ASSUMPTIONS.erpLabel}</p>
            <p class="text-[11px] text-slate-400 mt-1">${VAL_ASSUMPTIONS.erpSource}</p>
          </div>
          <div class="p-3 rounded-lg bg-slate-50 dark:bg-slate-800/50">
            <p class="text-xs text-slate-500">Terminal growth (g)</p>
            <p class="text-lg font-bold">${VAL_ASSUMPTIONS.terminalGrowthLabel}</p>
            <p class="text-[11px] text-slate-400 mt-1">${VAL_ASSUMPTIONS.terminalGrowthSource}</p>
          </div>
        </div>
        <p class="text-[11px] text-slate-400 mt-3">High-growth stage starts from trailing fundamentals (≈ <strong>${valFmtPct(highGrowth)}</strong>), then fades linearly to terminal g over ${VAL_ASSUMPTIONS.years} years. FCF / sales held near trailing (${valFmtPct(marginFCF)}).</p>
      </div>

      <div class="card p-4 mb-5">
        <h4 class="text-sm font-semibold mb-2">Discount Rate Elements</h4>
        <p class="text-[11px] text-slate-400 mb-3">Build-up method (illustrative schedule aligned to sample business valuation reports). Values can be treated as scenario inputs for capitalization / equity discount.</p>
        <div class="fin-scroll">
          <table class="data-table is-table w-full">
            <thead>
              <tr>
                <th class="text-left">Risk Element</th>
                <th class="text-right">Value</th>
                <th class="text-left">Notes</th>
              </tr>
            </thead>
            <tbody>
              ${VAL_ASSUMPTIONS.buildUp.map(row => `
                <tr class="${row.bold ? 'font-semibold' : ''}">
                  <td class="text-left">${row.element}</td>
                  <td class="text-right">${(row.value * 100).toFixed(2)}%</td>
                  <td class="text-left text-xs text-slate-500 whitespace-normal max-w-[280px]">${row.notes}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </div>

      <div class="card p-4 mb-5">
        <h4 class="text-sm font-semibold mb-3">Valuation bridge (${method})</h4>
        ${method === 'DCF' ? `
        <div class="fin-scroll">
          <table class="data-table is-table w-full">
            <thead><tr><th class="text-left">Component</th><th class="text-right">Value</th></tr></thead>
            <tbody>
              ${(result.detail||[]).map(d => `<tr><td>PV of NCF year ${d.t}</td><td class="text-right">${valFmtMoney(d.disc)}</td></tr>`).join('')}
              <tr><td>Terminal value</td><td class="text-right">${valFmtMoney(result.terminalValue)}</td></tr>
              <tr><td>PV of terminal value</td><td class="text-right">${valFmtMoney(result.pvTerminal)}</td></tr>
              <tr><td class="font-semibold">Enterprise value (PV)</td><td class="text-right font-semibold">${valFmtMoney(result.enterprisePV)}</td></tr>
              <tr><td>Less: net debt</td><td class="text-right">${valFmtMoney(result.netDebt)}</td></tr>
              <tr><td class="font-semibold">Equity value</td><td class="text-right font-semibold">${valFmtMoney(result.equityVal)}</td></tr>
              <tr><td>Shares</td><td class="text-right">${result.shareCount!=null?Number(result.shareCount).toLocaleString(undefined,{maximumFractionDigits:0}):'—'}</td></tr>
              <tr><td class="font-bold">Intrinsic value / share</td><td class="text-right font-bold text-brand-600">${valFmtPx(result.valuePerShare)}</td></tr>
            </tbody>
          </table>
        </div>` : `
        <div class="fin-scroll">
          <table class="data-table is-table w-full">
            <thead><tr><th class="text-left">Component</th><th class="text-right">Value</th></tr></thead>
            <tbody>
              ${(result.detail||[]).map(d => `<tr><td>PV of DPS year ${d.t}</td><td class="text-right">${d.disc!=null?valFmtPx(d.disc):'—'}</td></tr>`).join('')}
              <tr><td>Terminal price (Gordon)</td><td class="text-right">${result.terminalValue!=null?valFmtPx(result.terminalValue):'—'}</td></tr>
              <tr><td>PV of terminal price</td><td class="text-right">${result.pvTerminal!=null?valFmtPx(result.pvTerminal):'—'}</td></tr>
              <tr><td class="font-bold">Intrinsic value / share</td><td class="text-right font-bold text-brand-600">${valFmtPx(result.valuePerShare)}</td></tr>
            </tbody>
          </table>
        </div>`}
        <p class="text-[11px] text-slate-400 mt-3 leading-relaxed"><strong>Disclaimer:</strong> Educational illustration only — not investment advice. Build-up rates are scenario defaults; live DCF uses Damodaran median cost of capital (${VAL_ASSUMPTIONS.discountRateLabel}) unless you treat the equity discount rate above as a sensitivity case.</p>
      </div>
    `;
  }

  function renderForecastTab(forecast, baseY, base) {
    const lines = [
      { key: 'gross', label: 'Gross revenues' },
      { key: 'returns', label: 'Less returns and discounts' },
      { key: 'netSales', label: 'Net Sales' },
      { key: 'cogs', label: 'Cost of Goods Sold (COGS)' },
      { key: 'gp', label: 'Gross Profit' },
      { key: 'opex', label: 'Operating Expenses' },
      { key: 'oi', label: 'Operating Income' },
      { key: 'other', label: 'Other income / (expenses)' },
      { key: 'ebt', label: 'Net Pre-Tax Income' },
      { key: 'taxes', label: 'Taxes' },
      { key: 'ni', label: 'Net Income' },
      { key: 'da', label: 'Depreciation and Amortization expense', indent: true },
      { key: 'interest', label: 'Interest expense', indent: true },
      { key: 'ebitda', label: 'EBITDA' },
      { key: 'wc', label: 'Changes in working capital' },
      { key: 'capex', label: 'Capital investments' },
      { key: 'divs', label: 'Dividend payouts / Partner Draws' },
      { key: 'ncf', label: 'Net Cash Flow' },
    ];
    return `
      <div class="card p-3 sm:p-4 mb-5">
        <h4 class="text-sm font-semibold mb-1">Income &amp; Expense Forecast</h4>
        <p class="text-[11px] text-slate-400 mb-3">
          Base column is labeled <strong>2025</strong> and uses the latest annual figures from 2025 (or 2024 if 2025 is unavailable).
          Forward years scale with staged growth (trailing ≈ ${valFmtPct(highGrowth)} → terminal ${VAL_ASSUMPTIONS.terminalGrowthLabel}) and trailing margin structure from Financials.
        </p>
        <div class="val-scroll">
          <table class="data-table is-table w-full">
            <thead>
              <tr>
                <th class="text-left">Forecast Income/Expense Items</th>
                <th class="text-right">Base (${baseY})</th>
                ${forecast.map(r => `<th class="text-right">${r.label}</th>`).join('')}
              </tr>
            </thead>
            <tbody>
              ${lines.map(line => `
                <tr>
                  <td class="text-left ${line.indent ? 'pl-4 text-slate-600 dark:text-slate-300' : ''}">${line.indent ? '• ' : ''}${line.label}</td>
                  <td class="text-right">${valFmtMoney(base[line.key])}</td>
                  ${forecast.map(r => `<td class="text-right">${valFmtMoney(r[line.key])}</td>`).join('')}
                </tr>
              `).join('')}
              <tr>
                <td class="text-left text-slate-500">Revenue growth (staged)</td>
                <td class="text-right">${valFmtPct(highGrowth)}</td>
                ${forecast.map(r => `<td class="text-right">${valFmtPct(r.growth)}</td>`).join('')}
              </tr>
            </tbody>
          </table></div>
        </div>
      </div>
    `;
  }

  function renderVizTab() {
    const blocks = [
      { id: 'valVizRev', title: 'Gross Revenue Trajectory', desc: 'Projected gross revenues over the explicit forecast horizon, starting from the latest reported annual sales.' },
      { id: 'valVizProfit', title: 'Profit Stack — Gross, Operating, Net', desc: 'Compares gross profit, operating income and net income year by year to show how margins flow through the P&L.' },
      { id: 'valVizEbitda', title: 'EBITDA vs Net Cash Flow', desc: 'EBITDA captures operating cash-like earnings before reinvestment; Net Cash Flow reflects WC, capex and distributions.' },
      { id: 'valVizCash', title: 'Cash Uses — Capex, Working Capital, Dividends', desc: 'Shows capital investments, working-capital changes and dividend / partner draws embedded in the forecast.' },
    ];
    return `
      <div class="space-y-5">
        ${blocks.map(b => `
          <div class="card p-3 sm:p-4">
            <h4 class="text-sm font-semibold">${b.title}</h4>
            <p class="text-[11px] text-slate-400 mb-3">${b.desc}</p>
            <div class="chart-container" style="height:240px"><canvas id="${b.id}"></canvas></div>
            <p class="text-[11px] text-slate-500 mt-3 leading-relaxed" id="${b.id}Insight">Generating insight…</p>
          </div>
        `).join('')}
      </div>
    `;
  }

  function drawVizCharts(forecast, baseY) {
    const dark = document.documentElement.classList.contains('dark');
    const labels = forecast.map(r => r.label);
    const tick = { color: dark ? '#94a3b8' : '#64748b', font: { size: 10 } };
    const grid = { color: dark ? 'rgba(148,163,184,0.1)' : 'rgba(100,116,139,0.12)' };
    const moneyCb = (v) => isFmtMoney(v);

    function insightTrend(name, vals) {
      const nums = vals.filter(v => v != null && !isNaN(v));
      if (nums.length < 2) return `${name}: insufficient projected points.`;
      const first = nums[0], last = nums[nums.length - 1];
      const chg = first !== 0 ? ((last - first) / Math.abs(first)) * 100 : null;
      if (chg == null) return `${name} ends near ${isFmtMoney(last)}.`;
      if (chg > 15) return `${name} expands about ${chg.toFixed(0)}% across the ${VAL_ASSUMPTIONS.years}-year window — growth assumptions remain the dominant driver of terminal value.`;
      if (chg < -10) return `${name} contracts about ${Math.abs(chg).toFixed(0)}% over the horizon — stress-test margins and reinvestment if this path looks conservative vs management guidance.`;
      return `${name} is relatively stable (~${chg.toFixed(0)}% cumulative). Focus shifts to margin quality and the discount rate rather than top-line acceleration.`;
    }

    const chartsSpec = [
      {
        id: 'valVizRev',
        type: 'bar',
        datasets: [{ label: 'Gross revenues', data: forecast.map(r => r.gross), backgroundColor: 'rgba(51,159,255,0.75)', borderRadius: 4 }],
        insight: insightTrend('Gross revenue', forecast.map(r => r.gross)),
      },
      {
        id: 'valVizProfit',
        type: 'line',
        datasets: [
          { label: 'Gross Profit', data: forecast.map(r => r.gp), borderColor: '#10b981', backgroundColor: 'transparent', tension: 0.25 },
          { label: 'Operating Income', data: forecast.map(r => r.oi), borderColor: '#f59e0b', backgroundColor: 'transparent', tension: 0.25 },
          { label: 'Net Income', data: forecast.map(r => r.ni), borderColor: '#8b5cf6', backgroundColor: 'transparent', tension: 0.25 },
        ],
        insight: (() => {
          const gp = forecast.map(r => r.gp), ni = forecast.map(r => r.ni);
          const lastGp = gp[gp.length - 1], lastNi = ni[ni.length - 1];
          if (lastGp && lastNi != null) {
            const m = (lastNi / lastGp) * 100;
            return `By ${forecast[forecast.length - 1].label}, net income is ~${m.toFixed(0)}% of gross profit in this margin-constant model. ${insightTrend('Net income', ni)}`;
          }
          return insightTrend('Operating income', forecast.map(r => r.oi));
        })(),
      },
      {
        id: 'valVizEbitda',
        type: 'line',
        datasets: [
          { label: 'EBITDA', data: forecast.map(r => r.ebitda), borderColor: '#339fff', backgroundColor: 'rgba(51,159,255,0.12)', fill: true, tension: 0.25 },
          { label: 'Net Cash Flow', data: forecast.map(r => r.ncf), borderColor: '#ef4444', backgroundColor: 'transparent', tension: 0.25 },
        ],
        insight: (() => {
          const gap = forecast.map(r => (r.ebitda != null && r.ncf != null) ? r.ebitda - r.ncf : null).filter(v => v != null);
          const avg = gap.length ? gap.reduce((a, b) => a + b, 0) / gap.length : null;
          return avg != null
            ? `EBITDA exceeds net cash flow by ~${isFmtMoney(avg)} on average — the gap is reinvestment (capex/WC) and distributions. ${insightTrend('Net cash flow', forecast.map(r => r.ncf))}`
            : insightTrend('EBITDA', forecast.map(r => r.ebitda));
        })(),
      },
      {
        id: 'valVizCash',
        type: 'bar',
        datasets: [
          { label: 'Capex', data: forecast.map(r => r.capex), backgroundColor: 'rgba(245,158,11,0.8)', borderRadius: 3 },
          { label: 'WC change', data: forecast.map(r => r.wc), backgroundColor: 'rgba(139,92,246,0.75)', borderRadius: 3 },
          { label: 'Dividends', data: forecast.map(r => r.divs), backgroundColor: 'rgba(16,185,129,0.75)', borderRadius: 3 },
        ],
        insight: `Capital investments, working-capital needs and dividends are held as steady shares of sales (from trailing structure). ${insightTrend('Capital investment', forecast.map(r => r.capex))}`,
      },
    ];

    chartsSpec.forEach(spec => {
      const canvas = document.getElementById(spec.id);
      const insightEl = document.getElementById(spec.id + 'Insight');
      if (insightEl) insightEl.textContent = spec.insight;
      if (!canvas) return;
      if (charts[spec.id]) charts[spec.id].destroy();
      charts[spec.id] = new Chart(canvas, {
        type: spec.type,
        data: { labels, datasets: spec.datasets },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { labels: { color: tick.color, boxWidth: 10, font: { size: 10 } } },
            tooltip: { callbacks: { label: (c) => c.dataset.label + ': ' + isFmtMoney(c.parsed.y) } },
          },
          scales: {
            x: { ticks: tick, grid: { display: false } },
            y: { ticks: { ...tick, callback: moneyCb }, grid },
          },
        },
      });
    });
  }

  paint();
}





/* ==================== STOCK SELECTION (MULTI COMPARE) ==================== */
function renderSelection() {
  const el = document.getElementById('panel-selection');
  el.innerHTML = `
    <div class="mb-4">
      <h2 class="text-xl font-bold mb-1">Stock Selection — Side-by-Side Analysis</h2>
      <p class="text-sm text-slate-500">Compare up to 5 stocks: Overview, Price History, Ratios, and System Recommendation. Peers from the same industry are suggested below.</p>
    </div>
    <div class="card p-4 mb-4 relative max-w-lg">
      <label class="text-xs font-medium text-slate-500 mb-1 block">Add Stock (max 5)</label>
      <input id="selSearch" type="text" placeholder="Symbol or name..."
        class="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" />
      <div id="selDropdown" class="search-dropdown hidden"></div>
      <div class="flex flex-wrap gap-2 mt-3" id="selChips"></div>
    </div>
    <div id="selPeers" class="mb-5"></div>
    <div id="selResults"><div class="text-center py-12 text-slate-400 text-sm">Add stocks to compare.</div></div>
  `;

  const input = document.getElementById('selSearch');
  const dropdown = document.getElementById('selDropdown');
  input.addEventListener('input', () => {
    const q = input.value.trim().toLowerCase();
    if (q.length < 1) { dropdown.classList.add('hidden'); return; }
    const hits = UNIVERSE.filter(s =>
      (s.Symbol && s.Symbol.toLowerCase().includes(q)) ||
      (s.CompanyName && s.CompanyName.toLowerCase().includes(q))
    ).slice(0, 12);
    dropdown.innerHTML = hits.map(s => `
      <div class="search-item" data-sym="${s.Symbol}">
        <div class="sym">${s.Symbol}</div>
        <div class="meta">${s.CompanyName || ''} · ${s.Sector || ''}</div>
      </div>
    `).join('');
    dropdown.classList.remove('hidden');
    dropdown.querySelectorAll('.search-item').forEach(item => {
      item.addEventListener('click', () => {
        addMulti(item.dataset.sym);
        input.value = '';
        dropdown.classList.add('hidden');
      });
    });
  });
  input.addEventListener('blur', () => setTimeout(() => dropdown.classList.add('hidden'), 200));

  // Default: carry active analysis stock
  if (selectedSym && !multiSelect.includes(selectedSym)) {
    multiSelect = [selectedSym, ...multiSelect].slice(0, 5);
  }
  renderMultiChips();
  renderPeerSuggestions();
  if (multiSelect.length) runMultiCompare();
}

function industryPeers(sym, limit = 12) {
  const uni = UNIVERSE.find(u => u.Symbol === sym);
  if (!uni || !uni.Industry) return [];
  return UNIVERSE.filter(u => u.Industry === uni.Industry && u.Symbol !== sym)
    .slice(0, limit);
}

function renderPeerSuggestions() {
  const host = document.getElementById('selPeers');
  if (!host) return;
  const seed = multiSelect[0] || selectedSym;
  if (!seed) {
    host.innerHTML = '';
    return;
  }
  const peers = industryPeers(seed, 16);
  const uni = UNIVERSE.find(u => u.Symbol === seed);
  host.innerHTML = `
    <div class="card p-4">
      <h4 class="text-sm font-semibold mb-1">Recommended — same industry</h4>
      <p class="text-[11px] text-slate-400 mb-3">${uni?.Industry || 'Peers'} · based on ${seed}. Click to add (max 5).</p>
      <div class="flex flex-wrap gap-2">
        ${peers.length ? peers.map(p => `
          <button type="button" class="peer-add-btn px-2.5 py-1 text-xs rounded-lg border border-slate-200 dark:border-slate-700 hover:border-brand-500 hover:text-brand-600 ${multiSelect.includes(p.Symbol)?'opacity-40':''}"
            data-sym="${p.Symbol}" ${multiSelect.includes(p.Symbol)?'disabled':''}>
            <span class="font-bold">${p.Symbol}</span>
            <span class="text-slate-400 ml-1">${(p.CompanyName||'').slice(0,18)}</span>
          </button>
        `).join('') : '<span class="text-xs text-slate-400">No industry peers found in universe.</span>'}
      </div>
    </div>
  `;
  host.querySelectorAll('.peer-add-btn').forEach(btn => {
    btn.addEventListener('click', () => addMulti(btn.dataset.sym));
  });
}

function addMulti(sym) {
  if (multiSelect.includes(sym)) return;
  if (multiSelect.length >= 5) { alert('Max 5 stocks'); return; }
  multiSelect.push(sym);
  carryToReports = true;
  if (!selectedSym) selectedSym = sym;
  renderMultiChips();
  renderPeerSuggestions();
  runMultiCompare();
}
function removeMulti(sym) {
  multiSelect = multiSelect.filter(s => s !== sym);
  renderMultiChips();
  renderPeerSuggestions();
  runMultiCompare();
}
window.removeMulti = removeMulti;

function renderMultiChips() {
  const el = document.getElementById('selChips');
  if (!el) return;
  el.innerHTML = multiSelect.map(s => `
    <span class="stock-chip">${s}<button onclick="removeMulti('${s}')">×</button></span>
  `).join('');
}

async function runMultiCompare() {
  const el = document.getElementById('selResults');
  if (!el) return;
  if (!multiSelect.length) {
    el.innerHTML = `<div class="text-center py-12 text-slate-400 text-sm">Add stocks to compare.</div>`;
    return;
  }
  el.innerHTML = `<div class="flex justify-center py-8"><div class="w-8 h-8 border-4 border-brand-500 border-t-transparent rounded-full animate-spin"></div></div>`;

  const profiles = [];
  for (const sym of multiSelect) {
    const uni = UNIVERSE.find(u => u.Symbol === sym);
    let rank = null;
    if (uni) {
      try {
        const all = await loadSectorRankings(uni.Sector);
        rank = all.find(r => r.Symbol === sym) || null;
      } catch (_) {}
    }
    let quote = {};
    try { quote = await LiveAPI.quote(sym); } catch (_) {
      try { quote = await fetchLiveQuote(sym) || {}; } catch (__) {}
    }
    profiles.push({
      Symbol: sym,
      Company: quote?.shortName || rank?.['Company Name'] || uni?.CompanyName || sym,
      Sector: quote?.sector || rank?.Sector || uni?.Sector || '—',
      Industry: quote?.industry || rank?.Industry || uni?.Industry || '—',
      rank,
      quote: quote || {},
    });
  }

  let tab = 'overview'; // overview | price | ratios | system
  let pricePeriod = '1y';

  function paintShell() {
    el.innerHTML = `
      <div class="flex gap-1 overflow-x-auto task-bar mb-4" id="cmpTabs">
        <button class="sub-tab ${tab==='overview'?'active':''}" data-cmp="overview">Overview</button>
        <button class="sub-tab ${tab==='price'?'active':''}" data-cmp="price">Price History</button>
        <button class="sub-tab ${tab==='ratios'?'active':''}" data-cmp="ratios">Ratios</button>
        <button class="sub-tab ${tab==='system'?'active':''}" data-cmp="system">System Recommendation</button>
      </div>
      <div id="cmpBody"><div class="flex justify-center py-8"><div class="w-8 h-8 border-4 border-brand-500 border-t-transparent rounded-full animate-spin"></div></div></div>
    `;
    document.querySelectorAll('#cmpTabs .sub-tab').forEach(btn => {
      btn.addEventListener('click', () => {
        tab = btn.dataset.cmp;
        paintShell();
      });
    });
    renderCmpTab();
  }

  function highlightBest(values, higherIsBetter = true) {
    const nums = values.map(v => (v == null || isNaN(v) ? null : Number(v)));
    const valid = nums.filter(v => v != null);
    if (!valid.length) return values.map(() => '');
    const best = higherIsBetter ? Math.max(...valid) : Math.min(...valid);
    return nums.map(v => v == null ? '' : (v === best ? 'font-semibold text-emerald-600 dark:text-emerald-400' : ''));
  }

  function insightList(items) {
    if (!items.length) return '';
    return `<div class="card p-4 mt-4"><h4 class="text-sm font-semibold mb-2">Automated insights</h4>
      <ul class="space-y-1.5 text-[12px] text-slate-600 dark:text-slate-300 list-disc pl-4">
        ${items.map(t => `<li>${t}</li>`).join('')}
      </ul></div>`;
  }

  async function renderCmpTab() {
    const host = document.getElementById('cmpBody');
    if (!host) return;
    if (tab === 'overview') renderOverview(host);
    else if (tab === 'price') await renderPrice(host);
    else if (tab === 'ratios') await renderRatios(host);
    else renderSystem(host);
  }

  function renderOverview(host) {
    const COLORS = ['#339fff','#10b981','#f59e0b','#ef4444','#8b5cf6'];
    const headers = profiles.map(p => p.Symbol);
    const snapMetrics = [
      { label: 'Company', get: p => p.Company, fmt: v => v },
      { label: 'Sector', get: p => p.Sector, fmt: v => v },
      { label: 'Industry', get: p => p.Industry, fmt: v => v },
      { label: 'Price', get: p => p.quote.currentPrice ?? p.quote.previousClose, fmt: v => v == null ? '—' : '$' + Number(v).toFixed(2), higher: true },
      { label: 'Market Cap', get: p => p.quote.marketCap, fmt: v => v == null ? '—' : fmt.mcap(v), higher: true },
      { label: 'Trailing PE', get: p => p.quote.trailingPE, fmt: v => v == null ? '—' : Number(v).toFixed(2), higher: false },
      { label: 'Forward PE', get: p => p.quote.forwardPE, fmt: v => v == null ? '—' : Number(v).toFixed(2), higher: false },
      { label: 'Div Yield', get: p => p.quote.dividendYield, fmt: v => v == null ? '—' : (Number(v)*100).toFixed(2)+'%', higher: true },
      { label: 'Profit Margin', get: p => p.quote.profitMargins, fmt: v => v == null ? '—' : (Number(v)*100).toFixed(2)+'%', higher: true },
      { label: 'ROE', get: p => p.quote.returnOnEquity, fmt: v => v == null ? '—' : (Number(v)*100).toFixed(2)+'%', higher: true },
      { label: 'Beta', get: p => p.quote.beta, fmt: v => v == null ? '—' : Number(v).toFixed(2), higher: false },
    ];
    const insights = [];
    const mcaps = profiles.map(p => p.quote.marketCap).filter(v => v != null);
    if (mcaps.length >= 2) {
      const iMax = profiles.reduce((bi, p, i) => (p.quote.marketCap != null && (bi < 0 || p.quote.marketCap > profiles[bi].quote.marketCap) ? i : bi), -1);
      const iMin = profiles.reduce((bi, p, i) => (p.quote.marketCap != null && (bi < 0 || p.quote.marketCap < profiles[bi].quote.marketCap) ? i : bi), -1);
      if (iMax >= 0 && iMin >= 0) insights.push(`Largest by market cap is <strong>${profiles[iMax].Symbol}</strong> (${fmt.mcap(profiles[iMax].quote.marketCap)}); smallest is <strong>${profiles[iMin].Symbol}</strong> (${fmt.mcap(profiles[iMin].quote.marketCap)}).`);
    }
    const pes = profiles.map(p => ({ s: p.Symbol, pe: p.quote.trailingPE })).filter(x => x.pe != null && x.pe > 0);
    if (pes.length >= 2) {
      pes.sort((a, b) => a.pe - b.pe);
      insights.push(`Cheapest on trailing PE is <strong>${pes[0].s}</strong> (${pes[0].pe.toFixed(1)}x); richest is <strong>${pes[pes.length-1].s}</strong> (${pes[pes.length-1].pe.toFixed(1)}x).`);
    }
    const margins = profiles.map(p => ({ s: p.Symbol, m: p.quote.profitMargins })).filter(x => x.m != null);
    if (margins.length >= 2) {
      margins.sort((a, b) => b.m - a.m);
      insights.push(`Highest net margin: <strong>${margins[0].s}</strong> (${(margins[0].m*100).toFixed(1)}%). Lowest: <strong>${margins[margins.length-1].s}</strong> (${(margins[margins.length-1].m*100).toFixed(1)}%).`);
    }
    if (insights.length < 1) insights.push('Add more stocks or wait for live quotes to generate comparative insights.');

    function tableBlock(title, metrics) {
      return `<div class="card p-4 mb-4 overflow-x-auto">
        <h4 class="text-sm font-semibold mb-3">${title}</h4>
        <table class="data-table is-table w-full">
          <thead><tr><th class="text-left">Metric</th>${headers.map((h,i)=>`<th class="text-center"><span class="inline-block w-2 h-2 rounded-full mr-1" style="background:${COLORS[i%COLORS.length]}"></span>${h}</th>`).join('')}</tr></thead>
          <tbody>
            ${metrics.map(m => {
              const vals = profiles.map(p => m.get(p));
              const cls = (m.higher != null) ? highlightBest(vals.map(v => typeof v === 'number' ? v : (v == null ? null : Number(v))), m.higher) : vals.map(()=>'');
              return `<tr><td class="text-left">${m.label}</td>${vals.map((v,i)=>`<td class="text-center ${cls[i]||''}">${m.fmt ? m.fmt(v) : (v ?? '—')}</td>`).join('')}</tr>`;
            }).join('')}
          </tbody>
        </table>
      </div>`;
    }

    host.innerHTML = `
      ${tableBlock('Snapshot', snapMetrics)}
      <div class="card p-4 mb-4">
        <h4 class="text-sm font-semibold mb-3">Market cap comparison</h4>
        <div class="chart-container" style="height:240px"><canvas id="cmpOverviewChart"></canvas></div>
      </div>
      ${insightList(insights)}
    `;

    const dark = document.documentElement.classList.contains('dark');
    if (charts.cmpOverview) charts.cmpOverview.destroy();
    charts.cmpOverview = new Chart(document.getElementById('cmpOverviewChart'), {
      type: 'bar',
      data: {
        labels: profiles.map(p => p.Symbol),
        datasets: [{
          label: 'Market Cap',
          data: profiles.map(p => p.quote.marketCap ?? null),
          backgroundColor: profiles.map((_, i) => COLORS[i % COLORS.length] + 'cc'),
          borderRadius: 4,
        }]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: { callbacks: { label: c => fmt.mcap(c.parsed.y) } }
        },
        scales: {
          x: { ticks: { color: dark ? '#94a3b8' : '#64748b' }, grid: { display: false } },
          y: { ticks: { color: dark ? '#94a3b8' : '#64748b', callback: v => fmt.mcap(v) }, grid: { color: dark ? 'rgba(148,163,184,0.1)' : 'rgba(100,116,139,0.12)' } }
        }
      }
    });
  }


  async function renderPrice(host) {
    host.innerHTML = `<div class="flex justify-center py-8"><div class="w-8 h-8 border-4 border-brand-500 border-t-transparent rounded-full animate-spin"></div></div>`;
    const COLORS = ['#339fff','#10b981','#f59e0b','#ef4444','#8b5cf6'];
    const PERIODS = [
      { v: '1mo', l: '1M' }, { v: '3mo', l: '3M' }, { v: '6mo', l: '6M' },
      { v: '1y', l: '1Y' }, { v: '2y', l: '2Y' }, { v: '5y', l: '5Y' },
    ];
    const series = [];
    for (let i = 0; i < profiles.length; i++) {
      const p = profiles[i];
      let hist = [];
      try { hist = await LiveAPI.history(p.Symbol, pricePeriod, '1d'); } catch (_) { hist = []; }
      const points = (Array.isArray(hist) ? hist : []).map(r => {
        const date = String(r.Date || r.Datetime || '').slice(0, 10);
        const close = Number(r.Close);
        return { date, close: isNaN(close) ? null : close };
      }).filter(x => x.date && x.close != null).sort((a, b) => a.date.localeCompare(b.date));
      const base = points[0]?.close;
      const tr = points.map(pt => base ? ((pt.close / base) - 1) * 100 : null);
      series.push({ symbol: p.Symbol, points, tr, color: COLORS[i % COLORS.length] });
    }
    const perf = series.map(s => {
      const first = s.points[0]?.close;
      const last = s.points[s.points.length - 1]?.close;
      const ret = (first && last) ? ((last / first) - 1) * 100 : null;
      let peak = -Infinity, mdd = null;
      for (const pt of s.points) {
        if (pt.close > peak) peak = pt.close;
        if (peak > 0) {
          const dd = (pt.close / peak - 1) * 100;
          if (mdd == null || dd < mdd) mdd = dd;
        }
      }
      return { symbol: s.symbol, ret, mdd, last, first, n: s.points.length };
    });
    const insights = [];
    const withRet = perf.filter(p => p.ret != null);
    if (withRet.length >= 2) {
      withRet.sort((a, b) => b.ret - a.ret);
      insights.push(`Best total return over ${pricePeriod}: <strong>${withRet[0].symbol}</strong> (${withRet[0].ret >= 0 ? '+' : ''}${withRet[0].ret.toFixed(1)}%). Worst: <strong>${withRet[withRet.length-1].symbol}</strong> (${withRet[withRet.length-1].ret >= 0 ? '+' : ''}${withRet[withRet.length-1].ret.toFixed(1)}%).`);
    }
    const withMdd = perf.filter(p => p.mdd != null);
    if (withMdd.length >= 2) {
      withMdd.sort((a, b) => b.mdd - a.mdd);
      insights.push(`Shallowest max drawdown: <strong>${withMdd[0].symbol}</strong> (${withMdd[0].mdd.toFixed(1)}%). Deepest: <strong>${withMdd[withMdd.length-1].symbol}</strong> (${withMdd[withMdd.length-1].mdd.toFixed(1)}%).`);
    }
    if (!insights.length) insights.push('Insufficient price history to compare returns for this period.');

    host.innerHTML = `
      <div class="card p-4 mb-4">
        <div class="flex flex-wrap items-center justify-between gap-2 mb-3">
          <h4 class="text-sm font-semibold">Indexed total return</h4>
          <div class="flex flex-wrap gap-1" id="cmpPricePeriods">
            ${PERIODS.map(p => `<button type="button" data-p="${p.v}" class="px-2 py-1 text-xs rounded-lg border ${pricePeriod===p.v?'bg-brand-500 text-white border-brand-500':'border-slate-200 dark:border-slate-700'}">${p.l}</button>`).join('')}
          </div>
        </div>
        <div class="chart-container" style="height:300px"><canvas id="cmpPriceChart"></canvas></div>
      </div>
      <div class="card p-4 mb-4 overflow-x-auto">
        <h4 class="text-sm font-semibold mb-3">Performance summary</h4>
        <table class="data-table is-table w-full">
          <thead><tr><th class="text-left">Metric</th>${profiles.map((p,i)=>`<th class="text-center">${p.Symbol}</th>`).join('')}</tr></thead>
          <tbody>
            <tr><td>Total return (${pricePeriod})</td>${perf.map(p => `<td class="text-center ${p.ret>0?'pos':p.ret<0?'neg':''}">${p.ret==null?'—':((p.ret>=0?'+':'')+p.ret.toFixed(2)+'%')}</td>`).join('')}</tr>
            <tr><td>Max drawdown</td>${perf.map(p => `<td class="text-center neg">${p.mdd==null?'—':p.mdd.toFixed(2)+'%'}</td>`).join('')}</tr>
            <tr><td>Start → End</td>${perf.map(p => `<td class="text-center text-xs">${p.first!=null&&p.last!=null?('$'+p.first.toFixed(2)+' → $'+p.last.toFixed(2)):'—'}</td>`).join('')}</tr>
          </tbody>
        </table>
      </div>
      ${insightList(insights)}
    `;
    document.querySelectorAll('#cmpPricePeriods button').forEach(btn => {
      btn.addEventListener('click', async () => { pricePeriod = btn.dataset.p; await renderPrice(host); });
    });
    const dark = document.documentElement.classList.contains('dark');
    if (charts.cmpPrice) charts.cmpPrice.destroy();
    let best = series[0]?.points || [];
    series.forEach(s => { if (s.points.length > best.length) best = s.points; });
    charts.cmpPrice = new Chart(document.getElementById('cmpPriceChart'), {
      type: 'line',
      data: {
        datasets: series.map(s => ({
          label: s.symbol,
          data: s.points.map((pt, idx) => ({ x: pt.date, y: s.tr[idx] })),
          borderColor: s.color, backgroundColor: 'transparent', tension: 0.15, pointRadius: 0, borderWidth: 2,
        }))
      },
      options: {
        responsive: true, maintainAspectRatio: false, parsing: false,
        plugins: {
          legend: { labels: { color: dark ? '#94a3b8' : '#64748b', boxWidth: 10, font: { size: 10 } } },
          tooltip: { callbacks: { label: ctx => `${ctx.dataset.label}: ${ctx.parsed.y == null ? '—' : ((ctx.parsed.y>=0?'+':'')+ctx.parsed.y.toFixed(2)+'%')}` } }
        },
        scales: {
          x: { type: 'category', labels: best.map(p => p.date), ticks: { color: dark ? '#94a3b8' : '#64748b', maxTicksLimit: 8, font: { size: 9 } }, grid: { display: false } },
          y: { ticks: { color: dark ? '#94a3b8' : '#64748b', callback: v => v.toFixed(0) + '%', font: { size: 9 } }, grid: { color: dark ? 'rgba(148,163,184,0.1)' : 'rgba(100,116,139,0.12)' } }
        }
      }
    });
  }

  async function renderRatios(host) {
    host.innerHTML = `<div class="flex justify-center py-8"><div class="w-8 h-8 border-4 border-brand-500 border-t-transparent rounded-full animate-spin"></div></div>`;
    const COLORS = ['#339fff','#10b981','#f59e0b','#ef4444','#8b5cf6'];
    const metrics = [
      { label: 'Trailing PE', get: p => p.quote.trailingPE, higher: false, fmt: v => v == null ? '—' : Number(v).toFixed(3) + 'x' },
      { label: 'Forward PE', get: p => p.quote.forwardPE, higher: false, fmt: v => v == null ? '—' : Number(v).toFixed(3) + 'x' },
      { label: 'Price/Book', get: p => p.quote.priceToBook, higher: false, fmt: v => v == null ? '—' : Number(v).toFixed(3) + 'x' },
      { label: 'EV/Revenue', get: p => p.quote.enterpriseToRevenue, higher: false, fmt: v => v == null ? '—' : Number(v).toFixed(3) + 'x' },
      { label: 'EV/EBITDA', get: p => p.quote.enterpriseToEbitda, higher: false, fmt: v => v == null ? '—' : Number(v).toFixed(3) + 'x' },
      { label: 'Gross Margin', get: p => p.quote.grossMargins != null ? p.quote.grossMargins * 100 : null, higher: true, fmt: v => v == null ? '—' : Number(v).toFixed(1) + '%' },
      { label: 'Operating Margin', get: p => p.quote.operatingMargins != null ? p.quote.operatingMargins * 100 : null, higher: true, fmt: v => v == null ? '—' : Number(v).toFixed(1) + '%' },
      { label: 'Profit Margin', get: p => p.quote.profitMargins != null ? p.quote.profitMargins * 100 : null, higher: true, fmt: v => v == null ? '—' : Number(v).toFixed(1) + '%' },
      { label: 'ROE', get: p => p.quote.returnOnEquity != null ? p.quote.returnOnEquity * 100 : null, higher: true, fmt: v => v == null ? '—' : Number(v).toFixed(1) + '%' },
      { label: 'ROA', get: p => p.quote.returnOnAssets != null ? p.quote.returnOnAssets * 100 : null, higher: true, fmt: v => v == null ? '—' : Number(v).toFixed(1) + '%' },
      { label: 'Revenue Growth', get: p => p.quote.revenueGrowth != null ? p.quote.revenueGrowth * 100 : null, higher: true, fmt: v => v == null ? '—' : Number(v).toFixed(1) + '%' },
      { label: 'Debt / Equity', get: p => p.quote.debtToEquity, higher: false, fmt: v => v == null ? '—' : Number(v).toFixed(2) },
      { label: 'Current Ratio', get: p => p.quote.currentRatio, higher: true, fmt: v => v == null ? '—' : Number(v).toFixed(2) },
      { label: 'Dividend Yield', get: p => p.quote.dividendYield != null ? p.quote.dividendYield * 100 : null, higher: true, fmt: v => v == null ? '—' : Number(v).toFixed(2) + '%' },
      { label: 'Beta', get: p => p.quote.beta, higher: false, fmt: v => v == null ? '—' : Number(v).toFixed(2) },
    ];
    const insights = [];
    function bestOn(label, higher = true) {
      const scored = profiles.map(p => {
        const m = metrics.find(x => x.label === label);
        return { s: p.Symbol, v: m ? m.get(p) : null };
      }).filter(x => x.v != null && !isNaN(x.v));
      if (scored.length < 2) return;
      scored.sort((a, b) => higher ? b.v - a.v : a.v - b.v);
      const fmtM = metrics.find(x => x.label === label)?.fmt || (v => v);
      insights.push(`Best <em>${label}</em>: <strong>${scored[0].s}</strong> (${fmtM(scored[0].v)}). Trailing: <strong>${scored[scored.length-1].s}</strong> (${fmtM(scored[scored.length-1].v)}).`);
    }
    bestOn('Trailing PE', false); bestOn('Profit Margin', true); bestOn('ROE', true); bestOn('Revenue Growth', true);
    if (!insights.length) insights.push('Live ratio fields are sparse for this set.');

    host.innerHTML = `
      <div class="card p-4 mb-4 overflow-x-auto">
        <h4 class="text-sm font-semibold mb-3">Ratios comparison</h4>
        <table class="data-table is-table w-full">
          <thead><tr><th class="text-left">Metric</th>${profiles.map(p=>`<th class="text-center">${p.Symbol}</th>`).join('')}</tr></thead>
          <tbody>
            ${metrics.map(m => {
              const vals = profiles.map(p => m.get(p));
              const cls = highlightBest(vals, m.higher);
              return `<tr><td class="text-left">${m.label}</td>${vals.map((v,i)=>`<td class="text-center ${cls[i]}">${m.fmt(v)}</td>`).join('')}</tr>`;
            }).join('')}
          </tbody>
        </table>
      </div>
      <div class="card p-4 mb-4">
        <h4 class="text-sm font-semibold mb-3">Valuation multiples</h4>
        <div class="chart-container" style="height:260px"><canvas id="cmpRatioBar"></canvas></div>
      </div>
      ${insightList(insights)}
    `;
    const dark = document.documentElement.classList.contains('dark');
    if (charts.cmpRatioBar) charts.cmpRatioBar.destroy();
    charts.cmpRatioBar = new Chart(document.getElementById('cmpRatioBar'), {
      type: 'bar',
      data: {
        labels: profiles.map(p => p.Symbol),
        datasets: [
          { label: 'Trailing PE', data: profiles.map(p => p.quote.trailingPE ?? null), backgroundColor: '#339fff99', borderRadius: 3 },
          { label: 'EV/EBITDA', data: profiles.map(p => p.quote.enterpriseToEbitda ?? null), backgroundColor: '#10b98199', borderRadius: 3 },
          { label: 'Price/Book', data: profiles.map(p => p.quote.priceToBook ?? null), backgroundColor: '#f59e0b99', borderRadius: 3 },
        ]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { labels: { color: dark ? '#94a3b8' : '#64748b', boxWidth: 10, font: { size: 10 } } } },
        scales: {
          x: { ticks: { color: dark ? '#94a3b8' : '#64748b' }, grid: { display: false } },
          y: { ticks: { color: dark ? '#94a3b8' : '#64748b' }, grid: { color: dark ? 'rgba(148,163,184,0.1)' : 'rgba(100,116,139,0.12)' } }
        }
      }
    });
  }

  function renderSystem(host) {
    // Comparative ranking using Final_Rank + live quality score
    const rows = profiles.map(p => {
      const rank = p.rank?.Final_Rank ?? p.rank?.Rank ?? null;
      const pe = p.quote.trailingPE;
      const roe = p.quote.returnOnEquity;
      const mg = p.quote.profitMargins;
      const rg = p.quote.revenueGrowth;
      // composite: lower rank better; higher roe/margin/growth better; lower pe better
      let score = 50;
      if (rank != null) score += Math.max(0, 30 - Math.min(rank, 30));
      if (roe != null) score += Math.min(15, roe * 40);
      if (mg != null) score += Math.min(10, mg * 40);
      if (rg != null) score += Math.min(10, Math.max(-5, rg * 30));
      if (pe != null && pe > 0) score += Math.max(-10, 10 - pe / 5);
      return { ...p, rank, score };
    }).sort((a, b) => b.score - a.score);

    const insights = [];
    if (rows.length) {
      insights.push(`<strong>System top pick in this set: ${rows[0].Symbol}</strong> (composite score ${rows[0].score.toFixed(1)}).`);
      if (rows.length > 1) insights.push(`Runner-up: <strong>${rows[1].Symbol}</strong> (score ${rows[1].score.toFixed(1)}).`);
      const withRank = rows.filter(r => r.rank != null).sort((a,b)=>a.rank-b.rank);
      if (withRank.length) insights.push(`Best offline Final Rank among selected: <strong>${withRank[0].Symbol}</strong> (#${withRank[0].rank}).`);
      insights.push('Composite blends offline sector rank with live profitability (ROE, margins), growth, and valuation (PE). Use as a screening aid, not a sole decision rule.');
    }

    host.innerHTML = `
      <div class="card p-4 mb-4 overflow-x-auto">
        <h4 class="text-sm font-semibold mb-2">Comparative ranking (system)</h4>
        <p class="text-[11px] text-slate-400 mb-3">Ordered by FinSight composite score for the current selection only.</p>
        <table class="data-table is-table w-full">
          <thead>
            <tr>
              <th class="text-left">#</th><th class="text-left">Symbol</th><th class="text-left">Company</th>
              <th class="text-right">Composite</th><th class="text-right">Final Rank</th>
              <th class="text-right">PE</th><th class="text-right">ROE</th><th class="text-right">Margin</th>
            </tr>
          </thead>
          <tbody>
            ${rows.map((r,i) => `
              <tr>
                <td>${i+1}</td>
                <td class="font-bold text-brand-600">${r.Symbol}</td>
                <td class="text-xs">${r.Company}</td>
                <td class="text-right font-semibold">${r.score.toFixed(1)}</td>
                <td class="text-right">${r.rank ?? '—'}</td>
                <td class="text-right">${r.quote.trailingPE!=null?Number(r.quote.trailingPE).toFixed(1):'—'}</td>
                <td class="text-right">${r.quote.returnOnEquity!=null?(r.quote.returnOnEquity*100).toFixed(1)+'%':'—'}</td>
                <td class="text-right">${r.quote.profitMargins!=null?(r.quote.profitMargins*100).toFixed(1)+'%':'—'}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
      <div class="card p-4 mb-4">
        <h4 class="text-sm font-semibold mb-3">Composite score chart</h4>
        <div class="chart-container" style="height:240px"><canvas id="cmpSysChart"></canvas></div>
      </div>
      ${insightList(insights)}
    `;
    const dark = document.documentElement.classList.contains('dark');
    if (charts.cmpSys) charts.cmpSys.destroy();
    charts.cmpSys = new Chart(document.getElementById('cmpSysChart'), {
      type: 'bar',
      data: {
        labels: rows.map(r => r.Symbol),
        datasets: [{ label: 'Composite', data: rows.map(r => r.score), backgroundColor: '#339fffcc', borderRadius: 4 }]
      },
      options: {
        indexAxis: 'y', responsive: true, maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          x: { ticks: { color: dark?'#94a3b8':'#64748b' }, grid: { color: dark?'rgba(148,163,184,0.1)':'rgba(100,116,139,0.12)' } },
          y: { ticks: { color: dark?'#94a3b8':'#64748b' }, grid: { display: false } }
        }
      }
    });
  }

  paintShell();
}


/* ==================== REPORTS ==================== */
function renderReports() {
  const el = document.getElementById('panel-reports');
  el.innerHTML = `
    <div class="mb-5">
      <h2 class="text-xl font-bold mb-1">Generate Reports</h2>
      <p class="text-sm text-slate-500">Select a stock, then generate an Equity Research note, Valuation report, or Financial Model pack. Reports open in a new tab — use <strong>Print / Save as PDF</strong>.</p>
    </div>

    <div class="card p-4 mb-5 relative max-w-lg">
      <label class="text-xs font-medium text-slate-500 mb-1 block">Select stock</label>
      <input id="rptSearch" type="text" placeholder="Symbol or company name..."
        class="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" />
      <div id="rptDropdown" class="search-dropdown hidden"></div>
      <div id="rptSelected" class="mt-3 text-sm text-slate-500">No stock selected.</div>
    </div>

    <div class="grid md:grid-cols-3 gap-5">
      <div class="card p-6 flex flex-col">
        <h3 class="font-bold mb-1">Equity Research Report</h3>
        <p class="text-xs text-slate-500 mb-4 flex-1">Broker-style note: summary, rating, KPIs, rationale, financial snapshot, DCF bridge, risks and recommendation (template aligned to sample equity research).</p>
        <button id="btnEqReport" class="w-full py-2 rounded-lg bg-brand-600 text-white text-sm font-semibold hover:bg-brand-700 disabled:opacity-50" disabled>Generate Report</button>
      </div>
      <div class="card p-6 flex flex-col">
        <h3 class="font-bold mb-1">Valuation Report</h3>
        <p class="text-xs text-slate-500 mb-4 flex-1">Assignment-style valuation: approaches, DCF, market multiples, asset proxy, and weighted conclusion of value (template aligned to sample business valuation report).</p>
        <button id="btnValReport" class="w-full py-2 rounded-lg bg-emerald-600 text-white text-sm font-semibold hover:bg-emerald-700 disabled:opacity-50" disabled>Generate Report</button>
      </div>
      <div class="card p-6 flex flex-col">
        <h3 class="font-bold mb-1">Financial Model + Report</h3>
        <p class="text-xs text-slate-500 mb-4 flex-1">Historical income snapshot, 4-year FCF forecast, and model value outputs in a printable pack.</p>
        <button id="btnModelReport" class="w-full py-2 rounded-lg bg-violet-600 text-white text-sm font-semibold hover:bg-violet-700 disabled:opacity-50" disabled>Generate Report</button>
      </div>
    </div>
    <p id="rptStatus" class="text-xs text-slate-400 mt-4"></p>
  `;

  let rptSym = null;

  function setSelected(sym) {
    rptSym = sym;
    if (sym) { selectedSym = sym; carryToReports = true; }
    const uni = UNIVERSE.find(u => u.Symbol === sym);
    document.getElementById('rptSelected').innerHTML = sym
      ? `<span class="stock-chip">${sym}</span> <span class="text-slate-600 dark:text-slate-300">${uni?.CompanyName || ''}</span>`
      : 'No stock selected.';
    ['btnEqReport','btnValReport','btnModelReport'].forEach(id => {
      const b = document.getElementById(id);
      if (b) b.disabled = !sym;
    });
  }

  // Carry stock only when user arrived from Listing or Selection after analyzing
  if (carryToReports && selectedSym && (lastMainTab === 'listing' || lastMainTab === 'selection')) {
    setSelected(selectedSym);
  }

  const input = document.getElementById('rptSearch');
  const dropdown = document.getElementById('rptDropdown');
  input.addEventListener('input', () => {
    const q = input.value.trim().toLowerCase();
    if (q.length < 1) { dropdown.classList.add('hidden'); return; }
    const hits = UNIVERSE.filter(s =>
      (s.Symbol && s.Symbol.toLowerCase().includes(q)) ||
      (s.CompanyName && s.CompanyName.toLowerCase().includes(q))
    ).slice(0, 12);
    dropdown.innerHTML = hits.map(s => `
      <div class="search-item" data-sym="${s.Symbol}">
        <div class="sym">${s.Symbol}</div>
        <div class="meta">${s.CompanyName || ''} · ${s.Sector || ''}</div>
      </div>
    `).join('');
    dropdown.classList.remove('hidden');
    dropdown.querySelectorAll('.search-item').forEach(item => {
      item.addEventListener('click', () => {
        setSelected(item.dataset.sym);
        input.value = item.dataset.sym;
        dropdown.classList.add('hidden');
      });
    });
  });
  input.addEventListener('blur', () => setTimeout(() => dropdown.classList.add('hidden'), 200));

  async function run(kind) {
    if (!selectedSym) return;
    if (!window.ReportBuilder) {
      alert('Report module failed to load.');
      return;
    }
    const status = document.getElementById('rptStatus');
    status.textContent = 'Generating report for ' + selectedSym + '… (fetching live data)';
    try {
      if (kind === 'eq') await ReportBuilder.equityResearch(selectedSym);
      if (kind === 'val') await ReportBuilder.valuation(selectedSym);
      if (kind === 'model') await ReportBuilder.financialModel(selectedSym);
      status.textContent = 'Report opened in a new tab. Use Print / Save as PDF to download.';
    } catch (e) {
      console.error(e);
      status.textContent = 'Failed: ' + e.message;
    }
  }

  document.getElementById('btnEqReport').addEventListener('click', () => run('eq'));
  document.getElementById('btnValReport').addEventListener('click', () => run('val'));
  document.getElementById('btnModelReport').addEventListener('click', () => run('model'));
}


/* -------------------- INIT -------------------- */
window.loadSectorRankings = loadSectorRankings;
window.UNIVERSE = typeof UNIVERSE !== "undefined" ? UNIVERSE : [];
(async function init() {
  try {
    await loadData();
    document.getElementById('loader').classList.add('hidden');
    initTabs();
    document.getElementById('mobileMenuBtn')?.addEventListener('click', () => {
      const s = document.getElementById('sidebar');
      if (!s) return;
      if (s.classList.contains('open')) { s.classList.remove('open'); document.body.classList.remove('sidebar-open'); }
      else { s.classList.add('open'); document.body.classList.add('sidebar-open'); }
    });
    
    // Overlay tap closes mobile sidebar
    document.body.addEventListener('click', (e) => {
      if (!document.body.classList.contains('sidebar-open')) return;
      const side = document.getElementById('sidebar');
      if (side && !side.contains(e.target) && !e.target.closest('#mobileMenuBtn')) {
        side.classList.remove('open');
        document.body.classList.remove('sidebar-open');
      }
    });
    /* overlay-close-sidebar */
document.getElementById('sidebarCloseBtn')?.addEventListener('click', () => {
      document.getElementById('sidebar')?.classList.remove('open');
      document.body.classList.remove('sidebar-open');
    });
  } catch (err) {
    console.error(err);
    document.getElementById('loader').innerHTML = `<div class="text-center max-w-md px-4"><p class="text-red-500 font-semibold">Failed to load data.</p><p class="text-sm text-slate-500 mt-2">${(err && err.message) || ''}</p><p class="text-xs text-slate-400 mt-2">Start the backend: <code>cd webapp/backend && python3 app.py</code> then open <code>http://localhost:5000/part3_stock_analysis/</code></p></div>`;
  }
})();


/* Guided path deep-link: #reports opens Generate Reports */
(function () {
  function applyHash() {
    try {
      if ((location.hash || '').replace('#', '') === 'reports') {
        const btn = document.querySelector('[data-tab="reports"]');
        if (btn) btn.click();
      }
    } catch (_) {}
  }
  document.addEventListener('DOMContentLoaded', applyHash);
  window.addEventListener('hashchange', applyHash);
})();
