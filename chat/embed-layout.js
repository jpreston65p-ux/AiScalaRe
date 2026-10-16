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

  // Only relay user-driven scrolling in the workspace, never streamed auto-scroll.
  let userScrollUntil = 0, queued = false, pendingScroll;
  const scrollPositions = new WeakMap();
  const noteScrollIntent = event => {
    userScrollUntil = Date.now() + 500;
    const scroller = event?.target?.closest?.('#messages,#ideas');
    if (scroller) scrollPositions.set(scroller, scroller.scrollTop);
  };
  window.addEventListener('wheel', noteScrollIntent, { passive: true });
  window.addEventListener('touchmove', noteScrollIntent, { passive: true });
  window.addEventListener('pointerdown', noteScrollIntent, { passive: true });
  window.addEventListener('pointermove', event => { if (event.buttons) noteScrollIntent(event); }, { passive: true });
  window.addEventListener('keydown', event => {
    if (event.key === 'Tab' || event.key === 'Escape') {
      window.parent.postMessage({ type: 'scala:nav-reveal' }, '*');
    }
    if (event.target?.closest?.('textarea,input,[contenteditable="true"]')) return;
    if (['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End', ' '].includes(event.key)) noteScrollIntent(event);
  });
  window.addEventListener('scroll', event => {
    const scroller = event.target;
    if (!['messages', 'ideas'].includes(scroller?.id)) return;
    const top = scroller.scrollTop;
    if (typeof top !== 'number' || !Number.isFinite(top) || top < 0) return;
    const previousTop = scrollPositions.get(scroller) ?? top;
    scrollPositions.set(scroller, top);
    if (Date.now() > userScrollUntil) return;
    pendingScroll = { type: 'scala:content-scroll', scroller: scroller.id, top,
      previousTop: pendingScroll?.scroller === scroller.id ? pendingScroll.previousTop : previousTop };
    if (queued) return;
    queued = true;
    window.requestAnimationFrame(() => {
      queued = false;
      if (pendingScroll) window.parent.postMessage(pendingScroll, '*');
      pendingScroll = undefined;
    });
  }, { capture: true, passive: true });
  window.parent.postMessage({ type: 'scala:embed-ready' }, '*');
})();
