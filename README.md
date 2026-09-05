<div align="center">

<img src="icons/icon128.png" width="96" alt="Scholar PDF Viewer icon">

# Scholar PDF Viewer

**A port of pdf.js with in-text citations, built for speed.**

</div>

## What is this?

A Chrome extension that replaces the built-in PDF viewer with a pdf.js port tuned for reading papers. Click a citation in the text and the referenced paper appears in place, looked up on Google Scholar, with its abstract snippet, Cited by, Cite and Save. It is noticeably quicker and lighter than Chrome's own viewer or the Google Scholar PDF Reader: rendering is scheduled around what you are doing, zoom runs on the compositor, and heavy scanned or figure-dense PDFs stay smooth while you scroll and pinch.

<div align="center">

![Manifest V3](https://img.shields.io/badge/manifest-v3-4c8eda?style=flat-square)
![Chrome 128+](https://img.shields.io/badge/chrome-128%2B-34a853?style=flat-square)
![pdf.js](https://img.shields.io/badge/engine-pdf.js-d14836?style=flat-square)
![Unpacked](https://img.shields.io/badge/install-load%20unpacked-6f42c1?style=flat-square)

</div>

---

## What it does

- **In-text citation popups.** Click any `[12]` or `(Vaswani et al., 2017)` in a paper. The reference is looked up on Google Scholar and shown in place: title, authors, venue, snippet with *Show more*, plus *Cited by*, *Related*, *Versions* and full-text links.
- **Cite and Save.** *Cite* opens Scholar's formatted citations (MLA, APA, Chicago, BibTeX, EndNote, RefMan, RefWorks). *Save* adds the paper to your Scholar library, with labels, when you are signed in.
- **See in References.** Jumps to the matching entry in the bibliography.
- **Opens PDFs everywhere.** Direct links, download-style responses, `file://` files, and publisher pages that embed the PDF in a full-page frame (IEEE Xplore, Wiley, ProQuest, EBSCO).
- **Native printing.** Prints through Chrome's own PDF engine for vector output instead of rasterised pages.
- **Smooth zoom.** Trackpad pinch and wheel zoom are previewed on the compositor and rendered once the gesture ends, sharp at high zoom.
- **Built for heavy PDFs.** Scanned books and figure-dense papers scroll without stutter: page renders are not started while you fling, text layers are laid out in idle frames, and pinch zoom never re-rasterises the page mid-gesture.
- **Dark and light themes** with a neutral, readable palette for the popup in dark mode.

## Install

1. Clone or download this repository.
2. Open `chrome://extensions`, enable **Developer mode**, click **Load unpacked** and pick the repository folder.
3. Optional but recommended:
   - Turn on **Allow access to file URLs** on the extension card so local PDFs open in the viewer.
   - Sign in to [Google Scholar](https://scholar.google.com) in Chrome to enable *Save* in the citation popup.

Reload the extension from the same page after pulling changes.

## Using it

| Action | Where |
|---|---|
| Open the viewer with a sample PDF | Click the toolbar icon |
| Theme, rendering options, embedded PDF support | Right-click the toolbar icon |
| Custom CSS for the viewer | Extension options page |
| Open a link in the viewer | Right-click a link, *Open with Scholar PDF Viewer* |
| Copy a link to the current page of the PDF | Toolbar button in the viewer |

## Performance

The viewer is tuned so that the main thread does nothing during a gesture and renders only what you will actually look at:

- **Zoom on the compositor.** A pinch is previewed with a CSS transform and committed to pdf.js once, when the gesture ends. Stock pdf.js re-rendered every visible page on every wheel tick; here a pinch runs at 60 fps with a single render.
- **Continuous pinch.** Trackpad deltas map to a continuous factor (Scholar's formula) instead of 10% steps, with the point under your fingers held fixed.
- **Sharp at high zoom.** The canvas cap is raised from 16 to 48 MP, so pages render at true Retina resolution to roughly 380%, and a long pinch re-sharpens mid-gesture.
- **Idle-frame text layers.** Text layers are built one per frame after scrolling settles, removing the 100 to 300 ms stall that followed every zoom commit or page jump.
- **No renders mid-fling.** Fast scrolling does not start renders for pages that are about to leave; the pages you stop on render first.
- **Wider look-ahead.** Two pages ahead and one behind are pre-rendered, so page-down lands on painted pages.
- **Background citation analysis.** Scholar's analyzer runs in a worker at idle time, about 300 ms once per document.
- **Header-matched interception.** PDFs are caught with declarativeNetRequest rules, no runtime request listener.

The full list, with causes and measurements, is in [PERFORMANCE.md](PERFORMANCE.md).

## How it works

| Part | Role |
|---|---|
| `worker.js` | Service worker. Redirects PDF responses to the viewer with declarativeNetRequest rules matched on response headers, handles `file://` PDFs, embedded PDF frames, context menus and options. |
| `bg/helper/` | The pdf.js viewer and engine. |
| `bg/main/scholar-citations.js` | Citation analysis and the reference popup, transplanted from the Google Scholar PDF Reader. Scholar's analyzer worker and sandboxed loader run unchanged; the UI keeps Scholar's identifiers so it can be diffed against the original bundle. |
| `bg/main/nativeprint.js` | Vector printing through Chrome's built-in PDF viewer. |
| `bg/main/smooth.js` | Compositor-previewed zoom with a single render per gesture. |
| `bg/main/perf.js` | Render scheduling for heavy documents: text layers are built one per frame once scrolling settles, and no renders start mid-fling. |
| `bg/main/printscript.js` | Content script inside PDF frames: print handshake and embedded-PDF detection. |
| `bg/main/replace.js` | Theme wiring, viewer toolbar additions, URL normalisation. |
| `analyzer_worker_bin.js`, `pdf_loader-compiled.js`, `pdf_loader_iframe.html`, `bcmaps/` | Scholar's citation analyzer and its PDF loader. |

Scholar requests go straight from the viewer page to `scholar.google.com` with your existing cookies. Nothing is proxied through third parties.

## Layout

```
.
├── manifest.json
├── worker.js                 service worker
├── bg/
│   ├── helper/               pdf.js viewer (web/) and engine (build/)
│   └── main/                 viewer extensions: citations, print, zoom, theme
├── analyzer_worker_bin.js    Scholar citation analyzer
├── pdf_loader-compiled.js    Scholar PDF loader (sandboxed)
├── pdf_loader_iframe.html
├── bcmaps/                   CJK CMaps used by the loader
├── _locales/
└── icons/
```

## Credits

- [pdf.js](https://github.com/mozilla/pdf.js) by Mozilla, Apache License 2.0.
- Citation analysis, reference popup, cite and library dialogs, native printing and pinch zoom logic from the [Google Scholar PDF Reader](https://chromewebstore.google.com/detail/google-scholar-pdf-reader/dahenjhkoodjbpjheillcadbppiidmhp) by Google LLC, carried over under the Apache License 2.0 headers in its source.
- The viewer shell started from the open-source *PDF Viewer* Chrome extension.

This project is not affiliated with or endorsed by Google or Mozilla.
