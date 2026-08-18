/* © All rights reserved FinSight prepared by Rudra Nath Sinha */
/* ============================================================
   FinSight – Part 1: Sector & Industry Visualization
   ============================================================ */

let SECTORS = [];
let INDUSTRIES = [];
let SECTOR_INDUSTRIES = {};
let STATS = {};
let charts = {}; // keep references for destroy/recreate

// Color palette for sectors
const SECTOR_COLORS = [
  '#339fff','#10b981','#f59e0b','#ef4444','#8b5cf6',
  '#ec4899','#06b6d4','#84cc16','#f97316','#6366f1','#14b8a6'
];

const fmt = {
  num: (v, d=1) => v == null || isNaN(v) ? '—' : Number(v).toLocaleString(undefined,{maximumFractionDigits:d}),
  pct: (v) => v == null || isNaN(v) ? '—' : (Number(v).toFixed(2) + '%'),
  mcap: (v) => {
    if (v == null || isNaN(v)) return '—';
    const n = Number(v);
    if (n >= 1e12) return (n/1e12).toFixed(2) + 'T';
    if (n >= 1e9)  return (n/1e9).toFixed(1) + 'B';
    if (n >= 1e6)  return (n/1e6).toFixed(1) + 'M';
    return n.toLocaleString();
  },
  rankBadge: (r) => {
    if (r === 1) return 'rank-1';
    if (r === 2) return 'rank-2';
    if (r === 3) return 'rank-3';
    return 'rank-other';
  },
  changeClass: (v) => (v == null || isNaN(v)) ? '' : (v >= 0 ? 'pos' : 'neg')
};

// Chart.js theme helper
function chartColors() {
  const dark = document.documentElement.classList.contains('dark');
  return {
    text: dark ? '#94a3b8' : '#64748b',
    grid: dark ? 'rgba(148,163,184,0.1)' : 'rgba(100,116,139,0.12)',
    tooltipBg: dark ? '#1e293b' : '#fff',
    tooltipBorder: dark ? '#334155' : '#e2e8f0'
  };
}

/* -------------------- DATA LOAD -------------------- */
let SECTOR_STOCKS = {}; // sector -> industry -> [{Symbol, CompanyName, Country}]

async function fetchJson(url) {
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) throw new Error('Failed to fetch ' + url + ' (' + res.status + ')');
  return res.json();
}

async function loadData() {
  const candidates = ['../data/', '/data/', 'data/'];
  let lastErr = null;
  for (const base of candidates) {
    try {
      const [s, i, si, st, sis] = await Promise.all([
        fetchJson(base + 'sectors.json'),
        fetchJson(base + 'industries.json'),
        fetchJson(base + 'sector_industries.json'),
        fetchJson(base + 'stats.json'),
        fetchJson(base + 'sector_industry_stocks.json').catch(() => ({}))
      ]);
      SECTORS = (s || []).slice().sort((a,b) => a.Final_Rank - b.Final_Rank);
      INDUSTRIES = (i || []).slice().sort((a,b) => a.Final_Rank - b.Final_Rank);
      SECTOR_INDUSTRIES = si || {};
      STATS = st || {};
      SECTOR_STOCKS = sis || {};
      console.info('[FinSight Part1] data loaded from', base);
      return;
    } catch (e) {
      lastErr = e;
      console.warn('[FinSight Part1] data base failed:', base, e.message);
    }
  }
  throw lastErr || new Error('Could not load data from any known path');
}

function stocksForIndustry(sector, industry) {
  try {
    return (SECTOR_STOCKS[sector] && SECTOR_STOCKS[sector][industry]) || [];
  } catch (_) { return []; }
}

function goToDeepDive(sector, industry) {
  const tab = document.querySelector('#mainTabs .tab-btn[data-tab="deepdive"]');
  if (tab) tab.click();
  // Allow panel to render
  setTimeout(() => {
    if (typeof window.__deepDiveSelect === 'function') {
      window.__deepDiveSelect(sector, industry);
    }
  }, 50);
}

function goToStockAnalysis(symbol) {
  const url = '../part3_stock_analysis/index.html?symbol=' + encodeURIComponent(symbol);
  window.location.href = url;
}

/* -------------------- TAB SYSTEM -------------------- */
function initTabs() {
  const tabs = document.querySelectorAll('#mainTabs .tab-btn');
  tabs.forEach(btn => {
    btn.addEventListener('click', () => {
      tabs.forEach(t => t.classList.remove('active'));
      btn.classList.add('active');
      document.querySelectorAll('.tab-panel').forEach(p => p.classList.add('hidden'));
      const panel = document.getElementById('panel-' + btn.dataset.tab);
      if (panel) {
        panel.classList.remove('hidden');
        // Lazy render
        if (!panel.dataset.rendered) {
          renderPanel(btn.dataset.tab);
          panel.dataset.rendered = '1';
        }
      }
    });
  });
  // Default
  document.querySelector('[data-tab="dashboard"]').click();
}

function renderPanel(name) {
  const map = {
    dashboard: renderDashboard,
    ranking: renderRanking,
    deepdive: renderDeepDive,
    comparison: renderComparison,
    insights: renderInsights
  };
  if (map[name]) map[name]();
}

/* ============================================================
   1. DASHBOARD
   ============================================================ */
function renderDashboard() {
  const el = document.getElementById('panel-dashboard');
  const topSector = SECTORS[0];
  const topInd = INDUSTRIES[0];
  const best1Y = [...INDUSTRIES].filter(i => i['1Y_Change'] != null).sort((a,b) => b['1Y_Change'] - a['1Y_Change']).slice(0,5);
  const bestDiv = [...INDUSTRIES].filter(i => i.Dividend_Yield != null).sort((a,b) => b.Dividend_Yield - a.Dividend_Yield).slice(0,5);

  el.innerHTML = `
    <!-- KPI Row -->
    <div class="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mb-6 animate-in">
      <button type="button" id="kpiSectorsRanked" class="card metric-card p-3 sm:p-4 text-left hover:ring-2 hover:ring-brand-400/50 transition cursor-pointer w-full">
        <p class="text-xs text-slate-500 mb-1">Sectors Ranked</p>
        <p class="text-xl sm:text-2xl font-bold">${STATS.total_sectors}</p>
        <p class="text-xs text-slate-400 mt-1">Tap to view full list</p>
      </button>
      <button type="button" id="kpiIndustriesRanked" class="card metric-card p-3 sm:p-4 text-left hover:ring-2 hover:ring-brand-400/50 transition cursor-pointer w-full">
        <p class="text-xs text-slate-500 mb-1">Industries Ranked</p>
        <p class="text-xl sm:text-2xl font-bold">${STATS.total_industries}</p>
        <p class="text-xs text-slate-400 mt-1">Tap to view full list</p>
      </button>
      <div class="card metric-card p-3 sm:p-4">
        <p class="text-xs text-slate-500 mb-1">Stocks Covered</p>
        <p class="text-xl sm:text-2xl font-bold">${fmt.num(STATS.total_stocks_approx,0)}</p>
        <p class="text-xs text-slate-400 mt-1">Universe size</p>
      </div>
      <div class="card metric-card p-3 sm:p-4 min-w-0">
        <p class="text-xs text-slate-500 mb-1">Top Sector</p>
        <p class="text-base sm:text-xl font-bold text-brand-600 dark:text-brand-400 truncate">${topSector.Sector}</p>
        <p class="text-xs text-slate-400 mt-1">Score ${fmt.num(topSector.Ensemble_Score)}</p>
      </div>
    </div>

    <!-- Highlights -->
    <div class="grid lg:grid-cols-3 gap-4 mb-6">
      <div class="card p-5 highlight-card">
        <h3 class="text-sm font-semibold mb-3 flex items-center gap-2">
          <span class="w-2 h-2 rounded-full bg-amber-400"></span> Top Performing Industries (1Y)
        </h3>
        <div class="space-y-2">
          ${best1Y.map((ind,i) => `
            <div class="flex items-center justify-between text-sm">
              <span class="flex items-center gap-2 truncate">
                <span class="rank-badge ${fmt.rankBadge(i+1)}">${i+1}</span>
                <span class="truncate">${ind.Industry}</span>
              </span>
              <span class="font-semibold pos whitespace-nowrap ml-2">+${fmt.pct(ind['1Y_Change'])}</span>
            </div>`).join('')}
        </div>
      </div>
      <div class="card p-5 highlight-card">
        <h3 class="text-sm font-semibold mb-3 flex items-center gap-2">
          <span class="w-2 h-2 rounded-full bg-emerald-400"></span> Highest Dividend Yield
        </h3>
        <div class="space-y-2">
          ${bestDiv.map((ind,i) => `
            <div class="flex items-center justify-between text-sm">
              <span class="flex items-center gap-2 truncate">
                <span class="rank-badge ${fmt.rankBadge(i+1)}">${i+1}</span>
                <span class="truncate">${ind.Industry}</span>
              </span>
              <span class="font-semibold text-emerald-600 dark:text-emerald-400 whitespace-nowrap ml-2">${fmt.pct(ind.Dividend_Yield)}</span>
            </div>`).join('')}
        </div>
      </div>
      <div class="card p-5 highlight-card">
        <h3 class="text-sm font-semibold mb-3 flex items-center gap-2">
          <span class="w-2 h-2 rounded-full bg-brand-400"></span> Sector Rank Snapshot
        </h3>
        <div class="space-y-2">
          ${SECTORS.slice(0,5).map(s => `
            <div class="flex items-center justify-between text-sm">
              <span class="flex items-center gap-2">
                <span class="rank-badge ${fmt.rankBadge(s.Final_Rank)}">${s.Final_Rank}</span>
                <span>${s.Sector}</span>
              </span>
              <span class="text-slate-500 text-xs">Score ${fmt.num(s.Ensemble_Score)}</span>
            </div>`).join('')}
        </div>
      </div>
    </div>

    <!-- Charts Row -->
    <div class="grid lg:grid-cols-2 gap-4 mb-6">
      <div class="card p-5">
        <h3 class="text-sm font-semibold mb-4">Sector Ranking — Ensemble Score</h3>
        <div class="chart-container"><canvas id="chartSectorRank"></canvas></div>
      </div>
      <div class="card p-5">
        <h3 class="text-sm font-semibold mb-4">Industry Distribution by Sector</h3>
        <div class="chart-container"><canvas id="chartIndDist"></canvas></div>
      </div>
    </div>

    <div class="grid lg:grid-cols-2 gap-4">
      <div class="card p-5">
        <h3 class="text-sm font-semibold mb-4">Top 15 Industries by Market Cap</h3>
        <div class="chart-container"><canvas id="chartMcap"></canvas></div>
      </div>
      <div class="card p-5">
        <h3 class="text-sm font-semibold mb-4">Dividend Yield Distribution (Top Industries)</h3>
        <div class="chart-container"><canvas id="chartDivPie"></canvas></div>
      </div>
    </div>
  `;

  // Render charts after DOM
  requestAnimationFrame(() => {
    renderSectorRankChart();
    renderIndDistChart();
    renderMcapChart();
    renderDivPieChart();
  });

  document.getElementById('kpiSectorsRanked')?.addEventListener('click', openSectorRanksModal);
  document.getElementById('kpiIndustriesRanked')?.addEventListener('click', openIndustryRanksModal);
}

