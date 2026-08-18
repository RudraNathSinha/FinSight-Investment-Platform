/**
 * FinSight — Frontend Application
 * Production analytical interface
 */

(function () {
  'use strict';

  // ─────────────────────────────────────────────
  // Constants & Block Metadata
  // ─────────────────────────────────────────────
  const BLOCK_META = {
    1: { name: 'Macroeconomic Structure', short: 'Macro', desc: 'GDP, growth, capital formation, industry & services composition' },
    2: { name: 'Monetary & External Stability', short: 'Monetary', desc: 'Inflation, interest rates, reserves, external debt & balances' },
    3: { name: 'Trade & Investment', short: 'Trade', desc: 'Trade openness, current account, FDI, tariffs & export structure' },
    4: { name: 'Financial Markets & Banking', short: 'Finance', desc: 'Market capitalization, turnover, banking depth & access' },
    5: { name: 'Education', short: 'Education', desc: 'Enrolment, completion, teacher quality, literacy & expenditure' },
    6: { name: 'Health', short: 'Health', desc: 'Mortality, health expenditure, facilities, disease burden' },
    7: { name: 'Labour & Employment', short: 'Labour', desc: 'Employment structure, unemployment, productivity & vulnerability' },
    8: { name: 'Infrastructure & Connectivity', short: 'Infra', desc: 'Electricity, internet, transport, communications access' },
    10: { name: 'Environment & Energy', short: 'Environment', desc: 'Forest cover, energy intensity, emissions, renewable share' },
    11: { name: 'Social Equity & Demography', short: 'Social', desc: 'Poverty, inequality, gender parity, demographic indicators' }
  };

  const ACTIVE_BLOCKS = [1, 2, 3, 4, 5, 6, 7, 8, 10, 11]; // Block 9 excluded

  const REGION_NAMES = {
    EAS: 'East Asia & Pacific', ECS: 'Europe & Central Asia', LCN: 'Latin America & Caribbean',
    MEA: 'Middle East & North Africa', NAC: 'North America', SAS: 'South Asia', SSF: 'Sub-Saharan Africa'
  };

  // ─────────────────────────────────────────────
  // Application State
  // ─────────────────────────────────────────────
  const state = {
    ranks: [],
    blockPerf: {},
    blockWeights: {},
    countries: {},
    indicators: {},
    indicatorPerf: [],
    normalized: [],
    repData: {},
    weightMethods: {},
    allCountries: [],
    allIndicators: [],
    countriesWithoutSE: [],
    sortlisted: {},
    notSelectedInd: [],
    ready: false,
    darkMode: false,
    role: localStorage.getItem('crs-role') || 'analyst',
    workspaces: JSON.parse(localStorage.getItem('crs-workspaces') || '[]'),
    activeWorkspaceId: localStorage.getItem('crs-active-ws') || null,
    scenarioWeights: null, // custom dimension weights for scenario

    currentView: 'home',
    currentCountry: null,
    currentBlock: null,
    currentIndicator: null,
    compareSelection: [],
    mapInstance: null,
    charts: {}
  };

  // ─────────────────────────────────────────────
  // Data Loading
  // ─────────────────────────────────────────────
  async function loadJSON(path) {
    const res = await fetch(path);
    if (!res.ok) throw new Error(`Failed to load ${path} (HTTP ${res.status})`);
    const text = await res.text();
    try {
      return JSON.parse(text);
    } catch (e) {
      // Surface the actual parse problem (e.g. residual NaN)
      const snippet = text.slice(Math.max(0, (e.message.match(/position (\d+)/) || [])[1] - 40 || 0), 80);
      throw new Error(`Invalid JSON in ${path}: ${e.message}`);
    }
  }

  async function loadAllData() {
    const base = './data/';
    const [
      ranks, blockPerf, mother, countries, selected, indPerf, normalized,
      repData, weightMethods, allCountries, allIndicators, countriesWithoutSE, sortlisted, notSelectedInd
    ] = await Promise.all([
      loadJSON(base + 'rank_list.json'),
      loadJSON(base + 'block_performance.json'),
      loadJSON(base + 'mother_sheet.json'),
      loadJSON(base + 'countries_with_stock_exchange.json'),
      loadJSON(base + 'selected_indicators.json'),
      loadJSON(base + 'indicator_performance.json'),
      loadJSON(base + 'all_normalized_scores.json'),
      loadJSON(base + 'combined_data_not_normalized.json'),
      loadJSON(base + 'combined_data_differernt_method_value_for_weight_calculation.json'),
      loadJSON(base + 'all_countries.json'),
      loadJSON(base + 'all_indicators.json'),
      loadJSON(base + 'countries_without_stock_exchange.json'),
      loadJSON(base + 'combined_data_sortlisted_indicators.json'),
      loadJSON(base + 'not_selected_indicators.json')
    ]);

    state.ranks = ranks;
    state.blockPerf = Object.fromEntries(blockPerf.map(r => [r.country, r]));
    state.blockWeights = Object.fromEntries(mother.map(r => [r.country, r]));
    state.countries = Object.fromEntries(countries.map(c => [c.iso3, c]));
    state.indicators = Object.fromEntries(selected.map(i => [i.indicator_code, i]));
    state.indicatorPerf = indPerf;
    state.normalized = normalized;
    state.repData = repData || {};
    state.weightMethods = weightMethods || {};
    state.allCountries = allCountries || [];
    state.allIndicators = allIndicators || [];
    state.countriesWithoutSE = countriesWithoutSE || [];
    state.sortlisted = sortlisted || {};
    state.notSelectedInd = notSelectedInd || [];
    state.ready = true;
  }

  // ─────────────────────────────────────────────
  // Helpers
  // ─────────────────────────────────────────────
  function $(sel, ctx = document) { return ctx.querySelector(sel); }
  function $$(sel, ctx = document) { return [...ctx.querySelectorAll(sel)]; }

  function countryName(iso3) {
    return state.countries[iso3]?.country_name || iso3;
  }

  function scoreColor(score) {
    if (score >= 65) return 'bg-score-high';
    if (score >= 50) return 'bg-score-mid';
    if (score >= 40) return 'bg-score-low';
    return 'bg-score-weak';
  }

  function scoreTextColor(score) {
    if (score >= 65) return 'text-emerald-700';
    if (score >= 50) return 'text-sky-700';
    if (score >= 40) return 'text-amber-700';
    return 'text-rose-700';
  }

  function rankBadgeClass(rank) {
    if (rank === 1) return 'rank-1';
    if (rank === 2) return 'rank-2';
    if (rank === 3) return 'rank-3';
    return 'bg-ink-100 text-ink-600';
  }

  function getStrongestWeakest(iso3, n = 3) {
    const bp = state.blockPerf[iso3];
    if (!bp) return { strong: [], weak: [] };
    const entries = [];
    ACTIVE_BLOCKS.forEach(i => {
      const key = `Block_${i}`;
      const val = bp[key];
      if (val != null && val > 0) entries.push({ block: i, score: val });
    });
    entries.sort((a, b) => b.score - a.score);
    return {
      strong: entries.slice(0, n),
      weak: entries.slice(-n).reverse()
    };
  }

  function getCountryIndicators(iso3, blockNum = null) {
    return state.indicatorPerf.filter(r => {
      if (r.country !== iso3) return false;
      if (blockNum != null && r.block !== blockNum) return false;
      return true;
    });
  }

  function getNormalizedFor(iso3, code) {
    return state.normalized.find(r => r.country === iso3 && r.indicator_code === code);
  }

  function getRepComponents(iso3, blockNum, code) {
    const key = `${iso3}/Block_${blockNum}.json`;
    const arr = state.repData[key];
    if (!arr) return null;
    return arr.find(r => r.indicator_code === code) || null;
  }

  function getWeightMethods(iso3, blockNum, code) {
    const key = `${iso3}/Block_${blockNum}/indicator_weights.json`;
    const arr = state.weightMethods[key];
    if (!arr) return null;
    return arr.find(r => r.indicator_code === code) || null;
  }

  function formatLargeNumber(n) {
    if (n == null || isNaN(n)) return 'N/A';
    const abs = Math.abs(n);
    if (abs >= 1e12) return (n / 1e12).toFixed(2) + 'T';
    if (abs >= 1e9) return (n / 1e9).toFixed(2) + 'B';
    if (abs >= 1e6) return (n / 1e6).toFixed(2) + 'M';
    if (abs >= 1e3) return (n / 1e3).toFixed(2) + 'K';
    if (abs >= 100) return n.toFixed(1);
    if (abs >= 1) return n.toFixed(2);
    return n.toFixed(4);
  }

  function fmt(n, d = 1) {
    if (n == null || n === '' || (typeof n === 'number' && isNaN(n))) return 'N/A';
    const num = Number(n);
    if (isNaN(num)) return 'N/A';
    return num.toFixed(d);
  }

  function safeStr(v) {
    if (v == null || v === '' || (typeof v === 'number' && isNaN(v))) return 'N/A';
    return String(v);
  }

  // ─────────────────────────────────────────────
  // Chart helpers (Chart.js + Treemap + cleanup)
  // ─────────────────────────────────────────────
  const CHART_COLORS = [
    '#0ea5e9', '#059669', '#d97706', '#7c3aed', '#dc2626',
    '#0891b2', '#65a30d', '#ea580c', '#4f46e5', '#db2777', '#0f766e'
  ];

  function destroyChart(key) {
    if (state.charts[key]) {
      try { state.charts[key].destroy(); } catch (e) { }
      delete state.charts[key];
    }
  }

  function makeBarChart(canvasId, labels, values, opts = {}) {
    destroyChart(canvasId);
    const ctx = document.getElementById(canvasId);
    if (!ctx || typeof Chart === 'undefined') return null;
    const isDark = document.documentElement.classList.contains('dark');
    const tickColor = isDark ? '#6e9ee5' : '#659be8';
    const gridColor = isDark ? '#2a3548' : '#f1f5f9';
    const horizontal = opts.horizontal !== false;
    const chart = new Chart(ctx, {
      type: 'bar',
      data: {
        labels,
        datasets: [{
          label: opts.label || 'Score',
          data: values,
          backgroundColor: values.map((v, i) => opts.colorFn ? opts.colorFn(v, i) : CHART_COLORS[i % CHART_COLORS.length]),
          borderRadius: 3,
          maxBarThickness: opts.maxBarThickness || 28
        }]
      },
      options: {
        indexAxis: horizontal ? 'y' : 'x',
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: (c) => `${opts.label || 'Value'}: ${typeof c.raw === 'number' ? c.raw.toFixed(1) : c.raw}`
            }
          }
        },
        scales: {
          x: { beginAtZero: true, max: opts.max ?? (horizontal ? 100 : undefined), grid: { color: gridColor }, ticks: { font: { size: 10 }, color: tickColor } },
          y: { grid: { display: !horizontal, color: gridColor }, ticks: { font: { size: 10 }, color: tickColor } }
        }
      }
    });
    state.charts[canvasId] = chart;
    return chart;
  }

  function makeDoughnutChart(canvasId, labels, values, opts = {}) {
    destroyChart(canvasId);
    const ctx = document.getElementById(canvasId);
    if (!ctx || typeof Chart === 'undefined') return null;
    const isDark = document.documentElement.classList.contains('dark');
    const legendColor = isDark ? '#2477dd' : '#475569';
    const chart = new Chart(ctx, {
      type: 'doughnut',
      data: {
        labels,
        datasets: [{
          data: values,
          backgroundColor: CHART_COLORS.slice(0, values.length),
          borderWidth: 2,
          borderColor: '#e8d1d1'
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        cutout: '58%',
        plugins: {
          legend: {
            position: opts.legendPos || 'right',
            labels: { boxWidth: 10, font: { size: 10 }, padding: 8 }
          },
          tooltip: {
            callbacks: {
              label: (c) => `${c.label}: ${(c.raw * 100).toFixed(1)}%`
            }
          }
        }
      }
    });
    state.charts[canvasId] = chart;
    return chart;
  }

  function makeTreemapChart(canvasId, treeData) {
    destroyChart(canvasId);
    const ctx = document.getElementById(canvasId);
    if (!ctx || typeof Chart === 'undefined') return null;
    // treeData: [{ key, value, label }]
    try {
      const chart = new Chart(ctx, {
        type: 'treemap',
        data: {
          datasets: [{
            tree: treeData,
            key: 'value',
            groups: ['label'],
            spacing: 1,
            borderWidth: 2,
            borderColor: '#d9bebe',
            backgroundColor: (ctx) => {
              const i = ctx.dataIndex;
              return CHART_COLORS[i % CHART_COLORS.length];
            },
            labels: {
              display: true,
              formatter: (ctx) => {
                const raw = ctx.raw;
                if (!raw || raw.v == null) return '';
                const name = (raw.g || raw.l || '').toString();
                const short = name.length > 12 ? name.slice(0, 11) + '…' : name;
                return [short, raw.v.toFixed(1)];
              },
              font: { size: 10, weight: '600' },
              color: '#fff'
            }
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { display: false },
            tooltip: {
              callbacks: {
                title: (items) => {
                  const r = items[0]?.raw;
                  return r ? (r.g || r.l || '') : '';
                },
                label: (item) => {
                  const r = item.raw;
                  return r ? `Contribution: ${r.v.toFixed(2)}` : '';
                }
              }
            }
          }
        }
      });
      state.charts[canvasId] = chart;
      return chart;
    } catch (e) {
      console.warn('Treemap unavailable', e);
      return null;
    }
  }

  function makeScatterChart(canvasId, points, opts = {}) {
    destroyChart(canvasId);
    const ctx = document.getElementById(canvasId);
    if (!ctx || typeof Chart === 'undefined') return null;
    const isDark = document.documentElement.classList.contains('dark');
    const tickColor = isDark ? '#94a3b8' : '#64748b';
    const gridColor = isDark ? '#2a3548' : '#f1f5f9';
    const chart = new Chart(ctx, {
      type: 'scatter',
      data: {
        datasets: [{
          label: opts.label || 'Countries',
          data: points,
          backgroundColor: 'rgba(14,165,233,0.55)',
          borderColor: '#0284c7',
          borderWidth: 1,
          pointRadius: 5,
          pointHoverRadius: 7
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: (c) => {
                const p = c.raw;
                return `${p.label || ''}: (${p.x?.toFixed?.(1)}, ${p.y?.toFixed?.(1)})`;
              }
            }
          }
        },
        scales: {
          x: {
            title: { display: true, text: opts.xLabel || 'X', font: { size: 11 }, color: tickColor },
            grid: { color: gridColor },
            ticks: { font: { size: 10 }, color: tickColor }
          },
          y: {
            title: { display: true, text: opts.yLabel || 'Y', font: { size: 11 }, color: tickColor },
            grid: { color: gridColor },
            ticks: { font: { size: 10 }, color: tickColor }
          }
        }
      }
    });
    state.charts[canvasId] = chart;
    return chart;
  }

  function makeGroupedBarChart(canvasId, labels, datasets, opts = {}) {
    destroyChart(canvasId);
    const ctx = document.getElementById(canvasId);
    if (!ctx || typeof Chart === 'undefined') return null;
    const chart = new Chart(ctx, {
      type: 'bar',
      data: { labels, datasets },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { position: 'top', labels: { boxWidth: 12, font: { size: 11 } } },
          tooltip: { mode: 'index', intersect: false }
        },
        scales: {
          x: { grid: { display: false }, ticks: { font: { size: 10 } } },
          y: { beginAtZero: true, max: opts.max ?? 100, grid: { color: '#f1f5f9' }, ticks: { font: { size: 10 } } }
        }
      }
    });
    state.charts[canvasId] = chart;
    return chart;
  }

  function scoreColorHex(score) {
    if (score >= 65) return '#059669';
    if (score >= 50) return '#0284c7';
    if (score >= 40) return '#d97706';
    return '#dc2626';
  }


  // ─────────────────────────────────────────────
  // Routing
  // ─────────────────────────────────────────────
  function navigate(view, params = {}) {
    // Destroy existing charts
    Object.values(state.charts).forEach(c => { try { c.destroy(); } catch (e) { } });
    state.charts = {};
    if (state.mapInstance) {
      try { state.mapInstance.remove(); } catch (e) { }
      state.mapInstance = null;
    }

    state.currentView = view;
    if (params.country) state.currentCountry = params.country;
    if (params.block != null) state.currentBlock = params.block;
    if (params.indicator) state.currentIndicator = params.indicator;

    // Update nav active state
    const topViews = ['home', 'rankings', 'regions', 'scenario', 'compare', 'blocks', 'indicators'];
    const navView = topViews.includes(view) ? view : (
      view === 'country' || view === 'block' || view === 'indicator' ? 'rankings' : view
    );
    $$('.nav-link').forEach(el => {
      const on = el.dataset.nav === navView;
      el.classList.toggle('active-nav', on);
      el.classList.toggle('bg-ink-100', on);
      el.classList.toggle('text-ink-900', on);
    });

    // Hide all, show target
    $$('.view').forEach(v => v.classList.remove('active'));
    const target = $(`#view-${view}`);
    if (!target) return;

    // Render
    const renderers = {
      home: renderHome,
      rankings: renderRankings,
      country: () => renderCountry(state.currentCountry),
      compare: renderCompare,
      blocks: renderBlocks,
      block: () => renderBlockDetail(state.currentBlock, state.currentCountry),
      indicators: renderIndicators,
      indicator: () => renderIndicatorDetail(state.currentIndicator, state.currentCountry),
      regions: renderRegions,
      scenario: renderScenario
    };

    if (renderers[view]) {
      target.innerHTML = '';
      renderers[view](target);
    }
    target.classList.add('active');

    // Update URL hash (lightweight)
    let hash = view;
    if (params.country) hash += `/${params.country}`;
    if (params.block != null) hash += `/b${params.block}`;
    if (params.indicator) hash += `/i/${params.indicator}`;
    history.replaceState(null, '', '#' + hash);

    window.scrollTo(0, 0);
    $('#mobile-menu')?.classList.add('hidden');
  }

  function parseHash() {
    const h = (location.hash || '#home').slice(1);
    const parts = h.split('/');
    const view = parts[0] || 'home';
    const params = {};
    if (parts[1] && parts[1].length === 3) params.country = parts[1];
    parts.forEach(p => {
      if (p.startsWith('b') && !isNaN(p.slice(1))) params.block = +p.slice(1);
      if (p === 'i' && parts[parts.indexOf('i') + 1]) params.indicator = parts[parts.indexOf('i') + 1];
    });
    return { view, params };
  }

  // ─────────────────────────────────────────────
  // SEARCH
  // ─────────────────────────────────────────────
  function setupSearch() {
    const input = $('#global-search');
    const mobile = $('#mobile-search');
    const results = $('#search-results');

    function doSearch(q, container) {
      q = (q || '').trim().toLowerCase();
      if (!q || q.length < 1) {
        if (container) container.classList.add('hidden');
        return;
      }
      const hits = [];

      // Countries
      state.ranks.forEach(r => {
        const name = countryName(r.country).toLowerCase();
        if (r.country.toLowerCase().includes(q) || name.includes(q)) {
          hits.push({ type: 'country', iso3: r.country, label: countryName(r.country), sub: `Rank #${r.rank} · Score ${fmt(r.final_score)}` });
        }
      });

      // Indicators
      Object.values(state.indicators).forEach(ind => {
        if (ind.indicator_code.toLowerCase().includes(q) || (ind.indicator_name || '').toLowerCase().includes(q)) {
          hits.push({ type: 'indicator', code: ind.indicator_code, label: ind.indicator_name, sub: ind.indicator_code });
        }
      });

      // Blocks
      Object.entries(BLOCK_META).forEach(([num, meta]) => {
        if (meta.name.toLowerCase().includes(q) || meta.short.toLowerCase().includes(q) || `block ${num}`.includes(q)) {
          hits.push({ type: 'block', num: +num, label: meta.name, sub: `Block ${num}` });
        }
      });

      if (!container) return;
      if (!hits.length) {
        container.innerHTML = `<div class="px-3 py-3 text-xs text-ink-400">No results</div>`;
        container.classList.remove('hidden');
        return;
      }

      container.innerHTML = hits.slice(0, 12).map(h => `
        <button class="w-full text-left px-3 py-2.5 hover:bg-ink-50 border-b border-ink-50 last:border-0 search-hit"
                data-type="${h.type}" data-iso3="${h.iso3 || ''}" data-code="${h.code || ''}" data-num="${h.num || ''}">
          <div class="text-[13px] font-medium text-ink-800 truncate">${h.label}</div>
          <div class="text-[11px] text-ink-400">${h.sub}</div>
        </button>
      `).join('');
      container.classList.remove('hidden');

      container.querySelectorAll('.search-hit').forEach(btn => {
        btn.addEventListener('click', () => {
          const type = btn.dataset.type;
          if (type === 'country') navigate('country', { country: btn.dataset.iso3 });
          else if (type === 'indicator') navigate('indicator', { indicator: btn.dataset.code });
          else if (type === 'block') navigate('blocks');
          container.classList.add('hidden');
          if (input) input.value = '';
        });
      });
    }

    if (input) {
      input.addEventListener('input', e => doSearch(e.target.value, results));
      input.addEventListener('blur', () => setTimeout(() => results?.classList.add('hidden'), 180));
      input.addEventListener('focus', e => { if (e.target.value) doSearch(e.target.value, results); });
    }
    if (mobile) {
      mobile.addEventListener('input', e => {
        // Simple mobile: jump to rankings filtered or country
        const q = e.target.value.trim().toLowerCase();
        if (q.length >= 2) {
          const match = state.ranks.find(r => r.country.toLowerCase() === q || countryName(r.country).toLowerCase().includes(q));
          if (match) navigate('country', { country: match.country });
        }
      });
    }
  }

  // ─────────────────────────────────────────────
  // RENDER: HOME
  // ─────────────────────────────────────────────
  function renderHome(el) {
    const nAll = state.allCountries.length || 217;
    const nWith = state.ranks.length;
    const nWithout = state.countriesWithoutSE.length || (nAll - nWith);
    const nAllInd = state.allIndicators.length || 1498;
    const nSelInd = Object.keys(state.indicators).length;
    const nBlocks = ACTIVE_BLOCKS.length;
    const top10 = state.ranks.slice(0, 10);

    // Region breakdown of ranking universe
    const regionCounts = {};
    state.ranks.forEach(r => {
      const reg = state.countries[r.country]?.region || 'Other';
      regionCounts[reg] = (regionCounts[reg] || 0) + 1;
    });
    const regionEntries = Object.entries(regionCounts).sort((a, b) => b[1] - a[1]);

    el.innerHTML = `
      <!-- ═══ 1. HOOK ═══ -->
      <section class="hero-gradient text-white">
        <div class="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8 py-14 sm:py-20 lg:py-24">
          <p class="text-accent-400 text-xs font-medium tracking-[0.2em] uppercase mb-4">A decision tool for global equity investors</p>
          <h1 class="font-display text-3xl sm:text-4xl lg:text-5xl tracking-tight max-w-3xl leading-[1.15] text-white">
            Not every country has a stock market.<br class="hidden sm:block"/>
            <span class="text-accent-400">We rank the ones that do.</span>
          </h1>
          <p class="mt-6 text-ink-300 text-base sm:text-lg max-w-2xl leading-relaxed">
            There are roughly <strong class="text-white">${nAll} economies</strong> in the World Bank universe.
            Only <strong class="text-white">${nWith}</strong> of them operate a listed stock exchange.
            This platform ranks those ${nWith} economies on a transparent 0–100 scale — so you can see
            who leads, who lags, and exactly why.
          </p>
          <div class="mt-10 flex flex-wrap gap-3">
            <a href="#universe" class="px-6 py-3 bg-white text-ink-900 text-sm font-semibold rounded-lg hover:bg-ink-100 transition shadow-sm">
              Start the tour
            </a>
            <button data-nav="rankings" class="px-6 py-3 bg-ink-800/80 text-white text-sm font-medium rounded-lg border border-ink-600 hover:bg-ink-700 transition">
              Skip to rankings
            </button>
          </div>
        </div>
      </section>

      <!-- ═══ 2. COUNTRY UNIVERSE ═══ -->
      <section id="universe" class="border-b border-ink-200 bg-white">
        <div class="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8 py-12 sm:py-16">
          <div class="max-w-2xl mb-10">
            <p class="text-[11px] font-semibold text-accent-600 uppercase tracking-widest mb-2">Step 1 · The universe</p>
            <h2 class="text-2xl sm:text-3xl font-bold text-ink-900 tracking-tight">Which countries matter here?</h2>
            <p class="mt-3 text-ink-500 text-sm sm:text-base leading-relaxed">
              The world has many economies. This product only ranks those where an investor can actually
              access a listed equity market. Everything else is filtered out at the source.
            </p>
          </div>

          <div class="grid grid-cols-1 lg:grid-cols-5 gap-6 lg:gap-8">
            <div class="lg:col-span-2 space-y-4">
              <div class="card-premium p-5">
                <div class="flex items-baseline justify-between">
                  <span class="text-xs font-medium text-ink-400 uppercase tracking-wide">World Bank economies</span>
                  <span class="text-2xl font-bold text-ink-900 stat-value">${nAll}</span>
                </div>
                <div class="mt-3 score-track"><div class="score-fill bg-ink-300" style="width:100%"></div></div>
              </div>
              <div class="card-premium p-5 border-accent-200 ring-1 ring-accent-100">
                <div class="flex items-baseline justify-between">
                  <span class="text-xs font-medium text-accent-600 uppercase tracking-wide">With stock exchange</span>
                  <span class="text-2xl font-bold text-accent-600 stat-value">${nWith}</span>
                </div>
                <div class="mt-3 score-track"><div class="score-fill bg-accent-500" style="width:${(nWith / nAll * 100).toFixed(0)}%"></div></div>
                <p class="mt-2 text-[11px] text-ink-400">${((nWith / nAll) * 100).toFixed(0)}% of the global set — these are ranked</p>
              </div>
              <div class="card-premium p-5">
                <div class="flex items-baseline justify-between">
                  <span class="text-xs font-medium text-ink-400 uppercase tracking-wide">No stock exchange</span>
                  <span class="text-2xl font-bold text-ink-500 stat-value">${nWithout}</span>
                </div>
                <div class="mt-3 score-track"><div class="score-fill bg-ink-200" style="width:${(nWithout / nAll * 100).toFixed(0)}%"></div></div>
                <p class="mt-2 text-[11px] text-ink-400">Excluded from ranking</p>
              </div>
            </div>

            <div class="lg:col-span-3">
              <div class="card-premium overflow-hidden">
                <div class="px-4 py-3 border-b border-ink-100 flex items-center justify-between">
                  <h3 class="text-xs font-semibold text-ink-600 uppercase tracking-wide">Geographic distribution</h3>
                  <span class="text-[10px] text-ink-400">Ranking universe only</span>
                </div>
                <div class="h-[280px] sm:h-[320px] p-3"><canvas id="chart-region-donut"></canvas></div>
              </div>
            </div>
          </div>

          <div class="mt-8">
            <div class="card-premium overflow-hidden">
              <div id="home-map" class="h-[320px] sm:h-[400px] w-full"></div>
              <div class="px-4 py-2.5 border-t border-ink-100 flex flex-wrap items-center gap-4 text-[10px] text-ink-500">
                <span class="font-medium text-ink-600">Final score</span>
                <span class="inline-flex items-center gap-1.5"><span class="w-2.5 h-2.5 rounded-full bg-emerald-600"></span>≥65 strong</span>
                <span class="inline-flex items-center gap-1.5"><span class="w-2.5 h-2.5 rounded-full bg-sky-600"></span>55–65 solid</span>
                <span class="inline-flex items-center gap-1.5"><span class="w-2.5 h-2.5 rounded-full bg-amber-600"></span>45–55 mixed</span>
                <span class="inline-flex items-center gap-1.5"><span class="w-2.5 h-2.5 rounded-full bg-rose-600"></span>&lt;45 weak</span>
                <span class="ml-auto text-ink-400">Click any country to open its profile</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      <!-- ═══ 3. INDICATORS ═══ -->
      <section id="indicators-intro" class="border-b border-ink-200 bg-ink-50">
        <div class="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8 py-12 sm:py-16">
          <div class="max-w-2xl mb-10">
            <p class="text-[11px] font-semibold text-accent-600 uppercase tracking-widest mb-2">Step 2 · The data</p>
            <h2 class="text-2xl sm:text-3xl font-bold text-ink-900 tracking-tight">From 1,498 indicators to 129 that matter</h2>
            <p class="mt-3 text-ink-500 text-sm sm:text-base leading-relaxed">
              The World Bank publishes a vast indicator catalogue. Ranking every series would create noise.
              This system keeps only indicators that carry real information for comparing stock-market economies —
              selected with objective statistical methods (variation, entropy, conflict).
            </p>
          </div>

          <div class="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
            <div class="card-premium p-6 text-center">
              <p class="text-3xl sm:text-4xl font-bold text-ink-900 stat-value">${nAllInd.toLocaleString()}</p>
              <p class="text-xs font-medium text-ink-400 uppercase tracking-wide mt-2">Total World Bank indicators</p>
              <p class="text-[11px] text-ink-400 mt-1">Full catalogue considered</p>
            </div>
            <div class="card-premium p-6 text-center ring-1 ring-accent-200 border-accent-200">
              <p class="text-3xl sm:text-4xl font-bold text-accent-600 stat-value">${nSelInd}</p>
              <p class="text-xs font-medium text-accent-600 uppercase tracking-wide mt-2">Selected for ranking</p>
              <p class="text-[11px] text-ink-400 mt-1">${((nSelInd / nAllInd) * 100).toFixed(1)}% of the catalogue</p>
            </div>
            <div class="card-premium p-6 text-center">
              <p class="text-3xl sm:text-4xl font-bold text-ink-500 stat-value">${(nAllInd - nSelInd).toLocaleString()}</p>
              <p class="text-xs font-medium text-ink-400 uppercase tracking-wide mt-2">Not selected</p>
              <p class="text-[11px] text-ink-400 mt-1">Low signal or out of scope</p>
            </div>
          </div>

          <div class="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div class="card-premium p-4">
              <h3 class="text-xs font-semibold text-ink-600 uppercase tracking-wide mb-3">Selection funnel</h3>
              <div class="h-52"><canvas id="chart-ind-funnel"></canvas></div>
            </div>
            <div class="card-premium p-4">
              <h3 class="text-xs font-semibold text-ink-600 uppercase tracking-wide mb-3">Selected indicators by dimension</h3>
              <div class="h-52"><canvas id="chart-ind-by-block"></canvas></div>
            </div>
          </div>

          <div class="mt-6 text-center">
            <button data-nav="indicators" class="text-sm font-medium text-accent-600 hover:text-accent-700">
              Browse the full indicator catalogue →
            </button>
          </div>
        </div>
      </section>

      <!-- ═══ 4. BLOCKS / DIMENSIONS ═══ -->
      <section id="dimensions" class="border-b border-ink-200 bg-white">
        <div class="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8 py-12 sm:py-16">
          <div class="max-w-2xl mb-10">
            <p class="text-[11px] font-semibold text-accent-600 uppercase tracking-widest mb-2">Step 3 · The structure</p>
            <h2 class="text-2xl sm:text-3xl font-bold text-ink-900 tracking-tight">Ten dimensions that explain a country’s rank</h2>
            <p class="mt-3 text-ink-500 text-sm sm:text-base leading-relaxed">
              The 129 indicators are grouped into named analytical dimensions — not numbered blocks.
              Each dimension receives a country-specific weight. Together they form the final 0–100 score.
            </p>
          </div>

          <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
            ${ACTIVE_BLOCKS.map(num => {
      const meta = BLOCK_META[num];
      const nInd = Object.values(state.indicators).filter(i =>
        String(i.blocks || '').split(',').map(s => s.trim()).includes(String(num))
      ).length;
      return `
                <button data-nav="blocks" class="card-premium p-4 text-left group hover:border-accent-300 transition">
                  <div class="text-[10px] font-mono text-ink-400 mb-1">${nInd} indicators</div>
                  <div class="text-sm font-semibold text-ink-900 group-hover:text-accent-600 transition leading-snug">${meta.name}</div>
                  <p class="text-[11px] text-ink-400 mt-1.5 line-clamp-2 leading-relaxed">${meta.desc}</p>
                </button>
              `;
    }).join('')}
          </div>

          <div class="mt-8 card-premium p-4">
            <h3 class="text-xs font-semibold text-ink-600 uppercase tracking-wide mb-1">How a final score is built</h3>
            <p class="text-[11px] text-ink-400 mb-4">Every number on this platform sits in this hierarchy.</p>
            <div class="flex flex-col sm:flex-row items-stretch gap-2 text-center text-xs">
              ${[
        { t: '25-year series', s: 'World Bank history' },
        { t: 'Representative value', s: 'EWMA + trend methods' },
        { t: '0–100 indicator score', s: 'Cross-country normalize' },
        { t: 'Dimension score', s: 'Weighted indicators' },
        { t: 'Final country score', s: 'Weighted dimensions' }
      ].map((s, i) => `
                <div class="flex-1 bg-ink-50 rounded-lg p-3 border border-ink-100">
                  <div class="font-semibold text-ink-800">${s.t}</div>
                  <div class="text-ink-400 mt-0.5">${s.s}</div>
                </div>
                ${i < 4 ? '<div class="hidden sm:flex items-center text-ink-300 px-1">→</div>' : ''}
              `).join('')}
            </div>
          </div>
        </div>
      </section>

      <!-- ═══ 5. RANKINGS PREVIEW ═══ -->
      <section id="rank-preview" class="bg-ink-50">
        <div class="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8 py-12 sm:py-16">
          <div class="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4 mb-8">
            <div>
              <p class="text-[11px] font-semibold text-accent-600 uppercase tracking-widest mb-2">Step 4 · The ranking</p>
              <h2 class="text-2xl sm:text-3xl font-bold text-ink-900 tracking-tight">Who leads — and by how much</h2>
              <p class="mt-2 text-ink-500 text-sm max-w-xl">Top of the ranking universe. Click any country to see the dimensions and indicators behind its score.</p>
            </div>
            <button data-nav="rankings" class="px-5 py-2.5 bg-ink-900 text-white text-sm font-semibold rounded-lg hover:bg-ink-800 transition shrink-0">
              View all ${nWith} countries
            </button>
          </div>

          <div class="grid grid-cols-1 lg:grid-cols-5 gap-6">
            <div class="lg:col-span-2 card-premium overflow-hidden">
              ${top10.map(r => {
        const name = countryName(r.country);
        const sw = getStrongestWeakest(r.country, 1);
        const best = sw.strong[0];
        return `
                  <button data-country="${r.country}" class="country-link w-full flex items-center gap-3 px-4 py-3 hover:bg-ink-50 transition border-b border-ink-100 last:border-0 text-left">
                    <span class="w-8 h-8 rounded-full ${rankBadgeClass(r.rank)} flex items-center justify-center text-xs font-bold shrink-0">${r.rank}</span>
                    <div class="flex-1 min-w-0">
                      <div class="text-sm font-semibold text-ink-900 truncate">${name}</div>
                      <div class="text-[11px] text-ink-400">${best ? 'Strongest: ' + (BLOCK_META[best.block]?.name || '') : r.country}</div>
                    </div>
                    <div class="text-right shrink-0">
                      <div class="text-sm font-bold ${scoreTextColor(r.final_score)} stat-value">${fmt(r.final_score)}</div>
                      <div class="text-[10px] text-ink-400">/ 100</div>
                    </div>
                  </button>
                `;
      }).join('')}
            </div>

            <div class="lg:col-span-3 space-y-4">
              <div class="card-premium p-4">
                <h3 class="text-xs font-semibold text-ink-600 uppercase tracking-wide mb-3">Score distribution</h3>
                <div class="h-48"><canvas id="chart-score-dist"></canvas></div>
              </div>
              <div class="card-premium p-4">
                <h3 class="text-xs font-semibold text-ink-600 uppercase tracking-wide mb-3">Rank vs score</h3>
                <div class="h-48"><canvas id="chart-rank-scatter"></canvas></div>
              </div>
            </div>
          </div>
        </div>
      </section>
    `;

    // Bind
    el.querySelectorAll('.country-link').forEach(btn => {
      btn.addEventListener('click', () => navigate('country', { country: btn.dataset.country }));
    });
    el.querySelectorAll('[data-nav]').forEach(btn => {
      btn.addEventListener('click', () => navigate(btn.dataset.nav));
    });

    setTimeout(() => {
      initHomeMap();

      // Region doughnut
      makeDoughnutChart('chart-region-donut',
        regionEntries.map(([k]) => REGION_NAMES[k] || k),
        regionEntries.map(([, v]) => v),
        { legendPos: 'right' }
      );

      // Indicator funnel (horizontal bar)
      makeBarChart('chart-ind-funnel',
        ['Total catalogue', 'Selected', 'Not selected'],
        [nAllInd, nSelInd, nAllInd - nSelInd],
        { horizontal: true, label: 'Indicators', colorFn: (v, i) => i === 1 ? '#0ea5e9' : '#476185', max: undefined }
      );

      // Indicators by dimension
      const blockLabels = ACTIVE_BLOCKS.map(b => BLOCK_META[b].short);
      const blockCounts = ACTIVE_BLOCKS.map(num =>
        Object.values(state.indicators).filter(i =>
          String(i.blocks || '').split(',').map(s => s.trim()).includes(String(num))
        ).length
      );
      makeBarChart('chart-ind-by-block', blockLabels, blockCounts, {
        horizontal: true, label: 'Indicators', colorFn: (_, i) => CHART_COLORS[i % CHART_COLORS.length], max: undefined
      });

      // Score histogram
      const scores = state.ranks.map(r => r.final_score);
      const bins = [0, 30, 40, 50, 55, 60, 65, 70, 80, 100];
      const labels = [];
      const counts = [];
      for (let i = 0; i < bins.length - 1; i++) {
        labels.push(bins[i] + '–' + bins[i + 1]);
        counts.push(scores.filter(s => s >= bins[i] && (i === bins.length - 2 ? s <= bins[i + 1] : s < bins[i + 1])).length);
      }
      makeBarChart('chart-score-dist', labels, counts, {
        horizontal: false, label: 'Countries', colorFn: () => '#0ea5e9', maxBarThickness: 36, max: undefined
      });

      // Scatter
      makeScatterChart('chart-rank-scatter',
        state.ranks.map(r => ({ x: r.rank, y: r.final_score, label: countryName(r.country) })),
        { xLabel: 'Rank (1 = best)', yLabel: 'Final Score' }
      );
    }, 60);
  }

  function initHomeMap() {
    const container = $('#home-map');
    if (!container || typeof L === 'undefined') return;

    const map = L.map(container, { scrollWheelZoom: false, worldCopyJump: true }).setView([20, 10], 1.6);
    state.mapInstance = map;

    L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
      attribution: '&copy; OpenStreetMap &copy; CARTO',
      maxZoom: 8
    }).addTo(map);

    const scoreMap = Object.fromEntries(state.ranks.map(r => [r.country, r]));

    function colorForScore(s) {
      if (s == null) return '#cbd5e1';
      if (s >= 65) return '#059669';
      if (s >= 55) return '#0284c7';
      if (s >= 45) return '#d97706';
      return '#dc2626';
    }

    state.ranks.forEach(r => {
      const meta = state.countries[r.country];
      if (!meta || meta.latitude == null || meta.longitude == null) return;

      const radius = 6 + (r.final_score / 100) * 8;
      const marker = L.circleMarker([meta.latitude, meta.longitude], {
        radius,
        fillColor: colorForScore(r.final_score),
        color: '#fff',
        weight: 1.5,
        opacity: 1,
        fillOpacity: 0.85
      }).addTo(map);

      marker.bindPopup(`
        <div class="font-semibold text-ink-900">${countryName(r.country)}</div>
        <div class="text-xs text-ink-500 mt-0.5">Rank #${r.rank} · Score ${fmt(r.final_score)}</div>
        <button class="mt-2 text-xs font-medium text-accent-600 map-country-btn" data-c="${r.country}">Open profile →</button>
      `);

      marker.on('popupopen', () => {
        setTimeout(() => {
          document.querySelectorAll('.map-country-btn').forEach(b => {
            b.addEventListener('click', () => navigate('country', { country: b.dataset.c }));
          });
        }, 10);
      });
    });
  }

  // ─────────────────────────────────────────────
  // RENDER: RANKINGS
  // ─────────────────────────────────────────────
  function initCountryMap(iso3) {
    const container = document.getElementById('country-detail-map');
    if (!container || typeof L === 'undefined') return;

    // Clear previous map if container was re-used
    if (container._leaflet_id) {
      try {
        container._leaflet_id = null;
        container.innerHTML = '';
      } catch (e) { }
    }

    const meta = state.countries[iso3];
    const rank = state.ranks.find(r => r.country === iso3);
    const lat = meta && meta.latitude != null ? +meta.latitude : null;
    const lng = meta && meta.longitude != null ? +meta.longitude : null;

    const map = L.map(container, {
      scrollWheelZoom: false,
      dragging: true,
      attributionControl: true,
      zoomControl: true
    });

    const isDark = document.documentElement.classList.contains('dark');
    L.tileLayer(
      isDark
        ? 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png'
        : 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png',
      {
        attribution: '&copy; OpenStreetMap &copy; CARTO',
        maxZoom: 10
      }
    ).addTo(map);

    if (lat != null && lng != null && !isNaN(lat) && !isNaN(lng)) {
      const score = rank ? rank.final_score : null;
      let fill = '#0ea5e9';
      if (score != null) {
        if (score >= 65) fill = '#059669';
        else if (score >= 55) fill = '#0284c7';
        else if (score >= 45) fill = '#d97706';
        else fill = '#dc2626';
      }
      L.circleMarker([lat, lng], {
        radius: 12,
        fillColor: fill,
        color: '#bd7e7e',
        weight: 2,
        opacity: 1,
        fillOpacity: 0.9
      }).addTo(map).bindPopup(
        `<strong>${countryName(iso3)}</strong><br/>` +
        (rank ? `Rank #${rank.rank} · Score ${fmt(rank.final_score)}` : iso3)
      );
      map.setView([lat, lng], 4);
    } else {
      map.setView([20, 10], 1.5);
      container.insertAdjacentHTML('beforeend',
        '<div class="absolute inset-0 flex items-center justify-center text-xs text-ink-400 pointer-events-none">Coordinates not available</div>');
    }

    setTimeout(() => map.invalidateSize(), 120);
  }

  function renderRankings(el) {
    el.innerHTML = `
      <div class="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
        <div class="mb-6">
          <h1 class="text-xl sm:text-2xl font-bold text-ink-900">Country Rankings</h1>
          <p class="text-sm text-ink-500 mt-1 max-w-2xl">These are the ${state.ranks.length} economies with listed stock exchanges, ordered by final score (0–100). Click a country to see which dimensions and indicators explain its position.</p>
        </div>

        <div class="flex flex-col sm:flex-row gap-3 mb-5">
          <div class="relative flex-1 max-w-md">
            <input id="rank-search" type="search" placeholder="Filter by country name or ISO3…"
                   class="w-full pl-9 pr-3 py-2 text-sm border border-ink-200 rounded-md bg-white focus:outline-none focus:ring-2 focus:ring-accent-500/30 focus:border-accent-500" />
            <svg class="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-ink-400" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/></svg>
          </div>
          <select id="rank-sort" class="text-sm border border-ink-200 rounded-md px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-accent-500/30">
            <option value="rank-asc">Rank (best first)</option>
            <option value="rank-desc">Rank (lowest first)</option>
            <option value="score-desc">Score (high → low)</option>
            <option value="score-asc">Score (low → high)</option>
            <option value="name-asc">Country name A–Z</option>
          </select>
        </div>

        <div class="bg-white border border-ink-200 rounded-lg shadow-soft overflow-hidden">
          <div class="overflow-x-auto">
            <table class="data-table mobile-card-table w-full text-sm">
              <thead>
                <tr class="text-left text-[11px] font-medium text-ink-500 uppercase tracking-wide border-b border-ink-200">
                  <th class="px-4 py-3 w-16">Rank</th>
                  <th class="px-4 py-3">Country</th>
                  <th class="px-4 py-3 text-right">Final Score</th>
                  <th class="px-4 py-3 hidden md:table-cell">Strongest Block</th>
                  <th class="px-4 py-3 hidden md:table-cell">Weakest Block</th>
                  <th class="px-4 py-3 hidden lg:table-cell">Region</th>
                </tr>
              </thead>
              <tbody id="rank-tbody"></tbody>
            </table>
          </div>
        </div>
        <p class="mt-3 text-[11px] text-ink-400" id="rank-count"></p>
      </div>
    `;

    const tbody = $('#rank-tbody');
    const searchInput = $('#rank-search');
    const sortSelect = $('#rank-sort');
    const countEl = $('#rank-count');

    function renderRows(data) {
      tbody.innerHTML = data.map(r => {
        const name = countryName(r.country);
        const meta = state.countries[r.country] || {};
        const sw = getStrongestWeakest(r.country, 1);
        const strong = sw.strong[0];
        const weak = sw.weak[0];
        return `
          <tr data-country="${r.country}">
            <td class="px-4 py-3" data-label="Rank">
              <span class="inline-flex w-7 h-7 rounded-full ${rankBadgeClass(r.rank)} items-center justify-center text-xs font-bold">${r.rank}</span>
            </td>
            <td class="px-4 py-3" data-label="Country">
              <div class="font-medium text-ink-900">${name}</div>
              <div class="text-[11px] text-ink-400 font-mono">${r.country}</div>
            </td>
            <td class="px-4 py-3 text-right" data-label="Score">
              <span class="font-semibold ${scoreTextColor(r.final_score)}">${fmt(r.final_score)}</span>
              <span class="text-ink-400 text-xs"> /100</span>
              <div class="score-track mt-1 w-20 ml-auto hidden sm:block">
                <div class="score-fill ${scoreColor(r.final_score)}" style="width:${Math.min(100, r.final_score)}%"></div>
              </div>
            </td>
            <td class="px-4 py-3 hidden md:table-cell text-xs text-ink-600" data-label="Strongest">
              ${strong ? `${BLOCK_META[strong.block]?.short || 'B' + strong.block} <span class="text-ink-400">(${fmt(strong.score)})</span>` : '—'}
            </td>
            <td class="px-4 py-3 hidden md:table-cell text-xs text-ink-600" data-label="Weakest">
              ${weak ? `${BLOCK_META[weak.block]?.short || 'B' + weak.block} <span class="text-ink-400">(${fmt(weak.score)})</span>` : '—'}
            </td>
            <td class="px-4 py-3 hidden lg:table-cell text-xs text-ink-500" data-label="Region">
              ${REGION_NAMES[meta.region] || safeStr(meta.region)}
            </td>
          </tr>
        `;
      }).join('');

      tbody.querySelectorAll('tr').forEach(tr => {
        tr.addEventListener('click', () => navigate('country', { country: tr.dataset.country }));
      });
      countEl.textContent = `Showing ${data.length} of ${state.ranks.length} countries`;
    }

    function applyFilters() {
      let data = [...state.ranks];
      const q = (searchInput.value || '').trim().toLowerCase();
      if (q) {
        data = data.filter(r => r.country.toLowerCase().includes(q) || countryName(r.country).toLowerCase().includes(q));
      }
      const sort = sortSelect.value;
      if (sort === 'rank-asc') data.sort((a, b) => a.rank - b.rank);
      else if (sort === 'rank-desc') data.sort((a, b) => b.rank - a.rank);
      else if (sort === 'score-desc') data.sort((a, b) => b.final_score - a.final_score);
      else if (sort === 'score-asc') data.sort((a, b) => a.final_score - b.final_score);
      else if (sort === 'name-asc') data.sort((a, b) => countryName(a.country).localeCompare(countryName(b.country)));
      renderRows(data);
    }

    searchInput.addEventListener('input', applyFilters);
    sortSelect.addEventListener('change', applyFilters);
    applyFilters();
  }

  // ─────────────────────────────────────────────
  // RENDER: COUNTRY PROFILE
  // ─────────────────────────────────────────────
  function renderCountry(iso3) {
    const el = $('#view-country');
    const rankInfo = state.ranks.find(r => r.country === iso3);
    const meta = state.countries[iso3] || {};
    const bp = state.blockPerf[iso3] || {};
    const bw = state.blockWeights[iso3] || {};
    const sw = getStrongestWeakest(iso3, 3);
    if (!rankInfo) {
      el.innerHTML = `<div class="max-w-[1400px] mx-auto px-4 py-16 text-center text-ink-500">Country not found.</div>`;
      return;
    }

    const blockCards = [];
    ACTIVE_BLOCKS.forEach(i => {
      const score = bp[`Block_${i}`];
      const weight = bw[`Block_${i}`];
      const inds = getCountryIndicators(iso3, i);
      blockCards.push({ num: i, score: score ?? 0, weight: weight ?? 0, nInd: inds.length, meta: BLOCK_META[i] });
    });

    el.innerHTML = `
      <div class="bg-white border-b border-ink-200">
        <div class="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
          <button data-nav="rankings" class="text-xs font-medium text-ink-400 hover:text-ink-600 mb-3 inline-flex items-center gap-1">
            <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M15 19l-7-7 7-7"/></svg>
            Rankings
          </button>
          <div class="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-4">
            <div>
              <p class="text-[11px] font-medium text-accent-600 uppercase tracking-wide mb-1">Stock-market economy · Ranked profile</p>
              <h1 class="text-2xl sm:text-3xl font-bold text-ink-900 tracking-tight">${countryName(iso3)}</h1>
              <div class="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1.5 text-sm text-ink-500">
                <span class="font-mono text-ink-400">${iso3}</span>
                <span>·</span>
                <span>${REGION_NAMES[meta.region] || safeStr(meta.region)}</span>
                ${meta.incomeLevel ? `<span>·</span><span>${safeStr(meta.incomeLevel)}</span>` : ''}
                ${meta.capitalCity ? `<span>·</span><span>${safeStr(meta.capitalCity)}</span>` : ''}
              </div>
            </div>
            <div class="flex items-end gap-6">
              <div class="text-center">
                <p class="text-[11px] font-medium text-ink-400 uppercase tracking-wide">Global Rank</p>
                <p class="text-3xl font-bold text-ink-900 mt-0.5">#${rankInfo.rank}</p>
              </div>
              <div class="text-center">
                <p class="text-[11px] font-medium text-ink-400 uppercase tracking-wide">Final Score</p>
                <p class="text-3xl font-bold ${scoreTextColor(rankInfo.final_score)} mt-0.5">${fmt(rankInfo.final_score)}<span class="text-lg text-ink-400 font-normal">/100</span></p>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div class="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8 space-y-8">

        <!-- Country Scorecard -->
        <div class="bg-white border border-ink-200 rounded-lg shadow-soft overflow-hidden" id="country-scorecard">
          <div class="px-5 py-3 border-b border-ink-100 flex items-center justify-between bg-ink-50">
            <h2 class="text-xs font-semibold text-ink-600 uppercase tracking-wide">Country Scorecard</h2>
            <span class="text-[10px] text-ink-400">2000–2026 · 0–100 scale</span>
          </div>
          <div class="p-5">
            <div class="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-5">
              <div>
                <p class="text-[10px] font-medium text-ink-400 uppercase">Global Rank</p>
                <p class="text-xl font-bold text-ink-900">#${rankInfo.rank}</p>
              </div>
              <div>
                <p class="text-[10px] font-medium text-ink-400 uppercase">Final Score</p>
                <p class="text-xl font-bold ${scoreTextColor(rankInfo.final_score)}">${fmt(rankInfo.final_score)}</p>
              </div>
              <div>
                <p class="text-[10px] font-medium text-ink-400 uppercase">Best Block</p>
                <p class="text-sm font-semibold text-ink-800">${sw.strong[0] ? (BLOCK_META[sw.strong[0].block]?.short || 'B' + sw.strong[0].block) + ' (' + fmt(sw.strong[0].score) + ')' : 'N/A'}</p>
              </div>
              <div>
                <p class="text-[10px] font-medium text-ink-400 uppercase">Weakest Block</p>
                <p class="text-sm font-semibold text-ink-800">${sw.weak[0] ? (BLOCK_META[sw.weak[0].block]?.short || 'B' + sw.weak[0].block) + ' (' + fmt(sw.weak[0].score) + ')' : 'N/A'}</p>
              </div>
            </div>
            <div class="grid grid-cols-2 sm:grid-cols-5 lg:grid-cols-10 gap-1.5">
              ${blockCards.map(b => `
                <div class="text-center p-1.5 rounded border border-ink-100 bg-ink-50" title="${b.meta?.name || 'Block ' + b.num}">
                  <div class="text-[9px] text-ink-400 truncate">${b.meta?.short || 'D' + b.num}</div>
                  <div class="text-xs font-bold ${scoreTextColor(b.score)}">${b.score > 0 ? fmt(b.score, 0) : '—'}</div>
                </div>
              `).join('')}
            </div>
            <p class="mt-3 text-[10px] text-ink-400">All 10 analytical block scores shown. Hover for full block name. Values of 0 may indicate no shortlisted indicators for that block in this country.</p>
          </div>
        </div>

        <!-- Visual Analytics -->
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div class="bg-white border border-ink-200 rounded-lg shadow-soft p-4">
            <h3 class="text-xs font-semibold text-ink-600 uppercase tracking-wide mb-3">Block Performance (Bar Chart)</h3>
            <div class="h-64"><canvas id="chart-block-bars"></canvas></div>
          </div>
          <div class="bg-white border border-ink-200 rounded-lg shadow-soft p-4">
            <h3 class="text-xs font-semibold text-ink-600 uppercase tracking-wide mb-3">Block Weights (Doughnut)</h3>
            <div class="h-64"><canvas id="chart-block-weights"></canvas></div>
          </div>
        </div>

        <div class="bg-white border border-ink-200 rounded-lg shadow-soft p-4">
          <h3 class="text-xs font-semibold text-ink-600 uppercase tracking-wide mb-1">Contribution Treemap</h3>
          <p class="text-[11px] text-ink-400 mb-3">Tile area ≈ Block Score × Block Weight. Larger tiles contribute more to the final country score.</p>
          <div class="h-56 sm:h-64"><canvas id="chart-treemap"></canvas></div>
        </div>

        <!-- Rank drivers + country map -->
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div class="bg-white border border-ink-200 rounded-lg shadow-soft p-5">
            <h3 class="text-xs font-semibold text-ink-500 uppercase tracking-wide mb-1">What drives this rank?</h3>
            <p class="text-[11px] text-ink-400 mb-3">Contribution of each dimension ≈ score × country-specific weight. Larger contribution moves the final score more.</p>
            <div class="h-56 mb-2"><canvas id="chart-drivers"></canvas></div>
            <div class="grid grid-cols-2 sm:grid-cols-5 gap-2 text-[11px]" id="drivers-list"></div>
          </div>
          <div class="bg-white border border-ink-200 rounded-lg shadow-soft overflow-hidden flex flex-col">
            <div class="px-5 pt-4 pb-2">
              <h3 class="text-xs font-semibold text-ink-500 uppercase tracking-wide mb-1">Country location</h3>
              <p class="text-[11px] text-ink-400">Geographic position of ${countryName(iso3)} within the ranking universe.</p>
            </div>
            <div id="country-detail-map" class="flex-1 min-h-[240px] h-64 lg:h-auto w-full bg-ink-50"></div>
          </div>
        </div>

        <!-- Strengths / Weaknesses -->
        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div class="bg-white border border-ink-200 rounded-lg p-5 shadow-soft">
            <h3 class="text-xs font-semibold text-ink-500 uppercase tracking-wide mb-3">Leading Areas</h3>
            <div class="space-y-2.5">
              ${sw.strong.map(s => `
                <button class="block-link w-full flex items-center justify-between text-left group" data-block="${s.block}" data-country="${iso3}">
                  <span class="text-sm font-medium text-ink-800 group-hover:text-accent-600">${BLOCK_META[s.block]?.name || 'Block ' + s.block}</span>
                  <span class="text-sm font-semibold ${scoreTextColor(s.score)}">${fmt(s.score)}</span>
                </button>
              `).join('') || '<p class="text-sm text-ink-400">No data</p>'}
            </div>
          </div>
          <div class="bg-white border border-ink-200 rounded-lg p-5 shadow-soft">
            <h3 class="text-xs font-semibold text-ink-500 uppercase tracking-wide mb-3">Areas Requiring Attention</h3>
            <div class="space-y-2.5">
              ${sw.weak.map(s => `
                <button class="block-link w-full flex items-center justify-between text-left group" data-block="${s.block}" data-country="${iso3}">
                  <span class="text-sm font-medium text-ink-800 group-hover:text-accent-600">${BLOCK_META[s.block]?.name || 'Block ' + s.block}</span>
                  <span class="text-sm font-semibold ${scoreTextColor(s.score)}">${fmt(s.score)}</span>
                </button>
              `).join('') || '<p class="text-sm text-ink-400">No data</p>'}
            </div>
          </div>
        </div>

        <!-- Why This Rank -->
        <div class="bg-white border border-ink-200 rounded-lg shadow-soft overflow-hidden">
          <div class="px-5 py-4 border-b border-ink-100 flex items-center justify-between">
            <div>
              <h2 class="text-sm font-semibold text-ink-900">Why This Rank?</h2>
              <p class="text-xs text-ink-500 mt-0.5">Final score is the weighted sum of 10 block scores. Weights are country-specific — the same dimension can matter more for one economy than another.</p>
            </div>
          </div>
          <div class="p-5">
            <div class="space-y-3" id="why-blocks">
              ${blockCards.map(b => {
      const contrib = (b.score * b.weight);
      return `
                  <button class="block-link w-full group" data-block="${b.num}" data-country="${iso3}">
                    <div class="flex items-center justify-between mb-1">
                      <div class="flex items-center gap-2 min-w-0">
                        <span class="text-sm font-medium text-ink-800 truncate group-hover:text-accent-600">${b.meta?.name || 'Dimension ' + b.num}</span>
                      </div>
                      <div class="flex items-center gap-3 shrink-0 text-xs">
                        <span class="text-ink-400">w=${fmt(b.weight * 100, 1)}%</span>
                        <span class="font-semibold ${scoreTextColor(b.score)} w-10 text-right">${fmt(b.score)}</span>
                      </div>
                    </div>
                    <div class="score-track">
                      <div class="score-fill ${scoreColor(b.score)}" style="width:${Math.min(100, Math.max(0, b.score))}%"></div>
                    </div>
                  </button>
                `;
    }).join('')}
            </div>
            <p class="mt-4 text-[11px] text-ink-400">
              Contribution of each block ≈ Block Score × Block Weight. Sum of weights = 1.0 per country.
            </p>
          </div>
        </div>

        <!-- Block cards grid -->
        <div>
          <h2 class="text-sm font-semibold text-ink-900 mb-3">Performance Across 10 Analytical Blocks</h2>
          <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            ${blockCards.map(b => `
              <button class="block-link bg-white border border-ink-200 rounded-lg p-4 shadow-soft text-left hover:border-accent-400 transition group" data-block="${b.num}" data-country="${iso3}">
                <div class="flex items-start justify-between">
                  <div>
                    <div class="text-sm font-semibold text-ink-900 group-hover:text-accent-600 leading-snug">${b.meta?.name || 'Dimension ' + b.num}</div>
                  </div>
                  <div class="text-right">
                    <div class="text-lg font-bold ${scoreTextColor(b.score)}">${fmt(b.score)}</div>
                    <div class="text-[10px] text-ink-400">weight ${fmt(b.weight * 100, 1)}%</div>
                  </div>
                </div>
                <div class="score-track mt-3">
                  <div class="score-fill ${scoreColor(b.score)}" style="width:${Math.min(100, Math.max(0, b.score))}%"></div>
                </div>
                <div class="mt-2 text-[11px] text-ink-400">${b.nInd} indicator${b.nInd !== 1 ? 's' : ''} contributing</div>
              </button>
            `).join('')}
          </div>
        </div>

        <!-- Quick actions -->
        <div class="flex flex-wrap gap-3 no-print">
          <button data-nav="compare" data-preselect="${iso3}" class="px-4 py-2 text-sm font-medium border border-ink-200 rounded-md bg-white hover:bg-ink-50 transition">
            Compare with others
          </button>
          <button data-nav="rankings" class="px-4 py-2 text-sm font-medium text-ink-600 hover:text-ink-900 transition">
            ← Back to rankings
          </button>
        </div>
      </div>
    `;

    // Bind
    el.querySelectorAll('.block-link').forEach(btn => {
      btn.addEventListener('click', () => navigate('block', { block: +btn.dataset.block, country: btn.dataset.country }));
    });
    el.querySelectorAll('[data-nav]').forEach(btn => {
      btn.addEventListener('click', () => {
        if (btn.dataset.preselect) {
          state.compareSelection = [btn.dataset.preselect];
        }
        navigate(btn.dataset.nav);
      });
    });

    // Charts
    setTimeout(() => {
      const labels = blockCards.map(b => b.meta?.short || ('B' + b.num));
      const scores = blockCards.map(b => b.score || 0);
      const weights = blockCards.map(b => b.weight || 0);
      const contribs = blockCards.map(b => ({
        label: b.meta?.short || ('Block ' + b.num),
        value: Math.max(0.01, (b.score || 0) * (b.weight || 0))
      }));

      makeBarChart('chart-block-bars', labels, scores, {
        label: 'Block score',
        colorFn: (v) => scoreColorHex(v),
        max: 100
      });

      makeDoughnutChart('chart-block-weights', labels, weights, { legendPos: 'right' });

      makeTreemapChart('chart-treemap', contribs);

      // Rank drivers
      const drivers = rankDrivers(iso3);
      const dList = document.getElementById('drivers-list');
      if (dList) {
        dList.innerHTML = drivers.slice(0, 5).map(d => `
          <div class="border border-ink-100 rounded p-2 bg-ink-50">
            <div class="text-ink-500 truncate">${d.short}</div>
            <div class="font-semibold text-ink-900">${fmt(d.impact)}</div>
          </div>
        `).join('');
      }
      makeBarChart('chart-drivers',
        drivers.map(d => d.short),
        drivers.map(d => d.impact),
        { horizontal: true, label: 'Contribution', colorFn: (_, i) => CHART_COLORS[i % CHART_COLORS.length], max: undefined }
      );

      initCountryMap(iso3);
    }, 60);
  }

  // ─────────────────────────────────────────────
  // RENDER: BLOCK DETAIL (for a country)
  // ─────────────────────────────────────────────
  function renderBlockDetail(blockNum, iso3) {
    const el = $('#view-block');
    const meta = BLOCK_META[blockNum] || { name: `Block ${blockNum}` };
    const bp = state.blockPerf[iso3] || {};
    const bw = state.blockWeights[iso3] || {};
    const score = bp[`Block_${blockNum}`] ?? 0;
    const weight = bw[`Block_${blockNum}`] ?? 0;
    const inds = getCountryIndicators(iso3, blockNum);
    // Enrich with names + normalized detail
    const rows = inds.map(ind => {
      const info = state.indicators[ind.indicator_code] || {};
      const norm = getNormalizedFor(iso3, ind.indicator_code) || {};
      return { ...ind, name: info.indicator_name || ind.indicator_code, direction: norm.direction || '—', ...norm };
    }).sort((a, b) => (b.weighted_contribution || 0) - (a.weighted_contribution || 0));

    el.innerHTML = `
      <div class="bg-white border-b border-ink-200">
        <div class="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <button class="text-xs font-medium text-ink-400 hover:text-ink-600 mb-3 inline-flex items-center gap-1" data-back-country="${iso3}">
            <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M15 19l-7-7 7-7"/></svg>
            ${countryName(iso3)}
          </button>
          <div class="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
            <div>
              <p class="text-[11px] font-mono text-ink-400">Block ${blockNum}</p>
              <h1 class="text-xl sm:text-2xl font-bold text-ink-900">${meta.name}</h1>
              <p class="text-sm text-ink-500 mt-1">${meta.desc || ''}</p>
            </div>
            <div class="flex gap-6">
              <div>
                <p class="text-[11px] text-ink-400 uppercase tracking-wide">Block Score</p>
                <p class="text-2xl font-bold ${scoreTextColor(score)}">${fmt(score)}</p>
              </div>
              <div>
                <p class="text-[11px] text-ink-400 uppercase tracking-wide">Block Weight</p>
                <p class="text-2xl font-bold text-ink-900">${fmt(weight * 100, 1)}%</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div class="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <div class="mb-4">
          <h2 class="text-sm font-semibold text-ink-900">Indicators Contributing to This Block</h2>
          <p class="text-xs text-ink-500 mt-0.5">Performance score and weight are distinct: score = how the country performs; weight = relative importance within the block for this country.</p>
        </div>

        <div class="bg-white border border-ink-200 rounded-lg shadow-soft overflow-hidden">
          <div class="overflow-x-auto">
            <table class="data-table w-full text-sm">
              <thead>
                <tr class="text-left text-[11px] font-medium text-ink-500 uppercase tracking-wide border-b border-ink-200">
                  <th class="px-4 py-3">Indicator</th>
                  <th class="px-4 py-3 text-right">Score 0–100</th>
                  <th class="px-4 py-3 text-right hidden sm:table-cell">Weight</th>
                  <th class="px-4 py-3 text-right">Contribution</th>
                  <th class="px-4 py-3 hidden md:table-cell">Direction</th>
                </tr>
              </thead>
              <tbody>
                ${rows.length ? rows.map(r => `
                  <tr class="ind-row" data-code="${r.indicator_code}" data-country="${iso3}">
                    <td class="px-4 py-3">
                      <div class="font-medium text-ink-900 text-[13px]">${r.name}</div>
                      <div class="text-[11px] font-mono text-ink-400">${r.indicator_code}</div>
                    </td>
                    <td class="px-4 py-3 text-right font-semibold ${scoreTextColor(r.score_0_100)}">${fmt(r.score_0_100)}</td>
                    <td class="px-4 py-3 text-right text-ink-600 hidden sm:table-cell">${fmt((r.indicator_weight || 0) * 100, 1)}%</td>
                    <td class="px-4 py-3 text-right text-ink-800">${fmt(r.weighted_contribution)}</td>
                    <td class="px-4 py-3 hidden md:table-cell">
                      <span class="inline-block px-1.5 py-0.5 rounded text-[10px] font-medium ${r.direction === 'beneficial' ? 'dir-beneficial' : r.direction === 'adverse' ? 'dir-adverse' : 'bg-ink-100 text-ink-500'}">${r.direction || '—'}</span>
                    </td>
                  </tr>
                `).join('') : `<tr><td colspan="5" class="px-4 py-8 text-center text-ink-400 text-sm">No shortlisted indicators for this country–block combination.</td></tr>`}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    `;

    el.querySelector('[data-back-country]')?.addEventListener('click', e => navigate('country', { country: e.currentTarget.dataset.backCountry }));
    el.querySelectorAll('.ind-row').forEach(tr => {
      tr.addEventListener('click', () => navigate('indicator', { indicator: tr.dataset.code, country: tr.dataset.country }));
    });
  }

  // ─────────────────────────────────────────────
  // RENDER: INDICATOR DETAIL
  // ─────────────────────────────────────────────
  function renderIndicatorDetail(code, iso3) {
    const el = $('#view-indicator');
    const info = state.indicators[code] || { indicator_code: code, indicator_name: code };
    const norm = iso3 ? getNormalizedFor(iso3, code) : null;
    const perf = iso3 ? state.indicatorPerf.find(r => r.country === iso3 && r.indicator_code === code) : null;

    // Global distribution for this indicator
    const global = state.normalized
      .filter(r => r.indicator_code === code)
      .map(r => ({
        country: r.country,
        score: r.score_0_100,
        direction: r.direction,
        rankInfo: state.ranks.find(x => x.country === r.country)
      }))
      .sort((a, b) => (b.score || 0) - (a.score || 0));

    el.innerHTML = `
      <div class="bg-white border-b border-ink-200">
        <div class="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8 py-6">
          ${iso3 ? `
            <button class="text-xs font-medium text-ink-400 hover:text-ink-600 mb-3 inline-flex items-center gap-1" data-back-country="${iso3}">
              <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M15 19l-7-7 7-7"/></svg>
              ${countryName(iso3)}
            </button>
          ` : `
            <button data-nav="indicators" class="text-xs font-medium text-ink-400 hover:text-ink-600 mb-3 inline-flex items-center gap-1">
              <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M15 19l-7-7 7-7"/></svg>
              Indicators
            </button>
          `}
          <p class="text-[11px] font-mono text-ink-400">${code}</p>
          <h1 class="text-xl sm:text-2xl font-bold text-ink-900 mt-0.5 max-w-3xl">${info.indicator_name || code}</h1>
          <div class="flex flex-wrap gap-2 mt-2">
            ${info.blocks ? `<span class="text-[11px] px-2 py-0.5 rounded bg-ink-100 text-ink-600">Block ${info.blocks}</span>` : ''}
            ${norm?.direction ? `<span class="text-[11px] px-2 py-0.5 rounded font-medium ${norm.direction === 'beneficial' ? 'dir-beneficial' : 'dir-adverse'}">${norm.direction === 'beneficial' ? 'Beneficial (higher better)' : 'Adverse (lower better)'}</span>` : ''}
          </div>
        </div>
      </div>

      <div class="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-8">
        ${iso3 && norm ? `
          <!-- Country-specific score breakdown -->
          <div class="bg-white border border-ink-200 rounded-lg shadow-soft p-5">
            <h2 class="text-sm font-semibold text-ink-900 mb-1">Score for ${countryName(iso3)}</h2>
            <p class="text-xs text-ink-500 mb-4">Final indicator score is the average of four cross-sectional normalization methods.</p>
            
            <div class="flex flex-wrap items-end gap-2 mb-6">
              <span class="text-4xl font-bold ${scoreTextColor(norm.score_0_100)}">${fmt(norm.score_0_100)}</span>
              <span class="text-lg text-ink-400 mb-1">/ 100</span>
              ${perf ? `<span class="ml-auto text-sm text-ink-500">Weight in block: <strong>${fmt((perf.indicator_weight || 0) * 100, 1)}%</strong> · Contribution: <strong>${fmt(perf.weighted_contribution)}</strong></span>` : ''}
            </div>

            <h3 class="text-xs font-semibold text-ink-500 uppercase tracking-wide mb-3">Four Normalization Methods</h3>
            <div class="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-2">
              ${[
          { key: 'robust_minmax', label: 'Robust P5–P95' },
          { key: 'percentile', label: 'Percentile Rank' },
          { key: 'log_robust', label: 'Log + Robust' },
          { key: 'zscore_logistic', label: 'Z → Logistic' }
        ].map(m => `
                <div class="border border-ink-100 rounded-md p-3 bg-ink-50">
                  <div class="text-[11px] text-ink-400">${m.label}</div>
                  <div class="text-lg font-semibold text-ink-900 mt-0.5">${fmt(norm[m.key])}</div>
                </div>
              `).join('')}
            </div>
            <p class="text-[11px] text-ink-400">Normalization is cross-sectional (across countries for the same indicator), not along one country’s history.</p>
          </div>

          <!-- Representative Value Story -->
          <div class="bg-white border border-ink-200 rounded-lg shadow-soft p-5" id="rep-story">
            <h2 class="text-sm font-semibold text-ink-900 mb-1">How the Representative Value Was Formed</h2>
            <p class="text-xs text-ink-500 mb-4">The 25-year series is condensed into one level using four components. The representative value is then normalized across countries.</p>
            <div id="rep-components-body" class="text-sm text-ink-500">Loading components…</div>
            <div class="h-48 mt-4"><canvas id="chart-rep-components"></canvas></div>
          </div>

          <!-- Weight method breakdown -->
          <div class="bg-white border border-ink-200 rounded-lg shadow-soft p-5" id="weight-story">
            <h2 class="text-sm font-semibold text-ink-900 mb-1">Indicator Weight Composition</h2>
            <p class="text-xs text-ink-500 mb-4">Ensemble of Coefficient of Variation (25%), Entropy Weight Method (40%), and CRITIC (35%), renormalised to sum to 1 within the country–block.</p>
            <div id="weight-methods-body" class="text-sm text-ink-500">Loading weight methods…</div>
            <div class="h-48 mt-4"><canvas id="chart-weight-methods"></canvas></div>
          </div>
        ` : ''}

        <!-- Top countries bar chart -->
        <div class="bg-white border border-ink-200 rounded-lg shadow-soft p-4 mb-6">
          <h3 class="text-xs font-semibold text-ink-600 uppercase tracking-wide mb-3">Top Countries on This Indicator (Bar)</h3>
          <div class="h-72"><canvas id="chart-ind-top"></canvas></div>
        </div>

        <!-- Global ranking for this indicator -->
        <div>
          <h2 class="text-sm font-semibold text-ink-900 mb-3">Cross-Country Distribution</h2>
          <p class="text-xs text-ink-500 mb-4">All countries in the ranking universe ordered by their normalized score on this indicator.</p>
          <div class="bg-white border border-ink-200 rounded-lg shadow-soft overflow-hidden max-h-[480px] overflow-y-auto">
            <table class="data-table w-full text-sm">
              <thead>
                <tr class="text-left text-[11px] font-medium text-ink-500 uppercase tracking-wide border-b border-ink-200">
                  <th class="px-4 py-3 w-12">#</th>
                  <th class="px-4 py-3">Country</th>
                  <th class="px-4 py-3 text-right">Indicator Score</th>
                  <th class="px-4 py-3 text-right hidden sm:table-cell">Country Rank</th>
                </tr>
              </thead>
              <tbody>
                ${global.map((g, idx) => `
                  <tr class="country-link" data-country="${g.country}">
                    <td class="px-4 py-2.5 text-ink-400 text-xs">${idx + 1}</td>
                    <td class="px-4 py-2.5 font-medium ${g.country === iso3 ? 'text-accent-600' : 'text-ink-900'}">${countryName(g.country)}${g.country === iso3 ? ' ←' : ''}</td>
                    <td class="px-4 py-2.5 text-right font-semibold ${scoreTextColor(g.score)}">${fmt(g.score)}</td>
                    <td class="px-4 py-2.5 text-right text-ink-500 hidden sm:table-cell">${g.rankInfo ? '#' + g.rankInfo.rank : '—'}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    `;

    el.querySelector('[data-back-country]')?.addEventListener('click', e => navigate('country', { country: e.currentTarget.dataset.backCountry }));
    el.querySelector('[data-nav]')?.addEventListener('click', e => navigate(e.currentTarget.dataset.nav));
    el.querySelectorAll('.country-link').forEach(tr => {
      tr.addEventListener('click', () => navigate('country', { country: tr.dataset.country }));
    });

    setTimeout(() => {
      const top = global.slice(0, 15);
      makeBarChart('chart-ind-top',
        top.map(g => countryName(g.country)),
        top.map(g => g.score || 0),
        { label: 'Indicator score', colorFn: (v) => scoreColorHex(v), max: 100 }
      );

      // Representative components
      if (iso3 && (perf || norm)) {
        const blockNum = (perf && perf.block) || (norm && norm.block);
        const rep = blockNum != null ? getRepComponents(iso3, blockNum, code) : null;
        const repBody = document.getElementById('rep-components-body');
        if (rep && repBody) {
          const components = [
            { key: 'ewma_score', label: 'EWMA (α≈0.20)', weight: '35%', value: rep.ewma_score },
            { key: 'recent_mean', label: 'Recent 5-Year Mean', weight: '25%', value: rep.recent_mean },
            { key: 'theil_sen_level', label: 'Theil–Sen Level', weight: '25%', value: rep.theil_sen_level },
            { key: 'hp_trend', label: 'Hodrick–Prescott Trend', weight: '15%', value: rep.hp_trend }
          ];
          repBody.innerHTML = `
            <div class="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-2">
              ${components.map(c => `
                <div class="border border-ink-100 rounded-md p-3 bg-ink-50">
                  <div class="text-[10px] text-ink-400">${c.label}</div>
                  <div class="text-[10px] text-accent-600 font-medium">${c.weight}</div>
                  <div class="text-sm font-semibold text-ink-900 mt-0.5 font-mono">${formatLargeNumber(c.value)}</div>
                </div>
              `).join('')}
              <div class="border border-accent-200 rounded-md p-3 bg-accent-50">
                <div class="text-[10px] text-accent-700">Representative Value</div>
                <div class="text-[10px] text-accent-600 font-medium">Combined</div>
                <div class="text-sm font-bold text-ink-900 mt-0.5 font-mono">${formatLargeNumber(rep.rep_score)}</div>
              </div>
            </div>
            <p class="text-[11px] text-ink-400">R = 0.35·EWMA + 0.25·Recent5 + 0.25·Theil–Sen + 0.15·HP</p>
          `;
          // Bar of components (normalized to relative magnitude for display)
          const vals = components.map(c => c.value);
          const maxAbs = Math.max(...vals.map(v => Math.abs(v || 0)), 1);
          makeBarChart('chart-rep-components',
            components.map(c => c.label.split(' (')[0]),
            vals.map(v => v == null ? 0 : v),
            { label: 'Component level', horizontal: true, colorFn: () => '#0ea5e9', max: undefined }
          );
        } else if (repBody) {
          repBody.innerHTML = '<p class="text-xs text-ink-400">Representative component values are not available for this country–indicator combination.</p>';
        }

        // Weight methods
        const wm = blockNum != null ? getWeightMethods(iso3, blockNum, code) : null;
        const wmBody = document.getElementById('weight-methods-body');
        if (wm && wmBody) {
          const methods = [
            { label: 'CV Weight', value: wm.cv_weight, share: '25%' },
            { label: 'Entropy Weight', value: wm.entropy_weight, share: '40%' },
            { label: 'CRITIC Weight', value: wm.critic_weight, share: '35%' }
          ];
          wmBody.innerHTML = `
            <div class="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-2">
              ${methods.map(m => `
                <div class="border border-ink-100 rounded-md p-3 bg-ink-50">
                  <div class="text-[10px] text-ink-400">${m.label}</div>
                  <div class="text-[10px] text-ink-500">Ensemble share ${m.share}</div>
                  <div class="text-sm font-semibold text-ink-900 mt-0.5">${fmt((m.value || 0) * 100, 2)}%</div>
                </div>
              `).join('')}
              <div class="border border-accent-200 rounded-md p-3 bg-accent-50">
                <div class="text-[10px] text-accent-700">Final Weight</div>
                <div class="text-[10px] text-accent-600">In this block</div>
                <div class="text-sm font-bold text-ink-900 mt-0.5">${fmt((wm.final_weight || 0) * 100, 2)}%</div>
              </div>
            </div>
          `;
          makeBarChart('chart-weight-methods',
            methods.map(m => m.label),
            methods.map(m => (m.value || 0) * 100),
            { label: 'Weight %', horizontal: true, colorFn: (_, i) => CHART_COLORS[i], max: undefined }
          );
        } else if (wmBody) {
          wmBody.innerHTML = '<p class="text-xs text-ink-400">Weight method breakdown is not available for this combination.</p>';
        }
      }
    }, 50);
  }

  // ─────────────────────────────────────────────
  // RENDER: COMPARE
  // ─────────────────────────────────────────────
  function renderCompare(el) {
    const selection = state.compareSelection || [];

    el.innerHTML = `
      <div class="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
        <h1 class="text-xl sm:text-2xl font-bold text-ink-900 mb-1">Compare Countries</h1>
        <p class="text-sm text-ink-500 mb-6">Select two or more countries from the ranking universe to compare final scores and block performance side by side.</p>

        <div class="bg-white border border-ink-200 rounded-lg p-4 shadow-soft mb-6">
          <label class="text-xs font-medium text-ink-500 uppercase tracking-wide">Add countries</label>
          <div class="mt-2 flex flex-wrap gap-2 items-center">
            <select id="compare-add" class="text-sm border border-ink-200 rounded-md px-3 py-2 bg-white max-w-xs">
              <option value="">Select a country…</option>
              ${state.ranks.map(r => `<option value="${r.country}" ${selection.includes(r.country) ? 'disabled' : ''}>${countryName(r.country)} (#${r.rank})</option>`).join('')}
            </select>
            <button id="compare-add-btn" class="px-3 py-2 text-sm font-medium bg-ink-900 text-white rounded-md hover:bg-ink-800 transition">Add</button>
            ${selection.length ? `<button id="compare-clear" class="px-3 py-2 text-sm text-ink-500 hover:text-ink-800">Clear all</button>` : ''}
          </div>
          <div id="compare-chips" class="mt-3 flex flex-wrap gap-2"></div>
        </div>

        <div id="compare-results"></div>
      </div>
    `;

    function updateChips() {
      const chips = $('#compare-chips');
      chips.innerHTML = selection.map(iso => `
        <span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-ink-100 text-sm text-ink-800">
          ${countryName(iso)}
          <button data-remove="${iso}" class="text-ink-400 hover:text-ink-700 text-xs">×</button>
        </span>
      `).join('');
      chips.querySelectorAll('[data-remove]').forEach(btn => {
        btn.addEventListener('click', () => {
          state.compareSelection = state.compareSelection.filter(c => c !== btn.dataset.remove);
          renderCompare(el);
        });
      });
    }

    function renderResults() {
      const box = $('#compare-results');
      if (selection.length < 2) {
        box.innerHTML = `<p class="text-sm text-ink-400 py-8 text-center">Select at least two countries to compare.</p>`;
        return;
      }

      const rows = state.ranks.filter(r => selection.includes(r.country));
      let html = `
        <div class="bg-white border border-ink-200 rounded-lg shadow-soft overflow-hidden mb-6">
          <div class="overflow-x-auto">
            <table class="w-full text-sm">
              <thead>
                <tr class="text-left text-[11px] font-medium text-ink-500 uppercase tracking-wide border-b border-ink-200 bg-ink-50">
                  <th class="px-4 py-3">Dimension</th>
                  ${rows.map(r => `<th class="px-4 py-3 text-right">${countryName(r.country)}</th>`).join('')}
                </tr>
              </thead>
              <tbody>
                <tr class="border-b border-ink-100">
                  <td class="px-4 py-3 font-medium text-ink-800">Final Score</td>
                  ${rows.map(r => `<td class="px-4 py-3 text-right font-bold ${scoreTextColor(r.final_score)}">${fmt(r.final_score)}</td>`).join('')}
                </tr>
                <tr class="border-b border-ink-100">
                  <td class="px-4 py-3 font-medium text-ink-800">Global Rank</td>
                  ${rows.map(r => `<td class="px-4 py-3 text-right">#${r.rank}</td>`).join('')}
                </tr>
                ${ACTIVE_BLOCKS.map(b => `
                  <tr class="border-b border-ink-50 hover:bg-ink-50">
                    <td class="px-4 py-2.5 text-ink-700">
                      <span class="text-[11px] font-mono text-ink-400 mr-1">B${b}</span>
                      ${BLOCK_META[b]?.short || 'Block ' + b}
                    </td>
                    ${rows.map(r => {
        const s = state.blockPerf[r.country]?.[`Block_${b}`];
        return `<td class="px-4 py-2.5 text-right ${s != null ? scoreTextColor(s) : 'text-ink-300'}">${s != null ? fmt(s) : '—'}</td>`;
      }).join('')}
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        </div>
        <p class="text-[11px] text-ink-400 mb-6">Block scores are country-specific. Weights also differ by country and are not shown in this comparison matrix.</p>

        <div class="bg-white border border-ink-200 rounded-lg shadow-soft p-4">
          <h3 class="text-xs font-semibold text-ink-600 uppercase tracking-wide mb-3">Block Scores Comparison (Grouped Bar)</h3>
          <div class="h-72"><canvas id="chart-compare-bars"></canvas></div>
        </div>
      `;
      box.innerHTML = html;

      // Grouped bar chart
      setTimeout(() => {
        const blockLabels = ACTIVE_BLOCKS.map(b => BLOCK_META[b]?.short || ('B' + b));
        const datasets = rows.map((r, i) => ({
          label: countryName(r.country),
          data: ACTIVE_BLOCKS.map(b => state.blockPerf[r.country]?.['Block_' + b] ?? 0),
          backgroundColor: CHART_COLORS[i % CHART_COLORS.length],
          borderRadius: 2,
          maxBarThickness: 18
        }));
        makeGroupedBarChart('chart-compare-bars', blockLabels, datasets, { max: 100 });
      }, 50);
    }

    updateChips();
    renderResults();

    $('#compare-add-btn')?.addEventListener('click', () => {
      const sel = $('#compare-add');
      const val = sel.value;
      if (val && !state.compareSelection.includes(val)) {
        state.compareSelection.push(val);
        renderCompare(el);
      }
    });
    $('#compare-clear')?.addEventListener('click', () => {
      state.compareSelection = [];
      renderCompare(el);
    });
  }

  // ─────────────────────────────────────────────
  // RENDER: BLOCKS EXPLORER
  // ─────────────────────────────────────────────
  function renderBlocks(el) {
    el.innerHTML = `
      <div class="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
        <h1 class="text-xl sm:text-2xl font-bold text-ink-900 mb-1">Ten Analytical Dimensions</h1>
        <p class="text-sm text-ink-500 mb-6">Each dimension groups related indicators. Weights are country-specific — the same dimension can matter more for one economy than another.</p>
        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
          ${Object.entries(BLOCK_META).map(([num, meta]) => {
      const nInd = Object.values(state.indicators).filter(i => String(i.blocks).split(',').map(s => s.trim()).includes(num)).length;
      return `
              <div class="bg-white border border-ink-200 rounded-lg p-5 shadow-soft">
                <h3 class="text-base font-semibold text-ink-900">${meta.name}</h3>
                <p class="text-xs text-ink-500 mt-1.5 leading-relaxed">${meta.desc}</p>
                <div class="mt-3 text-[11px] text-ink-400">${nInd} indicators in catalogue</div>
              </div>
            `;
    }).join('')}
        </div>

        <div class="bg-white border border-ink-200 rounded-lg shadow-soft p-4">
          <h3 class="text-xs font-semibold text-ink-600 uppercase tracking-wide mb-1">Dimension–Indicator Network</h3>
          <p class="text-[11px] text-ink-400 mb-3">Larger nodes are dimensions; smaller nodes are indicators. Drag to explore how indicators map to dimensions.</p>
          <div id="network-graph" class="h-80 sm:h-96 w-full border border-ink-100 rounded-md bg-ink-50"></div>
        </div>
        <p class="mt-6 text-xs text-ink-400">To explore a block for a specific country, open that country’s profile and select the block.</p>
      </div>
    `;

    setTimeout(() => initBlockNetwork(), 80);
  }

  function initBlockNetwork() {
    const container = document.getElementById('network-graph');
    if (!container || typeof vis === 'undefined') return;

    const nodes = [];
    const edges = [];
    const indSeen = new Set();

    Object.entries(BLOCK_META).forEach(([num, meta]) => {
      nodes.push({
        id: 'B' + num,
        label: meta.short,
        title: meta.name,
        group: 'block',
        value: 18,
        color: { background: CHART_COLORS[(+num - 1) % CHART_COLORS.length], border: '#ff6868' },
        font: { color: '#fff', size: 12, face: 'Inter' }
      });
    });

    Object.values(state.indicators).forEach(ind => {
      const code = ind.indicator_code;
      if (indSeen.has(code)) return;
      indSeen.add(code);
      const shortName = (ind.indicator_name || code).slice(0, 22);
      nodes.push({
        id: code,
        label: shortName,
        title: ind.indicator_name || code,
        group: 'indicator',
        value: 5,
        color: { background: '#6b95cc', border: '#94a3b8' },
        font: { size: 9, color: '#334155', face: 'Inter' }
      });
      String(ind.blocks || '').split(',').map(s => s.trim()).filter(Boolean).forEach(b => {
        edges.push({ from: 'B' + b, to: code, color: { color: '#4f98f0' } });
      });
    });

    const data = { nodes: new vis.DataSet(nodes), edges: new vis.DataSet(edges) };
    const options = {
      nodes: { shape: 'dot', scaling: { min: 8, max: 28 } },
      edges: { smooth: { type: 'continuous', roundness: 0.3 }, width: 1 },
      physics: { stabilization: { iterations: 40 }, barnesHut: { gravitationalConstant: -3000, springLength: 90 } },
      interaction: { hover: true, tooltipDelay: 100 },
      layout: { improvedLayout: true }
    };
    new vis.Network(container, data, options);
  }

  // ─────────────────────────────────────────────
  // RENDER: INDICATORS EXPLORER
  // ─────────────────────────────────────────────
  function renderIndicators(el) {
    const list = Object.values(state.indicators)
      .filter(i => {
        const blocks = String(i.blocks || '').split(',').map(s => s.trim()).filter(Boolean);
        // Keep if it belongs to any active block (exclude pure Block-9-only indicators)
        return blocks.some(b => ACTIVE_BLOCKS.includes(+b));
      })
      .sort((a, b) => (a.indicator_name || '').localeCompare(b.indicator_name || ''));

    el.innerHTML = `
      <div class="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
        <h1 class="text-xl sm:text-2xl font-bold text-ink-900 mb-1">Indicator Explorer</h1>
        <p class="text-sm text-ink-500 mb-5">Searchable catalogue of selected indicators used in the ranking framework.</p>

        <div class="flex flex-col sm:flex-row gap-3 mb-5">
          <input id="ind-search" type="search" placeholder="Search by name or code…"
                 class="flex-1 max-w-md px-3 py-2 text-sm border border-ink-200 rounded-md bg-white focus:outline-none focus:ring-2 focus:ring-accent-500/30" />
          <select id="ind-block-filter" class="text-sm border border-ink-200 rounded-md px-3 py-2 bg-white">
            <option value="">All blocks</option>
            ${Object.entries(BLOCK_META).map(([n, m]) => `<option value="${n}">Block ${n}: ${m.short}</option>`).join('')}
          </select>
        </div>

        <div class="bg-white border border-ink-200 rounded-lg shadow-soft overflow-hidden">
          <div class="overflow-x-auto max-h-[600px] overflow-y-auto">
            <table class="data-table w-full text-sm">
              <thead>
                <tr class="text-left text-[11px] font-medium text-ink-500 uppercase tracking-wide border-b border-ink-200">
                  <th class="px-4 py-3">Indicator</th>
                  <th class="px-4 py-3">Code</th>
                  <th class="px-4 py-3">Block(s)</th>
                </tr>
              </thead>
              <tbody id="ind-tbody"></tbody>
            </table>
          </div>
        </div>
      </div>
    `;

    const tbody = $('#ind-tbody');
    const search = $('#ind-search');
    const filter = $('#ind-block-filter');

    function render() {
      const q = (search.value || '').toLowerCase();
      const b = filter.value;
      let data = list.filter(i => {
        const matchQ = !q || (i.indicator_name || '').toLowerCase().includes(q) || i.indicator_code.toLowerCase().includes(q);
        const matchB = !b || String(i.blocks).split(',').map(s => s.trim()).includes(b);
        return matchQ && matchB;
      });
      tbody.innerHTML = data.map(i => `
        <tr class="ind-link" data-code="${i.indicator_code}">
          <td class="px-4 py-2.5 font-medium text-ink-900">${i.indicator_name || '—'}</td>
          <td class="px-4 py-2.5 font-mono text-xs text-ink-500">${i.indicator_code}</td>
          <td class="px-4 py-2.5 text-ink-600">${i.blocks || '—'}</td>
        </tr>
      `).join('');
      tbody.querySelectorAll('.ind-link').forEach(tr => {
        tr.addEventListener('click', () => navigate('indicator', { indicator: tr.dataset.code }));
      });
    }
    search.addEventListener('input', render);
    filter.addEventListener('change', render);
    render();
  }


  // ─────────────────────────────────────────────
  // Intelligence: regional groups, drivers, clusters
  // ─────────────────────────────────────────────
  function countriesInRegion(regionCode) {
    return state.ranks.filter(r => (state.countries[r.country]?.region || '') === regionCode);
  }

  function regionStats(regionCode) {
    const list = countriesInRegion(regionCode);
    if (!list.length) return null;
    const scores = list.map(r => r.final_score);
    const mean = scores.reduce((a, b) => a + b, 0) / scores.length;
    const sorted = [...list].sort((a, b) => a.rank - b.rank);
    // Dimension means
    const dimMeans = {};
    ACTIVE_BLOCKS.forEach(b => {
      const vals = list.map(r => state.blockPerf[r.country]?.['Block_' + b]).filter(v => v != null && v > 0);
      dimMeans[b] = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0;
    });
    // Anomalies: |score - mean| / std
    const variance = scores.reduce((s, x) => s + (x - mean) ** 2, 0) / scores.length;
    const std = Math.sqrt(variance) || 1;
    const anomalies = list.map(r => ({
      country: r.country,
      score: r.final_score,
      z: (r.final_score - mean) / std,
      rank: r.rank
    })).filter(a => Math.abs(a.z) >= 1.25).sort((a, b) => Math.abs(b.z) - Math.abs(a.z));

    return { list, mean, std, top: sorted[0], bottom: sorted[sorted.length - 1], dimMeans, anomalies, n: list.length };
  }

  /** Leave-one-dimension-out: approximate rank drivers for a country */
  function rankDrivers(iso3) {
    const bp = state.blockPerf[iso3] || {};
    const bw = state.blockWeights[iso3] || {};
    const base = state.ranks.find(r => r.country === iso3)?.final_score;
    if (base == null) return [];
    const drivers = ACTIVE_BLOCKS.map(b => {
      const score = bp['Block_' + b] || 0;
      const w = bw['Block_' + b] || 0;
      const contrib = score * w;
      // Score if this dimension contributed 0
      const without = base - contrib;
      return {
        block: b,
        name: BLOCK_META[b]?.name || ('D' + b),
        short: BLOCK_META[b]?.short || ('D' + b),
        score, weight: w, contrib,
        impact: base - without // same as contrib
      };
    }).sort((a, b) => b.impact - a.impact);
    return drivers;
  }

  /** Simple k-means style clustering on block-score vectors (k=4), pure JS */
  function clusterCountries(k = 5) {
    const vectors = state.ranks.map(r => {
      const bp = state.blockPerf[r.country] || {};
      const vec = ACTIVE_BLOCKS.map(b => bp['Block_' + b] || 0);
      return { country: r.country, rank: r.rank, score: r.final_score, vec };
    });
    if (vectors.length < k) return [];
    // init centroids: spread by rank
    let centroids = [];
    for (let i = 0; i < k; i++) {
      const idx = Math.floor(i * (vectors.length - 1) / (k - 1));
      centroids.push([...vectors[idx].vec]);
    }
    let assignments = new Array(vectors.length).fill(0);
    for (let iter = 0; iter < 15; iter++) {
      // assign
      assignments = vectors.map(v => {
        let best = 0, bestD = Infinity;
        centroids.forEach((c, ci) => {
          const d = c.reduce((s, x, j) => s + (x - v.vec[j]) ** 2, 0);
          if (d < bestD) { bestD = d; best = ci; }
        });
        return best;
      });
      // update
      const newC = centroids.map(() => ACTIVE_BLOCKS.map(() => 0));
      const counts = centroids.map(() => 0);
      vectors.forEach((v, i) => {
        const a = assignments[i];
        counts[a]++;
        v.vec.forEach((x, j) => { newC[a][j] += x; });
      });
      centroids = newC.map((c, i) => counts[i] ? c.map(x => x / counts[i]) : centroids[i]);
    }
    const clusters = centroids.map((c, i) => ({
      id: i,
      centroid: c,
      members: vectors.filter((_, j) => assignments[j] === i).sort((a, b) => a.rank - b.rank)
    }));
    return clusters.filter(c => c.members.length);
  }

  function saveWorkspaces() {
    localStorage.setItem('crs-workspaces', JSON.stringify(state.workspaces));
    if (state.activeWorkspaceId) localStorage.setItem('crs-active-ws', state.activeWorkspaceId);
  }

  function canEdit() {
    return true;
  }

  function canAdmin() {
    return true;
  }

  // ─────────────────────────────────────────────
  // RENDER: REGIONS (ML regional intelligence)
  // ─────────────────────────────────────────────
  function renderRegions(el) {
    const regions = [...new Set(state.ranks.map(r => state.countries[r.country]?.region).filter(Boolean))].sort();
    const selected = state._regionSelected || regions[0];
    state._regionSelected = selected;
    const stats = regionStats(selected);
    const clusters = clusterCountries(5);

    el.innerHTML = `
      <div class="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
        <div class="mb-6">
          <p class="text-[11px] font-semibold text-accent-600 uppercase tracking-widest mb-1">Regional intelligence</p>
          <h1 class="text-xl sm:text-2xl font-bold text-ink-900">Regions & peer structure</h1>
          <p class="text-sm text-ink-500 mt-1 max-w-2xl">Stock-market economies grouped by World Bank region. Within each region: local ranking, dimension profile, and statistical outliers versus regional peers.</p>
        </div>

        <div class="flex flex-wrap gap-2 mb-6">
          ${regions.map(reg => `
            <button data-region="${reg}" class="region-chip px-3 py-1.5 rounded-full text-xs font-medium border transition ${reg === selected ? 'bg-ink-900 text-white border-ink-900' : 'bg-white text-ink-600 border-ink-200 hover:border-ink-400'}">
              ${REGION_NAMES[reg] || reg} (${countriesInRegion(reg).length})
            </button>
          `).join('')}
        </div>

        ${stats ? `
          <div class="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
            <div class="card-premium p-4">
              <p class="text-[10px] text-ink-400 uppercase">Economies</p>
              <p class="text-xl font-bold text-ink-900 stat-value">${stats.n}</p>
            </div>
            <div class="card-premium p-4">
              <p class="text-[10px] text-ink-400 uppercase">Mean score</p>
              <p class="text-xl font-bold ${scoreTextColor(stats.mean)} stat-value">${fmt(stats.mean)}</p>
            </div>
            <div class="card-premium p-4">
              <p class="text-[10px] text-ink-400 uppercase">Regional leader</p>
              <p class="text-sm font-semibold text-ink-900">${countryName(stats.top.country)}</p>
              <p class="text-[11px] text-ink-400">#${stats.top.rank} global · ${fmt(stats.top.final_score)}</p>
            </div>
            <div class="card-premium p-4">
              <p class="text-[10px] text-ink-400 uppercase">Regional lowest</p>
              <p class="text-sm font-semibold text-ink-900">${countryName(stats.bottom.country)}</p>
              <p class="text-[11px] text-ink-400">#${stats.bottom.rank} global · ${fmt(stats.bottom.final_score)}</p>
            </div>
          </div>

          <div class="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
            <div class="card-premium p-4">
              <h3 class="text-xs font-semibold text-ink-600 uppercase tracking-wide mb-3">Regional ranking</h3>
              <div class="max-h-72 overflow-y-auto space-y-1">
                ${[...stats.list].sort((a, b) => a.rank - b.rank).map((r, i) => `
                  <button data-country="${r.country}" class="country-link w-full flex items-center gap-2 px-2 py-1.5 rounded hover:bg-ink-50 text-left text-sm">
                    <span class="text-ink-400 w-5 text-xs">${i + 1}</span>
                    <span class="flex-1 font-medium text-ink-800 truncate">${countryName(r.country)}</span>
                    <span class="text-xs text-ink-400">#${r.rank}</span>
                    <span class="font-semibold ${scoreTextColor(r.final_score)} w-12 text-right">${fmt(r.final_score)}</span>
                  </button>
                `).join('')}
              </div>
            </div>
            <div class="card-premium p-4">
              <h3 class="text-xs font-semibold text-ink-600 uppercase tracking-wide mb-3">Dimension profile (regional mean)</h3>
              <div class="h-64"><canvas id="chart-region-dims"></canvas></div>
            </div>
          </div>

          <div class="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
            <div class="card-premium p-4">
              <h3 class="text-xs font-semibold text-ink-600 uppercase tracking-wide mb-1">Peer outliers (|z| ≥ 1.25)</h3>
              <p class="text-[11px] text-ink-400 mb-3">Score far from regional mean — structurally different from peers in the same region.</p>
              ${stats.anomalies.length ? `
                <div class="space-y-2">
                  ${stats.anomalies.slice(0, 8).map(a => `
                    <button data-country="${a.country}" class="country-link w-full flex items-center justify-between px-3 py-2 rounded-lg border border-ink-100 hover:border-accent-300 text-left">
                      <span class="text-sm font-medium text-ink-800">${countryName(a.country)}</span>
                      <span class="text-xs ${a.z > 0 ? 'text-emerald-600' : 'text-rose-600'}">z = ${a.z > 0 ? '+' : ''}${fmt(a.z, 2)} · score ${fmt(a.score)}</span>
                    </button>
                  `).join('')}
                </div>
              ` : '<p class="text-sm text-ink-400">No strong outliers in this region.</p>'}
            </div>
            <div class="card-premium p-4">
              <h3 class="text-xs font-semibold text-ink-600 uppercase tracking-wide mb-1">Global profile clusters</h3>
              <p class="text-[11px] text-ink-400 mb-3">k-means on 10 dimension scores (k=5). Countries in the same cluster share a similar structural profile. Tap a cluster to see full membership.</p>
              <div class="space-y-3 max-h-72 overflow-y-auto">
                ${clusters.map((c, i) => `
                  <button type="button" class="cluster-card w-full text-left border border-ink-100 rounded-lg p-3 hover:border-accent-400 hover:bg-ink-50 transition" data-cluster="${i}">
                    <div class="text-xs font-semibold text-ink-700 mb-1">Cluster ${i + 1} · ${c.members.length} economies</div>
                    <div class="text-[11px] text-ink-500 leading-relaxed">
                      ${c.members.slice(0, 6).map(m => countryName(m.country)).join(', ')}${c.members.length > 6 ? '…' : ''}
                    </div>
                  </button>
                `).join('')}
              </div>
            </div>
            <div id="cluster-modal-root"></div>
          </div>
        ` : '<p class="text-ink-400">No data for this region.</p>'}
      </div>
    `;

    el.querySelectorAll('.region-chip').forEach(btn => {
      btn.addEventListener('click', () => {
        state._regionSelected = btn.dataset.region;
        renderRegions(el);
        el.classList.add('active');
      });
    });
    el.querySelectorAll('.country-link').forEach(btn => {
      btn.addEventListener('click', () => navigate('country', { country: btn.dataset.country }));
    });

    el.querySelectorAll('.cluster-card').forEach(btn => {
      btn.addEventListener('click', () => {
        const idx = +btn.dataset.cluster;
        const c = clusters[idx];
        if (!c) return;
        const root = el.querySelector('#cluster-modal-root');
        if (!root) return;
        root.innerHTML = `
          <div class="modal-backdrop" id="cluster-backdrop">
            <div class="modal-panel" role="dialog" aria-modal="true">
              <div class="px-4 py-3 border-b border-ink-100 flex items-center justify-between">
                <div>
                  <div class="text-sm font-semibold text-ink-900">Cluster ${idx + 1}</div>
                  <div class="text-[11px] text-ink-400">${c.members.length} economies with similar dimension profiles</div>
                </div>
                <button type="button" id="cluster-modal-close" class="text-ink-400 hover:text-ink-800 text-lg leading-none px-2">×</button>
              </div>
              <div class="modal-body space-y-0.5">
                ${c.members.map(m => {
          const r = state.ranks.find(x => x.country === m.country);
          return `
                    <button type="button" class="country-pick country-link" data-country="${m.country}">
                      <span class="font-medium text-ink-900">${countryName(m.country)}</span>
                      <span class="text-[11px] text-ink-400 ml-2">${m.country}</span>
                      ${r ? `<span class="float-right text-xs font-semibold ${scoreTextColor(r.final_score)}">${fmt(r.final_score)} · #${r.rank}</span>` : ''}
                    </button>
                  `;
        }).join('')}
              </div>
            </div>
          </div>
        `;
        const close = () => { root.innerHTML = ''; };
        root.querySelector('#cluster-modal-close')?.addEventListener('click', close);
        root.querySelector('#cluster-backdrop')?.addEventListener('click', (e) => {
          if (e.target.id === 'cluster-backdrop') close();
        });
        root.querySelectorAll('.country-pick').forEach(b => {
          b.addEventListener('click', () => {
            close();
            navigate('country', { country: b.dataset.country });
          });
        });
      });
    });

    if (stats) {
      setTimeout(() => {
        const labels = ACTIVE_BLOCKS.map(b => BLOCK_META[b].short);
        const vals = ACTIVE_BLOCKS.map(b => stats.dimMeans[b] || 0);
        makeBarChart('chart-region-dims', labels, vals, {
          horizontal: true, label: 'Mean score', colorFn: (v) => scoreColorHex(v), max: 100
        });
      }, 40);
    }
  }

  // ─────────────────────────────────────────────
  // RENDER: SCENARIO (what-if weights)
  // ─────────────────────────────────────────────
  function renderScenario(el) {
    // Default equal weights if none
    if (!state.scenarioWeights) {
      state.scenarioWeights = {};
      ACTIVE_BLOCKS.forEach(b => { state.scenarioWeights[b] = 1 / ACTIVE_BLOCKS.length; });
    }

    function recomputeScenarioRanks() {
      const w = state.scenarioWeights;
      const wSum = ACTIVE_BLOCKS.reduce((s, b) => s + (w[b] || 0), 0) || 1;
      const rows = state.ranks.map(r => {
        const bp = state.blockPerf[r.country] || {};
        let score = 0;
        ACTIVE_BLOCKS.forEach(b => {
          score += (bp['Block_' + b] || 0) * ((w[b] || 0) / wSum);
        });
        return { country: r.country, originalRank: r.rank, originalScore: r.final_score, scenarioScore: score };
      });
      rows.sort((a, b) => b.scenarioScore - a.scenarioScore);
      rows.forEach((r, i) => { r.scenarioRank = i + 1; r.delta = r.originalRank - r.scenarioRank; });
      return rows;
    }

    const rows = recomputeScenarioRanks();

    el.innerHTML = `
      <div class="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
        <div class="mb-6">
          <p class="text-[11px] font-semibold text-accent-600 uppercase tracking-widest mb-1">What-if analysis</p>
          <h1 class="text-xl sm:text-2xl font-bold text-ink-900">Scenario: custom dimension weights</h1>
          <p class="text-sm text-ink-500 mt-1 max-w-2xl">Adjust how much each dimension contributes to the final score. Ranks recompute instantly using existing dimension scores (country-specific indicator weights stay fixed).</p>
        </div>

        <div class="grid grid-cols-1 lg:grid-cols-5 gap-6">
          <div class="lg:col-span-2 card-premium p-4 space-y-4">
            <h3 class="text-xs font-semibold text-ink-600 uppercase tracking-wide">Dimension weights</h3>
            ${ACTIVE_BLOCKS.map(b => `
              <div>
                <div class="flex justify-between text-xs mb-1">
                  <span class="font-medium text-ink-800">${BLOCK_META[b].name}</span>
                  <span class="text-ink-500 font-mono" id="sw-label-${b}">${fmt((state.scenarioWeights[b] || 0) * 100, 1)}%</span>
                </div>
                <input type="range" min="0" max="100" value="${Math.round((state.scenarioWeights[b] || 0) * 100)}" data-block="${b}" class="scenario-slider w-full accent-sky-600" />
              </div>
            `).join('')}
            <button id="scenario-reset" class="w-full mt-2 px-3 py-2 text-xs font-medium border border-ink-200 rounded-md hover:bg-ink-50">Reset to equal weights</button>
          </div>

          <div class="lg:col-span-3 card-premium overflow-hidden">
            <div class="px-4 py-3 border-b border-ink-100 flex justify-between items-center">
              <h3 class="text-xs font-semibold text-ink-600 uppercase tracking-wide">Scenario ranking</h3>
              <span class="text-[10px] text-ink-400">Δ = original rank − scenario rank (positive = improved)</span>
            </div>
            <div class="max-h-[520px] overflow-y-auto">
              <table class="w-full text-sm">
                <thead class="sticky top-0 bg-ink-50 text-[11px] text-ink-500 uppercase">
                  <tr>
                    <th class="px-3 py-2 text-left">#</th>
                    <th class="px-3 py-2 text-left">Country</th>
                    <th class="px-3 py-2 text-right">Scenario</th>
                    <th class="px-3 py-2 text-right">Original</th>
                    <th class="px-3 py-2 text-right">Δ Rank</th>
                  </tr>
                </thead>
                <tbody id="scenario-tbody">
                  ${rows.map(r => `
                    <tr class="border-t border-ink-50 hover:bg-ink-50 country-link cursor-pointer" data-country="${r.country}">
                      <td class="px-3 py-2 text-ink-400">${r.scenarioRank}</td>
                      <td class="px-3 py-2 font-medium text-ink-900">${countryName(r.country)}</td>
                      <td class="px-3 py-2 text-right font-semibold ${scoreTextColor(r.scenarioScore)}">${fmt(r.scenarioScore)}</td>
                      <td class="px-3 py-2 text-right text-ink-500">#${r.originalRank}</td>
                      <td class="px-3 py-2 text-right ${r.delta > 0 ? 'text-emerald-600' : r.delta < 0 ? 'text-rose-600' : 'text-ink-400'}">${r.delta > 0 ? '+' : ''}${r.delta}</td>
                    </tr>
                  `).join('')}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    `;

    function refreshTable() {
      // normalize weights from sliders
      const raw = {};
      let sum = 0;
      el.querySelectorAll('.scenario-slider').forEach(sl => {
        raw[+sl.dataset.block] = +sl.value;
        sum += +sl.value;
      });
      if (sum <= 0) sum = 1;
      ACTIVE_BLOCKS.forEach(b => {
        state.scenarioWeights[b] = (raw[b] || 0) / sum;
        const lab = el.querySelector('#sw-label-' + b);
        if (lab) lab.textContent = fmt(state.scenarioWeights[b] * 100, 1) + '%';
      });
      const newRows = recomputeScenarioRanks();
      const tbody = el.querySelector('#scenario-tbody');
      tbody.innerHTML = newRows.map(r => `
        <tr class="border-t border-ink-50 hover:bg-ink-50 country-link cursor-pointer" data-country="${r.country}">
          <td class="px-3 py-2 text-ink-400">${r.scenarioRank}</td>
          <td class="px-3 py-2 font-medium text-ink-900">${countryName(r.country)}</td>
          <td class="px-3 py-2 text-right font-semibold ${scoreTextColor(r.scenarioScore)}">${fmt(r.scenarioScore)}</td>
          <td class="px-3 py-2 text-right text-ink-500">#${r.originalRank}</td>
          <td class="px-3 py-2 text-right ${r.delta > 0 ? 'text-emerald-600' : r.delta < 0 ? 'text-rose-600' : 'text-ink-400'}">${r.delta > 0 ? '+' : ''}${r.delta}</td>
        </tr>
      `).join('');
      tbody.querySelectorAll('.country-link').forEach(tr => {
        tr.addEventListener('click', () => navigate('country', { country: tr.dataset.country }));
      });
    }

    el.querySelectorAll('.scenario-slider').forEach(sl => {
      sl.addEventListener('input', refreshTable);
    });
    el.querySelector('#scenario-reset')?.addEventListener('click', () => {
      state.scenarioWeights = null;
      renderScenario(el);
      el.classList.add('active');
    });
    el.querySelectorAll('.country-link').forEach(tr => {
      tr.addEventListener('click', () => navigate('country', { country: tr.dataset.country }));
    });
  }

  // ─────────────────────────────────────────────
  // RENDER: WORKSPACE
  // ─────────────────────────────────────────────
  function renderWorkspace(el) {
    const ws = state.workspaces;
    const active = ws.find(w => w.id === state.activeWorkspaceId);

    el.innerHTML = `
      <div class="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
        <div class="mb-6 flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
          <div>
            <p class="text-[11px] font-semibold text-accent-600 uppercase tracking-widest mb-1">Saved peer sets</p>
            <h1 class="text-xl sm:text-2xl font-bold text-ink-900">Workspace</h1>
            <p class="text-sm text-ink-500 mt-1">Save custom groups of stock-market economies (e.g. ASEAN peers, G7, EM high-beta) and reopen them anytime.</p>
          </div>
          ${canEdit() ? `<button id="ws-create" class="px-4 py-2 text-sm font-semibold bg-ink-900 text-white rounded-lg hover:bg-ink-800">New peer set</button>` : ''}
        </div>

        <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div class="card-premium p-4">
            <h3 class="text-xs font-semibold text-ink-600 uppercase tracking-wide mb-3">Your peer sets</h3>
            ${ws.length ? ws.map(w => `
              <button data-ws="${w.id}" class="ws-item w-full text-left px-3 py-2.5 rounded-lg mb-1 border ${w.id === state.activeWorkspaceId ? 'border-accent-400 bg-accent-50' : 'border-transparent hover:bg-ink-50'}">
                <div class="text-sm font-medium text-ink-900">${w.name}</div>
                <div class="text-[11px] text-ink-400">${(w.countries || []).length} countries</div>
              </button>
            `).join('') : '<p class="text-sm text-ink-400">No peer sets yet. Create one to start.</p>'}
          </div>

          <div class="lg:col-span-2 card-premium p-4">
            ${active ? `
              <div class="flex items-center justify-between mb-4">
                <h3 class="text-sm font-semibold text-ink-900">${active.name}</h3>
                <div class="flex gap-2">
                  ${canEdit() ? `<button id="ws-add" class="text-xs font-medium text-accent-600">Add country</button>` : ''}
                  ${canEdit() ? `<button id="ws-delete" class="text-xs font-medium text-rose-600">Delete set</button>` : ''}
                </div>
              </div>
              <div class="space-y-1 mb-4">
                ${(active.countries || []).map(iso => {
      const r = state.ranks.find(x => x.country === iso);
      return `
                    <div class="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-ink-50">
                      <button data-country="${iso}" class="country-link flex-1 text-left text-sm font-medium text-ink-800">${countryName(iso)}</button>
                      <span class="text-xs text-ink-400">${r ? '#' + r.rank : ''}</span>
                      <span class="text-xs font-semibold ${r ? scoreTextColor(r.final_score) : ''}">${r ? fmt(r.final_score) : ''}</span>
                      ${canEdit() ? `<button data-remove="${iso}" class="ws-remove text-ink-300 hover:text-rose-500 text-xs">×</button>` : ''}
                    </div>
                  `;
    }).join('') || '<p class="text-sm text-ink-400">Empty set — add countries.</p>'}
              </div>
              ${(active.countries || []).length >= 2 ? `
                <button id="ws-compare" class="px-4 py-2 text-sm font-medium border border-ink-200 rounded-md hover:bg-ink-50">Compare this peer set</button>
              ` : ''}
            ` : `<p class="text-sm text-ink-400 py-8 text-center">Select or create a peer set.</p>`}
          </div>
        </div>
        ${state.role === 'viewer' ? `<p class="mt-4 text-xs text-ink-400">Viewer role is read-only. Switch to Analyst to create peer sets.</p>` : ''}
      </div>
    `;

    el.querySelectorAll('.ws-item').forEach(btn => {
      btn.addEventListener('click', () => {
        state.activeWorkspaceId = btn.dataset.ws;
        saveWorkspaces();
        renderWorkspace(el);
        el.classList.add('active');
      });
    });
    el.querySelector('#ws-create')?.addEventListener('click', () => {
      const name = prompt('Peer set name (e.g. ASEAN exchanges)');
      if (!name) return;
      const id = 'ws_' + Date.now();
      state.workspaces.push({ id, name, countries: [] });
      state.activeWorkspaceId = id;
      saveWorkspaces();
      renderWorkspace(el);
      el.classList.add('active');
    });
    el.querySelector('#ws-delete')?.addEventListener('click', () => {
      if (!confirm('Delete this peer set?')) return;
      state.workspaces = state.workspaces.filter(w => w.id !== state.activeWorkspaceId);
      state.activeWorkspaceId = state.workspaces[0]?.id || null;
      saveWorkspaces();
      renderWorkspace(el);
      el.classList.add('active');
    });
    el.querySelector('#ws-add')?.addEventListener('click', () => {
      const q = prompt('ISO3 or country name');
      if (!q) return;
      const ql = q.toLowerCase();
      const match = state.ranks.find(r => r.country.toLowerCase() === ql || countryName(r.country).toLowerCase().includes(ql));
      if (!match) { alert('Country not found in ranking universe'); return; }
      const w = state.workspaces.find(x => x.id === state.activeWorkspaceId);
      if (w && !w.countries.includes(match.country)) {
        w.countries.push(match.country);
        saveWorkspaces();
        renderWorkspace(el);
        el.classList.add('active');
      }
    });
    el.querySelectorAll('.ws-remove').forEach(btn => {
      btn.addEventListener('click', () => {
        const w = state.workspaces.find(x => x.id === state.activeWorkspaceId);
        if (w) {
          w.countries = w.countries.filter(c => c !== btn.dataset.remove);
          saveWorkspaces();
          renderWorkspace(el);
          el.classList.add('active');
        }
      });
    });
    el.querySelector('#ws-compare')?.addEventListener('click', () => {
      const w = state.workspaces.find(x => x.id === state.activeWorkspaceId);
      if (w) {
        state.compareSelection = [...w.countries];
        navigate('compare');
      }
    });
    el.querySelectorAll('.country-link').forEach(btn => {
      btn.addEventListener('click', () => navigate('country', { country: btn.dataset.country }));
    });
  }

  // ─────────────────────────────────────────────
  // RENDER: METHODOLOGY
  // ─────────────────────────────────────────────
  function renderMethodology(el) {
    el.innerHTML = `
      <div class="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12">
        <p class="text-[11px] font-semibold text-accent-600 uppercase tracking-widest mb-2">Transparent framework</p>
        <h1 class="text-2xl sm:text-3xl font-bold text-ink-900 tracking-tight mb-2">Methodology</h1>
        <p class="text-ink-500 text-sm mb-10 leading-relaxed">Every score on this platform is produced by a fixed, auditable pipeline. No black-box model replaces the hierarchy below.</p>

        <div class="space-y-8 text-sm text-ink-700 leading-relaxed">
          <section>
            <h2 class="text-base font-semibold text-ink-900 mb-2">1. Universe</h2>
            <p>Start from World Bank economies. Keep only countries with a listed stock exchange (${state.ranks.length} economies). All ranking, comparison, and regional analysis is restricted to this set.</p>
          </section>
          <section>
            <h2 class="text-base font-semibold text-ink-900 mb-2">2. Indicators</h2>
            <p>From ~1,498 World Bank indicators, ${Object.keys(state.indicators).length} are selected using objective information measures (coefficient of variation, entropy weight method, CRITIC). Low-signal or redundant series are discarded.</p>
          </section>
          <section>
            <h2 class="text-base font-semibold text-ink-900 mb-2">3. Dimensions</h2>
            <p>Selected indicators are grouped into <strong>10 named dimensions</strong> (Macroeconomic Structure, Monetary & External Stability, Trade & Investment, Financial Markets & Banking, Education, Health, Labour & Employment, Infrastructure & Connectivity, Environment & Energy, Social Equity & Demography).</p>
          </section>
          <section>
            <h2 class="text-base font-semibold text-ink-900 mb-2">4. Representative value</h2>
            <p>Each 25-year series (2000–2026) is reduced to one level:</p>
            <p class="font-mono text-xs bg-ink-50 border border-ink-100 rounded-md px-3 py-2 mt-2">R = 0.35·EWMA + 0.25·Recent5 + 0.25·Theil–Sen + 0.15·HP trend</p>
          </section>
          <section>
            <h2 class="text-base font-semibold text-ink-900 mb-2">5. Cross-sectional normalisation</h2>
            <p>Representative values are scored <em>across countries for the same indicator</em> (not along one country’s history). Four methods are averaged: Robust P5–P95 min–max, percentile rank, log-robust min–max, z-score → logistic. Direction (beneficial / adverse) is respected. Result ∈ [0, 100].</p>
          </section>
          <section>
            <h2 class="text-base font-semibold text-ink-900 mb-2">6. Weights</h2>
            <p>Within each country–dimension, indicator weights are an ensemble: CV (25%) + Entropy (40%) + CRITIC (35%), renormalised to 1. Dimension weights are derived from shortlist information mass (country-specific).</p>
          </section>
          <section>
            <h2 class="text-base font-semibold text-ink-900 mb-2">7. Aggregation</h2>
            <p class="font-mono text-xs bg-ink-50 border border-ink-100 rounded-md px-3 py-2">DimensionScore = Σ (wᵢ · Sᵢ) / Σ wᵢ<br/>FinalScore = Σ (W_d · DimensionScore_d)</p>
            <p class="mt-2">Countries are ordered by FinalScore descending to produce the official rank list.</p>
          </section>
          <section>
            <h2 class="text-base font-semibold text-ink-900 mb-2">8. Regional intelligence</h2>
            <p>Regions follow World Bank codes. Within-region means, z-score outliers, and global k-means clusters on dimension-score vectors support peer comparison — they do not replace the official global rank.</p>
          </section>
          <section class="border-t border-ink-200 pt-6">
            <p class="text-xs text-ink-400">This product is a structural benchmarking tool for stock-market economies. It is not investment advice. Scores depend on World Bank data availability and the published methodology version.</p>
          </section>
        </div>
      </div>
    `;
  }

  // ─────────────────────────────────────────────
  // RENDER: API PLAYGROUND
  // ─────────────────────────────────────────────
  function renderApi(el) {
    const samples = {
      ranks: state.ranks.slice(0, 3),
      country: {
        iso3: 'USA',
        rank: state.ranks.find(r => r.country === 'USA'),
        dimensions: ACTIVE_BLOCKS.slice(0, 3).map(b => ({
          name: BLOCK_META[b].name,
          score: state.blockPerf['USA']?.['Block_' + b],
          weight: state.blockWeights['USA']?.['Block_' + b]
        }))
      }
    };

    el.innerHTML = `
      <div class="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
        <div class="mb-6">
          <p class="text-[11px] font-semibold text-accent-600 uppercase tracking-widest mb-1">Integration</p>
          <h1 class="text-xl sm:text-2xl font-bold text-ink-900">API surface</h1>
          <p class="text-sm text-ink-500 mt-1 max-w-2xl">Read-only JSON resources that power this product. A future Python backend can expose the same shapes over HTTPS. Below: live samples from the loaded dataset.</p>
        </div>

        <div class="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div class="card-premium p-4">
            <div class="flex items-center justify-between mb-2">
              <code class="text-xs font-mono text-accent-600">GET /api/v1/ranks</code>
              <span class="text-[10px] text-ink-400">Official ranking</span>
            </div>
            <pre class="text-[11px] font-mono bg-ink-900 text-ink-100 rounded-lg p-3 overflow-x-auto max-h-56">${JSON.stringify(samples.ranks, null, 2)}</pre>
          </div>
          <div class="card-premium p-4">
            <div class="flex items-center justify-between mb-2">
              <code class="text-xs font-mono text-accent-600">GET /api/v1/countries/{iso3}</code>
              <span class="text-[10px] text-ink-400">Profile + dimensions</span>
            </div>
            <pre class="text-[11px] font-mono bg-ink-900 text-ink-100 rounded-lg p-3 overflow-x-auto max-h-56">${JSON.stringify(samples.country, null, 2)}</pre>
          </div>
          <div class="card-premium p-4">
            <div class="flex items-center justify-between mb-2">
              <code class="text-xs font-mono text-accent-600">GET /api/v1/regions/{code}</code>
              <span class="text-[10px] text-ink-400">Regional peers</span>
            </div>
            <pre class="text-[11px] font-mono bg-ink-900 text-ink-100 rounded-lg p-3 overflow-x-auto max-h-40">${JSON.stringify({ region: 'EAS', n: countriesInRegion('EAS').length, mean_score: regionStats('EAS')?.mean }, null, 2)}</pre>
          </div>
          <div class="card-premium p-4">
            <div class="flex items-center justify-between mb-2">
              <code class="text-xs font-mono text-accent-600">POST /api/v1/scenario</code>
              <span class="text-[10px] text-ink-400">Custom weights → ranks</span>
            </div>
            <pre class="text-[11px] font-mono bg-ink-900 text-ink-100 rounded-lg p-3 overflow-x-auto max-h-40">${JSON.stringify({ weights: { Macro: 0.2, Finance: 0.25, Health: 0.1 }, note: 'Returns recomputed ranking' }, null, 2)}</pre>
          </div>
        </div>

        <div class="mt-6 card-premium p-4">
          <h3 class="text-xs font-semibold text-ink-600 uppercase tracking-wide mb-2">Planned endpoints</h3>
          <ul class="text-sm text-ink-600 space-y-1 list-disc list-inside">
            <li><code class="text-xs bg-ink-100 px-1 rounded">/api/v1/indicators/{code}</code> — cross-country indicator scores</li>
            <li><code class="text-xs bg-ink-100 px-1 rounded">/api/v1/workspaces</code> — saved peer sets (auth)</li>
            <li><code class="text-xs bg-ink-100 px-1 rounded">/api/v1/drivers/{iso3}</code> — dimension contribution breakdown</li>
            <li><code class="text-xs bg-ink-100 px-1 rounded">/api/v1/clusters</code> — profile cluster membership</li>
          </ul>
          ${!canAdmin() ? '<p class="mt-3 text-[11px] text-ink-400">Admin role can manage API keys once the Python backend is connected.</p>' : '<p class="mt-3 text-[11px] text-emerald-600">Admin: API key management will appear here after backend attach.</p>'}
        </div>
      </div>
    `;
  }

  // ─────────────────────────────────────────────
  // INIT
  // ─────────────────────────────────────────────

  async function init() {
    // Dark mode
    const root = document.documentElement;
    const savedTheme = localStorage.getItem('crs-theme');
    if (savedTheme === 'dark') {
      root.classList.add('dark');
      state.darkMode = true;
      $('#icon-sun')?.classList.remove('hidden');
      $('#icon-moon')?.classList.add('hidden');
    }
    $('#theme-toggle')?.addEventListener('click', () => {
      state.darkMode = !state.darkMode;
      root.classList.toggle('dark', state.darkMode);
      localStorage.setItem('crs-theme', state.darkMode ? 'dark' : 'light');
      $('#icon-sun')?.classList.toggle('hidden', !state.darkMode);
      $('#icon-moon')?.classList.toggle('hidden', state.darkMode);
    });


    // Mobile menu
    $('#mobile-menu-btn')?.addEventListener('click', () => {
      $('#mobile-menu')?.classList.toggle('hidden');
    });

    // Global nav
    document.addEventListener('click', e => {
      const nav = e.target.closest('[data-nav]');
      if (nav && !nav.dataset.country && !nav.dataset.block) {
        e.preventDefault();
        navigate(nav.dataset.nav);
      }
    });

    try {
      await loadAllData();
      $('#app-loading')?.classList.add('hidden');
      $('#views')?.classList.remove('hidden');
      setupSearch();

      const { view, params } = parseHash();
      navigate(view, params);
    } catch (err) {
      console.error(err);
      $('#app-loading').innerHTML = `
        <div class="text-center px-4">
          <p class="text-sm font-medium text-rose-600">Failed to load data</p>
          <p class="text-xs text-ink-500 mt-1">${err.message}</p>
          <p class="text-xs text-ink-400 mt-3">Ensure the data/ folder is accessible relative to this page.</p>
        </div>
      `;
    }
  }

  // Start
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
