# Changelog

All notable changes, newest first. Each version links to its release, which carries the installable zip. Every item was verified in Chrome for
Testing with the unpacked extension unless marked otherwise.

## 1.4.1

- Large files now finish downloading in the background after the first pages are shown, instead of fetching only the pages in view. pdf.js's auto-fetch pulls the remaining chunks one at a time, with page requests taking priority; it needed `disableStream`, since pdf.js otherwise expects a full stream that the ranged relay no longer sends. Verified with a 200 MB PDF: first page at 0.35 s, complete after about 6 s, page jumps served meanwhile; local files behave the same.

## [1.4.0](https://github.com/GhalebAldoboni/scholar-pdf-viewer-lite/releases/tag/v1.4.0) · Huge files · 2026-09-06

- Very large PDFs open instantly. The relay's first request is a 1 MB byte range; when the server answers 206 the viewer knows the size and pdf.js reads by range only, never downloading the file whole. Above 48 MB it fetches just the pages you look at, in 1 MB chunks (`disableAutoFetch`); below that the remainder streams by range in the background so download and citation analysis still get the whole file.
- Local files are read by range too: Chrome slices `file://` reads, the size is found with about 40 one-byte probes, and files under 4 MB are read whole as before.
- Citation analysis is skipped for documents above 100 MB (it needs the entire file).
- Measured in Chrome for Testing with a 200 MB PDF: first page at 0.34 s over HTTP with 4.75 MB transferred, 0.22 s from disk; a 7 MB paper over a throttled 2 MB/s link now shows page 1 in 0.55 s. Servers that ignore `Range` fall back to the buffered path with a progress bar.

## [1.3.1](https://github.com/GhalebAldoboni/scholar-pdf-viewer-lite/releases/tag/v1.3.1) · AMOLED black · 2026-09-06

- Third state for the page-mode button: day → night → AMOLED black (eclipse icon). AMOLED sends paper to pure black and text to pure white with a black toolbar, sidebar and background, while figures, greys and colours keep night mode's exact tones. That split is done with an SVG tone curve (`feComponentTransfer`) instead of `invert(1)`, since a linear inversion would shift every mid-tone. Verified per colour in Chrome for Testing: mid-tones identical to night mode, white→0, black→255.

## [1.3.0](https://github.com/GhalebAldoboni/scholar-pdf-viewer-lite/releases/tag/v1.3.0) · Night mode · 2026-09-06

- Night/day toggle for the rendered pages: a sun/moon button beside *Copy PDF Link*, showing the current state, plus Shift+N. State persists in `chrome.storage.local` and follows across tabs. The toggle, persistence and the three tint levels are DarkPDF's ([ArshSB/DarkPDF](https://github.com/ArshSB/DarkPDF)); the inversion is applied as a per-canvas filter instead of DarkPDF's full-viewport blend overlay so scrolling and pinch keep their frame rate and the toolbar, citation overlays and printing stay untouched. Verified: toggle, persistence, shortcut and frame times in Chrome for Testing.

## [1.2.4](https://github.com/GhalebAldoboni/scholar-pdf-viewer-lite/releases/tag/v1.2.4) · 2026-09-05

- pdf.js's worker is created while the viewer is still loading and handed to the first document, instead of being started on open. Parse wait after open drops from about 160 ms to 20 ms; a local 7 MB paper paints its first page roughly 70 ms sooner.
- Plugin suppression at document_start was tried and dropped: no measurable gain over Scholar's DOMContentLoaded swap.

## [1.2.3](https://github.com/GhalebAldoboni/scholar-pdf-viewer-lite/releases/tag/v1.2.3) · 2026-09-05

