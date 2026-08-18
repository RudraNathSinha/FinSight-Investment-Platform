/* © All rights reserved FinSight prepared by Rudra Nath Sinha */
/* ============================================================
   FinSight – Part 2: Stock Data Visualization
   ============================================================ */

let SECTORS = [];
let INDUSTRIES = [];
let SECTOR_INDUSTRIES = {};
let STOCK_TREE = {};       // sector -> industry -> [{Symbol, CompanyName, Country}]
let STOCK_RANKINGS = {};   // sector -> [stock rank records]
let UNIVERSE = [];
let charts = {};
let compareList = [];      // selected stocks for comparison

const SECTOR_COLORS = [
  '#339fff','#10b981','#f59e0b','#ef4444','#8b5cf6',
  '#ec4899','#06b6d4','#84cc16','#f97316','#6366f1','#14b8a6'
];

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
async function fetchJson(url) {
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) {
    throw new Error('Failed to fetch ' + url + ' (' + res.status + ')');
  }
  return res.json();
}

async function loadData() {
  // Prefer same-origin /data when served from Flask; fall back to relative ../data
  const candidates = ['../data/', '/data/', 'data/'];
  let lastErr = null;
  for (const base of candidates) {
    try {
      const [s, i, si, tree, univ] = await Promise.all([
        fetchJson(base + 'sectors.json'),
        fetchJson(base + 'industries.json'),
        fetchJson(base + 'sector_industries.json'),
        fetchJson(base + 'sector_industry_stocks.json').catch(() => ({})),
        fetchJson(base + 'stocks_universe.json')
      ]);
      SECTORS = (s || []).slice().sort((a,b) => a.Final_Rank - b.Final_Rank);
      INDUSTRIES = (i || []).slice().sort((a,b) => a.Final_Rank - b.Final_Rank);
      SECTOR_INDUSTRIES = si || {};
      STOCK_TREE = tree || {};
      UNIVERSE = univ || [];
      console.info('[FinSight Part2] data loaded from', base, 'universe', UNIVERSE.length);
      return;
    } catch (e) {
      lastErr = e;
      console.warn('[FinSight Part2] data base failed:', base, e.message);
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
  } catch (e) {
    console.warn('No ranking file for', sector);
    return [];
  }
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
        if (!panel.dataset.rendered) {
          renderPanel(btn.dataset.tab);
          panel.dataset.rendered = '1';
        }
      }
    });
  });
  document.querySelector('[data-tab="overview"]').click();
}

function renderPanel(name) {
  const map = {
    overview: renderOverview,
    sectorwise: renderSectorWise,
    comparison: renderComparison,
    insights: renderInsights
  };
  if (map[name]) map[name]();
}

/* ==================== 1. OVERVIEW (Hierarchy Map) ==================== */
function renderOverview() {
  const el = document.getElementById('panel-overview');
  el.innerHTML = `
    <div class="hierarchy-wrap card p-3 sm:p-4 md:p-6 mb-4">
      <div id="hierarchyCanvas" class="hierarchy-stage relative mx-auto" style="min-height:520px; min-width:640px;">
        <div class="hierarchy-center cursor-pointer" id="hierCenter" title="Sector & Industry overview">
          <span class="text-[11px] font-bold leading-tight text-center text-white">Sector &amp;<br>Industry</span>
        </div>
        <div id="hierSectors"></div>
        <div id="hierIndustries"></div>
      </div>
    </div>

    <button type="button" id="toggleListView" class="detailed-info-btn">Detailed Info</button>
    <div id="hierarchyList" class="hidden space-y-3 mb-6"></div>

    <div class="grid grid-cols-3 gap-3 sm:gap-4" id="overviewStats"></div>
  `;

  buildRadialHierarchy();
  buildListHierarchy();

  document.getElementById('hierCenter')?.addEventListener('click', openCenterOverview);
  document.getElementById('toggleListView').addEventListener('click', () => {
    const list = document.getElementById('hierarchyList');
    list.classList.toggle('hidden');
    if (!list.classList.contains('hidden')) {
      // ensure all sector bodies closed
      list.querySelectorAll('.sec-accordion').forEach(a => a.classList.remove('open'));
    }
  });

  const totalStocks = UNIVERSE.length;
  document.getElementById('overviewStats').innerHTML = `
    <div class="card p-3 sm:p-4 text-center">
      <p class="text-xl sm:text-2xl font-extrabold text-brand-600">${SECTORS.length}</p>
      <p class="text-[10px] sm:text-xs text-slate-500 mt-1">Sectors</p>
    </div>
    <div class="card p-3 sm:p-4 text-center">
      <p class="text-xl sm:text-2xl font-extrabold text-emerald-600">${INDUSTRIES.length}</p>
      <p class="text-[10px] sm:text-xs text-slate-500 mt-1">Industries</p>
    </div>
    <div class="card p-3 sm:p-4 text-center">
      <p class="text-xl sm:text-2xl font-extrabold text-violet-600">${totalStocks.toLocaleString()}</p>
      <p class="text-[10px] sm:text-xs text-slate-500 mt-1">Stocks</p>
    </div>
  `;

  // Re-layout on resize for responsiveness
  if (!window.__hierResizeBound) {
    window.__hierResizeBound = true;
    let t;
    window.addEventListener('resize', () => {
      clearTimeout(t);
      t = setTimeout(() => {
        if (document.getElementById('hierarchyCanvas')) buildRadialHierarchy();
      }, 150);
    });
  }
}

