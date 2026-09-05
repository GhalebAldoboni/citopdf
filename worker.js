"use strict";
/*
 * Background service worker.
 *
 * The original script intercepted PDF responses with a *blocking* webRequest
 * listener, which Manifest V3 no longer allows for normal installs ("You do not
 * have permission to use blocking webRequest listeners"), and its handlers read
 * misspelt event fields (lnk/metod/respHdr/frmId), so PDFs never auto-opened.
 * Interception now uses declarativeNetRequest rules that match on the response
 * Content-Type (Chrome 128+). Everything else (context menus, options, themes,
 * file browser handler, toolbar action) keeps its original behaviour; the menus
 * are recreated after removeAll() so service-worker restarts no longer log
 * "duplicate id" errors.
 */
const VIEWER = "/bg/helper/web/viewer.html";
const DOWNLOAD_MARKER = "pdfjs.action=download";

const stroy = e => {
  -1 !== e.indexOf("google.") && -1 !== e.indexOf("www.google.") && -1 !== e.indexOf("/url?") && -1 !== e.indexOf("&url=") &&
    (e = decodeURIComponent(e.split("&url=")[1].split("&")[0]));
  const t = -1 === e.indexOf("#") ? "" : "#";
  if (t) { const [o, n] = e.split(t); return chrome.runtime.getURL(VIEWER) + "?file=" + encodeURIComponent(o) + t + n; }
  return chrome.runtime.getURL(VIEWER) + "?file=" + encodeURIComponent(e);
};

// --- Open PDFs in the viewer (declarativeNetRequest, response-header match) ---
// Header values are matched case-insensitively; "*" is a wildcard.
const RULE_IDS = [1, 2, 3, 4];
const PDF_TYPES = ["application/pdf*", "application/x-pdf*", "application/acrobat*", "text/pdf*", "text/x-pdf*"];
// Generic "download" MIME types that sites use for PDF attachments.
const BINARY_TYPES = ["application/octet-stream*", "binary/octet-stream*", "application/x-octet-stream*",
  "application/force-download*", "application/x-force-download*", "application/x-download*", "application/download*",
  "application/unknown*", "application/binary*", "application/x-unknown*"];
function buildRules(frames) {
  const resourceTypes = frames ? ["main_frame", "sub_frame"] : ["main_frame"];
  const requestMethods = ["get"];
  const redirect = { regexSubstitution: chrome.runtime.getURL(VIEWER) + "?file=\\0" };
  const anyHttp = "^[hH][tT][tT][pP][sS]?://.+";
  return [
    // Downloads started from the viewer carry this marker: let them through.
    { id: 1, priority: 2, action: { type: "allow" }, condition: { urlFilter: DOWNLOAD_MARKER, resourceTypes } },
    // Served as a PDF (inline or attachment).
    { id: 2, priority: 1, action: { type: "redirect", redirect },
      condition: { regexFilter: anyHttp, resourceTypes, requestMethods,
        responseHeaders: [{ header: "content-type", values: PDF_TYPES }] } },
    // Generic binary type, but the URL path ends in .pdf.
    { id: 3, priority: 1, action: { type: "redirect", redirect },
      condition: { regexFilter: "^[hH][tT][tT][pP][sS]?://[^?#]*\\.[pP][dD][fF]([?#].*)?$", resourceTypes, requestMethods,
        responseHeaders: [{ header: "content-type", values: BINARY_TYPES }] } },
    // Attachment whose file name ends in .pdf, whatever the declared type.
    { id: 4, priority: 1, action: { type: "redirect", redirect },
      condition: { regexFilter: anyHttp, resourceTypes, requestMethods,
        responseHeaders: [{ header: "content-disposition", values: ["*.pdf*"] }] } },
  ];
}
const otvinta = () => chrome.storage.local.get({ frames: !1 }, e => {
  chrome.declarativeNetRequest.updateDynamicRules({ removeRuleIds: RULE_IDS, addRules: buildRules(e.frames) })
    .catch(err => console.error("PDF rules:", err));
});
otvinta();
chrome.storage.onChanged.addListener(e => { e.frames && otvinta(); });

// file:// PDFs (needs "Allow access to file URLs" in chrome://extensions).
// The listener is registered synchronously at the top level: a listener added
// inside an async callback is not known to Chrome when the service worker is
// asleep, so opening a downloaded PDF would not wake it and nothing happened.
let fileAccess = null;
const refreshFileAccess = () => new Promise(r => {
  if (!chrome.extension || !chrome.extension.isAllowedFileSchemeAccess) return r(fileAccess = true);
  chrome.extension.isAllowedFileSchemeAccess(v => r(fileAccess = !!v));
});
refreshFileAccess();
chrome.webNavigation.onBeforeNavigate.addListener(async ({ url: e, tabId: t, frameId: o }) => {
  if (0 !== o || e.includes(DOWNLOAD_MARKER)) return;
  if (!(await refreshFileAccess())) return;
  chrome.tabs.update(t, { url: stroy(e) });
}, { url: [{ urlPrefix: "file://", pathSuffix: ".pdf" }, { urlPrefix: "file://", pathSuffix: ".PDF" }] });

