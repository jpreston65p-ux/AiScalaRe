(() => {
  'use strict';
  if (!window.parent || window.parent === window) return;
  const query = new URLSearchParams(window.location.search);
  if (query.get('embed') !== 'scala') return;

  const root = document.documentElement;
  let height = 0;
  root.dataset.scalaEmbed = 'true';

  function updateCompactLayout() {
    root.dataset.scalaEmbedCompact = String(window.innerHeight - height <= 660);
  }

  function setHeight(value) {
    if (typeof value !== 'number' || !Number.isFinite(value)) return;
    height = Math.min(800, Math.max(0, Math.round(value)));
    root.style.setProperty('--scala-nav-height', height + 'px');
    updateCompactLayout();
  }

  setHeight(Number(query.get('navHeight') || 0));
  window.addEventListener('message', event => {
    if (event.source !== window.parent || event.data?.type !== 'scala:nav-layout') return;
    setHeight(event.data.height);
  });
  window.addEventListener('resize', updateCompactLayout, { passive: true });
  window.parent.postMessage({ type: 'scala:embed-ready' }, '*');
})();