function openCenterOverview() {
  const modal = document.getElementById('detailModal');
  document.getElementById('modalTitle').textContent = 'Sector & Industry Map';
  document.getElementById('modalSub').textContent = 'Market hierarchy overview';
  document.getElementById('modalBody').innerHTML = `
    <p class="text-sm text-slate-600 dark:text-slate-300">
      This map organizes the investable universe into <strong>${SECTORS.length} sectors</strong> and
      <strong>${INDUSTRIES.length} industries</strong>, covering about <strong>${UNIVERSE.length.toLocaleString()}</strong> stocks.
      The center represents the full market structure; the middle ring is sectors; outer chips are industries ranked within each sector.
    </p>
    <p class="text-sm text-slate-600 dark:text-slate-300">
      Use <strong>Detailed Info</strong> to jump to that sector’s block in the list and expand its industries.
    </p>
    <button type="button" id="modalBreakdown" class="w-full mt-2 py-2.5 rounded-lg bg-brand-600 hover:bg-brand-700 text-white text-sm font-semibold">
      Detailed Info
    </button>
  `;
  document.getElementById('modalBreakdown')?.addEventListener('click', () => {
    modal.classList.remove('open');
    openDetailedInfoList(null);
  });
  modal.classList.add('open');
}

function openDetailedInfoList(focusSector) {
  const list = document.getElementById('hierarchyList');
  const btn = document.getElementById('toggleListView');
  if (!list) return;
  // Always reveal the 11 sector boxes
  list.classList.remove('hidden');
  // Ensure list content exists
  if (!list.querySelector('.sec-accordion') && typeof buildListHierarchy === 'function') {
    try { buildListHierarchy(); } catch (_) {}
  }
  // Close all accordions first so only one focus sector expands
  list.querySelectorAll('.sec-accordion').forEach(a => a.classList.remove('open'));
  // Scroll to the sector list region
  setTimeout(() => {
    if (focusSector) {
      let acc = list.querySelector('.sec-accordion[data-sector="' + CSS.escape(focusSector) + '"]');
      if (!acc) {
        list.querySelectorAll('.sec-accordion').forEach(a => {
          if ((a.getAttribute('data-sector') || '').toLowerCase() === String(focusSector).toLowerCase()) acc = a;
        });
      }
      if (acc) {
        acc.classList.add('open');
        acc.scrollIntoView({ behavior: 'smooth', block: 'center' });
        return;
      }
    }
    // No specific sector: scroll to the list of all 11 sector boxes
    list.scrollIntoView({ behavior: 'smooth', block: 'start' });
    btn?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, 80);
}

function buildRadialHierarchy() {
  const stage = document.getElementById('hierarchyCanvas');
  const secLayer = document.getElementById('hierSectors');
  const indLayer = document.getElementById('hierIndustries');
  if (!stage || !secLayer || !indLayer) return;
  secLayer.innerHTML = '';
  indLayer.innerHTML = '';

  const parent = stage.parentElement;
  const avail = Math.max(parent?.clientWidth || 0, stage.clientWidth || 0, 320);
  // Cap width on large screens; allow horizontal scroll on small
  const W = Math.max(Math.min(avail - 8, 900), 460);
  const H = W < 560 ? 460 : 520;
  stage.style.minWidth = W + 'px';
  stage.style.width = W + 'px';
  stage.style.height = H + 'px';
  const cx = W / 2, cy = H / 2;
  const R_SEC = Math.min(W, H) * 0.28;
  const R_IND = Math.min(W, H) * 0.42;
  const n = SECTORS.length || 1;

  SECTORS.forEach((sec, idx) => {
    const angle = (idx / n) * Math.PI * 2 - Math.PI / 2;
    const sx = cx + R_SEC * Math.cos(angle);
    const sy = cy + R_SEC * Math.sin(angle);
    const color = SECTOR_COLORS[idx % SECTOR_COLORS.length];

    const node = document.createElement('div');
    node.className = 'hier-sector-node';
    node.style.left = (sx - (W < 560 ? 44 : 52)) + 'px';
    node.style.top = (sy - 28) + 'px';
    node.style.borderColor = color;
    node.innerHTML = `
      <span class="text-[10px] font-bold truncate block" title="${sec.Sector}">${sec.Sector}</span>
      <span class="badge ${fmt.rankBadge(sec.Final_Rank)} text-[9px]">#${sec.Final_Rank}</span>
    `;
    node.addEventListener('click', () => showSectorDetail(sec.Sector));
    secLayer.appendChild(node);

    const inds = (SECTOR_INDUSTRIES[sec.Sector] || []).slice().sort((a,b) => a.Sector_Rank - b.Sector_Rank);
    const m = inds.length || 1;
    const spread = Math.min(1.1, 0.35 + m * 0.06);
    inds.forEach((ind, j) => {
      const a2 = angle - spread / 2 + (m === 1 ? spread / 2 : (j / (m - 1 || 1)) * spread);
      const ix = cx + (R_IND + (j % 3) * 12) * Math.cos(a2);
      const iy = cy + (R_IND + (j % 3) * 12) * Math.sin(a2);
      const chip = document.createElement('div');
      chip.className = 'hier-ind-node';
      chip.style.left = (ix - 36) + 'px';
      chip.style.top = (iy - 12) + 'px';
      chip.style.borderColor = color;
      chip.title = `${ind.Industry} · Sector #${ind.Sector_Rank} · Overall #${ind.Final_Rank}`;
      chip.textContent = ind.Industry.length > 14 ? ind.Industry.slice(0, 12) + '…' : ind.Industry;
      chip.addEventListener('click', (e) => {
        e.stopPropagation();
        goToSectorWise(sec.Sector, ind.Industry);
      });
      indLayer.appendChild(chip);
    });
  });
}

function buildListHierarchy() {
  const el = document.getElementById('hierarchyList');
  if (!el) return;
  el.innerHTML = SECTORS.map((sec, idx) => {
    const inds = (SECTOR_INDUSTRIES[sec.Sector] || []).slice().sort((a,b) => a.Sector_Rank - b.Sector_Rank);
    const stockCount = STOCK_TREE[sec.Sector]
      ? Object.values(STOCK_TREE[sec.Sector]).reduce((a, arr) => a + arr.length, 0) : 0;
    const color = SECTOR_COLORS[idx % SECTOR_COLORS.length];
    return `
      <div class="card p-4 sec-accordion" style="border-left-color:${color}" data-sector="${sec.Sector}">
        <div class="sec-head flex items-center justify-between gap-2">
          <div class="flex items-center gap-2 min-w-0">
            <span class="chev text-slate-400 text-xs">▶</span>
            <span class="badge ${fmt.rankBadge(sec.Final_Rank)}">#${sec.Final_Rank}</span>
            <span class="font-semibold text-sm truncate">${sec.Sector}</span>
            <span class="text-[10px] text-slate-400 whitespace-nowrap">${inds.length} ind. · ${stockCount} stocks</span>
          </div>
          <span class="text-xs text-slate-400 whitespace-nowrap">Score ${fmt.num(sec.Ensemble_Score,1)}</span>
        </div>
        <div class="sec-body">
          <div class="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-700 mt-1">
            <table class="data-table w-full">
              <thead>
                <tr>
                  <th>Rank</th>
                  <th>Industry</th>
                  <th>Stocks</th>
                  <th>Overall #</th>
                </tr>
              </thead>
              <tbody>
                ${inds.map(ind => `
                  <tr class="industry-row" data-sector="${sec.Sector}" data-industry="${ind.Industry.replace(/"/g,'&quot;')}">
                    <td><span class="badge ${fmt.rankBadge(ind.Sector_Rank)}">#${ind.Sector_Rank}</span></td>
                    <td class="font-medium">${ind.Industry}</td>
                    <td>${fmt.num(ind.Stocks_Count,0)}</td>
                    <td class="text-slate-500">#${ind.Final_Rank}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    `;
  }).join('');

  el.querySelectorAll('.sec-accordion .sec-head').forEach(head => {
    head.addEventListener('click', () => {
      const acc = head.closest('.sec-accordion');
      const wasOpen = acc.classList.contains('open');
      el.querySelectorAll('.sec-accordion').forEach(a => a.classList.remove('open'));
      if (!wasOpen) acc.classList.add('open');
    });
  });

  el.querySelectorAll('.industry-row').forEach(row => {
    row.addEventListener('click', (e) => {
      e.stopPropagation();
      goToSectorWise(row.dataset.sector, row.dataset.industry);
    });
  });
}

