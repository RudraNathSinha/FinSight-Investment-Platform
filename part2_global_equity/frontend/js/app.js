/* FinSight v3 */
const API = '/api';
let charts = {};
let state = {
  classroomMode: localStorage.getItem("finsight_classroom") === "1", page: 'dashboard', exchangeCode: null, stock: null, sector: null, country: null };
let acTimer = null;
let acIndex = -1;

const COLORS = ['#0ea5e9','#10b981','#f59e0b','#ef4444','#8b5cf6','#ec4899','#06b6d4','#84cc16','#f97316','#6366f1','#14b8a6','#e11d48'];

function $(id) { return document.getElementById(id); }
function destroyChart(id) { if (charts[id]) { charts[id].destroy(); delete charts[id]; } }
async function fetchJSON(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}
function fmtNum(n) {
  if (n == null || n === '—') return '—';
  if (typeof n === 'number') {
    if (Math.abs(n) >= 1e12) return (n/1e12).toFixed(2)+'T';
    if (Math.abs(n) >= 1e9) return (n/1e9).toFixed(2)+'B';
    if (Math.abs(n) >= 1e6) return (n/1e6).toFixed(2)+'M';
    if (Math.abs(n) >= 1e3) return (n/1e3).toFixed(1)+'K';
    return n.toLocaleString(undefined,{maximumFractionDigits:2});
  }
  return n;
}
function fmtPct(n) {
  if (n == null) return '—';
  const v = (typeof n === 'number' && Math.abs(n) < 2) ? n*100 : n;
  return (v>0?'+':'') + Number(v).toFixed(2) + '%';
}

/** Country flag image (flagcdn). Falls back to empty span. */
const COUNTRY_ISO2 = {
  "United States":"us","United Kingdom":"gb","Germany":"de","India":"in","China":"cn","Japan":"jp",
  "Canada":"ca","Hong Kong":"hk","South Korea":"kr","Taiwan":"tw","Australia":"au","Thailand":"th",
  "Brazil":"br","France":"fr","Italy":"it","Netherlands":"nl","Spain":"es","Switzerland":"ch",
  "Singapore":"sg","Malaysia":"my","Indonesia":"id","Vietnam":"vn","Philippines":"ph","South Africa":"za",
  "Egypt":"eg","Turkey":"tr","Israel":"il","Russia":"ru","Argentina":"ar","Mexico":"mx","Peru":"pe",
  "Colombia":"co","Chile":"cl","United Arab Emirates":"ae","Saudi Arabia":"sa","Qatar":"qa","Kuwait":"kw",
  "Bahrain":"bh","Oman":"om","Pakistan":"pk","Bangladesh":"bd","Sri Lanka":"lk","New Zealand":"nz",
  "Greece":"gr","Hungary":"hu","Czech Republic":"cz","Romania":"ro","Serbia":"rs","Austria":"at",
  "Belgium":"be","Ireland":"ie","Poland":"pl","Sweden":"se","Norway":"no","Denmark":"dk","Finland":"fi",
  "Iceland":"is","Nigeria":"ng","Kenya":"ke","Ghana":"gh","Morocco":"ma","Tunisia":"tn","Portugal":"pt",
  "Jamaica":"jm","Kazakhstan":"kz","Uganda":"ug","Zimbabwe":"zw","Ukraine":"ua","Trinidad and Tobago":"tt",
  "Bulgaria":"bg","Croatia":"hr","Cyprus":"cy","Fiji":"fj","Malta":"mt","Mauritius":"mu","Namibia":"na",
  "Botswana":"bw","Lebanon":"lb","Jordan":"jo","Palestine":"ps","Slovakia":"sk","Slovenia":"si",
  "Luxembourg":"lu","Cote d'Ivoire":"ci","Ivory Coast":"ci","Latvia":"lv","Lithuania":"lt","Slovakia":"sk","Venezuela":"ve","Palestine":"ps","Venezuela":"ve"
};

function rankingDeepLink(countryName) {
  const ISO = {
    "United States":"USA","United Kingdom":"GBR","India":"IND","China":"CHN","Japan":"JPN","Germany":"DEU",
    "France":"FRA","Canada":"CAN","Australia":"AUS","South Korea":"KOR","Hong Kong":"HKG","Taiwan":"TWN",
    "Brazil":"BRA","Mexico":"MEX","Singapore":"SGP","Malaysia":"MYS","Indonesia":"IDN","Thailand":"THA",
    "Vietnam":"VNM","Philippines":"PHL","South Africa":"ZAF","Turkey":"TUR","Egypt":"EGY","Russia":"RUS",
    "Czech Republic":"CZE","Cote d'Ivoire":"CIV","Palestine":"PSE","Venezuela":"VEN","Slovakia":"SVK",
    "Lithuania":"LTU","Latvia":"LVA","Israel":"ISR","Saudi Arabia":"SAU","United Arab Emirates":"ARE",
    "Poland":"POL","Sweden":"SWE","Norway":"NOR","Switzerland":"CHE","Netherlands":"NLD","Spain":"ESP",
    "Italy":"ITA","Argentina":"ARG","Chile":"CHL","Colombia":"COL","Peru":"PER","Nigeria":"NGA",
    "Kenya":"KEN","Pakistan":"PAK","Bangladesh":"BGD","Sri Lanka":"LKA","New Zealand":"NZL","Greece":"GRC",
    "Hungary":"HUN","Romania":"ROU","Austria":"AUT","Belgium":"BEL","Ireland":"IRL","Denmark":"DNK",
    "Finland":"FIN","Portugal":"PRT","Qatar":"QAT","Kuwait":"KWT","Bahrain":"BHR"
  };
  const iso = ISO[countryName];
  return iso ? `/country-ranking/#country/${iso}` : '/country-ranking/';
}

function countryFlag(name) {
  const iso = COUNTRY_ISO2[name];
  if (!iso) return `<span class="inline-block w-5 text-center">🏳️</span>`;
  return `<img src="https://flagcdn.com/24x18/${iso}.png" alt="${name}" class="inline-block w-5 h-3.5 rounded-sm object-cover" loading="lazy" />`;
}

/* Theme */
function toggleTheme() {
  const html = document.documentElement;
  const next = html.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
  html.setAttribute('data-theme', next);
  html.classList.toggle('dark', next === 'dark');
  $('theme-icon').textContent = next === 'dark' ? '☀' : '☾';
  localStorage.setItem('finsight-theme', next);
}
(function initTheme() {
  const t = localStorage.getItem('finsight-theme') || 'dark';
  document.documentElement.setAttribute('data-theme', t);
  document.documentElement.classList.toggle('dark', t === 'dark');
  setTimeout(() => { if ($('theme-icon')) $('theme-icon').textContent = t === 'dark' ? '☀' : '☾'; }, 0);
})();

function toggleSidebar(open) {
  const sb = $('sidebar'), ov = $('sidebar-overlay');
  if (open) { sb.classList.remove('-translate-x-full'); ov.classList.remove('hidden'); }
  else { sb.classList.add('-translate-x-full'); ov.classList.add('hidden'); }
}

function setActiveNav(page) {
  document.querySelectorAll('.sidebar-link').forEach(el => {
    el.classList.toggle('active', el.dataset.page === page);
  });
}

/* ========== Global Search Autocomplete ========== */
function onSearchInput(val) {
  clearTimeout(acTimer);
  const dd = $('ac-dropdown');
  if (!val || val.length < 1) { dd.classList.add('hidden'); return; }
  acTimer = setTimeout(async () => {
    try {
      const d = await fetchJSON(`${API}/autocomplete?q=${encodeURIComponent(val)}&limit=12`);
      if (!d.results.length) {
        dd.innerHTML = `<div class="px-4 py-3 text-sm text-muted">No matches</div>`;
        dd.classList.remove('hidden');
        return;
      }
      acIndex = -1;
      dd.innerHTML = d.results.map((r, i) => `
        <div class="ac-item px-4 py-2.5 cursor-pointer text-sm border-b border-app" data-idx="${i}"
          onclick='selectAC(${JSON.stringify(r).replace(/'/g,"&#39;")})'>
          <span class="font-mono text-brand-400">${r.symbol}</span>
          <span class="ml-2">${r.company_name || ''}</span>
          <span class="block text-xs text-muted mt-0.5">${r.stock_exchange || ''} · ${r.country || ''}</span>
        </div>`).join('');
      dd.classList.remove('hidden');
    } catch (e) { dd.classList.add('hidden'); }
  }, 180);
}
function onSearchKey(e) {
  const dd = $('ac-dropdown');
  const items = dd.querySelectorAll('.ac-item');
  if (e.key === 'ArrowDown') {
    e.preventDefault();
    acIndex = Math.min(acIndex + 1, items.length - 1);
    items.forEach((el, i) => el.classList.toggle('active', i === acIndex));
  } else if (e.key === 'ArrowUp') {
    e.preventDefault();
    acIndex = Math.max(acIndex - 1, 0);
    items.forEach((el, i) => el.classList.toggle('active', i === acIndex));
  } else if (e.key === 'Enter') {
    e.preventDefault();
    if (acIndex >= 0 && items[acIndex]) items[acIndex].click();
    else if ($('global-search').value.trim()) navigate('screener');
  } else if (e.key === 'Escape') {
    dd.classList.add('hidden');
  }
}
function selectAC(r) {
  $('ac-dropdown').classList.add('hidden');
  $('global-search').value = r.symbol;
  openStockModal(r);
}
document.addEventListener('click', (e) => {
  if (!$('global-search')?.contains(e.target) && !$('ac-dropdown')?.contains(e.target)) {
    $('ac-dropdown')?.classList.add('hidden');
  }
});

/* ========== Navigation ========== */
function navigate(page, params = {}, opts = {}) {
  state.page = page;
  Object.assign(state, params);
  const navMap = { dashboard:'dashboard', exchanges:'exchanges', countries:'countries', sectors:'sectors', industries:'industries', screener:'screener',
    compare:'compare', report:'report',
    'country-page':'countries', 'exchange-page':'exchanges', 'sector-page':'sectors', 'industry-page':'industries', analysis:'screener' };
  setActiveNav(navMap[page] || page);
  toggleSidebar(false);
  // browser history (Part 11)
  if (!opts.skipHistory) {
    const q = new URLSearchParams();
    q.set('page', page);
    if (params.country) q.set('country', params.country);
    if (params.exchangeCode) q.set('exchange', params.exchangeCode);
    if (params.sector) q.set('sector', params.sector);
    if (params.industry) q.set('industry', params.industry);
    if (params.stock?.symbol) q.set('symbol', params.stock.symbol);
    if (params.stock?.exchange_code) q.set('ex', params.stock.exchange_code);
    const url = location.pathname + '?' + q.toString();
    if (opts.replace) history.replaceState({ page, params }, '', url);
    else history.pushState({ page, params }, '', url);
  }
  const content = $('content');
  content.innerHTML = '<div class="flex justify-center py-20"><div class="loader"></div></div>';
  content.classList.add('fade');
  if (page === 'dashboard') renderDashboard();
  else if (page === 'exchanges') renderExchangesList();
  else if (page === 'countries') renderCountriesList();
  else if (page === 'sectors') renderSectorsList();
  else if (page === 'industries') renderIndustriesList();
  else if (page === 'screener') renderScreener();
  else if (page === 'compare') renderComparePage();
  else if (page === 'report') renderReportPage();
  else if (page === 'country-page') renderCountryPage();
  else if (page === 'exchange-page') renderExchangePage();
  else if (page === 'sector-page') renderSectorPage();
  else if (page === 'industry-page') renderIndustryPage();
  else if (page === 'analysis') renderAnalysis();
}

window.addEventListener('popstate', (ev) => {
  const st = ev.state;
  if (st && st.page) navigate(st.page, st.params || {}, { skipHistory: true });
  else {
    const sp = new URLSearchParams(location.search);
    const page = sp.get('page') || 'dashboard';
    const params = {};
    if (sp.get('country')) params.country = sp.get('country');
    if (sp.get('exchange')) params.exchangeCode = sp.get('exchange');
    if (sp.get('sector')) params.sector = sp.get('sector');
    if (sp.get('industry')) params.industry = sp.get('industry');
    if (sp.get('symbol')) params.stock = { symbol: sp.get('symbol'), exchange_code: sp.get('ex') || '' };
    navigate(page, params, { skipHistory: true });
  }
});

/* ========== LIST MODALS ========== */
function closeListModal() { $('list-modal').classList.add('hidden'); $('list-modal').classList.remove('flex'); }
function closeSummaryModal() { $('summary-modal').classList.add('hidden'); $('summary-modal').classList.remove('flex'); }

async function openCountriesModal() {
  const rows = await fetchJSON(`${API}/countries`);
  $('list-modal-title').textContent = 'All Countries';
  $('list-modal-head').innerHTML = `<th class="text-left px-4 py-2.5">#</th><th class="text-left px-4 py-2.5">Country</th><th class="text-right px-4 py-2.5">Stocks</th>`;
  $('list-modal-body').innerHTML = rows.map((r, i) => `
    <tr class="hover:bg-surf2 cursor-pointer" onclick="closeListModal(); openCountry('${r.country.replace(/'/g,"\\'")}')">
      <td class="px-4 py-2 text-muted">${i+1}</td>
      <td class="px-4 py-2 font-medium whitespace-nowrap">${countryFlag(r.country)} <span class="ml-1">${r.country}</span></td>
      <td class="px-4 py-2 text-right font-mono text-brand-400">${r.stocks.toLocaleString()}</td>
    </tr>`).join('');
  $('list-modal-action').onclick = () => { closeListModal(); navigate('countries'); };
  $('list-modal-action').textContent = 'In-depth Analysis →';
  $('list-modal').classList.remove('hidden'); $('list-modal').classList.add('flex');
}

async function openExchangesModal() {
  const rows = await fetchJSON(`${API}/exchanges`);
  $('list-modal-title').textContent = 'All Exchanges';
  $('list-modal-head').innerHTML = `<th class="text-left px-4 py-2.5">#</th><th class="text-left px-4 py-2.5">Exchange</th><th class="text-left px-4 py-2.5">Country</th><th class="text-right px-4 py-2.5">Stocks</th>`;
  $('list-modal-body').innerHTML = rows.map((r, i) => `
    <tr class="hover:bg-surf2 cursor-pointer" onclick="closeListModal(); openExchangePage('${r.code}')">
      <td class="px-4 py-2 text-muted">${i+1}</td>
      <td class="px-4 py-2 font-medium">${r.exchange}</td>
      <td class="px-4 py-2 text-muted text-xs">${r.country}</td>
      <td class="px-4 py-2 text-right font-mono text-brand-400">${r.stocks.toLocaleString()}</td>
    </tr>`).join('');
  $('list-modal-action').onclick = () => { closeListModal(); navigate('exchanges'); };
  $('list-modal-action').textContent = 'In-depth Analysis →';
  $('list-modal').classList.remove('hidden'); $('list-modal').classList.add('flex');
}

async function openSectorsModal() {
  const rows = await fetchJSON(`${API}/sectors`);
  $('list-modal-title').textContent = 'All Sectors';
  $('list-modal-head').innerHTML = `<th class="text-left px-4 py-2.5">#</th><th class="text-left px-4 py-2.5">Sector</th><th class="text-right px-4 py-2.5">Stocks</th>`;
  $('list-modal-body').innerHTML = rows.map((r, i) => `
    <tr class="hover:bg-surf2 cursor-pointer" onclick="closeListModal(); openSectorPage('${r.sector.replace(/'/g,"\\'")}')">
      <td class="px-4 py-2 text-muted">${i+1}</td>
      <td class="px-4 py-2 font-medium">${r.sector}</td>
      <td class="px-4 py-2 text-right font-mono text-brand-400">${r.stocks.toLocaleString()}</td>
    </tr>`).join('');
  $('list-modal-action').onclick = () => { closeListModal(); navigate('sectors'); };
  $('list-modal-action').textContent = 'In-depth Analysis →';
  $('list-modal').classList.remove('hidden'); $('list-modal').classList.add('flex');
}

function openStocksSummaryModal(d) {
  $('summary-body').innerHTML = `
    <div class="bg-surf2 rounded-xl p-4 text-center"><div class="text-2xl font-bold">${d.total_stocks.toLocaleString()}</div><div class="text-xs text-muted mt-1">Total Listings</div></div>
    <div class="bg-surf2 rounded-xl p-4 text-center"><div class="text-2xl font-bold text-brand-400">${d.countries}</div><div class="text-xs text-muted mt-1">Countries</div></div>
    <div class="bg-surf2 rounded-xl p-4 text-center"><div class="text-2xl font-bold text-emerald-400">${d.exchanges}</div><div class="text-xs text-muted mt-1">Exchanges</div></div>
    <div class="bg-surf2 rounded-xl p-4 text-center"><div class="text-2xl font-bold text-amber-400">${d.sectors}</div><div class="text-xs text-muted mt-1">Sectors</div></div>
    <div class="col-span-2 text-sm text-muted leading-relaxed mt-1">${d.tagline || ''}</div>
  `;
  $('summary-modal').classList.remove('hidden'); $('summary-modal').classList.add('flex');
}


/* ========== RANKINGS ========== */
async function openRankingsSection() {
  const panel = $('rankings-panel');
  if (!panel) return;
  panel.classList.remove('hidden');
  panel.innerHTML = '<div class="flex justify-center py-8"><div class="loader"></div></div>';
  panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
  try {
    const d = state.rankings || await fetchJSON(`${API}/ranking/list`);
    state.rankings = d;
    panel.innerHTML = `
      <div class="bg-surf border border-app rounded-xl overflow-hidden animate-slide-up">
        <div class="px-4 py-3 border-b border-app flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <h3 class="font-semibold">Country Classification & Ranking</h3>
            <p class="text-xs text-muted mt-0.5"></p>
          </div>
        </div>
        <div class="overflow-x-auto max-h-[480px]">
          <table class="w-full text-sm">
            <thead class="bg-surf2 text-muted text-xs uppercase sticky top-0">
              <tr>
                <th class="text-left px-3 py-2">Rank</th>
                <th class="text-left px-3 py-2">Country</th>
                <th class="text-left px-3 py-2 hidden sm:table-cell">Region</th>
                <th class="text-right px-3 py-2">Score</th>
              </tr>
            </thead>
            <tbody>
              ${(d.rankings||[]).map(r => `
                <tr class="border-b border-app hover:bg-surf2 cursor-pointer" onclick="openRankingCountryPopup('${r.iso3}')">
                  <td class="px-3 py-2 font-mono ${r.rank<=3?'text-amber-400 font-bold':''}">${r.rank}</td>
                  <td class="px-3 py-2 whitespace-nowrap">${countryFlag(r.country)} <span class="ml-1.5 font-medium">${r.country}</span></td>
                  <td class="px-3 py-2 text-muted hidden sm:table-cell text-xs">${r.region||'—'}</td>
                  <td class="px-3 py-2 text-right font-mono text-brand-400">${Number(r.final_score).toFixed(2)}</td>
                </tr>`).join('')}
            </tbody>
          </table>
        </div>
      </div>`;
  } catch (e) {
    panel.innerHTML = `<p class="text-red-400 text-sm">${e.message}</p>`;
  }
}

async function openRankingCountryPopup(iso3) {
  try {
    const d = await fetchJSON(`${API}/ranking/country/${iso3}`);
    state.rankingPopup = d;
    state.rankingPopupTab = 'blocks';
    state.rankingOpenBlock = null;
    const modal = $('list-modal');
    $('list-modal-title').textContent = `${d.country || iso3}`;
    $('list-modal-head').innerHTML = '';
    renderRankingPopupBody();
    $('list-modal-action').textContent = 'In-depth Analysis →';
    $('list-modal-action').onclick = () => {
      closeListModal();
      openCountry(d.country);
    };
    modal.classList.remove('hidden'); modal.classList.add('flex');
  } catch (e) {
    alert(e.message);
  }
}
function renderRankingPopupBody() {
  const d = state.rankingPopup || {};
  const tab = state.rankingPopupTab || 'blocks';
  const blocks = (d.blocks || []).filter(b => b.block !== 9 && b.name !== 'Innovation & Technology');
  const indicators = (d.indicators || d.top_indicators || []).filter(i => i.block !== 9);
  const byBlock = {};
  indicators.forEach(i => {
    const b = i.block || 0;
    if (!byBlock[b]) byBlock[b] = [];
    byBlock[b].push(i);
  });
  const blockOrder = blocks.map(b => b.block);
  // ensure all blocks from indicators appear
  Object.keys(byBlock).map(Number).sort((a,b)=>a-b).forEach(b => {
    if (!blockOrder.includes(b)) blockOrder.push(b);
  });

  let tabHtml = '';
  if (tab === 'blocks') {
    tabHtml = `
      <div class="space-y-2 max-h-[42vh] overflow-y-auto pr-1">
        ${blocks.map(b => `
          <div class="flex items-center gap-2 text-xs">
            <span class="w-40 sm:w-48 truncate text-muted" title="${b.name}">${b.name}</span>
            <div class="flex-1 h-2 bg-surf2 rounded-full overflow-hidden">
              <div class="h-full bg-brand-500 rounded-full" style="width:${Math.min(100, Number(b.score)||0)}%"></div>
            </div>
            <span class="font-mono w-12 text-right">${b.score != null ? Number(b.score).toFixed(1) : '—'}</span>
          </div>`).join('') || '<p class="text-xs text-muted">No block scores</p>'}
      </div>`;
  } else if (tab === 'indicators') {
    tabHtml = `
      <div class="space-y-2 max-h-[42vh] overflow-y-auto pr-1">
        ${blockOrder.map(bn => {
          const meta = blocks.find(b => b.block === bn) || { name: (byBlock[bn]||[])[0]?.block_name || ('Block '+bn) };
          const open = state.rankingOpenBlock === bn;
          const rows = byBlock[bn] || [];
          return `
            <div class="border border-app rounded-xl overflow-hidden">
              <button type="button" onclick="toggleRankingBlock(${bn})"
                class="w-full flex items-center justify-between px-3 py-2.5 text-left text-sm font-medium hover:bg-surf2">
                <span>${meta.name || ('Block '+bn)}</span>
                <span class="text-xs text-muted">${rows.length} indicators ${open ? '▲' : '▼'}</span>
              </button>
              ${open ? `
                <div class="border-t border-app overflow-x-auto">
                  <table class="w-full text-xs">
                    <thead class="bg-surf2 text-muted">
                      <tr>
                        <th class="text-left px-2 py-1.5">#</th>
                        <th class="text-left px-2 py-1.5">Indicator</th>
                        <th class="text-right px-2 py-1.5">Score</th>
                        <th class="text-right px-2 py-1.5">Weight</th>
                      </tr>
                    </thead>
                    <tbody>
                      ${rows.map((r,i) => {
                        const wPct = r.weight != null ? (Number(r.weight) <= 1 ? Number(r.weight) * 100 : Number(r.weight)) : null;
                        return `
                        <tr class="border-t border-app">
                          <td class="px-2 py-1.5 text-muted">${i+1}</td>
                          <td class="px-2 py-1.5">
                            <div class="font-medium leading-snug">${r.indicator_name || r.indicator_code}</div>
                            <div class="mt-1 h-1.5 bg-surf2 rounded-full overflow-hidden max-w-xs">
                              <div class="h-full bg-emerald-500/80 rounded-full" style="width:${Math.min(100, Number(r.score)||0)}%"></div>
                            </div>
                          </td>
                          <td class="px-2 py-1.5 text-right font-mono">${r.score != null ? Number(r.score).toFixed(1) : '—'}</td>
                          <td class="px-2 py-1.5 text-right font-mono text-muted">${wPct != null ? wPct.toFixed(1) + '%' : '—'}</td>
                        </tr>`;
                      }).join('') || '<tr><td colspan="4" class="px-3 py-3 text-muted">No indicators</td></tr>'}
                    </tbody>
                  </table>
                </div>` : ''}
            </div>`;
        }).join('') || '<p class="text-xs text-muted">No indicator data</p>'}
      </div>`;
  } else {
    tabHtml = `
      <div class="space-y-1.5 max-h-[42vh] overflow-y-auto">
        ${(d.exchanges||[]).length ? d.exchanges.map(ex => `
          <div class="flex items-center justify-between text-sm bg-surf2 rounded-lg px-3 py-2 border border-app">
            <div>
              <div class="font-medium">${ex.exchange}</div>
              <div class="text-[11px] text-muted font-mono">${ex.code}</div>
            </div>
            <div class="font-mono text-brand-400 text-xs">${Number(ex.count).toLocaleString()} stocks</div>
          </div>`).join('') : '<p class="text-xs text-muted">No stock exchanges mapped in listing universe</p>'}
      </div>`;
  }

  $('list-modal-body').innerHTML = `
    <tr><td colspan="3" class="px-3 sm:px-4 py-3">
      <div class="space-y-3 text-sm">
        <div class="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <div class="bg-surf2 rounded-xl px-3 py-2.5 border border-app">
            <div class="text-[10px] uppercase text-muted">Score</div>
            <div class="font-mono font-bold text-brand-400 text-lg">${d.final_score != null ? Number(d.final_score).toFixed(2) : '—'}</div>
          </div>
          <div class="bg-surf2 rounded-xl px-3 py-2.5 border border-app">
            <div class="text-[10px] uppercase text-muted">Rank</div>
            <div class="font-mono font-bold text-lg">#${d.rank ?? '—'}</div>
          </div>
          <div class="bg-surf2 rounded-xl px-3 py-2.5 border border-app">
            <div class="text-[10px] uppercase text-muted">Region</div>
            <div class="font-medium text-sm truncate">${d.meta?.region || '—'}</div>
          </div>
          <div class="bg-surf2 rounded-xl px-3 py-2.5 border border-app">
            <div class="text-[10px] uppercase text-muted">Capital</div>
            <div class="font-medium text-sm truncate">${d.meta?.capitalCity || '—'}</div>
          </div>
        </div>

        <div class="flex gap-1 p-0.5 rounded-xl bg-surf2 border border-app overflow-x-auto">
          ${[['blocks','Block Score'],['indicators','Indicator Score'],['exchanges','Exchanges']].map(([k,lab]) => `
            <button type="button" onclick="setRankingPopupTab('${k}')"
              class="flex-1 min-w-[100px] px-3 py-2 rounded-lg text-xs font-medium transition ${tab===k?'bg-brand-600 text-white':'text-muted hover:text-app'}">${lab}</button>
          `).join('')}
        </div>

        ${tabHtml}

        <p class="text-[11px] text-muted pt-1">Ranking is model-based and subject to change.</p>
      </div>
    </td></tr>`;
}
function setRankingPopupTab(tab) {
  state.rankingPopupTab = tab;
  renderRankingPopupBody();
}
function toggleRankingBlock(bn) {
  state.rankingOpenBlock = state.rankingOpenBlock === bn ? null : bn;
  renderRankingPopupBody();
}