// --- Embedded PDFs reported by bg/main/printscript.js (Scholar: Ec + referer rule) ---
// The viewer fetches the PDF from the extension origin, so publishers that check
// the Referer (IEEE, Wiley, ...) get the embedding page's URL via a session rule.
let refererRuleId = 5000;
chrome.runtime.onMessage.addListener((msg, sender) => {
  if (!msg || msg.type !== "open-embedded-pdf" || !sender.tab || sender.frameId !== 0) return;
  const url = String(msg.url), referer = String(msg.referer || "");
  if (!/^https?:/i.test(url)) return;
  const id = refererRuleId++;
  const escaped = url.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").slice(0, 1900);
  const rule = { id, priority: 1, action: { type: "modifyHeaders", requestHeaders: [{ header: "referer", operation: "set", value: referer }] },
    condition: { regexFilter: "^" + escaped, resourceTypes: ["xmlhttprequest"] } };
  const open = () => chrome.tabs.update(sender.tab.id, { url: stroy(url) });
  if (!/^https?:/i.test(referer)) return open();
  chrome.declarativeNetRequest.updateSessionRules({ addRules: [rule] }).then(open, (e) => { console.warn("referer rule:", e); open(); });
  setTimeout(() => chrome.declarativeNetRequest.updateSessionRules({ removeRuleIds: [id] }).catch(() => {}), 6e5);
});

// --- Context menus (recreated on every service-worker start) ---
const OPTION_DEFAULTS = { theme: "dark-1", enableScripting: !1, disablePageLabels: !1, enablePermissions: !1, enablePrintAutoRotate: !1, enableWebGL: !1, historyUpdateUrl: !0, ignoreDestinationZoom: !1, pdfBugEnabled: !1, renderInteractiveForms: !0, useOnlyCssZoom: !1, disableAutoFetch: !1, disableFontFace: !1, disableRange: !1, disableStream: !1 };
const OPTION_TITLES = [["enableScripting", "Enable Scripting"], ["disablePageLabels", "Disable Page Labels"], ["enablePermissions", "Enable Permissions"], ["enablePrintAutoRotate", "Enable Print Auto-Rotate"], ["enableWebGL", "Enable WebGL"], ["historyUpdateUrl", "History Update URL"], ["ignoreDestinationZoom", "Ignore Destination Zoom"], ["renderInteractiveForms", "Render Interactive Forms"], ["useOnlyCssZoom", "Use Only CSS Zoom"], ["disableAutoFetch", "Disable Auto Fetch"], ["disableFontFace", "Disable Font Face"], ["disableRange", "Disable Range"], ["disableStream", "Disable Stream"]];
chrome.contextMenus.removeAll(() => {
  const name = chrome.runtime.getManifest().name;
  chrome.contextMenus.create({ id: "open-with", title: "Open with " + name, contexts: ["link"], targetUrlPatterns: ["*://*/*.PDF", "*://*/*"] });
  chrome.contextMenus.create({ id: "open-with-bg", title: "Open with " + name + " (background)", contexts: ["link"], targetUrlPatterns: ["*://*/*.PDF", "*://*/*"] });
  chrome.storage.local.get({ frames: !1 }, e => chrome.contextMenus.create({ id: "support-embedded-pdfs", title: "Support embedded PDFs", contexts: ["action"], type: "checkbox", checked: e.frames }));
  chrome.contextMenus.create({ id: "theme", title: "Themes", contexts: ["action"] });
  chrome.contextMenus.create({ id: "options", title: "Rendering Options", contexts: ["action"] });
  chrome.storage.local.get(OPTION_DEFAULTS, e => {
    chrome.contextMenus.create({ id: "dark-1", title: "Dark Theme", contexts: ["action"], parentId: "theme", type: "radio", checked: "dark-1" === e.theme });
    chrome.contextMenus.create({ id: "light-1", title: "Light Theme", contexts: ["action"], parentId: "theme", type: "radio", checked: "light-1" === e.theme });
    for (const [id, title] of OPTION_TITLES)
      chrome.contextMenus.create({ id, title, contexts: ["action"], parentId: "options", type: "checkbox", checked: e[id] });
  });
});

chrome.fileBrowserHandler && chrome.fileBrowserHandler.onExecute.addListener((e, t) => {
  if ("open-as-pdf" === e) for (const o of t.entries) chrome.tabs.create({ url: chrome.runtime.getURL(VIEWER + "?file=" + encodeURIComponent(o.toURL())) });
});
chrome.action.onClicked.addListener(() => chrome.tabs.create({ url: VIEWER + "?file=/bg/main/privet.pdf" }));
chrome.contextMenus.onClicked.addListener(({ menuItemId: e, linkUrl: t, checked: o }, n) => {
  e.startsWith("open-with") ? chrome.tabs.create({ url: stroy(t), index: n.index + 1, active: !1 === e.endsWith("-bg") })
    : "support-embedded-pdfs" === e ? chrome.storage.local.set({ frames: o })
    : e.startsWith("dark-") || e.startsWith("light-") ? chrome.storage.local.set({ theme: e })
    : chrome.storage.local.set({ [e]: o });
});
