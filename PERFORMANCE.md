# Performance notes

Everything done to make this viewer faster than Chrome's built-in PDF viewer and the
Google Scholar PDF Reader, in the order it matters while reading. None of these
change what is rendered or at what resolution; they change *when* and *how often*.

Measurements below were taken on a Retina display with a figure-heavy 26-page paper
unless stated otherwise.

## Zoom

| Problem in stock pdf.js 2.7 | Fix (`bg/main/smooth.js`) | Effect |
|---|---|---|
| Every Ctrl+wheel tick re-renders all visible pages and rebuilds their text layers, cancelling the renders already running. A short pinch produced about 20 aborted renders and a dozen 100 to 200 ms main-thread stalls. | The gesture is previewed with a compositor transform of the pages container around the cursor. Nothing on the main thread runs per event. | Pinch runs at 61 fps in and out. |
| Trackpad pinches arrive as fractional Ctrl+wheel deltas that pdf.js rounds into 10% steps, so a pinch was a staircase of jumps, each with a full render. | Each event becomes a continuous factor, `clamp(exp(-deltaY / 100), 0.8, 1.25)`, the formula from Scholar's reader. | Zoom tracks the fingers proportionally. |
| A render per step. | One commit per gesture. A pinch ends after 350 ms without input, or immediately on scroll, click, key press, or releasing Ctrl/Cmd. Toolbar and keyboard steps commit after 150 ms. | A pinch that hesitated twice produced zero renders during the gesture and one at the end. |
| While previewing, pdf.js kept re-evaluating visible pages and starting renders it would cancel. | Scroll updates are suspended for the duration of the gesture. | No wasted renders during the gesture. |
| pdf.js's own zoom correction drifted by about 200 px on narrow pages. | Geometric anchoring: the PDF coordinate under the cursor is recorded before the commit and scrolled back under the cursor after it. | The point under the fingers does not move. |
| Page canvases are capped at 16 MP, so on a Retina screen anything past about 220% was rendered smaller and upscaled, permanently soft. | Cap raised to 48 MP. | True 2x render up to roughly 380%. At 331% a Letter page canvas is 5402 px wide instead of capped. |
| A long pinch stretches one bitmap the whole way and turns to mush. | Once the preview passes 2x (or 0.5x) the page is re-rendered mid-gesture and the pinch continues from the sharp result, as browsers do for their own pinch zoom. | One brief hitch per doubling instead of a soft image for the rest of the gesture. |
| Chrome re-rasterises the scaled layer (every canvas and text span) on each scale change. | `will-change: transform` on the pages container for the duration of the gesture keeps the raster and lets the compositor scale it. | Removes the per-frame raster cost on heavy pages. |
| pdf.js disables zoom for a second after a normal scroll. | Its Ctrl+wheel handler is bypassed entirely. | Zoom is always available. |

## Scrolling and rendering

| Problem | Fix | Effect |
|---|---|---|
| pdf.js pre-renders exactly one page beyond the visible ones, so a fast scroll or page-down lands on blank pages. | Look-ahead widened to two pages in the scroll direction plus one behind, inside pdf.js's own priority rules and 10-page cache (`smooth.js`). | Page-down lands on rendered pages. |
| Each page's text layer is measured and inserted synchronously the moment its canvas paints. After a zoom commit or a jump, several pages finish in the same frame and their text layers stack into one 100 to 300 ms stall. | Text layers are queued and built one per animation frame, only once scrolling and pinching have settled for 120 ms (`bg/main/perf.js`). Canvases are never delayed. | The stall after a zoom commit is gone; selection and find highlights appear a few frames later. |
| During a fling, every scroll frame starts renders for pages that are gone a few frames later. pdf.js pauses them once they lose priority, but the canvas allocation and worker kick-off are wasted and compete with scrolling. | Above 2500 px/s no new renders start. One update runs as soon as the scroll settles (`perf.js`). | The pages you stop on render immediately instead of queuing behind pages that flew past. |
| The citation analysis parses the whole PDF a second time. | It runs in Scholar's Web Worker with a sandboxed loader, scheduled with `requestIdleCallback` after the pages have loaded, and the loader is torn down afterwards so the second parsed copy is freed. | On a 26-page paper: 53 references and 65 citation groups found in about 4.5 s of background time, costing 303 ms of main-thread time in two tasks, never during scrolling. |
| The Scholar reader renders every page as a bitmap posted through its sandboxed iframe, which is why it feels slow. | The viewer keeps its own direct pdf.js rendering; Scholar's code is used only for analysis and the popup. | One rendering engine. |

## Loading

