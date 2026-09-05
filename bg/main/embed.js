/*
 * Keeps the PDF's own URL in the address bar, as Chrome's built-in viewer does.
 *
 * Transplanted from the Google Scholar PDF Reader's contentscript-compiled.js.
 * Instead of redirecting the tab to the extension's viewer page, this content
 * script runs on the PDF document Chrome created for the response and swaps
 * its body for a full-window iframe holding the viewer. The tab URL, history,
 * bookmarks and reload all keep pointing at the PDF.
 *
 *  - Scholar: la() (frame fills the window), Z() (URL is this document), ba()/X()
 *    (Content-Disposition filename), ma()/na() (fetch relay over a MessagePort),
 *    ca() (history <-> reader), printBuffer handling, focus forwarding.
 *  - The viewer asks this page to fetch the PDF, so the request carries the
 *    page's cookies and referrer and works behind publisher paywalls.
 *  - #gsr=0 or #toolbar=0 in the URL leaves Chrome's viewer alone.
 */
(function () {
  var extOrigin = "chrome-extension://" + chrome.runtime.id;
  var viewerUrl = chrome.runtime.getURL("/bg/helper/web/viewer.html");
  var PRINT_FRAME_NAME = "gsr-native-print";
  if (window.name === PRINT_FRAME_NAME) return;                     // nativeprint.js's print frame

  // Scholar: la()
  function la() {
    var a = window;
    try {
      var b = a.parent;
      for (; b !== b.parent;) b = b.parent;
      return a.innerWidth >= 0.95 * b.innerWidth && a.innerHeight >= 0.95 * b.innerHeight;
    } catch (e) { return false; }
  }
  // Scholar: Z() — only this document's own URL may be fetched with its cookies.
  function Z(a) {
    try { var b = new URL(a); return b.host === location.host && b.pathname === location.pathname && b.search === location.search; }
    catch (e) { return false; }
  }
  // Scholar: ba() (RFC 5987 filename*), X() (strip quotes)
  function ba(a) {
    var b = a.indexOf("'"); if (b < 0) return "";
    var c = a.substring(b + 1); if (a.substring(0, b).toLowerCase() !== "utf-8") return "";
    a = c.indexOf("'"); if (a < 0) return "";
    try { return decodeURIComponent(c.substring(a + 1)); } catch (d) { return ""; }
  }
  function X(a) { return a.startsWith('"') && a.endsWith('"') ? a.substring(1, a.length - 1) : a; }
  // Scholar: ma()/na() — fetch the PDF here and stream it to the viewer.
  function ma() { var a = new AbortController(), c = setTimeout(function () { a.abort(); }, 3e4); return { h: a.signal, i: c }; }
  function na(a, b) {
    var t = ma(), c = t.h, d = t.i;
    fetch(a, { signal: c }).then(function (f) {
      clearTimeout(d);
      var e = f.headers, g = e.get("Content-Type") || "";
      if (g.startsWith("text/html") && e.get("cf-mitigated") === "challenge") {
        var now = Date.now(), k = Number(window.sessionStorage.getItem("scholarPdfViewer$cfcRts"));
        if (Number.isNaN(k) || now - k > 36e5) { window.location.reload(); window.sessionStorage.setItem("scholarPdfViewer$cfcRts", now.toString()); return; }
      }
      var cd = e.get("Content-Disposition") || "", name = "";
      cd.split(";").forEach(function (m) {
        m = m.trim();
        if (m.startsWith("filename*=")) name = X(ba(m.substring(10)));
        else if (m.startsWith("filename=") && !name) name = X(m.substring(9));
      });
      var ranges = e.get("Accept-Ranges") === "bytes";
      ranges && ra(b);
      b.postMessage({ type: "pdf", body: f.body, length: e.get("Content-Length"), encoding: e.get("Content-Encoding") || "", filename: name, status: f.status, contentType: g, ranges: ranges }, [f.body]);
    }).catch(function (f) { clearTimeout(d); b.postMessage({ type: "pdf", error: "fetch pdf: " + f.message }); });
  }
  // Scholar: qa()/ra() — byte-range requests from the viewer, so page 1 can
  // render before the whole file has arrived (pdf.js asks for the xref and the
  // first page's objects first).
  function qa(a, b, c, d) {
    b >= 0 && c > b && fetch(a, { headers: { Range: "bytes=" + b + "-" + (c - 1) } }).then(function (f) {
      d.postMessage({ type: "pdfrange", body: f.body, begin: b }, [f.body]);
    }).catch(function () { d.postMessage({ type: "pdfrange", begin: b, error: true }); });
  }
  function ra(a) {
    a.addEventListener("message", function (b) {
      if (b.data && typeof b.data === "object" && b.data.type === "fetchrange") {
        var c = b.data.url, d = b.data.begin; b = b.data.end;
        typeof c === "string" && typeof d === "number" && typeof b === "number" && Z(c) && qa(c, d, b, a);
      }
    });
    a.start();
  }

  function embed() {
    var hashParams = new URLSearchParams(window.location.hash.substring(1));
    if (hashParams.get("gsr") === "0" || hashParams.get("toolbar") === "0") return;
    if (!document.contentType || document.contentType.toLowerCase() !== "application/pdf") return;
    var isTop = window === window.parent;
    // Scholar: frames must be at least 700x350, or fill the window.
    var bigEnough = !(window.innerWidth < 700 || window.innerHeight < 350) || isTop || la();
    var go = function () {
      var frame = document.createElement("iframe");
      frame.style.width = frame.style.height = "100%";
      frame.style.position = "absolute";
      frame.style.left = frame.style.top = "0";
      frame.style.border = "none";
      frame.setAttribute("allow", "fullscreen; clipboard-write");
      var pdfUrl = location.href.split("#")[0];
      frame.src = viewerUrl + "?file=" + encodeURIComponent(pdfUrl) + location.hash;

      var printFrame = null, printBlob = "", printTimer = 0;
      function printCleanup() {
        printFrame && printFrame.remove(); printFrame = null;
        printBlob && URL.revokeObjectURL(printBlob); printBlob = "";
        clearTimeout(printTimer);
        window.removeEventListener("focus", printCleanup);
      }
      var fromViewer = function (e) { return e.source === frame.contentWindow && e.origin === extOrigin; };
      window.addEventListener("message", function (e) {
        var port = e.ports[0], d = e.data;
        if (!fromViewer(e) || !d || typeof d !== "object") return;
        if (d.type === "fetch" && port) {                      // Scholar: fetch relay
          typeof d.url === "string" && Z(d.url) ? na(d.url, port) : port.postMessage({ type: "pdf", error: "fetch pdf: url mismatch" });
        } else if (d.type === "title") {
          typeof d.title === "string" && (document.title = d.title);
        } else if (d.type === "replaceState") {                 // page changes -> tab URL hash, like Chrome's viewer
          if (typeof d.hash === "string" && location.hash !== d.hash) history.replaceState(history.state, "", d.hash || location.pathname + location.search);
        } else if (d.printBuffer instanceof ArrayBuffer) {     // Scholar: print through Chrome's PDF engine
          printCleanup();
          printBlob = URL.createObjectURL(new Blob([d.printBuffer], { type: "application/pdf" }));
          printFrame = document.createElement("iframe");
          printFrame.name = PRINT_FRAME_NAME;
          printFrame.onload = function () {
            if (window.location.href.startsWith("file:")) printFrame.contentWindow.postMessage("print", "*");   // blob:null frame: printscript.js answers
            else { printFrame.contentWindow.print(); setTimeout(printCleanup, 1000); }
            window.addEventListener("focus", printCleanup);
          };
          printFrame.src = printBlob;
          printFrame.style.position = "absolute";
          printFrame.style.top = printFrame.style.left = "0";
          printFrame.style.width = printFrame.style.height = "1px";
          document.body.appendChild(printFrame);
          printTimer = setTimeout(printCleanup, 36e5);
        }
      });
      // Back/forward and manual hash edits reach the viewer.
      var sendHash = function () { frame.contentWindow && frame.contentWindow.postMessage({ type: "setHash", hash: location.hash }, extOrigin); };
      window.addEventListener("popstate", sendHash);
      window.addEventListener("hashchange", sendHash);
      // Keep keyboard focus in the viewer; Ctrl/Cmd+P on this page prints through it.
      window.addEventListener("focus", function () { setTimeout(function () { frame.focus(); }, 0); });
      window.addEventListener("keydown", function (e) {
        if ((e.ctrlKey || e.metaKey) && (e.key === "p" || e.key === "P")) { e.preventDefault(); frame.contentWindow.postMessage({ type: "print" }, extOrigin); }
      });
      var body = document.createElement("body");
      body.style.margin = "0";
      body.appendChild(frame);
      document.body = body;
      frame.focus();
    };
    if (isTop || bigEnough) go();
    else {
      // "Support embedded PDFs" (toolbar menu) opens small frames too.
      try { chrome.storage.local.get({ frames: false }, function (v) { v && v.frames && go(); }); } catch (e) {}
    }
  }
  // Tell the worker whether Chrome shows PDFs at all; if not, it redirects instead.
  try {
    var enabled = navigator.pdfViewerEnabled !== false;
    chrome.storage.local.get({ pdfViewerEnabled: true }, function (v) { v.pdfViewerEnabled !== enabled && chrome.storage.local.set({ pdfViewerEnabled: enabled }); });
  } catch (e) {}
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", embed);
  else embed();
})();