/* ========== DASHBOARD ========== */
async function renderDashboard() {
  $('breadcrumb').textContent = 'Dashboard';
  try {
    const d = await fetchJSON(`${API}/overview`);
    $('content').innerHTML = `
      <div class="space-y-6 fade max-w-6xl">
        <div>
          <h1 class="text-2xl sm:text-3xl font-bold">Global Equity Universe</h1>
          <p class="text-muted mt-2 text-sm sm:text-base leading-relaxed max-w-2xl">
            ${d.tagline || 'Navigate listings across countries and exchanges. Spot sector concentration and explore live fundamentals.'}
          </p>
        </div>

        <div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          <button onclick='openStocksSummaryModal(${JSON.stringify(d).replace(/'/g,"&#39;")})' class="bg-surf border border-app rounded-xl p-4 text-left hover:border-brand-500/50 transition group card-lift">
            <div class="text-xs text-muted uppercase tracking-wider">Listed Stocks</div>
            <div class="text-2xl font-bold mt-1 group-hover:text-brand-400 transition">${d.total_stocks.toLocaleString()}</div>
            <div class="text-[10px] text-muted mt-1">Click for summary</div>
          </button>
          <button onclick="openCountriesModal()" class="bg-surf border border-app rounded-xl p-4 text-left hover:border-brand-500/50 transition group card-lift">
            <div class="text-xs text-muted uppercase tracking-wider">Countries</div>
            <div class="text-2xl font-bold text-brand-400 mt-1">${d.countries}</div>
            <div class="text-[10px] text-muted mt-1">Click to explore</div>
          </button>
          <button onclick="openExchangesModal()" class="bg-surf border border-app rounded-xl p-4 text-left hover:border-brand-500/50 transition group card-lift">
            <div class="text-xs text-muted uppercase tracking-wider">Exchanges</div>
            <div class="text-2xl font-bold text-emerald-400 mt-1">${d.exchanges}</div>
            <div class="text-[10px] text-muted mt-1">Click to explore</div>
          </button>
          <button onclick="openSectorsModal()" class="bg-surf border border-app rounded-xl p-4 text-left hover:border-amber-500/50 transition group card-lift">
            <div class="text-xs text-muted uppercase tracking-wider">Sectors Mapped</div>
            <div class="text-2xl font-bold text-amber-400 mt-1">${d.sectors}</div>
            <div class="text-[10px] text-muted mt-1">Click to explore</div>
          </button>
          <button onclick="openIndustriesModal()" class="bg-surf border border-app rounded-xl p-4 text-left hover:border-violet-500/50 transition group card-lift">
            <div class="text-xs text-muted uppercase tracking-wider">Industries Mapped</div>
            <div class="text-2xl font-bold text-violet-400 mt-1" id="dash-industries-count">—</div>
            <div class="text-[10px] text-muted mt-1">Click to explore</div>
          </button>
          <button onclick="openRankingsSection()" class="bg-surf border border-app rounded-xl p-4 text-left hover:border-brand-500/50 transition group card-lift">
            <div class="text-xs text-muted uppercase tracking-wider">Country Ranking</div>
            <div class="text-2xl font-bold text-sky-400 mt-1" id="dash-rank-count">—</div>
            <div class="text-[10px] text-muted mt-1">Jump to intelligence</div>
          </button>
        </div>

        <div class="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div class="bg-surf border border-app rounded-xl p-4">
            <h3 class="text-sm font-semibold mb-3">Top Countries by Listings</h3>
            <div class="chart-box"><canvas id="cCountries"></canvas></div>
          </div>
          <div class="bg-surf border border-app rounded-xl p-4">
            <h3 class="text-sm font-semibold mb-3">Global Sector Distribution</h3>
            <div class="chart-box"><canvas id="cSectors"></canvas></div>
          </div>
          <div class="bg-surf border border-app rounded-xl p-4">
            <h3 class="text-sm font-semibold mb-3">Global Industry Distribution</h3>
            <div class="chart-box"><canvas id="cIndustries"></canvas></div>
          </div>
        </div>

        <div class="bg-surf border border-app rounded-xl overflow-hidden">
          <div class="px-4 py-3 border-b border-app text-sm font-semibold flex justify-between">
            <span>Largest Exchanges</span>
            <button onclick="openExchangesModal()" class="text-xs text-brand-400 hover:underline">View all</button>
          </div>
          <div class="overflow-x-auto">
            <table class="w-full text-sm">
              <thead class="bg-surf2 text-muted text-xs uppercase">
                <tr><th class="text-left px-4 py-2">#</th><th class="text-left px-4 py-2">Exchange</th><th class="text-left px-4 py-2">Country</th><th class="text-right px-4 py-2">Stocks</th></tr>
              </thead>
              <tbody id="dash-ex-body"></tbody>
            </table>
          </div>
        </div>

        <!-- Country Ranking CTA (below exchange table) -->
        <div class="bg-gradient-to-br from-brand-700/20 to-surface border border-brand-600/30 rounded-2xl p-5 sm:p-6">
          <div class="text-xs uppercase tracking-wider text-brand-400 font-semibold mb-2">Country Intelligence</div>
          <p class="text-sm sm:text-base leading-relaxed mb-3" id="rank-message">
            FinSight Country Intelligence ranks stock-market economies with transparent multi-indicator scores across 11 analytical blocks.
          </p>
          <p class="text-xs text-muted mb-4">This ranking is produced by our system on various indicators and is subject to change.</p>
          <button onclick="openRankingsSection()" class="bg-brand-600 hover:bg-brand-500 text-white font-medium px-5 py-2.5 rounded-xl btn-press transition">
            View country classification & ranking →
          </button>
        </div>
        <div id="rankings-panel" class="hidden"></div>
      </div>`;

    destroyChart('cCountries');
    charts.cCountries = new Chart($('cCountries'), {
      type: 'bar',
      data: { labels: d.top_countries.map(x=>x.country), datasets: [{ data: d.top_countries.map(x=>x.count), backgroundColor: COLORS[0], borderRadius: 4 }] },
      options: { indexAxis: 'y', responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } },
        scales: { x: { grid: { color: 'rgba(128,128,128,0.15)' }, ticks: { color: '#94a3b8' } }, y: { grid: { display: false }, ticks: { color: '#94a3b8', font: { size: 11 } } } } }
    });
    destroyChart('cSectors');
    charts.cSectors = new Chart($('cSectors'), {
      type: 'doughnut',
      data: { labels: d.top_sectors.map(x=>x.sector), datasets: [{ data: d.top_sectors.map(x=>x.count), backgroundColor: COLORS, borderWidth: 0 }] },
      options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'right', labels: { color: '#94a3b8', boxWidth: 10, font: { size: 10 } } } } }
    });
    // Industry distribution
    try {
      const inds = await fetchJSON(`${API}/overview/industries`);
      destroyChart('cIndustries');
      if ($('cIndustries') && inds.length) {
        charts.cIndustries = new Chart($('cIndustries'), {
          type: 'doughnut',
          data: { labels: inds.map(x => x.industry.length > 18 ? x.industry.slice(0,16)+'…' : x.industry),
                  datasets: [{ data: inds.map(x => x.count), backgroundColor: COLORS, borderWidth: 0 }] },
          options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'right', labels: { color: '#94a3b8', boxWidth: 10, font: { size: 9 } } } } }
        });
      }
    } catch(e) {}
    try {
      const rk = await fetchJSON(`${API}/ranking/list`);
      if (rk.message && $('rank-message')) $('rank-message').textContent = rk.message;
      state.rankings = rk;
      if ($('dash-rank-count')) $('dash-rank-count').textContent = (rk.rankings || []).length.toLocaleString();
    } catch(e) {}
    try {
      const inds = await fetchJSON(`${API}/industries`);
      state.industriesList = inds;
      if ($('dash-industries-count')) $('dash-industries-count').textContent = inds.length.toLocaleString();
    } catch(e) {}
    $('dash-ex-body').innerHTML = d.top_exchanges.map((e,i) => `
      <tr class="hover:bg-surf2 cursor-pointer border-b border-app" onclick="openExchangePage('${e.code}')">
        <td class="px-4 py-2 text-muted">${i+1}</td>
        <td class="px-4 py-2 font-medium">${e.exchange}</td>
        <td class="px-4 py-2 text-muted">${e.country}</td>
        <td class="px-4 py-2 text-right font-mono text-brand-400">${e.count.toLocaleString()}</td>
      </tr>`).join('');
  } catch (e) {
    $('content').innerHTML = `<p class="text-red-400">Failed: ${e.message}</p>`;
  }
}

/* ========== COUNTRY PAGE (map + exchanges) ========== */
function openCountry(name) {
  state.country = name;
  navigate('country-page', { country: name });
}

async function renderCountryPage() {
  const country = state.country;
  $('breadcrumb').textContent = country;
  try {
    const d = await fetchJSON(`${API}/country/${encodeURIComponent(country)}`);
    $('content').innerHTML = `
      <div class="space-y-5 fade max-w-5xl">
        <div class="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
          <div>
            <button onclick="navigate('countries')" class="text-xs text-brand-400 hover:underline mb-2">← All countries</button>
            <h1 class="text-2xl font-bold flex items-center gap-2">${countryFlag(d.country)} ${d.country}</h1>
            <p class="text-muted text-sm mt-1">${d.total_stocks.toLocaleString()} listings · ${d.exchanges.length} exchange(s)</p>
          </div>
          <a href="${rankingDeepLink(d.country)}" target="_blank" rel="noopener"
            class="inline-flex items-center gap-2 bg-brand-600 hover:bg-brand-500 text-white text-sm font-medium px-4 py-2.5 rounded-xl btn-press transition shrink-0">
            Explore Country Ranking ↗
          </a>
        </div>
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div class="bg-surf border border-app rounded-xl p-3">
            <h3 class="text-sm font-semibold mb-2 px-1">Location</h3>
            <div id="map"></div>
          </div>
          <div class="bg-surf border border-app rounded-xl p-4">
            <h3 class="text-sm font-semibold mb-3">Exchanges in ${d.country}</h3>
            <div class="space-y-2">
              ${d.exchanges.map(ex => `
                <button onclick="openExchangePage('${ex.code}')" class="w-full text-left bg-surf2 border border-app rounded-xl p-3 hover:border-brand-500/50 transition">
                  <div class="font-medium">${ex.exchange}</div>
                  <div class="text-xs text-muted mt-0.5 font-mono">${ex.code} · ${ex.count.toLocaleString()} stocks</div>
                </button>`).join('')}
            </div>
          </div>
        </div>
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div class="bg-surf border border-app rounded-xl p-4" id="cty-industry-wrap">
            <h3 class="text-sm font-semibold mb-3">Industry Mix</h3>
            <div class="chart-box"><canvas id="ctyIndustries"></canvas></div>
          </div>
          <div class="bg-surf border border-app rounded-xl p-4" id="cty-rank-panel">
            <div class="flex justify-center py-8"><div class="loader"></div></div>
          </div>
        </div>
      </div>`;
    // Map
    if (typeof L !== 'undefined') {
      const map = L.map('map').setView([d.lat, d.lng], 4);
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '© OSM' }).addTo(map);
      L.marker([d.lat, d.lng]).addTo(map).bindPopup(`<b>${d.country}</b><br>${d.exchanges.length} exchange(s)`).openPopup();
      setTimeout(() => map.invalidateSize(), 200);
    }
    if ((d.industries && d.industries.length) || (d.top_industries && d.top_industries.length)) {
      destroyChart('ctyIndustries');
      charts.ctyIndustries = new Chart($('ctyIndustries'), {
        type: 'doughnut',
        data: {
          labels: (d.industries || d.top_industries).slice(0, 14).map(x => x.industry.length > 22 ? x.industry.slice(0, 20) + '…' : x.industry),
          datasets: [{ data: (d.industries || d.top_industries).slice(0, 14).map(x => x.count), backgroundColor: COLORS, borderWidth: 0 }]
        },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'right', labels: { color: '#94a3b8', boxWidth: 10, font: { size: 10 } } } } }
      });
    } else if ($('cty-industry-wrap')) {
      $('cty-industry-wrap').innerHTML = `<h3 class="text-sm font-semibold mb-3">Industry Mix</h3>
        <p class="text-xs text-muted p-2 leading-relaxed">Industry-wise classification for listings in this country is not yet complete and will be done soon.</p>`;
    }
    // Country ranking panel (2 tabs: block score + indicator score) — Part 1
    loadCountryRankPanel(d.country);
  } catch (e) {
    $('content').innerHTML = `<p class="text-red-400">${e.message}</p>`;
  }
}

async function loadCountryRankPanel(countryName) {
  const panel = $('cty-rank-panel');
  if (!panel) return;
  try {
    // resolve iso3 via countries list or ranking (fuzzy name match)
    const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
    const target = norm(countryName);
    let iso3 = null;
    const countries = state.countriesTable || await fetchJSON(`${API}/countries`).catch(() => []);
    const match = (countries || []).find(c => c.country === countryName)
      || (countries || []).find(c => norm(c.country) === target)
      || (countries || []).find(c => target && (norm(c.country).includes(target) || target.includes(norm(c.country))));
    if (match?.iso3) iso3 = match.iso3;
    if (!iso3) {
      const rk = state.rankings || await fetchJSON(`${API}/ranking/list`).catch(() => null);
      const list = rk?.rankings || [];
      const hit = list.find(r => r.country === countryName)
        || list.find(r => norm(r.country) === target)
        || list.find(r => target && (norm(r.country).includes(target) || target.includes(norm(r.country))))
        || list.find(r => r.iso3 && String(r.iso3).toUpperCase() === String(countryName).toUpperCase());
      iso3 = hit?.iso3;
    }
    if (!iso3) {
      panel.innerHTML = `<p class="text-xs text-muted">Ranking data not available for this country (not in the ranked stock-market economy set).</p>`;
      return;
    }
    const d = await fetchJSON(`${API}/ranking/country/${iso3}`);
    state.ctyRankData = d;
    state.ctyRankTab = 'blocks';
    state.ctyRankOpenBlock = null;
    renderCountryRankPanel();
  } catch (e) {
    panel.innerHTML = `<p class="text-xs text-muted">Ranking panel unavailable.</p>`;
  }
}

function renderCountryRankPanel() {
  const panel = $('cty-rank-panel');
  const d = state.ctyRankData || {};
  if (!panel) return;
  const tab = state.ctyRankTab || 'blocks';
  const blocks = (d.blocks || []).filter(b => b.block !== 9);
  const indicators = (d.indicators || []).filter(i => i.block !== 9);
  const byBlock = {};
  indicators.forEach(i => {
    const b = i.block || 0;
    if (!byBlock[b]) byBlock[b] = [];
    byBlock[b].push(i);
  });
  let body = '';
  if (tab === 'blocks') {
    body = blocks.map(b => {
      const w = b.weight != null ? (Number(b.weight) <= 1 ? Number(b.weight) * 100 : Number(b.weight)) : null;
      return `<div class="flex items-center gap-2 text-xs mb-1.5">
        <span class="w-36 truncate text-muted" title="${b.name}">${b.name}</span>
        <div class="flex-1 h-1.5 bg-surf2 rounded-full overflow-hidden"><div class="h-full bg-brand-500 rounded-full" style="width:${Math.min(100, Number(b.score)||0)}%"></div></div>
        <span class="font-mono w-10 text-right">${b.score != null ? Number(b.score).toFixed(1) : '—'}</span>
        <span class="font-mono w-12 text-right text-muted">${w != null ? w.toFixed(1)+'%' : '—'}</span>
      </div>`;
    }).join('') || '<p class="text-xs text-muted">No block scores</p>';
  } else {
    body = blocks.map(b => {
      const open = state.ctyRankOpenBlock === b.block;
      const rows = byBlock[b.block] || [];
      return `<div class="border border-app rounded-lg mb-2 overflow-hidden">
        <button type="button" onclick="state.ctyRankOpenBlock=state.ctyRankOpenBlock===${b.block}?null:${b.block};renderCountryRankPanel()"
          class="w-full flex justify-between px-2 py-1.5 text-xs font-medium hover:bg-surf2 text-left">
          <span>${b.name}</span><span class="text-muted">${rows.length} ${open?'▲':'▼'}</span>
        </button>
        ${open ? `<div class="border-t border-app p-2 space-y-1">${rows.map((r,i) => {
          const w = r.weight != null ? (Number(r.weight) <= 1 ? Number(r.weight)*100 : Number(r.weight)) : null;
          return `<div class="text-[11px]">
            <div class="flex justify-between gap-2"><span class="truncate">${i+1}. ${r.indicator_name||r.indicator_code}</span>
              <span class="font-mono shrink-0">${r.score!=null?Number(r.score).toFixed(1):'—'} · ${w!=null?w.toFixed(1)+'%':'—'}</span></div>
            <div class="h-1 bg-surf2 rounded-full mt-0.5 overflow-hidden"><div class="h-full bg-emerald-500/80 rounded-full" style="width:${Math.min(100,Number(r.score)||0)}%"></div></div>
          </div>`;
        }).join('') || '<p class="text-muted text-xs">No indicators</p>'}</div>` : ''}
      </div>`;
    }).join('') || '<p class="text-xs text-muted">No indicator data</p>';
  }
  panel.innerHTML = `
    <div class="flex items-center justify-between mb-2">
      <h3 class="text-sm font-semibold">Country Intelligence</h3>
      <span class="text-[11px] text-muted">#${d.rank ?? '—'} · ${d.final_score != null ? Number(d.final_score).toFixed(1) : '—'}</span>
    </div>
    <div class="flex gap-1 p-0.5 rounded-lg bg-surf2 border border-app mb-3">
      <button onclick="state.ctyRankTab='blocks';renderCountryRankPanel()" class="flex-1 px-2 py-1.5 rounded-md text-xs ${tab==='blocks'?'bg-brand-600 text-white':'text-muted'}">Block Score</button>
      <button onclick="state.ctyRankTab='indicators';renderCountryRankPanel()" class="flex-1 px-2 py-1.5 rounded-md text-xs ${tab==='indicators'?'bg-brand-600 text-white':'text-muted'}">Indicator Score</button>
    </div>
    <div class="max-h-[280px] overflow-y-auto">${body}</div>
    <p class="text-[10px] text-muted mt-2">Weights shown as %. Ranking is model-based and subject to change.</p>`;
}

/* ========== EXCHANGE PAGE (2 pies + stocks) ========== */
function openExchangePage(code) {
  state.exchangeCode = code;
  navigate('exchange-page', { exchangeCode: code });
}

async function renderExchangePage() {
  const code = state.exchangeCode;
  try {
    const d = await fetchJSON(`${API}/exchange/${encodeURIComponent(code)}`);
    $('breadcrumb').textContent = d.exchange;
    $('content').innerHTML = `
      <div class="space-y-5 fade max-w-6xl">
        <div>
          <button onclick="navigate('exchanges')" class="text-xs text-brand-400 hover:underline mb-2">← All exchanges</button>
          <h1 class="text-2xl font-bold">${d.exchange}</h1>
          <p class="text-muted text-sm mt-1">${d.total_stocks.toLocaleString()} stocks · ${d.country}
            · <button onclick="openCountry('${d.country.replace(/'/g,"\\'")}')" class="text-brand-400 hover:underline">${d.country} page</button>
          </p>
        </div>
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div class="bg-surf border border-app rounded-xl p-3">
            <h3 class="text-sm font-semibold mb-2">Sector Bifurcation</h3>
            <div id="ex-sector-wrap" class="chart-box" style="height:200px"><canvas id="exSectorPie"></canvas></div>
          </div>
          <div class="bg-surf border border-app rounded-xl p-3">
            <h3 class="text-sm font-semibold mb-2">Industry Bifurcation</h3>
            <div id="ex-industry-wrap" class="chart-box" style="height:200px"><canvas id="exIndustryPie"></canvas></div>
          </div>
        </div>
        <div>
          <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-3">
            <h3 class="text-sm font-semibold">Stocks listed</h3>
            <input id="ex-stock-q" type="text" placeholder="Filter…" class="bg-surf2 border border-app rounded-lg px-3 py-1.5 text-sm w-full sm:w-56 focus:outline-none focus:ring-2 focus:ring-brand-500"
              onkeydown="if(event.key==='Enter') loadExchangeStocks(1)" />
          </div>
          <div id="ex-stocks-wrap" class="bg-surf border border-app rounded-xl overflow-hidden">
            <div class="flex justify-center py-10"><div class="loader"></div></div>
          </div>
        </div>
      </div>`;
    // Part 3: only show sector bifurcation when sector data exists
    if (d.sectors?.length) {
      destroyChart('exSectorPie');
      charts.exSectorPie = new Chart($('exSectorPie'), {
        type: 'doughnut',
        data: { labels: d.sectors.map(x=>x.sector), datasets: [{ data: d.sectors.map(x=>x.count), backgroundColor: COLORS, borderWidth: 0 }] },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'right', labels: { color: '#94a3b8', boxWidth: 8, font: { size: 9 } } } } }
      });
    } else if ($('ex-sector-wrap')) {
      // hide the whole sector card when no classification
      const card = $('ex-sector-wrap').closest('.bg-surf') || $('ex-sector-wrap').parentElement;
      if (card) card.classList.add('hidden');
    }
    if (d.industries?.length) {
      destroyChart('exIndustryPie');
      charts.exIndustryPie = new Chart($('exIndustryPie'), {
        type: 'doughnut',
        data: { labels: d.industries.slice(0,12).map(x=>x.industry.length>22?x.industry.slice(0,20)+'…':x.industry), datasets: [{ data: d.industries.slice(0,12).map(x=>x.count), backgroundColor: COLORS, borderWidth: 0 }] },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'right', labels: { color: '#94a3b8', boxWidth: 8, font: { size: 9 } } } } }
      });
    } else if ($('ex-industry-wrap')) {
      $('ex-industry-wrap').innerHTML = `<p class="text-xs text-muted p-4 leading-relaxed">Industry-wise bifurcation for these stocks is not yet complete and will be done soon.</p>`;
    }
    loadExchangeStocks(1);
  } catch (e) {
    $('content').innerHTML = `<p class="text-red-400">${e.message}</p>`;
  }
}

async function loadExchangeStocks(page) {
  const code = state.exchangeCode;
  const q = $('ex-stock-q')?.value?.trim() || '';
  const params = new URLSearchParams({ page, limit: 40 });
  if (q) params.set('q', q);
  try {
    const d = await fetchJSON(`${API}/exchange/${encodeURIComponent(code)}/stocks?${params}`);
    const wrap = $('ex-stocks-wrap');
    if (!wrap) return;
    wrap.innerHTML = `
      <div class="overflow-x-auto">
        <table class="w-full text-sm">
          <thead class="bg-surf2 text-muted text-xs uppercase">
            <tr>
              <th class="text-left px-3 py-2.5">#</th>
              <th class="text-left px-3 py-2.5">Symbol</th>
              <th class="text-left px-3 py-2.5">Company</th>
              <th class="text-left px-3 py-2.5">Sector</th>
              <th class="text-left px-3 py-2.5 hidden md:table-cell">Industry</th>
            </tr>
          </thead>
          <tbody>
            ${d.results.map((r,i) => `
              <tr class="hover:bg-surf2 cursor-pointer border-b border-app" onclick='openStockModal(${JSON.stringify(r).replace(/'/g,"&#39;")})'>
                <td class="px-3 py-2 text-muted text-xs">${(d.page-1)*d.limit + i + 1}</td>
                <td class="px-3 py-2 font-mono text-brand-400 text-xs">${r.symbol}</td>
                <td class="px-3 py-2 max-w-[180px] truncate">${r.company_name}</td>
                <td class="px-3 py-2 text-xs">${r.sector}</td>
                <td class="px-3 py-2 text-xs text-muted hidden md:table-cell">${r.industry}</td>
              </tr>`).join('') || '<tr><td colspan="5" class="px-4 py-8 text-center text-muted">No stocks</td></tr>'}
          </tbody>
        </table>
      </div>
      <div class="flex justify-center gap-2 py-3 text-sm">
        ${page>1?`<button onclick="loadExchangeStocks(${page-1})" class="px-3 py-1 rounded bg-surf2">Prev</button>`:''}
        <span class="text-muted">Page ${d.page}/${d.pages}</span>
        ${page<d.pages?`<button onclick="loadExchangeStocks(${page+1})" class="px-3 py-1 rounded bg-surf2">Next</button>`:''}
      </div>`;
  } catch (e) { console.error(e); }
}

/* ========== SECTOR PAGE ========== */
function openSectorPage(name) {
  state.sector = name;
  navigate('sector-page', { sector: name });
}

async function renderSectorPage() {
  const sector = state.sector;
  try {
    const d = await fetchJSON(`${API}/sector/${encodeURIComponent(sector)}`);
    $('breadcrumb').textContent = sector;
    $('content').innerHTML = `
      <div class="space-y-5 fade max-w-6xl">
        <div>
          <button onclick="navigate('sectors')" class="text-xs text-brand-400 hover:underline mb-2">← All sectors</button>
          <h1 class="text-2xl font-bold">${d.sector}</h1>
          <p class="text-muted text-sm mt-1">${d.total_stocks.toLocaleString()} stocks across ${d.by_country.length} countries</p>
        </div>
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div class="bg-surf border border-app rounded-xl p-4">
            <h3 class="text-sm font-semibold mb-3">By Country</h3>
            <div class="chart-box"><canvas id="secCountries"></canvas></div>
          </div>
          <div class="bg-surf border border-app rounded-xl p-4">
            <h3 class="text-sm font-semibold mb-3">Industry Breakdown</h3>
            <div class="chart-box"><canvas id="secIndustries"></canvas></div>
          </div>
        </div>
        <div>
          <h3 class="text-sm font-semibold mb-3">Stocks in this sector</h3>
          <div id="sec-stocks-wrap" class="bg-surf border border-app rounded-xl overflow-hidden">
            <div class="flex justify-center py-10"><div class="loader"></div></div>
          </div>
        </div>
      </div>`;
    destroyChart('secCountries');
    charts.secCountries = new Chart($('secCountries'), {
      type: 'bar',
      data: { labels: d.by_country.slice(0,12).map(x=>x.country), datasets: [{ data: d.by_country.slice(0,12).map(x=>x.count), backgroundColor: COLORS[1], borderRadius: 3 }] },
      options: { indexAxis: 'y', responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } },
        scales: { x: { grid: { color: 'rgba(128,128,128,0.15)' }, ticks: { color: '#94a3b8' } }, y: { grid: { display: false }, ticks: { color: '#94a3b8', font: { size: 11 } } } } }
    });
    destroyChart('secIndustries');
    charts.secIndustries = new Chart($('secIndustries'), {
      type: 'doughnut',
      data: { labels: d.industries.slice(0,10).map(x=>x.industry.length>20?x.industry.slice(0,18)+'…':x.industry), datasets: [{ data: d.industries.slice(0,10).map(x=>x.count), backgroundColor: COLORS, borderWidth: 0 }] },
      options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'right', labels: { color: '#94a3b8', boxWidth: 10, font: { size: 10 } } } } }
    });
    loadSectorStocks(1);
  } catch (e) {
    $('content').innerHTML = `<p class="text-red-400">${e.message}</p>`;
  }
}

async function loadSectorStocks(page) {
  const sector = state.sector;
  try {
    const d = await fetchJSON(`${API}/sector/${encodeURIComponent(sector)}/stocks?page=${page}&limit=40`);
    const wrap = $('sec-stocks-wrap');
    if (!wrap) return;
    wrap.innerHTML = `
      <div class="overflow-x-auto"><table class="w-full text-sm">
        <thead class="bg-surf2 text-muted text-xs uppercase"><tr>
          <th class="text-left px-3 py-2">Symbol</th><th class="text-left px-3 py-2">Company</th>
          <th class="text-left px-3 py-2 hidden md:table-cell">Exchange</th><th class="text-left px-3 py-2">Country</th>
        </tr></thead>
        <tbody>${d.results.map(r => `
          <tr class="hover:bg-surf2 cursor-pointer border-b border-app" onclick='openStockModal(${JSON.stringify(r).replace(/'/g,"&#39;")})'>
            <td class="px-3 py-2 font-mono text-brand-400 text-xs">${r.symbol}</td>
            <td class="px-3 py-2 max-w-[160px] truncate">${r.company_name||'—'}</td>
            <td class="px-3 py-2 text-xs text-muted hidden md:table-cell">${r.stock_exchange||''}</td>
            <td class="px-3 py-2 text-xs">${r.country||''}</td>
          </tr>`).join('')}</tbody>
      </table></div>
      <div class="flex justify-center gap-2 py-3 text-sm">
        ${page>1?`<button onclick="loadSectorStocks(${page-1})" class="px-3 py-1 rounded bg-surf2">Prev</button>`:''}
        <span class="text-muted">${d.page}/${d.pages}</span>
        ${page<d.pages?`<button onclick="loadSectorStocks(${page+1})" class="px-3 py-1 rounded bg-surf2">Next</button>`:''}
      </div>`;
  } catch (e) { console.error(e); }
}

