/*
 * Sharp pages at high zoom.
 *
 * pdf.js rasters a page as one canvas and caps it at maxCanvasPixels (48 MP
 * here, smooth.js). Past that cap it keeps the same bitmap and lets CSS stretch
 * it, so at 1000% a Letter page is drawn at about 6200 px and shown across
 * 16300 device pixels: everything is soft, and no amount of waiting sharpens it
 * — the page canvas is already "rendered".
 *
 * A full-resolution page canvas is not an option: at 1000% and 2x DPR it would
 * be 344 MP, 1.4 GB of bitmap, per page. So only the part you are looking at is
 * re-rendered, into a second canvas laid over the page canvas at exactly the
 * right place — the same thing Preview, Acrobat and current pdf.js do. The page
 * canvas stays underneath as the backdrop, so scrolling never shows a hole:
 * you see the soft bitmap for a moment, then it snaps sharp.
 *
 * It does nothing at ordinary zoom. The detail layer is built only when the
 * page canvas is at least MIN_GAIN coarser than the screen, only for visible
 * pages, only once movement has stopped, and it is dropped as soon as the zoom
 * comes back down. One render is in flight at a time and it is cancelled the
 * moment it is out of date.
 *
 * It lives inside .canvasWrapper, so night mode's filter on
 * ".pdfViewer .page canvas" covers it, and the un-inverted photo copies
 * night.js appends to .page still paint above it.
 */
