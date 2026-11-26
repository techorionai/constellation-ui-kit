(function () {
  try {
    var stored = window.localStorage.getItem('mantine-color-scheme-value');
    var scheme = stored === 'light' || stored === 'dark' || stored === 'auto' ? stored : 'auto';
    var computed =
      scheme !== 'auto'
        ? scheme
        : window.matchMedia('(prefers-color-scheme: dark)').matches
          ? 'dark'
          : 'light';
    document.documentElement.setAttribute('data-mantine-color-scheme', computed);
  } catch {
    try {
      var dark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      document.documentElement.setAttribute('data-mantine-color-scheme', dark ? 'dark' : 'light');
    } catch {
      document.documentElement.setAttribute('data-mantine-color-scheme', 'light');
    }
  }
})();
