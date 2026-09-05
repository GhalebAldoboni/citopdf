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
(function () {
  if (window === window.parent) return;
  if (!document.contentType || document.contentType.toLowerCase() !== "application/pdf") return;
  var extOrigin = "chrome-extension://" + chrome.runtime.id;
  var busy = false;
  window.addEventListener("message", function (a) {
    if (a.data === "print" && a.source === window.parent && (a.origin === extOrigin || a.origin === "null")) {
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
