<p align="center">
  <img src="assets/banner.svg" alt="Cito PDF" width="100%">
</p>

<h1 align="center">Cito PDF</h1>

<p align="center"><strong>The instant PDF reader for research.</strong><br>
Papers stream in and open at once. Every citation pops up in place. It stays light on any machine.</p>

<p align="center">
  <a href="https://github.com/GhalebAldoboni/citopdf/releases/latest"><img src="https://img.shields.io/github/v/release/GhalebAldoboni/citopdf?style=for-the-badge&color=6f42c1&label=release" alt="Latest release"></a>
  <img src="https://img.shields.io/badge/manifest-v3-4c8eda?style=for-the-badge" alt="Manifest V3">
  <img src="https://img.shields.io/badge/chrome-128%2B-34a853?style=for-the-badge" alt="Chrome 128+">
  <img src="https://img.shields.io/badge/engine-pdf.js-d14836?style=for-the-badge" alt="pdf.js">
  <img src="https://img.shields.io/badge/license-Apache--2.0-lightgrey?style=for-the-badge" alt="Apache 2.0">
  <a href="CHANGELOG.md"><img src="https://img.shields.io/badge/changelog-📜-1f6feb?style=for-the-badge" alt="Changelog"></a>
</p>

<p align="center">
  <a href="#install"><b>Install</b></a> ·
  <a href="#why-it-is-a-game-changer">Why</a> ·
  <a href="#what-it-does">Features</a> ·
  <a href="#the-numbers">Numbers</a> ·
  <a href="#privacy">Privacy</a> ·
  <a href="PERFORMANCE.md">Engineering notes</a>
</p>

<br>

> *Cito* is Latin for **swiftly, at once**. Doctors still write *cito!* on a prescription to mean *immediately*. Say it aloud and you hear **cite**. That is the whole idea.

<br>

## Why it is a game changer

Every PDF reader makes you choose. Chrome's viewer is fast but knows nothing about papers. Google Scholar's reader knows papers but runs a second viewer on top of Chrome's and stutters on heavy files. Stock pdf.js is open but downloads the whole file before you see a page. **Cito PDF is the first reader that gives you all three at once**, in one lightweight extension:

<table>
<tr>
<td width="33%" valign="top" align="center">
<h3>⚡ Instant</h3>
The first page appears while the file is still downloading. A 200 MB scan shows page 1 in <b>0.35 s</b>; a 7 MB paper on a slow link in <b>0.55 s</b> instead of 4.5 s. The rest streams in behind you and the file is yours to keep.
</td>
<td width="33%" valign="top" align="center">
<h3>📎 Cited</h3>
Click <code>[12]</code> or <code>(Vaswani et al., 2017)</code> and the paper opens right there: title, authors, venue, abstract snippet, <i>Cited by</i>, <i>Cite</i>, <i>Save to library</i>. A 39-page paper with <b>276 references</b> is fully linked <b>3 s</b> after it opens.
</td>
<td width="33%" valign="top" align="center">
<h3>🪶 Light</h3>
<b>61 fps</b> pinch zoom, one render per gesture, nothing rendered while you fling, off-screen pages cost nothing. On a 4 GB or dual-core laptop it tunes itself down and keeps scrolling smooth.
</td>
</tr>
</table>

<br>

## What you get, side by side

| | Chrome PDF viewer | Google Scholar PDF Reader | Stock pdf.js viewer | **Cito PDF** |
|---|:---:|:---:|:---:|:---:|
| First page before the download ends (streaming) | ✓ | – | – | ✓ |
| Opens a 1 GB PDF instantly, pages first, rest in the background | ✓ | – | – | ✓ |
| In-text citation popups | – | ✓ | – | ✓ |
| Cite / Save to Scholar library | – | ✓ | – | ✓ |
| Citation popups on streamed and local files | – | – | – | ✓ |
| One rendering engine (no second viewer running) | ✓ | – | ✓ | ✓ |
| 60 fps pinch zoom, one render per gesture | – | – | – | ✓ |
| Sharp at 300%+ on Retina | – | – | – | ✓ |
| Smooth on heavy scanned PDFs | – | – | – | ✓ |
| Adapts to weak devices (memory, cores) | – | – | – | ✓ |
| Releases memory when the tab is idle | – | – | – | ✓ |
| Vector printing | ✓ | ✓ | – (150 dpi raster) | ✓ |
| Keeps the PDF's real URL in the address bar | ✓ | ✓ | – | ✓ |
| Opens publisher-embedded PDFs (IEEE, Wiley…) | – | ✓ | – | ✓ |
| Night mode and AMOLED black, one click | – | – | – | ✓ |
| Open source | – | – | ✓ | ✓ |

<br>

## Install