/* ========== LIST PAGES ========== */
async function renderExchangesList() {
  $('breadcrumb').textContent = 'Exchanges';
  const rows = await fetchJSON(`${API}/exchanges`);
  state.exchangesList = rows;
  $('content').innerHTML = `
    <div class="space-y-4 fade max-w-6xl">
      <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <h1 class="text-2xl font-bold">All Exchanges</h1>
        <div class="relative w-full sm:w-80">
          <input id="ex-list-search" type="search" placeholder="Search exchange or country…"
            class="w-full bg-surf2 border border-app rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
            oninput="filterExchangesList(this.value)" autocomplete="off" />
          <div id="ex-list-ac" class="absolute left-0 right-0 top-full mt-1 bg-surf border border-app rounded-xl shadow-xl max-h-56 overflow-y-auto z-20 hidden"></div>
        </div>
      </div>
      <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div class="bg-surf border border-app rounded-xl p-4 card-lift">
          <div class="text-xs text-muted uppercase">Exchanges</div>
          <div class="text-2xl font-bold font-mono mt-1">${rows.length}</div>
        </div>
        <div class="bg-surf border border-app rounded-xl p-4 card-lift">
          <div class="text-xs text-muted uppercase">Total listings</div>
          <div class="text-2xl font-bold font-mono mt-1">${rows.reduce((s,r)=>s+(r.count||r.stocks||0),0).toLocaleString()}</div>
        </div>
        <div class="bg-surf border border-app rounded-xl p-4 card-lift">
          <div class="text-xs text-muted uppercase">Countries covered</div>
          <div class="text-2xl font-bold font-mono mt-1">${new Set(rows.map(r=>r.country)).size}</div>
        </div>
      </div>
      <div class="bg-surf border border-app rounded-xl overflow-hidden">
        <div class="overflow-x-auto max-h-[70vh]">
          <table class="w-full text-sm">
            <thead class="bg-surf2 text-muted text-xs uppercase sticky top-0">
              <tr>
                <th class="text-left px-4 py-2.5">#</th>
                <th class="text-left px-4 py-2.5">Exchange</th>
                <th class="text-left px-4 py-2.5">Code</th>
                <th class="text-left px-4 py-2.5">Country</th>
                <th class="text-right px-4 py-2.5">Stocks</th>
              </tr>
            </thead>
            <tbody id="ex-list-body"></tbody>
          </table>
        </div>
      </div>
    </div>`;
  filterExchangesList('');
}
function filterExchangesList(q) {
  const rows = state.exchangesList || [];
  const query = (q || '').trim().toLowerCase();
  let filtered = rows;
  if (query) {
    filtered = rows.filter(r =>
      (r.exchange || '').toLowerCase().includes(query) ||
      (r.code || '').toLowerCase().includes(query) ||
      (r.country || '').toLowerCase().includes(query)
    );
  }
  // autocomplete
  const ac = $('ex-list-ac');
  if (ac) {
    if (query && filtered.length) {
      ac.classList.remove('hidden');
      ac.innerHTML = filtered.slice(0, 12).map(r => `
        <button type="button" class="w-full text-left px-3 py-2 text-sm hover:bg-surf2 border-b border-app"
          onclick="openExchangePage('${r.code}'); $('ex-list-ac').classList.add('hidden')">
          <span class="font-medium">${r.exchange}</span>
          <span class="text-xs text-muted ml-2">${r.country} · ${r.code}</span>
        </button>`).join('');
    } else ac.classList.add('hidden');
  }
  const body = $('ex-list-body');
  if (!body) return;
  body.innerHTML = filtered.map((r, i) => `
    <tr class="hover:bg-surf2 cursor-pointer border-b border-app" onclick="openExchangePage('${r.code}')">
      <td class="px-4 py-2 text-muted text-xs">${i + 1}</td>
      <td class="px-4 py-2 font-medium">${r.exchange}</td>
      <td class="px-4 py-2 font-mono text-xs text-muted">${r.code}</td>
      <td class="px-4 py-2">${countryFlag(r.country)} <span class="ml-1">${r.country}</span></td>
      <td class="px-4 py-2 text-right font-mono text-brand-400">${Number(r.count || r.stocks || 0).toLocaleString()}</td>
    </tr>`).join('') || `<tr><td colspan="5" class="px-4 py-8 text-center text-muted">No matches</td></tr>`;
}

async function renderCountriesList() {
  $('breadcrumb').textContent = 'Countries';
  $('content').innerHTML = `<div class="flex justify-center py-16"><div class="loader"></div></div>`;
  try {
    const [rows, mapData] = await Promise.all([
      fetchJSON(`${API}/countries`),
      fetchJSON(`${API}/exchanges/map`).catch(() => ({ exchanges: [] })),
    ]);
    state.countriesTable = rows;
    state.countriesSort = { key: 'rank', dir: 'asc' };
    state.mapExchanges = mapData.exchanges || [];

    $('content').innerHTML = `
      <div class="space-y-5 fade max-w-7xl">
        <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h1 class="text-2xl font-bold">Countries</h1>
            <p class="text-sm text-muted mt-1">${rows.length} markets · click a row or map marker to explore</p>
          </div>
          <a href="/country-ranking/" target="_blank" rel="noopener"
            class="inline-flex items-center justify-center gap-2 bg-brand-600 hover:bg-brand-500 text-white text-sm font-medium px-4 py-2.5 rounded-xl btn-press transition shrink-0">
            Explore Country Ranking ↗
          </a>
        </div>

        <div class="bg-surf border border-app rounded-2xl p-3 sm:p-4">
          <div class="flex items-center justify-between mb-2 px-1">
            <h3 class="text-sm font-semibold">Stock exchanges map</h3>
            <span class="text-[11px] text-muted">Click a marker for details</span>
          </div>
          <div id="countries-map" style="height:340px;border-radius:12px;z-index:1"></div>
        </div>

        <div class="bg-surf border border-app rounded-2xl overflow-hidden">
          <div class="px-4 py-3 border-b border-app flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <h3 class="text-sm font-semibold">Country directory</h3>
            <input id="countries-filter" type="search" placeholder="Filter countries…"
              class="bg-surf2 border border-app rounded-lg px-3 py-1.5 text-sm w-full sm:w-56 focus:outline-none focus:ring-2 focus:ring-brand-500"
              oninput="renderCountriesTable()" />
          </div>
          <div class="overflow-x-auto max-h-[520px]">
            <table class="w-full text-sm" id="countries-table">
              <thead class="bg-surf2 text-muted text-xs uppercase sticky top-0 z-10">
                <tr>
                  ${[
                    ['serial','#'],
                    ['flag','Flag'],
                    ['country','Country'],
                    ['iso3','Code'],
                    ['currency','Currency'],
                    ['stocks','Stocks'],
                    ['score','Score'],
                    ['rank','Rank'],
                  ].map(([k,lab]) => `
                    <th class="text-left px-3 py-2.5 cursor-pointer select-none hover:text-brand-400 whitespace-nowrap"
                      onclick="sortCountriesTable('${k}')">${lab} <span data-sort="${k}" class="opacity-50"></span></th>
                  `).join('')}
                </tr>
              </thead>
              <tbody id="countries-tbody"></tbody>
            </table>
          </div>
        </div>
      </div>`;

    renderCountriesTable();
    initCountriesMap(state.mapExchanges, rows);
  } catch (e) {
    $('content').innerHTML = `<p class="text-red-400 text-sm">${e.message}</p>`;
  }
}

function sortCountriesTable(key) {
  const s = state.countriesSort || { key: 'rank', dir: 'asc' };
  if (s.key === key) s.dir = s.dir === 'asc' ? 'desc' : 'asc';
  else {
    s.key = key;
    s.dir = (key === 'country' || key === 'iso3' || key === 'currency' || key === 'rank') ? 'asc' : 'desc';
  }
  state.countriesSort = s;
  renderCountriesTable();
}

function renderCountriesTable() {
  const tbody = $('countries-tbody');
  if (!tbody) return;
  const q = ($('countries-filter')?.value || '').trim().toLowerCase();
  let rows = [...(state.countriesTable || [])];
  if (q) {
    rows = rows.filter(r =>
      (r.country || '').toLowerCase().includes(q) ||
      (r.iso3 || '').toLowerCase().includes(q) ||
      (r.currency || '').toLowerCase().includes(q)
    );
  }
  const { key, dir } = state.countriesSort || { key: 'rank', dir: 'asc' };
  const mul = dir === 'asc' ? 1 : -1;
  rows.sort((a, b) => {
    const sortKey = key === 'serial' ? 'rank' : key;
    let va = a[sortKey];
    let vb = b[sortKey];
    if (sortKey === 'country' || sortKey === 'iso3' || sortKey === 'currency') {
      va = (va || 'zzz').toString().toLowerCase();
      vb = (vb || 'zzz').toString().toLowerCase();
      return va < vb ? -mul : va > vb ? mul : 0;
    }
    if (va == null && vb == null) return 0;
    if (va == null) return 1;
    if (vb == null) return -1;
    return (Number(va) - Number(vb)) * mul;
  });

  document.querySelectorAll('[data-sort]').forEach(el => {
    const k = el.getAttribute('data-sort');
    el.textContent = k === key ? (dir === 'asc' ? '↑' : '↓') : '';
  });

  tbody.innerHTML = rows.map((r, i) => `
    <tr class="border-b border-app hover:bg-surf2 cursor-pointer transition"
      onclick='openCountry(${JSON.stringify(r.country)})'>
      <td class="px-3 py-2.5 text-muted text-xs">${i + 1}</td>
      <td class="px-3 py-2.5">${countryFlag(r.country)}</td>
      <td class="px-3 py-2.5 font-medium whitespace-nowrap">${r.country}</td>
      <td class="px-3 py-2.5 font-mono text-xs text-muted">${r.iso3 || '—'}</td>
      <td class="px-3 py-2.5 font-mono text-xs">${r.currency || '—'}</td>
      <td class="px-3 py-2.5 font-mono text-brand-400">${Number(r.stocks).toLocaleString()}</td>
      <td class="px-3 py-2.5 font-mono">${r.score != null ? Number(r.score).toFixed(2) : '—'}</td>
      <td class="px-3 py-2.5 font-mono ${r.rank && r.rank <= 3 ? 'text-amber-400 font-bold' : ''}">${r.rank != null ? '#' + r.rank : '—'}</td>
    </tr>
  `).join('') || `<tr><td colspan="8" class="px-4 py-8 text-center text-muted">No countries match</td></tr>`;
}

function initCountriesMap(exchanges, countries) {
  if (typeof L === 'undefined' || !$('countries-map')) return;
  if (state._countriesMap) {
    try { state._countriesMap.remove(); } catch (e) {}
  }
  const map = L.map('countries-map', { worldCopyJump: true }).setView([20, 10], 2);
  state._countriesMap = map;
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '© OpenStreetMap',
    maxZoom: 8,
  }).addTo(map);

  const byCountry = {};
  (exchanges || []).forEach(ex => {
    if (!byCountry[ex.country]) byCountry[ex.country] = [];
    byCountry[ex.country].push(ex);
  });

  Object.entries(byCountry).forEach(([country, list]) => {
    list.forEach((ex, idx) => {
      if (ex.lat == null || ex.lng == null) return;
      const lat = Number(ex.lat) + (idx * 0.35);
      const lng = Number(ex.lng) + (idx * 0.25);
      const marker = L.circleMarker([lat, lng], {
        radius: 6,
        color: '#0ea5e9',
        fillColor: '#38bdf8',
        fillOpacity: 0.85,
        weight: 1,
      }).addTo(map);
      const safeCountry = String(country).replace(/\\/g, '\\\\').replace(/'/g, "\\'");
      const safeCode = String(ex.code || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'");
      marker.bindPopup(`
        <div style="min-width:180px;font-family:system-ui,sans-serif">
          <div style="font-weight:700;margin-bottom:4px">${(ex.exchange || ex.code || '').replace(/</g,'')}</div>
          <div style="font-size:12px;color:#64748b;margin-bottom:2px">Code: <b>${(ex.code||'').replace(/</g,'')}</b></div>
          <div style="font-size:12px;color:#64748b;margin-bottom:2px">Country: <b>${String(country).replace(/</g,'')}</b></div>
          <div style="font-size:12px;color:#64748b;margin-bottom:10px">Stocks: <b>${Number(ex.count).toLocaleString()}</b></div>
          <button onclick="window.openCountryFromMap('${safeCountry}')"
            style="width:100%;background:#0284c7;color:#fff;border:0;border-radius:8px;padding:8px 10px;font-size:12px;font-weight:600;cursor:pointer">
            In-depth analysis →
          </button>
          <button onclick="window.openExchangeFromMap('${safeCode}')"
            style="width:100%;margin-top:6px;background:#1e293b;color:#e2e8f0;border:0;border-radius:8px;padding:8px 10px;font-size:12px;cursor:pointer">
            Open exchange
          </button>
        </div>
      `);
    });
  });
  setTimeout(() => map.invalidateSize(), 250);
}

window.openCountryFromMap = function(name) {
  openCountry(name);
};
window.openExchangeFromMap = function(code) {
  openExchangePage(code);
};


async function openIndustriesModal() {
  const rows = state.industriesList || await fetchJSON(`${API}/industries`);
  state.industriesList = rows;
  $('list-modal-title').textContent = 'All Industries';
  $('list-modal-head').innerHTML = `<th class="text-left px-4 py-2.5">#</th><th class="text-left px-4 py-2.5">Industry</th><th class="text-right px-4 py-2.5">Stocks</th>`;
  $('list-modal-body').innerHTML = rows.map((r, i) => {
    const safe = String(r.industry || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'");
    return `
    <tr class="hover:bg-surf2 cursor-pointer" data-ind-idx="${i}" onclick="closeListModal(); openIndustryPage('${safe}')">
      <td class="px-4 py-2 text-muted">${i+1}</td>
      <td class="px-4 py-2 font-medium">${r.industry}</td>
      <td class="px-4 py-2 text-right font-mono text-violet-400">${Number(r.stocks).toLocaleString()}</td>
    </tr>`;
  }).join('');
  // Part 8: action + row click both open the selected industry page (row already does)
  $('list-modal-action').textContent = 'Open industry directory →';
  $('list-modal-action').onclick = () => { closeListModal(); navigate('industries'); };
  $('list-modal').classList.remove('hidden'); $('list-modal').classList.add('flex');
}

function openIndustryPage(name) {
  state.industry = name;
  navigate('industry-page', { industry: name });
}

async function renderIndustriesList() {
  $('breadcrumb').textContent = 'Industries';
  $('content').innerHTML = `<div class="flex justify-center py-16"><div class="loader"></div></div>`;
  try {
    const [rawRows, sectors] = await Promise.all([
      fetchJSON(`${API}/industries`),
      fetchJSON(`${API}/sectors`).catch(() => []),
    ]);
    const rows = (rawRows || []).filter(r => r.industry && !/Textiles,\s*Apparel\s*&/.test(r.industry) && !/Ã/.test(r.industry));
    state.industriesList = rows;
    state.industryOpenIdx = null;
    $('content').innerHTML = `
      <div class="space-y-5 fade max-w-6xl">
        <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div><h1 class="text-2xl font-bold">Industries</h1>
          <p class="text-sm text-muted mt-1">${rows.length} industries classified</p></div>
          <input id="ind-list-q" type="search" placeholder="Filter industries…"
            class="bg-surf2 border border-app rounded-lg px-3 py-1.5 text-sm w-full sm:w-64 focus:outline-none focus:ring-2 focus:ring-brand-500"
            oninput="filterIndustriesList(this.value)" />
        </div>
        <div class="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div class="bg-surf border border-app rounded-xl p-4"><h3 class="text-sm font-semibold mb-3">Industry-wise stock distribution</h3>
            <div class="chart-box"><canvas id="indAllPie"></canvas></div></div>
          <div class="bg-surf border border-app rounded-xl p-4"><h3 class="text-sm font-semibold mb-3">Country coverage (top industries)</h3>
            <div class="chart-box"><canvas id="indCountryBar"></canvas></div></div>
          <div class="bg-surf border border-app rounded-xl p-4"><h3 class="text-sm font-semibold mb-3">Sector-wise industry count</h3>
            <div class="chart-box"><canvas id="indSectorPie"></canvas></div></div>
        </div>
        <div class="bg-surf border border-app rounded-xl overflow-hidden">
          <div class="px-4 py-3 border-b border-app text-sm font-semibold">Industry directory — click a row to expand</div>
          <div class="overflow-x-auto max-h-[55vh]"><table class="w-full text-sm">
            <thead class="bg-surf2 text-muted text-xs uppercase sticky top-0"><tr>
              <th class="text-left px-4 py-2.5">#</th><th class="text-left px-4 py-2.5">Industry</th>
              <th class="text-right px-4 py-2.5">Stocks</th><th class="text-right px-4 py-2.5">Countries</th>
            </tr></thead>
            <tbody id="ind-table-body"></tbody>
          </table></div>
        </div>
      </div>`;
    renderIndustryTableRows(rows);
    const top = rows.slice(0, 15);
    destroyChart('indAllPie');
    charts.indAllPie = new Chart($('indAllPie'), {
      type: 'doughnut',
      data: { labels: top.map(r => r.industry.length > 16 ? r.industry.slice(0,14)+'…' : r.industry),
        datasets: [{ data: top.map(r => r.stocks), backgroundColor: COLORS, borderWidth: 0 }] },
      options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'right', labels: { color: '#94a3b8', boxWidth: 8, font: { size: 9 } } } } }
    });
    destroyChart('indCountryBar');
    charts.indCountryBar = new Chart($('indCountryBar'), {
      type: 'bar',
      data: { labels: top.map(r => r.industry.length > 12 ? r.industry.slice(0,10)+'…' : r.industry),
        datasets: [{ data: top.map(r => r.countries || 0), backgroundColor: COLORS[4] || COLORS[0], borderRadius: 3 }] },
      options: { indexAxis: 'y', responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } },
        scales: { x: { ticks: { color: '#94a3b8' }, grid: { color: 'rgba(128,128,128,0.12)' } }, y: { ticks: { color: '#94a3b8', font: { size: 9 } }, grid: { display: false } } } }
    });
    if (sectors?.length) {
      destroyChart('indSectorPie');
      charts.indSectorPie = new Chart($('indSectorPie'), {
        type: 'doughnut',
        data: { labels: sectors.map(s => s.sector), datasets: [{ data: sectors.map(s => s.industries || s.stocks), backgroundColor: COLORS, borderWidth: 0 }] },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'right', labels: { color: '#94a3b8', boxWidth: 8, font: { size: 9 } } } } }
      });
    }
  } catch (e) {
    $('content').innerHTML = `<p class="text-red-400">${e.message}</p>`;
  }
}
function filterIndustriesList(q) {
  const rows = state.industriesList || [];
  const query = (q||'').toLowerCase();
  const filtered = query ? rows.filter(r => (r.industry||'').toLowerCase().includes(query)) : rows;
  state.industryOpenIdx = null;
  renderIndustryTableRows(filtered);
}
function renderIndustryTableRows(list) {
  const open = state.industryOpenIdx;
  const body = $('ind-table-body');
  if (!body) return;
  const rows = list || state.industriesList || [];
  body.innerHTML = rows.map((r, i) => `
    <tr class="border-b border-app hover:bg-surf2 cursor-pointer ${open===i?'bg-violet-500/10':''}" onclick="toggleIndustryRow(${i})">
      <td class="px-4 py-2.5 text-muted text-xs">${i+1}</td>
      <td class="px-4 py-2.5 font-medium">${r.industry} <span class="text-[10px] text-muted">${open===i?'▲':'▼'}</span></td>
      <td class="px-4 py-2.5 text-right font-mono text-violet-400">${Number(r.stocks).toLocaleString()}</td>
      <td class="px-4 py-2.5 text-right font-mono">${r.countries ?? '—'}</td>
    </tr>
    ${open===i ? `<tr class="border-b border-app bg-surf2/40"><td colspan="4" class="px-4 py-3">
      <div class="grid grid-cols-1 sm:grid-cols-3 gap-3 items-center">
        <div class="chart-box" style="height:140px"><canvas id="ind-drop-cty-${i}"></canvas></div>
        <div class="text-center space-y-1">
          <div class="text-xs text-muted">Total stocks</div>
          <div class="text-xl font-mono font-bold text-violet-400">${Number(r.stocks).toLocaleString()}</div>
          <div class="text-xs text-muted">${r.countries||0} countries</div>
        </div>
        <div class="text-center">
          <button type="button" onclick="event.stopPropagation(); openIndustryPage(this.dataset.name)" data-name="${String(r.industry).replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/'/g,'&#39;')}" class="bg-brand-600 hover:bg-brand-500 text-white text-xs font-medium px-3 py-1.5 rounded-lg">Detailed analysis →</button>
        </div>
      </div>
    </td></tr>` : ''}
  `).join('') || `<tr><td colspan="4" class="px-4 py-6 text-center text-muted">No matches</td></tr>`;
  if (open != null && rows[open]) loadIndustryDropdown(open, rows[open].industry);
}
function toggleIndustryRow(i) {
  state.industryOpenIdx = state.industryOpenIdx === i ? null : i;
  const q = $('ind-list-q')?.value || '';
  const all = state.industriesList || [];
  const filtered = q ? all.filter(r => (r.industry||'').toLowerCase().includes(q.toLowerCase())) : all;
  renderIndustryTableRows(filtered);
}
async function loadIndustryDropdown(i, name) {
  try {
    const d = await fetchJSON(`${API}/industry/${encodeURIComponent(name)}`);
    const cty = $(`ind-drop-cty-${i}`);
    if (cty && d.by_country?.length) {
      destroyChart(`indDropCty${i}`);
      charts[`indDropCty${i}`] = new Chart(cty, {
        type: 'bar',
        data: {
          labels: d.by_country.slice(0, 8).map(x => x.country),
          datasets: [{ data: d.by_country.slice(0, 8).map(x => x.count), backgroundColor: COLORS[4] || COLORS[0], borderRadius: 3 }]
        },
        options: {
          indexAxis: 'y',
          responsive: true,
          maintainAspectRatio: false,
          plugins: { legend: { display: false }, title: { display: true, text: 'Country mix', color: '#94a3b8', font: { size: 10 } } },
          scales: {
            x: { ticks: { color: '#94a3b8', font: { size: 8 } }, grid: { display: false } },
            y: { ticks: { color: '#94a3b8', font: { size: 8 } }, grid: { display: false } }
          }
        }
      });
    }
  } catch (e) { console.error(e); }
}

async function renderIndustryPage() {
  const name = state.industry;
  $('breadcrumb').textContent = name;
  try {
    const d = await fetchJSON(`${API}/industry/${encodeURIComponent(name)}`);
    $('content').innerHTML = `
      <div class="space-y-5 fade max-w-6xl">
        <div>
          <button onclick="navigate('industries')" class="text-xs text-brand-400 hover:underline mb-2">← All industries</button>
          <h1 class="text-2xl font-bold">${d.industry}</h1>
          <p class="text-muted text-sm mt-1">${d.total_stocks.toLocaleString()} stocks across ${d.by_country.length} countries</p>
        </div>
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div class="bg-surf border border-app rounded-xl p-4">
            <h3 class="text-sm font-semibold mb-3">By Country</h3>
            <div class="chart-box"><canvas id="indCountries"></canvas></div>
          </div>
          <div class="bg-surf border border-app rounded-xl p-4">
            <h3 class="text-sm font-semibold mb-3">By Sector</h3>
            <div class="chart-box"><canvas id="indSectors"></canvas></div>
          </div>
        </div>
        <div>
          <h3 class="text-sm font-semibold mb-3">Stocks in this industry</h3>
          <div id="ind-stocks-wrap" class="bg-surf border border-app rounded-xl overflow-hidden">
            <div class="flex justify-center py-10"><div class="loader"></div></div>
          </div>
        </div>
      </div>`;
    if (d.by_country?.length) {
      destroyChart('indCountries');
      charts.indCountries = new Chart($('indCountries'), {
        type: 'bar',
        data: { labels: d.by_country.slice(0,12).map(x=>x.country), datasets: [{ data: d.by_country.slice(0,12).map(x=>x.count), backgroundColor: COLORS[4]||COLORS[0], borderRadius: 3 }] },
        options: { indexAxis: 'y', responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } },
          scales: { x: { grid: { color: 'rgba(128,128,128,0.15)' }, ticks: { color: '#94a3b8' } }, y: { grid: { display: false }, ticks: { color: '#94a3b8', font: { size: 11 } } } } }
      });
    }
    if (d.by_sector?.length) {
      destroyChart('indSectors');
      charts.indSectors = new Chart($('indSectors'), {
        type: 'doughnut',
        data: { labels: d.by_sector.map(x=>x.sector), datasets: [{ data: d.by_sector.map(x=>x.count), backgroundColor: COLORS, borderWidth: 0 }] },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'right', labels: { color: '#94a3b8', boxWidth: 8, font: { size: 9 } } } } }
      });
    } else {
      // Part 4: hide by-sector chart when no sector classification
      const secCanvas = $('indSectors');
      if (secCanvas) {
        const card = secCanvas.closest('.bg-surf') || secCanvas.parentElement;
        if (card) card.classList.add('hidden');
      }
    }
    loadIndustryStocks(1);
  } catch (e) {
    $('content').innerHTML = `<p class="text-red-400">${e.message}</p>`;
  }
}

async function loadIndustryStocks(page) {
  const name = state.industry;
  try {
    const d = await fetchJSON(`${API}/industry/${encodeURIComponent(name)}/stocks?page=${page}&limit=50`);
    const wrap = $('ind-stocks-wrap');
    if (!wrap) return;
    wrap.innerHTML = `
      <div class="overflow-x-auto"><table class="w-full text-sm">
        <thead class="bg-surf2 text-muted text-xs uppercase"><tr>
          <th class="text-left px-3 py-2">Symbol</th><th class="text-left px-3 py-2">Company</th>
          <th class="text-left px-3 py-2 hidden md:table-cell">Exchange</th><th class="text-left px-3 py-2">Country</th>
          <th class="text-left px-3 py-2 hidden lg:table-cell">Sector</th>
        </tr></thead>
        <tbody>${d.results.map(r => `
          <tr class="hover:bg-surf2 cursor-pointer border-b border-app" onclick='openStockModal(${JSON.stringify(r).replace(/'/g,"&#39;")})'>
            <td class="px-3 py-2 font-mono text-brand-400 text-xs">${r.symbol}</td>
            <td class="px-3 py-2 max-w-[160px] truncate">${r.company_name||'—'}</td>
            <td class="px-3 py-2 text-xs text-muted hidden md:table-cell">${r.stock_exchange||''}</td>
            <td class="px-3 py-2 text-xs">${r.country||''}</td>
            <td class="px-3 py-2 text-xs text-muted hidden lg:table-cell">${r.sector||'—'}</td>
          </tr>`).join('')}</tbody>
      </table></div>
      <div class="flex justify-center gap-2 py-3 text-sm">
        ${page>1?`<button onclick="loadIndustryStocks(${page-1})" class="px-3 py-1 rounded bg-surf2">Prev</button>`:''}
        <span class="text-muted">${d.page}/${d.pages}</span>
        ${page<d.pages?`<button onclick="loadIndustryStocks(${page+1})" class="px-3 py-1 rounded bg-surf2">Next</button>`:''}
      </div>`;
  } catch (e) { console.error(e); }
}

