// Apply the saved theme before first paint without requiring inline-script CSP.
(function initializeTheme() {
  try {
    var theme = localStorage.getItem('theme');
    if (!theme) {
      theme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }
    document.documentElement.classList.add(theme);
  } catch (_error) {
    document.documentElement.classList.add('light');
  }
})();