- Faster first page for web PDFs. The relay now streams progressively and answers pdf.js byte-range requests from the page (Scholar's `qa()`/`ra()`), so the first page renders while the rest of the file is still downloading. Measured on a 7 MB paper over a throttled 2 MB/s link: first page at 0.7 s instead of 4.5 s. Buffered path kept for servers without range support or with compressed bodies.

## [1.2.2](https://github.com/GhalebAldoboni/scholar-pdf-viewer-lite/releases/tag/v1.2.2) · 2026-09-05

- Download-style PDF responses (`Content-Disposition: attachment`, or a binary type with a `.pdf` name) are no longer redirected to the viewer page, which had to re-fetch them from the extension origin and failed on publishers like ACM (`?download=true`). The navigation response is rewritten to inline `application/pdf` with a declarativeNetRequest header rule, so Chrome shows its PDF page and the viewer embeds there under the real URL; the page fetches the file with its own cookies and referrer, and the file name from the original header is kept. Verified for attachment, octet-stream `.pdf` and named-attachment responses.

## [1.2.1](https://github.com/GhalebAldoboni/scholar-pdf-viewer-lite/releases/tag/v1.2.1) · 2026-09-05

- Fix: citation popups did not appear in the embedded viewer. Scholar's sandboxed loader page was not web-accessible, so Chrome refused to load it in a frame under a web page and the analyzer never received the document. Listed like Scholar does.

## [1.2.0](https://github.com/GhalebAldoboni/scholar-pdf-viewer-lite/releases/tag/v1.2.0) · Real URLs · 2026-09-05

- The address bar shows the PDF's own URL, as with Chrome's viewer. Transplanted from the Scholar reader's `contentscript-compiled.js`: `bg/main/embed.js` runs on the PDF page Chrome creates for the response and swaps its body for a full-window frame holding the viewer. Back, reload, bookmarks and "copy address" keep the PDF URL.
- The page fetches the PDF on the viewer's behalf over a MessagePort (Scholar's `na()` relay), so the request carries the page's cookies and referrer; publisher paywalls and one-time links work without any header rewriting. The viewer falls back to fetching itself if the relay fails.
- Tab title follows the document (pdf.js suppresses it in frames; overridden). The tab URL hash follows the current page (`#page=N`, replaceState) and Back/Forward or a hash edit moves the viewer.
- Printing hands the bytes to the page, which prints them through Chrome's PDF engine (Scholar's `printBuffer` path); `file://` pages use the `printscript.js` handshake.
- `file://` PDFs and publisher-embedded frames (700x350 or larger, or filling the window, Scholar's rule) go through the same path; "Support embedded PDFs" opens smaller frames too.
- `worker.js` no longer redirects inline PDFs; attachments Chrome would download are still redirected to the viewer page, and every PDF is redirected if Chrome is set to download PDFs.
- `#gsr=0` or `#toolbar=0` leaves Chrome's viewer alone.
- Verified in Chrome for Testing: top-level, `file://` and framed PDFs keep their URL and render; the relay sends cookies; `#page=` syncs both ways; attachments redirect; the print frame is created.

## [1.1.0](https://github.com/GhalebAldoboni/scholar-pdf-viewer-lite/releases/tag/v1.1.0) · Lite · 2026-09-05

### Performance
- Device profile (`bg/main/device.js`): machines with 4 GB or less, or two cores, keep pdf.js's 16 MP canvas cap, pre-render one page ahead, gate flings from 1800 px/s and wait 200 ms before text layers.
- `content-visibility: auto` on off-screen pages (`bg/main/perf.css`): the cached pages' text layers cost no layout or paint while scrolling. Pages hosting an open citation popup are excluded.
- Text layers are built visible-first: pre-rendered pages get their canvas now and their text layer when they scroll into view.
- `contain: layout` on text layers.

### Housekeeping
- Renamed to Scholar PDF Viewer Lite.
- Removed the original viewer's Web Store rating prompt, its jQuery copy, the store `update_url` and the dead donate button.
- The Scholar account lookup runs on the first popup, not on every viewer load.
- README: comparison against Chrome, Scholar and stock pdf.js; privacy section.

## [1.0.0](https://github.com/GhalebAldoboni/scholar-pdf-viewer-lite/releases/tag/v1.0.0) · 2026-09-05

### Citations (transplanted from the Google Scholar PDF Reader)
- Scholar's citation engine runs as-is: the analyzer Web Worker (`analyzer_worker_bin.js`) and its sandboxed pdf.js loader iframe (`pdf_loader_iframe.html`, `pdf_loader-compiled.js`, `pdf.min.js`, `pdf.worker.min.js`, `bcmaps/`), which feeds it page text and annotations in Scholar's protobuf format. The only edit to the worker is one line so it emits its result as JSON instead of binary protobuf, which avoids shipping Scholar's proto runtime.
- Bridge and UI lifted from `reader-compiled.js` into `bg/main/scholar-citations.js` with Scholar's identifiers kept so the code diffs against the bundle: loader host, worker bootstrap, page overlays, dialog widget, popover stack, reference popup with prev/next across grouped citations, "See in References".
- Author-year and numbered citation styles.
- Popup styles are Scholar's own rules from `reader-prod.css`, hooked to the viewer's light and dark themes.
- Scholar search in the popup: title, authors line, snippet with Show more/less, Cited by, Related, Versions and full-text links, Search Scholar / Search Google fallbacks, error banner.
- Cite dialog (MLA, APA, Chicago rows; BibTeX, EndNote, RefMan, RefWorks links) and Save-to-library dialog with labels, new label, remove; sign-in flow when there is no Scholar session.
- Popup links open in a new tab instead of navigating the PDF away.
- Neutral, high-contrast dark palette for the popup; Scholar's base anchor colours scoped to the popup.
- The loader iframe is torn down after analysis so the second parsed copy of the PDF is freed.
- Measured on a 26-page arXiv paper: 53 references, 65 citation groups on 16 pages, about 4.5 s of analysis after the first pages render, 303 ms of main-thread time in two long tasks.

### Printing
- Vector printing through Chrome's built-in PDF engine, Scholar's approach: `bg/main/printscript.js` runs inside the PDF frame and prints on a postMessage handshake; `bg/main/nativeprint.js` overrides the viewer's print so the toolbar button, Ctrl/Cmd+P and PDF auto-print all go vector.
- Fallback to pdf.js printing at 300 dpi (was 150) for form-edited documents, non-PDF responses or a disabled plugin.
- Not verified headless: the print dialog itself.

### Zoom (`bg/main/smooth.js`)
- Compositor preview of the gesture with a CSS transform around the cursor; one pdf.js render per gesture. Stock pdf.js re-rendered every visible page on every wheel tick.
- Trackpad pinch mapped to a continuous factor, `clamp(exp(-deltaY / 100), 0.8, 1.25)`, from Scholar's reader, instead of pdf.js's 10% ticks.
- Gesture ends after 350 ms without input or immediately on scroll, click, key press, Ctrl/Cmd release or tab switch; toolbar and keyboard steps commit after 150 ms.
- Scroll updates suspended during the gesture.
- Geometric anchoring: the PDF point under the cursor is put back under the cursor after the commit (pdf.js drifted about 200 px on narrow pages).
- Canvas cap raised from 16 to 48 MP: true 2x render up to about 380% on Retina.
- Mid-pinch re-sharpen once the preview passes 2x or 0.5x.
- pdf.js's Ctrl+wheel handler bypassed, including its one-second zoom lockout after a scroll.
- `will-change: transform` during the gesture so Chrome does not re-rasterise the layer per frame.
- Verified with a synthetic 40-event pinch at Retina resolution: 61 fps, zero renders during a hesitating pinch and one at the end, final scale matches Scholar's formula, anchor point unchanged.

### Scrolling and rendering
- Look-ahead widened from one page to two ahead plus one behind, inside pdf.js's priority rules and 10-page cache.
- `bg/main/perf.js`: text layers built one per idle frame after scrolling settles; no render starts above 2500 px/s, one update when the scroll settles.

### Opening PDFs (`worker.js`)
- The original viewer used a blocking `webRequest` listener, which Manifest V3 forbids for sideloaded extensions, and read misspelt event fields, so PDFs never auto-opened. Replaced with `declarativeNetRequest` rules matched on response headers: PDF content types, generic binary types with a `.pdf` path, attachments named `.pdf`; GET only; downloads from the viewer allowed through.
- Permissions trimmed to `declarativeNetRequest`, `webNavigation`, `storage`, `contextMenus`; `webRequest` removed.
- Context menus recreated after `removeAll()`, ending the "duplicate id" errors.
- `file://` PDFs: handler field names fixed, listener registered synchronously so it wakes the service worker, errors shown instead of a blank page, "Allow access to file URLs" hint.
- `replace.js` re-encodes a raw `?file=` URL once, since redirect rules cannot percent-encode.
- Publisher pages that embed the PDF in a full-page frame (IEEE Xplore, Wiley, ProQuest, EBSCO) open in the viewer with the page as Referer.
- Download fallback in the viewer fetches to a blob instead of navigating the tab away.
- Verified navigations: `paper.pdf?x=1&y=2#page=3` keeps the full URL and lands on page 3; octet-stream `.pdf`; attachment with `.pdf` filename; HTML pages untouched; viewer download marker untouched.

### Packaging
- Manifest: `sandbox` entry for the loader page, `content_scripts` entry for the print helper on all URLs (exits immediately outside PDF frames).
- The store-only `_metadata` folder removed, since Chrome refuses to load unpacked extensions containing it.