function showSectorDetail(sectorName) {
  const sec = SECTORS.find(s => s.Sector === sectorName);
  if (!sec) return;
  const inds = SECTOR_INDUSTRIES[sectorName] || [];
  const stockCount = STOCK_TREE[sectorName]
    ? Object.values(STOCK_TREE[sectorName]).reduce((a, arr) => a + arr.length, 0) : 0;
  const modal = document.getElementById('detailModal');
  document.getElementById('modalTitle').textContent = sectorName;
  document.getElementById('modalSub').textContent = `Sector rank #${sec.Final_Rank} · Ensemble ${fmt.num(sec.Ensemble_Score,2)}`;
  document.getElementById('modalBody').innerHTML = `
    <p class="text-sm text-slate-600 dark:text-slate-300">
      <strong>${sectorName}</strong> ranks <strong>#${sec.Final_Rank}</strong> among ${SECTORS.length} sectors
      with ensemble score <strong>${fmt.num(sec.Ensemble_Score,2)}</strong>.
      It contains <strong>${inds.length}</strong> industries and about <strong>${stockCount}</strong> stocks in the universe.
    </p>
    <div class="grid grid-cols-2 gap-2 text-sm">
      <div class="p-2 rounded-lg bg-slate-50 dark:bg-slate-800/50"><span class="text-xs text-slate-500">Stability Std</span><br><strong>${fmt.num(sec.Stability_Std,2)}</strong></div>
      <div class="p-2 rounded-lg bg-slate-50 dark:bg-slate-800/50"><span class="text-xs text-slate-500">Industries</span><br><strong>${inds.length}</strong></div>
    </div>
    <button type="button" id="modalBreakdown" class="w-full mt-2 py-2.5 rounded-lg bg-brand-600 hover:bg-brand-700 text-white text-sm font-semibold">
      Detailed Info
    </button>
  `;
  document.getElementById('modalBreakdown')?.addEventListener('click', () => {
    modal.classList.remove('open');
    openDetailedInfoList(sectorName);
  });
  modal.classList.add('open');
}

function showIndustryDetail(sector, industry) {
  // Direct navigation as requested for industry nodes
  goToSectorWise(sector, industry);
}

function goToSectorWise(sector, industry) {
  const tab = document.querySelector('#mainTabs .tab-btn[data-tab="sectorwise"]');
  if (tab) tab.click();
  setTimeout(() => {
    if (typeof window.__sectorWiseSelect === 'function') {
      window.__sectorWiseSelect(sector, industry);
    }
  }, 60);
}

function goToInsights(symbol) {
  const tab = document.querySelector('#mainTabs .tab-btn[data-tab="insights"]');
  if (tab) tab.click();
  setTimeout(() => {
    if (typeof window.__insightsSelect === 'function') {
      window.__insightsSelect(symbol);
    }
  }, 60);
}