async function renderSectorsList() {
  $('breadcrumb').textContent = 'Sectors';
  $('content').innerHTML = `<div class="flex justify-center py-16"><div class="loader"></div></div>`;
  try {
    let rows = await fetchJSON(`${API}/sectors`);
    rows = (rows || []).filter(r => r.sector && !/Textiles,\s*Apparel\s*&/.test(r.sector) && !/Ã/.test(r.sector));
    // Standard 11 order when present
    const ORDER = ['Communication Services','Consumer Discretionary','Consumer Staples','Energy','Financials','Health Care','Industrials','Information Technology','Materials','Real Estate','Utilities'];
    rows.sort((a,b) => {
      const ia = ORDER.indexOf(a.sector), ib = ORDER.indexOf(b.sector);
      if (ia >= 0 && ib >= 0) return ia - ib;
      if (ia >= 0) return -1;
      if (ib >= 0) return 1;
      return (b.stocks||0) - (a.stocks||0);
    });
    state.sectorsList = rows;
    state.sectorOpenIdx = null;
    $('content').innerHTML = `
      <div class="space-y-5 fade max-w-6xl">
        <div>
          <h1 class="text-2xl font-bold">Sectors</h1>
          <p class="text-sm text-muted mt-1">${rows.length} global standard sectors · full equity universe</p>
        </div>
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div class="bg-surf border border-app rounded-xl p-4">
            <h3 class="text-sm font-semibold mb-3">Sector-wise stock distribution</h3>
            <div class="chart-box"><canvas id="secAllPie"></canvas></div>
          </div>
          <div class="bg-surf border border-app rounded-xl p-4">
            <h3 class="text-sm font-semibold mb-3">Country coverage by sector</h3>
            <div class="chart-box"><canvas id="secCountryBar"></canvas></div>
          </div>
        </div>
        <div class="bg-surf border border-app rounded-xl overflow-hidden">
          <div class="px-4 py-3 border-b border-app text-sm font-semibold">All sectors — click a row to expand</div>
          <div class="overflow-x-auto">
            <table class="w-full text-sm">
              <thead class="bg-surf2 text-muted text-xs uppercase sticky top-0">
                <tr>
                  <th class="text-left px-4 py-2.5">#</th>
                  <th class="text-left px-4 py-2.5">Name</th>
                  <th class="text-right px-4 py-2.5">Stocks</th>
                  <th class="text-right px-4 py-2.5">Countries</th>
                  <th class="text-right px-4 py-2.5">Industries</th>
                </tr>
              </thead>
              <tbody id="sec-table-body"></tbody>
            </table>
          </div>
        </div>
      </div>`;
    renderSectorTableRows();
    destroyChart('secAllPie');
    charts.secAllPie = new Chart($('secAllPie'), {
      type: 'doughnut',
      data: { labels: rows.map(r => r.sector), datasets: [{ data: rows.map(r => r.stocks), backgroundColor: COLORS, borderWidth: 0 }] },
      options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'right', labels: { color: '#94a3b8', boxWidth: 10, font: { size: 10 } } } } }
    });
    destroyChart('secCountryBar');
    charts.secCountryBar = new Chart($('secCountryBar'), {
      type: 'bar',
      data: { labels: rows.map(r => r.sector.length > 16 ? r.sector.slice(0,14)+'…' : r.sector),
        datasets: [{ label: 'Countries', data: rows.map(r => r.countries || 0), backgroundColor: COLORS[1] || '#34d399', borderRadius: 4 }] },
      options: { indexAxis: 'y', responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } },
        scales: { x: { ticks: { color: '#94a3b8' }, grid: { color: 'rgba(128,128,128,0.12)' } }, y: { ticks: { color: '#94a3b8', font: { size: 10 } }, grid: { display: false } } } }
    });
  } catch (e) {
    $('content').innerHTML = `<p class="text-red-400">${e.message}</p>`;
  }
}

function renderSectorTableRows() {
  const rows = state.sectorsList || [];
  const open = state.sectorOpenIdx;
  const body = $('sec-table-body');
  if (!body) return;
  body.innerHTML = rows.map((r, i) => `
    <tr class="border-b border-app hover:bg-surf2 cursor-pointer ${open===i?'bg-brand-500/10':''}" onclick="toggleSectorRow(${i})">
      <td class="px-4 py-2.5 text-muted text-xs">${i+1}</td>
      <td class="px-4 py-2.5 font-medium">${r.sector} <span class="text-[10px] text-muted">${open===i?'▲':'▼'}</span></td>
      <td class="px-4 py-2.5 text-right font-mono text-amber-400">${Number(r.stocks).toLocaleString()}</td>
      <td class="px-4 py-2.5 text-right font-mono">${r.countries ?? '—'}</td>
      <td class="px-4 py-2.5 text-right font-mono">${r.industries ?? '—'}</td>
    </tr>
    ${open===i ? `<tr class="border-b border-app bg-surf2/40"><td colspan="5" class="px-4 py-3">
      <div class="grid grid-cols-1 sm:grid-cols-3 gap-3 items-center">
        <div class="chart-box" style="height:140px"><canvas id="sec-drop-ind-${i}"></canvas></div>
        <div class="chart-box" style="height:140px"><canvas id="sec-drop-cty-${i}"></canvas></div>
        <div class="text-center space-y-2">
          <div class="text-xs text-muted">Total stocks</div>
          <div class="text-xl font-mono font-bold text-amber-400">${Number(r.stocks).toLocaleString()}</div>
          <button type="button" onclick="event.stopPropagation(); openSectorPage(this.dataset.name)" data-name="${String(r.sector).replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/'/g,'&#39;')}" class="bg-brand-600 hover:bg-brand-500 text-white text-xs font-medium px-3 py-1.5 rounded-lg">Detailed analysis →</button>
        </div>
      </div>
    </td></tr>` : ''}
  `).join('');
  if (open != null && rows[open]) loadSectorDropdown(open, rows[open].sector);
}
async function toggleSectorRow(i) {
  state.sectorOpenIdx = state.sectorOpenIdx === i ? null : i;
  renderSectorTableRows();
}
async function loadSectorDropdown(i, sectorName) {
  try {
    const d = await fetchJSON(`${API}/sector/${encodeURIComponent(sectorName)}`);
    const indCanvas = $(`sec-drop-ind-${i}`);
    const ctyCanvas = $(`sec-drop-cty-${i}`);
    if (indCanvas && d.industries?.length) {
      destroyChart(`secDropInd${i}`);
      charts[`secDropInd${i}`] = new Chart(indCanvas, {
        type: 'doughnut',
        data: { labels: d.industries.slice(0,8).map(x=>x.industry.length>14?x.industry.slice(0,12)+'…':x.industry),
          datasets: [{ data: d.industries.slice(0,8).map(x=>x.count), backgroundColor: COLORS, borderWidth: 0 }] },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false }, title: { display: true, text: 'Industry mix', color: '#94a3b8', font: { size: 10 } } } }
      });
    }
    if (ctyCanvas && d.by_country?.length) {
      destroyChart(`secDropCty${i}`);
      charts[`secDropCty${i}`] = new Chart(ctyCanvas, {
        type: 'bar',
        data: { labels: d.by_country.slice(0,6).map(x=>x.country), datasets: [{ data: d.by_country.slice(0,6).map(x=>x.count), backgroundColor: COLORS[0], borderRadius: 3 }] },
        options: { indexAxis: 'y', responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false }, title: { display: true, text: 'Countries', color: '#94a3b8', font: { size: 10 } } },
          scales: { x: { ticks: { color: '#94a3b8', font: { size: 8 } }, grid: { display: false } }, y: { ticks: { color: '#94a3b8', font: { size: 8 } }, grid: { display: false } } } }
      });
    }
  } catch (e) { console.error(e); }
}

/* ========== STOCK MODAL ========== */
function closeStockModal() {
  $('stock-modal').classList.add('hidden');
  $('stock-modal').classList.remove('flex');
  destroyChart('modalChart');
}

async function openStockModal(stock) {
  state.stock = stock;
  const modal = $('stock-modal');
  modal.classList.remove('hidden'); modal.classList.add('flex');
  $('modal-symbol').textContent = stock.symbol;
  $('modal-name').textContent = stock.company_name || '';
  $('modal-meta').innerHTML = `<div class="col-span-full flex justify-center py-4"><div class="loader"></div></div>`;
  $('modal-summary').textContent = '';
  destroyChart('modalChart');
  $('btn-indepth').onclick = () => { closeStockModal(); navigate('analysis', { stock }); };

  const HEAVY_MSG = `
        <div class="bg-surf2 rounded-lg p-3"><div class="text-xs text-muted">Sector</div><div class="text-sm">${stock.sector||'—'}</div></div>
        <div class="bg-surf2 rounded-lg p-3"><div class="text-xs text-muted">Industry</div><div class="text-sm">${stock.industry||'—'}</div></div>
        <div class="bg-surf2 rounded-lg p-3 col-span-2">
          <div class="text-xs text-muted">Live snapshot</div>
          <div class="text-amber-400 text-sm leading-relaxed">The website is under heavy usage right now. Please click the <strong>In-depth analysis</strong> button below for a detailed multi-source analysis of this listing.</div>
        </div>`;

  const withTimeout = (promise, ms) => Promise.race([
    promise,
    new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), ms)),
  ]);

  try {
    const [live, hist] = await withTimeout(Promise.all([
      fetchJSON(`${API}/live/${encodeURIComponent(stock.symbol)}?exchange=${encodeURIComponent(stock.exchange_code||'')}`),
      fetchJSON(`${API}/history/${encodeURIComponent(stock.symbol)}?exchange=${encodeURIComponent(stock.exchange_code||'')}&period=1y`),
    ]), 30000);
    let meta = '';
    if (live && live.available) {
      meta = `
        <div class="bg-surf2 rounded-lg p-3"><div class="text-xs text-muted">Price</div><div class="font-mono font-semibold">${fmtNum(live.price)} ${live.currency||''}</div></div>
        <div class="bg-surf2 rounded-lg p-3"><div class="text-xs text-muted">Market Cap</div><div class="font-mono font-semibold">${fmtNum(live.market_cap)}</div></div>
        <div class="bg-surf2 rounded-lg p-3"><div class="text-xs text-muted">1Y Change</div><div class="font-mono font-semibold ${live.year_change>0?'text-emerald-400':live.year_change<0?'text-red-400':''}">${fmtPct(live.year_change)}</div></div>
        <div class="bg-surf2 rounded-lg p-3"><div class="text-xs text-muted">Sector</div><div class="text-sm">${live.sector||stock.sector||'—'}</div></div>
        <div class="bg-surf2 rounded-lg p-3"><div class="text-xs text-muted">Industry</div><div class="text-sm">${live.industry||stock.industry||'—'}</div></div>
        <div class="bg-surf2 rounded-lg p-3"><div class="text-xs text-muted">Div Yield</div><div class="font-mono">${live.dividend_yield!=null?(live.dividend_yield*100).toFixed(2)+'%':'—'}</div></div>`;
    } else {
      meta = HEAVY_MSG;
    }
    $('modal-meta').innerHTML = meta;
    // description intentionally removed from popup per product request
    $('modal-summary').textContent = '';
    if (hist && hist.available && hist.closes?.length) {
      const labels = hist.dates.map(d => {
        const p = String(d).slice(0,10).split('-');
        return p.length===3 ? `${p[2]}/${p[1]}/${p[0]}` : d;
      });
      const currency = (live && live.currency) || '';
      destroyChart('modalChart');
      charts.modalChart = new Chart($('modal-chart'), {
        type: 'line',
        data: { labels, datasets: [{ label: `Price (${currency})`, data: hist.closes, borderColor: '#0ea5e9', backgroundColor: 'rgba(14,165,233,0.08)', fill: true, tension: 0.2, pointRadius: 0 }] },
        options: {
          responsive: true, maintainAspectRatio: false,
          plugins: {
            legend: { display: false },
            tooltip: {
              callbacks: {
                label: (ctx) => `${currency} ${Number(ctx.parsed.y).toLocaleString(undefined,{maximumFractionDigits:4})}`
              }
            }
          },
          scales: {
            x: { grid: { display: false }, ticks: { color: '#64748b', maxTicksLimit: 6, font: { size: 10 } }, title: { display: true, text: 'Date (dd/mm/yyyy)', color: '#64748b', font: { size: 10 } } },
            y: { grid: { color: 'rgba(128,128,128,0.12)' }, ticks: { color: '#94a3b8', font: { size: 10 } }, title: { display: true, text: currency || 'Price', color: '#64748b', font: { size: 10 } } }
          }
        }
      });
    }
  } catch (e) {
    $('modal-meta').innerHTML = `
        <div class="bg-surf2 rounded-lg p-3"><div class="text-xs text-muted">Sector</div><div class="text-sm">${stock.sector||'—'}</div></div>
        <div class="bg-surf2 rounded-lg p-3"><div class="text-xs text-muted">Industry</div><div class="text-sm">${stock.industry||'—'}</div></div>
        <div class="bg-surf2 rounded-lg p-3 col-span-2">
          <div class="text-xs text-muted">Live snapshot</div>
          <div class="text-amber-400 text-sm leading-relaxed">The website is under heavy usage right now. Please click the <strong>In-depth analysis</strong> button below for a detailed multi-source analysis of this listing.</div>
        </div>`;
    $('modal-summary').textContent = '';
  }
}

/* ========== ANALYSIS PAGE ========== */
const DATA_DISCLAIMER = '';
function DISCLAIMER_BOX(extraClass = '') { return ''; }

async function renderAnalysis() {
  const stock = state.stock;
  if (!stock) { navigate('screener'); return; }
  state.lastStock = stock;
  state.chartPeriod = state.chartPeriod || '1y';
  state.finFreq = state.finFreq || 'annual';
  state.finSubTab = state.finSubTab || 'table'; // table | chart for statement tabs
  $('breadcrumb').textContent = `${stock.symbol} · Analysis`;
  $('content').innerHTML = `
    <div class="space-y-5 fade max-w-7xl">
      
      <!-- Header -->
      <div class="bg-surf border border-app rounded-2xl p-4 sm:p-5">
        <div class="flex flex-col lg:flex-row lg:items-start justify-between gap-4">
          <div class="min-w-0">
            <div class="flex flex-wrap items-center gap-2 mb-1">
              <h1 class="text-xl sm:text-2xl font-bold truncate">${stock.company_name || stock.symbol}</h1>
              <span class="text-xs font-mono px-2 py-0.5 rounded-md bg-surf2 border border-app text-brand-400">${stock.symbol}</span>
            </div>
            <div class="text-sm text-muted flex flex-wrap gap-x-2 gap-y-1">
              <span>${stock.stock_exchange || '—'}</span>
              <span>·</span>
              <span class="inline-flex items-center gap-1">${countryFlag(stock.country||'')} ${stock.country||'—'}</span>
              <span>·</span>
              <span>${stock.sector || '—'}</span>
              ${stock.industry ? `<span>·</span><span class="text-xs">${stock.industry}</span>` : ''}
            </div>
          </div>
          <div id="analysis-price" class="text-left lg:text-right shrink-0">
            <div class="loader mx-auto lg:ml-auto"></div>
          </div>
        </div>
        <!-- Mini sparkline strip -->
        <div class="mt-4 h-16"><canvas id="spark-chart"></canvas></div>
      </div>

      <!-- Tabs -->
      <div class="border-b border-app overflow-x-auto">
        <div class="flex gap-0 min-w-max" id="analysis-tabs">
          ${['Overview','Price Chart','Income Statement','Balance Sheet','Cash Flow','Ratios & KPIs','Dividends','Other Listings'].map((t,i) =>
            `<button onclick="showTab(${i})" data-tab="${i}" class="tab-btn relative shrink-0 px-3 sm:px-4 py-2.5 text-sm font-medium transition
              ${i===0?'text-brand-400':'text-muted hover:text-app'}">${t}
              <span class="tab-underline absolute left-2 right-2 bottom-0 h-0.5 rounded-full ${i===0?'bg-brand-500':'bg-transparent'}"></span>
            </button>`
          ).join('')}
        </div>
      </div>

      <div id="tab-content" class="min-h-[320px]">
        <div class="flex justify-center py-16"><div class="loader"></div></div>
      </div>
    </div>`;

  // Multi-source parallel compile: yfinance + free API + scrape (server-side simultaneous)
  // + history + listings in parallel with the bundle
  const [bundle, hist, listings] = await Promise.all([
    fetchJSON(`${API}/stock-bundle/${encodeURIComponent(stock.symbol)}?exchange=${encodeURIComponent(stock.exchange_code||'')}&freq=${state.finFreq||'annual'}`).catch(()=>({available:false})),
    fetchJSON(`${API}/history/${encodeURIComponent(stock.symbol)}?exchange=${encodeURIComponent(stock.exchange_code||'')}&period=1y`).catch(()=>({available:false})),
    fetchJSON(`${API}/listings/${encodeURIComponent(stock.symbol)}?company=${encodeURIComponent(stock.company_name||'')}`).catch(()=>({listings:[]})),
  ]);

  // Shape bundle into live + fin structures expected by existing UI
  const live = {
    available: !!(bundle && bundle.available),
    name: bundle?.name,
    price: bundle?.price,
    currency: bundle?.currency,
    market_cap: bundle?.market_cap,
    year_change: bundle?.year_change,
    dividend_yield: bundle?.dividend_yield,
    sector: bundle?.sector,
    industry: bundle?.industry,
    summary: bundle?.summary,
    info: bundle?.info || {},
    ticker: bundle?.ticker,
    sources: bundle?.sources,
  };
  const fin = {
    available: !!(bundle && (bundle.income_statement || bundle.balance_sheet || bundle.cashflow)),
    income_statement: bundle?.income_statement || {},
    balance_sheet: bundle?.balance_sheet || {},
    cashflow: bundle?.cashflow || {},
    dividends_history: bundle?.dividends_history || [],
    ratios: bundle?.ratios || {},
    freq: bundle?.freq || state.finFreq || 'annual',
    ticker: bundle?.ticker,
    snapshot: bundle?.snapshot || {},
    sources: bundle?.sources,
  };
  // Prefer dedicated history endpoint; fall back to bundle preview
  let histFinal = hist;
  if ((!hist || !hist.available) && bundle?.history_preview?.closes?.length) {
    histFinal = { available: true, ...bundle.history_preview };
  }
  state.analysisData = { live, hist: histFinal, fin, listings, bundle };
  state.chartPeriod = '1y';

  const priceEl = $('analysis-price');
  if (live.available && priceEl) {
    const chg = live.year_change;
    const chgCls = chg > 0 ? 'text-emerald-400' : chg < 0 ? 'text-red-400' : 'text-muted';
    priceEl.innerHTML = `
      <div class="text-2xl sm:text-3xl font-bold font-mono tracking-tight">${fmtNum(live.price)}
        <span class="text-sm font-sans font-normal text-muted ml-1">${live.currency||''}</span>
      </div>
      <div class="text-sm ${chgCls} font-mono mt-0.5">${fmtPct(chg)} <span class="text-muted font-sans">1Y</span></div>
      ${live.market_cap ? `<div class="text-xs text-muted mt-1">Mkt Cap ${fmtNum(live.market_cap)}</div>` : ''}`;
  } else if (priceEl) {
    priceEl.innerHTML = `<div class="text-sm text-muted">Live price unavailable</div>`;
  }

  // Sparkline
  if (hist.available && hist.closes?.length && $('spark-chart')) {
    destroyChart('sparkChart');
    const up = hist.closes[hist.closes.length-1] >= hist.closes[0];
    charts.sparkChart = new Chart($('spark-chart'), {
      type: 'line',
      data: { labels: hist.dates, datasets: [{ data: hist.closes, borderColor: up ? '#34d399' : '#f87171',
        backgroundColor: up ? 'rgba(52,211,153,0.08)' : 'rgba(248,113,113,0.08)', fill: true, tension: 0.3, pointRadius: 0, borderWidth: 1.5 }] },
      options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false }, tooltip: { enabled: false } },
        scales: { x: { display: false }, y: { display: false } } }
    });
  }
  showTab(0);
}

