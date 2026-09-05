/*
 * Native (vector) printing, transplanted from the Google Scholar PDF Reader.
 *
 * pdf.js prints by rasterising every page to a canvas at 150 dpi, which looks
 * pixelated on paper. Scholar instead loads the PDF into a hidden iframe handled
 * by Chrome's built-in PDF viewer and prints *that* frame, so Chrome emits real
 * vector output (contentscript-compiled.js: the `printBuffer` branch, plus
 * printscript-compiled.js inside the frame). Two details differ here:
 *
 *  - Scholar's frame is a blob: URL. Inside an extension page the PDF viewer
 *    frame for a blob is cross-origin, so contentWindow.print() is blocked;
 *    the frame therefore loads the PDF's own URL and the print request goes
 *    through Scholar's postMessage("print") handshake with bg/main/printscript.js.
 *  - Every pdf.js print path (toolbar button, Ctrl/Cmd+P, PDF auto-print) ends
 *    in window.print(), so overriding it is enough.
 *
 * When native printing is not possible (plugin disabled, form edits, non-PDF
 * response, no content script in the frame) it falls back to pdf.js printing,
 * bumped from 150 to 300 dpi.
 */
(() => {
  "use strict";

  const nativeWindowPrint = window.print.bind(window);
  const FALLBACK_PRINT_DPI = 300;
  const FRAME_TIMEOUT_MS = 36e5;      // Scholar: 1 hour safety cleanup
  const HANDSHAKE_TIMEOUT_MS = 8000;

  let frame = null;
  let cleanupTimer = 0;
  let printing = false;
  let focusArmedAt = 0;

  function cleanup() {                 // Scholar: g()
    if (frame) frame.remove();
    frame = null;
    clearTimeout(cleanupTimer);
    cleanupTimer = 0;
    window.removeEventListener("focus", onFocusAfterPrint);
    window.removeEventListener("pagehide", cleanup);
  }
  function onFocusAfterPrint() {
    if (Date.now() - focusArmedAt < 500) return;
    cleanup();
  }

  function pdfUrl() {
    try {
      const raw = new URLSearchParams(location.search).get("file");
      if (!raw) return null;
      const u = new URL(raw.split("#")[0]);
      return /^(https?|file):$/.test(u.protocol) ? u : null;
    } catch (e) { return null; }
  }
  function hasFormEdits(doc) {
    const s = doc.annotationStorage;
    return !!(s && typeof s.getAll === "function" && s.getAll() !== null);
  }
  // Chrome would download (not display) anything that is not served as a PDF.
  async function servesPdf(u) {
    if (u.protocol === "file:") return true;
    const ac = new AbortController();
    try {
      const r = await fetch(u.href, { headers: { Range: "bytes=0-0" }, credentials: "include", signal: ac.signal });
      const ct = (r.headers.get("content-type") || "").toLowerCase().split(";")[0].trim();
      const cd = (r.headers.get("content-disposition") || "").toLowerCase();
      ac.abort();
      return ct === "application/pdf" && !cd.startsWith("attachment");
    } catch (e) { ac.abort(); return false; }
  }
  function framesOptionEnabled() {
    return new Promise((res) => {
      try { chrome.storage.local.get({ frames: false }, (v) => res(!!(v && v.frames))); } catch (e) { res(false); }
    });
  }

  function fallbackPrint() {
    try { window.PDFViewerApplicationOptions.set("printResolution", FALLBACK_PRINT_DPI); } catch (e) {}
    nativeWindowPrint();
  }

  async function nativePrint() {
    const app = window.PDFViewerApplication;
    const doc = app && app.pdfDocument;
    const url = pdfUrl();
    if (!doc || !url || navigator.pdfViewerEnabled === false || hasFormEdits(doc) || !(await servesPdf(url))) {
      fallbackPrint();
      return;
    }
    if (printing) return;
    printing = true;
    try {
      cleanup();
      const src = new URL(url.href);
      // The background worker redirects sub_frame PDFs to this viewer when
      // "Support embedded PDFs" is on; it skips URLs carrying this marker.
      if (await framesOptionEnabled()) src.searchParams.set("pdfjs.action", "download");

      frame = document.createElement("iframe");           // Scholar: d
      frame.setAttribute("aria-hidden", "true");
      frame.tabIndex = -1;
      frame.style.position = "absolute";
      frame.style.top = frame.style.left = "0";
      frame.style.width = frame.style.height = "1px";
      frame.style.border = "0";

      const acked = new Promise((resolve, reject) => {
        const onMsg = (e) => {
          if (frame && e.source === frame.contentWindow && e.data === "printing") {
            window.removeEventListener("message", onMsg);
            resolve();
          }
        };
        window.addEventListener("message", onMsg);
        setTimeout(() => { window.removeEventListener("message", onMsg); reject(new Error("no print handshake")); }, HANDSHAKE_TIMEOUT_MS);
      });
      // The content script is injected at document_idle; keep asking until it answers.
      let poke = 0;
      frame.onload = () => {
        const send = () => { frame && frame.contentWindow && frame.contentWindow.postMessage("print", "*"); };
        send();
        poke = setInterval(send, 250);
      };
      acked.finally(() => clearInterval(poke));
      frame.src = src.href;
      document.body.appendChild(frame);

      focusArmedAt = Date.now();
      window.addEventListener("focus", onFocusAfterPrint);
      window.addEventListener("pagehide", cleanup);
      cleanupTimer = setTimeout(cleanup, FRAME_TIMEOUT_MS);
      await acked;
      console.log("nativeprint: printing through Chrome's PDF viewer");
    } catch (e) {
      console.warn("nativeprint: falling back to pdf.js printing: " + (e && e.message));
      cleanup();
      fallbackPrint();
    } finally {
      printing = false;
    }
  }

  window.print = nativePrint;
  document.addEventListener("webviewerloaded", () => {
    try { window.PDFViewerApplicationOptions.set("printResolution", FALLBACK_PRINT_DPI); } catch (e) {}
  });
})();