Download the zip from the [latest release](https://github.com/GhalebAldoboni/citopdf/releases/latest) and unpack it, or clone:

```bash
git clone https://github.com/GhalebAldoboni/citopdf.git
```

1. Open `chrome://extensions`, turn on **Developer mode**, click **Load unpacked**, pick the folder.
2. On the extension card, enable **Allow access to file URLs** so local PDFs open here too.
3. Sign in to [Google Scholar](https://scholar.google.com) in Chrome to enable *Save*.

Open any PDF link. Citations turn blue a few seconds after the document loads.

<br>

## What it does

<table>
<tr>
<td width="50%" valign="top">

### 📎 Citations, in place
Click `[12]` or `(Vaswani et al., 2017)`. Scholar's own analyzer finds every citation and reference in a background worker; the reference is resolved on Google Scholar and shown where you are: title, authors, venue, snippet with *Show more*, links to *Cited by*, *Related*, *Versions* and full text. Grouped citations like `[3, 7, 12]` page through with prev/next. *See in References* jumps to the bibliography entry. Journal issues that bundle several papers are split first, so each paper's citations resolve against its own reference list.

</td>
<td width="50%" valign="top">

### 📚 Cite and Save
*Cite* opens Scholar's formatted citations (MLA, APA, Chicago) and BibTeX, EndNote, RefMan and RefWorks exports. *Save* files the paper into your Scholar library with labels. Uses your existing Scholar sign-in; nothing is proxied.

</td>
</tr>
<tr>
<td valign="top">

### 🌊 Streaming, not downloading
The first request is a one-megabyte range. If the server honours it, pdf.js reads by range: the pages you look at first, then the rest in the background, one chunk at a time, until the file is complete and fully local. Local files are read the same way. Nothing is fetched twice, and the whole paper stays in memory while you read.

</td>
<td valign="top">

### ⚡ Zoom that keeps up
A pinch is previewed on the compositor and committed to pdf.js once, when your fingers stop. Continuous factor, fixed anchor point, sharp re-render past 2×. No spinners flicker over pages that are already on screen.

</td>
</tr>
<tr>
<td valign="top">

### 🪶 Light on weak devices
No renders start while you fling. Text layers are built in idle frames, only for pages in view. Off-screen pages skip layout and paint. On a 4 GB or dual-core machine the viewer keeps bitmaps small and pre-renders less, automatically. After five minutes in a background tab it releases every rendered page but the current one, and re-renders on return.

</td>
<td valign="top">

### 🌐 Opens everywhere, keeps the URL
The address bar shows the PDF's own URL, exactly as with Chrome's viewer: the viewer lives inside the PDF page, the tab hash follows the page you are on, and Back, reload and bookmarks all keep working. Direct links, `file://` files, download links such as ACM's `?download=true`, and publisher pages that wrap the PDF in a frame (IEEE Xplore, Wiley, ProQuest, EBSCO) all open here. Add `#gsr=0` to a URL to see Chrome's viewer instead.

</td>
</tr>
<tr>
<td valign="top">

### 🌙 Night and AMOLED black
A button beside *Copy PDF Link* (or Shift+N) cycles day → night → AMOLED black and remembers your choice across tabs. Night inverts the pages to dark grey; AMOLED black sends paper to pure black and text to white while figures keep night mode's exact tones. Applied as a per-page filter, so scrolling and pinch stay at full speed.

</td>
<td valign="top">

### 🖨 Vector printing
Printing goes through Chrome's own PDF engine, so text stays text and lines stay lines. The pdf.js fallback runs at 300 dpi.

</td>
</tr>
</table>

<br>

## The numbers

All measured in Chrome for Testing with the unpacked extension. Method, cause and fix for each are in **[PERFORMANCE.md](PERFORMANCE.md)**.

| What | Before | Cito PDF |
|---|---:|---:|
| 200 MB PDF, time to page 1 over HTTP | whole file first | **0.35 s** |
| 7 MB paper on a 2 MB/s link, time to page 1 | 4.5 s | **0.55 s** |
| Pinch zoom on a figure-heavy paper | ~20 aborted renders, 100 to 200 ms stalls | **61 fps**, one render |
| First page of a local 7 MB paper | 540 ms | **410 ms** |
| 39-page paper, 276 references, citations linked | 7.9 s | **3.1 s** after open |
| Tab hidden 5 minutes, rendered pages held | all | **1** (JS heap 90 MB → 26 MB) |

<br>

## Frequently asked questions

**What is Cito PDF?** Cito PDF is a free, open-source Chrome extension that replaces Chrome's built-in PDF viewer with a research-focused reader built on pdf.js. It streams PDFs so the first page opens before the download finishes, shows a Google Scholar popup for every in-text citation, and is optimised to stay fast on low-memory and dual-core machines.

**Which Chrome extension shows citation popups inside a PDF?** Cito PDF. Click a citation such as `[12]` or `(Vaswani et al., 2017)` and the referenced paper appears in place with its abstract snippet, *Cited by* count, *Cite* formats (APA, MLA, Chicago, BibTeX) and *Save to library*. The analysis uses the Google Scholar PDF Reader's own engine, transplanted into the viewer.

**What is the fastest way to open large PDFs in Chrome?** Cito PDF opens a 200 MB PDF to its first page in 0.35 s by requesting byte ranges instead of the whole file, then downloads the rest in the background. A 7 MB paper on a 2 MB/s connection shows page 1 in 0.55 s instead of 4.5 s.

**Is there a PDF reader for Chrome that works well on old or weak laptops?** Yes. Cito PDF detects low memory and few cores, limits bitmap sizes, renders nothing during a fling, builds text layers only for visible pages, and releases rendered pages after the tab has been idle for five minutes.

**How is Cito PDF different from the Google Scholar PDF Reader?** Both show citation popups. The Scholar reader runs a second viewer on top of Chrome's and buffers the whole file first; Cito PDF renders with one engine, streams the file, keeps the PDF's real URL in the address bar, adds night and AMOLED modes, vector printing, and is open source under Apache 2.0.

**Does Cito PDF have a dark mode for PDFs?** Yes: day, night (inverted grey) and AMOLED black (pure black paper, white text, figures keep their tones), toggled with one button or Shift+N.

**Does Cito PDF track me?** No. There are no analytics, beacons or update pings. The only requests go to the PDF's own server and, when you open a citation popup, to scholar.google.com with your own Scholar session.

**Does it work with IEEE, ACM, Wiley, arXiv and local files?** Yes. Direct links, `?download=true` links, publisher pages that embed the PDF in a frame, and `file://` PDFs all open in Cito PDF, with citation popups on each.

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

<br>

## Why this exists

I am a researcher who deals with a huge number of papers and PDFs every day. I built this extension to solve my own problems with reading them, to ease my work, and decided to share it with the community.

<br>

## Changelog

Full history in **[CHANGELOG.md](CHANGELOG.md)**; every entry links to a release with the installable zip.

| Version | Date | Headline |
|---|---|---|
| [1.6.0](https://github.com/GhalebAldoboni/citopdf/releases/tag/v1.6.0) | 2026-09-07 | Renamed to Cito PDF. |
| [1.5.2](https://github.com/GhalebAldoboni/citopdf/releases/tag/v1.5.2) | 2026-09-06 | Citation popups on ranged loads (publisher URLs, local files); rendered pages released after five minutes hidden. |
| [1.5.1](https://github.com/GhalebAldoboni/citopdf/releases/tag/v1.5.1) | 2026-09-06 | No page spinners while zooming, rotating or resizing. |
| [1.5.0](https://github.com/GhalebAldoboni/citopdf/releases/tag/v1.5.0) | 2026-09-06 | pdf.js runs in its real worker; per-paper citation analysis for journal issues; analysis cap raised to 1 GB. |
| [1.4.1](https://github.com/GhalebAldoboni/citopdf/releases/tag/v1.4.1) | 2026-09-06 | Big files finish downloading in the background after the first pages show. |
| [1.4.0](https://github.com/GhalebAldoboni/citopdf/releases/tag/v1.4.0) | 2026-09-06 | Huge files open instantly: range-only loading over HTTP and for local files. |
| [1.3.1](https://github.com/GhalebAldoboni/citopdf/releases/tag/v1.3.1) | 2026-09-06 | AMOLED black with night mode's exact figure tones. |
| [1.3.0](https://github.com/GhalebAldoboni/citopdf/releases/tag/v1.3.0) | 2026-09-06 | Night/day toggle beside Copy PDF Link, with Shift+N. |
| [1.2.0](https://github.com/GhalebAldoboni/citopdf/releases/tag/v1.2.0) | 2026-09-05 | The address bar shows the PDF's own URL, as with Chrome's viewer. |

<br>

## Under the hood

| Part | Role |
|---|---|
| `bg/main/embed.js`, `embedded.js` | Content script on Chrome's PDF page that hosts the viewer in a full-window frame under the PDF's own URL, relays ranged fetches, syncs title and `#page=` with the tab, and prints through the page (Scholar's `contentscript` mechanism). |
| `worker.js` | Service worker: rewrites download-style PDF responses to inline so Chrome shows them, context menus, options. |
| `bg/helper/` | pdf.js 2.7 viewer and engine. |
| `bg/main/scholar-citations.js` | Citation analysis, per-paper segmentation and the reference popup, transplanted from the Google Scholar PDF Reader. Scholar's analyzer worker and sandboxed loader run unchanged; the UI keeps Scholar's identifiers so it diffs against the original bundle. |
| `bg/main/smooth.js` | Compositor zoom, continuous pinch, look-ahead rendering. |
| `bg/main/device.js` | Device profile: memory, cores, pixel ratio; picks the lite settings. |
| `bg/main/perf.js`, `perf.css` | Render scheduling: idle-frame, visible-first text layers, fling gating, off-screen page containment, idle-tab memory release. |
| `bg/main/nativeprint.js` | Vector printing through Chrome's PDF engine. |
| `bg/main/printscript.js` | Content script inside PDF frames: print handshake, embedded-PDF detection. |
| `bg/main/replace.js` | Theme wiring, toolbar additions, URL normalisation. |
| `bg/main/night.js`, `night.css` | Day / night / AMOLED black for the rendered pages, persisted in storage, Shift+N. |

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