function showTab(idx) {
  document.querySelectorAll('.tab-btn').forEach((b, i) => {
    const on = i === idx;
    b.classList.toggle('text-brand-400', on);
    b.classList.toggle('text-muted', !on);
    const u = b.querySelector('.tab-underline');
    if (u) u.className = `tab-underline absolute left-2 right-2 bottom-0 h-0.5 rounded-full ${on ? 'bg-brand-500' : 'bg-transparent'}`;
  });
  const box = $('tab-content');
  if (!box) return;
  const stock = state.stock || {};
  const { live, hist, fin, listings } = state.analysisData || {};
  const currency = live?.currency || '';
  const info = live?.info || {};
  const snap = fin?.info_snapshot || {};

  /* ---- OVERVIEW ---- */
  if (idx === 0) {
    const summary = snap.summary || info.longBusinessSummary || '';
    const cards = [
      ['Market Cap', live?.market_cap ?? snap.marketCap, true],
      ['P/E (TTM)', info.trailingPE ?? snap.trailingPE, false],
      ['Forward P/E', info.forwardPE ?? snap.forwardPE, false],
      ['EPS (TTM)', info.trailingEps, false],
      ['Dividend Yield', live?.dividend_yield != null ? (live.dividend_yield*100).toFixed(2)+'%' : (snap.dividendYield != null ? (Number(snap.dividendYield)*100).toFixed(2)+'%' : null), false],
      ['Beta', info.beta ?? snap.beta, false],
      ['52W High', info.fiftyTwoWeekHigh, true],
      ['52W Low', info.fiftyTwoWeekLow, true],
      ['Volume', info.volume ?? info.regularMarketVolume, true],
      ['Avg Volume', info.averageVolume, true],
      ['Shares Out', info.sharesOutstanding, true],
      ['Float', info.floatShares, true],
    ];
    box.innerHTML = `
      <div class="grid grid-cols-1 lg:grid-cols-3 gap-4 animate-slide-up">
        <div class="lg:col-span-2 space-y-4">
          <div class="bg-surf border border-app rounded-xl p-4 sm:p-5">
            <h3 class="text-sm font-semibold mb-2">Company Profile</h3>
            <p class="text-sm text-muted leading-relaxed">${summary ? summary.slice(0, 900) + (summary.length > 900 ? '…' : '') : 'No company description available for this listing.'}</p>
            <div class="mt-4 grid grid-cols-2 sm:grid-cols-3 gap-3 text-sm">
              <div><div class="text-xs text-muted">Sector</div><div class="font-medium">${stock.sector || snap.sector || info.sector || '—'}</div></div>
              <div><div class="text-xs text-muted">Industry</div><div class="font-medium">${stock.industry || snap.industry || info.industry || '—'}</div></div>
              <div><div class="text-xs text-muted">Country</div><div class="font-medium flex items-center gap-1">${countryFlag(stock.country||'')} ${stock.country||'—'}</div></div>
              <div><div class="text-xs text-muted">Exchange</div><div class="font-medium">${stock.stock_exchange||'—'}</div></div>
              <div><div class="text-xs text-muted">Website</div><div class="font-medium truncate">${snap.website || info.website ? `<a class="text-brand-400 hover:underline" href="${snap.website||info.website}" target="_blank" rel="noopener">Visit</a>` : '—'}</div></div>
              <div><div class="text-xs text-muted">Other listings</div><div class="font-medium"><button type="button" onclick="showTab(7)" class="text-brand-400 hover:underline text-sm">View all listings →</button></div></div>
            </div>
          </div>
          <div class="bg-surf border border-app rounded-xl p-4">
            <div class="flex items-center justify-between mb-2">
              <h3 class="text-sm font-semibold">Price (1Y)</h3>
              <button onclick="showTab(1)" class="text-xs text-brand-400 hover:underline">Full chart →</button>
            </div>
            <div class="chart-box" style="height:220px"><canvas id="ov-chart"></canvas></div>
          </div>
        </div>
        <div class="space-y-3">
          <div class="flex items-center justify-between gap-2 px-1 flex-wrap">
            <h3 class="text-sm font-semibold">Key Insights</h3>
            <div class="flex flex-wrap gap-1.5">
              <button type="button" onclick="generateReportFromAnalysis()"
                class="shrink-0 bg-brand-600 hover:bg-brand-500 text-white text-xs font-medium px-3 py-1.5 rounded-lg btn-press">
                Generate Report
              </button>
              <button type="button" onclick="downloadStatementCsv('income')"
                class="shrink-0 bg-surf2 border border-app text-xs font-medium px-3 py-1.5 rounded-lg">CSV</button>
              <button type="button" onclick="openGlossaryDrawer()"
                class="shrink-0 bg-surf2 border border-app text-xs font-medium px-3 py-1.5 rounded-lg">Glossary</button>
            </div>
          </div>
          <div id="data-provenance" class="text-[11px] text-muted px-1"></div>
          <div class="grid grid-cols-2 gap-2">
            ${cards.map(([k,v,isNum]) => `
              <div class="bg-surf border border-app rounded-xl p-3 card-lift">
                <div class="text-[11px] text-muted uppercase tracking-wide">${k}</div>
                <div class="font-mono font-semibold mt-1 text-sm sm:text-base">${v!=null && v!=='' ? (isNum || typeof v==='number' ? fmtNum(v) : v) : '—'}</div>
              </div>`).join('')}
          </div>
        </div>
      </div>`;
    // Provenance badge + educational strip
    const prov = document.getElementById('data-provenance');
    if (prov) {
      const srcs = live?.sources || fin?.sources || bundle?.sources || {};
      let label = 'Live multi-source';
      let cls = 'text-emerald-400';
      if (srcs && (srcs.local_country_pack?.available || srcs.local_country_pack === true)) {
        // object or bool
      }
      const srcStr = JSON.stringify(srcs || {});
      if (srcStr.includes('local_country_pack') && (srcStr.includes('"available": true') || srcStr.includes('"local_country_pack": true'))) {
        label = 'Offline country pack (last resort)';
        cls = 'text-amber-400';
      } else if (live?.available) {
        label = 'Live data';
        cls = 'text-emerald-400';
      } else if (!live?.available && !fin?.available) {
        label = 'Limited data';
        cls = 'text-amber-400';
      }
      const ccy = live?.currency || '';
      const asof = new Date().toISOString().slice(0, 16).replace('T',' ');
      prov.innerHTML = `<span class="${cls} font-medium">${label}</span> · As of ${asof}${ccy ? ' · ' + ccy : ''} · <button class="underline text-brand-400" onclick="document.getElementById('how-to-read-box').classList.toggle('hidden')">How to read</button>`;
    }
    // How to read box (students)
    if (!document.getElementById('how-to-read-box') && box) {
      const guide = document.createElement('div');
      guide.id = 'how-to-read-box';
      guide.className = 'hidden mt-3 bg-surf border border-app rounded-xl p-4 text-sm';
      guide.innerHTML = `<h4 class="font-semibold mb-2">How to read this analysis</h4>
        <ol class="list-decimal pl-5 space-y-1 text-muted text-xs">
          <li>Overview = profile + key levels. Generate Report builds the full multi-chapter pack.</li>
          <li>Statements show YoY growth in green (up) / red (down).</li>
          <li>Ratios need industry context — open Glossary for definitions.</li>
          <li>Buy/Hold/Sell in the report is automated synthesis, not personalised advice.</li>
        </ol>`;
      box.appendChild(guide);
    }
    // Load peers quietly
    loadPeersForAnalysis();
    if (hist?.available && hist.closes?.length) {
      destroyChart('ovChart');
      charts.ovChart = new Chart($('ov-chart'), makePriceChartConfig(hist, currency));
    }
  }

  /* ---- PRICE CHART ---- */
  else if (idx === 1) {
    const periods = [
      { id: '1d', label: '1D' }, { id: '7d', label: '7D' }, { id: '15d', label: '15D' },
      { id: '1mo', label: '1M' }, { id: '6mo', label: '6M' }, { id: '1y', label: '1Y' },
      { id: '5y', label: '5Y' }, { id: 'max', label: 'MAX' },
    ];
    const cur = state.chartPeriod || '1y';
    box.innerHTML = `
      <div class="bg-surf border border-app rounded-xl p-4 sm:p-5 animate-slide-up space-y-4">
        <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h3 class="font-semibold">Price Chart</h3>
            <p class="text-xs text-muted mt-0.5">X-axis: date/time · Y-axis: ${currency || 'price'} · Hover for value</p>
          </div>
          <div class="flex flex-wrap gap-1" id="period-btns">
            ${periods.map(p => `
              <button onclick="loadChartPeriod('${p.id}')"
                class="period-btn px-2.5 py-1 rounded-lg text-xs font-medium border transition
                ${p.id===cur ? 'bg-brand-600 text-white border-brand-600' : 'bg-surf2 border-app text-muted hover:text-app'}">${p.label}</button>
            `).join('')}
          </div>
        </div>
        <div id="chart-status" class="text-xs text-muted"></div>
        <div class="chart-box" style="height:400px"><canvas id="analysis-chart"></canvas></div>
        <div class="grid grid-cols-2 sm:grid-cols-4 gap-2 text-sm" id="chart-range-stats"></div>
        <div class="border-t border-app pt-4 mt-2">
          <h4 class="text-sm font-semibold mb-2">Small overview</h4>
          <p class="text-xs text-muted mb-3">Pick a custom window, then run analysis for data-backed insights.</p>
          <div class="flex flex-col sm:flex-row gap-3 items-end">
            <label class="text-xs text-muted flex-1">Start date
              <input id="chart-start" type="date" class="mt-1 w-full bg-surf2 border border-app rounded-lg px-3 py-2 text-sm" />
            </label>
            <label class="text-xs text-muted flex-1">End date
              <input id="chart-end" type="date" class="mt-1 w-full bg-surf2 border border-app rounded-lg px-3 py-2 text-sm" />
            </label>
            <button onclick="runPriceWindowAnalysis()" class="bg-brand-600 hover:bg-brand-500 text-white text-sm font-medium px-4 py-2 rounded-lg btn-press">Start analysis</button>
          </div>
          <div id="price-analysis-out" class="mt-3 text-sm"></div>
        </div>
      </div>`;
    renderAnalysisChart(hist, currency);
  }

  /* ---- INCOME / BALANCE / CASH FLOW ---- */
  else if (idx === 2 || idx === 3 || idx === 4) {
    const kind = idx === 2 ? 'income' : idx === 3 ? 'balance' : 'cashflow';
    const title = idx === 2 ? 'Income Statement' : idx === 3 ? 'Balance Sheet' : 'Cash Flow';
    const dataKey = idx === 2 ? 'income_statement' : idx === 3 ? 'balance_sheet' : 'cashflow';
    const stmt = fin?.[dataKey];
    box.innerHTML = renderFinancialTab(title, kind, stmt, fin);
  }

  /* ---- RATIOS ---- */
  else if (idx === 5) {
    const groups = [
      { title: 'Valuation', items: [
        ['Trailing P/E', info.trailingPE ?? snap.trailingPE],
        ['Forward P/E', info.forwardPE ?? snap.forwardPE],
        ['PEG Ratio', info.pegRatio ?? snap.pegRatio],
        ['Price / Book', info.priceToBook ?? snap.priceToBook],
        ['Price / Sales', info.priceToSalesTrailing12Months ?? snap.priceToSalesTrailing12Months],
        ['EV / EBITDA', info.enterpriseToEbitda ?? snap.enterpriseToEbitda],
      ]},
      { title: 'Profitability', items: [
        ['Gross Margin', pctOrNull(info.grossMargins ?? snap.grossMargins)],
        ['Operating Margin', pctOrNull(info.operatingMargins ?? snap.operatingMargins)],
        ['Profit Margin', pctOrNull(info.profitMargins ?? snap.profitMargins)],
        ['EBITDA Margin', pctOrNull(info.ebitdaMargins ?? snap.ebitdaMargins)],
        ['ROE', pctOrNull(info.returnOnEquity ?? snap.returnOnEquity)],
        ['ROA', pctOrNull(info.returnOnAssets ?? snap.returnOnAssets)],
      ]},
      { title: 'Liquidity & Leverage', items: [
        ['Current Ratio', info.currentRatio ?? snap.currentRatio],
        ['Quick Ratio', info.quickRatio ?? snap.quickRatio],
        ['Debt / Equity', info.debtToEquity ?? snap.debtToEquity],
        ['Total Debt', info.totalDebt ?? snap.totalDebt],
        ['Total Cash', info.totalCash ?? snap.totalCash],
        ['Book Value / Share', info.bookValue ?? snap.bookValue],
      ]},
      { title: 'Growth & Cash', items: [
        ['Revenue Growth', pctOrNull(info.revenueGrowth ?? snap.revenueGrowth)],
        ['Earnings Growth', pctOrNull(info.earningsGrowth ?? snap.earningsGrowth)],
        ['Free Cash Flow', info.freeCashflow ?? snap.freeCashflow],
        ['Operating Cash Flow', info.operatingCashflow ?? snap.operatingCashflow],
        ['Beta', info.beta ?? snap.beta],
        ['Recommendation', info.recommendationKey],
      ]},
    ];
    // Also show scrape raw stats if present
    const raw = snap.raw_stats || {};
    const rawCards = Object.entries(raw).slice(0, 24);
    box.innerHTML = `
      <div class="space-y-5 animate-slide-up">
        ${groups.map(g => `
          <div>
            <h3 class="text-sm font-semibold mb-2 px-1">${g.title}</h3>
            <div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
              ${g.items.map(([k,v]) => `
                <div class="bg-surf border border-app rounded-xl p-3 relative group">
                  <div class="text-[11px] text-muted flex items-center justify-between gap-1">
                    <span>${k}</span>
                    <button type="button" onclick='openRatioExplain(${JSON.stringify(k)}, ${JSON.stringify(fmtMetric(v))})' class="text-[9px] text-brand-400 opacity-70 hover:opacity-100 underline">Explain</button>
                  </div>
                  <div class="font-mono font-semibold mt-1 text-sm">${fmtMetric(v)}</div>
                </div>`).join('')}
            </div>
          </div>`).join('')}
        ${rawCards.length ? `
          <div>
            <h3 class="text-sm font-semibold mb-2 px-1">Additional Statistics</h3>
            <div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
              ${rawCards.map(([k,v]) => `
                <div class="bg-surf border border-app rounded-xl p-3">
                  <div class="text-[11px] text-muted">${k}</div>
                  <div class="font-mono font-semibold mt-1 text-sm">${v ?? '—'}</div>
                </div>`).join('')}
            </div>
          </div>` : ''}
      </div>`;
  }

  /* ---- DIVIDENDS ---- */
  else if (idx === 6) {
    const divs = fin?.dividends_history || [];
    // Aggregate annual totals for richer cards
    const byYear = {};
    (divs || []).forEach(d => {
      const y = String(d.date || '').slice(0, 4);
      if (!y || y.length < 4) return;
      byYear[y] = (byYear[y] || 0) + (Number(d.amount) || 0);
    });
    const years = Object.keys(byYear).sort();
    const annualAmts = years.map(y => byYear[y]);
    let cagr = null;
    if (annualAmts.length >= 2 && annualAmts[0] > 0) {
      const n = annualAmts.length - 1;
      cagr = (Math.pow(annualAmts[annualAmts.length - 1] / annualAmts[0], 1 / n) - 1) * 100;
    }
    const lastAnnual = annualAmts.length ? annualAmts[annualAmts.length - 1] : null;
    const prevAnnual = annualAmts.length >= 2 ? annualAmts[annualAmts.length - 2] : null;
    const yoyAnn = (lastAnnual != null && prevAnnual) ? ((lastAnnual - prevAnnual) / Math.abs(prevAnnual)) * 100 : null;
    const totalPaid = annualAmts.reduce((a, b) => a + b, 0);
    const avgDiv = annualAmts.length ? totalPaid / annualAmts.length : null;
    const yieldVal = live?.dividend_yield != null ? (live.dividend_yield * 100).toFixed(2) + '%'
      : (snap.dividendYield != null ? (Number(snap.dividendYield) * 100).toFixed(2) + '%' : '—');
    const rateVal = info.dividendRate ?? snap.dividendRate ?? (lastAnnual != null ? lastAnnual.toFixed(4) : '—');
    const payoutVal = info.payoutRatio != null ? (info.payoutRatio * 100).toFixed(1) + '%'
      : (snap.payoutRatio != null ? (Number(snap.payoutRatio) * 100).toFixed(1) + '%' : '—');
    const exDiv = info.exDividendDate ? new Date(info.exDividendDate * 1000).toLocaleDateString('en-GB') : '—';
    const fiveYearAvg = info.fiveYearAvgDividendYield != null ? (Number(info.fiveYearAvgDividendYield)).toFixed(2) + '%'
      : (snap.fiveYearAvgDividendYield != null ? Number(snap.fiveYearAvgDividendYield).toFixed(2) + '%' : '—');
    const trailingAnnual = info.trailingAnnualDividendRate ?? snap.trailingAnnualDividendRate ?? '—';
    const trailingYield = info.trailingAnnualDividendYield != null ? (Number(info.trailingAnnualDividendYield) * 100).toFixed(2) + '%'
      : (snap.trailingAnnualDividendYield != null ? (Number(snap.trailingAnnualDividendYield) * 100).toFixed(2) + '%' : '—');

    box.innerHTML = `
      <div class="space-y-4 animate-slide-up">
        <div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          ${[
            ['Dividend Yield', yieldVal],
            ['Annual Dividend', rateVal],
            ['Trailing Annual Div', trailingAnnual],
            ['Trailing Yield', trailingYield],
            ['Payout Ratio', payoutVal],
            ['Ex-Dividend Date', exDiv],
            ['5Y Avg Yield', fiveYearAvg],
            ['YoY Div Growth', yoyAnn != null ? (yoyAnn >= 0 ? '+' : '') + yoyAnn.toFixed(1) + '%' : '—'],
            ['CAGR (hist)', cagr != null ? (cagr >= 0 ? '+' : '') + cagr.toFixed(1) + '%' : '—'],
            ['Payments logged', String(divs.length)],
            ['Years covered', String(years.length || '—')],
            ['Avg annual paid', avgDiv != null ? avgDiv.toFixed(4) : '—'],
          ].map(([k, v]) => `
            <div class="bg-surf border border-app rounded-xl p-3 sm:p-4">
              <div class="text-[11px] text-muted flex justify-between"><span>${k}</span>
                <button type="button" onclick='openRatioExplain(${JSON.stringify(k)}, ${JSON.stringify(String(v))})' class="text-[9px] text-brand-400 underline">Explain</button>
              </div>
              <div class="text-base sm:text-lg font-mono font-semibold mt-1">${v}</div>
            </div>`).join('')}
        </div>
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div class="bg-surf border border-app rounded-xl p-4">
            <h4 class="text-xs font-semibold mb-2">Dividend per share (each payment)</h4>
            <div class="chart-box" style="height:220px"><canvas id="div-amt-chart"></canvas></div>
          </div>
          <div class="bg-surf border border-app rounded-xl p-4">
            <h4 class="text-xs font-semibold mb-2">Annual dividend total</h4>
            <div class="chart-box" style="height:220px"><canvas id="div-annual-chart"></canvas></div>
          </div>
          <div class="bg-surf border border-app rounded-xl p-4">
            <h4 class="text-xs font-semibold mb-2">YoY growth % (by payment)</h4>
            <div class="chart-box" style="height:220px"><canvas id="div-growth-chart"></canvas></div>
          </div>
          <div class="bg-surf border border-app rounded-xl p-4">
            <h4 class="text-xs font-semibold mb-2">Cumulative dividends paid</h4>
            <div class="chart-box" style="height:220px"><canvas id="div-cum-chart"></canvas></div>
          </div>
        </div>
        <div class="bg-surf border border-app rounded-xl overflow-hidden">
          <div class="px-4 py-2 border-b border-app text-sm font-medium flex justify-between">
            <span>Dividend payment log</span>
            <span class="text-xs text-muted">${divs.length} records · total ${totalPaid ? totalPaid.toFixed(4) : '—'}</span>
          </div>
          <div class="overflow-x-auto max-h-80">
            <table class="w-full text-sm">
              <thead class="bg-surf2 text-muted text-xs uppercase sticky top-0"><tr>
                <th class="text-left px-4 py-2">#</th>
                <th class="text-left px-4 py-2">Ex-Date</th>
                <th class="text-right px-4 py-2">Cash Amount</th>
                <th class="text-right px-4 py-2 hidden sm:table-cell">vs prior</th>
              </tr></thead>
              <tbody>
                ${divs.length ? [...divs].sort((a,b)=>String(b.date).localeCompare(String(a.date))).map((d,i,arr) => {
                  const prev = arr[i+1];
                  let chg = '—';
                  if (prev && Number(prev.amount)) {
                    const p = ((Number(d.amount)-Number(prev.amount))/Math.abs(Number(prev.amount)))*100;
                    chg = `<span class="${p>=0?'text-emerald-400':'text-red-400'}">${p>=0?'+':''}${p.toFixed(1)}%</span>`;
                  }
                  return `<tr class="border-b border-app">
                    <td class="px-4 py-2 text-muted text-xs">${i+1}</td>
                    <td class="px-4 py-2 font-mono text-xs">${formatDateDMY(d.date)}</td>
                    <td class="px-4 py-2 text-right font-mono">${d.amount}</td>
                    <td class="px-4 py-2 text-right font-mono text-xs hidden sm:table-cell">${chg}</td>
                  </tr>`;
                }).join('') :
                  `<tr><td colspan="4" class="px-4 py-8 text-center text-muted">No dividend history available from live sources for this listing.</td></tr>`}
              </tbody>
            </table>
          </div>
        </div>
      </div>`;
    setTimeout(() => {
      drawDividendCharts(divs);
      // annual chart
      if ($('div-annual-chart') && years.length) {
        destroyChart('divAnnual');
        charts.divAnnual = new Chart($('div-annual-chart'), {
          type: 'bar',
          data: { labels: years, datasets: [{ data: annualAmts, backgroundColor: 'rgba(52,211,153,0.7)', borderRadius: 4 }] },
          options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } },
            scales: { x: { ticks: { color: '#94a3b8', font: { size: 9 } }, grid: { display: false } },
                      y: { ticks: { color: '#94a3b8', font: { size: 9 } }, grid: { color: 'rgba(128,128,128,0.1)' } } } }
        });
      }
    }, 40);
  }

  /* ---- OTHER LISTINGS — primary picker available via row actions
 ---- */
  else if (idx === 7) {
    const list = listings?.listings || [];
    const currentSym = (stock.symbol || '').toUpperCase();
    box.innerHTML = `<div class="bg-surf border border-app rounded-xl overflow-hidden animate-slide-up">
      <div class="px-4 py-3 border-b border-app flex items-center justify-between">
        <span class="text-sm text-muted">${list.length} listing(s) in universe</span>
        <span class="text-[10px] text-muted">Click any row to open that listing’s analysis</span>
      </div>
      <table class="w-full text-sm"><thead class="bg-surf2 text-muted text-xs uppercase"><tr>
        <th class="text-left px-4 py-2">Symbol</th><th class="text-left px-4 py-2">Exchange</th>
        <th class="text-left px-4 py-2">Country</th><th class="text-left px-4 py-2">Sector</th><th class="text-right px-4 py-2"></th>
      </tr></thead><tbody>${list.map(l => {
        const isCurrent = (l.symbol || '').toUpperCase() === currentSym;
        const stockObj = { symbol: l.symbol, company_name: l.company_name, stock_exchange: l.stock_exchange,
          exchange_code: l.exchange_code, country: l.country, sector: l.sector || '—', industry: l.industry || '—' };
        return `<tr class="border-b border-app hover:bg-surf2 cursor-pointer transition group ${isCurrent ? 'bg-brand-500/10' : ''}"
          onclick='switchToListing(${JSON.stringify(stockObj).replace(/'/g, "&#39;")})'>
          <td class="px-4 py-2.5 font-mono text-brand-400">${l.symbol}${isCurrent ? ' <span class="text-[10px] text-brand-400">● current</span>' : ''}</td>
          <td class="px-4 py-2.5">${l.stock_exchange || '—'}</td>
          <td class="px-4 py-2.5 text-muted">${countryFlag(l.country||'')} ${l.country || '—'}</td>
          <td class="px-4 py-2.5 text-xs text-muted">${l.sector || '—'}</td>
          <td class="px-4 py-2.5 text-right text-xs text-brand-400 opacity-0 group-hover:opacity-100 transition">Open →</td>
        </tr>`;
      }).join('') || '<tr><td colspan="5" class="px-4 py-6 text-center text-muted">No other listings found</td></tr>'}
      </tbody></table></div>`;
  }
}

async function runCompare() {
  const raw = ($('compare-input')?.value || '').trim();
  const out = $('compare-out');
  if (!out) return;
  if (!raw) { out.innerHTML = `<div class="text-sm text-muted">Enter at least one symbol.</div>`; return; }
  out.innerHTML = `<div class="flex justify-center py-10"><div class="loader"></div></div>`;
  const parts = raw.split(/[,\s]+/).filter(Boolean).slice(0, 5);
  const symbols = [];
  const exchanges = [];
  parts.forEach(p => {
    const [s, ex] = p.split(':');
    symbols.push(s.trim().toUpperCase());
    exchanges.push((ex || '').trim());
  });
  try {
    const d = await fetchJSON(`${API}/compare?symbols=${encodeURIComponent(symbols.join(','))}&exchanges=${encodeURIComponent(exchanges.join(','))}`);
    const rows = d.rows || [];
    // comparison table
    const metrics = [
      ['Name', r => r.name || r.symbol],
      ['Price', r => r.price != null ? `${fmtNum(r.price)} ${r.currency||''}` : '—'],
      ['1Y Change', r => r.year_change != null ? fmtPct(r.year_change) : '—'],
      ['Market Cap', r => r.market_cap != null ? fmtNum(r.market_cap) : '—'],
      ['P/E', r => r.pe != null ? Number(r.pe).toFixed(2) : '—'],
      ['Forward P/E', r => r.forward_pe != null ? Number(r.forward_pe).toFixed(2) : '—'],
      ['P/B', r => r.pb != null ? Number(r.pb).toFixed(2) : '—'],
      ['EPS', r => r.eps != null ? Number(r.eps).toFixed(2) : '—'],
      ['Beta', r => r.beta != null ? Number(r.beta).toFixed(2) : '—'],
      ['Div Yield', r => r.dividend_yield != null ? (Number(r.dividend_yield)*100).toFixed(2)+'%' : '—'],
      ['Sector', r => r.sector || '—'],
    ];
    out.innerHTML = `
      <div class="bg-surf border border-app rounded-xl overflow-hidden">
        <div class="overflow-x-auto">
          <table class="w-full text-sm">
            <thead class="bg-surf2 text-muted text-xs uppercase">
              <tr>
                <th class="text-left px-3 py-2.5 sticky left-0 bg-surf2">Metric</th>
                ${rows.map(r => `<th class="text-right px-3 py-2.5 font-mono text-brand-400">${r.symbol}</th>`).join('')}
              </tr>
            </thead>
            <tbody>
              ${metrics.map(([label, fn]) => `
                <tr class="border-b border-app hover:bg-surf2/50">
                  <td class="px-3 py-2 sticky left-0 bg-surf text-xs font-medium text-muted">${label}</td>
                  ${rows.map(r => `<td class="px-3 py-2 text-right font-mono text-xs">${fn(r)}</td>`).join('')}
                </tr>`).join('')}
            </tbody>
          </table>
        </div>
      </div>
      <div class="bg-surf border border-app rounded-xl p-4 mt-4">
        <h4 class="text-sm font-semibold mb-2">Relative 1Y performance</h4>
        <div class="chart-box" style="height:260px"><canvas id="compare-chart"></canvas></div>
        <p class="text-[11px] text-muted mt-2">Bars show 1-year % change when available.</p>
      </div>`;
    // bar chart
    setTimeout(() => {
      if (!$('compare-chart')) return;
      destroyChart('compareChart');
      const labels = rows.map(r => r.symbol);
      const data = rows.map(r => {
        const v = r.year_change;
        if (v == null) return null;
        return Math.abs(v) <= 2 ? v * 100 : v;
      });
      charts.compareChart = new Chart($('compare-chart'), {
        type: 'bar',
        data: {
          labels,
          datasets: [{
            label: '1Y %',
            data,
            backgroundColor: data.map(v => v == null ? '#64748b' : v >= 0 ? 'rgba(52,211,153,0.7)' : 'rgba(248,113,113,0.7)'),
            borderRadius: 6,
          }],
        },
        options: {
          responsive: true, maintainAspectRatio: false,
          plugins: { legend: { display: false } },
          scales: {
            x: { ticks: { color: '#94a3b8' }, grid: { display: false } },
            y: { ticks: { color: '#94a3b8', callback: v => v + '%' }, grid: { color: 'rgba(128,128,128,0.12)' } },
          },
        },
      });
    }, 40);
  } catch (e) {
    out.innerHTML = `<div class="text-red-400 text-sm">${e.message}</div>`;
  }
}

/* ---- helpers for analysis page ---- */
function pctOrNull(v) {
  if (v == null || v === '') return null;
  const n = Number(v);
  if (Number.isNaN(n)) return v;
  // already a percent string?
  if (typeof v === 'string' && v.includes('%')) return v;
  return (Math.abs(n) <= 2 ? n * 100 : n).toFixed(2) + '%';
}
function fmtMetric(v) {
  if (v == null || v === '') return '—';
  if (typeof v === 'number') return fmtNum(v);
  return v;
}
function formatDateDMY(s) {
  if (!s) return '—';
  const p = String(s).slice(0, 10).split('-');
  if (p.length === 3) return `${p[2]}/${p[1]}/${p[0]}`;
  return s;
}
function makePriceChartConfig(hist, currency) {
  const closes = hist.closes || [];
  const up = closes.length > 1 && closes[closes.length - 1] >= closes[0];
  const color = up ? '#34d399' : '#f87171';
  return {
    type: 'line',
    data: {
      labels: hist.dates || [],
      datasets: [{
        label: `Price (${currency || ''})`,
        data: closes,
        borderColor: color,
        backgroundColor: up ? 'rgba(52,211,153,0.1)' : 'rgba(248,113,113,0.1)',
        fill: true, tension: 0.15, pointRadius: 0, borderWidth: 2,
      }],
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: (ctx) => `${currency || ''} ${Number(ctx.parsed.y).toLocaleString(undefined, { maximumFractionDigits: 4 })}`,
          },
        },
      },
      scales: {
        x: {
          grid: { display: false },
          ticks: { color: '#64748b', maxTicksLimit: 8, font: { size: 10 }, maxRotation: 0 },
          title: { display: true, text: 'Date', color: '#64748b', font: { size: 11 } },
        },
        y: {
          grid: { color: 'rgba(128,128,128,0.12)' },
          ticks: { color: '#94a3b8', font: { size: 10 } },
          title: { display: true, text: currency || 'Price', color: '#64748b', font: { size: 11 } },
        },
      },
    },
  };
}
function renderAnalysisChart(hist, currency) {
  const canvas = $('analysis-chart');
  if (!canvas) return;
  if (!hist?.available || !hist.closes?.length) {
    const st = $('chart-status');
    if (st) st.textContent = 'No price history for this period / symbol.';
    return;
  }
  destroyChart('analysisChart');
  charts.analysisChart = new Chart(canvas, makePriceChartConfig(hist, currency));
  const closes = hist.closes.filter(x => x != null);
  if (closes.length && $('chart-range-stats')) {
    const first = closes[0], last = closes[closes.length - 1];
    const chg = first ? ((last - first) / first) * 100 : 0;
    const hi = Math.max(...closes), lo = Math.min(...closes);
    $('chart-range-stats').innerHTML = [
      ['Open (range)', fmtNum(first)],
      ['Close (range)', fmtNum(last)],
      ['Change', (chg >= 0 ? '+' : '') + chg.toFixed(2) + '%'],
      ['High / Low', `${fmtNum(hi)} / ${fmtNum(lo)}`],
    ].map(([k,v]) => `<div class="bg-surf2 rounded-lg px-3 py-2"><div class="text-[10px] text-muted uppercase">${k}</div><div class="font-mono text-sm mt-0.5">${v}</div></div>`).join('');
  }
  const st = $('chart-status');
  if (st) st.textContent = `Period: ${(hist.period || '').toUpperCase()} · Interval: ${hist.interval || '—'} · Points: ${hist.closes.length}`;
}
async function loadChartPeriod(period) {
  state.chartPeriod = period;
  document.querySelectorAll('.period-btn').forEach(b => {
    const on = b.textContent.trim().toLowerCase() === period.replace('mo','m').replace('1m','1m') || b.getAttribute('onclick')?.includes(`'${period}'`);
    // simpler: re-mark by onclick
  });
  document.querySelectorAll('.period-btn').forEach(b => {
    const match = b.getAttribute('onclick')?.includes(`'${period}'`);
    b.className = `period-btn px-2.5 py-1 rounded-lg text-xs font-medium border transition ${
      match ? 'bg-brand-600 text-white border-brand-600' : 'bg-surf2 border-app text-muted hover:text-app'}`;
  });
  const stock = state.stock;
  const st = $('chart-status');
  if (st) st.innerHTML = '<span class="inline-flex items-center gap-2"><span class="loader" style="width:14px;height:14px;border-width:2px"></span> Loading…</span>';
  try {
    const hist = await fetchJSON(`${API}/history/${encodeURIComponent(stock.symbol)}?exchange=${encodeURIComponent(stock.exchange_code||'')}&period=${period}`);
    if (state.analysisData) state.analysisData.hist = hist;
    const currency = state.analysisData?.live?.currency || '';
    renderAnalysisChart(hist, currency);
  } catch (e) {
    if (st) st.textContent = 'Failed to load chart: ' + e.message;
  }
}


