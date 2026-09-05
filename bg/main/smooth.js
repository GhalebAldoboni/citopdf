/*
 * Scroll smoothness for the pdf.js viewer.
 *
 * pdf.js (2.7) pre-renders exactly one page beyond the visible ones in the
 * scroll direction, so fast scrolling or page-down lands on blank pages until
 * they render. This widens the look-ahead to two pages in the scroll direction
 * plus one behind. pdf.js still gives visible pages priority (pre-renders pause
 * for them) and its 10-page view cache is not exceeded.
 */
(() => {
  "use strict";
  const LITE = !!(window.__viewerDevice && window.__viewerDevice.lite);   // device.js
  const AHEAD_EXTRA = LITE ? 0 : 1;   // pages beyond the one pdf.js already pre-renders
  const BEHIND = 1;

  function patch(app) {
    const q = app.pdfRenderingQueue;
    if (!q || q.__smoothPatched) return;
    q.__smoothPatched = true;
    const orig = q.getHighestPriority.bind(q);
    q.getHighestPriority = function (visible, views, scrolledDown) {
      const v = orig(visible, views, scrolledDown);
      if (v || !visible || !visible.views || !visible.views.length) return v;
      // pdf.js: views[visible.last.id] is the page after the last visible one,
      // views[visible.first.id - 2] the page before the first visible one.
      const next = visible.last.id, prev = visible.first.id - 2;
      const cand = [];
      if (scrolledDown) {
        for (let i = 1; i <= AHEAD_EXTRA; i++) cand.push(next + i);
        for (let i = 0; i < BEHIND; i++) cand.push(prev - i);
      } else {
        for (let i = 1; i <= AHEAD_EXTRA; i++) cand.push(prev - i);
        for (let i = 0; i < BEHIND; i++) cand.push(next + i);
      }
      for (const i of cand) if (views[i] && !this.isViewFinished(views[i])) return views[i];
      return null;
    };
  }
  // ---------------------------------------------------------------------------
  // Zoom.
  //
  // pdf.js turns every Ctrl+wheel event into discrete 10% "ticks" (a trackpad
  // pinch becomes a staircase) and re-renders all visible pages on each one,
  // cancelling the renders already running. Scholar's reader (reader-compiled.js,
  // vr()) instead maps each event to a continuous factor,
  //     clamp(exp(-deltaY / 100), 0.8, 1.25),
  // applies it immediately and re-renders once the gesture has paused for
  // 110 ms. The same scheme is used here: the factor is previewed with a
  // compositor transform (cheap) and committed to pdf.js once.
  // ---------------------------------------------------------------------------
  // A pinch has no end event in Chrome; it is over when no wheel event has
  // arrived for PINCH_IDLE_MS. Scholar uses 110 ms, which re-renders mid-pinch
  // whenever the fingers hesitate, so a longer pause is used here and the
  // commit also fires as soon as the user does something else (scroll, click,
  // key). Discrete zoom steps (buttons, keyboard) commit after STEP_IDLE_MS.
  const PINCH_IDLE_MS = 350, STEP_IDLE_MS = 150;
  // The preview is the current bitmap stretched; past this factor it looks
  // soft, so the page is re-rendered mid-gesture and the pinch continues
  // from the sharp result (browsers re-raster their own pinch zoom the same way).
  const RESHARPEN_FACTOR = 2;
  // pdf.js caps page canvases at 16 MP and CSS-upscales beyond that, which is
  // blurry on HiDPI screens above ~220%. 48 MP keeps a Letter page sharp up to
  // ~380% at 2x DPR; beyond that pdf.js falls back to upscaling as before.
  // On lite devices (device.js) the 16 MP default stays: a 48 MP canvas is
  // 192 MB of bitmap, which a 4 GB machine cannot afford per cached page.
  const MAX_CANVAS_PIXELS = (LITE ? 16 : 48) * 1024 * 1024;
  document.addEventListener("webviewerloaded", () => {
    try { window.PDFViewerApplicationOptions.set("maxCanvasPixels", MAX_CANVAS_PIXELS); } catch (e) {}
  });
  const MIN_SCALE = 0.1, MAX_SCALE = 10;
  function patchZoom(app) {
    const pv = app.pdfViewer;
    if (!pv || app.__smoothZoom) return;
    const container = pv.container, viewerEl = pv.viewer;
    const ctl = { enabled: true };
    app.__smoothZoom = ctl;
    let factor = 1, timer = 0, base = null;
    // While previewing, the scroll position is synthetic; keep pdf.js from
    // re-evaluating visible pages and starting renders it will only cancel.
    const origUpdate = pv.update.bind(pv);
    const suspendUpdates = () => { pv.update = () => {}; };
    const resumeUpdates = () => { pv.update = origUpdate; };

    // Compositor-only preview: scale the pages container from its top-left.
    // A 1px spacer extends the scrollable area so the anchor point can be kept;
    // margins/padding would change the container width and re-lay out every
    // text layer on each event.
    const spacer = document.createElement("div");
    spacer.style.cssText = "position:absolute;width:1px;height:1px;pointer-events:none;visibility:hidden;left:0;top:0";
    function targetScale() {
      return Math.min(MAX_SCALE, Math.max(MIN_SCALE, Math.round(base.scale * factor * 100) / 100));
    }
    function preview() {
      const k = targetScale() / base.scale;
      // Keep the pages' raster and let the compositor scale it: without this
      // Chrome re-rasterises the whole layer (canvases and text spans) on every
      // scale change, which is the per-frame cost on heavy pages.
      viewerEl.style.willChange = "transform";
      viewerEl.style.transformOrigin = "0 0";
      viewerEl.style.transform = k === 1 ? "" : `scale(${k})`;
      if (k > 1) {
        spacer.style.left = Math.ceil(k * base.w) + "px";
        spacer.style.top = Math.ceil(k * base.h) + "px";
        spacer.parentNode || container.appendChild(spacer);
      } else spacer.remove();
      container.scrollLeft = (base.sl + base.dx) * k - base.dx;
      container.scrollTop = (base.st + base.dy) * k - base.dy;
    }
    function clearPreview() {
      viewerEl.style.willChange = "";
      viewerEl.style.transform = "";
      viewerEl.style.transformOrigin = "";
      spacer.remove();
    }
    function commit() {
      timer = 0;
      if (!base) return;
      const b = base, target = targetScale();
      factor = 1; base = null;
      clearPreview();
      resumeUpdates();
      container.scrollLeft = b.sl;
      container.scrollTop = b.st;
      pv.update();                       // refresh pdf.js' current-location bookkeeping
      // Geometric anchoring: remember the PDF point under the cursor, zoom, then
      // scroll so the same point is back under the cursor.
      const crect = container.getBoundingClientRect();
      const ax = crect.left + b.dx, ay = crect.top + b.dy;
      let view = null, px = 0, py = 0;
      for (const { view: v } of pv._getVisiblePages().views) {
        const r = v.div.getBoundingClientRect();
        if (ax >= r.left && ax <= r.right && ay >= r.top && ay <= r.bottom) {
          view = v;
          [px, py] = v.viewport.convertToPdfPoint(ax - r.left - v.div.clientLeft, ay - r.top - v.div.clientTop);
          break;
        }
      }
      const before = pv.currentScale;
      if (target !== before) pv.currentScaleValue = target;
      const k = pv.currentScale / before;
      if (k === 1) return;
      if (view) {
        const r = view.div.getBoundingClientRect();
        const [vx, vy] = view.viewport.convertToViewportPoint(px, py);
        container.scrollLeft += r.left + view.div.clientLeft + vx - ax;
        container.scrollTop += r.top + view.div.clientTop + vy - ay;
      } else {
        container.scrollLeft += b.dx * (k - 1);
        container.scrollTop += b.dy * (k - 1);
      }
    }
    // f: multiplicative zoom factor; (dx, dy): anchor inside the container.
    function zoomBy(f, dx, dy, idleMs = STEP_IDLE_MS) {
      if (pv.isInPresentationMode || !(f > 0) || f === 1) return;
      if (!base) {
        base = { scale: pv.currentScale, sl: container.scrollLeft, st: container.scrollTop, dx, dy, w: viewerEl.offsetWidth, h: viewerEl.offsetHeight };
        suspendUpdates();
        app.eventBus.dispatch("smoothzoomstart", { source: app });
      }
      factor *= f;
      preview();
      clearTimeout(timer);
      if (factor >= RESHARPEN_FACTOR || factor <= 1 / RESHARPEN_FACTOR) { commit(); return; }
      timer = setTimeout(commit, idleMs);
    }
    const commitNow = () => { if (base) { clearTimeout(timer); commit(); } };
    // Anything other than zooming ends the gesture immediately.
    window.addEventListener("wheel", (e) => { (e.ctrlKey || e.metaKey) || commitNow(); }, { capture: true, passive: true });
    window.addEventListener("mousedown", commitNow, { capture: true, passive: true });
    window.addEventListener("keydown", (e) => { e.key === "Control" || e.key === "Meta" || commitNow(); }, { capture: true, passive: true });
    window.addEventListener("keyup", (e) => { (e.key === "Control" || e.key === "Meta") && commitNow(); }, { capture: true, passive: true });
    document.addEventListener("visibilitychange", commitNow);
    const center = () => { const r = container.getBoundingClientRect(); return { dx: r.width / 2, dy: r.height / 2 }; };

    // Trackpad pinch / Ctrl+wheel: replaces pdf.js' tick-based handler.
    window.addEventListener("wheel", (e) => {
      if (!ctl.enabled || !(e.ctrlKey || e.metaKey) || pv.isInPresentationMode) return;
      if (!container.contains(e.target)) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      let dy = e.deltaY;
      if (e.deltaMode === 1) dy *= 16; else if (e.deltaMode === 2) dy *= 100;
      const f = Math.min(1.25, Math.max(0.8, Math.exp(-dy / 100)));   // Scholar: vr()
      const r = container.getBoundingClientRect();
      zoomBy(f, e.clientX - r.left, e.clientY - r.top, PINCH_IDLE_MS);
    }, { capture: true, passive: false });

    // Keyboard shortcuts and toolbar buttons (pdf.js: 1.1 per step).
    const origZoomIn = app.zoomIn.bind(app), origZoomOut = app.zoomOut.bind(app);
    app.zoomIn = (n = 1) => { if (!ctl.enabled) return origZoomIn(n); const c = center(); zoomBy(Math.pow(1.1, n), c.dx, c.dy); };
    app.zoomOut = (n = 1) => { if (!ctl.enabled) return origZoomOut(n); const c = center(); zoomBy(Math.pow(1 / 1.1, n), c.dx, c.dy); };
  }

  function init() {
    const app = window.PDFViewerApplication;
    if (!app) return;
    const go = () => { patch(app); patchZoom(app); };
    if (app.initializedPromise) app.initializedPromise.then(go);
    else { const wait = () => (app.pdfRenderingQueue && app.pdfViewer ? go() : setTimeout(wait, 50)); wait(); }
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