| Problem | Fix | Effect |
|---|---|---|
| The page relayed the whole file to the viewer before pdf.js saw a byte, so a 7 MB paper on a 2 MB/s link showed nothing for 4.5 s. Chrome's viewer fetches byte ranges and paints page 1 almost at once. | Scholar's range relay (`qa()`/`ra()` in `bg/main/embed.js`): the viewer feeds pdf.js a progressive `PDFDataRangeTransport`, the full stream arrives in the background, and pdf.js pulls the xref and first-page objects through `Range` requests made by the page (`bg/main/embedded.js`). Falls back to buffering when the server does not accept ranges or compresses the body. | First page at 0.7 s instead of 4.5 s on the same link, 21 range requests; the rest of the file keeps streaming for scrolling and download. |

| pdf.js starts its worker only when the document opens, so every load first waits for the 1 MB worker script to load and compile. | `bg/main/embedded.js` creates the worker as soon as pdf.js is parsed, while the rest of the viewer is still loading, and hands it to the first `open()`. | Parse wait after open drops from about 160 ms to 20 ms; first page of a local 7 MB paper about 70 ms sooner (530-580 ms from frame start in Chrome for Testing). |

## Weak devices

| Problem | Fix | Effect |
|---|---|---|
| pdf.js keeps up to ten pages alive around the viewport, each with a canvas and a text layer of hundreds to thousands of absolutely positioned spans. Every scroll frame lays out and paints all of them. | `content-visibility: auto` on pages outside the viewport (`bg/main/perf.css`), except a page hosting an open citation popup. | Scrolling costs only the pages in view; off-screen text layers are skipped by the browser. |
| Pages pre-rendered ahead of the viewport also got their text layer measured immediately. | Text layers are built visible-first: a pre-rendered page gets its canvas now and its text layer when it scrolls into view (`perf.js`). | Less main-thread work per scroll on text-dense documents. |
| A 48 MP canvas is 192 MB of bitmap. With several cached pages at high zoom a 4 GB machine swaps or the tab dies. | `device.js` marks machines with 4 GB or less, or two cores, as lite. On them the canvas cap stays at pdf.js's 16 MP, look-ahead drops to one page, fling gating starts at 1800 px/s and text layers wait 200 ms. | Same resolution up to about 220% on Retina (440% at 1x); far less memory beyond that. |
| Text layer insertions could trigger layout outside the page. | `contain: layout` on the text layer. | Layout stays local to the page. |

## Printing

| Problem | Fix (`bg/main/nativeprint.js`) | Effect |
|---|---|---|
| pdf.js prints by rasterising every page to a canvas at 150 dpi. | The PDF is handed to Chrome's built-in viewer in a hidden 1 px frame and that frame is printed, Scholar's approach. | Vector output. |
| When native printing is not possible (form edits, plugin disabled). | The pdf.js fallback runs at 300 dpi instead of 150. | Sharper raster fallback. |

## Opening PDFs

| Problem | Fix (`worker.js`) | Effect |
|---|---|---|
| The original viewer used a blocking `webRequest` listener, which Manifest V3 forbids for sideloaded extensions, and read misspelt event fields, so PDFs never auto-opened. | `declarativeNetRequest` rules matched on response headers rewrite download-style PDF responses (attachment, or a binary type with a `.pdf` name) to inline `application/pdf`, so Chrome shows its PDF page and the viewer embeds there under the real URL. No runtime listener, and the PDF is fetched by the page itself. | Download links such as ACM's `?download=true` open in place with the page's cookies and referrer. |
| Redirect rules cannot percent-encode the URL, so `?file=https://host/a.pdf?x=1&y=2` was cut at the first `&`. | The viewer re-encodes a raw `?file=` value once before pdf.js reads it (`bg/main/replace.js`). | Download endpoints with query strings open correctly. |
| The `file://` listener was registered inside an async callback, which does not wake a sleeping service worker. | Registered synchronously at top level; file access is checked per event. | Local PDFs open reliably. |
| Publisher pages that embed the PDF in a full-page frame (IEEE, Wiley, ProQuest, EBSCO) never trigger a top-frame rule. | The content script inside the PDF frame reports to the top page; a frame that fills the page, or shares a publisher family with it, is opened in the viewer with the page as Referer. | Publisher links open in the viewer. |
| Context menus were recreated on every service worker start without clearing, spamming "duplicate id" errors. | Menus are created after `removeAll()`. | Clean console. |
| The dead blocking listener still required the `webRequest` permission. | Permissions trimmed to `declarativeNetRequest`, `webNavigation`, `storage`, `contextMenus`. | Smaller permission prompt, no runtime request hooks. |

## Popup

| Problem | Fix | Effect |
|---|---|---|
| Scholar's result popup depends on its reader shell. | Scholar's own code is transplanted function for function (`scholar-citations.js`), so the analysis, popup, Cite and Save dialogs behave like the original without a second viewer running. | One rendering engine instead of two. |
| Links used `target=_top`, which navigated the PDF tab away. | Links open in a new tab. | The document stays put. |