async function runPriceWindowAnalysis() {
  const stock = state.stock;
  const start = $('chart-start')?.value;
  const end = $('chart-end')?.value;
  const out = $('price-analysis-out');
  if (!out) return;
  if (!start || !end) { out.innerHTML = '<span class="text-red-400 text-xs">Enter both start and end dates.</span>'; return; }
  if (start > end) { out.innerHTML = '<span class="text-red-400 text-xs">Start date must be before end date.</span>'; return; }
  out.innerHTML = '<div class="loader"></div>';
  try {
    // use max history and filter client-side
    const hist = await fetchJSON(`${API}/history/${encodeURIComponent(stock.symbol)}?exchange=${encodeURIComponent(stock.exchange_code||'')}&period=max`);
    if (!hist.available || !hist.closes?.length) {
      out.innerHTML = '<span class="text-muted text-xs">No history available for analysis.</span>';
      return;
    }
    // hist.dates may be dd/mm/yyyy — also try raw
    const pairs = [];
    for (let i = 0; i < hist.closes.length; i++) {
      const d = hist.dates[i];
      let iso = d;
      if (d && d.includes('/')) {
        const p = d.split(' ')[0].split('/');
        if (p.length === 3) {
          // dd/mm/yyyy or dd/mm/yy
          const y = p[2].length === 2 ? '20'+p[2] : p[2];
          iso = `${y}-${p[1].padStart(2,'0')}-${p[0].padStart(2,'0')}`;
        }
      }
      if (iso >= start && iso <= end && hist.closes[i] != null) pairs.push({ d: iso, c: hist.closes[i] });
    }
    if (pairs.length < 3) {
      out.innerHTML = '<span class="text-muted text-xs">Not enough points in this window.</span>';
      return;
    }
    const closes = pairs.map(p => p.c);
    const first = closes[0], last = closes[closes.length-1];
    const chg = ((last - first) / Math.abs(first)) * 100;
    const hi = Math.max(...closes), lo = Math.min(...closes);
    const avg = closes.reduce((a,b)=>a+b,0)/closes.length;
    const rets = [];
    for (let i=1;i<closes.length;i++) rets.push((closes[i]-closes[i-1])/Math.abs(closes[i-1]));
    const vol = rets.length ? Math.sqrt(rets.reduce((s,r)=>s+r*r,0)/rets.length)*100 : 0;
    const upDays = rets.filter(r=>r>0).length;
    const downDays = rets.filter(r=>r<0).length;
    const points = [
      `Window ${start} → ${end} covers ${pairs.length} observations.`,
      `Price moved from ${first.toFixed(4)} to ${last.toFixed(4)} (${chg>=0?'+':''}${chg.toFixed(2)}%).`,
      `Range high ${hi.toFixed(4)} / low ${lo.toFixed(4)} (span ${(((hi-lo)/avg)*100).toFixed(1)}% of average).`,
      `Average level in window: ${avg.toFixed(4)}.`,
      `Realized volatility (period-to-period): ~${vol.toFixed(2)}%.`,
      `Up moves: ${upDays} · Down moves: ${downDays} (${(100*upDays/Math.max(1,upDays+downDays)).toFixed(0)}% up-share).`,
      chg > 10 ? 'Net trend is firmly positive over the selected window.' : chg < -10 ? 'Net trend is firmly negative over the selected window.' : 'Net trend is relatively flat over the selected window.',
      last > avg ? 'Latest close sits above the window average (near-term constructive).' : 'Latest close sits below the window average (near-term softer).',
      (hi - last) / hi < 0.03 ? 'Price is near window highs — limited upside vs recent peak.' : (last - lo) / lo < 0.03 ? 'Price is near window lows — potential mean-reversion interest, with risk.' : 'Price is mid-range versus window high/low.',
    ];
    out.innerHTML = `<ul class="list-disc pl-5 space-y-1 text-muted">${points.map(p=>`<li>${p}</li>`).join('')}</ul>`;
  } catch (e) {
    out.innerHTML = `<span class="text-red-400 text-xs">${e.message}</span>`;
  }
}

function renderFinancialTab(title, kind, stmt, fin) {
  const freq = state.finFreq || 'annual';
  const sub = state.finSubTab || 'table';
  // Income: annual + ttm only (no quarterly) — Part 7
  const freqOpts = kind === 'income' ? ['annual','ttm'] : ['annual','quarterly','ttm'];
  let html = `
    <div class="space-y-3 animate-slide-up">
      <div class="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
        <div>
          <h3 class="font-semibold">${title}</h3>
          <p class="text-xs text-muted">${freq ? freq.toUpperCase() : ''}</p>
        </div>
        <div class="flex flex-wrap items-center gap-2">
          <div class="flex gap-1 rounded-lg border border-app p-0.5 bg-surf2">
            ${freqOpts.map(f => `
              <button onclick="setFinFreq('${f}')"
                class="px-2.5 py-1 rounded-md text-xs font-medium transition ${freq===f?'bg-brand-600 text-white':'text-muted hover:text-app'}">${f==='ttm'?'TTM':f.charAt(0).toUpperCase()+f.slice(1)}</button>
            `).join('')}
          </div>
          <div class="flex gap-1">
            <button onclick="setFinSubTab('table')" class="px-3 py-1 rounded-lg text-xs border border-app ${sub!=='chart'?'bg-brand-600 text-white border-brand-600':'bg-surf2 text-muted'}">Table</button>
            <button onclick="setFinSubTab('chart')" class="px-3 py-1 rounded-lg text-xs border border-app ${sub==='chart'?'bg-brand-600 text-white border-brand-600':'bg-surf2 text-muted'}">Charts</button>
          </div>
        </div>
      </div>`;

  if (!stmt || (typeof stmt === 'object' && !Object.keys(stmt).length)) {
    html += `<div class="bg-surf border border-app rounded-xl p-8 text-center text-muted text-sm">No ${title.toLowerCase()} data for <strong>${freq.toUpperCase()}</strong>.</div></div>`;
    return html;
  }

  let periods = [], rows = {};
  if (stmt.periods && stmt.rows) {
    periods = stmt.periods;
    rows = stmt.rows;
  } else {
    const cols = Object.keys(stmt);
    if (cols.length && typeof stmt[cols[0]] === 'object') {
      // reverse so oldest → newest or keep yfinance order but reverse to chronological if needed
      periods = cols.slice().reverse(); // yfinance often newest first — reverse for reading order
      const metrics = new Set();
      cols.forEach(c => Object.keys(stmt[c] || {}).forEach(m => metrics.add(m)));
      metrics.forEach(m => {
        rows[m] = {};
        periods.forEach(c => { rows[m][c] = stmt[c]?.[m]; });
      });
    }
  }

  // Preferred row order by statement type
  const ORDER = {
    income: ['Total Revenue','Revenue','Cost Of Revenue','Cost of Revenue','Gross Profit','Research And Development','Research Development','Selling General Administrative','Selling General And Administration','Operating Expense','Operating Expenses','Operating Income','EBIT','EBITDA','Interest Expense','Income Before Tax','Pretax Income','Tax Provision','Income Tax Expense','Net Income Continuous Operations','Net Income','Net Income Common Stockholders','Net Income To Common','Basic EPS','Diluted EPS','Basic Average Shares','Diluted Average Shares'],
    balance: ['Total Assets','Current Assets','Cash And Cash Equivalents','Cash Cash Equivalents And Short Term Investments','Other Short Term Investments','Net Receivables','Inventory','Other Current Assets','Total Non Current Assets','Net PPE','Goodwill','Intangible Assets','Other Non Current Assets','Total Liabilities Net Minority Interest','Total Liabilities','Current Liabilities','Accounts Payable','Current Debt','Current Debt And Capital Lease Obligation','Other Current Liabilities','Total Non Current Liabilities Net Minority Interest','Long Term Debt','Long Term Debt And Capital Lease Obligation','Other Non Current Liabilities','Stockholders Equity','Common Stock','Retained Earnings','Capital Stock','Additional Paid In Capital','Treasury Stock','Total Equity Gross Minority Interest','Total Capitalization','Common Stock Equity','Net Tangible Assets','Working Capital','Invested Capital','Tangible Book Value','Total Debt','Net Debt','Share Issued','Ordinary Shares Number'],
    cashflow: ['Operating Cash Flow','Cash Flow From Continuing Operating Activities','Net Income From Continuing Operations','Depreciation And Amortization','Depreciation','Change In Working Capital','Changes In Account Receivables','Change In Inventory','Change In Account Payable','Stock Based Compensation','Investing Cash Flow','Cash Flow From Continuing Investing Activities','Capital Expenditure','Net PPE Purchase And Sale','Purchase Of Investment','Sale Of Investment','Financing Cash Flow','Cash Flow From Continuing Financing Activities','Long Term Debt Issuance','Long Term Debt Payments','Repurchase Of Capital Stock','Common Stock Issuance','Common Stock Dividend Paid','Cash Dividends Paid','End Cash Position','Beginning Cash Position','Changes In Cash','Free Cash Flow','Issuance Of Debt','Repayment Of Debt'],
  };
  const preferred = ORDER[kind] || [];
  const metricNames = Object.keys(rows);
  // Sort: preferred order first (as they appear in preferred), then remaining
  metricNames.sort((a, b) => {
    const ia = preferred.findIndex(p => p.toLowerCase() === a.toLowerCase() || a.toLowerCase().includes(p.toLowerCase()));
    const ib = preferred.findIndex(p => p.toLowerCase() === b.toLowerCase() || b.toLowerCase().includes(p.toLowerCase()));
    const ra = ia < 0 ? 9999 : ia;
    const rb = ib < 0 ? 9999 : ib;
    if (ra !== rb) return ra - rb;
    return a.localeCompare(b);
  });

  state._finRows = rows;
  state._finPeriods = periods;
  state._finTitle = title;
  state._finKind = kind;
  state._finMetrics = metricNames;
  if (!state.finGrowthOpen) state.finGrowthOpen = {};

  // Section grouping for balance / cashflow
  function groupMetrics(kind, names) {
    if (kind === 'balance') {
      return [
        { title: 'Assets', keys: names.filter(n => /asset|cash|receivable|inventor|ppe|goodwill|intangible|investment/i.test(n) && !/liabilit|equity|debt|payable|stockholders|retained/i.test(n)) },
        { title: 'Liabilities', keys: names.filter(n => /liabilit|payable|debt|lease|deferred/i.test(n) && !/asset|equity|stockholders|retained/i.test(n)) },
        { title: "Shareholders' Equity", keys: names.filter(n => /equity|stock|retained|capital|treasury|tangible book|share issued|ordinary shares/i.test(n)) },
      ].map(g => ({ ...g, keys: g.keys.length ? g.keys : [] })).filter(g => g.keys.length);
    }
    if (kind === 'cashflow') {
      return [
        { title: 'Operating Activities', keys: names.filter(n => /operating|depreciation|receivable|inventory|payable|stock based|net income from continuing/i.test(n) && !/investing|financing|free cash|end cash|beginning cash/i.test(n)) },
        { title: 'Investing Activities', keys: names.filter(n => /investing|capex|capital expenditure|ppe purchase|purchase of investment|sale of investment/i.test(n)) },
        { title: 'Financing Activities', keys: names.filter(n => /financing|debt issuance|debt payment|repurchase|dividend|issuance of debt|repayment/i.test(n)) },
        { title: 'Net Cash Flow', keys: names.filter(n => /end cash|beginning cash|changes in cash|change in cash/i.test(n)) },
        { title: 'Free Cash Flow', keys: names.filter(n => /free cash/i.test(n)) },
      ].map(g => ({ ...g, keys: g.keys.length ? g.keys : [] })).filter(g => g.keys.length);
    }
    return [{ title: title, keys: names }];
  }

  if (sub === 'chart') {
    const chartDefs = {
      income: [
        { id: 'rev', label: 'Revenue & Profit', picks: ['Total Revenue','Revenue','Gross Profit','Operating Income','Net Income'] },
        { id: 'exp', label: 'Expenses', picks: ['Cost Of Revenue','Cost of Revenue','Operating Expense','Operating Expenses','Research And Development','Selling General Administrative'] },
        { id: 'earn', label: 'Earnings', picks: ['Net Income','EBIT','EBITDA','Income Before Tax','Pretax Income'] },
        { id: 'eps', label: 'EPS & Shares', picks: ['Basic EPS','Diluted EPS','Basic Average Shares','Diluted Average Shares'] },
      ],
      balance: [
        { id: 'assets', label: 'Assets', picks: ['Total Assets','Current Assets','Cash And Cash Equivalents','Net PPE'] },
        { id: 'liab', label: 'Liabilities', picks: ['Total Liabilities','Current Liabilities','Long Term Debt','Total Debt'] },
        { id: 'eq', label: 'Equity', picks: ['Stockholders Equity','Retained Earnings','Common Stock Equity','Tangible Book Value'] },
        { id: 'liq', label: 'Liquidity', picks: ['Working Capital','Net Debt','Cash And Cash Equivalents','Current Assets'] },
      ],
      cashflow: [
        { id: 'ops', label: 'Operating CF', picks: ['Operating Cash Flow','Net Income From Continuing Operations','Depreciation And Amortization'] },
        { id: 'inv', label: 'Investing CF', picks: ['Investing Cash Flow','Capital Expenditure'] },
        { id: 'fin', label: 'Financing CF', picks: ['Financing Cash Flow','Common Stock Dividend Paid','Repurchase Of Capital Stock'] },
        { id: 'fcf', label: 'Free Cash Flow', picks: ['Free Cash Flow','Operating Cash Flow','End Cash Position'] },
      ],
    };
    const defs = chartDefs[kind] || chartDefs.income;
    html += `<div class="grid grid-cols-1 lg:grid-cols-2 gap-4">`;
    defs.forEach((def, di) => {
      const available = def.picks.filter(p => metricNames.some(m => m.toLowerCase() === p.toLowerCase() || m.toLowerCase().includes(p.toLowerCase().split(' ')[0])));
      const resolved = available.map(p => metricNames.find(m => m.toLowerCase() === p.toLowerCase() || m.toLowerCase().includes(p.toLowerCase())) ).filter(Boolean);
      const unique = [...new Set(resolved)].slice(0, 4);
      html += `
        <div class="bg-surf border border-app rounded-xl p-4">
          <div class="flex items-center justify-between mb-2">
            <h4 class="text-sm font-semibold">${def.label}</h4>
            <button onclick='analyzeFinChart(${JSON.stringify(def.label)}, ${JSON.stringify(unique)})' class="text-xs text-brand-400 hover:underline">Analyse</button>
          </div>
          <div class="flex flex-wrap gap-1 mb-2">
            ${unique.map(m => `<span class="text-[10px] px-1.5 py-0.5 rounded bg-surf2 border border-app">${m}</span>`).join('') || '<span class="text-xs text-muted">No matching series</span>'}
          </div>
          <div class="chart-box" style="height:240px"><canvas id="fin-chart-${di}"></canvas></div>
        </div>`;
      setTimeout(() => drawOneFinChart(`fin-chart-${di}`, unique), 50 + di * 30);
    });
    html += `</div></div>`;
    return html;
  }

  // TABLE with growth rows (hidden by default) — Part 7/8/9/12
  if (!state.finGrowthOpen) state.finGrowthOpen = {};
  // Auto-expand growth rows so +/− colours are visible without extra clicks
  metricNames.slice(0, 12).forEach(m => { if (state.finGrowthOpen[m] === undefined) state.finGrowthOpen[m] = true; });
  const groups = groupMetrics(kind, metricNames);
  groups.forEach(g => {
    html += `<div class="bg-surf border border-app rounded-xl overflow-hidden mb-3">
      <div class="px-4 py-2 border-b border-app text-sm font-semibold bg-surf2/50">${g.title}</div>
      <div class="overflow-x-auto max-h-[420px]">
        <table class="w-full text-sm">
          <thead class="bg-surf2 text-muted text-xs uppercase sticky top-0 z-10">
            <tr><th class="text-left px-3 py-2 sticky left-0 bg-surf2 min-w-[180px]">Metric</th>
              ${periods.map(p => `<th class="text-right px-3 py-2 whitespace-nowrap">${formatPeriod(p)}</th>`).join('')}
            </tr>
          </thead>
          <tbody>`;
    g.keys.forEach(m => {
      const open = !!(state.finGrowthOpen && state.finGrowthOpen[m]);
      const growthVals = computeYoYGrowth(rows[m], periods);
      html += `<tr class="border-b border-app hover:bg-surf2/60">
        <td class="px-3 py-2 sticky left-0 bg-surf font-medium text-xs">
          <button type="button" onclick="toggleGrowthRow(${JSON.stringify(m).replace(/"/g,'&quot;')})" class="mr-1 inline-flex w-5 h-5 items-center justify-center rounded border border-app text-[10px] text-muted hover:text-brand-400" title="Toggle YoY growth">${open ? '▼' : '▶'}</button>
          <button type="button" onclick='openTermPopup(${JSON.stringify(m)}, "fin")' class="text-left hover:text-brand-400 hover:underline cursor-pointer" title="Definition & insight">${m}</button>
        </td>
        ${periods.map(p => `<td class="px-3 py-2 text-right font-mono text-xs whitespace-nowrap">${formatFinVal(rows[m]?.[p])}</td>`).join('')}
      </tr>`;
      html += `<tr class="growth-row border-b border-app bg-surf2/30 ${open ? '' : 'hidden'}" data-growth-for="${m.replace(/"/g,'&quot;')}">
        <td class="px-3 py-1.5 sticky left-0 bg-surf2/30 text-[11px] text-muted pl-9">YoY growth · ${m}</td>
        ${periods.map((p, i) => {
          const g = growthVals[i];
          if (g == null) return `<td class="px-3 py-1.5 text-right font-mono text-[11px] text-muted">—</td>`;
          const cls = g > 0 ? 'text-emerald-400' : g < 0 ? 'text-red-400' : 'text-muted';
          return `<td class="px-3 py-1.5 text-right font-mono text-[11px] ${cls}">${g > 0 ? '+' : ''}${g.toFixed(1)}%</td>`;
        }).join('')}
      </tr>`;
    });
    html += `</tbody></table></div></div>`;
  });
  html += `</div>`;
  return html;
}
function computeYoYGrowth(rowObj, periods) {
  // periods chronological; growth[i] = change from periods[i-1] to periods[i]
  const out = periods.map(() => null);
  for (let i = 1; i < periods.length; i++) {
    const prev = parseFinNumber(rowObj?.[periods[i - 1]]);
    const cur = parseFinNumber(rowObj?.[periods[i]]);
    if (prev == null || cur == null || prev === 0) continue;
    out[i] = ((cur - prev) / Math.abs(prev)) * 100;
  }
  return out;
}
function parseFinNumber(v) {
  if (v == null || v === '' || v === '—') return null;
  if (typeof v === 'number') return v;
  const n = Number(String(v).replace(/,/g, ''));
  return Number.isNaN(n) ? null : n;
}
function toggleGrowthRow(metric) {
  if (!state.finGrowthOpen) state.finGrowthOpen = {};
  state.finGrowthOpen[metric] = !state.finGrowthOpen[metric];
  const active = document.querySelector('.tab-btn.text-brand-400');
  const idx = active ? Number(active.getAttribute('data-tab')) : 2;
  showTab(idx);
}
function formatPeriod(p) {
  if (!p) return '—';
  const s = String(p);
  if (/^\d{4}-\d{2}/.test(s)) {
    const [y, m] = s.split('-');
    return `${m}/${y}`;
  }
  return s;
}
function formatFinVal(v) {
  if (v == null || v === '' || v === '—') return '—';
  if (typeof v === 'number') {
    if (Math.abs(v) >= 1e9) return (v / 1e9).toFixed(2) + 'B';
    if (Math.abs(v) >= 1e6) return (v / 1e6).toFixed(2) + 'M';
    if (Math.abs(v) >= 1e3) return (v / 1e3).toFixed(1) + 'K';
    return Number(v).toLocaleString(undefined, { maximumFractionDigits: 2 });
  }
  return String(v);
}
function setFinSubTab(mode) {
  state.finSubTab = mode;
  const active = document.querySelector('.tab-btn.text-brand-400');
  const idx = active ? Number(active.getAttribute('data-tab')) : 2;
  showTab(idx);
}
async function setFinFreq(freq) {
  state.finFreq = freq;
  state.finChartMetrics = [];
  state.finGrowthOpen = {};
  const stock = state.stock;
  const box = $('tab-content');
  if (box) box.innerHTML = `<div class="flex justify-center py-16"><div class="loader"></div></div>`;
  try {
    const bundle = await fetchJSON(`${API}/stock-bundle/${encodeURIComponent(stock.symbol)}?exchange=${encodeURIComponent(stock.exchange_code||'')}&freq=${freq}`);
    const fin = {
      available: !!(bundle && (bundle.income_statement || bundle.balance_sheet || bundle.cashflow)),
      income_statement: bundle?.income_statement || {},
      balance_sheet: bundle?.balance_sheet || {},
      cashflow: bundle?.cashflow || {},
      dividends_history: bundle?.dividends_history || [],
      ratios: bundle?.ratios || {},
      freq: bundle?.freq || freq,
      ticker: bundle?.ticker,
      snapshot: bundle?.snapshot || {},
      sources: bundle?.sources,
    };
    if (state.analysisData) {
      state.analysisData.fin = fin;
      state.analysisData.bundle = bundle;
      if (bundle?.price != null && state.analysisData.live) {
        state.analysisData.live.price = bundle.price;
        state.analysisData.live.info = { ...(state.analysisData.live.info||{}), ...(bundle.info||{}) };
      }
    }
  } catch (e) { console.error(e); }
  const active = document.querySelector('.tab-btn.text-brand-400');
  const idx = active ? Number(active.getAttribute('data-tab')) : 2;
  showTab(idx);
}
function drawOneFinChart(canvasId, metrics) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;
  const rows = state._finRows || {};
  const periods = state._finPeriods || [];
  const COLORS_M = ['#0ea5e9','#34d399','#fbbf24','#f472b6','#a78bfa'];
  const datasets = metrics.map((m, i) => ({
    label: m,
    data: periods.map(p => parseFinNumber(rows[m]?.[p])),
    borderColor: COLORS_M[i % COLORS_M.length],
    backgroundColor: COLORS_M[i % COLORS_M.length] + '33',
    tension: 0.2, pointRadius: 2, borderWidth: 2, fill: false,
  }));
  const key = 'c_' + canvasId;
  destroyChart(key);
  charts[key] = new Chart(canvas, {
    type: 'line',
    data: { labels: periods.map(formatPeriod), datasets },
    options: {
      responsive: true, maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: { legend: { position: 'bottom', labels: { color: '#94a3b8', boxWidth: 10, font: { size: 9 } } } },
      scales: {
        x: { ticks: { color: '#94a3b8', font: { size: 9 } }, grid: { display: false } },
        y: { ticks: { color: '#94a3b8', font: { size: 9 } }, grid: { color: 'rgba(128,128,128,0.12)' } },
      },
    },
  });
}
function analyzeFinChart(label, metrics) {
  const rows = state._finRows || {};
  const periods = state._finPeriods || [];
  const points = [];
  metrics.forEach(m => {
    const vals = periods.map(p => parseFinNumber(rows[m]?.[p])).filter(v => v != null);
    if (vals.length < 2) {
      points.push(`${m}: insufficient history to assess trend.`);
      return;
    }
    const first = vals[0], last = vals[vals.length - 1];
    const chg = first ? ((last - first) / Math.abs(first)) * 100 : 0;
    const peak = Math.max(...vals), trough = Math.min(...vals);
    points.push(`${m} moved from ${formatFinVal(first)} to ${formatFinVal(last)} over the window (${chg >= 0 ? '+' : ''}${chg.toFixed(1)}%).`);
    points.push(`${m} range: high ${formatFinVal(peak)} / low ${formatFinVal(trough)}.`);
    if (chg > 15) points.push(`${m} shows strong expansion across reported periods.`);
    else if (chg < -15) points.push(`${m} contracted meaningfully — watch margin and guidance context.`);
    else points.push(`${m} is relatively stable period-to-period.`);
  });
  const uniq = [...new Set(points)].slice(0, 6);
  showAnalysisPopup(label + ' — analysis', uniq);
}
function showAnalysisPopup(title, points) {
  let modal = $('insight-modal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'insight-modal';
    modal.className = 'fixed inset-0 z-[80] hidden items-center justify-center p-4 modal-backdrop';
    modal.innerHTML = `<div class="bg-surf border border-app rounded-2xl w-full max-w-lg max-h-[80vh] overflow-y-auto shadow-2xl modal-panel p-5">
      <div class="flex items-center justify-between mb-3">
        <h3 id="insight-title" class="font-semibold"></h3>
        <button onclick="document.getElementById('insight-modal').classList.add('hidden');document.getElementById('insight-modal').classList.remove('flex')" class="text-muted">✕</button>
      </div>
      <ul id="insight-body" class="space-y-2 text-sm text-muted list-disc pl-5"></ul>
    </div>`;
    document.body.appendChild(modal);
  }
  $('insight-title').textContent = title;
  $('insight-body').innerHTML = points.map(p => `<li class="leading-relaxed">${p}</li>`).join('');
  modal.classList.remove('hidden'); modal.classList.add('flex');
}

function switchToListing(stock) {
  if (!stock || !stock.symbol) return;
  state.stock = stock;
  navigate('analysis', { stock });
}