function openSectorRanksModal() {
  const modal = document.getElementById('sectorRanksModal');
  const body = document.getElementById('sectorRanksBody');
  const title = document.getElementById('sectorRanksTitle');
  if (title) title.textContent = 'Sectors ranked';
  if (!modal || !body) return;
  body.innerHTML = `
    <div class="overflow-x-auto">
    <table class="data-table w-full">
      <thead>
        <tr>
          <th>Rank</th>
          <th>Sector name</th>
          <th>Industries</th>
          <th>Stocks</th>
          <th>1Y %</th>
          <th>System score</th>
        </tr>
      </thead>
      <tbody>
        ${SECTORS.map(s => {
          const inds = INDUSTRIES.filter(i => i.Sector === s.Sector);
          const nInd = (SECTOR_INDUSTRIES[s.Sector] || []).length || inds.length;
          const nStocks = inds.reduce((a, i) => a + (Number(i.Stocks_Count) || 0), 0);
          // Weighted-ish average of industry 1Y when sector-level 1Y is absent
          const with1y = inds.filter(i => i['1Y_Change'] != null && !isNaN(i['1Y_Change']));
          const y1 = with1y.length
            ? with1y.reduce((a, i) => a + Number(i['1Y_Change']), 0) / with1y.length
            : null;
          return `<tr class="cursor-pointer hover:bg-brand-50 dark:hover:bg-brand-950/30 transition" data-sector="${(s.Sector || '').replace(/"/g, '&quot;')}" title="Open Sector Deep Dive">
            <td><span class="rank-badge ${fmt.rankBadge(s.Final_Rank)}">${s.Final_Rank}</span></td>
            <td class="font-medium text-brand-700 dark:text-brand-300">${s.Sector}</td>
            <td>${nInd}</td>
            <td>${nStocks}</td>
            <td class="${fmt.changeClass ? fmt.changeClass(y1) : ''}">${y1 == null ? '—' : fmt.pct(y1)}</td>
            <td>${fmt.num(s.Ensemble_Score, 4)}</td>
          </tr>`;
        }).join('')}
      </tbody>
    </table>
    </div>
    <p class="text-[11px] text-slate-400 mt-3">Click any sector row to open <strong>Sector Deep Dive</strong> with that sector pre-selected.</p>`;
  modal.classList.add('open');
  body.querySelectorAll('tr[data-sector]').forEach(tr => {
    tr.addEventListener('click', () => {
      const sector = tr.getAttribute('data-sector');
      modal.classList.remove('open');
      if (sector) goToDeepDive(sector, null);
    });
  });
}

function openIndustryRanksModal() {
  const modal = document.getElementById('sectorRanksModal');
  const body = document.getElementById('sectorRanksBody');
  const title = document.getElementById('sectorRanksTitle');
  if (!modal || !body) return;
  if (title) title.textContent = 'Industries ranked';
  const rows = [...INDUSTRIES].sort((a, b) => (a.Final_Rank || 999) - (b.Final_Rank || 999));
  body.innerHTML = `
    <div class="overflow-x-auto max-h-[70vh]">
    <table class="data-table w-full">
      <thead>
        <tr>
          <th>Rank</th>
          <th>Industry name</th>
          <th>Sector</th>
          <th>Stocks</th>
          <th>System score</th>
          <th>1Y %</th>
        </tr>
      </thead>
      <tbody>
        ${rows.map(i => {
          // System score: prefer Ensemble_Score; else inverse-friendly Mean_Rank display
          const sys = i.Ensemble_Score != null ? i.Ensemble_Score
            : (i.Mean_Rank != null ? i.Mean_Rank : null);
          return `<tr class="cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/50" data-ind="${(i.Industry || '').replace(/"/g, '&quot;')}">
            <td><span class="rank-badge ${fmt.rankBadge(i.Final_Rank)}">${i.Final_Rank ?? '—'}</span></td>
            <td class="font-medium">${i.Industry}</td>
            <td>${i.Sector || '—'}</td>
            <td>${i.Stocks_Count ?? '—'}</td>
            <td>${sys == null ? '—' : fmt.num(sys, 4)}</td>
            <td class="${fmt.changeClass ? fmt.changeClass(i['1Y_Change']) : ''}">${i['1Y_Change'] == null ? '—' : fmt.pct(i['1Y_Change'])}</td>
          </tr>`;
        }).join('')}
      </tbody>
    </table>
    </div>`;
  modal.classList.add('open');
  body.querySelectorAll('tr[data-ind]').forEach(tr => {
    tr.addEventListener('click', () => {
      const name = tr.getAttribute('data-ind');
      const ind = INDUSTRIES.find(x => x.Industry === name);
      if (ind) {
        modal.classList.remove('open');
        openIndustryModal(ind, { from: 'ranking' });
      }
    });
  });
}



function renderSectorRankChart() {
  const ctx = document.getElementById('chartSectorRank');
  if (!ctx) return;
  if (charts.sectorRank) charts.sectorRank.destroy();
  const c = chartColors();
  charts.sectorRank = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: SECTORS.map(s => s.Sector),
      datasets: [{
        label: 'Ensemble Score',
        data: SECTORS.map(s => s.Ensemble_Score),
        backgroundColor: SECTOR_COLORS,
        borderRadius: 6,
        borderSkipped: false
      }]
    },
    options: {
      indexAxis: 'y',
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        x: { grid: { color: c.grid }, ticks: { color: c.text } },
        y: { grid: { display: false }, ticks: { color: c.text, font: { size: 11 } } }
      }
    }
  });
}

function renderIndDistChart() {
  const ctx = document.getElementById('chartIndDist');
  if (!ctx) return;
  if (charts.indDist) charts.indDist.destroy();
  const counts = {};
  INDUSTRIES.forEach(i => { counts[i.Sector] = (counts[i.Sector]||0)+1; });
  const labels = Object.keys(counts);
  const c = chartColors();
  charts.indDist = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels,
      datasets: [{
        data: labels.map(l => counts[l]),
        backgroundColor: SECTOR_COLORS,
        borderWidth: 2,
        borderColor: document.documentElement.classList.contains('dark') ? '#0f172a' : '#fff'
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { position: 'right', labels: { color: c.text, boxWidth: 12, font: { size: 11 } } }
      }
    }
  });
}

