/*
 * Render scheduling for heavy PDFs.
 *
 * Two things stall pdf.js 2.7 on large documents:
 *
 *  1. Text layers are laid out synchronously on the main thread as soon as a
 *     page's canvas has painted (TextLayerBuilder.render -> renderTextLayer
 *     measures every text item with measureText and appends thousands of
 *     spans). After a zoom commit or a page jump, several pages finish painting
 *     in the same frame and their text layers stack into one 100-300 ms stall.
 *     Here text layers are queued and built one per animation frame, only once
 *     scrolling and pinching have settled. Text selection and find highlights
 *     appear a few frames later, which is not noticeable; the canvas is not
 *     delayed at all.
 *
 *  2. While the user flings through the document, every scroll frame asks the
 *     rendering queue for the pages now in view, and each start allocates a
 *     canvas and kicks the worker. Those pages are gone a few frames later.
 *     pdf.js pauses renders that lose priority, but the setup work is wasted
 *     and competes with scrolling. Above FLING_PX_PER_S no new renders start;
 *     one update runs as soon as the scroll settles.
 *
 * Nothing here changes what gets rendered or at what resolution.
 */
(() => {
  "use strict";
  const LITE = !!(window.__viewerDevice && window.__viewerDevice.lite);   // device.js
  const FLING_PX_PER_S = LITE ? 1800 : 2500;   // faster than this: pages are just passing by
  const SETTLE_MS = 90;                         // no scroll event for this long = settled
  const TEXT_IDLE_MS = LITE ? 200 : 120;        // text layers wait this long after the last scroll

  function patch(app) {
    const pv = app.pdfViewer, q = app.pdfRenderingQueue;
    if (!pv || !q || pv.__perfPatched) return;
    pv.__perfPatched = true;
    const container = pv.container, viewerEl = pv.viewer;

    // --- scroll velocity -----------------------------------------------------
    let lastTop = container.scrollTop, lastT = performance.now(), lastScrollAt = 0;
    let velocity = 0, settleTimer = 0, updateDeferred = false;
    const flinging = () => velocity > FLING_PX_PER_S;
    const pinching = () => viewerEl.style.transform !== "";   // smooth.js preview
    const idle = () => !flinging() && !pinching() && performance.now() - lastScrollAt > TEXT_IDLE_MS;
    container.addEventListener("scroll", () => {
      const now = performance.now(), top = container.scrollTop, dt = now - lastT;
      if (dt > 0) velocity = (Math.abs(top - lastTop) / dt) * 1000;
      lastTop = top; lastT = now; lastScrollAt = now;
      clearTimeout(settleTimer);
      settleTimer = setTimeout(() => {
        velocity = 0;
        if (updateDeferred) { updateDeferred = false; pv.update(); }
        armFlush();
      }, SETTLE_MS);
    }, { passive: true, capture: true });

    // --- render starts gated while flinging -------------------------------------
    const origRHP = q.renderHighestPriority.bind(q);
    q.renderHighestPriority = function (visible) {
      if (flinging()) { updateDeferred = true; return; }
      return origRHP(visible);
    };

    // --- text layers: queued, one per frame, when idle --------------------------
    // Pages pre-rendered ahead of the viewport get their canvas now and their
    // text layer only once they scroll into view; text you cannot see does not
    // need to be measured yet.
    const queue = [];
    let flushing = false, flushTimer = 0;
    function visibleIds() {
      try { return new Set(pv._getVisiblePages().views.map((v) => v.id)); } catch (e) { return null; }
    }
    function step() {
      if (!idle()) { flushing = false; armFlush(); return; }
      const vis = visibleIds();
      let i = vis ? queue.findIndex((it) => vis.has(it.page)) : 0;
      if (i < 0) { flushing = false; return; }        // only off-screen pages left: wait for a scroll
      const item = queue.splice(i, 1)[0];
      if (item) item.run();
      if (queue.length) requestAnimationFrame(step);
      else flushing = false;
    }
    function armFlush() {
      if (!queue.length || flushing) return;
      clearTimeout(flushTimer);
      if (idle()) { flushing = true; requestAnimationFrame(step); }
      else flushTimer = setTimeout(armFlush, TEXT_IDLE_MS);   // pinch end without a scroll event
    }
    const origCreate = pv.createTextLayerBuilder.bind(pv);
    pv.createTextLayerBuilder = function (...args) {
      const b = origCreate(...args);
      const render = b.render.bind(b), cancel = b.cancel.bind(b);
      let item = null;
      b.render = (timeout = 0) => {
        if (item) return;
        item = { page: args[1] + 1, run: () => { item = null; render(timeout); } };
        queue.push(item);
        armFlush();
      };
      b.cancel = () => {
        if (item) { const i = queue.indexOf(item); i >= 0 && queue.splice(i, 1); item = null; }
        cancel();
      };
      return b;
    };
  }

  function init() {
    const app = window.PDFViewerApplication;
    if (!app) return;
    const go = () => patch(app);
    if (app.initializedPromise) app.initializedPromise.then(go);
    else { const wait = () => (app.pdfRenderingQueue && app.pdfViewer ? go() : setTimeout(wait, 50)); wait(); }
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
