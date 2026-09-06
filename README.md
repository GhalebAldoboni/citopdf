<p align="center">
  <img src="assets/banner.svg" alt="Scholar PDF Viewer Lite" width="100%">
</p>

<p align="center">
  <a href="https://github.com/GhalebAldoboni/scholar-pdf-viewer-lite/releases/latest"><img src="https://img.shields.io/github/v/release/GhalebAldoboni/scholar-pdf-viewer-lite?style=for-the-badge&color=6f42c1&label=release" alt="Latest release"></a>
  <img src="https://img.shields.io/badge/manifest-v3-4c8eda?style=for-the-badge" alt="Manifest V3">
  <img src="https://img.shields.io/badge/chrome-128%2B-34a853?style=for-the-badge" alt="Chrome 128+">
  <img src="https://img.shields.io/badge/engine-pdf.js-d14836?style=for-the-badge" alt="pdf.js">
  <img src="https://img.shields.io/badge/license-Apache--2.0-lightgrey?style=for-the-badge" alt="Apache 2.0">
  <a href="CHANGELOG.md"><img src="https://img.shields.io/badge/changelog-📜-1f6feb?style=for-the-badge" alt="Changelog"></a>
</p>

<br>

**Scholar PDF Viewer Lite** replaces Chrome's built-in PDF viewer with a port of pdf.js made for reading papers. Click any citation in the text and the referenced paper opens right there, looked up on Google Scholar: abstract snippet, *Cited by*, *Cite*, *Save to library*. Underneath, rendering is scheduled around what you are doing, so it stays quick and light on documents that make Chrome's viewer and the Scholar reader stutter, and it adapts itself to low-memory, few-core machines.

<br>

## Why not the others?

| | Chrome PDF viewer | Google Scholar PDF Reader | Stock pdf.js viewer | **Scholar PDF Viewer Lite** |
|---|:---:|:---:|:---:|:---:|
| In-text citation popups | – | ✓ | – | ✓ |
| Cite / Save to Scholar library | – | ✓ | – | ✓ |
| Renders with one engine (no second viewer running) | ✓ | – | ✓ | ✓ |
| 60 fps pinch zoom, one render per gesture | – | – | – | ✓ |
| Sharp at 300%+ on Retina | – | – | – | ✓ |
| Smooth on heavy scanned PDFs | – | – | – | ✓ |
| Adapts to weak devices (memory, cores) | – | – | – | ✓ |
| Off-screen pages cost nothing to scroll past | – | – | – | ✓ |
| Text layers only for pages in view | – | – | – | ✓ |
| Vector printing | ✓ | ✓ | – (150 dpi raster) | ✓ |
| Keeps the PDF's real URL in the address bar | ✓ | ✓ | – | ✓ |
| Opens publisher-embedded PDFs (IEEE, Wiley…) | – | ✓ | – | ✓ |
| Dark theme with readable popup | – | ✓ | – | ✓ |
| Night mode and AMOLED black for the pages, one click | – | – | – | ✓ |
| Open source | – | – | ✓ | ✓ |

<br>

## Features

<table>
<tr>
<td width="50%" valign="top">

### 📎 Citations, in place
Click `[12]` or `(Vaswani et al., 2017)`. Scholar's own analyzer finds every citation and reference in a background worker; the reference is resolved on Google Scholar and shown where you are: title, authors, venue, snippet with *Show more*, links to *Cited by*, *Related*, *Versions* and full text. Grouped citations like `[3, 7, 12]` page through with prev/next. *See in References* jumps to the bibliography entry.

</td>
<td width="50%" valign="top">

### 📚 Cite and Save
*Cite* opens Scholar's formatted citations (MLA, APA, Chicago) and BibTeX, EndNote, RefMan and RefWorks exports. *Save* files the paper into your Scholar library with labels. Uses your existing Scholar sign-in; nothing is proxied.

</td>
</tr>
<tr>
<td valign="top">

### ⚡ Zoom that keeps up
A pinch is previewed on the compositor and committed to pdf.js once, when your fingers stop. Continuous factor, fixed anchor point, sharp re-render past 2×. Stock pdf.js re-rendered every page on every tick.

</td>
<td valign="top">

### 🏋️ Light on weak devices
No renders start while you fling. Text layers are built in idle frames, only for pages in view. Off-screen pages skip layout and paint. On a 4 GB or dual-core machine the viewer keeps bitmaps small and pre-renders less, automatically.

</td>
</tr>
<tr>
<td valign="top">