const TERM_DEFS = {
  'Total Revenue': {
    def: 'Total Revenue is the full amount of money a company earns from its core business activities during a reporting period, before any expenses are subtracted. It includes sales of products and services, and is usually shown net of returns, allowances and discounts. It is the starting point of the income statement and the broadest measure of commercial scale.',
    formula: 'Sum of product and service sales − returns, allowances and discounts',
    insightKey: 'revenue'
  },
  'Revenue': {
    def: 'Revenue (also called sales or turnover) is the income generated from the company’s primary operations. It reflects how much customers paid for goods or services in the period. Sustained growth in revenue is often a prerequisite for long-term earnings growth, though it must be viewed alongside margins and cash conversion.',
    formula: 'Units sold × selling price (net of discounts and returns)',
    insightKey: 'revenue'
  },
  'Cost Of Revenue': {
    def: 'Cost of Revenue (or Cost of Goods Sold) captures the direct costs of producing or delivering the products and services that generated revenue. Typical components include raw materials, direct labour, freight-in and manufacturing overhead. It is deducted from revenue to arrive at gross profit and is a key driver of gross margin.',
    formula: 'Beginning inventory + purchases and production costs − ending inventory',
    insightKey: 'cogs'
  },
  'Cost of Revenue': {
    def: 'Cost of Revenue (or Cost of Goods Sold) captures the direct costs of producing or delivering the products and services that generated revenue. Typical components include raw materials, direct labour, freight-in and manufacturing overhead. It is deducted from revenue to arrive at gross profit and is a key driver of gross margin.',
    formula: 'Beginning inventory + purchases and production costs − ending inventory',
    insightKey: 'cogs'
  },
  'Gross Profit': {
    def: 'Gross Profit is revenue remaining after subtracting the direct costs of producing goods or delivering services. It measures the core pricing power and production efficiency of the business before operating expenses, interest and taxes. Gross margin (gross profit ÷ revenue) is widely used to compare businesses within the same industry.',
    formula: 'Revenue − Cost of Revenue',
    insightKey: 'gross'
  },
  'Operating Income': {
    def: 'Operating Income (or operating profit / EBIT in many presentations) is the profit earned from core operations after deducting operating expenses such as selling, general and administrative costs and research and development, but before interest and taxes. It isolates the profitability of the underlying business independent of capital structure and tax regime.',
    formula: 'Gross Profit − Operating Expenses (SG&A, R&D and similar)',
    insightKey: 'operating'
  },
  'Operating Expense': {
    def: 'Operating Expenses are the costs of running the day-to-day business that are not directly tied to producing a specific unit of product or service. They typically include selling, general and administrative expenses (SG&A), research and development, and other overhead. Controlling operating expenses is central to expanding operating margins as the company scales.',
    formula: 'SG&A + R&D + other operating costs (excluding COGS, interest and tax)',
    insightKey: 'opex'
  },
  'Net Income': {
    def: 'Net Income is the bottom-line profit after all expenses, interest, taxes and non-operating items. It is the residual amount attributable to shareholders for the period and forms the basis for earnings per share. Because it includes financing and tax effects, it should be interpreted together with operating income and free cash flow.',
    formula: 'Pretax Income − Income Tax Expense (± minority interest and other adjustments)',
    insightKey: 'net_income'
  },
  'EBITDA': {
    def: 'EBITDA stands for Earnings Before Interest, Taxes, Depreciation and Amortization. It is a widely used proxy for operating cash generation that removes the effects of capital structure, tax rates and non-cash depreciation charges. It is not a GAAP measure and does not equal free cash flow because it ignores capital expenditure and working-capital changes.',
    formula: 'Operating Income + Depreciation & Amortization (or Net Income + Interest + Tax + D&A)',
    insightKey: 'ebitda'
  },
  'Total Assets': {
    def: 'Total Assets represent everything the company owns or controls that is expected to provide future economic benefit. They include current assets (cash, receivables, inventory) and non-current assets (property, plant and equipment, intangibles, long-term investments). Asset composition helps assess liquidity, capital intensity and the nature of the business model.',
    formula: 'Current Assets + Non-current Assets',
    insightKey: 'assets'
  },
  'Total Liabilities': {
    def: 'Total Liabilities are the obligations the company owes to external parties, including short-term payables, debt, deferred revenue and long-term borrowings. Comparing liabilities with assets and equity indicates leverage and solvency. A rising liability base is not automatically negative if it funds productive growth.',
    formula: 'Current Liabilities + Non-current Liabilities',
    insightKey: 'liabilities'
  },
  'Stockholders Equity': {
    def: 'Stockholders’ Equity (or shareholders’ equity / book value) is the residual interest in the assets of the company after deducting all liabilities. It comprises contributed capital, retained earnings and other equity reserves. Equity is the accounting measure of the owners’ stake and is used in ratios such as ROE and price-to-book.',
    formula: 'Total Assets − Total Liabilities',
    insightKey: 'equity'
  },
  'Operating Cash Flow': {
    def: 'Operating Cash Flow is the cash generated (or consumed) by the company’s core operating activities. It starts from net income and adjusts for non-cash items and changes in working capital. Strong, consistent operating cash flow is a hallmark of a healthy business and underpins dividends, debt service and reinvestment.',
    formula: 'Net Income ± non-cash items ± changes in working capital',
    insightKey: 'ocf'
  },
  'Free Cash Flow': {
    def: 'Free Cash Flow is the cash left after the company has funded the capital expenditure needed to maintain and grow its asset base. It is a key measure of financial flexibility: positive free cash flow can fund dividends, buybacks, debt reduction or acquisitions without external financing.',
    formula: 'Operating Cash Flow − Capital Expenditure',
    insightKey: 'fcf'
  },
  'Capital Expenditure': {
    def: 'Capital Expenditure (CapEx) is cash spent to acquire, upgrade or maintain physical assets such as property, plant and equipment. Growth CapEx expands capacity; maintenance CapEx sustains existing operations. High CapEx relative to cash flow can constrain free cash flow even when earnings look strong.',
    formula: 'Cash purchases of PPE (from the investing section of the cash flow statement)',
    insightKey: 'capex'
  },
  'Trailing P/E': {
    def: 'Trailing Price-to-Earnings compares the current share price with earnings per share over the last twelve months. A higher multiple implies the market is paying more for each unit of recent earnings. It is most meaningful when earnings are positive and reasonably stable; one-off items can distort the ratio.',
    formula: 'Current share price ÷ Trailing twelve-month EPS',
    insightKey: 'pe'
  },
  'Forward P/E': {
    def: 'Forward Price-to-Earnings divides the current share price by expected earnings per share for the next fiscal year (or next twelve months). It incorporates analyst or company guidance and is often preferred when the business is growing or recovering. Forecast error is the main limitation.',
    formula: 'Current share price ÷ Expected forward EPS',
    insightKey: 'fwd_pe'
  },
  'Price / Book': {
    def: 'Price-to-Book compares market capitalisation (or price per share) with the accounting book value of equity. A ratio above 1 means the market values the company above its reported net assets. It is most relevant for asset-heavy businesses; for asset-light or intangible-driven firms it is often less informative.',
    formula: 'Share price ÷ Book value per share (or Market Cap ÷ Shareholders’ Equity)',
    insightKey: 'pb'
  },
  'ROE': {
    def: 'Return on Equity measures how effectively the company generates net income from the equity capital provided by shareholders. Higher ROE can indicate competitive advantage or efficient capital use, but can also be inflated by high leverage. It should be read alongside ROA and debt levels.',
    formula: 'Net Income ÷ Average Shareholders’ Equity',
    insightKey: 'roe'
  },
  'ROA': {
    def: 'Return on Assets shows how much net income is produced for each unit of total assets. It reflects asset productivity independent of financing mix. Capital-intensive industries typically show lower ROA than asset-light businesses; comparisons are most useful within the same sector.',
    formula: 'Net Income ÷ Average Total Assets',
    insightKey: 'roa'
  },
  'Dividend Yield': {
    def: 'Dividend Yield is the annual dividend income an investor receives as a percentage of the current share price. It is a snapshot of income return only and does not capture capital gains or dividend growth. Very high yields can signal payout stress or a depressed share price rather than an attractive income opportunity.',
    formula: 'Annual dividends per share ÷ Current share price',
    insightKey: 'div_yield'
  },
  'Payout Ratio': {
    def: 'Payout Ratio is the proportion of earnings distributed as dividends. A moderate, sustainable ratio leaves room for reinvestment and cushion against earnings volatility. Ratios above 100% mean the company is paying more than it earned in the period, which may be temporary or a warning sign.',
    formula: 'Dividends ÷ Net Income (or DPS ÷ EPS)',
    insightKey: 'payout'
  },
  'Beta': {
    def: 'Beta measures how sensitive a stock’s returns have been to moves in the broader market. A beta of 1 implies the stock has moved roughly in line with the market; above 1 implies greater volatility; below 1 implies lower volatility. Beta is estimated from historical data and can change over time.',
    formula: 'Covariance(stock returns, market returns) ÷ Variance(market returns)',
    insightKey: 'beta'
  },
  'Current Ratio': {
    def: 'Current Ratio assesses short-term liquidity by comparing current assets with current liabilities. A ratio above 1 suggests the company can cover near-term obligations with assets expected to convert to cash within a year. Very high ratios can indicate idle cash or inefficient working capital.',
    formula: 'Current Assets ÷ Current Liabilities',
    insightKey: 'current'
  },
  'Debt / Equity': {
    def: 'Debt-to-Equity measures financial leverage by comparing total debt (or interest-bearing liabilities) with shareholders’ equity. Higher leverage amplifies both returns and risk. Acceptable levels vary widely by industry; the ratio should be interpreted with interest coverage and cash-flow stability.',
    formula: 'Total Debt ÷ Shareholders’ Equity',
    insightKey: 'de'
  },
  'PEG Ratio': {
    def: 'The PEG Ratio adjusts the P/E multiple for expected earnings growth. A PEG near 1 is often interpreted as fair value relative to growth, though the quality of the growth estimate is critical. It is less useful when earnings are negative or growth rates are extremely high or volatile.',
    formula: 'Trailing (or forward) P/E ÷ Expected earnings growth rate (%)',
    insightKey: 'peg'
  },
  'Price / Sales': {
    def: 'Price-to-Sales compares market value with revenue. It is useful for companies with little or no earnings, or when comparing businesses with different margin structures. Like other multiples, it should be viewed against growth, margins and peers.',
    formula: 'Market Cap ÷ Revenue (or Price ÷ Sales per share)',
    insightKey: 'ps'
  },
  'EV / EBITDA': {
    def: 'Enterprise Value to EBITDA compares the total value of the firm (equity plus net debt) with a measure of operating earnings before non-cash charges. It is capital-structure neutral and widely used in valuation and transaction analysis. Differences in CapEx intensity still matter when comparing businesses.',
    formula: 'Enterprise Value ÷ EBITDA',
    insightKey: 'ev_ebitda'
  },
  'Gross Margin': {
    def: 'Gross Margin is gross profit expressed as a percentage of revenue. It shows how much of each sales dollar remains after direct production costs. Improving gross margin can reflect better pricing, mix, or cost control; declining margin may signal competitive pressure or cost inflation.',
    formula: 'Gross Profit ÷ Revenue',
    insightKey: 'gross_margin'
  },
  'Operating Margin': {
    def: 'Operating Margin is operating income as a percentage of revenue. It captures the efficiency of the core business after operating expenses. Expanding operating margins alongside revenue growth is often a sign of operating leverage.',
    formula: 'Operating Income ÷ Revenue',
    insightKey: 'op_margin'
  },
  'Profit Margin': {
    def: 'Profit Margin (net margin) is net income as a percentage of revenue. It is the broadest profitability ratio and reflects the combined impact of gross margin, operating costs, interest and tax. Industry norms differ substantially.',
    formula: 'Net Income ÷ Revenue',
    insightKey: 'profit_margin'
  },
  'Quick Ratio': {
    def: 'Quick Ratio (acid-test ratio) is a stricter liquidity measure than the current ratio because it excludes inventory, which may take longer to convert to cash. It focuses on cash, marketable securities and receivables relative to current liabilities.',
    formula: '(Current Assets − Inventory) ÷ Current Liabilities',
    insightKey: 'quick'
  },
  'Annual Dividend': {
    def: 'Annual Dividend is the total cash dividend paid per share over a year (or the indicated annual rate based on the latest regular payment). It is the numerator used in dividend yield and is often compared with earnings and free cash flow to assess sustainability.',
    formula: 'Sum of dividends per share over the last twelve months (or indicated annual rate)',
    insightKey: 'annual_div'
  },
  'Ex-Dividend Date': {
    def: 'The Ex-Dividend Date is the first trading day on which a buyer of the stock is not entitled to the declared dividend. To receive the dividend, an investor must own the shares before this date. The share price often adjusts downward by approximately the dividend amount on the ex-date, all else equal.',
    formula: 'Set by the exchange based on the record date (typically one business day before record date in many markets)',
    insightKey: 'ex_div'
  },
};

function buildTermInsights(term, info, vals) {
  const points = [];
  const key = info.insightKey || 'generic';
  if (vals.length >= 2) {
    const first = vals[0], last = vals[vals.length - 1];
    const chg = first ? ((last - first) / Math.abs(first)) * 100 : 0;
    const chgTxt = `${chg >= 0 ? '+' : ''}${chg.toFixed(1)}%`;
    const templates = {
      revenue: [
        `Revenue moved from ${formatFinVal(first)} to ${formatFinVal(last)} (${chgTxt}) over the reported window.`,
        chg > 10 ? 'Top-line expansion is material — check whether growth is volume- or price-driven and whether it is translating into cash.' : chg < -10 ? 'Revenue contracted meaningfully; review demand, mix and competitive pressures.' : 'Revenue is relatively steady; focus on margin and cash conversion rather than growth alone.',
        `Range across periods: ${formatFinVal(Math.min(...vals))} to ${formatFinVal(Math.max(...vals))}.`,
        'Compare growth with peers in the same industry and with the company’s own long-term average.',
      ],
      cogs: [
        `Cost of revenue changed from ${formatFinVal(first)} to ${formatFinVal(last)} (${chgTxt}).`,
        'Rising COGS relative to revenue compresses gross margin; falling COGS can signal efficiency or favourable input costs.',
        `Observed range: ${formatFinVal(Math.min(...vals))} – ${formatFinVal(Math.max(...vals))}.`,
        'Pair this line with gross profit and inventory turnover for a fuller cost picture.',
      ],
      gross: [
        `Gross profit moved ${chgTxt} from ${formatFinVal(first)} to ${formatFinVal(last)}.`,
        chg > 10 ? 'Gross profit expansion supports pricing power or cost discipline.' : chg < -10 ? 'Gross profit pressure warrants a closer look at mix, pricing and input costs.' : 'Gross profit is comparatively stable.',
        `Period range: ${formatFinVal(Math.min(...vals))} to ${formatFinVal(Math.max(...vals))}.`,
        'Gross margin trends often lead operating margin trends.',
      ],
      operating: [
        `Operating income shifted ${chgTxt} (${formatFinVal(first)} → ${formatFinVal(last)}).`,
        'Operating income strips out financing and tax noise — a cleaner read on core profitability.',
        `Range: ${formatFinVal(Math.min(...vals))} – ${formatFinVal(Math.max(...vals))}.`,
        'Watch operating leverage: revenue growth with faster opex growth can still shrink this line.',
      ],
      opex: [
        `Operating expenses moved ${chgTxt} from ${formatFinVal(first)} to ${formatFinVal(last)}.`,
        'Rising opex is acceptable if it funds durable growth; otherwise it erodes margins.',
        `Range: ${formatFinVal(Math.min(...vals))} – ${formatFinVal(Math.max(...vals))}.`,
        'Benchmark opex as a percentage of revenue against industry peers.',
      ],
      net_income: [
        `Net income changed ${chgTxt} (${formatFinVal(first)} → ${formatFinVal(last)}).`,
        'Bottom-line results include interest, tax and one-offs — reconcile with operating income when they diverge.',
        `Range: ${formatFinVal(Math.min(...vals))} – ${formatFinVal(Math.max(...vals))}.`,
        'Persistent growth in net income with solid cash conversion is a constructive signal for equity holders.',
      ],
      ebitda: [
        `EBITDA moved ${chgTxt} from ${formatFinVal(first)} to ${formatFinVal(last)}.`,
        'EBITDA is a cash-earnings proxy but ignores CapEx and working-capital needs.',
        `Range: ${formatFinVal(Math.min(...vals))} – ${formatFinVal(Math.max(...vals))}.`,
        'Cross-check with free cash flow before treating EBITDA growth as spendable cash.',
      ],
      assets: [
        `Total assets changed ${chgTxt} (${formatFinVal(first)} → ${formatFinVal(last)}).`,
        'Asset growth can reflect expansion, acquisitions or simply balance-sheet inflation.',
        `Range: ${formatFinVal(Math.min(...vals))} – ${formatFinVal(Math.max(...vals))}.`,
        'Assess whether asset growth is producing proportional returns (ROA, asset turnover).',
      ],
      liabilities: [
        `Total liabilities moved ${chgTxt} from ${formatFinVal(first)} to ${formatFinVal(last)}.`,
        'Higher liabilities increase fixed obligations; context from interest coverage and maturity profile matters.',
        `Range: ${formatFinVal(Math.min(...vals))} – ${formatFinVal(Math.max(...vals))}.`,
        'Compare the liability path with equity and cash flow generation.',
      ],
      equity: [
        `Shareholders’ equity changed ${chgTxt} (${formatFinVal(first)} → ${formatFinVal(last)}).`,
        'Equity rises with retained earnings and capital raises, and falls with losses, dividends and buybacks.',
        `Range: ${formatFinVal(Math.min(...vals))} – ${formatFinVal(Math.max(...vals))}.`,
        'Book equity is the denominator for ROE and a reference point for price-to-book.',
      ],
      ocf: [
        `Operating cash flow moved ${chgTxt} from ${formatFinVal(first)} to ${formatFinVal(last)}.`,
        'Cash from operations is the foundation for sustainable dividends and reinvestment.',
        `Range: ${formatFinVal(Math.min(...vals))} – ${formatFinVal(Math.max(...vals))}.`,
        'Large gaps versus net income often point to working-capital swings or heavy non-cash items.',
      ],
      fcf: [
        `Free cash flow changed ${chgTxt} (${formatFinVal(first)} → ${formatFinVal(last)}).`,
        'Positive and growing FCF expands strategic options; negative FCF may be intentional during investment phases.',
        `Range: ${formatFinVal(Math.min(...vals))} – ${formatFinVal(Math.max(...vals))}.`,
        'Sustainability of dividends and buybacks is best judged against free cash flow, not earnings alone.',
      ],
      capex: [
        `Capital expenditure moved ${chgTxt} from ${formatFinVal(first)} to ${formatFinVal(last)}.`,
        'Elevated CapEx can signal growth investment or a heavy maintenance cycle.',
        `Range: ${formatFinVal(Math.min(...vals))} – ${formatFinVal(Math.max(...vals))}.`,
        'Relate CapEx to depreciation and to the company’s stated growth plans.',
      ],
    };
    const picked = templates[key] || [
      `${term} moved from ${formatFinVal(first)} to ${formatFinVal(last)} (${chgTxt}).`,
      chg > 15 ? 'The increase is material relative to the starting level.' : chg < -15 ? 'The decline is material and merits further investigation.' : 'The series is relatively stable across periods.',
      `Observed range: ${formatFinVal(Math.min(...vals))} to ${formatFinVal(Math.max(...vals))}.`,
      vals.length >= 3 ? `${vals.length} data points provide a usable trend for screening purposes.` : 'Limited history — treat directional conclusions with care.',
    ];
    points.push(...picked);
  } else if (vals.length === 1) {
    points.push(`Only one numeric observation is available: ${formatFinVal(vals[0])}.`);
    points.push('A single data point cannot establish a trend; compare the level with sector peers and prior-year filings if you have them from other sources.');
    points.push('Switch reporting frequency (annual / quarterly / TTM) if available to surface more history.');
  }
  // if no data, return empty — caller will hide insights section
  return points;
}

function openTermPopup(term, kind, displayValue) {
  const rows = state._finRows || {};
  const periods = state._finPeriods || [];
  const series = rows[term] || {};
  const vals = periods.map(p => parseFinNumber(series[p])).filter(v => v != null);
  const info = TERM_DEFS[term] || Object.entries(TERM_DEFS).find(([k]) => term.toLowerCase().includes(k.toLowerCase()) || k.toLowerCase().includes(term.toLowerCase()))?.[1]
    || { def: `${term} is a reported line item from company financial statements or a derived ratio used in fundamental analysis. Interpret it in the context of the industry, accounting policies and the rest of the financial statements.`, formula: 'See company filings for exact construction', insightKey: 'generic' };

  const noChartKinds = kind === 'ratio' || kind === 'dividend';
  const hasSeries = !noChartKinds && vals.length >= 1 && periods.length >= 1;
  const points = buildTermInsights(term, info, vals);
  if (displayValue != null && displayValue !== '—' && displayValue !== '') {
    points.unshift(`Currently displayed value: ${displayValue}.`);
  }
  // For ratios/dividends with no numeric series and no display value, suppress generic empty insights
  const showInsights = points.length > 0 && !(vals.length === 0 && (displayValue == null || displayValue === '—' || displayValue === ''));

  let modal = $('term-modal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'term-modal';
    modal.className = 'fixed inset-0 z-[90] hidden items-center justify-center p-4 modal-backdrop';
    modal.innerHTML = `<div class="bg-surf border border-app rounded-2xl w-full max-w-lg max-h-[85vh] overflow-y-auto shadow-2xl modal-panel p-5">
      <div class="flex items-start justify-between gap-3 mb-3">
        <h3 id="term-title" class="font-semibold text-base"></h3>
        <button onclick="document.getElementById('term-modal').classList.add('hidden');document.getElementById('term-modal').classList.remove('flex')" class="text-muted shrink-0">✕</button>
      </div>
      <div class="space-y-3 text-sm">
        <div><div class="text-xs uppercase text-muted mb-1">Definition</div><p id="term-def" class="leading-relaxed"></p></div>
        <div><div class="text-xs uppercase text-muted mb-1">Formula</div><p id="term-formula" class="font-mono text-xs bg-surf2 border border-app rounded-lg px-3 py-2"></p></div>
        <div id="term-chart-wrap" class="hidden"><div class="text-xs uppercase text-muted mb-1">Trend</div><div class="chart-box" style="height:160px"><canvas id="term-chart"></canvas></div></div>
        <div id="term-insights-wrap"><div class="text-xs uppercase text-muted mb-1">Insights</div><ul id="term-insights" class="list-disc pl-5 space-y-1 text-muted"></ul></div>
      </div>
    </div>`;
    document.body.appendChild(modal);
  }
  $('term-title').textContent = term;
  $('term-def').textContent = info.def;
  $('term-formula').textContent = info.formula || 'N/A';
  const chartWrap = $('term-chart-wrap');
  const insightsWrap = $('term-insights-wrap');
  if (chartWrap) chartWrap.classList.toggle('hidden', !hasSeries);
  if (insightsWrap) insightsWrap.classList.toggle('hidden', !showInsights);
  $('term-insights').innerHTML = showInsights ? points.map(p => `<li>${p}</li>`).join('') : '';
  modal.classList.remove('hidden'); modal.classList.add('flex');
  destroyChart('termChart');
  if (hasSeries) {
    setTimeout(() => {
      if (!$('term-chart')) return;
      charts.termChart = new Chart($('term-chart'), {
        type: 'line',
        data: { labels: periods.map(formatPeriod), datasets: [{ data: periods.map(p => parseFinNumber(series[p])), borderColor: '#0ea5e9', tension: 0.2, pointRadius: 2, fill: false }] },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } },
          scales: { x: { ticks: { color: '#94a3b8', font: { size: 9 } }, grid: { display: false } }, y: { ticks: { color: '#94a3b8', font: { size: 9 } }, grid: { color: 'rgba(128,128,128,0.1)' } } } }
      });
    }, 40);
  }
}
function openRatioExplain(name, value) {
  openTermPopup(name, 'ratio', value);
}


/* ========== SCREENER ========== */
async function renderScreener() {
  $('breadcrumb').textContent = 'Screener';
  $('content').innerHTML = `
    <div class="space-y-4 fade">
      <div>
        <h1 class="text-2xl font-bold">Stock Screener</h1>
        <p class="text-sm text-muted mt-1">Use the <strong>top search bar</strong> — results update here live as you type. Autocomplete suggestions appear as you type.</p>
      </div>
      <div id="screener-meta" class="text-sm text-muted"></div>
      <div class="bg-surf border border-app rounded-xl overflow-hidden">
        <div class="overflow-x-auto"><table class="w-full text-sm">
          <thead class="bg-surf2 text-muted text-xs uppercase"><tr>
            <th class="text-left px-3 py-2">#</th>
            <th class="text-left px-3 py-2">Symbol</th>
            <th class="text-left px-3 py-2">Company</th>
            <th class="text-left px-3 py-2 hidden md:table-cell">Exchange</th>
            <th class="text-left px-3 py-2">Sector</th>
            <th class="text-left px-3 py-2 hidden lg:table-cell">Industry</th>
            <th class="text-left px-3 py-2">Country</th>
          </tr></thead>
          <tbody id="screener-body"></tbody>
        </table></div>
      </div>
      <div id="screener-pager" class="flex justify-center gap-2"></div>
    </div>`;
  // Link top search to screener
  const gs = $('global-search');
  if (gs) {
    gs.oninput = function() {
      onSearchInput(this.value);
      if (state.page === 'screener') {
        clearTimeout(window._scrTimer);
        window._scrTimer = setTimeout(() => runScreener(1), 250);
      }
    };
  }
  runScreener(1);
}

async function runScreener(page = 1) {
  const q = $('global-search')?.value?.trim() || '';
  const params = new URLSearchParams({ page, limit: 50 });
  if (q) params.set('q', q);
  try {
    const d = await fetchJSON(`${API}/search?${params}`);
    const meta = $('screener-meta');
    if (meta) meta.textContent = `${d.total.toLocaleString()} results · page ${d.page}/${d.pages}` + (q ? ` · filter: "${q}"` : '') + ' · universe listings first';
    const body = $('screener-body');
    if (!body) return;
    const base = (d.page - 1) * d.limit;
    body.innerHTML = d.results.map((r, i) => `
      <tr class="hover:bg-surf2 cursor-pointer border-b border-app ${r.in_universe ? 'bg-brand-500/5' : ''}" onclick='openStockModal(${JSON.stringify(r).replace(/'/g,"&#39;")})'>
        <td class="px-3 py-2 text-muted text-xs">${base + i + 1}</td>
        <td class="px-3 py-2 font-mono text-brand-400 text-xs">${r.symbol}${r.in_universe ? ' <span class="text-[9px] text-brand-400">★</span>' : ''}${r.pack_available ? ' <span class="text-[9px] text-amber-400" title="Offline country pack available">pack</span>' : ''}</td>
        <td class="px-3 py-2 max-w-[160px] truncate">${r.company_name||'—'}</td>
        <td class="px-3 py-2 text-muted hidden md:table-cell text-xs">${r.stock_exchange||''}</td>
        <td class="px-3 py-2 text-xs">${r.sector||'—'}</td>
        <td class="px-3 py-2 text-muted hidden lg:table-cell text-xs">${r.industry||'—'}</td>
        <td class="px-3 py-2 text-xs whitespace-nowrap">${countryFlag(r.country||'')} <span class="ml-1">${r.country||'—'}</span></td>
      </tr>`).join('') || `<tr><td colspan="7" class="px-4 py-8 text-center text-muted">No matches</td></tr>`;
    // dual pager: center page/total + windowed page boxes
    const pager = $('screener-pager');
    if (pager) {
      const cur = d.page, pages = d.pages;
      let boxes = '';
      const windowSize = 5;
      let startP = Math.max(1, cur - 2);
      let endP = Math.min(pages, startP + windowSize - 1);
      startP = Math.max(1, endP - windowSize + 1);
      if (cur > 1) boxes += `<button onclick="runScreener(${cur-1})" class="px-2.5 py-1 rounded-lg bg-surf2 border border-app text-xs">« Prev</button>`;
      if (startP > 1) boxes += `<button onclick="runScreener(1)" class="px-2.5 py-1 rounded-lg bg-surf2 border border-app text-xs">1</button><span class="text-muted px-1">…</span>`;
      for (let p = startP; p <= endP; p++) {
        boxes += `<button onclick="runScreener(${p})" class="px-2.5 py-1 rounded-lg border text-xs ${p===cur?'bg-brand-600 text-white border-brand-600':'bg-surf2 border-app'}">${p}</button>`;
      }
      if (endP < pages) boxes += `<span class="text-muted px-1">…</span><button onclick="runScreener(${pages})" class="px-2.5 py-1 rounded-lg bg-surf2 border border-app text-xs">${pages}</button>`;
      if (cur < pages) boxes += `<button onclick="runScreener(${cur+1})" class="px-2.5 py-1 rounded-lg bg-surf2 border border-app text-xs">Next »</button>`;
      pager.innerHTML = `
        <div class="flex flex-col items-center gap-2 w-full">
          <div class="text-sm text-muted font-mono">${cur} / ${pages}</div>
          <div class="flex flex-wrap justify-center gap-1">${boxes}</div>
        </div>`;
    }
  } catch (e) { console.error(e); }
}


