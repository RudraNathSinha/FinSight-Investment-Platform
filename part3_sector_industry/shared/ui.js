/* © All rights reserved FinSight prepared by Rudra Nath Sinha */
/* Shared empty-states, disclaimer strip, guided-path helpers */
(function (global) {
  function emptyState(opts) {
    opts = opts || {};
    const title = opts.title || 'No data available';
    const detail = opts.detail || 'This section has no usable figures for the selected symbol or filter.';
    const tip = opts.tip || 'Try another symbol, period, or check that the Flask backend is running.';
    const icon = opts.icon || 'inbox';
    return (
      '<div class="finsight-empty rounded-xl border border-dashed border-slate-300 dark:border-slate-700 bg-slate-50/80 dark:bg-slate-900/40 p-6 text-center my-2" role="status">' +
        '<div class="mx-auto w-10 h-10 rounded-full bg-slate-200/80 dark:bg-slate-800 flex items-center justify-center mb-3 text-slate-500">' +
          '<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8" d="M20 13V7a2 2 0 00-2-2h-3.5L12 3 9.5 5H6a2 2 0 00-2 2v6m16 0v4a2 2 0 01-2 2H6a2 2 0 01-2-2v-4m16 0H4"/></svg>' +
        '</div>' +
        '<div class="font-semibold text-slate-800 dark:text-slate-100">' + title + '</div>' +
        '<p class="text-sm text-slate-500 dark:text-slate-400 mt-1 max-w-md mx-auto">' + detail + '</p>' +
        '<p class="text-xs text-slate-400 mt-2">' + tip + '</p>' +
      '</div>'
    );
  }

  function isBlankValue(v) {
    return v == null || v === '' || (typeof v === 'number' && isNaN(v));
  }

  function isBlankTable(rows) {
    return !rows || !rows.length;
  }

  function disclaimerStrip(compact) {
    if (compact) {
      return (
        '<p class="finsight-disclaimer-strip text-[10px] leading-snug text-slate-400 dark:text-slate-500 mt-4 px-1">' +
        'Educational use only · Not investment advice · <a class="underline hover:text-brand-600" href="/disclaimer.html">Full disclaimer</a> · ' +
        '© FinSight · Rudra Nath Sinha' +
        '</p>'
      );
    }
    return (
      '<div class="finsight-disclaimer-strip mt-6 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50 px-4 py-3 text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">' +
      '<strong class="text-slate-700 dark:text-slate-300">Disclaimer:</strong> FinSight is an educational analytics workspace. ' +
      'It is not SEBI-registered research or personalised investment advice. Data may be incomplete. Models are illustrative. ' +
      'Verify with primary filings and a licensed adviser. ' +
      '<a class="underline hover:text-brand-600" href="/disclaimer.html">Read full disclaimer</a> · ' +
      '<a class="underline hover:text-brand-600" href="/methodology.html">Methodology</a>. ' +
      '© All rights reserved FinSight prepared by Rudra Nath Sinha.' +
      '</div>'
    );
  }

  /** Fix relative links when opened from part1/2/3 subfolders */
  function legalHref(page) {
    try {
      const path = (location.pathname || '').replace(/\\/g, '/');
      if (path.indexOf('/part1_') >= 0 || path.indexOf('/part2_') >= 0 || path.indexOf('/part3_') >= 0) {
        return '../' + page;
      }
    } catch (_) {}
    return page;
  }

  function injectFooterDisclaimer(root) {
    const host = root || document.getElementById('content') || document.querySelector('main');
    if (!host) return;
    if (host.querySelector('.finsight-disclaimer-strip')) return;
    const wrap = document.createElement('div');
    let html = disclaimerStrip(false);
    html = html.replace(/href="\/disclaimer.html"/g, 'href="' + legalHref('disclaimer.html') + '"');
    html = html.replace(/href="\/methodology.html"/g, 'href="' + legalHref('methodology.html') + '"');
    wrap.innerHTML = html;
    host.appendChild(wrap.firstChild);
  }

  global.FinSightUI = {
    emptyState,
    isBlankValue,
    isBlankTable,
    disclaimerStrip,
    legalHref,
    injectFooterDisclaimer,
  };
})(window);