function renderMcapChart() {
  const ctx = document.getElementById('chartMcap');
  if (!ctx) return;
  if (charts.mcap) charts.mcap.destroy();
  const top = [...INDUSTRIES].filter(i => i.Market_Cap).sort((a,b)=>b.Market_Cap-a.Market_Cap).slice(0,15);
  const c = chartColors();
  charts.mcap = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: top.map(i => i.Industry.length > 22 ? i.Industry.slice(0,20)+'…' : i.Industry),
      datasets: [{
        label: 'Market Cap',
        data: top.map(i => i.Market_Cap / 1e12),
        backgroundColor: '#339fff',
        borderRadius: 4
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false },
        tooltip: { callbacks: { label: ctx => ' $' + ctx.raw.toFixed(2) + 'T' } }
      },
      scales: {
        x: { ticks: { color: c.text, maxRotation: 45, font:{size:10} }, grid:{display:false} },
        y: { title: { display:true, text:'Market Cap (Trillion USD)', color:c.text }, ticks:{color:c.text}, grid:{color:c.grid} }
      }
    }
  });
}

function renderDivPieChart() {
  const ctx = document.getElementById('chartDivPie');
  if (!ctx) return;
  if (charts.divPie) charts.divPie.destroy();
  const top = [...INDUSTRIES].filter(i=>i.Dividend_Yield!=null).sort((a,b)=>b.Dividend_Yield-a.Dividend_Yield).slice(0,8);
  const c = chartColors();
  charts.divPie = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: top.map(i => i.Industry),
      datasets: [{
        data: top.map(i => i.Dividend_Yield),
        backgroundColor: SECTOR_COLORS.slice(0,8),
        borderWidth: 2,
        borderColor: document.documentElement.classList.contains('dark') ? '#0f172a' : '#fff'
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { position: 'right', labels: { color: c.text, boxWidth: 12, font:{size:10} } },
        tooltip: { callbacks: { label: ctx => ctx.label + ': ' + ctx.raw.toFixed(2) + '%' } }
      }
    }
  });
}

/* ============================================================
   2. RANKING
   ============================================================ */
function renderRanking() {
  const el = document.getElementById('panel-ranking');
  // Primary sort control — clearer label than "Sort / Rank by"
  const factors = [
    { key: 'Final_Rank', label: 'Overall rank (best first)' },
    { key: 'Mean_Rank', label: 'Average factor rank' },
    { key: 'Market_Cap', label: 'Market capitalization' },
    { key: 'Dividend_Yield', label: 'Dividend yield' },
    { key: 'Trailing_PE', label: 'Trailing P/E' },
    { key: 'Profit_Margin', label: 'Profit margin' },
    { key: '1Y_Change', label: '1-year performance' },
    { key: '1D_Change', label: '1-day performance' },
    { key: 'Stocks_Count', label: 'Number of stocks' }
  ];

  // Column sort state for header clicks
  let colSort = { key: 'Final_Rank', dir: 'asc' }; // asc for ranks, desc for metrics typically

  const columns = [
    { key: 'rowRank', label: 'Rank', sortKey: null }, // display index after sort
    { key: 'Industry', label: 'Industry', sortKey: 'Industry' },
    { key: 'Sector', label: 'Sector', sortKey: 'Sector' },
    { key: 'Stocks_Count', label: 'Stocks', sortKey: 'Stocks_Count' },
    { key: 'Market_Cap', label: 'Market Cap', sortKey: 'Market_Cap' },
    { key: 'Dividend_Yield', label: 'Div Yield', sortKey: 'Dividend_Yield' },
    { key: 'Trailing_PE', label: 'Trailing PE', sortKey: 'Trailing_PE' },
    { key: 'Profit_Margin', label: 'Profit Margin', sortKey: 'Profit_Margin' },
    { key: '1D_Change', label: '1D %', sortKey: '1D_Change' },
    { key: '1Y_Change', label: '1Y %', sortKey: '1Y_Change' },
    { key: 'Mean_Rank', label: 'Mean Rank', sortKey: 'Mean_Rank' },
  ];

  function sixM(ind) {
    // Column shows 1D % (dataset has 1D_Change; 6M was empty)
    if (ind['1D_Change'] != null && !isNaN(ind['1D_Change'])) return ind['1D_Change'];
    if (ind['1d_Change'] != null && !isNaN(ind['1d_Change'])) return ind['1d_Change'];
    return null;
  }

  el.innerHTML = `
    <div class="card p-4 mb-4 flex flex-wrap items-center gap-3">
      <label class="text-sm font-medium">Order industries by:</label>
      <select id="rankFactor" class="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500">
        ${factors.map(f => `<option value="${f.key}">${f.label}</option>`).join('')}
      </select>
      <label class="text-sm font-medium ml-2">Sector filter:</label>
      <select id="rankSectorFilter" class="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500">
        <option value="all">All Sectors</option>
        ${SECTORS.map(s => `<option value="${s.Sector}">${s.Sector}</option>`).join('')}
      </select>
      <input id="rankSearch" type="text" placeholder="Search industry..." class="ml-auto px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm w-full sm:w-48 focus:outline-none focus:ring-2 focus:ring-brand-500" />
    </div>
    <div class="card overflow-x-auto">
      <table class="data-table w-full" id="rankTable">
        <thead>
          <tr>
            ${columns.map(c => c.sortKey
              ? `<th class="sortable" data-sort="${c.sortKey}">${c.label}<span class="sort-ind">↕</span></th>`
              : `<th>${c.label}</th>`).join('')}
          </tr>
        </thead>
        <tbody id="rankBody"></tbody>
      </table>
    </div>
  `;

  const renderTable = () => {
    const factor = document.getElementById('rankFactor').value;
    const sector = document.getElementById('rankSectorFilter').value;
    const q = (document.getElementById('rankSearch').value || '').toLowerCase();
    let data = INDUSTRIES.map(ind => ({ ...ind, '1D_Change': sixM(ind) ?? ind['1D_Change'] }));
    if (sector !== 'all') data = data.filter(i => i.Sector === sector);
    if (q) data = data.filter(i => i.Industry.toLowerCase().includes(q) || (i.Sector||'').toLowerCase().includes(q));

    // Primary order from dropdown (unless user clicked a column)
    const activeKey = colSort.key || factor;
    const numericAscDefault = ['Final_Rank','Mean_Rank','Trailing_PE','Sector_Rank'];
    let dir = colSort.dir;
    if (!colSort.fromHeader) {
      // dropdown-driven
      dir = numericAscDefault.includes(factor) ? 'asc' : 'desc';
      colSort = { key: factor, dir, fromHeader: false };
    }

    data.sort((a,b) => {
      let av = a[activeKey], bv = b[activeKey];
      if (activeKey === 'Industry' || activeKey === 'Sector') {
        av = (av || '').toString().toLowerCase();
        bv = (bv || '').toString().toLowerCase();
        if (av < bv) return dir === 'asc' ? -1 : 1;
        if (av > bv) return dir === 'asc' ? 1 : -1;
        return 0;
      }
      if (av == null || isNaN(av)) return 1;
      if (bv == null || isNaN(bv)) return -1;
      return dir === 'asc' ? av - bv : bv - av;
    });

    // Update header indicators
    document.querySelectorAll('#rankTable th.sortable').forEach(th => {
      th.classList.remove('sorted-asc','sorted-desc');
      if (th.dataset.sort === activeKey) th.classList.add(dir === 'asc' ? 'sorted-asc' : 'sorted-desc');
      const ind = th.querySelector('.sort-ind');
      if (ind) ind.textContent = th.dataset.sort === activeKey ? (dir === 'asc' ? '↑' : '↓') : '↕';
    });

    document.getElementById('rankBody').innerHTML = data.map((ind, idx) => `
      <tr class="industry-row" data-industry="${ind.Industry.replace(/"/g,'&quot;')}" data-sector="${(ind.Sector||'').replace(/"/g,'&quot;')}">
        <td><span class="rank-badge ${fmt.rankBadge(idx+1)}">${idx+1}</span></td>
        <td class="font-medium">${ind.Industry}</td>
        <td class="text-slate-500">${ind.Sector}</td>
        <td>${fmt.num(ind.Stocks_Count,0)}</td>
        <td>${fmt.mcap(ind.Market_Cap)}</td>
        <td>${fmt.pct(ind.Dividend_Yield)}</td>
        <td>${fmt.num(ind.Trailing_PE)}</td>
        <td>${fmt.pct(ind.Profit_Margin)}</td>
        <td class="${fmt.changeClass(ind['1D_Change'])}">${fmt.pct(ind['1D_Change'])}</td>
        <td class="${fmt.changeClass(ind['1Y_Change'])}">${fmt.pct(ind['1Y_Change'])}</td>
        <td>${fmt.num(ind.Mean_Rank)}</td>
      </tr>
    `).join('');

    document.querySelectorAll('#rankBody .industry-row').forEach(row => {
      row.addEventListener('click', () => {
        const ind = INDUSTRIES.find(i => i.Industry === row.dataset.industry);
        if (ind) openIndustryModal(ind, { from: 'ranking' });
      });
    });
  };

  document.querySelectorAll('#rankTable th.sortable').forEach(th => {
    th.addEventListener('click', () => {
      const key = th.dataset.sort;
      if (colSort.key === key && colSort.fromHeader) {
        colSort.dir = colSort.dir === 'asc' ? 'desc' : 'asc';
      } else {
        const numericAscDefault = ['Final_Rank','Mean_Rank','Trailing_PE','Sector_Rank'];
        colSort = { key, dir: numericAscDefault.includes(key) || key === 'Industry' || key === 'Sector' ? 'asc' : 'desc', fromHeader: true };
      }
      colSort.fromHeader = true;
      renderTable();
    });
  });

  document.getElementById('rankFactor').addEventListener('change', () => {
    colSort.fromHeader = false;
    renderTable();
  });
  document.getElementById('rankSectorFilter').addEventListener('change', renderTable);
  document.getElementById('rankSearch').addEventListener('input', renderTable);
  renderTable();
}

