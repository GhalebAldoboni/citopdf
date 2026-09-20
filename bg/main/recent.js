/*
 * Recent documents recorder for the Cito PDF home page (bg/main/home.html).
 *
 * Runs inside the viewer. For every document it keeps one small entry in
 * chrome.storage.local:
 *
 *   recentDocs            array, most recently opened first, at most MAX_DOCS
 *     { id, url, local, name, title, firstSeen, lastOpened, pages, page,
 *       pinned, thumb }
 *   recentThumb:<id>      first-page thumbnail, JPEG data URL, ~200 px wide
 *
 * Thumbnails live under their own keys so that the frequent write (the page
 * you are on) rewrites a few kilobytes, not every image.
 *
 * It also finishes the home page's "Open file" route: the home page stores the
 * picked File in IndexedDB and opens viewer.html?file=&homefile=<id>; the file
 * is handed to pdf.js here exactly as its own Open File button would.
 *
 * Rules: never throw, never block. Storage writes are tiny and throttled, the
 * thumbnail is made in idle time, and nothing runs in incognito windows.
 */
(() => {
  "use strict";

  const KEY = "recentDocs";
  const THUMB_PREFIX = "recentThumb:";
  const MAX_DOCS = 50;
  const THUMB_WIDTH = 200;
  const PAGE_WRITE_MS = 3000;
  const DB_NAME = "citoHome", DB_STORE_HANDOFF = "handoff";

  let params;
  try { params = new URLSearchParams(location.search); } catch (e) { return; }
  const homeFileId = params.get("homefile") || "";

  // Incognito windows leave no trace; the hand-over from the home page still works there.
  const incognito = (() => { try { return !!chrome.extension.inIncognitoContext; } catch (e) { return true; } })();
  if (incognito && !homeFileId) return;

  const idle = (fn, timeout) => (window.requestIdleCallback
    ? window.requestIdleCallback(fn, { timeout: timeout || 4000 })
    : setTimeout(fn, 600));

  // cyrb53: small, fast string hash; ids only need to be stable and well spread.
  const hash = (str) => {
    let h1 = 0xdeadbeef, h2 = 0x41c6ce57;
    for (let i = 0; i < str.length; i++) {
      const c = str.charCodeAt(i);
      h1 = Math.imul(h1 ^ c, 2654435761);
      h2 = Math.imul(h2 ^ c, 1597334677);
    }
    h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
    h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
    return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
  };

  const fileNameOf = (url) => {
    try {
      const path = new URL(url).pathname.replace(/\/+$/, "");
      return decodeURIComponent(path.substring(path.lastIndexOf("/") + 1)) || "";
    } catch (e) { return ""; }
  };

  // Titles such as "untitled" or "Microsoft Word - draft.docx" are worse than the file name.
  const cleanTitle = (t) => {
    t = typeof t === "string" ? t.replace(/\s+/g, " ").trim() : "";
    t = t.replace(/^Microsoft Word - /i, "");
    if (t.length < 3 || /^untitled$/i.test(t) || /\.(docx?|dvi|tex|indd|qxd)$/i.test(t)) return "";
    return t.slice(0, 300);
  };

  // ---- storage -------------------------------------------------------------

  // The document this viewer is showing: { id, url, local, name } or null.
  let current = null;
  let pendingPage = 0, pageTimer = 0;

  // Read, change one entry, write back. `patch` is merged into the entry;
  // `touch` moves it to the front and stamps lastOpened. Updates from this tab
  // run one after another, so a later patch always sees the earlier one.
  let queue = Promise.resolve();
  const update = (patch, touch) => {
    const doc = current;
    if (!doc) return;
    queue = queue.then(() => new Promise((done) => {
      try {
        chrome.storage.local.get({ [KEY]: [] }, (got) => {
          try {
            if (chrome.runtime.lastError) return done();
            let list = Array.isArray(got[KEY]) ? got[KEY].filter(Boolean) : [];
            const now = Date.now();
            let entry = list.find((x) => x.id === doc.id);
            if (!entry) {
              if (!touch) return done();              // removed on the home page meanwhile: leave it removed
              entry = { id: doc.id, url: doc.url, local: doc.local, name: doc.name, title: "", firstSeen: now,
                        lastOpened: now, pages: 0, page: 1, pinned: false, thumb: false };
            }
            Object.assign(entry, patch);
            if (touch) {
              entry.lastOpened = now;
              list = [entry].concat(list.filter((x) => x.id !== doc.id));
            }
            // Cap the list: the oldest unpinned entries go first, with their thumbnails.
            const dropped = [];
            while (list.length > MAX_DOCS) {
              let i = list.length - 1;
              while (i > 0 && list[i].pinned) i--;
              dropped.push(THUMB_PREFIX + list[i].id);
              list.splice(i, 1);
            }
            dropped.length && chrome.storage.local.remove(dropped);
            chrome.storage.local.set({ [KEY]: list }, () => { void chrome.runtime.lastError; done(); });
          } catch (e) { done(); }
        });
      } catch (e) { done(); }
    }));
  };

  const flushPage = () => {
    clearTimeout(pageTimer); pageTimer = 0;
    if (pendingPage) { update({ page: pendingPage }, false); pendingPage = 0; }
  };

  // ---- thumbnail -----------------------------------------------------------

  let thumbDone = false;

  const saveThumb = (source, doc) => {
    try {
      if (thumbDone || doc !== current || !source || !source.width || !source.height) return;
      const w = THUMB_WIDTH, h = Math.min(Math.round(source.height * (w / source.width)), Math.round(w * 1.6));
      const c = document.createElement("canvas");
      c.width = w; c.height = h;
      const ctx = c.getContext("2d", { alpha: false });
      ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, w, h);
      ctx.imageSmoothingQuality = "high";
      // Source rectangle: full width, top part of the page when it is very tall.
      ctx.drawImage(source, 0, 0, source.width, h * (source.width / w), 0, 0, w, h);
      const data = c.toDataURL("image/jpeg", 0.72);
      c.width = c.height = 0;
      if (!data || data.length < 200 || data.length > 120000) return;
      thumbDone = true;
      chrome.storage.local.set({ [THUMB_PREFIX + doc.id]: data }, () => { void chrome.runtime.lastError; update({ thumb: true }, false); });
    } catch (e) {}
  };

  // Page 1 was never drawn (the document opened further in): render a small copy ourselves.
  const renderThumb = (app, doc) => {
    try {
      if (thumbDone || doc !== current || !app.pdfDocument) return;
      app.pdfDocument.getPage(1).then((page) => {
        const base = page.getViewport({ scale: 1 });
        const viewport = page.getViewport({ scale: (THUMB_WIDTH * 2) / base.width });
        const c = document.createElement("canvas");
        c.width = Math.ceil(viewport.width); c.height = Math.ceil(viewport.height);
        const ctx = c.getContext("2d", { alpha: false });
        ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, c.width, c.height);
        return page.render({ canvasContext: ctx, viewport }).promise.then(() => { saveThumb(c, doc); c.width = c.height = 0; });
      }).catch(() => {});
    } catch (e) {}
  };

  // ---- which document is this? ----------------------------------------------

  let homeFile = null;          // { id, name } while the viewer shows a file handed over by the home page

  const identify = (app) => {
    let url = "";
    try { url = String(app.url || app.baseUrl || ""); } catch (e) {}
    // A picked file is opened from a blob: URL and pdf.js reports its bare file name as the URL.
    if (homeFile && !/^(https?|file|ftp):/i.test(url)) {
      const hf = homeFile; homeFile = null;           // only the first document of this tab is the handed-over one
      return { id: hf.id, url: "", local: true, name: hf.name };
    }
    // Opened from bytes (small file:// documents), pdf.js has no URL: the query has it.
    // A bare name or blob: URL is a file picked inside the viewer, which has no address to return to.
    if (!url) url = params.get("file") || "";
    url = url.split("#")[0];
    if (!/^(https?|file|ftp):/i.test(url)) return null;        // blob:, data:, bundled files
    if (/\/bg\/main\/privet\.pdf$/i.test(url)) return null;
    return { id: "u_" + hash(url), url, local: false, name: fileNameOf(url) };
  };

  // ---- home page hand-over ----------------------------------------------------

  const readHandoff = (id) => new Promise((resolve) => {
    try {
      const open = indexedDB.open(DB_NAME, 1);
      open.onupgradeneeded = () => {
        const db = open.result;
        db.objectStoreNames.contains(DB_STORE_HANDOFF) || db.createObjectStore(DB_STORE_HANDOFF, { keyPath: "id" });
        db.objectStoreNames.contains("handles") || db.createObjectStore("handles", { keyPath: "id" });
      };
      open.onerror = () => resolve(null);
      open.onsuccess = () => {
        try {
          const db = open.result;
          const req = db.transaction(DB_STORE_HANDOFF, "readonly").objectStore(DB_STORE_HANDOFF).get(id);
          req.onsuccess = () => { resolve(req.result || null); db.close(); };
          req.onerror = () => { resolve(null); db.close(); };
        } catch (e) { resolve(null); }
      };
    } catch (e) { resolve(null); }
  });

  const openHomeFile = (app) => {
    readHandoff(homeFileId).then((rec) => {
      try {
        if (!rec || !rec.file) {
          const home = chrome.runtime.getURL("bg/main/home.html");
          app.error("This file is no longer held by Cito PDF. Open it again from the home page: " + home, { message: "homefile " + homeFileId });
          return;
        }
        const name = rec.name || rec.file.name || "document.pdf";
        homeFile = { id: homeFileId, name };
        // A File read from IndexedDB keeps its name; a bare Blob gets one here.
        const file = rec.file.name ? rec.file : new File([rec.file], name, { type: "application/pdf" });
        app.eventBus.dispatch("fileinputchange", { source: window, fileInput: { files: [file] } });
      } catch (e) {}
    });
  };

  // ---- wiring ---------------------------------------------------------------

  const start = (app) => {
    const bus = app.eventBus;
    if (!bus) return;

    if (homeFileId) openHomeFile(app);
    if (incognito) return;

    // Title from the PDF's metadata, else the file name the server gave.
    const readMeta = () => {
      try {
        if (!current || !app.documentInfo) return;
        let title = cleanTitle(app.documentInfo.Title);
        if (!title && app.metadata && typeof app.metadata.get === "function") title = cleanTitle(app.metadata.get("dc:title"));
        const patch = { title };
        const cd = app._contentDispositionFilename;
        if (cd && !current.local) patch.name = current.name = String(cd);
        update(patch, false);
      } catch (e) {}
    };

    // "pagesinit" comes as soon as the first page is known. "documentloaded" only
    // fires once the whole file has arrived, which for a large ranged download is
    // long after reading began; it is kept as a second chance. Once per document.
    let seen = null;
    const onDocument = () => {
      try {
        if (!app.pdfDocument || app.pdfDocument === seen) return;
        seen = app.pdfDocument;
        flushPage();
        thumbDone = false;
        const doc = current = identify(app);
        if (!doc) return;
        const pages = app.pagesCount || app.pdfDocument.numPages || 0;
        const page = app.page > 1 ? { page: app.page } : {};
        update({ pages, url: doc.url, local: doc.local, name: doc.name, ...page }, true);
        readMeta();
        // Keep an existing thumbnail; otherwise wait for page 1, then fall back to our own render.
        chrome.storage.local.get(THUMB_PREFIX + doc.id, (got) => {
          try {
            if (doc !== current || thumbDone) return;
            if (got && got[THUMB_PREFIX + doc.id]) { thumbDone = true; update({ thumb: true }, false); return; }
            setTimeout(() => idle(() => renderThumb(app, doc), 5000), 4000);
          } catch (e) {}
        });
      } catch (e) {}
    };
    bus.on("pagesinit", onDocument);
    bus.on("documentloaded", onDocument);

    // After the other listeners, one of which supplies the Content-Disposition name.
    bus.on("metadataloaded", () => setTimeout(readMeta, 0));

    bus.on("pagerendered", (e) => {
      try {
        if (thumbDone || !current || !e || e.pageNumber !== 1) return;
        const doc = current, view = e.source;
        idle(() => saveThumb(view && view.canvas, doc), 3000);
      } catch (e2) {}
    });

    bus.on("pagechanging", (e) => {
      try {
        if (!current || !e || !e.pageNumber) return;
        pendingPage = e.pageNumber;
        if (!pageTimer) pageTimer = setTimeout(flushPage, PAGE_WRITE_MS);
      } catch (e2) {}
    });

    // Closing or hiding the tab writes the last page at once.
    document.addEventListener("visibilitychange", () => { document.visibilityState === "hidden" && flushPage(); });
    window.addEventListener("pagehide", flushPage);
  };

  const boot = () => {
    try {
      const app = window.PDFViewerApplication;
      if (!app || !app.initializedPromise) return;
      app.initializedPromise.then(() => { try { start(app); } catch (e) {} }, () => {});
    } catch (e) {}
  };
  if (window.PDFViewerApplication) boot();
  else document.addEventListener("webviewerloaded", () => setTimeout(boot, 0), { once: true });
})();
