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
function buildRules(frames, pdfViewerEnabled) {
  const resourceTypes = frames ? ["main_frame", "sub_frame"] : ["main_frame"];
  const requestMethods = ["get"];
  const anyHttp = "^[hH][tT][tT][pP][sS]?://.+";
  const pdfPath = "^[hH][tT][tT][pP][sS]?://[^?#]*\\.[pP][dD][fF]([?#].*)?$";
  const ctPdf = { header: "content-type", values: PDF_TYPES };
  const ctBinary = { header: "content-type", values: BINARY_TYPES };
  const cdPdfName = { header: "content-disposition", values: ["*.pdf*"] };
  // Downloads started from the viewer carry this marker: leave them alone.
  const allowMarker = { id: 1, priority: 2, action: { type: "allow" }, condition: { urlFilter: DOWNLOAD_MARKER, resourceTypes } };
  if (pdfViewerEnabled) {
    // Chrome shows PDFs itself and bg/main/embed.js hosts the viewer in that
    // page, so the tab keeps the PDF's URL. Responses that Chrome would
    // download instead (attachment, or a binary type with a .pdf name) are
    // rewritten to inline application/pdf. Only the navigation response is
    // touched; the viewer's own fetch still sees the original headers and the
    // file name in them.
    const inline = { header: "content-disposition", operation: "set", value: "inline" };
    const asPdf = { header: "content-type", operation: "set", value: "application/pdf" };
    return [
      allowMarker,
      { id: 2, priority: 1, action: { type: "modifyHeaders", responseHeaders: [inline] },
        condition: { regexFilter: anyHttp, resourceTypes, requestMethods, responseHeaders: [ctPdf] } },
      { id: 3, priority: 1, action: { type: "modifyHeaders", responseHeaders: [asPdf, inline] },
        condition: { regexFilter: pdfPath, resourceTypes, requestMethods, responseHeaders: [ctBinary] } },
      { id: 4, priority: 1, action: { type: "modifyHeaders", responseHeaders: [asPdf, inline] },
        condition: { regexFilter: anyHttp, resourceTypes, requestMethods, responseHeaders: [cdPdfName] } },
    ];
  }
  // Chrome is set to download PDFs instead of showing them: open the viewer page directly.
  const redirect = { regexSubstitution: chrome.runtime.getURL(VIEWER) + "?file=\\0" };
  return [
    allowMarker,
    { id: 2, priority: 1, action: { type: "redirect", redirect },
      condition: { regexFilter: anyHttp, resourceTypes, requestMethods, responseHeaders: [ctPdf] } },
    { id: 3, priority: 1, action: { type: "redirect", redirect },
      condition: { regexFilter: pdfPath, resourceTypes, requestMethods, responseHeaders: [ctBinary] } },
    { id: 4, priority: 1, action: { type: "redirect", redirect },
      condition: { regexFilter: anyHttp, resourceTypes, requestMethods, responseHeaders: [cdPdfName] } },
  ];
}
const otvinta = () => chrome.storage.local.get({ frames: !1, pdfViewerEnabled: !0 }, e => {
  chrome.declarativeNetRequest.updateDynamicRules({ removeRuleIds: RULE_IDS, addRules: buildRules(e.frames, e.pdfViewerEnabled) })
    .catch(err => console.error("PDF rules:", err));
});
otvinta();
chrome.storage.onChanged.addListener(e => { (e.frames || e.pdfViewerEnabled) && otvinta(); });

// file:// PDFs are handled like web PDFs: Chrome shows its PDF page and
// bg/main/embed.js hosts the viewer in it (needs "Allow access to file URLs").

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