/* ============================================================
   3. SECTOR DEEP DIVE
   ============================================================ */
function renderDeepDive(preset) {
  const el = document.getElementById('panel-deepdive');
  const sectorNames = SECTORS.map(s => s.Sector);

  el.innerHTML = `
    <div class="flex gap-2 overflow-x-auto pb-3 mb-4 scrollbar-hide" id="sectorPills">
      ${sectorNames.map((s,i) => `
        <button type="button" class="sector-pill ${i===0?'active':''} bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300" data-sector="${s}">
          ${s}
        </button>`).join('')}
    </div>
    <div class="card p-4 mb-4 flex flex-wrap items-center gap-3">
      <label class="text-sm font-medium">Order industries by:</label>
      <select id="deepFactor" class="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm">
        <option value="Sector_Rank">Within-sector rank</option>
        <option value="Final_Rank">Overall rank</option>
        <option value="Market_Cap">Market cap</option>
        <option value="Dividend_Yield">Dividend yield</option>
        <option value="1Y_Change">1Y performance</option>
        <option value="Profit_Margin">Profit margin</option>
        <option value="Stocks_Count">Number of stocks</option>
      </select>
    </div>
    <div id="deepContent"></div>
  `;

  let currentSector = sectorNames[0];
  let highlightIndustry = null;
  let colSort = { key: 'Sector_Rank', dir: 'asc', fromHeader: false };

  const deepCols = [
    { label: 'Sector Rank', key: 'Sector_Rank' },
    { label: 'Overall Rank', key: 'Final_Rank' },
    { label: 'Industry', key: 'Industry' },
    { label: 'Stocks', key: 'Stocks_Count' },
    { label: 'Market Cap', key: 'Market_Cap' },
    { label: 'Div Yield', key: 'Dividend_Yield' },
    { label: 'PE', key: 'Trailing_PE' },
    { label: 'Profit Margin', key: 'Profit_Margin' },
    { label: '1Y %', key: '1Y_Change' },
  ];

  const renderSector = () => {
    const factor = document.getElementById('deepFactor').value;
    let list = [...(SECTOR_INDUSTRIES[currentSector] || [])];

    const key = colSort.fromHeader ? colSort.key : factor;
    const numericAsc = ['Sector_Rank','Final_Rank','Trailing_PE'];
    let dir = colSort.fromHeader ? colSort.dir : (numericAsc.includes(factor) ? 'asc' : 'desc');
    if (!colSort.fromHeader) colSort = { key: factor, dir, fromHeader: false };

    list.sort((a,b) => {
      let av = a[key], bv = b[key];
      if (key === 'Industry') {
        av = (av||'').toLowerCase(); bv = (bv||'').toLowerCase();
        if (av < bv) return dir==='asc' ? -1 : 1;
        if (av > bv) return dir==='asc' ? 1 : -1;
        return 0;
      }
      if (av == null || isNaN(av)) return 1;
      if (bv == null || isNaN(bv)) return -1;
      return dir === 'asc' ? av - bv : bv - av;
    });

    const secInfo = SECTORS.find(s => s.Sector === currentSector);

    document.getElementById('deepContent').innerHTML = `
      <div class="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
        <div class="card p-3 text-center">
          <p class="text-xs text-slate-500">Sector Rank</p>
          <p class="text-xl font-bold">#${secInfo?.Final_Rank ?? '—'}</p>
        </div>
        <div class="card p-3 text-center">
          <p class="text-xs text-slate-500">Ensemble Score</p>
          <p class="text-xl font-bold">${fmt.num(secInfo?.Ensemble_Score)}</p>
        </div>
        <div class="card p-3 text-center">
          <p class="text-xs text-slate-500">Industries</p>
          <p class="text-xl font-bold">${list.length}</p>
        </div>
        <div class="card p-3 text-center">
          <p class="text-xs text-slate-500">Total Stocks</p>
          <p class="text-xl font-bold">${fmt.num(list.reduce((s,i)=>s+(i.Stocks_Count||0),0),0)}</p>
        </div>
      </div>
      <div class="card overflow-x-auto">
        <table class="data-table w-full" id="deepTable">
          <thead>
            <tr>
              ${deepCols.map(c => `<th class="sortable" data-sort="${c.key}">${c.label}<span class="sort-ind">↕</span></th>`).join('')}
            </tr>
          </thead>
          <tbody>
            ${list.map((ind, idx) => {
              const hi = highlightIndustry && ind.Industry === highlightIndustry;
              return `
              <tr class="industry-row ${hi ? 'ring-2 ring-brand-400' : ''}" data-industry="${ind.Industry.replace(/"/g,'&quot;')}">
                <td><span class="rank-badge ${fmt.rankBadge(ind.Sector_Rank || idx+1)}">${ind.Sector_Rank || idx+1}</span></td>
                <td class="text-slate-500">#${ind.Final_Rank}</td>
                <td class="font-medium">${ind.Industry}</td>
                <td>${fmt.num(ind.Stocks_Count,0)}</td>
                <td>${fmt.mcap(ind.Market_Cap)}</td>
                <td>${fmt.pct(ind.Dividend_Yield)}</td>
                <td>${fmt.num(ind.Trailing_PE)}</td>
                <td>${fmt.pct(ind.Profit_Margin)}</td>
                <td class="${fmt.changeClass(ind['1Y_Change'])}">${fmt.pct(ind['1Y_Change'])}</td>
              </tr>`;
            }).join('')}
          </tbody>
        </table>
      </div>
    `;

    document.querySelectorAll('#deepTable th.sortable').forEach(th => {
      th.classList.remove('sorted-asc','sorted-desc');
      if (th.dataset.sort === colSort.key) {
        th.classList.add(colSort.dir === 'asc' ? 'sorted-asc' : 'sorted-desc');
        const indEl = th.querySelector('.sort-ind');
        if (indEl) indEl.textContent = colSort.dir === 'asc' ? '↑' : '↓';
      }
      th.addEventListener('click', () => {
        const k = th.dataset.sort;
        if (colSort.key === k && colSort.fromHeader) {
          colSort.dir = colSort.dir === 'asc' ? 'desc' : 'asc';
        } else {
          const numericAsc = ['Sector_Rank','Final_Rank','Trailing_PE'];
          colSort = { key: k, dir: (numericAsc.includes(k) || k === 'Industry') ? 'asc' : 'desc', fromHeader: true };
        }
        colSort.fromHeader = true;
        renderSector();
      });
    });

    document.querySelectorAll('#deepContent .industry-row').forEach(row => {
      row.addEventListener('click', () => {
        const ind = INDUSTRIES.find(i => i.Industry === row.dataset.industry)
          || list.find(i => i.Industry === row.dataset.industry);
        if (ind) openIndustryModal(ind, { from: 'deepdive' });
      });
    });

    if (highlightIndustry) {
      const row = document.querySelector(`#deepContent tr[data-industry="${CSS.escape(highlightIndustry)}"]`);
      if (row) row.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  };

  document.querySelectorAll('#sectorPills .sector-pill').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('#sectorPills .sector-pill').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentSector = btn.dataset.sector;
      highlightIndustry = null;
      colSort.fromHeader = false;
      renderSector();
    });
  });
  document.getElementById('deepFactor').addEventListener('change', () => {
    colSort.fromHeader = false;
    renderSector();
  });

  window.__deepDiveSelect = (sector, industry) => {
    if (sector && sectorNames.includes(sector)) {
      currentSector = sector;
      document.querySelectorAll('#sectorPills .sector-pill').forEach(b => {
        b.classList.toggle('active', b.dataset.sector === sector);
      });
    }
    highlightIndustry = industry || null;
    colSort.fromHeader = false;
    renderSector();
  };

  if (preset && preset.sector) {
    window.__deepDiveSelect(preset.sector, preset.industry);
  } else {
    renderSector();
  }
}

