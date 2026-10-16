(() => {
  'use strict';
  if (!window.parent || window.parent === window) return;
  const query = new URLSearchParams(window.location.search);
  if (query.get('embed') !== 'scala') return;

  const root = document.documentElement;
  let height = 0;
  let collapsed = false, layoutStableAt = 0;
  root.dataset.scalaEmbed = 'true';

  function updateCompactLayout() {
    root.dataset.scalaEmbedCompact = String(window.innerHeight - height <= 660);
  }

  function setHeight(value, nextCollapsed = false) {
    if (typeof value !== 'number' || !Number.isFinite(value)) return;
    const nextHeight = Math.min(800, Math.max(0, Math.round(value)));
    nextCollapsed = nextCollapsed === true;
    if (height !== nextHeight || collapsed !== nextCollapsed) layoutStableAt = Date.now() + 400;
    height = nextHeight; collapsed = nextCollapsed;
    root.style.setProperty('--scala-nav-height', height + 'px');
    root.dataset.scalaNavCollapsed = String(collapsed);
    updateCompactLayout();
  }

  setHeight(Number(query.get('navHeight') || 0));
  window.addEventListener('message', event => {
    if (event.source !== window.parent || event.data?.type !== 'scala:nav-layout') return;
    setHeight(event.data.height, event.data.collapsed);
  });
  window.addEventListener('resize', () => {
    layoutStableAt = Date.now() + 400;
    updateCompactLayout();
  }, { passive: true });

  // Relay reading gestures even when the welcome screen has nothing to scroll.
  let userScrollUntil = 0, queued = false, pendingScroll;
  let intentQueued = false, intentDelta = 0, touch;
  const scrollPositions = new WeakMap();
  const editing = target => !!target?.closest?.('dialog,[role="dialog"],.sidebar,input,textarea,select,[contenteditable="true"]');
  function queueIntent(delta) {
    if (typeof delta !== 'number' || !Number.isFinite(delta) || Math.abs(delta) < 1) return;
    intentDelta = Math.max(-240, Math.min(240, intentDelta + delta));
    if (intentQueued) return;
    intentQueued = true;
    window.requestAnimationFrame(() => {
      intentQueued = false;
      if (intentDelta) window.parent.postMessage({ type: 'scala:scroll-intent', delta: intentDelta }, '*');
      intentDelta = 0;
    });
  }
  const noteScrollIntent = event => {
    userScrollUntil = Date.now() + 500;
    const scroller = event?.target?.closest?.('#messages,#ideas');
    if (scroller) scrollPositions.set(scroller, scroller.scrollTop);
  };
  window.addEventListener('wheel', event => {
    noteScrollIntent(event);
    if (event.defaultPrevented || event.ctrlKey || editing(event.target)) return;
    if (Math.abs(event.deltaX || 0) > Math.abs(event.deltaY || 0)) return;
    const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? window.innerHeight : 1;
    queueIntent(event.deltaY * unit);
  }, { passive: true });
  window.addEventListener('touchstart', event => {
    const point = event.touches?.length === 1 && !editing(event.target) ? event.touches[0] : null;
    touch = point ? { x: point.clientX, y: point.clientY } : undefined;
  }, { passive: true });
  window.addEventListener('touchmove', event => {
    noteScrollIntent(event);
    if (!touch || event.touches?.length !== 1) return;
    const point = event.touches[0];
    const delta = touch.y - point.clientY;
    if (Math.abs(delta) > Math.abs(touch.x - point.clientX)) queueIntent(delta);
    touch = { x: point.clientX, y: point.clientY };
  }, { passive: true });
  window.addEventListener('touchend', () => { touch = undefined; }, { passive: true });
  window.addEventListener('touchcancel', () => { touch = undefined; }, { passive: true });
  window.addEventListener('pointerdown', noteScrollIntent, { passive: true });
  window.addEventListener('pointermove', event => { if (event.buttons) noteScrollIntent(event); }, { passive: true });
  window.addEventListener('keydown', event => {
    if (event.key === 'Tab' || event.key === 'Escape') {
      window.parent.postMessage({ type: 'scala:nav-reveal' }, '*');
    }
    if (editing(event.target)) return;
    if (['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End', ' '].includes(event.key)) {
      noteScrollIntent(event);
      const up = ['ArrowUp', 'PageUp', 'Home'].includes(event.key) || (event.key === ' ' && event.shiftKey);
      queueIntent(up ? -48 : 48);
    }
  });
  window.addEventListener('scroll', event => {
    const scroller = event.target;
    if (!['messages', 'ideas'].includes(scroller?.id)) return;
    const top = scroller.scrollTop;
    if (typeof top !== 'number' || !Number.isFinite(top) || top < 0) return;
    const previousTop = scrollPositions.get(scroller) ?? top;
    scrollPositions.set(scroller, top);
    if (Date.now() > userScrollUntil || Date.now() < layoutStableAt) return;
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