/* ==================== 2. SECTOR & INDUSTRY WISE ==================== */
function renderSectorWise() {
  const el = document.getElementById('panel-sectorwise');
  el.innerHTML = `
    <div class="mb-4">
      <h2 class="text-xl font-bold mb-1">Sector & Industry Wise Stock Analysis</h2>
      <p class="text-sm text-slate-500">Select a sector, then an industry, to view ranked stocks with full MCDM scores.</p>
    </div>
    <div class="flex gap-1 overflow-x-auto py-2 mb-3 scrollbar-hide task-bar rounded-lg px-2" id="secTabs"></div>
    <div class="flex gap-1 overflow-x-auto py-2 mb-4 scrollbar-hide task-bar rounded-lg px-2" id="indTabs"></div>
    <div id="stockViz"></div>
  `;

  const secTabs = document.getElementById('secTabs');
  SECTORS.forEach((sec, idx) => {
    const btn = document.createElement('button');
    btn.className = 'tab-btn' + (idx === 0 ? ' active' : '');
    btn.textContent = sec.Sector;
    btn.dataset.sector = sec.Sector;
    btn.addEventListener('click', () => {
      secTabs.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      renderIndustryTabs(sec.Sector);
    });
    secTabs.appendChild(btn);
  });

  window.__sectorWiseSelect = (sector, industry) => {
    const secBtn = [...secTabs.querySelectorAll('.tab-btn')].find(b => b.dataset.sector === sector);
    if (secBtn) {
      secTabs.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      secBtn.classList.add('active');
      renderIndustryTabs(sector, industry);
    } else if (SECTORS.length) {
      renderIndustryTabs(SECTORS[0].Sector);
    }
  };

  if (SECTORS.length) renderIndustryTabs(SECTORS[0].Sector);
}

function renderIndustryTabs(sector, preferIndustry) {
  const indTabs = document.getElementById('indTabs');
  const inds = (SECTOR_INDUSTRIES[sector] || []).slice().sort((a,b) => a.Sector_Rank - b.Sector_Rank);
  indTabs.innerHTML = '';
  let activeIdx = 0;
  if (preferIndustry) {
    const i = inds.findIndex(x => x.Industry === preferIndustry);
    if (i >= 0) activeIdx = i;
  }
  inds.forEach((ind, idx) => {
    const btn = document.createElement('button');
    btn.className = 'tab-btn text-xs' + (idx === activeIdx ? ' active' : '');
    btn.innerHTML = `<span class="badge ${fmt.rankBadge(ind.Sector_Rank)} mr-1">#${ind.Sector_Rank}</span>${ind.Industry}`;
    btn.dataset.industry = ind.Industry;
    btn.addEventListener('click', () => {
      indTabs.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      renderStockTable(sector, ind.Industry);
    });
    indTabs.appendChild(btn);
  });
  if (inds.length) renderStockTable(sector, inds[activeIdx].Industry);
}