/* ============================================================
   4. COMPARISON
   ============================================================ */
function renderComparison() {
  const el = document.getElementById('panel-comparison');
  el.innerHTML = `
    <div class="flex gap-2 mb-4 overflow-x-auto scrollbar-hide">
      <button class="tab-btn active" data-cmp="sector">Sector-wise</button>
      <button class="tab-btn" data-cmp="industry">Industry-wise</button>
      <button class="tab-btn" data-cmp="sector-ind">Sector → Industry</button>
    </div>
    <div id="cmpContent"></div>
  `;

  const buttons = el.querySelectorAll('[data-cmp]');
  let mode = 'sector';

  const switchMode = (m) => {
    mode = m;
    buttons.forEach(b => b.classList.toggle('active', b.dataset.cmp === m));
    if (m === 'sector') renderSectorCmp();
    else if (m === 'industry') renderIndustryCmp();
    else renderSectorIndCmp();
  };

  buttons.forEach(b => b.addEventListener('click', () => switchMode(b.dataset.cmp)));
  switchMode('sector');
}

function renderSectorCmp() {
  const el = document.getElementById('cmpContent');
  let selected = SECTORS.map(s => s.Sector); // default all

  el.innerHTML = `
    <div class="card p-4 mb-4">
      <div class="flex flex-wrap items-center gap-2 mb-2">
        <span class="text-sm font-medium">Selected sectors (${selected.length}/11):</span>
        <div id="secChips" class="flex flex-wrap gap-1.5"></div>
        <button id="addSecBtn" class="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-brand-500 text-white text-xs font-medium hover:bg-brand-600">
          <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/></svg>
          Add
        </button>
      </div>
      <div id="secSelectBox" class="hidden mt-2 p-3 rounded-lg bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700">
        <div class="flex flex-wrap gap-2" id="secCheckboxes"></div>
      </div>
    </div>
    <div class="grid lg:grid-cols-2 gap-4">
      <div class="card p-5"><h3 class="text-sm font-semibold mb-3">Ensemble Score Comparison</h3><div class="chart-container"><canvas id="cmpSecBar"></canvas></div></div>
      <div class="card p-5"><h3 class="text-sm font-semibold mb-3">Stability (Std Dev of Rank)</h3><div class="chart-container"><canvas id="cmpSecStab"></canvas></div></div>
      <div class="card p-5 lg:col-span-2"><h3 class="text-sm font-semibold mb-3">Multi-Metric Radar (normalized)</h3><div class="chart-container" style="height:340px"><canvas id="cmpSecRadar"></canvas></div></div>
    </div>
  `;

  const updateChips = () => {
    document.getElementById('secChips').innerHTML = selected.map(s =>
      `<span class="chip">${s}<button data-remove="${s}" class="ml-0.5">×</button></span>`
    ).join('');
    document.querySelectorAll('[data-remove]').forEach(btn => {
      btn.addEventListener('click', () => {
        if (selected.length <= 1) return;
        selected = selected.filter(x => x !== btn.dataset.remove);
        updateChips(); updateChecks(); drawCharts();
      });
    });
  };

  const updateChecks = () => {
    document.getElementById('secCheckboxes').innerHTML = SECTORS.map(s => `
      <label class="inline-flex items-center gap-1.5 text-sm cursor-pointer">
        <input type="checkbox" value="${s.Sector}" ${selected.includes(s.Sector)?'checked':''} class="rounded border-slate-300 text-brand-600 focus:ring-brand-500">
        ${s.Sector}
      </label>`).join('');
    document.querySelectorAll('#secCheckboxes input').forEach(cb => {
      cb.addEventListener('change', () => {
        selected = [...document.querySelectorAll('#secCheckboxes input:checked')].map(c => c.value);
        if (selected.length === 0) { cb.checked = true; selected = [cb.value]; }
        if (selected.length > 11) { cb.checked = false; selected = selected.slice(0,11); }
        updateChips(); drawCharts();
      });
    });
  };

  document.getElementById('addSecBtn').addEventListener('click', () => {
    document.getElementById('secSelectBox').classList.toggle('hidden');
  });

  const drawCharts = () => {
    const data = SECTORS.filter(s => selected.includes(s.Sector));
    const c = chartColors();

    // Bar
    if (charts.cmpSecBar) charts.cmpSecBar.destroy();
    charts.cmpSecBar = new Chart(document.getElementById('cmpSecBar'), {
      type: 'bar',
      data: {
        labels: data.map(s=>s.Sector),
        datasets: [{ label:'Ensemble Score', data: data.map(s=>s.Ensemble_Score), backgroundColor: SECTOR_COLORS, borderRadius:5 }]
      },
      options: { responsive:true, maintainAspectRatio:false, plugins:{legend:{display:false}},
        scales:{ x:{ticks:{color:c.text,font:{size:10}},grid:{display:false}}, y:{ticks:{color:c.text},grid:{color:c.grid}} } }
    });

    // Stability
    if (charts.cmpSecStab) charts.cmpSecStab.destroy();
    charts.cmpSecStab = new Chart(document.getElementById('cmpSecStab'), {
      type: 'bar',
      data: {
        labels: data.map(s=>s.Sector),
        datasets: [{ label:'Stability Std', data: data.map(s=>s.Stability_Std), backgroundColor: '#f59e0b', borderRadius:5 }]
      },
      options: { responsive:true, maintainAspectRatio:false, plugins:{legend:{display:false}},
        scales:{ x:{ticks:{color:c.text,font:{size:10}},grid:{display:false}}, y:{ticks:{color:c.text},grid:{color:c.grid}} } }
    });

    // Radar – normalize metrics
    const metrics = ['Ensemble_Score','Condorcet_Wins','Borda_Sum'];
    const maxes = metrics.map(m => Math.max(...SECTORS.map(s => s[m]||0)));
    if (charts.cmpSecRadar) charts.cmpSecRadar.destroy();
    charts.cmpSecRadar = new Chart(document.getElementById('cmpSecRadar'), {
      type: 'radar',
      data: {
        labels: ['Ensemble Score','Condorcet Wins','Borda Sum (inv)'],
        datasets: data.map((s,i) => ({
          label: s.Sector,
          data: [
            (s.Ensemble_Score||0)/maxes[0],
            (s.Condorcet_Wins||0)/maxes[1],
            1 - ((s.Borda_Sum||0)/maxes[2]) // invert so lower borda = better
          ],
          borderColor: SECTOR_COLORS[i % SECTOR_COLORS.length],
          backgroundColor: SECTOR_COLORS[i % SECTOR_COLORS.length] + '33',
          pointBackgroundColor: SECTOR_COLORS[i % SECTOR_COLORS.length]
        }))
      },
      options: {
        responsive:true, maintainAspectRatio:false,
        scales: { r: { beginAtZero:true, max:1, ticks:{display:false}, grid:{color:c.grid}, pointLabels:{color:c.text,font:{size:11}} } },
        plugins: { legend: { labels:{color:c.text, boxWidth:12, font:{size:11}} } }
      }
    });
  };

  updateChips();
  updateChecks();
  drawCharts();
}

