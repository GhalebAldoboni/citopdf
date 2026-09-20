/*
 * Cito PDF home page.
 *
 * Reads what bg/main/recent.js records from inside the viewer:
 *   chrome.storage.local.recentDocs          [{ id, url, local, name, title, firstSeen,
 *                                               lastOpened, pages, page, pinned, thumb }]
 *   chrome.storage.local["recentThumb:<id>"] JPEG data URL of page 1
 *
 * Opening documents:
 *   - http(s) and file:// documents: the tab simply navigates to the URL. The
 *     content script (embed.js) puts the viewer on the PDF page, so the address
 *     bar keeps the real URL.
 *   - Files from the picker or a drop have no URL. The File goes into IndexedDB
 *     ("citoHome" / "handoff") and the tab opens viewer.html?file=&homefile=<id>;
 *     recent.js hands it to pdf.js. Where Chrome gives a FileSystemFileHandle it
 *     is kept ("handles") so the entry in Recent can reopen the file later.
 *
 * No network requests are made from this page.
 */
(() => {
  "use strict";

  const KEY = "recentDocs";
  const THUMB_PREFIX = "recentThumb:";
  const VIEWER = chrome.runtime.getURL("bg/helper/web/viewer.html");
  const DB_NAME = "citoHome", HANDOFF = "handoff", HANDLES = "handles";
  const KEEP_HANDOFFS = 3;               // copies of picked files kept so that a reload of the viewer still works

  const $ = (id) => document.getElementById(id);
  const el = (tag, className, text) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
  };

  // Static icon markup only; never mixed with document data.
  const ICONS = {
    pin: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 4h6l-1 6 3 3v2H7v-2l3-3z"/><path d="M12 15v5"/></svg>',
    remove: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg>',
    page: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 3h7l4 4v14H7z"/><path d="M14 3v4h4M10 12h5M10 16h5"/></svg>',
  };

  // ---------------------------------------------------------------- utilities

  // Same hash as recent.js (cyrb53), so a local file keeps one id on both sides.
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

  const storageGet = (query) => new Promise((resolve) => {
    try { chrome.storage.local.get(query, (v) => resolve(chrome.runtime.lastError ? {} : v || {})); }
    catch (e) { resolve({}); }
  });
  const storageSet = (values) => new Promise((resolve) => {
    try { chrome.storage.local.set(values, () => { void chrome.runtime.lastError; resolve(); }); }
    catch (e) { resolve(); }
  });
  const storageRemove = (keys) => new Promise((resolve) => {
    try { chrome.storage.local.remove(keys, () => { void chrome.runtime.lastError; resolve(); }); }
    catch (e) { resolve(); }
  });

  let toastTimer = 0;
  const toast = (message) => {
    const box = $("toast");
    box.textContent = message;
    box.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { box.hidden = true; }, 4200);
  };

  const relativeTime = (() => {
    const fmt = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
    const steps = [[60, "second"], [60, "minute"], [24, "hour"], [7, "day"], [4.345, "week"], [12, "month"], [Infinity, "year"]];
    return (then) => {
      let delta = (then - Date.now()) / 1000;
      if (Math.abs(delta) < 45) return "just now";
      for (const [size, unit] of steps) {
        if (Math.abs(delta) < size) return fmt.format(Math.round(delta), unit);
        delta /= size;
      }
      return "";
    };
  })();

  // ------------------------------------------------------------- IndexedDB

  const openDb = () => new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      db.objectStoreNames.contains(HANDOFF) || db.createObjectStore(HANDOFF, { keyPath: "id" });
      db.objectStoreNames.contains(HANDLES) || db.createObjectStore(HANDLES, { keyPath: "id" });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });

  // Runs `work(store)` in one transaction and resolves with the request's result.
  const withStore = async (name, mode, work) => {
    const db = await openDb();
    try {
      return await new Promise((resolve, reject) => {
        const tx = db.transaction(name, mode);
        const req = work(tx.objectStore(name));
        tx.oncomplete = () => resolve(req && req.result);
        tx.onerror = tx.onabort = () => reject(tx.error);
      });
    } finally { db.close(); }
  };
  const dbGet = (store, id) => withStore(store, "readonly", (s) => s.get(id)).catch(() => undefined);
  const dbAll = (store) => withStore(store, "readonly", (s) => s.getAll()).catch(() => []);
  const dbKeys = (store) => withStore(store, "readonly", (s) => s.getAllKeys()).catch(() => []);
  const dbPut = (store, value) => withStore(store, "readwrite", (s) => s.put(value));
  const dbDelete = (store, id) => withStore(store, "readwrite", (s) => s.delete(id)).catch(() => {});
  const dbClear = (store) => withStore(store, "readwrite", (s) => s.clear()).catch(() => {});

  // ------------------------------------------------------- opening documents

  const navigate = (url, newTab) => {
    try {
      // chrome.tabs can open file:// URLs, which a plain link on this page cannot.
      if (newTab) chrome.tabs.create({ url, active: false });
      else chrome.tabs.getCurrent((tab) => (tab ? chrome.tabs.update(tab.id, { url }) : chrome.tabs.update({ url })));
    } catch (e) { location.href = url; }
  };

  // Turns what was typed or pasted into a URL, or "" when it is not one.
  const parseLocation = (raw) => {
    let text = String(raw || "").trim().replace(/^[<"'\s]+|[>"'\s]+$/g, "");
    if (!text) return "";
    const arxiv = /^(?:arxiv:)?(\d{4}\.\d{4,5}(?:v\d+)?)$/i.exec(text);
    if (arxiv) return "https://arxiv.org/pdf/" + arxiv[1];
    const doi = /^(?:doi:\s*)?(10\.\d{4,9}\/\S+)$/i.exec(text);
    if (doi) return "https://doi.org/" + doi[1];
    if (/^\/[^/]/.test(text) && /\.pdf$/i.test(text)) text = "file://" + encodeURI(text);   // an absolute path
    if (!/^[a-z][a-z0-9+.-]*:/i.test(text)) {
      if (!/^[^\s/]+\.[a-z]{2,}(?:[/:?#]|$)/i.test(text)) return "";
      text = "https://" + text;
    }
    try {
      const url = new URL(text);
      return /^(https?|file|ftp):$/.test(url.protocol) ? url.href : "";
    } catch (e) { return ""; }
  };

  const isPdfFile = (file) => !!file && (file.type === "application/pdf" || /\.pdf$/i.test(file.name || ""));

  const localId = (file) => "l_" + hash([file.name, file.size, file.lastModified].join("|"));

  // Stores the file for the viewer and sends this tab there.
  const openLocalFile = async (file, handle, page) => {
    if (!isPdfFile(file)) { toast("That file is not a PDF."); return; }
    let id = localId(file);
    try {
      if (handle) {
        // The same file picked again keeps its entry even after it was edited on disk.
        for (const known of await dbAll(HANDLES)) {
          try { if (known.handle && await known.handle.isSameEntry(handle)) { id = known.id; break; } } catch (e) {}
        }
        await dbPut(HANDLES, { id, name: file.name, handle, ts: Date.now() }).catch(() => {});
      }
      await dbPut(HANDOFF, { id, name: file.name, file, ts: Date.now() });
      // Keep only the newest few copies.
      const copies = (await dbAll(HANDOFF)).sort((a, b) => b.ts - a.ts).slice(KEEP_HANDOFFS);
      for (const old of copies) await dbDelete(HANDOFF, old.id);
    } catch (e) {
      toast("Could not hand the file to the reader: " + (e && e.message || e));
      return;
    }
    location.href = VIEWER + "?file=&homefile=" + encodeURIComponent(id) + (page > 1 ? "#page=" + page : "");
  };

  // "Open file": the File System Access picker gives a handle that can be reopened
  // from Recent; the plain <input type=file> is the fallback.
  const pickFile = async () => {
    if (typeof window.showOpenFilePicker === "function") {
      try {
        const [handle] = await window.showOpenFilePicker({
          id: "citopdf",
          types: [{ description: "PDF documents", accept: { "application/pdf": [".pdf"] } }],
        });
        if (handle) await openLocalFile(await handle.getFile(), handle);
        return;
      } catch (e) {
        if (e && e.name === "AbortError") return;        // the user closed the picker
      }
    }
    $("file-input").click();
  };

  // A Recent entry for a local file: reopen through its handle, else through
  // the stored copy, else ask for the file again.
  const reopenLocal = async (entry) => {
    const page = entry.page || 1;
    const saved = await dbGet(HANDLES, entry.id);
    if (saved && saved.handle) {
      try {
        let state = await saved.handle.queryPermission({ mode: "read" });
        if (state !== "granted") state = await saved.handle.requestPermission({ mode: "read" });
        if (state === "granted") { await openLocalFile(await saved.handle.getFile(), saved.handle, page); return; }
      } catch (e) { /* moved or deleted: fall through */ }
    }
    if (await dbGet(HANDOFF, entry.id)) {
      location.href = VIEWER + "?file=&homefile=" + encodeURIComponent(entry.id) + (page > 1 ? "#page=" + page : "");
      return;
    }
    toast("Choose “" + (entry.name || "the file") + "” again to reopen it.");
    pickFile();
  };

  const openEntry = (entry, newTab) => {
    if (entry.local) { reopenLocal(entry); return; }
    navigate(entry.url + (entry.page > 1 ? "#page=" + entry.page : ""), newTab);
  };

  // ------------------------------------------------------------- recent list

  let docs = [];                 // recentDocs as stored
  let thumbs = {};               // id -> data URL
  let reopenable = new Set();    // ids of local entries that open without re-picking
  let filterText = "";

  const entryTitle = (d) => d.title || d.name || d.url || "Untitled";
  const entryWhere = (d) => {
    if (d.local) return "Local file";
    try {
      const u = new URL(d.url);
      if (u.protocol === "file:") {
        const parts = decodeURIComponent(u.pathname).split("/").filter(Boolean);
        return parts.length > 1 ? parts[parts.length - 2] + " • on this computer" : "On this computer";
      }
      return u.host.replace(/^www\./, "");
    } catch (e) { return ""; }
  };

  const saveDocs = () => storageSet({ [KEY]: docs });

  const removeEntry = async (id) => {
    docs = docs.filter((d) => d.id !== id);
    render();
    await saveDocs();
    await storageRemove(THUMB_PREFIX + id);
    dbDelete(HANDOFF, id); dbDelete(HANDLES, id);
  };

  const togglePin = async (id) => {
    const entry = docs.find((d) => d.id === id);
    if (!entry) return;
    entry.pinned = !entry.pinned;
    render();
    await saveDocs();
    const button = document.querySelector('.card[data-id="' + CSS.escape(id) + '"] .pin');
    button && button.focus();
  };

  const clearAll = async () => {
    const keys = docs.map((d) => THUMB_PREFIX + d.id);
    docs = []; thumbs = {};
    render();
    // Thumbnails of entries dropped elsewhere may linger: sweep every thumbnail key.
    const everything = await storageGet(null);
    for (const k of Object.keys(everything)) if (k.startsWith(THUMB_PREFIX) && !keys.includes(k)) keys.push(k);
    await storageSet({ [KEY]: [] });
    await storageRemove(keys);
    dbClear(HANDOFF); dbClear(HANDLES);
    $("filter-input").value = ""; filterText = "";
    render();
  };

  const buildCard = (d) => {
    const title = entryTitle(d);
    const card = el("li", "card" + (d.pinned ? " is-pinned" : ""));
    card.dataset.id = d.id;

    const link = el("a", "card-link");
    link.href = d.local ? "#" : d.url + (d.page > 1 ? "#page=" + d.page : "");
    link.addEventListener("click", (e) => {
      // Let the browser handle "open in new window" and the like for web links.
      if (e.shiftKey && !d.local && /^https?:/i.test(d.url)) return;
      e.preventDefault();
      openEntry(d, e.metaKey || e.ctrlKey);
    });
    link.addEventListener("auxclick", (e) => {
      if (e.button !== 1) return;
      e.preventDefault();
      d.local ? toast("Local files open in this tab.") : openEntry(d, true);
    });

    const thumb = el("div", "thumb");
    if (thumbs[d.id]) {
      const img = el("img");
      img.alt = ""; img.loading = "lazy"; img.decoding = "async"; img.src = thumbs[d.id];
      thumb.appendChild(img);
    } else {
      thumb.classList.add("thumb-blank");
      thumb.innerHTML = ICONS.page;
    }
    const pages = d.pages || 0, page = Math.min(Math.max(d.page || 1, 1), pages || 1);
    if (pages > 1) {
      const bar = el("div", "progress"), fill = el("i");
      fill.style.width = Math.round((page / pages) * 100) + "%";
      bar.appendChild(fill); thumb.appendChild(bar);
    }
    link.appendChild(thumb);

    const body = el("div", "card-body");
    const heading = el("h3", "card-title", title);
    heading.title = title;
    body.appendChild(heading);
    const where = el("p", "card-where", entryWhere(d));
    where.title = d.local ? (d.name || "") : d.url;
    body.appendChild(where);
    if (d.local && !reopenable.has(d.id)) body.appendChild(el("p", "card-note", "Pick the file again to reopen"));
    const meta = el("p", "card-meta");
    meta.appendChild(el("span", "", pages ? "Page " + page + " of " + pages : ""));
    const when = el("time", "", relativeTime(d.lastOpened));
    when.dateTime = new Date(d.lastOpened || Date.now()).toISOString();
    when.title = new Date(d.lastOpened || Date.now()).toLocaleString();
    when.dataset.ts = String(d.lastOpened || 0);
    meta.appendChild(when);
    body.appendChild(meta);
    link.appendChild(body);
    card.appendChild(link);

    const actions = el("div", "card-actions");
    const pin = el("button", "icon-btn pin");
    pin.type = "button";
    pin.innerHTML = ICONS.pin;
    pin.setAttribute("aria-pressed", d.pinned ? "true" : "false");
    pin.setAttribute("aria-label", (d.pinned ? "Unpin " : "Pin ") + title);
    pin.title = d.pinned ? "Unpin" : "Pin to the top";
    pin.addEventListener("click", () => togglePin(d.id));
    const remove = el("button", "icon-btn remove");
    remove.type = "button";
    remove.innerHTML = ICONS.remove;
    remove.setAttribute("aria-label", "Remove " + title + " from recent documents");
    remove.title = "Remove from recent";
    remove.addEventListener("click", () => removeEntry(d.id));
    actions.appendChild(pin); actions.appendChild(remove);
    card.appendChild(actions);
    return card;
  };

  const render = () => {
    const grid = $("recent-grid"), status = $("recent-status");
    const needle = filterText.trim().toLowerCase();
    const shown = docs
      .filter((d) => !needle || [d.title, d.name, d.url].some((s) => s && String(s).toLowerCase().includes(needle)))
      // Pinned first, then most recently opened.
      .sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0) || (b.lastOpened || 0) - (a.lastOpened || 0));

    grid.replaceChildren(...shown.map(buildCard));
    $("empty").hidden = docs.length > 0;
    $("recent-tools").hidden = docs.length === 0;
    $("recent-count").textContent = docs.length ? String(docs.length) : "";
    status.textContent = !docs.length ? ""
      : needle && !shown.length ? "No recent document matches “" + filterText.trim() + "”."
      : needle ? shown.length + " of " + docs.length + " shown." : "";
  };

  const load = async () => {
    const got = await storageGet({ [KEY]: [] });
    docs = (Array.isArray(got[KEY]) ? got[KEY] : []).filter((d) => d && d.id && (d.url || d.local));
    const thumbKeys = docs.filter((d) => d.thumb).map((d) => THUMB_PREFIX + d.id);
    const images = thumbKeys.length ? await storageGet(thumbKeys) : {};
    thumbs = {};
    for (const d of docs) if (images[THUMB_PREFIX + d.id]) thumbs[d.id] = images[THUMB_PREFIX + d.id];
    if (docs.some((d) => d.local)) reopenable = new Set([...(await dbKeys(HANDLES)), ...(await dbKeys(HANDOFF))]);
    render();
  };

  // --------------------------------------------------------------- settings

  const setPressed = (group, value) => {
    for (const b of group.querySelectorAll("button")) b.setAttribute("aria-pressed", String(b.dataset.value === String(value)));
  };

  const loadSettings = async () => {
    const v = await storageGet({ theme: "dark-1", night: 0, frames: false });
    const theme = String(v.theme).startsWith("light") ? "light-1" : "dark-1";
    document.documentElement.dataset.theme = theme;      // same palette as the reader (tema.css)
    setPressed($("set-theme"), theme);
    setPressed($("set-night"), v.night === true ? 1 : Number(v.night) || 0);
    setPressed($("set-frames"), v.frames ? 1 : 0);
  };

  // The toolbar icon's right-click menu shows the same switches; keep its ticks in step.
  const syncMenu = (id, checked) => { try { chrome.contextMenus.update(id, { checked }, () => void chrome.runtime.lastError); } catch (e) {} };

  const wireSettings = () => {
    $("set-theme").addEventListener("click", (e) => {
      const b = e.target.closest("button"); if (!b) return;
      setPressed($("set-theme"), b.dataset.value);
      document.documentElement.dataset.theme = b.dataset.value;
      storageSet({ theme: b.dataset.value });
      syncMenu(b.dataset.value, true);
    });
    $("set-night").addEventListener("click", (e) => {
      const b = e.target.closest("button"); if (!b) return;
      setPressed($("set-night"), b.dataset.value);
      storageSet({ night: Number(b.dataset.value) });
    });
    $("set-frames").addEventListener("click", (e) => {
      const b = e.target.closest("button"); if (!b) return;
      const on = b.dataset.value === "1";
      setPressed($("set-frames"), b.dataset.value);
      storageSet({ frames: on });
      syncMenu("support-embedded-pdfs", on);
    });
    $("open-options").addEventListener("click", () => { try { chrome.runtime.openOptionsPage(); } catch (e) {} });
  };

  // ------------------------------------------------------------ page wiring

  const wireOpen = () => {
    $("open-file").addEventListener("click", pickFile);
    $("file-input").addEventListener("change", (e) => {
      const file = e.target.files && e.target.files[0];
      e.target.value = "";
      file && openLocalFile(file, null);
    });

    const input = $("url-input"), field = input.closest(".field");
    const go = () => {
      const url = parseLocation(input.value);
      field.classList.toggle("is-invalid", !url);
      input.setAttribute("aria-invalid", url ? "false" : "true");
      if (!url) { toast("Enter a link such as https://arxiv.org/pdf/1706.03762, a DOI, or an arXiv id."); input.focus(); return; }
      navigate(url, false);
    };
    $("url-form").addEventListener("submit", (e) => { e.preventDefault(); go(); });
    input.addEventListener("input", () => { field.classList.remove("is-invalid"); input.removeAttribute("aria-invalid"); });

    // A link pasted anywhere on the page lands in the box, ready to open.
    document.addEventListener("paste", (e) => {
      const t = e.target;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
      const text = e.clipboardData && e.clipboardData.getData("text");
      if (!parseLocation(text)) return;
      e.preventDefault();
      input.value = text.trim();
      input.focus(); input.select();
    });
  };

  const wireDrop = () => {
    const veil = $("drop-veil");
    let depth = 0;
    const hasPayload = (e) => {
      const types = e.dataTransfer && e.dataTransfer.types ? Array.from(e.dataTransfer.types) : [];
      return types.includes("Files") || types.includes("text/uri-list");
    };
    const hide = () => { depth = 0; veil.hidden = true; };

    window.addEventListener("dragenter", (e) => { if (!hasPayload(e)) return; e.preventDefault(); depth++; veil.hidden = false; });
    window.addEventListener("dragover", (e) => { if (!hasPayload(e)) return; e.preventDefault(); e.dataTransfer.dropEffect = "copy"; });
    window.addEventListener("dragleave", (e) => { if (!hasPayload(e)) return; depth = Math.max(0, depth - 1); depth || hide(); });
    window.addEventListener("drop", async (e) => {
      if (!hasPayload(e)) return;
      e.preventDefault();
      hide();
      const dt = e.dataTransfer;
      const file = Array.from(dt.files || []).find(isPdfFile);
      if (file) {
        // The handle (when Chrome offers one) must be requested before the event ends.
        let handle = null;
        try {
          const item = Array.from(dt.items || []).find((i) => i.kind === "file");
          if (item && item.getAsFileSystemHandle) handle = await item.getAsFileSystemHandle();
          if (handle && handle.kind !== "file") handle = null;
        } catch (err) { handle = null; }
        openLocalFile(file, handle);
        return;
      }
      if (dt.files && dt.files.length) { toast("That file is not a PDF."); return; }
      const url = parseLocation((dt.getData("text/uri-list") || "").split(/\r?\n/).find((l) => l && l[0] !== "#"));
      url ? navigate(url, false) : toast("Nothing to open in what was dropped.");
    });
  };

  const wireRecent = () => {
    $("filter-input").addEventListener("input", (e) => { filterText = e.target.value; render(); });

    // "Clear all" asks once more, in place, before it deletes anything.
    const clear = $("clear-all");
    let armed = 0;
    const disarm = () => { clearTimeout(armed); armed = 0; clear.textContent = "Clear all"; clear.classList.remove("is-armed"); };
    clear.addEventListener("click", () => {
      if (armed) { disarm(); clearAll(); return; }
      clear.textContent = "Click again to clear";
      clear.classList.add("is-armed");
      armed = setTimeout(disarm, 4000);
    });
    clear.addEventListener("blur", disarm);

    // Stay current while documents are read in other tabs.
    let reload = 0;
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== "local") return;
      if (changes.theme || changes.night || changes.frames) loadSettings();
      if (Object.keys(changes).some((k) => k === KEY || k.startsWith(THUMB_PREFIX))) {
        clearTimeout(reload);
        reload = setTimeout(load, 250);
      }
    });
    // Relative times age while the page sits open.
    setInterval(() => {
      for (const t of document.querySelectorAll("time[data-ts]")) t.textContent = relativeTime(Number(t.dataset.ts));
    }, 60000);
    // Returning with Back restores this page from the back/forward cache: refresh it.
    window.addEventListener("pageshow", (e) => { e.persisted && load(); });
  };

  const wireFileAccess = () => {
    try {
      chrome.extension.isAllowedFileSchemeAccess((allowed) => { $("file-access-hint").hidden = !!allowed; });
    } catch (e) {}
    $("file-access-open").addEventListener("click", () => {
      try { chrome.tabs.create({ url: "chrome://extensions/?id=" + chrome.runtime.id }); } catch (e) {}
    });
  };

  const init = () => {
    try { $("version").textContent = "Cito PDF " + chrome.runtime.getManifest().version; } catch (e) {}
    wireOpen(); wireDrop(); wireRecent(); wireSettings(); wireFileAccess();
    loadSettings();
    load();
  };

  init();
})();
