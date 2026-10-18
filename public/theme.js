// 라이트·다크 화면 선택. 브라우저 저장 공간은 쓰지 않으므로 선택값은 주소 뒤 #theme=light|dark 로만 이어집니다.
// 처음 열 때는 주소의 선택값, 없으면 기기의 화면 설정을 따릅니다.
(() => {
  const root = document.documentElement;
  const META_COLORS = { dark: '#101a28', light: '#f4f7fb' };
  const match = /theme=(light|dark)/u.exec(location.hash);
  let theme = match ? match[1] : (matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark');

  function syncLinks() {
    for (const link of document.querySelectorAll('a[href^="/"]')) {
      const base = link.getAttribute('href').split('#')[0];
      link.setAttribute('href', `${base}#theme=${theme}`);
    }
  }

  function apply(explicit) {
    root.dataset.theme = theme;
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', META_COLORS[theme]);
    const button = document.getElementById('theme-toggle');
    if (button) {
      button.textContent = theme === 'dark' ? '라이트 모드로 보기' : '다크 모드로 보기';
      button.setAttribute('aria-pressed', String(theme === 'dark'));
    }
    if (explicit) history.replaceState(null, '', `${location.pathname}${location.search}#theme=${theme}`);
    syncLinks();
  }

  apply(false);
  document.addEventListener('DOMContentLoaded', () => {
    apply(false);
    const button = document.getElementById('theme-toggle');
    if (button) {
      button.addEventListener('click', () => {
        theme = theme === 'dark' ? 'light' : 'dark';
        apply(true);
      });
    }
  });
})();