function renderIndustryCmp() {
  const el = document.getElementById('cmpContent');
  let selected = INDUSTRIES.slice(0,5).map(i => i.Industry);

  el.innerHTML = `
    <div class="card p-4 mb-4">
      <p class="text-sm text-slate-500 mb-2">Select up to 15 industries to compare across key metrics.</p>
      <div class="flex flex-wrap items-center gap-2 mb-2">
        <span class="text-sm font-medium">Selected (${selected.length}/15):</span>
        <div id="indChips" class="flex flex-wrap gap-1.5"></div>
        <button id="addIndBtn" class="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-brand-500 text-white text-xs font-medium hover:bg-brand-600">+ Add</button>
      </div>
      <div id="indSelectBox" class="hidden mt-2 max-h-48 overflow-y-auto p-3 rounded-lg bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700">
        <input id="indSearchCmp" type="text" placeholder="Search..." class="w-full mb-2 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm" />
        <div id="indCheckboxes" class="flex flex-col gap-1"></div>
      </div>
    </div>
    <div class="grid lg:grid-cols-2 gap-4">
      <div class="card p-5"><h3 class="text-sm font-semibold mb-3">Market Cap</h3><div class="chart-container"><canvas id="cmpIndMcap"></canvas></div></div>
      <div class="card p-5"><h3 class="text-sm font-semibold mb-3">1Y Performance %</h3><div class="chart-container"><canvas id="cmpInd1Y"></canvas></div></div>
      <div class="card p-5"><h3 class="text-sm font-semibold mb-3">Dividend Yield %</h3><div class="chart-container"><canvas id="cmpIndDiv"></canvas></div></div>
      <div class="card p-5"><h3 class="text-sm font-semibold mb-3">Profit Margin %</h3><div class="chart-container"><canvas id="cmpIndPM"></canvas></div></div>
    </div>
  `;

  const refresh = () => {
    document.getElementById('indChips').innerHTML = selected.map(n =>
      `<span class="chip">${n.length>20?n.slice(0,18)+'…':n}<button data-rm="${n}">×</button></span>`
    ).join('');
    document.querySelectorAll('[data-rm]').forEach(b => b.addEventListener('click', () => {
      if (selected.length<=1) return;
      selected = selected.filter(x=>x!==b.dataset.rm);
      refresh(); draw();
    }));

    const q = (document.getElementById('indSearchCmp')?.value||'').toLowerCase();
    const pool = INDUSTRIES.filter(i => !q || i.Industry.toLowerCase().includes(q)).slice(0,80);
    document.getElementById('indCheckboxes').innerHTML = pool.map(i => `
      <label class="inline-flex items-center gap-1.5 text-sm cursor-pointer py-0.5">
        <input type="checkbox" value="${i.Industry}" ${selected.includes(i.Industry)?'checked':''} class="rounded text-brand-600">
        <span class="truncate">${i.Industry}</span>
        <span class="text-xs text-slate-400 ml-auto">${i.Sector}</span>
      </label>`).join('');
    document.querySelectorAll('#indCheckboxes input').forEach(cb => {
      cb.addEventListener('change', () => {
        selected = [...document.querySelectorAll('#indCheckboxes input:checked')].map(c=>c.value);
        if (selected.length>15) { cb.checked=false; selected=selected.slice(0,15); }
        if (selected.length===0) { cb.checked=true; selected=[cb.value]; }
        refresh(); draw();
      });
    });
  };

  const draw = () => {
    const data = selected.map(n => INDUSTRIES.find(i=>i.Industry===n)).filter(Boolean);
    const c = chartColors();
    const mkBar = (id, key, color, label) => {
      if (charts[id]) charts[id].destroy();
      charts[id] = new Chart(document.getElementById(id), {
        type: 'bar',
        data: {
          labels: data.map(i => i.Industry.length>18?i.Industry.slice(0,16)+'…':i.Industry),
          datasets: [{ label, data: data.map(i=>i[key]), backgroundColor: color, borderRadius:4 }]
        },
        options: {
          responsive:true, maintainAspectRatio:false, plugins:{legend:{display:false}},
          scales: {
            x:{ticks:{color:c.text,maxRotation:40,font:{size:9}},grid:{display:false}},
            y:{ticks:{color:c.text},grid:{color:c.grid}}
          }
        }
      });
    };
    mkBar('cmpIndMcap','Market_Cap','#339fff','Market Cap');
    // scale mcap
    if (charts.cmpIndMcap) {
      charts.cmpIndMcap.data.datasets[0].data = data.map(i => (i.Market_Cap||0)/1e9);
      charts.cmpIndMcap.options.plugins.tooltip = { callbacks:{ label: ctx => ' $'+ctx.raw.toFixed(1)+'B' } };
      charts.cmpIndMcap.update();
    }
    mkBar('cmpInd1Y','1Y_Change','#10b981','1Y %');
    mkBar('cmpIndDiv','Dividend_Yield','#f59e0b','Div Yield');
    mkBar('cmpIndPM','Profit_Margin','#8b5cf6','Profit Margin');
  };

  document.getElementById('addIndBtn').addEventListener('click', () => {
    document.getElementById('indSelectBox').classList.toggle('hidden');
  });
  document.getElementById('indSearchCmp').addEventListener('input', refresh);
  refresh();
  draw();
}

function renderSectorIndCmp() {
  const el = document.getElementById('cmpContent');
  el.innerHTML = `
    <div class="card p-4 mb-4 space-y-3">
      <div>
        <label class="text-sm font-medium">1. Select a Sector</label>
        <select id="siSector" class="mt-1 w-full max-w-xs px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm">
          <option value="">— Choose sector —</option>
          ${SECTORS.map(s=>`<option value="${s.Sector}">${s.Sector}</option>`).join('')}
        </select>
      </div>
      <div id="siIndArea" class="hidden">
        <label class="text-sm font-medium">2. Select industries to compare</label>
        <p class="text-xs text-slate-400 mb-2">Use the checkboxes to include industries in the charts below.</p>
        <div class="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-700">
          <table class="data-table w-full" id="siIndTable">
            <thead>
              <tr>
                <th class="w-16">Rank</th>
                <th>Industry</th>
                <th class="w-24 text-center">Select</th>
              </tr>
            </thead>
            <tbody id="siIndBody"></tbody>
          </table>
        </div>
      </div>
    </div>
    <div id="siCharts" class="grid lg:grid-cols-2 gap-4"></div>
  `;

  let selected = [];

  document.getElementById('siSector').addEventListener('change', (e) => {
    const sec = e.target.value;
    selected = [];
    if (!sec) {
      document.getElementById('siIndArea').classList.add('hidden');
      document.getElementById('siCharts').innerHTML = '';
      return;
    }
    document.getElementById('siIndArea').classList.remove('hidden');
    const list = [...(SECTOR_INDUSTRIES[sec] || [])].sort((a,b)=>(a.Sector_Rank||99)-(b.Sector_Rank||99));
    document.getElementById('siIndBody').innerHTML = list.map(i => `
      <tr>
        <td><span class="rank-badge ${fmt.rankBadge(i.Sector_Rank)}">${i.Sector_Rank ?? '—'}</span></td>
        <td class="font-medium">${i.Industry}</td>
        <td class="text-center">
          <input type="checkbox" value="${i.Industry.replace(/"/g,'&quot;')}" class="si-cb rounded text-brand-600 focus:ring-brand-500">
        </td>
      </tr>
    `).join('');

    document.querySelectorAll('.si-cb').forEach(cb => {
      cb.addEventListener('change', () => {
        selected = [...document.querySelectorAll('.si-cb:checked')].map(c => c.value);
        drawSI();
      });
    });
    drawSI();
  });

  function drawSI() {
    const sec = document.getElementById('siSector').value;
    const data = (SECTOR_INDUSTRIES[sec]||[]).filter(i => selected.includes(i.Industry));
    const box = document.getElementById('siCharts');
    if (data.length === 0) {
      box.innerHTML = '<p class="text-sm text-slate-500 col-span-2">Select industries in the table to see comparison charts.</p>';
      return;
    }
    const c = chartColors();
    // Charts: mcap, 1Y, div first — Sector vs Overall Rank LAST as requested
    box.innerHTML = `
      <div class="card p-5"><h3 class="text-sm font-semibold mb-3">Market Cap (Billion)</h3><div class="chart-container"><canvas id="siMcap"></canvas></div></div>
      <div class="card p-5"><h3 class="text-sm font-semibold mb-3">1Y Performance</h3><div class="chart-container"><canvas id="si1Y"></canvas></div></div>
      <div class="card p-5"><h3 class="text-sm font-semibold mb-3">Dividend Yield</h3><div class="chart-container"><canvas id="siDiv"></canvas></div></div>
      <div class="card p-5 lg:col-span-2"><h3 class="text-sm font-semibold mb-3">Sector Rank vs Overall Rank</h3><div class="chart-container"><canvas id="siRank"></canvas></div></div>
    `;

    const labels = data.map(i => i.Industry.length > 20 ? i.Industry.slice(0,18)+'…' : i.Industry);

    if (charts.siMcap) charts.siMcap.destroy();
    charts.siMcap = new Chart(document.getElementById('siMcap'), {
      type: 'bar',
      data: { labels, datasets: [{ label: 'Market Cap $B', data: data.map(i => (i.Market_Cap||0)/1e9), backgroundColor: '#339fff', borderRadius: 4 }] },
      options: { responsive:true, maintainAspectRatio:false, plugins:{legend:{display:false}},
        scales:{ x:{ticks:{color:c.text,maxRotation:40,font:{size:9}},grid:{display:false}}, y:{ticks:{color:c.text},grid:{color:c.grid}} } }
    });

    if (charts.si1Y) charts.si1Y.destroy();
    charts.si1Y = new Chart(document.getElementById('si1Y'), {
      type: 'bar',
      data: { labels, datasets: [{ label: '1Y %', data: data.map(i => i['1Y_Change']), backgroundColor: data.map(i => (i['1Y_Change']||0)>=0?'#10b981':'#ef4444'), borderRadius: 4 }] },
      options: { responsive:true, maintainAspectRatio:false, plugins:{legend:{display:false}},
        scales:{ x:{ticks:{color:c.text,maxRotation:40,font:{size:9}},grid:{display:false}}, y:{ticks:{color:c.text},grid:{color:c.grid}} } }
    });

    if (charts.siDiv) charts.siDiv.destroy();
    charts.siDiv = new Chart(document.getElementById('siDiv'), {
      type: 'bar',
      data: { labels, datasets: [{ label: 'Div Yield', data: data.map(i => i.Dividend_Yield), backgroundColor: '#f59e0b', borderRadius: 4 }] },
      options: { responsive:true, maintainAspectRatio:false, plugins:{legend:{display:false}},
        scales:{ x:{ticks:{color:c.text,maxRotation:40,font:{size:9}},grid:{display:false}}, y:{ticks:{color:c.text},grid:{color:c.grid}} } }
    });

    if (charts.siRank) charts.siRank.destroy();
    charts.siRank = new Chart(document.getElementById('siRank'), {
      type: 'bar',
      data: {
        labels,
        datasets: [
          { label: 'Sector Rank', data: data.map(i => i.Sector_Rank), backgroundColor: '#339fff', borderRadius: 4 },
          { label: 'Overall Rank', data: data.map(i => i.Final_Rank), backgroundColor: '#8b5cf6', borderRadius: 4 }
        ]
      },
      options: {
        responsive:true, maintainAspectRatio:false,
        plugins:{ legend:{ labels:{ color:c.text, boxWidth:10, font:{size:10} } } },
        scales:{
          x:{ticks:{color:c.text,maxRotation:40,font:{size:9}},grid:{display:false}},
          y:{ reverse:true, ticks:{color:c.text}, grid:{color:c.grid}, title:{ display:true, text:'Rank (lower is better)', color:c.text } }
        }
      }
    });
  }
}