async function renderStockTable(sector, industry) {
  const el = document.getElementById('stockViz');
  el.innerHTML = `<div class="flex justify-center py-12"><div class="w-8 h-8 border-4 border-brand-500 border-t-transparent rounded-full animate-spin"></div></div>`;

  const all = await loadSectorRankings(sector);
  let stocks = all.filter(s => s.Industry === industry).sort((a,b) => a.Final_Rank - b.Final_Rank);
  if (!stocks.length) {
    const list = (STOCK_TREE[sector] && STOCK_TREE[sector][industry]) || [];
    stocks = list.map((s,i) => ({ ...s, Final_Rank: i+1, Ensemble_Score: null }));
  }

  const indMeta = (SECTOR_INDUSTRIES[sector] || []).find(i => i.Industry === industry);
  let colSort = { key: 'Final_Rank', dir: 'asc' };

  const columns = [
    { key: 'Final_Rank', label: '#' },
    { key: 'Symbol', label: 'Symbol' },
    { key: 'Company Name', label: 'Company' },
    { key: 'Country', label: 'Country' },
    { key: 'Ensemble_Score', label: 'Score' },
    { key: 'SAW', label: 'SAW' },
    { key: 'TOPSIS', label: 'TOPSIS' },
    { key: 'VIKOR', label: 'VIKOR' },
    { key: 'GRA', label: 'GRA' },
    { key: 'WASPAS', label: 'WASPAS' },
    { key: 'COPRAS', label: 'COPRAS' },
    { key: 'PCA', label: 'PCA' },
  ];

  el.innerHTML = `
    <div class="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
      <div class="card p-3"><p class="text-xs text-slate-500">Industry Sector Rank</p><p class="text-xl font-bold">#${indMeta?.Sector_Rank ?? '—'}</p></div>
      <div class="card p-3"><p class="text-xs text-slate-500">Overall Rank</p><p class="text-xl font-bold">#${indMeta?.Final_Rank ?? '—'}</p></div>
      <div class="card p-3"><p class="text-xs text-slate-500">Stocks Listed</p><p class="text-xl font-bold">${stocks.length}</p></div>
      <div class="card p-3"><p class="text-xs text-slate-500">1Y Change</p><p class="text-xl font-bold ${fmt.changeClass(indMeta?.['1Y_Change'])}">${fmt.pct(indMeta?.['1Y_Change'])}</p></div>
    </div>

    <div class="card p-4 mb-5">
      <h3 class="text-sm font-semibold mb-3">Top 15 Best Performing Stocks</h3>
      <div class="chart-container"><canvas id="stockBarChart"></canvas></div>
    </div>

    <div class="card p-4 overflow-x-auto">
      <div class="mb-3">
        <h3 class="text-sm font-semibold">MCDM Ranking Details — ${industry}</h3>
        <p class="text-xs text-slate-500 mt-0.5">
          Rankings produced by the FinSight multi-criteria decision system (SAW, TOPSIS, VIKOR, GRA, WASPAS, COPRAS, PCA ensemble).
          Click a column header to sort. Click a symbol to open Insights for that stock.
        </p>
      </div>
      <table class="data-table w-full" id="stockTable">
        <thead>
          <tr>
            ${columns.map(c => `<th class="sortable" data-sort="${c.key}">${c.label}<span class="sort-ind">↕</span></th>`).join('')}
          </tr>
        </thead>
        <tbody></tbody>
      </table>
    </div>
  `;

  function companyOf(s) {
    return s['Company Name'] || s.CompanyName || '—';
  }

  function fillTable() {
    const key = colSort.key;
    const dir = colSort.dir;
    const ascKeys = ['Final_Rank', 'VIKOR', 'Symbol', 'Company Name', 'Country'];
    const sorted = [...stocks].sort((a, b) => {
      let av = key === 'Company Name' ? companyOf(a) : a[key];
      let bv = key === 'Company Name' ? companyOf(b) : b[key];
      if (key === 'Symbol' || key === 'Company Name' || key === 'Country') {
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

    document.querySelectorAll('#stockTable th.sortable').forEach(th => {
      th.classList.remove('sorted-asc', 'sorted-desc');
      const ind = th.querySelector('.sort-ind');
      if (th.dataset.sort === key) {
        th.classList.add(dir === 'asc' ? 'sorted-asc' : 'sorted-desc');
        if (ind) ind.textContent = dir === 'asc' ? '↑' : '↓';
      } else if (ind) ind.textContent = '↕';
    });

    const tbody = document.querySelector('#stockTable tbody');
    tbody.innerHTML = sorted.slice(0, 150).map(s => `
      <tr class="stock-row-click" data-sym="${s.Symbol}">
        <td><span class="badge ${fmt.rankBadge(s.Final_Rank)}">${s.Final_Rank ?? '—'}</span></td>
        <td class="font-bold text-brand-600">${s.Symbol}</td>
        <td class="text-xs max-w-[160px] truncate" title="${companyOf(s)}">${companyOf(s)}</td>
        <td class="text-xs">${s.Country || '—'}</td>
        <td>${fmt.num(s.Ensemble_Score,1)}</td>
        <td>${fmt.num(s.SAW,3)}</td>
        <td>${fmt.num(s.TOPSIS,3)}</td>
        <td>${fmt.num(s.VIKOR,3)}</td>
        <td>${fmt.num(s.GRA,3)}</td>
        <td>${fmt.num(s.WASPAS,3)}</td>
        <td>${fmt.num(s.COPRAS,3)}</td>
        <td>${fmt.num(s.PCA,3)}</td>
      </tr>
    `).join('');

    tbody.querySelectorAll('.stock-row-click').forEach(row => {
      row.addEventListener('click', () => goToInsights(row.dataset.sym));
    });
  }

  fillTable();

  document.querySelectorAll('#stockTable th.sortable').forEach(th => {
    th.addEventListener('click', () => {
      const key = th.dataset.sort;
      if (colSort.key === key) colSort.dir = colSort.dir === 'asc' ? 'desc' : 'asc';
      else {
        const ascKeys = ['Final_Rank', 'VIKOR', 'Symbol', 'Company Name', 'Country'];
        colSort = { key, dir: ascKeys.includes(key) ? 'asc' : 'desc' };
      }
      fillTable();
    });
  });

  // Chart — top 15 by ensemble (best performing by score)
  const top = [...stocks].filter(s => s.Ensemble_Score != null).sort((a,b) => (b.Ensemble_Score||0) - (a.Ensemble_Score||0)).slice(0, 15);
  const cc = chartColors();
  if (charts.stockBar) charts.stockBar.destroy();
  charts.stockBar = new Chart(document.getElementById('stockBarChart'), {
    type: 'bar',
    data: {
      labels: top.map(s => s.Symbol),
      datasets: [{
        label: 'Ensemble Score',
        data: top.map(s => s.Ensemble_Score),
        backgroundColor: SECTOR_COLORS[0],
        borderRadius: 4
      }]
    },
    options: {
      indexAxis: 'y',
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        x: { ticks: { color: cc.text }, grid: { color: cc.grid } },
        y: { ticks: { color: cc.text, font: { size: 10 } }, grid: { display: false } }
      }
    }
  });
}

/* ==================== 3. COMPARISON ==================== */
function renderComparison() {
  const el = document.getElementById('panel-comparison');
  el.innerHTML = `
    <div class="mb-4">
      <h2 class="text-xl font-bold mb-1">Ranking Comparison</h2>
      <p class="text-sm text-slate-500">
        Compare up to 20 stocks side-by-side on the <strong>FinSight multi-criteria ranking system</strong>
        (SAW, TOPSIS, VIKOR, GRA, WASPAS, COPRAS, PCA and the ensemble score).
        This view highlights relative positioning from the offline ranking pipeline—not live price quotes.
      </p>
      <div class="mt-3 p-3 rounded-lg bg-brand-50 dark:bg-brand-950/30 border border-brand-200 dark:border-brand-800 text-xs text-slate-600 dark:text-slate-300">
        <strong class="text-brand-700 dark:text-brand-300">How ranking works:</strong>
        Each method scores stocks on multiple financial factors; ranks are fused into an ensemble score.
        Lower Final Rank is better. Use this tab to stress-test whether a name leads across methods or only on one technique.
      </div>
    </div>

    <div class="card p-4 mb-5">
      <div class="relative max-w-md">
        <label class="text-xs font-medium text-slate-500 mb-1 block">Add Stock</label>
        <input id="cmpSearch" type="text" placeholder="Type symbol or company name..." 
          class="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" />
        <div id="cmpDropdown" class="search-dropdown hidden"></div>
      </div>
      <div class="flex flex-wrap gap-2 mt-3" id="cmpChips"></div>
      <p class="text-xs text-slate-400 mt-2">Selected: <span id="cmpCount">0</span> / 20</p>
    </div>

    <div id="cmpResults">
      <div class="text-center py-12 text-slate-400 text-sm">Add at least 1 stock to begin comparison.</div>
    </div>
  `;

  const input = document.getElementById('cmpSearch');
  const dropdown = document.getElementById('cmpDropdown');

  input.addEventListener('input', () => {
    const q = input.value.trim().toLowerCase();
    if (q.length < 1) { dropdown.classList.add('hidden'); return; }
    const hits = UNIVERSE.filter(s =>
      (s.Symbol && s.Symbol.toLowerCase().includes(q)) ||
      (s.CompanyName && s.CompanyName.toLowerCase().includes(q))
    ).slice(0, 20);
    if (!hits.length) { dropdown.classList.add('hidden'); return; }
    dropdown.innerHTML = hits.map(s => `
      <div class="search-item" data-sym="${s.Symbol}">
        <div class="sym">${s.Symbol}</div>
        <div class="meta">${s.CompanyName || ''} · ${s.Sector || ''} · ${s.Industry || ''}</div>
      </div>
    `).join('');
    dropdown.classList.remove('hidden');
    dropdown.querySelectorAll('.search-item').forEach(item => {
      item.addEventListener('click', () => {
        addToCompare(item.dataset.sym);
        input.value = '';
        dropdown.classList.add('hidden');
      });
    });
  });
  input.addEventListener('blur', () => setTimeout(() => dropdown.classList.add('hidden'), 200));

  renderCmpChips();
}

function addToCompare(sym) {
  if (compareList.includes(sym)) return;
  if (compareList.length >= 20) { alert('Maximum 20 stocks'); return; }
  compareList.push(sym);
  renderCmpChips();
  runComparison();
}

function removeFromCompare(sym) {
  compareList = compareList.filter(s => s !== sym);
  renderCmpChips();
  runComparison();
}

function renderCmpChips() {
  const el = document.getElementById('cmpChips');
  const cnt = document.getElementById('cmpCount');
  if (!el) return;
  el.innerHTML = compareList.map(sym => `
    <span class="stock-chip">${sym}
      <button onclick="removeFromCompare('${sym}')" aria-label="Remove">×</button>
    </span>
  `).join('');
  if (cnt) cnt.textContent = compareList.length;
}

async function runComparison() {
  const el = document.getElementById('cmpResults');
  if (!el) return;
  if (!compareList.length) {
    el.innerHTML = `<div class="text-center py-12 text-slate-400 text-sm">Add at least 1 stock to begin comparison.</div>`;
    return;
  }

  // Resolve ranking data for each symbol
  const rows = [];
  for (const sym of compareList) {
    const uni = UNIVERSE.find(u => u.Symbol === sym);
    let rankRec = null;
    if (uni) {
      const all = await loadSectorRankings(uni.Sector);
      rankRec = all.find(r => r.Symbol === sym);
    }
    rows.push({
      Symbol: sym,
      CompanyName: rankRec?.['Company Name'] || uni?.CompanyName || sym,
      Sector: rankRec?.Sector || uni?.Sector || '—',
      Industry: rankRec?.Industry || uni?.Industry || '—',
      Country: rankRec?.Country || uni?.Country || '—',
      Final_Rank: rankRec?.Final_Rank ?? null,
      Ensemble_Score: rankRec?.Ensemble_Score ?? null,
      SAW: rankRec?.SAW ?? null,
      TOPSIS: rankRec?.TOPSIS ?? null,
      VIKOR: rankRec?.VIKOR ?? null,
      GRA: rankRec?.GRA ?? null,
      WASPAS: rankRec?.WASPAS ?? null,
      COPRAS: rankRec?.COPRAS ?? null,
      PCA: rankRec?.PCA ?? null,
      Mean_Rank: rankRec?.Mean_Rank ?? null
    });
  }

  const factors = ['Ensemble_Score','SAW','TOPSIS','VIKOR','GRA','WASPAS','COPRAS','PCA'];
  const cc = chartColors();

  el.innerHTML = `
    <div class="card p-4 overflow-x-auto mb-5">
      <h3 class="text-sm font-semibold mb-3">Side-by-Side Ranking Factors</h3>
      <table class="data-table w-full">
        <thead>
          <tr>
            <th>Metric</th>
            ${rows.map(r => `<th class="text-center">${r.Symbol}</th>`).join('')}
          </tr>
        </thead>
        <tbody>
          <tr><td class="font-medium">Company</td>${rows.map(r => `<td class="text-xs text-center max-w-[100px] truncate" title="${r.CompanyName}">${r.CompanyName}</td>`).join('')}</tr>
          <tr><td class="font-medium">Sector</td>${rows.map(r => `<td class="text-xs text-center">${r.Sector}</td>`).join('')}</tr>
          <tr><td class="font-medium">Industry</td>${rows.map(r => `<td class="text-xs text-center">${r.Industry}</td>`).join('')}</tr>
          <tr><td class="font-medium">Country</td>${rows.map(r => `<td class="text-xs text-center">${r.Country}</td>`).join('')}</tr>
          <tr><td class="font-medium">Final Rank</td>${rows.map(r => `<td class="text-center"><span class="badge ${fmt.rankBadge(r.Final_Rank)}">${r.Final_Rank ?? '—'}</span></td>`).join('')}</tr>
          <tr><td class="font-medium">Ensemble Score</td>${rows.map(r => `<td class="text-center font-semibold">${fmt.num(r.Ensemble_Score,1)}</td>`).join('')}</tr>
          <tr><td class="font-medium">Mean Rank</td>${rows.map(r => `<td class="text-center">${fmt.num(r.Mean_Rank,1)}</td>`).join('')}</tr>
          <tr><td class="font-medium">SAW</td>${rows.map(r => `<td class="text-center">${fmt.num(r.SAW,3)}</td>`).join('')}</tr>
          <tr><td class="font-medium">TOPSIS</td>${rows.map(r => `<td class="text-center">${fmt.num(r.TOPSIS,3)}</td>`).join('')}</tr>
          <tr><td class="font-medium">VIKOR</td>${rows.map(r => `<td class="text-center">${fmt.num(r.VIKOR,3)}</td>`).join('')}</tr>
          <tr><td class="font-medium">GRA</td>${rows.map(r => `<td class="text-center">${fmt.num(r.GRA,3)}</td>`).join('')}</tr>
          <tr><td class="font-medium">WASPAS</td>${rows.map(r => `<td class="text-center">${fmt.num(r.WASPAS,3)}</td>`).join('')}</tr>
          <tr><td class="font-medium">COPRAS</td>${rows.map(r => `<td class="text-center">${fmt.num(r.COPRAS,3)}</td>`).join('')}</tr>
          <tr><td class="font-medium">PCA</td>${rows.map(r => `<td class="text-center">${fmt.num(r.PCA,3)}</td>`).join('')}</tr>
        </tbody>
      </table>
    </div>

    <div class="grid lg:grid-cols-2 gap-5">
      <div class="card p-4">
        <h3 class="text-sm font-semibold mb-3">Ensemble Score Comparison</h3>
        <div class="chart-container"><canvas id="cmpScoreBar"></canvas></div>
      </div>
      <div class="card p-4">
        <h3 class="text-sm font-semibold mb-3">MCDM Methods Radar (normalized)</h3>
        <div class="chart-container"><canvas id="cmpRadar"></canvas></div>
      </div>
    </div>
  `;

  // Bar chart
  if (charts.cmpScoreBar) charts.cmpScoreBar.destroy();
  charts.cmpScoreBar = new Chart(document.getElementById('cmpScoreBar'), {
    type: 'bar',
    data: {
      labels: rows.map(r => r.Symbol),
      datasets: [{
        label: 'Ensemble Score',
        data: rows.map(r => r.Ensemble_Score),
        backgroundColor: rows.map((_,i) => SECTOR_COLORS[i % SECTOR_COLORS.length]),
        borderRadius: 5
      }]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        x: { ticks: { color: cc.text }, grid: { display: false } },
        y: { ticks: { color: cc.text }, grid: { color: cc.grid } }
      }
    }
  });

  // Radar — normalize each method 0-1 across selected
  const methods = ['SAW','TOPSIS','GRA','WASPAS','COPRAS','PCA'];
  const norm = methods.map(m => {
    const vals = rows.map(r => r[m]).filter(v => v != null);
    const mn = Math.min(...vals, 0), mx = Math.max(...vals, 1);
    return rows.map(r => {
      const v = r[m];
      if (v == null) return 0;
      return mx === mn ? 0.5 : (v - mn) / (mx - mn);
    });
  });

  if (charts.cmpRadar) charts.cmpRadar.destroy();
  charts.cmpRadar = new Chart(document.getElementById('cmpRadar'), {
    type: 'radar',
    data: {
      labels: methods,
      datasets: rows.map((r, i) => ({
        label: r.Symbol,
        data: methods.map((_, mi) => norm[mi][i]),
        borderColor: SECTOR_COLORS[i % SECTOR_COLORS.length],
        backgroundColor: SECTOR_COLORS[i % SECTOR_COLORS.length] + '33',
        pointBackgroundColor: SECTOR_COLORS[i % SECTOR_COLORS.length],
        borderWidth: 2
      }))
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      scales: {
        r: {
          min: 0, max: 1,
          ticks: { display: false },
          grid: { color: cc.grid },
          pointLabels: { color: cc.text, font: { size: 10 } }
        }
      },
      plugins: {
        legend: { labels: { color: cc.text, boxWidth: 12, font: { size: 11 } } }
      }
    }
  });
}

/* ==================== 4. INSIGHTS ==================== */
function renderInsights() {
  const el = document.getElementById('panel-insights');
  el.innerHTML = `
    <div class="mb-4">
      <h2 class="text-xl font-bold mb-1">Stock Insights</h2>
      <p class="text-sm text-slate-500">Select a stock for ranking context and finance-focused performance insights. Use <strong>In-depth Info</strong> for the full analysis workspace.</p>
    </div>

    <div class="card p-4 mb-5 relative max-w-lg">
      <label class="text-xs font-medium text-slate-500 mb-1 block">Search Stock</label>
      <input id="insSearch" type="text" placeholder="Symbol or company..."
        class="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" />
      <div id="insDropdown" class="search-dropdown hidden"></div>
    </div>

    <div id="insResult">
      <div class="text-center py-12 text-slate-400 text-sm">Search and select a stock to generate insights.</div>
    </div>
  `;

  const input = document.getElementById('insSearch');
  const dropdown = document.getElementById('insDropdown');
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
        input.value = item.dataset.sym;
        dropdown.classList.add('hidden');
        generateStockInsights(item.dataset.sym);
      });
    });
  });
  input.addEventListener('blur', () => setTimeout(() => dropdown.classList.add('hidden'), 200));

  window.__insightsSelect = (sym) => {
    input.value = sym;
    generateStockInsights(sym);
  };
}