(() => {
  "use strict";

  const MAX_PIXELS = 16 * 1024 * 1024;   // 64 MB of bitmap, whatever the window size
  const MIN_GAIN = 1.15;                 // below this the stretch is not worth a second render
  const MARGIN = 0.3;                    // render this much of the viewport beyond each edge
  const SETTLE_MS = 160;                 // quiet time after scrolling or zooming
  const LITE = (() => { try { return !!(window.GSR_DEVICE && window.GSR_DEVICE.lite); } catch (e) { return false; } })();

  const details = new Map();             // page index -> { canvas, key, task }
  let timer = 0, scheduled = false, suspended = false;
  // Armed only while the zoom is high enough for pdf.js to be capping the page
  // canvas. Below that this file is one comparison per scroll burst and nothing else.
  let armed = false;

  const app = () => window.PDFViewerApplication;
  const dpr = () => window.devicePixelRatio || 1;

  const drop = (i) => {
    const d = details.get(i);
    if (!d) return;
    details.delete(i);
    if (d.task) { try { d.task.cancel(); } catch (e) {} }
    if (d.canvas) { d.canvas.remove(); d.canvas.width = d.canvas.height = 0; }
  };
  const dropAll = () => { for (const i of [...details.keys()]) drop(i); };

  // The visible slice of this page, in CSS pixels from the page's top-left,
  // grown by MARGIN and capped so the bitmap stays within MAX_PIXELS.
  const cropFor = (view, scale) => {
    const wrap = view.canvas.parentNode;
    const r = wrap.getBoundingClientRect();
    const c = app().pdfViewer.container.getBoundingClientRect();
    const W = view.viewport.width, H = view.viewport.height;
    let x0 = Math.max(0, c.left - r.left), x1 = Math.min(W, c.right - r.left);
    let y0 = Math.max(0, c.top - r.top), y1 = Math.min(H, c.bottom - r.top);
    if (x1 - x0 < 1 || y1 - y0 < 1) return null;
    const mx = (x1 - x0) * MARGIN, my = (y1 - y0) * MARGIN;
    x0 = Math.max(0, Math.floor(x0 - mx)); x1 = Math.min(W, Math.ceil(x1 + mx));
    y0 = Math.max(0, Math.floor(y0 - my)); y1 = Math.min(H, Math.ceil(y1 + my));
    let w = x1 - x0, h = y1 - y0;
    // Too many pixels: give the margin back first, then shrink around the middle.
    const room = MAX_PIXELS / (scale * scale);
    if (w * h > room) {
      const k = Math.sqrt(room / (w * h));
      const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
      w = Math.floor(w * k); h = Math.floor(h * k);
      x0 = Math.max(0, Math.min(W - w, Math.round(cx - w / 2)));
      y0 = Math.max(0, Math.min(H - h, Math.round(cy - h / 2)));
    }
    return { x: x0, y: y0, w, h };
  };

  const build = (view, i) => {
    const vp = view.viewport, page = view.pdfPage, wrap = view.canvas.parentNode;
    if (!vp || !page || !wrap) return;
    // How many device pixels the page canvas actually has per CSS pixel.
    const have = view.canvas.width / vp.width;
    const want = dpr();
    if (!(want / have >= MIN_GAIN)) { drop(i); return; }

    const crop = cropFor(view, want);
    if (!crop) { drop(i); return; }

    // Same crop as last time, at the same zoom, over the same page canvas: keep it.
    const key = [Math.round(vp.scale * 1000), vp.rotation, want, crop.x, crop.y, crop.w, crop.h, view.canvas.width].join(":");
    const old = details.get(i);
    if (old && old.key === key && !old.task) return;
    if (old && old.key === key) return;                // the same one is already rendering

    if (old && old.task) { try { old.task.cancel(); } catch (e) {} old.task = null; }

    const canvas = document.createElement("canvas");
    canvas.className = "gsr-detail";
    canvas.width = Math.round(crop.w * want);
    canvas.height = Math.round(crop.h * want);
    canvas.style.cssText = `position:absolute;left:${crop.x}px;top:${crop.y}px;width:${crop.w}px;height:${crop.h}px`;
    const ctx = canvas.getContext("2d", { alpha: false });
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const entry = { canvas: old ? old.canvas : null, key, task: null, pending: canvas };
    details.set(i, entry);

    let task;
    try {
      // The same call pdf.js makes for a page canvas, with the same viewport and
      // the same extra arguments: scale up by the device ratio and slide the
      // crop's top-left corner to the origin. Anything left out here (the
      // optional-content configuration above all) renders a different page from
      // the one underneath.
      task = page.render({
        canvasContext: ctx,
        viewport: vp,
        transform: [want, 0, 0, want, -crop.x * want, -crop.y * want],
        renderInteractiveForms: view.renderInteractiveForms,
        optionalContentConfigPromise: view._optionalContentConfigPromise,
      });
    } catch (e) { drop(i); return; }
    entry.task = task;

    task.promise.then(() => {
      const cur = details.get(i);
      if (!cur || cur.pending !== canvas) { canvas.width = canvas.height = 0; return; }
      // Swap only now, so the old sharp crop stays up while the new one draws.
      if (cur.canvas) { cur.canvas.remove(); cur.canvas.width = cur.canvas.height = 0; }
      cur.canvas = canvas; cur.pending = null; cur.task = null;
      if (view.canvas && view.canvas.parentNode === wrap) wrap.appendChild(canvas);
      else canvas.width = canvas.height = 0;           // the page was re-rendered meanwhile
    }, () => {
      canvas.width = canvas.height = 0;                // cancelled or failed: keep what is there
      const cur = details.get(i);
      if (cur && cur.pending === canvas) { cur.pending = null; cur.task = null; cur.key = ""; }
    });
  };

  const run = () => {
    scheduled = false;
    const a = app(), pv = a && a.pdfViewer;
    if (!pv || suspended || pv.isInPresentationMode) { dropAll(); return; }
    let visible;
    try { visible = pv._getVisiblePages().views; } catch (e) { return; }
    const keep = new Set();
    for (const { view } of visible) {
      const i = view.id - 1;
      if (view.renderingState !== 3 || !view.canvas || !view.canvas.parentNode) { drop(i); continue; }
      keep.add(i);
      try { build(view, i); } catch (e) { drop(i); }
    }
    for (const i of [...details.keys()]) if (!keep.has(i)) drop(i);
  };

  // Would pdf.js have to cap this page's canvas? That is the whole test: the
  // canvas it wants is the page size in device pixels, and anything over
  // maxCanvasPixels comes back stretched. No cap, nothing to do.
  const updateArmed = () => {
    armed = false;
    try {
      const pv = app().pdfViewer, v = pv._pages && pv._pages[pv._currentPageNumber - 1];
      if (!v || !v.viewport) return;
      const want = dpr(), max = pv.maxCanvasPixels || 16777216;
      armed = v.viewport.width * want * v.viewport.height * want > max * (MIN_GAIN * MIN_GAIN);
    } catch (e) {}
    if (!armed && details.size) dropAll();
  };

  // Always after the movement has stopped, and never on the frame that is
  // scrolling: the work itself is a render, which must not compete with one.
  const schedule = () => {
    if (!armed) return;
    clearTimeout(timer);
    timer = setTimeout(() => {
      if (scheduled) return;
      scheduled = true;
      (window.requestIdleCallback || setTimeout)(run, { timeout: 800 });
    }, SETTLE_MS);
  };

  const start = (a) => {
    if (LITE) return;                                  // lite devices keep the 16 MP canvas and no second one
    const pv = a.pdfViewer, bus = a.eventBus;
    if (!pv || !bus) return;
    const rearm = () => { updateArmed(); schedule(); };
    pv.container.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", rearm, { passive: true });
    bus.on("scalechanging", rearm);
    bus.on("rotationchanging", () => { dropAll(); rearm(); });
    bus.on("pagerendered", (e) => { if (armed) { drop(e.pageNumber - 1); schedule(); } });
    bus.on("pagesinit", () => { dropAll(); rearm(); });
    bus.on("switchscrollmode", schedule);
    bus.on("switchspreadmode", schedule);
    bus.on("presentationmodechanged", () => { dropAll(); schedule(); });
    // smooth.js stretches the whole viewer while a pinch is in flight; a sharp
    // crop stretched with it is worse than none, and the geometry is stale.
    bus.on("smoothzoomstart", () => { suspended = true; dropAll(); });
    bus.on("scalechanging", () => { suspended = false; });
    document.addEventListener("visibilitychange", () => { document.visibilityState === "hidden" ? dropAll() : schedule(); });
    rearm();
  };

  const boot = () => {
    try {
      const a = app();
      if (!a || !a.initializedPromise) return;
      a.initializedPromise.then(() => { try { start(a); } catch (e) {} }, () => {});
    } catch (e) {}
  };
  if (window.PDFViewerApplication) boot();
  else document.addEventListener("webviewerloaded", () => setTimeout(boot, 0), { once: true });

  window.__detail = { run, details, drop: dropAll };   // for tests
})();