function drawDividendCharts(divs) {
  if (!divs || !divs.length) return;
  const sorted = [...divs].sort((a,b) => String(a.date).localeCompare(String(b.date)));
  const labels = sorted.map(d => formatDateDMY(d.date));
  const amts = sorted.map(d => Number(d.amount) || 0);
  const growth = amts.map((v,i) => i === 0 || !amts[i-1] ? null : ((v - amts[i-1]) / Math.abs(amts[i-1])) * 100);
  let cum = 0;
  const cumulative = amts.map(v => (cum += v));
  if ($('div-amt-chart')) {
    destroyChart('divAmt');
    charts.divAmt = new Chart($('div-amt-chart'), {
      type: 'bar',
      data: { labels, datasets: [{ data: amts, backgroundColor: 'rgba(14,165,233,0.7)', borderRadius: 3 }] },
      options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } },
        scales: { x: { ticks: { color: '#94a3b8', maxTicksLimit: 6, font: { size: 9 } }, grid: { display: false } },
                  y: { ticks: { color: '#94a3b8', font: { size: 9 } }, grid: { color: 'rgba(128,128,128,0.1)' } } } }
    });
  }
  if ($('div-growth-chart')) {
    destroyChart('divGrowth');
    charts.divGrowth = new Chart($('div-growth-chart'), {
      type: 'line',
      data: { labels, datasets: [{ data: growth, borderColor: '#34d399', tension: 0.2, pointRadius: 2 }] },
      options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } },
        scales: { x: { ticks: { color: '#94a3b8', maxTicksLimit: 6, font: { size: 9 } }, grid: { display: false } },
                  y: { ticks: { color: '#94a3b8', font: { size: 9 }, callback: v => v + '%' }, grid: { color: 'rgba(128,128,128,0.1)' } } } }
    });
  }
  if ($('div-cum-chart')) {
    destroyChart('divCum');
    charts.divCum = new Chart($('div-cum-chart'), {
      type: 'line',
      data: { labels, datasets: [{ data: cumulative, borderColor: '#a78bfa', backgroundColor: 'rgba(167,139,250,0.15)', fill: true, tension: 0.2, pointRadius: 0 }] },
      options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } },
        scales: { x: { ticks: { color: '#94a3b8', maxTicksLimit: 6, font: { size: 9 } }, grid: { display: false } },
                  y: { ticks: { color: '#94a3b8', font: { size: 9 } }, grid: { color: 'rgba(128,128,128,0.1)' } } } }
    });
  }
}

/* ========== COMPARE PAGE (sidebar) ========== */
async function renderComparePage() {
  $('breadcrumb').textContent = 'Compare';
  const last = state.stock || state.lastStock || null;
  state.compareSelected = last ? [last] : [];
  state.compareTab = 'overview';
  $('content').innerHTML = `
    <div class="space-y-4 fade max-w-6xl">
      <div>
        <h1 class="text-2xl font-bold">Compare Stocks</h1>
        <p class="text-sm text-muted mt-1">Select up to 5 stocks. Default is your last viewed listing. Prefer same sector/industry peers.</p>
      </div>
      <div class="bg-surf border border-app rounded-xl p-4 relative">
        <label class="text-xs text-muted">Search & add (same sector/industry preferred)</label>
        <input id="cmp-search" type="search" placeholder="Type symbol or company…"
          class="mt-1 w-full bg-surf2 border border-app rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
          oninput="onCompareSearch(this.value)" onfocus="onCompareSearch(this.value)" autocomplete="off" />
        <div id="cmp-ac" class="absolute left-4 right-4 top-full mt-1 bg-surf border border-app rounded-xl shadow-xl max-h-56 overflow-y-auto z-30 hidden"></div>
        <div id="cmp-chips" class="flex flex-wrap gap-2 mt-3"></div>
        <button onclick="runComparePage()" class="mt-3 bg-brand-600 hover:bg-brand-500 text-white text-sm font-medium px-4 py-2 rounded-lg btn-press">Run comparison</button>
      </div>
      <div class="flex gap-1 p-0.5 rounded-xl bg-surf2 border border-app overflow-x-auto" id="cmp-tabs">
        ${['overview','market','revenue','ratios','overall'].map(t => `
          <button onclick="state.compareTab='${t}';runComparePage()" class="flex-1 min-w-[110px] px-3 py-2 rounded-lg text-xs font-medium cmp-tab-btn" data-ctab="${t}">${
            {overview:'Overview',market:'Market analysis',revenue:'Revenue analysis',ratios:'Ratios & KPIs',overall:'Overall analysis'}[t]
          }</button>`).join('')}
      </div>
      <div id="cmp-out" class="text-sm text-muted">Add stocks and run comparison.</div>
    </div>`;
  renderCompareChips();
  if (state.compareSelected.length) setTimeout(() => runComparePage(), 80);
}

function renderCompareChips() {
  const box = $('cmp-chips');
  if (!box) return;
  box.innerHTML = (state.compareSelected || []).map((s,i) => `
    <span class="inline-flex items-center gap-1.5 bg-surf2 border border-app rounded-full px-3 py-1 text-xs font-mono">
      ${s.symbol}
      <button type="button" class="text-muted hover:text-red-400" onclick="state.compareSelected.splice(${i},1);renderCompareChips()">✕</button>
    </span>`).join('') || '<span class="text-xs text-muted">No stocks selected</span>';
}

async function onCompareSearch(q) {
  const ac = $('cmp-ac');
  if (!ac) return;
  const base = state.compareSelected?.[0];
  const params = new URLSearchParams({ limit: 30 });
  if (q) params.set('q', q);
  if (!q && base?.sector) params.set('sector', base.sector);
  if (!q && base?.industry && base.industry !== '—') params.set('industry', base.industry);
  try {
    const d = await fetchJSON(`${API}/search?${params}`);
    let rows = d.results || [];
    // prefer same sector/industry
    if (base) {
      rows = [...rows].sort((a,b) => {
        const sa = (a.sector === base.sector ? 0 : 1) + (a.industry === base.industry ? 0 : 1);
        const sb = (b.sector === base.sector ? 0 : 1) + (b.industry === base.industry ? 0 : 1);
        return sa - sb;
      });
    }
    ac.classList.remove('hidden');
    ac.innerHTML = rows.slice(0, 20).map(r => `
      <button type="button" class="w-full text-left px-3 py-2 text-sm hover:bg-surf2 border-b border-app"
        onclick='addCompareStock(${JSON.stringify(r).replace(/'/g,"&#39;")})'>
        <span class="font-mono text-brand-400">${r.symbol}</span>
        <span class="ml-2">${r.company_name||''}</span>
        <span class="text-xs text-muted ml-2">${r.sector||''} · ${r.country||''}</span>
      </button>`).join('') || '<div class="px-3 py-3 text-xs text-muted">No matches</div>';
  } catch (e) {
    ac.classList.add('hidden');
  }
}

function addCompareStock(r) {
  if (!state.compareSelected) state.compareSelected = [];
  if (state.compareSelected.length >= 5) { alert('Max 5 stocks'); return; }
  if (state.compareSelected.some(s => s.symbol === r.symbol && s.exchange_code === r.exchange_code)) return;
  state.compareSelected.push(r);
  renderCompareChips();
  const ac = $('cmp-ac'); if (ac) ac.classList.add('hidden');
  const inp = $('cmp-search'); if (inp) inp.value = '';
}

async function runComparePage() {
  const sel = state.compareSelected || [];
  const out = $('cmp-out');
  if (!out) return;
  if (!sel.length) { out.innerHTML = '<p class="text-muted text-sm">Select at least one stock.</p>'; return; }
  out.innerHTML = '<div class="flex justify-center py-10"><div class="loader"></div></div>';
  document.querySelectorAll('.cmp-tab-btn').forEach(b => {
    b.classList.toggle('bg-brand-600', b.dataset.ctab === state.compareTab);
    b.classList.toggle('text-white', b.dataset.ctab === state.compareTab);
  });
  const symbols = sel.map(s => s.symbol).join(',');
  const exchanges = sel.map(s => s.exchange_code || '').join(',');
  try {
    const d = await fetchJSON(`${API}/compare?symbols=${encodeURIComponent(symbols)}&exchanges=${encodeURIComponent(exchanges)}`);
    const rows = d.rows || [];
    const tab = state.compareTab || 'overview';
    if (tab === 'overview') {
      out.innerHTML = `<div class="bg-surf border border-app rounded-xl overflow-x-auto">
        <table class="w-full text-sm"><thead class="bg-surf2 text-muted text-xs uppercase"><tr>
          <th class="text-left px-3 py-2">Metric</th>${rows.map(r=>`<th class="text-right px-3 py-2 font-mono text-brand-400">${r.symbol}</th>`).join('')}
        </tr></thead><tbody>
          ${[['Name',r=>r.name||r.symbol],['Price',r=>r.price!=null?fmtNum(r.price):'—'],['Market Cap',r=>r.market_cap!=null?fmtNum(r.market_cap):'—'],
             ['P/E',r=>r.pe!=null?Number(r.pe).toFixed(2):'—'],['Sector',r=>r.sector||'—']].map(([lab,fn]) =>
            `<tr class="border-b border-app"><td class="px-3 py-2 text-muted text-xs">${lab}</td>${rows.map(r=>`<td class="px-3 py-2 text-right font-mono text-xs">${fn(r)}</td>`).join('')}</tr>`
          ).join('')}
        </tbody></table></div>`;
    } else if (tab === 'market') {
      out.innerHTML = `<div class="bg-surf border border-app rounded-xl p-4">
        <div class="chart-box" style="height:280px"><canvas id="cmp-mkt-chart"></canvas></div>
        <p class="text-xs text-muted mt-2">1Y change when available.</p></div>`;
      setTimeout(() => {
        destroyChart('cmpMkt');
        charts.cmpMkt = new Chart($('cmp-mkt-chart'), {
          type: 'bar',
          data: { labels: rows.map(r=>r.symbol), datasets: [{ data: rows.map(r => r.year_change != null ? (Math.abs(r.year_change)<=2?r.year_change*100:r.year_change) : null),
            backgroundColor: rows.map(r => (r.year_change||0)>=0?'rgba(52,211,153,0.7)':'rgba(248,113,113,0.7)'), borderRadius: 6 }] },
          options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } },
            scales: { x: { ticks: { color: '#94a3b8' } }, y: { ticks: { color: '#94a3b8', callback: v => v+'%' } } } }
        });
      }, 30);
    } else if (tab === 'overall') {
      out.innerHTML = `<div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        ${rows.map(r => `<div class="bg-surf border border-app rounded-xl p-4">
          <div class="font-mono text-brand-400 font-semibold">${r.symbol}</div>
          <div class="text-sm mt-1">${r.name||'—'}</div>
          <div class="text-xs text-muted mt-2">Analyst / recommendation data surfaces when available from live sources.</div>
          <div class="mt-2 text-xs">Sector: ${r.sector||'—'} · P/E: ${r.pe!=null?Number(r.pe).toFixed(1):'—'}</div>
        </div>`).join('')}
      </div>`;
    } else {
      out.innerHTML = `<div class="bg-surf border border-app rounded-xl overflow-x-auto">
        <table class="w-full text-sm"><thead class="bg-surf2 text-muted text-xs uppercase"><tr>
          <th class="text-left px-3 py-2">Metric</th>${rows.map(r=>`<th class="text-right px-3 py-2">${r.symbol}</th>`).join('')}
        </tr></thead><tbody>
          ${[['P/E',r=>r.pe],['Fwd P/E',r=>r.forward_pe],['P/B',r=>r.pb],['EPS',r=>r.eps],['Beta',r=>r.beta],['Div Yield',r=>r.dividend_yield!=null?(Number(r.dividend_yield)*100).toFixed(2)+'%':null]]
            .map(([lab,fn]) => `<tr class="border-b border-app"><td class="px-3 py-2 text-xs text-muted">${lab}</td>
              ${rows.map(r=>{const v=fn(r);return `<td class="px-3 py-2 text-right font-mono text-xs">${v==null?'—':(typeof v==='number'?Number(v).toFixed(2):v)}</td>`}).join('')}</tr>`).join('')}
        </tbody></table></div>`;
    }
  } catch (e) {
    out.innerHTML = `<p class="text-red-400 text-sm">${e.message}</p>`;
  }
}

/* ========== REPORT GENERATION ========== */
async function renderReportPage() {
  $('breadcrumb').textContent = 'Generate Report';
  state.classroomMode = localStorage.getItem('finsight_classroom') === '1';
  // positioning strip injected in page HTML
  state.reportStock = state.stock || state.lastStock || null;
  state.reportTab = 'equity';
  $('content').innerHTML = `
    <div class="space-y-4 fade max-w-6xl w-full">
      <div>
        <h1 class="text-2xl font-bold">Generate Analysis Report</h1>
        <p class="text-sm text-muted mt-1">Search a stock, review the snapshot, then generate PDF reports.</p>
      </div>
      
      <div class="bg-surf border border-app rounded-xl p-4 relative">
        <input id="report-search" type="search" placeholder="Search symbol or company…"
          class="w-full bg-surf2 border border-app rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
          oninput="onReportSearch(this.value)" autocomplete="off" />
        <div id="report-ac" class="absolute left-4 right-4 top-full mt-1 bg-surf border border-app rounded-xl shadow-xl max-h-56 overflow-y-auto z-30 hidden"></div>
        <div id="report-selected" class="mt-3 text-sm text-muted">${state.reportStock ? `Selected: <span class="font-mono text-brand-400">${state.reportStock.symbol}</span> ${state.reportStock.company_name||''}` : 'No stock selected'}</div>
      </div>
      <div id="report-preview" class="hidden bg-surf border border-app rounded-xl p-4"></div>
      <div class="flex gap-1 p-0.5 rounded-xl bg-surf2 border border-app">
        <button onclick="state.reportTab='equity';renderReportTabs()" class="flex-1 px-3 py-2 rounded-lg text-xs font-medium report-tab bg-brand-600 text-white" data-rtab="equity">Equity Research Report</button>
      </div>
      <div id="report-tab-body" class="bg-surf border border-app rounded-xl p-5 text-sm text-muted">Select a stock to prepare reports.</div>
    </div>`;
  if (state.reportStock) selectReportStock(state.reportStock);
}

async function onReportSearch(q) {
  const ac = $('report-ac');
  if (!ac || !q || q.length < 1) { if (ac) ac.classList.add('hidden'); return; }
  try {
    const d = await fetchJSON(`${API}/search?q=${encodeURIComponent(q)}&limit=20`);
    ac.classList.remove('hidden');
    ac.innerHTML = (d.results||[]).map(r => `
      <button type="button" class="w-full text-left px-3 py-2 text-sm hover:bg-surf2 border-b border-app"
        onclick='selectReportStock(${JSON.stringify(r).replace(/'/g,"&#39;")})'>
        <span class="font-mono text-brand-400">${r.symbol}</span> ${r.company_name||''}
        <span class="text-xs text-muted ml-2">${r.country||''}</span>
      </button>`).join('') || '<div class="px-3 py-2 text-xs text-muted">No matches</div>';
  } catch(e) { ac.classList.add('hidden'); }
}

async function selectReportStock(r) {
  state.reportStock = r;
  state.lastStock = r;
  const ac = $('report-ac'); if (ac) ac.classList.add('hidden');
  if ($('report-selected')) $('report-selected').innerHTML = `Selected: <span class="font-mono text-brand-400">${r.symbol}</span> ${r.company_name||''}`;
  const prev = $('report-preview');
  if (prev) {
    prev.classList.remove('hidden');
    prev.innerHTML = `<div class="flex justify-center py-6"><div class="loader"></div></div>`;
    try {
      const b = await fetchJSON(`${API}/stock-bundle/${encodeURIComponent(r.symbol)}?exchange=${encodeURIComponent(r.exchange_code||'')}`);
      state.reportBundle = b;
      prev.innerHTML = `
        <div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 text-sm">
          <div><div class="text-xs text-muted">Name</div><div class="font-medium">${b.name||r.company_name||r.symbol}</div></div>
          <div><div class="text-xs text-muted">Symbol</div><div class="font-mono text-brand-400">${r.symbol}</div></div>
          <div><div class="text-xs text-muted">Price</div><div class="font-mono">${b.price!=null?fmtNum(b.price):'—'} ${b.currency||''}</div></div>
          <div><div class="text-xs text-muted">Market Cap</div><div class="font-mono">${b.market_cap!=null?fmtNum(b.market_cap):'—'}</div></div>
          <div><div class="text-xs text-muted">Country</div><div>${r.country||b.snapshot?.country||'—'}</div></div>
          <div><div class="text-xs text-muted">Sector</div><div>${b.sector||r.sector||'—'}</div></div>
          <div><div class="text-xs text-muted">Industry</div><div>${b.industry||r.industry||'—'}</div></div>
          <div><div class="text-xs text-muted">Exchange</div><div>${r.stock_exchange||r.exchange_code||'—'}</div></div>
        </div>
        <p class="text-xs text-muted mt-3 line-clamp-3">${b.summary||''}</p>
        <button onclick="renderReportTabs()" class="mt-3 bg-brand-600 text-white text-sm px-4 py-2 rounded-lg">Prepare reports</button>`;
    } catch(e) {
      prev.innerHTML = `<p class="text-red-400 text-sm">${e.message}</p>`;
    }
  }
  renderReportTabs();
}

function renderReportTabs() {
  const body = $('report-tab-body');
  if (!body) return;
  const r = state.reportStock;
  if (!r) { body.innerHTML = 'Select a stock first.'; return; }
  document.querySelectorAll('.report-tab').forEach(el => {
    el.classList.toggle('bg-brand-600', el.dataset.rtab === state.reportTab);
    el.classList.toggle('text-white', el.dataset.rtab === state.reportTab);
  });
  const tab = state.reportTab || 'equity';
  const highlights = {
    equity: [
      'Cover snapshot — price, market cap, 52W range, multiples, sector/industry',
      'Investment summary and company profile from live scrape',
      'Multi-year income statement, balance sheet and cash-flow extracts',
      'Ratio & KPI dashboard (valuation, profitability, liquidity, growth)',
      'Transparent valuation context (illustrative range, CAPM cost of equity)',
      'SWOT analysis grounded in statement trends',
      'Operational, economic and market/listing risk factors',
      'Methodology appendix and data-source disclosure',
    ],
    financial: [
      'Abstract and structured introduction',
      'Expense / cost-structure analysis from public statements',
      'Income, balance-sheet and cash-flow extracts',
      'Ratio panel across valuation, profitability, leverage and cash',
      'Shareholder & listing notes',
      'Full SWOT (strengths, weaknesses, opportunities, threats)',
      'Conclusions, limitations and source log',
    ],
  };
  const ex = r.exchange_code || r.stock_exchange || '';
  body.innerHTML = `
    <h3 class="font-semibold text-app mb-2">${{equity:'Equity Research',financial:'Financial Analysis'}[tab]} — ${r.symbol}${ex ? ' · ' + ex : ''}</h3>
    <p class="text-xs text-muted mb-2">Institutional multi-page pack. Primary source: stockanalysis.com scrape for this symbol and exchange. Secondary multi-source fill where needed.</p>
    <ul class="list-disc pl-5 space-y-1 text-muted mb-4 text-sm">${(highlights[tab]||[]).map(h=>`<li>${h}</li>`).join('')}</ul>
    
    <div class="flex flex-wrap gap-2">
      <button onclick="openInstitutionalReport('${tab}','html')" class="bg-brand-600 hover:bg-brand-500 text-white text-sm font-medium px-4 py-2 rounded-lg btn-press">
        Open full report (print-ready)
      </button>
      
      
    </div>
    <p id="report-gen-status" class="text-xs text-muted mt-3"></p>`;
}


function generateReportFromAnalysis() {
  const s = state.stock || {};
  if (!s.symbol) { alert('Open a stock analysis first.'); return; }
  state.reportStock = {
    symbol: s.symbol,
    exchange_code: s.exchange_code || s.stock_exchange || '',
    company_name: s.company_name || s.name || s.symbol,
  };
  state.reportTab = 'equity';
  openInstitutionalReport('equity', 'html');
}

async function openInstitutionalReport(kind, format) {
  const r = state.reportStock;
  if (!r || !r.symbol) return;
  const ex = encodeURIComponent(r.exchange_code || '');
  const sym = encodeURIComponent(r.symbol);
  const k = encodeURIComponent('equity');
  const status = $('report-gen-status');
  if (status) status.innerHTML = '<span class="inline-flex items-center gap-2"><span class="loader" style="width:14px;height:14px;border-width:2px"></span> Checking report engine…</span>';

  try {
    const ping = await fetch(API + '/report-ping');
    if (!ping.ok) {
      if (status) status.innerHTML = '<span class="text-red-400">Report engine not loaded on this server. Kill old uvicorn processes and restart from the stock-insight folder: <code class="font-mono text-xs">python -m uvicorn backend.main:app --host 0.0.0.0 --port 8000</code>. Then open <code class="font-mono text-xs">/api/report-ping</code> — it must show ok:true.</span>';
      return;
    }
  } catch (e) {
    if (status) status.innerHTML = '<span class="text-red-400">Cannot reach API. Is FinSight running on port 8000?</span>';
    return;
  }

  if (status) status.innerHTML = '<span class="inline-flex items-center gap-2"><span class="loader" style="width:14px;height:14px;border-width:2px"></span> Building equity research report from multi-source data — this can take 15–60 seconds…</span>';
  if (format === 'json') {
    const url = API + '/reports/json?symbol=' + sym + '&kind=' + k + '&exchange=' + ex;
    const a = document.createElement('a');
    a.href = url; a.target = '_blank'; a.rel = 'noopener';
    document.body.appendChild(a); a.click(); a.remove();
    if (status) status.textContent = 'JSON payload download started.';
    return;
  }
  if (format === 'pdf') {
    const url = API + '/reports/pdf?symbol=' + sym + '&kind=' + k + '&exchange=' + ex;
    const a = document.createElement('a');
    a.href = url;
    a.target = '_blank';
    a.rel = 'noopener';
    document.body.appendChild(a);
    a.click();
    a.remove();
    if (status) status.textContent = 'PDF download started. Wait for the file — generation can take up to a minute.';
    return;
  }
  const url = API + '/reports/html?symbol=' + sym + '&kind=' + k + '&exchange=' + ex;
  const w = window.open(url, '_blank');
  if (!w) {
    if (status) status.textContent = 'Pop-up blocked — allow pop-ups for this site, then try again.';
    else alert('Allow pop-ups to view the report');
    return;
  }
  if (status) status.textContent = 'Report opened in a new tab. Use Print → Save as PDF for a local copy.';
}

// backward-compatible alias
function openReportPdf(kind) {
  openInstitutionalReport('equity', 'html');
}

/* INIT */
document.addEventListener('DOMContentLoaded', () => {
  const sp = new URLSearchParams(location.search);
  const page = sp.get('page') || 'dashboard';
  const params = {};
  if (sp.get('country')) params.country = sp.get('country');
  if (sp.get('exchange')) params.exchangeCode = sp.get('exchange');
  if (sp.get('sector')) params.sector = sp.get('sector');
  if (sp.get('industry')) params.industry = sp.get('industry');
  if (sp.get('symbol')) params.stock = { symbol: sp.get('symbol'), exchange_code: sp.get('ex') || '' };
  navigate(page, params, { replace: true });
});



function toggleClassroomMode() {
  state.classroomMode = !state.classroomMode;
  localStorage.setItem('finsight_classroom', state.classroomMode ? '1' : '0');
  if (state.page === 'analysis') renderAnalysis();
  else if (typeof renderReportPage === 'function') try { renderReportPage(); } catch(e) {}
  const el = document.getElementById('classroom-btn');
  if (el) el.textContent = state.classroomMode ? 'Classroom: ON' : 'Classroom: OFF';
}

function openGlossaryDrawer() {
  const terms = {
    'P/E': 'Price divided by earnings per share — how much investors pay per unit of earnings.',
    'EPS': 'Earnings per share — net income attributable to each share.',
    'ROE': 'Return on equity — net income as a percentage of shareholders equity.',
    'Free Cash Flow': 'Operating cash flow minus capital expenditure — cash available after maintaining the asset base.',
    'Beta': 'Sensitivity of the stock to market moves; above 1 means historically more volatile than the market.',
    'Current Ratio': 'Current assets divided by current liabilities — short-term coverage.',
    'Debt/Equity': 'Leverage measure comparing debt to book equity.',
  };
  const body = Object.entries(terms).map(([k,v]) => `<div class="mb-3"><div class="font-semibold text-sm">${k}</div><div class="text-xs text-muted">${v}</div></div>`).join('');
  const html = `<div class="fixed inset-0 z-[100] flex items-end sm:items-center justify-center p-4 modal-backdrop" onclick="if(event.target===this)this.remove()">
    <div class="bg-surf border border-app rounded-2xl w-full max-w-md max-h-[80vh] overflow-y-auto p-5 shadow-2xl">
      <div class="flex justify-between items-center mb-3"><h3 class="font-semibold">Glossary</h3>
        <button class="text-muted" onclick="this.closest('.fixed').remove()">✕</button></div>
      ${body}
      <p class="text-[11px] text-muted mt-2">Educational definitions only — confirm exact constructions in company filings.</p>
    </div></div>`;
  document.body.insertAdjacentHTML('beforeend', html);
}


async function downloadStatementCsv(statement) {
  const s = state.stock || {};
  if (!s.symbol) return;
  const url = `${API}/reports/csv/${encodeURIComponent(s.symbol)}?exchange=${encodeURIComponent(s.exchange_code||'')}&statement=${encodeURIComponent(statement||'income')}`;
  window.open(url, '_blank');
}

async function loadPeersForAnalysis() {
  const s = state.stock || {};
  if (!s.symbol) return;
  try {
    const data = await fetchJSON(`${API}/peers/${encodeURIComponent(s.symbol)}?exchange=${encodeURIComponent(s.exchange_code||'')}&limit=8`);
    if (!data?.available || !data.peers?.length) return;
    const box = $('tab-content');
    if (!box || document.getElementById('peers-box')) return;
    const el = document.createElement('div');
    el.id = 'peers-box';
    el.className = 'mt-4 bg-surf border border-app rounded-xl p-4';
    el.innerHTML = `<h4 class="text-sm font-semibold mb-2">Industry peers (${data.industry || ''})</h4>
      <div class="flex flex-wrap gap-2">${data.peers.map(p =>
        `<button class="text-xs px-2 py-1 rounded-lg border border-app hover:border-brand-500"
          onclick="navigate('analysis',{symbol:'${p.symbol}',exchange:'${p.exchange_code||''}'})">${p.symbol}${p.pack_available?' · pack':''}</button>`
      ).join('')}</div>
      <p class="text-[11px] text-muted mt-2">Same-industry listings from the FinSight universe (not full ratio percentiles).</p>`;
    box.appendChild(el);
  } catch (e) {}
}

async function pickPrimaryListing(symbol, exchange) {
  state.stock = Object.assign({}, state.stock || {}, { symbol, exchange_code: exchange });
  navigate('analysis', { symbol, exchange });
}

// Part1 handoff
(function () {
  try {
    const qs = new URLSearchParams(location.search);
    const country = qs.get('country') || qs.get('country_name');
    const exchange = qs.get('exchange');
    if (country) {
      window.__FINSIGHT_PENDING_COUNTRY = country;
    }
    if (exchange) window.__FINSIGHT_PENDING_EXCHANGE = exchange;
  } catch (e) {}
  document.addEventListener('DOMContentLoaded', function () {
    const c = window.__FINSIGHT_PENDING_COUNTRY;
    if (!c) return;
    setTimeout(function () {
      try {
        if (typeof navigate === 'function') navigate('screener');
        const gs = document.getElementById('global-search');
        if (gs) { gs.value = c; gs.dispatchEvent(new Event('input', { bubbles: true })); }
      } catch (e) {}
    }, 500);
  });
})();