### 🌐 Opens everywhere, keeps the URL
The address bar shows the PDF's own URL, exactly as with Chrome's viewer: the viewer lives inside the PDF page, the tab hash follows the page you are on, and Back, reload and bookmarks all keep working. Direct links, `file://` files, download links such as ACM's `?download=true` (the download header is rewritten so Chrome shows the page instead), and publisher pages that wrap the PDF in a frame (IEEE Xplore, Wiley, ProQuest, EBSCO) all open here. Add `#gsr=0` to a URL to see Chrome's viewer instead.

</td>
<td valign="top">

### 🌙 Night and AMOLED black, vector printing
A button beside *Copy PDF Link* (or Shift+N) cycles day → night → AMOLED black, showing a sun, moon or eclipse for the current state, and remembers your choice across tabs. Night inverts the pages to dark grey; AMOLED black sends paper to pure black and text to white while figures and colours keep night mode's exact tones, with a black toolbar around them. The idea and tint levels come from [DarkPDF](https://github.com/ArshSB/DarkPDF), applied as a per-page filter so scrolling and pinch stay at full speed and printing stays untouched. Printing goes through Chrome's own PDF engine for vector output; the pdf.js fallback runs at 300 dpi.

</td>
</tr>
</table>

<br>

## Quick start

Download the zip from the [latest release](https://github.com/GhalebAldoboni/scholar-pdf-viewer-lite/releases/latest) and unpack it, or clone:

```bash
git clone https://github.com/GhalebAldoboni/scholar-pdf-viewer-lite.git
```

1. Open `chrome://extensions`, turn on **Developer mode**, click **Load unpacked**, pick the folder.
2. On the extension card, enable **Allow access to file URLs** so local PDFs open here too.
3. Sign in to [Google Scholar](https://scholar.google.com) in Chrome to enable *Save*.

Open any PDF link. Citations turn blue a few seconds after the document loads.

<br>

## Performance

The rule is simple: the main thread does nothing during a gesture, and only pages you will actually look at get rendered.

- **First page before the download ends**: the PDF page relays byte ranges to pdf.js, so a 7 MB paper shows page 1 in 0.7 s on a 2 MB/s link instead of 4.5 s.
- **Zoom on the compositor**: CSS transform preview, one pdf.js render per gesture, 61 fps measured on a figure-heavy paper.
- **Continuous pinch**: trackpad deltas map to `exp(-Δy/100)` (Scholar's formula) instead of 10% steps; the point under your fingers stays put.
- **Sharp at high zoom**: canvas cap raised 16 → 48 MP, true Retina resolution to roughly 380%.
- **Idle-frame text layers**: built one per frame after scrolling settles, removing a 100 to 300 ms stall after every zoom or jump.
- **No renders mid-fling**: above 2500 px/s nothing starts; the page you stop on renders first.
- **Off-screen pages are free**: `content-visibility: auto` on pages outside the viewport, so the ten cached pages with their thousands of text spans cost no layout or paint.
- **Text layers only where you look**: pre-rendered pages get their canvas now and their text layer when they scroll into view.
- **Device profile**: on machines with 4 GB or less, or two cores, the canvas cap stays at 16 MP (192 MB less bitmap per page at high zoom), look-ahead drops to one page, and text layers wait a little longer. Rendering resolution is unchanged up to about 220% on Retina.
- **Background citation analysis**: Scholar's analyzer worker at idle time, about 300 ms once per document.

Every change, with its cause and measurement, is in **[PERFORMANCE.md](PERFORMANCE.md)**. Release-by-release detail is in **[CHANGELOG.md](CHANGELOG.md)**.

<br>

## Privacy

No analytics, no beacons, no update pings. The only network traffic the extension itself makes:

| When | Where | What |
|---|---|---|
| You open a PDF | the PDF's own server | The PDF page fetches the file for the viewer, with the same cookies and referrer the page itself would send. Nothing goes anywhere else. |
| You open a citation popup | `scholar.google.com` | The reference text, as a Scholar search, with your Scholar cookies. The first popup also asks Scholar who is signed in so *Save* can work. |
| You click *Cite* or *Save* | `scholar.google.com` | The paper's Scholar id, plus label changes for *Save*. |
| You print a web PDF | the PDF's own server | A 1-byte range request to confirm it is served as a PDF. |

Nothing is sent when you merely read a PDF. Scholar's usage counters are kept locally and never reported; the original viewer's Web Store rating prompt and update URL were removed.

## Changelog

Full history in **[CHANGELOG.md](CHANGELOG.md)**; every entry links to a release with the installable zip.

| Version | Date | Headline |
|---|---|---|
| [1.3.0](https://github.com/GhalebAldoboni/scholar-pdf-viewer-lite/releases/tag/v1.3.0) | 2026-09-06 | Night/day toggle for the rendered pages beside Copy PDF Link, with Shift+N; DarkPDF's logic as a per-canvas filter. |
| [1.2.4](https://github.com/GhalebAldoboni/scholar-pdf-viewer-lite/releases/tag/v1.2.4) | 2026-09-05 | pdf.js's worker is created while the viewer is still loading and handed to the first document, instead of being started on open. Parse wait… |
| [1.2.3](https://github.com/GhalebAldoboni/scholar-pdf-viewer-lite/releases/tag/v1.2.3) | 2026-09-05 | Faster first page for web PDFs. The relay now streams progressively and answers pdf.js byte-range requests from the page (Scholar's… |
| [1.2.2](https://github.com/GhalebAldoboni/scholar-pdf-viewer-lite/releases/tag/v1.2.2) | 2026-09-05 | Download-style PDF responses (`Content-Disposition: attachment`, or a binary type with a `.pdf` name) are no longer redirected to the… |
| [1.2.1](https://github.com/GhalebAldoboni/scholar-pdf-viewer-lite/releases/tag/v1.2.1) | 2026-09-05 | Fix: citation popups did not appear in the embedded viewer. Scholar's sandboxed loader page was not web-accessible, so Chrome refused to… |
| [1.2.0](https://github.com/GhalebAldoboni/scholar-pdf-viewer-lite/releases/tag/v1.2.0) | 2026-09-05 | The address bar shows the PDF's own URL, as with Chrome's viewer. Transplanted from the Scholar reader's `contentscript-compiled.js`:… |

## Under the hood

| Part | Role |
|---|---|
| `bg/main/embed.js`, `embedded.js` | Content script on Chrome's PDF page that hosts the viewer in a full-window frame under the PDF's own URL, relays the fetch, syncs title and `#page=` with the tab, and prints through the page (Scholar's `contentscript` mechanism). |
| `worker.js` | Service worker: rewrites download-style PDF responses to inline so Chrome shows them, context menus, options. |
| `bg/helper/` | pdf.js 2.7 viewer and engine. |
| `bg/main/scholar-citations.js` | Citation analysis and the reference popup, transplanted from the Google Scholar PDF Reader. Scholar's analyzer worker and sandboxed loader run unchanged; the UI keeps Scholar's identifiers so it diffs against the original bundle. |
| `bg/main/smooth.js` | Compositor zoom, continuous pinch, look-ahead rendering. |
| `bg/main/device.js` | Device profile: memory, cores, pixel ratio; picks the lite settings. |
| `bg/main/perf.js`, `perf.css` | Render scheduling: idle-frame, visible-first text layers, fling gating, off-screen page containment. |
| `bg/main/nativeprint.js` | Vector printing through Chrome's PDF engine. |
| `bg/main/printscript.js` | Content script inside PDF frames: print handshake, embedded-PDF detection. |
| `bg/main/replace.js` | Theme wiring, toolbar additions, URL normalisation. |
| `bg/main/night.js`, `night.css` | Day / night / AMOLED black for the rendered pages (DarkPDF's logic as a per-canvas filter; AMOLED uses an SVG tone curve), persisted in storage, Shift+N. |

<details>
<summary>Repository layout</summary>

```
.
├── manifest.json
├── worker.js                 service worker
├── bg/
│   ├── helper/               pdf.js viewer (web/) and engine (build/)
│   └── main/                 citations, zoom, scheduling, print, theme
├── analyzer_worker_bin.js    Scholar citation analyzer (Web Worker)
├── pdf_loader-compiled.js    Scholar PDF loader (sandboxed iframe)
├── pdf_loader_iframe.html
├── bcmaps/                   CJK CMaps for the loader
├── _locales/
├── icons/
└── assets/
```

</details>

<br>

## Credits

- [pdf.js](https://github.com/mozilla/pdf.js) by Mozilla, Apache License 2.0.
- Citation analysis, reference popup, Cite and library dialogs, native printing and pinch logic from the [Google Scholar PDF Reader](https://chromewebstore.google.com/detail/google-scholar-pdf-reader/dahenjhkoodjbpjheillcadbppiidmhp) by Google LLC, carried over under the Apache License 2.0 headers in its source.
- The viewer shell started from the open-source *PDF Viewer* Chrome extension.
- Night mode logic and tint levels from [DarkPDF](https://github.com/ArshSB/DarkPDF) by ArshSB, MIT License.

Not affiliated with or endorsed by Google or Mozilla.