/* ============================================================
   5. INSIGHTS
   ============================================================ */
function renderInsights() {
  const el = document.getElementById('panel-insights');
  el.innerHTML = `
    <div class="flex gap-2 mb-4 overflow-x-auto scrollbar-hide">
      <button class="tab-btn active" data-ins="overview">Overview</button>
      <button class="tab-btn" data-ins="sector">Sector Insights</button>
      <button class="tab-btn" data-ins="industry">Industry Insights</button>
    </div>
    <div id="insContent"></div>
  `;

  const overviewInsights = generateOverviewInsights();
  const sectorInsights = generateSectorInsights();
  const industryInsights = generateIndustryInsights();

  const show = (type) => {
    el.querySelectorAll('[data-ins]').forEach(b => b.classList.toggle('active', b.dataset.ins===type));
    const list = type==='overview' ? overviewInsights : type==='sector' ? sectorInsights : industryInsights;
    document.getElementById('insContent').innerHTML = `
      <div class="grid md:grid-cols-2 gap-4">
        ${list.map((txt,i) => `
          <div class="card p-4 insight-card animate-in" style="animation-delay:${i*40}ms">
            <div class="flex gap-3">
              <span class="flex-shrink-0 w-7 h-7 rounded-full bg-brand-100 dark:bg-brand-900/40 text-brand-600 dark:text-brand-400 flex items-center justify-center text-xs font-bold">${i+1}</span>
              <p class="text-sm leading-relaxed text-slate-700 dark:text-slate-300">${txt}</p>
            </div>
          </div>
        `).join('')}
      </div>
    `;
  };

  el.querySelectorAll('[data-ins]').forEach(b => b.addEventListener('click', () => show(b.dataset.ins)));
  show('overview');
}

function generateOverviewInsights() {
  const topS = SECTORS[0];
  const botS = SECTORS[SECTORS.length-1];
  const topI = INDUSTRIES[0];
  const best1Y = [...INDUSTRIES].filter(i=>i['1Y_Change']!=null).sort((a,b)=>b['1Y_Change']-a['1Y_Change'])[0];
  const bestDiv = [...INDUSTRIES].filter(i=>i.Dividend_Yield!=null).sort((a,b)=>b.Dividend_Yield-a.Dividend_Yield)[0];
  const totalStocks = INDUSTRIES.reduce((s,i)=>s+(i.Stocks_Count||0),0);
  const avgDiv = INDUSTRIES.filter(i=>i.Dividend_Yield!=null).reduce((s,i)=>s+i.Dividend_Yield,0) / INDUSTRIES.filter(i=>i.Dividend_Yield!=null).length;

  return [
    `<strong>${topS.Sector}</strong> leads the sector rankings with an ensemble score of <strong>${fmt.num(topS.Ensemble_Score)}</strong>, demonstrating superior multi-factor strength across ranking methodologies.`,
    `The weakest sector currently is <strong>${botS.Sector}</strong> (Rank #${botS.Final_Rank}), indicating relative underperformance on the composite scoring framework.`,
    `Across <strong>${STATS.total_industries} industries</strong> and approximately <strong>${fmt.num(totalStocks,0)} stocks</strong>, the platform covers the full investable universe used in the ranking models.`,
    `<strong>${topI.Industry}</strong> is the highest-ranked industry overall (Rank #1), belonging to the <strong>${topI.Sector}</strong> sector.`,
    `Best 1-year performing industry: <strong>${best1Y.Industry}</strong> with a return of <strong class="pos">+${fmt.pct(best1Y['1Y_Change'])}</strong>.`,
    `Highest dividend yield industry: <strong>${bestDiv.Industry}</strong> offering <strong>${fmt.pct(bestDiv.Dividend_Yield)}</strong> — attractive for income-focused portfolios.`,
    `Average industry dividend yield across the universe stands at approximately <strong>${fmt.pct(avgDiv)}</strong>.`,
    `Sector ranking stability (measured by rank standard deviation) is highest for more volatile sectors; lower Stability_Std indicates more consistent ranking across methods.`,
    `Technology and Energy dominate the upper half of both sector and industry rankings, reflecting strong profitability and growth metrics in the current data window.`,
    `Investors should note that ranks are derived from a multi-criteria decision-making (MCDM) ensemble (SAW, TOPSIS, VIKOR, GRA, WASPAS, COPRAS, PCA) rather than any single metric.`
  ];
}

function generateSectorInsights() {
  const sorted = [...SECTORS];
  const mostStable = [...SECTORS].sort((a,b)=>(a.Stability_Std||99)-(b.Stability_Std||99))[0];
  const leastStable = [...SECTORS].sort((a,b)=>(b.Stability_Std||0)-(a.Stability_Std||0))[0];
  const topCond = [...SECTORS].sort((a,b)=>(b.Condorcet_Wins||0)-(a.Condorcet_Wins||0))[0];

  return [
    `<strong>${SECTORS[0].Sector}</strong> occupies Rank 1 with the highest Condorcet wins (${SECTORS[0].Condorcet_Wins}), meaning it pairwise-beats most other sectors under the ranking methods.`,
    `<strong>${mostStable.Sector}</strong> shows the highest ranking stability (Std ${fmt.num(mostStable.Stability_Std,2)}), making its position the most robust across different MCDM techniques.`,
    `<strong>${leastStable.Sector}</strong> exhibits the largest rank dispersion (Std ${fmt.num(leastStable.Stability_Std,2)}), signalling method-sensitive results — interpret with caution.`,
    `Information Technology / Technology consistently places in the top 3, driven by high profitability and growth factors embedded in the model.`,
    `Financials ranks #${SECTORS.find(s=>s.Sector==='Financials')?.Final_Rank}, reflecting solid capital returns but moderate growth relative to Energy and Tech.`,
    `Consumer Staples ranks near the bottom (#${SECTORS.find(s=>s.Sector==='Consumer Staples')?.Final_Rank}), typical of defensive sectors in a growth-oriented scoring framework.`,
    `Real Estate appears mid-to-lower in the sector table, yet contains several top-ranked industries (e.g. REIT-Mortgage), illustrating intra-sector dispersion.`,
    `Utilities ranks #${SECTORS.find(s=>s.Sector==='Utilities')?.Final_Rank}; regulated utilities provide stable dividends but lower growth scores in the ensemble.`,
    `The Borda count and Condorcet methods largely agree on the top 4 sectors, increasing confidence in the leadership ranking.`,
    `Sector scores are relative — a lower rank does not imply absolute weakness, only comparative standing under the chosen factor weights and normalization.`
  ];
}

