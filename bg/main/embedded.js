/*
 * Viewer side of bg/main/embed.js: runs inside the frame that embed.js places
 * on the PDF page. It asks the page to fetch the PDF (page cookies, referrer),
 * reports the title and current page back so the tab shows them, follows the
 * tab's hash (back/forward, #page=), and prints via the page.
 * Does nothing when the viewer is a top-level tab (context menu, toolbar).
 */
(() => {
  "use strict";
  const embedded = window.parent !== window;
  const post = (msg, transfer) => { try { window.parent.postMessage(msg, "*", transfer || []); } catch (e) {} };

  // Called by viewer.js before it opens a URL. Returns true when the load is handled here.
  window.__embedOpen = function (url, app) {
    if (!embedded || !/^https?:/i.test(url)) return false;
    app.setTitleUsingUrl(url);
    const ch = new MessageChannel(), port = ch.port1;
    const fallback = () => app.open(url);
    let done = false, transport = null;
    const timer = setTimeout(() => { if (!done) { done = true; fallback(); } }, 35e3);
    const keepFilename = (name) => {
      // pdf.js derives the title and download name from the response headers it
      // fetched itself; with relayed bytes it has none, so supply the page's.
      name && app.eventBus.on("metadataloaded", () => {
        if (app._contentDispositionFilename) return;
        app._contentDispositionFilename = name;
        const t = app.documentInfo && app.documentInfo.Title;
        app.setTitle(t ? `${t} - ${name}` : name);
      }, { once: true });
    };
    port.onmessage = async (e) => {
      const d = e.data;
      if (!d || typeof d !== "object") return;
      if (d.type === "pdfrange") {                       // answer to requestDataRange
        if (!transport) return;
        if (d.error || !d.body) return transport.abort();
        try { transport.onDataRange(d.begin, new Uint8Array(await new Response(d.body).arrayBuffer())); } catch (err) {}
        return;
      }
      if (d.type !== "pdf" || done) return;
      done = true; clearTimeout(timer);
      if (!d.body || d.status >= 400 || /^text\/html/i.test(d.contentType || "")) return fallback();
      const total = Number(d.length) || 0;
      const lib = window.pdfjsLib;
      const ranged = d.ranges && !d.encoding && total > 0 && lib && lib.PDFDataRangeTransport;
      try {
        if (ranged) {
          // Progressive: the full stream is fed as it arrives, and pdf.js pulls
          // the xref and first-page objects through byte ranges right away, so
          // page 1 renders long before the download finishes.
          class Relay extends lib.PDFDataRangeTransport {
            requestDataRange(begin, end) { port.postMessage({ type: "fetchrange", url, begin, end }); }
            abort() {}
          }
          transport = new Relay(total, new Uint8Array(0), false);
          keepFilename(d.filename);
          const opening = app.open({ url, originalUrl: url }, { range: transport, length: total });
          (async () => {
            const reader = d.body.getReader(); let loaded = 0;
            try {
              for (;;) {
                const { value, done: end } = await reader.read();
                if (end) break;
                loaded += value.length;
                transport.onDataProgressiveRead(value);
                transport.onDataProgress(loaded, total);
              }
            } catch (err) {}
            transport.onDataProgressiveDone();
          })();
          await opening;
        } else {
          const chunks = []; let loaded = 0;
          const reader = d.body.getReader();
          for (;;) {
            const { value, done: end } = await reader.read();
            if (end) break;
            chunks.push(value); loaded += value.length;
            total && app.progress(loaded / total);
          }
          const bytes = new Uint8Array(loaded); let off = 0;
          for (const c of chunks) { bytes.set(c, off); off += c.length; }
          const opening = app.open(bytes);
          app.url = app.baseUrl = url;           // downloads and "Copy PDF link" keep the real URL
          keepFilename(d.filename);
          await opening;
        }
      } catch (err) { fallback(); }
    };
    post({ type: "fetch", url }, [ch.port2]);
    return true;
  };

  if (!embedded) return;
  // Title -> tab.
  const sendTitle = () => post({ type: "title", title: document.title });
  new MutationObserver(sendTitle).observe(document.querySelector("title") || document.head, { childList: true, characterData: true, subtree: true });
  // Current page -> tab URL (#page=N), like Chrome's viewer. replaceState, so Back leaves the document.
  let lastHash = "";
  const hook = (app) => {
    app.eventBus.on("updateviewarea", ({ location: l }) => {
      if (!l) return;
      const hash = "#page=" + l.pageNumber;
      if (hash !== lastHash) { lastHash = hash; post({ type: "replaceState", hash }); }
    });
  };
  // Tab hash -> viewer (pdf.js reacts to hashchange).
  window.addEventListener("message", (e) => {
    if (e.source !== window.parent || !e.data || typeof e.data !== "object") return;
    if (e.data.type === "setHash") { const h = e.data.hash || ""; if (h && location.hash !== h) location.hash = h; }
    else if (e.data.type === "print") window.print();
  });
  // Print buffer -> page (nativeprint.js calls this).
  window.__embedPrint = async (pdfDocument) => {
    const data = await pdfDocument.getData();
    const buf = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength);
    post({ printBuffer: buf }, [buf]);
  };
  const init = () => {
    const app = window.PDFViewerApplication;
    if (!app) return;
    // pdf.js treats a framed viewer as "embedded" and then leaves document.title
    // alone (and skips a few top-level niceties). This frame is the whole tab.
    Object.defineProperty(app, "isViewerEmbedded", { get: () => false, configurable: true });
    (app.initializedPromise ? app.initializedPromise : Promise.resolve()).then(() => { hook(app); sendTitle(); });
  };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init); else init();
})();
