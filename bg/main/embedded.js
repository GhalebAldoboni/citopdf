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

  // Pre-warm pdf.js's worker while the rest of the viewer is still loading, so
  // the document does not wait for the worker script to load and compile.
  let prewarmed = null;
  try {
    const lib = window.pdfjsLib;
    if (lib && lib.PDFWorker && !window.__noPrewarm) {
      lib.GlobalWorkerOptions.workerSrc = lib.GlobalWorkerOptions.workerSrc || "../build/pdf.worker.js";
      prewarmed = new lib.PDFWorker({ name: "viewer-prewarm" });
      prewarmed.promise.catch(() => { prewarmed = null; });
    }
  } catch (e) { prewarmed = null; }
  const useWarmWorker = (app) => {
    const origOpen = app.open.bind(app);
    app.open = (file, args) => {
      const w = prewarmed; prewarmed = null;          // one document per warm worker
      return origOpen(file, w && !(args && args.worker) ? { ...(args || {}), worker: w } : args);
    };
  };
  const post = (msg, transfer) => { try { window.parent.postMessage(msg, "*", transfer || []); } catch (e) {} };

  // Size classes. Pages you look at are fetched by range first, so a 1 GB scan
  // opens as fast as a 1 MB paper; pdf.js then keeps pulling the remaining
  // chunks in the background (auto-fetch, one chunk at a time, page requests
  // first) until the whole file is local. Chunks grow with the file so a 1 GB
  // download is ~1000 requests rather than 16000.
  const BIG = 48 * 1024 * 1024, LOCAL_RANGED_MIN = 4 * 1024 * 1024;
  const chunkFor = (total) => (total > BIG ? 1024 * 1024 : total > 8 * 1024 * 1024 ? 256 * 1024 : 65536);
  // disableStream: pdf.js switches auto-fetch off when it believes the full
  // stream will deliver the rest; here there is no full stream, only ranges.
  const rangeArgs = (transport, total) => ({ range: transport, length: total, disableAutoFetch: false, disableStream: true, rangeChunkSize: chunkFor(total) });
  const loadError = (app, message) => { try { app.l10n.get("loading_error", null, "An error occurred while loading the PDF.").then((m) => app.error(m, { message })); } catch (e) {} };

  // pdf.js derives the title and download name from the response headers it
  // fetched itself; with relayed bytes it has none, so supply the page's.
  const keepFilename = (app, name) => {
    name && app.eventBus.on("metadataloaded", () => {
      if (app._contentDispositionFilename) return;
      app._contentDispositionFilename = name;
      const t = app.documentInfo && app.documentInfo.Title;
      app.setTitle(t ? `${t} - ${name}` : name);
    }, { once: true });
  };

  // --- Local files: Chrome slices file:// reads by Range (a start at or past the
  // end fails, the last byte succeeds), so the size is found by probing and the
  // document is read page by page instead of whole. Files under 4 MB are read
  // whole, which is quicker.
  const localSize = async (url) => {
    const ok = async (n) => { try { const r = await fetch(url, { headers: { Range: `bytes=${n}-${n}` } }); return (await r.arrayBuffer()).byteLength === 1; } catch (e) { return false; } };
    if (!(await ok(LOCAL_RANGED_MIN))) return 0;
    let lo = LOCAL_RANGED_MIN, hi = lo * 2;            // lo succeeds, find a failing hi
    while (await ok(hi)) { lo = hi; hi *= 2; if (hi > 64 * 1024 * 1024 * 1024) return 0; }
    while (hi - lo > 1) { const mid = Math.floor((lo + hi) / 2); (await ok(mid)) ? (lo = mid) : (hi = mid); }
    return lo + 1;                                     // lo is the last readable index
  };
  const openLocal = (url, app) => {
    const lib = window.pdfjsLib;
    (async () => {
      let total = 0;
      if (lib && lib.PDFDataRangeTransport) { try { total = await localSize(url); } catch (e) { total = 0; } }
      if (total) {
        window.__pdfByteLength = total;
        class LocalRange extends lib.PDFDataRangeTransport {
          requestDataRange(begin, end) {
            fetch(url, { headers: { Range: `bytes=${begin}-${end - 1}` } }).then((r) => r.arrayBuffer())
              .then((b) => this.onDataRange(begin, new Uint8Array(b))).catch(() => this.abort());
          }
          abort() {}
        }
        try { await app.open({ url, originalUrl: url }, rangeArgs(new LocalRange(total, new Uint8Array(0), false), total)); return; }
        catch (e) { /* fall through to a full read */ }
      }
      try {
        app.setTitleUsingUrl(url);
        // A file just downloaded can be unreadable for a few seconds while
        // macOS quarantines and scans it; retry before giving up.
        let b = null, err = null;
        for (let i = 0; i < 8 && !b; i++) {
          try { b = await (await fetch(url)).arrayBuffer(); }
          catch (e) { err = e; await new Promise((r) => setTimeout(r, 750)); }
        }
        if (!b) throw err || new Error("Failed to fetch");
        if (!b.byteLength) throw new Error("Empty response for " + url);
        await app.open(new Uint8Array(b));
      } catch (e) {
        const allowed = await new Promise((r) => { try { chrome.extension.isAllowedFileSchemeAccess(r); } catch (x) { r(true); } });
        loadError(app, (allowed
          ? "Cannot read this file right now. If it was just downloaded, macOS may still be checking it: reload in a few seconds. "
          : 'Cannot read local files: enable "Allow access to file URLs" for this extension in chrome://extensions. ')
          + (e && e.message || "") + " [" + url + "]");
      }
    })();
    return true;
  };

  // Called by viewer.js before it opens a URL. Returns true when the load is handled here.
  window.__embedOpen = function (url, app) {
    if (/^file:/i.test(url)) return openLocal(url, app);
    if (!embedded || !/^https?:/i.test(url)) return false;
    app.setTitleUsingUrl(url);
    const ch = new MessageChannel(), port = ch.port1;
    const fallback = () => app.open(url);
    let done = false, transport = null;
    const timer = setTimeout(() => { if (!done) { done = true; fallback(); } }, 35e3);
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
      const ranged = !!(d.ranges && !d.encoding && total > 0 && lib && lib.PDFDataRangeTransport);
      try {
        if (ranged) {
          // The page answered the first megabyte with 206: read it as initial
          // data and let pdf.js pull everything else by range, pages in view
          // first, the rest in the background until the file is complete.
          window.__pdfByteLength = total;
          const head = new Uint8Array(await new Response(d.body).arrayBuffer());
          class Relay extends lib.PDFDataRangeTransport {
            requestDataRange(begin, end) { port.postMessage({ type: "fetchrange", url, begin, end }); }
            abort() {}
          }
          transport = new Relay(total, head, head.length >= total);
          keepFilename(app, d.filename);
          await app.open({ url, originalUrl: url }, rangeArgs(transport, total));
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
          window.__pdfByteLength = loaded;
          const opening = app.open(bytes);
          app.url = app.baseUrl = url;           // downloads and "Copy PDF link" keep the real URL
          keepFilename(app, d.filename);
          await opening;
        }
      } catch (err) { console.warn("embedded: relay open failed, falling back", err && (err.message || err)); fallback(); }
    };
    post({ type: "fetch", url }, [ch.port2]);
    return true;
  };

  if (!embedded) {
    const initTop = () => { const app = window.PDFViewerApplication; app && useWarmWorker(app); };
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", initTop); else initTop();
    return;
  }
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
    // With isViewerEmbedded forced off, pdf.js would open links in this frame,
    // where sites that forbid framing (orcid.org, doi.org…) show "refused to
    // connect". Open external links in a new tab, as Chrome's viewer does.
    try { window.PDFViewerApplicationOptions.set("externalLinkTarget", 2 /* LinkTarget.BLANK */); } catch (e) {}
    useWarmWorker(app);
    (app.initializedPromise ? app.initializedPromise : Promise.resolve()).then(() => { hook(app); sendTitle(); });
  };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init); else init();
})();
