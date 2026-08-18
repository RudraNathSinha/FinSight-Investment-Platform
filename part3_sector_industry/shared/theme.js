/* © All rights reserved FinSight prepared by Rudra Nath Sinha */
(function () {
  const KEY = 'finsight-theme';
  const root = document.documentElement;

  function apply(theme) {
    if (theme === 'dark') root.classList.add('dark');
    else root.classList.remove('dark');
    try { localStorage.setItem(KEY, theme); } catch (_) {}
    window.dispatchEvent(new Event('themechange'));
  }

  // Default = light. Only switch to dark if the user previously chose it.
  const saved = (function () {
    try { return localStorage.getItem(KEY); } catch (_) { return null; }
  })();
  if (saved === 'dark') apply('dark');
  else apply('light');

  document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('themeToggle')?.addEventListener('click', () => {
      apply(root.classList.contains('dark') ? 'light' : 'dark');
    });
  });
})();
