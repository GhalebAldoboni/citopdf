/*
 * "Copy page as image" and "Copy page text" in Chrome's own right-click menu.
 *
 * The two entries are registered by the service worker (chrome.contextMenus,
 * limited to the viewer document), so they sit in the native menu beside
 * Back, Reload and Print and look like the rest of it. This script remembers
 * which page was right-clicked and does the copy when the worker says which
 * entry was chosen.
 *
 * The image is the page as rendered by pdf.js, taken from the canvas bitmap.
 * Night and AMOLED modes are CSS filters on top of that bitmap, so the copy is
 * always the real page colours. A page that is not rendered at a useful size
 * is rendered off-screen at 2x first. The text is pdf.js's text content,
 * rebuilt into lines in reading order.
 */
(() => {
  "use strict";
  const MIN_WIDTH = 1400;      // px: below this the page is re-rendered for the copy
  const MAX_PIXELS = 24e6;     // cap for the off-screen render
  let toastEl = null, toastTimer = 0;

  const app = () => window.PDFViewerApplication;

  // --- page text -------------------------------------------------------------
  function linesFromTextContent(tc) {
    const rows = [];
    for (const it of tc.items) {
      if (!it.str) continue;
      const x = it.transform[4], y = it.transform[5], h = Math.abs(it.height || it.transform[3] || 10);
      let row = null;
      for (let i = rows.length - 1; i >= 0 && i >= rows.length - 6; i--) {
        if (Math.abs(rows[i].y - y) <= Math.max(2, h * 0.45)) { row = rows[i]; break; }
      }
      if (!row) { row = { y, h, items: [] }; rows.push(row); }
      row.items.push({ x, x1: x + it.width, str: it.str, h });
      row.h = Math.max(row.h, h);
    }
    // two-column pages: pdf.js already emits items in content order, which for
    // most papers is column by column; keep that order and only tidy each row.
    const out = [];
    let prev = null;
    for (const row of rows) {
      row.items.sort((a, b) => a.x - b.x);
      let text = "";
      let last = null;
      for (const it of row.items) {
        if (last && !/\s$/.test(text) && !/^\s/.test(it.str) && it.x - last.x1 > row.h * 0.18) text += " ";
        text += it.str;
        last = it;
      }
      text = text.replace(/\s+/g, " ").trim();
      if (!text) continue;
      // blank line where the vertical gap says "new paragraph"
      if (prev && Math.abs(prev.y - row.y) > Math.max(prev.h, row.h) * 1.9 && prev.y > row.y) out.push("");
      out.push(text);
      prev = row;
    }
    // join words hyphenated across a line break: "inter-\nnational" -> "international"
    const joined = [];
    for (const line of out) {
      const p = joined[joined.length - 1];
      if (p && /[A-Za-zÀ-ɏ]-$/.test(p) && /^[a-zß-ÿ]/.test(line)) joined[joined.length - 1] = p.slice(0, -1) + line;
      else joined.push(line);
    }
    return joined.join("\n");
  }
  async function pageText(pageNumber) {
    const page = await app().pdfDocument.getPage(pageNumber);
    return linesFromTextContent(await page.getTextContent({ normalizeWhitespace: true }));
  }

  // --- page image ------------------------------------------------------------
  function canvasBlob(canvas) {
    return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Could not encode the page"))), "image/png"));
  }
  async function pageImage(pageNumber) {
    const pv = app().pdfViewer.getPageView(pageNumber - 1);
    const shown = pv && pv.canvas && pv.renderingState === 3 ? pv.canvas : null;
    if (shown && shown.width >= MIN_WIDTH) return canvasBlob(shown);
    const page = await app().pdfDocument.getPage(pageNumber);
    const base = page.getViewport({ scale: 1 });
    let scale = Math.max(2, MIN_WIDTH / base.width);
    if (base.width * base.height * scale * scale > MAX_PIXELS) scale = Math.sqrt(MAX_PIXELS / (base.width * base.height));
    const viewport = page.getViewport({ scale });
    const canvas = document.createElement("canvas");
    canvas.width = Math.floor(viewport.width);
    canvas.height = Math.floor(viewport.height);
    const ctx = canvas.getContext("2d", { alpha: false });
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({ canvasContext: ctx, viewport }).promise;
    const blob = await canvasBlob(canvas);
    canvas.width = canvas.height = 0;          // release the bitmap
    return blob;
  }

  // --- actions ---------------------------------------------------------------
  async function copyImage(pageNumber) {
    try {
      // The ClipboardItem takes the promise itself, so the write starts inside
      // the click and keeps its user activation while the page renders.
      await navigator.clipboard.write([new ClipboardItem({ "image/png": pageImage(pageNumber) })]);
      toast(`Page ${pageNumber} copied as an image`);
    } catch (e) { toast("Could not copy the image: " + (e && e.message || e), true); }
  }
  async function copyText(pageNumber) {
    try {
      const text = await pageText(pageNumber);
      if (!text.trim()) { toast(`Page ${pageNumber} has no text layer (a scan?)`, true); return; }
      await navigator.clipboard.writeText(text);
      toast(`Page ${pageNumber} text copied (${text.length.toLocaleString()} characters)`);
    } catch (e) { toast("Could not copy the text: " + (e && e.message || e), true); }
  }

  // --- UI ----------------------------------------------------------------------
  function ensureStyle() {
    if (document.getElementById("gsrPageCopyStyle")) return;
    const st = document.createElement("style");
    st.id = "gsrPageCopyStyle";
    st.textContent = `
      .gsr-toast{position:fixed;left:50%;bottom:28px;transform:translateX(-50%);z-index:100001;padding:9px 16px;border-radius:999px;
        background:#1b2233;color:#f1f3f4;border:1px solid rgba(138,180,248,.35);box-shadow:0 8px 24px rgba(0,0,0,.4);
        font:13px -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;pointer-events:none;opacity:0;transition:opacity .15s}
      .gsr-toast.show{opacity:1}
      .gsr-toast.err{border-color:rgba(242,139,130,.6)}
      @media (prefers-reduced-motion:reduce){.gsr-toast{transition:none}}`;
    document.head.appendChild(st);
  }
  function toast(message, isError) {
    ensureStyle();
    if (!toastEl) { toastEl = document.createElement("div"); toastEl.className = "gsr-toast"; toastEl.setAttribute("role", "status"); document.body.appendChild(toastEl); }
    toastEl.textContent = message;
    toastEl.classList.toggle("err", !!isError);
    toastEl.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl.classList.remove("show"), isError ? 3800 : 1900);
  }
  // The page under the pointer when the native menu opened.
  let target = { page: 0, at: 0 };
  function onContextMenu(e) {
    const el = e.target && e.target.closest ? e.target.closest("#viewer .page") : null;
    const n = el ? Number(el.dataset.pageNumber) : 0;
    target = { page: n || (app() && app().page) || 0, at: Date.now() };
  }
  function onMessage(msg) {
    if (!msg || msg.type !== "cito-pagecopy") return;
    // The worker broadcasts to every viewer; only the one whose menu was just
    // opened answers.
    if (!target.page || Date.now() - target.at > 60000 || !document.hasFocus()) return;
    if (!app() || !app().pdfDocument) return;
    (msg.what === "text" ? copyText : copyImage)(target.page);
  }
  // Home button in the toolbar: opens (or focuses) the Cito PDF home page.
  function addHomeButton() {
    const bar = document.getElementById("toolbarViewerLeft");
    if (!bar || document.getElementById("citoHome")) return;
    const b = document.createElement("button");
    b.id = "citoHome"; b.type = "button"; b.className = "toolbarButton citoHome"; b.title = "Cito PDF home";
    const label = document.createElement("span"); label.textContent = "Home"; b.appendChild(label);
    b.addEventListener("click", () => {
      const url = chrome.runtime.getURL("bg/main/home.html");
      // the worker focuses an open home tab instead of opening a second one
      try { chrome.runtime.sendMessage({ type: "cito-home" }).catch(() => window.open(url, "_blank", "noopener")); } catch (e) { window.open(url, "_blank", "noopener"); }
    });
    bar.insertBefore(b, bar.firstChild);
    const st = document.createElement("style");
    st.textContent = `.toolbarButton.citoHome::before{-webkit-mask-image:url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'><path d='M12 3.2 2.5 11.4h2.7V20h5.2v-5.6h3.2V20h5.2v-8.6h2.7z'/></svg>");mask-image:url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'><path d='M12 3.2 2.5 11.4h2.7V20h5.2v-5.6h3.2V20h5.2v-8.6h2.7z'/></svg>");-webkit-mask-size:cover;mask-size:cover}`;
    document.head.appendChild(st);
  }
  function init() {
    addHomeButton();
    document.addEventListener("contextmenu", onContextMenu, true);
    try { chrome.runtime.onMessage.addListener(onMessage); } catch (e) {}
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init); else init();

  // for tests and the home page tips
  window.__pageCopy = { pageText, pageImage, copyImage, copyText, onMessage, target: () => target };
})();
