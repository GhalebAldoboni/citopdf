/*
 * Transplanted from Google Scholar PDF Reader's printscript-compiled.js.
 * Runs inside Chrome's built-in PDF viewer frame (document.contentType is
 * application/pdf there) and calls window.print() when the viewer page that
 * embeds it asks for a print. Chrome then prints the PDF natively (vector),
 * instead of the rasterised pages pdf.js would produce.
 *
 * Scholar's version only accepts blob:null/ frames created by a file: page and
 * checks the request comes from the parent; here the frame is the PDF's own URL
 * and the request must come from this extension's viewer page.
 */
/*
 * Embedded PDFs (Scholar background-compiled.js: Cc, Ec). Many publishers serve
 * an HTML page whose full-page iframe holds the PDF (IEEE stamp.jsp, Wiley,
 * ProQuest, EBSCO), so the top frame is never a PDF and the header rules in
 * worker.js do not fire. Scholar accepts such a frame when it and the page
 * belong to one publisher family; here a frame that fills the page is also
 * accepted. The PDF frame reports itself to the top page, which asks the
 * worker to open the viewer on the PDF URL with the page as referrer.
 */
(function () {
  var isPdf = !!document.contentType && document.contentType.toLowerCase() === "application/pdf";
  function Cc(a) { return [".proquest.com", ".wiley.com", ".ieee.org", ".ebscohost.com"].find(function (b) { return a.endsWith(b); }); }
  if (window === window.parent) {
    if (isPdf) return;                       // top-level PDF: worker.js already handled it
    window.addEventListener("message", function (e) {
      var d = e.data;
      if (!d || d.type !== "gsr-embedded-pdf" || typeof d.url !== "string" || !/^https?:/i.test(d.url)) return;
      var frames = document.getElementsByTagName("iframe"), f = null;
      for (var i = 0; i < frames.length; i++) if (frames[i].contentWindow === e.source) { f = frames[i]; break; }
      if (!f) return;
      var r = f.getBoundingClientRect(), vw = window.innerWidth || 1, vh = window.innerHeight || 1;
      var fills = r.width * r.height >= 0.6 * vw * vh;
      var pub = Cc(e.origin) && Cc(e.origin) === Cc(location.origin);
      if (!fills && !pub) return;
      chrome.runtime.sendMessage({ type: "open-embedded-pdf", url: d.url, referer: location.href });
    });
    return;
  }
  if (!isPdf) return;
  // Inside a PDF frame: tell the top page (Scholar uses the frame chain in the worker).
  // Content scripts run at document_idle, so the top page's listener may not exist
  // yet when this frame loads: repeat for a few seconds.
  var tries = 0, announce = setInterval(function () {
    try { window.top.postMessage({ type: "gsr-embedded-pdf", url: location.href }, "*"); } catch (e) {}
    if (++tries >= 12) clearInterval(announce);
  }, 500);
  try { window.top.postMessage({ type: "gsr-embedded-pdf", url: location.href }, "*"); } catch (e) {}
  var extOrigin = "chrome-extension://" + chrome.runtime.id;
  var busy = false;
  window.addEventListener("message", function (a) {
    if (a.data === "print" && a.source === window.parent && a.origin === extOrigin) {
      if (busy) return;               // parent re-posts until acknowledged
      busy = true;
      setTimeout(function () { busy = false; }, 2000);
      a.source.postMessage("printing", extOrigin);
      window.print();
    } else if (a.data === "print") {
      console.log("Not a print request from expected origin or source. ", "(Request from", a.origin, "; not from parent: ", a.source !== window.parent, ".)");
    }
  });
})();
