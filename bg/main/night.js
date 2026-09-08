/*
 * Night / day toggle for the rendered pages (see night.css).
 *
 * Three states, cycled by the button or Shift+N: day (sun), night (moon:
 * pages inverted to dark grey, DarkPDF's tint) and AMOLED black (eclipse:
 * full inversion to #000 with a black toolbar and background).
 * State lives in chrome.storage.local ({ night: 0|1|2, nightTint }) so it
 * follows across tabs and reloads, as DarkPDF keeps its settings there.
 */
(() => {
  "use strict";
  const TINTS = [0.75, 0.85, 0.95];   // DarkPDF's three tints, as invert() amounts
  const root = document.documentElement;
  const LABELS = ["Day (Shift+N: night)", "Night (Shift+N: AMOLED black)", "AMOLED black (Shift+N: day)"];
  let night = 0, button = null;

  function apply(mode, tint) {
    const was = night;
    night = mode === true ? 1 : (Number(mode) === 1 || Number(mode) === 2 ? Number(mode) : 0);
    root.dataset.night = String(night);
    if ((was > 0) !== (night > 0) && typeof refreshPhotos === "function") refreshPhotos();
    if (Number.isInteger(tint) && TINTS[tint] != null) root.style.setProperty("--night-invert", String(TINTS[tint]));
    if (button) {
      button.classList.toggle("on", night === 1);
      button.classList.toggle("black", night === 2);
      button.title = LABELS[night];
      button.setAttribute("aria-pressed", night ? "true" : "false");
      button.firstElementChild && (button.firstElementChild.textContent = LABELS[night]);
    }
  }
  function toggle() {
    apply((night + 1) % 3);
    try { chrome.storage.local.set({ night }); } catch (e) {}
  }

  // State first, so pages never flash in the wrong mode.
  try {
    chrome.storage.local.get({ night: 0, nightTint: 1 }, (v) => apply(v.night, Number(v.nightTint)));
    chrome.storage.onChanged.addListener((c) => {
      if (c.night || c.nightTint) chrome.storage.local.get({ night: 0, nightTint: 1 }, (v) => apply(v.night, Number(v.nightTint)));
    });
  } catch (e) {}

  // AMOLED tone curve (see night.css). 11 points over 0..1: the ends go to
  // white/black, the interior is night mode's 0.85 - 0.7v.
  const AMOLED_CURVE = [1, 0.78, 0.71, 0.64, 0.57, 0.5, 0.43, 0.36, 0.29, 0.22, 0].join(" ");
  function installAmoledFilter() {
    if (document.getElementById("gsrAmoled")) return;
    const ns = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(ns, "svg");
    svg.setAttribute("width", "0"); svg.setAttribute("height", "0");
    svg.setAttribute("aria-hidden", "true");
    svg.style.cssText = "position:absolute;width:0;height:0;overflow:hidden";
    const f = document.createElementNS(ns, "filter");
    f.id = "gsrAmoled";
    f.setAttribute("color-interpolation-filters", "sRGB");
    const ct = document.createElementNS(ns, "feComponentTransfer");
    for (const ch of ["R", "G", "B"]) {
      const fn = document.createElementNS(ns, "feFunc" + ch);
      fn.setAttribute("type", "table");
      fn.setAttribute("tableValues", AMOLED_CURVE);
      ct.appendChild(fn);
    }
    f.appendChild(ct); svg.appendChild(f);
    document.body.appendChild(svg);
  }

  // Photographs stay photographs. The page canvas is inverted as a whole, so
  // a portrait would invert with it. Every raster image on a rendered page is
  // located from pdf.js's operator list, its pixels are sampled, and images
  // that look like photographs (no large white or black background, as charts
  // and diagrams have) get an un-inverted copy laid over them.
  const photoLayers = new Map();   // page index -> container
  function clearPhotos(i) { const c = photoLayers.get(i); c && c.remove(); photoLayers.delete(i); }
  function imageRects(opList, OPS, Util) {
    const rects = [], stack = [];
    let ctm = [1, 0, 0, 1, 0, 0];
    const fns = opList.fnArray, args = opList.argsArray;
    for (let i = 0; i < fns.length; i++) {
      const fn = fns[i];
      if (fn === OPS.save) stack.push(ctm);
      else if (fn === OPS.restore) ctm = stack.pop() || ctm;
      else if (fn === OPS.transform) ctm = Util.transform(ctm, args[i]);
      else if (fn === OPS.paintFormXObjectBegin) { stack.push(ctm); if (args[i][0]) ctm = Util.transform(ctm, args[i][0]); }
      else if (fn === OPS.paintFormXObjectEnd) ctm = stack.pop() || ctm;
      else if (fn === OPS.paintImageXObject || fn === OPS.paintInlineImageXObject || fn === OPS.paintImageXObjectRepeat) {
        const pts = [[0, 0], [1, 0], [0, 1], [1, 1]].map((p) => Util.applyTransform(p, ctm));
        rects.push([Math.min(...pts.map((p) => p[0])), Math.max(...pts.map((p) => p[0])), Math.min(...pts.map((p) => p[1])), Math.max(...pts.map((p) => p[1]))]);
      }
    }
    return rects;
  }
  function looksLikePhoto(ctx, x, y, w, h) {
    const step = Math.max(1, Math.floor(Math.max(w, h) / 48));
    let data;
    try { data = ctx.getImageData(x, y, w, h).data; } catch (e) { return false; }
    let n = 0, bright = 0, dark = 0, tinted = 0;
    for (let j = 0; j < h; j += step) for (let i = 0; i < w; i += step) {
      const o = (j * w + i) * 4, r = data[o], g = data[o + 1], b = data[o + 2];
      const l = 0.299 * r + 0.587 * g + 0.114 * b;
      n++;
      if (l > 235) bright++; else if (l < 25) dark++;
      if (Math.max(r, g, b) - Math.min(r, g, b) > 24) tinted++;
    }
    if (!n) return false;
    // charts, diagrams and scans sit on white (or black); photographs do not
    return bright / n < 0.3 && dark / n < 0.3 && (tinted / n > 0.15 || bright / n + dark / n < 0.1);
  }
  async function markPhotos(i) {
    clearPhotos(i);
    if (!night) return;
    const app = window.PDFViewerApplication, lib = window.pdfjsLib;
    const pv = app && app.pdfViewer && app.pdfViewer.getPageView(i);
    if (!pv || !pv.pdfPage || !pv.canvas || !lib) return;
    const canvas = pv.canvas, vp = pv.viewport;
    let ol;
    try { ol = await pv.pdfPage.getOperatorList(); } catch (e) { return; }
    if (!night || pv.canvas !== canvas) return;
    const rects = imageRects(ol, lib.OPS, lib.Util);
    if (!rects.length) return;
    const scale = canvas.width / vp.width, ctx = canvas.getContext("2d", { willReadFrequently: true });
    const layer = document.createElement("div");
    layer.className = "gsr-photos";
    for (const [x0, x1, y0, y1] of rects) {
      const [ax, ay] = vp.convertToViewportPoint(x0, y0), [bx, by] = vp.convertToViewportPoint(x1, y1);
      const l = Math.floor(Math.min(ax, bx)), t = Math.floor(Math.min(ay, by)), w = Math.ceil(Math.abs(bx - ax)), h = Math.ceil(Math.abs(by - ay));
      if (w < 40 || h < 40) continue;
      const sx = Math.round(l * scale), sy = Math.round(t * scale), sw = Math.round(w * scale), sh = Math.round(h * scale);
      if (!looksLikePhoto(ctx, sx, sy, sw, sh)) continue;
      const c = document.createElement("canvas");
      c.width = sw; c.height = sh;
      c.style.cssText = `position:absolute;left:${l}px;top:${t}px;width:${w}px;height:${h}px`;
      c.getContext("2d").drawImage(canvas, sx, sy, sw, sh, 0, 0, sw, sh);
      layer.appendChild(c);
    }
    if (!layer.childElementCount) return;
    pv.div.appendChild(layer);
    photoLayers.set(i, layer);
  }
  function refreshPhotos() {
    const app = window.PDFViewerApplication;
    if (!app || !app.pdfViewer) return;
    for (let i = 0; i < app.pagesCount; i++) {
      const pv = app.pdfViewer.getPageView(i);
      if (night && pv && pv.renderingState === 3) markPhotos(i); else clearPhotos(i);
    }
  }
  function hookPhotos() {
    const app = window.PDFViewerApplication;
    if (!app) return;
    const go = () => {
      app.eventBus.on("pagerendered", (e) => markPhotos(e.pageNumber - 1));
      app.eventBus.on("pagesinit", () => { for (const i of [...photoLayers.keys()]) clearPhotos(i); });
      refreshPhotos();
    };
    app.initializedPromise ? app.initializedPromise.then(go) : go();
  }

  document.addEventListener("DOMContentLoaded", () => {
    installAmoledFilter();
    hookPhotos();
    const bar = document.getElementById("toolbarViewerRight");
    if (!bar) return;
    button = document.createElement("button");
    button.className = "toolbarButton nightMode";
    button.type = "button";
    button.appendChild(document.createElement("span"));
    button.addEventListener("click", (e) => { e.preventDefault(); toggle(); });
    const copy = bar.querySelector(".copyLink");
    copy && copy.nextSibling ? bar.insertBefore(button, copy.nextSibling) : bar.appendChild(button);
    apply(night);
  });
  window.addEventListener("keydown", (e) => {
    if (e.key === "N" && e.shiftKey && !e.ctrlKey && !e.metaKey && !e.altKey) {
      const t = e.target, tag = t && t.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || (t && t.isContentEditable)) return;
      e.preventDefault(); toggle();
    }
  });
})();