function generateIndustryInsights() {
  const reits = INDUSTRIES.filter(i => i.Industry.includes('REIT'));
  const semis = INDUSTRIES.find(i => i.Industry === 'Semiconductors');
  const banks = INDUSTRIES.filter(i => i.Industry.includes('Banks'));
  const top5 = INDUSTRIES.slice(0,5);

  return [
    `REIT-related industries dominate the top of the overall industry ranking — <strong>REIT - Mortgage</strong> and <strong>REIT - Office</strong> occupy Rank 1 and 2, driven by elevated dividend yields.`,
    `<strong>Marine Shipping</strong> (Rank #3) delivered exceptional 1Y returns (${fmt.pct(INDUSTRIES.find(i=>i.Industry==='Marine Shipping')?.['1Y_Change'])}), highlighting cyclical strength.`,
    `Semiconductors industry ranks #${semis?.Final_Rank} with massive market capitalization (${fmt.mcap(semis?.Market_Cap)}) and strong 1Y performance (${fmt.pct(semis?.['1Y_Change'])}).`,
    `Diversified and Regional Banks together cover hundreds of stocks; Banks - Regional alone has ${INDUSTRIES.find(i=>i.Industry==='Banks - Regional')?.Stocks_Count || '—'} constituents.`,
    `Top 5 industries by overall rank: ${top5.map(i=>i.Industry).join(', ')}.`,
    `Industries with the highest stock counts tend to be more heterogeneous; ranking them requires careful factor weighting to avoid size bias.`,
    `Profit margin leaders (e.g. certain Software and Semiconductor industries) score well on quality factors inside the MCDM models.`,
    `High dividend-yield industries cluster in Real Estate and Energy — useful for income screens but may lag on growth metrics.`,
    `1D and 1Y change columns allow quick identification of recent momentum; several Communication Services industries show elevated short-term moves.`,
    `When drilling from sector → industry, always prefer the <em>Sector Rank</em> column for relative attractiveness inside a chosen sector; Overall Rank is better for cross-sector screens.`
  ];
}

/* -------------------- MODAL -------------------- */
function openIndustryModal(ind, opts = {}) {
  const modal = document.getElementById('industryModal');
  document.getElementById('modalTitle').textContent = ind.Industry;
  document.getElementById('modalSector').textContent = ind.Sector;
  const stocks = stocksForIndustry(ind.Sector, ind.Industry);

  const stockTable = stocks.length ? `
    <div>
      <h4 class="text-sm font-semibold mb-2">Stocks in this industry (${stocks.length})</h4>
      <div class="stock-scroll">
        <table class="data-table w-full">
          <thead>
            <tr>
              <th>Symbol</th>
              <th>Company</th>
              <th>Country</th>
            </tr>
          </thead>
          <tbody>
            ${stocks.map(s => `
              <tr class="stock-row cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/50" data-sym="${s.Symbol}">
                <td class="font-semibold text-brand-600 dark:text-brand-400">${s.Symbol}</td>
                <td>${s.CompanyName || '—'}</td>
                <td class="text-slate-500">${s.Country || '—'}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
      <p class="text-[11px] text-slate-400 mt-1">Click a stock to open Stock Analysis.</p>
    </div>
  ` : `<p class="text-sm text-slate-500">No stock list available for this industry.</p>`;

  document.getElementById('modalBody').innerHTML = `
    <div class="grid grid-cols-2 sm:grid-cols-3 gap-3">
      <div class="p-3 rounded-lg bg-slate-50 dark:bg-slate-800/50">
        <p class="text-xs text-slate-500">Overall Rank</p>
        <p class="text-lg font-bold">#${ind.Final_Rank ?? '—'}</p>
      </div>
      <div class="p-3 rounded-lg bg-slate-50 dark:bg-slate-800/50">
        <p class="text-xs text-slate-500">Within-Sector Rank</p>
        <p class="text-lg font-bold">#${ind.Sector_Rank ?? '—'}</p>
      </div>
      <div class="p-3 rounded-lg bg-slate-50 dark:bg-slate-800/50">
        <p class="text-xs text-slate-500">Stocks</p>
        <p class="text-lg font-bold">${fmt.num(ind.Stocks_Count,0)}</p>
      </div>
      <div class="p-3 rounded-lg bg-slate-50 dark:bg-slate-800/50">
        <p class="text-xs text-slate-500">Market Cap</p>
        <p class="text-lg font-bold">${fmt.mcap(ind.Market_Cap)}</p>
      </div>
      <div class="p-3 rounded-lg bg-slate-50 dark:bg-slate-800/50">
        <p class="text-xs text-slate-500">Dividend Yield</p>
        <p class="text-lg font-bold">${fmt.pct(ind.Dividend_Yield)}</p>
      </div>
      <div class="p-3 rounded-lg bg-slate-50 dark:bg-slate-800/50">
        <p class="text-xs text-slate-500">Trailing PE</p>
        <p class="text-lg font-bold">${fmt.num(ind.Trailing_PE)}</p>
      </div>
      <div class="p-3 rounded-lg bg-slate-50 dark:bg-slate-800/50">
        <p class="text-xs text-slate-500">Profit Margin</p>
        <p class="text-lg font-bold">${fmt.pct(ind.Profit_Margin)}</p>
      </div>
      <div class="p-3 rounded-lg bg-slate-50 dark:bg-slate-800/50">
        <p class="text-xs text-slate-500">1Y Change</p>
        <p class="text-lg font-bold ${fmt.changeClass(ind['1Y_Change'])}">${fmt.pct(ind['1Y_Change'])}</p>
      </div>
    </div>
    ${stockTable}
    <div class="pt-2">
      <button type="button" id="btnDetailedInfo" class="w-full sm:w-auto px-4 py-2 rounded-lg bg-brand-600 hover:bg-brand-700 text-white text-sm font-semibold">
        Detailed info → Sector Deep Dive
      </button>
    </div>
  `;

  document.getElementById('btnDetailedInfo')?.addEventListener('click', () => {
    modal.classList.remove('open');
    goToDeepDive(ind.Sector, ind.Industry);
  });

  document.querySelectorAll('#modalBody .stock-row').forEach(row => {
    row.addEventListener('click', (e) => {
      e.stopPropagation();
      goToStockAnalysis(row.dataset.sym);
    });
  });

  modal.classList.add('open');
}

function closeSidebar() {
  const sidebar = document.getElementById('sidebar');
  if (sidebar) sidebar.classList.remove('open');
  document.body.classList.remove('sidebar-open');
}
function openSidebar() {
  const sidebar = document.getElementById('sidebar');
  if (sidebar) sidebar.classList.add('open');
  document.body.classList.add('sidebar-open');
}
function toggleSidebar() {
  const sidebar = document.getElementById('sidebar');
  if (!sidebar) return;
  if (sidebar.classList.contains('open')) closeSidebar();
  else openSidebar();
}

document.getElementById('modalClose')?.addEventListener('click', () => {
  document.getElementById('industryModal')?.classList.remove('open');
});
document.getElementById('industryModal')?.addEventListener('click', (e) => {
  if (e.target === e.currentTarget) e.currentTarget.classList.remove('open');
});

/* -------------------- INIT -------------------- */
(async function init() {
  try {
    await loadData();
    document.getElementById('loader').classList.add('hidden');
    initTabs();

    // Mobile menu + close (X)
    const btn = document.getElementById('mobileMenuBtn');
    if (btn) btn.addEventListener('click', toggleSidebar);
    
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
document.getElementById('sidebarCloseBtn')?.addEventListener('click', closeSidebar);
    // Close sidebar when navigating on small screens
    document.querySelectorAll('#sidebar a.nav-item').forEach(a => {
      a.addEventListener('click', () => {
        if (window.matchMedia('(max-width: 768px)').matches) closeSidebar();
      });
    });
    // Backdrop click closes
    document.addEventListener('click', (e) => {
      const sidebar = document.getElementById('sidebar');
      if (!sidebar || !sidebar.classList.contains('open')) return;
      if (window.innerWidth > 768) return;
      if (sidebar.contains(e.target) || e.target.closest('#mobileMenuBtn')) return;
      // only when body has overlay intent
      if (document.body.classList.contains('sidebar-open')) closeSidebar();
    });

    // Sector ranks modal close
    document.getElementById('sectorRanksClose')?.addEventListener('click', () => {
      document.getElementById('sectorRanksModal')?.classList.remove('open');
    });
    document.getElementById('sectorRanksModal')?.addEventListener('click', (e) => {
      if (e.target === e.currentTarget) e.currentTarget.classList.remove('open');
    });

    // Re-render charts on theme change
    window.addEventListener('themechange', () => {
      // Destroy and re-create visible charts by re-rendering current panel
      const active = document.querySelector('#mainTabs .tab-btn.active');
      if (active) {
        const panel = document.getElementById('panel-' + active.dataset.tab);
        if (panel) {
          panel.dataset.rendered = '';
          renderPanel(active.dataset.tab);
          panel.dataset.rendered = '1';
        }
      }
    });
  } catch (err) {
    console.error(err);
    document.getElementById('loader').innerHTML = `<p class="text-red-500">Failed to load data. Check console.</p>`;
  }
})();