async function generateStockInsights(sym) {
  const host = document.getElementById('insResult');
  if (!host) return;
  host.innerHTML = `<div class="flex justify-center py-8"><div class="w-8 h-8 border-4 border-brand-500 border-t-transparent rounded-full animate-spin"></div></div>`;

  const uni = UNIVERSE.find(u => u.Symbol === sym) || {};
  const sector = uni.Sector;
  const industry = uni.Industry;
  let rank = null;
  let peers = [];
  if (sector) {
    try {
      const all = await loadSectorRankings(sector);
      rank = all.find(r => r.Symbol === sym) || null;
      if (industry) peers = all.filter(r => r.Industry === industry).sort((a,b) => a.Final_Rank - b.Final_Rank);
    } catch (_) {}
  }

  const finalRank = rank?.Final_Rank;
  const score = rank?.Ensemble_Score;
  const peerRank = peers.findIndex(p => p.Symbol === sym) + 1;
  const indMeta = industry ? (SECTOR_INDUSTRIES[sector] || []).find(i => i.Industry === industry) : null;

  const insights = [];

  // Ranking context
  if (finalRank != null) {
    insights.push(`Within the sector ranking universe, <strong>${sym}</strong> holds overall position <strong>#${finalRank}</strong> with an ensemble score of <strong>${fmt.num(score,1)}</strong>.`);
  } else {
    insights.push(`<strong>${sym}</strong> is mapped to <strong>${sector || '—'}</strong> / <strong>${industry || '—'}</strong>. Offline MCDM scores were not found for this ticker in the current sector file.`);
  }

  if (peerRank > 0 && peers.length) {
    insights.push(`Among <strong>${peers.length}</strong> peers in <em>${industry}</em>, ${sym} ranks <strong>#${peerRank}</strong> on the developer ensemble ranking.`);
  }

  // Finance-focused (no 1D%)
  if (indMeta) {
    if (indMeta.Profit_Margin != null) {
      insights.push(`Industry profit margin context for ${industry}: <strong>${fmt.pct(indMeta.Profit_Margin)}</strong>. Strong industry margins support pricing power and earnings quality for constituents like ${sym}.`);
    }
    if (indMeta.Trailing_PE != null) {
      insights.push(`Industry trailing P/E sits near <strong>${fmt.num(indMeta.Trailing_PE)}</strong>. Compare ${sym}'s own multiple in the Stock Analysis module to judge relative valuation versus this peer set.`);
    }
    if (indMeta.Dividend_Yield != null) {
      insights.push(`Industry dividend yield averages about <strong>${fmt.pct(indMeta.Dividend_Yield)}</strong>. Income-oriented investors should check ${sym}'s payout sustainability and free-cash-flow coverage.`);
    }
    if (indMeta['1Y_Change'] != null) {
      insights.push(`Over the past year the industry moved <strong class="${fmt.changeClass(indMeta['1Y_Change'])}">${fmt.pct(indMeta['1Y_Change'])}</strong>. Medium-term industry momentum shapes the backdrop for earnings revisions and capital flows into ${sym}.`);
    }
    if (indMeta.Market_Cap != null) {
      insights.push(`Aggregate industry market cap is roughly <strong>${fmt.mcap(indMeta.Market_Cap)}</strong>, signalling the scale of capital allocated to this segment.`);
    }
  }

  // Method dispersion
  if (rank) {
    const methods = ['SAW','TOPSIS','GRA','WASPAS','COPRAS','PCA'].map(m => ({ m, v: rank[m] })).filter(x => x.v != null);
    if (methods.length >= 2) {
      const vals = methods.map(x => x.v);
      const spread = Math.max(...vals) - Math.min(...vals);
      insights.push(`Across MCDM techniques the score spread is <strong>${fmt.num(spread,3)}</strong>. ${spread < 0.15 ? 'Methods largely agree, which raises confidence in the ranking signal.' : 'Methods diverge, so treat the ensemble as a balanced view rather than a single-factor conclusion.'}`);
    }
    if (rank.VIKOR != null) {
      insights.push(`VIKOR (compromise ranking) reads <strong>${fmt.num(rank.VIKOR,3)}</strong> for ${sym} — useful when weighing proximity to ideal financial profiles.`);
    }
  }

  insights.push(`For cash-flow quality, leverage, and valuation modelling, open <strong>Stock Analysis</strong> for live statements, ratios, and DCF/DDM tools. Ranking here is the offline multi-factor screen built by the FinSight pipeline.`);

  const company = rank?.['Company Name'] || uni.CompanyName || sym;

  host.innerHTML = `
    <div class="flex flex-wrap items-start justify-between gap-3 mb-4">
      <div>
        <h3 class="text-lg font-bold">${sym} <span class="text-slate-500 font-medium text-sm">· ${company}</span></h3>
        <p class="text-xs text-slate-500">${sector || '—'} · ${industry || '—'}</p>
      </div>
      <a href="../part3_stock_analysis/index.html?symbol=${encodeURIComponent(sym)}"
         class="inline-flex items-center px-3 py-2 rounded-lg bg-brand-600 hover:bg-brand-700 text-white text-xs font-semibold">
        In-depth Info →
      </a>
    </div>
    <div class="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
      <div class="card p-3 text-center"><p class="text-xs text-slate-500">Sector Rank #</p><p class="text-xl font-bold">${finalRank ?? '—'}</p></div>
      <div class="card p-3 text-center"><p class="text-xs text-slate-500">Ensemble Score</p><p class="text-xl font-bold">${fmt.num(score,1)}</p></div>
      <div class="card p-3 text-center"><p class="text-xs text-slate-500">Industry Peer Rank</p><p class="text-xl font-bold">${peerRank || '—'}/${peers.length || '—'}</p></div>
      <div class="card p-3 text-center"><p class="text-xs text-slate-500">Mean Rank</p><p class="text-xl font-bold">${fmt.num(rank?.Mean_Rank,1)}</p></div>
    </div>
    <div class="space-y-3">
      ${insights.map((t,i) => `<div class="insight-card"><span class="text-xs font-bold text-brand-600 mr-2">${i+1}.</span>${t}</div>`).join('')}
    </div>
  `;
}

/* -------------------- MODAL & INIT -------------------- */
document.getElementById('modalClose')?.addEventListener('click', () => {
  document.getElementById('detailModal').classList.remove('open');
});
document.getElementById('detailModal')?.addEventListener('click', (e) => {
  if (e.target === e.currentTarget) e.currentTarget.classList.remove('open');
});

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
    window.addEventListener('themechange', () => {
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
    document.getElementById('loader').innerHTML = `<div class="text-center max-w-md px-4"><p class="text-red-500 font-semibold">Failed to load data.</p><p class="text-sm text-slate-500 mt-2">${(err && err.message) || ''}</p><p class="text-xs text-slate-400 mt-2">Start the backend from <code>webapp/backend</code>: <code>python3 app.py</code> then open <code>http://localhost:5000/part2_stock_visualization/</code></p></div>`;
  }
})();
