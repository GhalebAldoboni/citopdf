/*
 * In-text citation popups, transplanted from the Google Scholar PDF Reader
 * extension.
 *
 * What runs here is Scholar's own engine, not a re-implementation:
 *   - /analyzer_worker_bin.js   Scholar's citation/reference analyzer (verbatim,
 *                               except its two `$p("a", ...)` result posts emit
 *                               the Article proto as jspb JSON instead of binary
 *                               so no protobuf runtime is needed on this side).
 *   - /pdf_loader_iframe.html   Scholar's sandboxed pdf.js loader that feeds the
 *     /pdf_loader-compiled.js   analyzer page text/annotations/renders in the
 *     /pdf.min.js, /bcmaps      proto format it expects (verbatim).
 *   - This file: the glue and UI lifted from reader-compiled.js —
 *       LoaderHost   = class Pi + Mi/Ki/Oi   (loader iframe <-> analyzer bridge)
 *       startWorker  = Xq                    (worker bootstrap)
 *       installArticle/renderPageLinks = bs + No (citation link overlays)
 *       Af, M, N, O, P, pf, R, T, Lf, V, W, fh  (DOM helpers)
 *       Wi/Ti/Ui/Zi/Yi/aj/Vi/Xi              (popover stack)
 *       Si/Qi/Ri, lj/rj + cj..qj             (dialog widget)
 *       gp/hp/pp/qp/ip/mp/jp/lp/zp/Ap/Bp     (reference popup)
 *     Identifiers keep their Closure-minified names so the code can be diffed
 *     against Scholar's bundle. Only the Scholar-network parts of the popup
 *     (search results, save/cite) are omitted; the popup shows the reference
 *     text found in the PDF plus "See in References", which is exactly
 *     Scholar's offline/fallback rendering.
 */
(() => {
  "use strict";

  // _locales/en/messages.json entries used by the popup and its dialogs.
  const MSG = {
    59: "Cite", 64: "Save", 111: "The system can't perform the operation now. Try again later.",
    535: "Search Scholar", 551: "Remove article", 625: "Loading...", 644: "Done", 732: "My library",
    924: "Label as:", 1010: "Create new", 1109: "No results for this search.", 1441: "Previous", 1442: "Next",
    1462: "Close", 1617: "Search Google", 1620: "There was an error retrieving the results. Please try again later.",
    1621: "Searching on Scholar...", 1628: "Show more", 1629: "Show less", 1631: "Saved to $1My library$2",
    1632: "Saving to My library...", 1715: "See in References",
    1716: "To enable saving to your Scholar library, expand the PDF to full screen.", 1717: "Expand", 1718: "Not now",
  };
  const i18n = {
    getMessage: (id, subs) => {
      if (String(id).startsWith("@@")) { try { return chrome.i18n.getMessage(id) || "en"; } catch (e) { return "en"; } }
      let m = MSG[id] || "";
      subs && subs.forEach((v, i) => { m = m.split("$" + (i + 1)).join(v); });
      return m;
    },
  };

  // ---------------------------------------------------------------------------
  // jspb JSON-array proto accessors. Field n lives at index n-1; fields past the
  // pivot live in a trailing object keyed by field number.
  // ---------------------------------------------------------------------------
  function fld(m, n) {
    if (!Array.isArray(m)) return undefined;
    let v = m[n - 1];
    if (v == null) {
      const last = m[m.length - 1];
      if (last && typeof last === "object" && !Array.isArray(last)) v = last[n];
    }
    return v == null ? undefined : v;
  }
  const A = (m, n) => { const v = fld(m, n); return Array.isArray(v) ? v : []; };
  const C = (m, n) => { const v = fld(m, n); return v == null ? 0 : Number(v); };
  const E = C;
  const F = (m, n) => { const v = fld(m, n); return v == null ? "" : String(v); };
  const Md = (m, n) => A(m, n).map(Number);
  const has = (m, n) => fld(m, n) != null;

  // ---------------------------------------------------------------------------
  // DOM helpers (reader-compiled.js)
  // ---------------------------------------------------------------------------
  const K = { j: "DIV" }, L = { j: "SPAN" }, Ue = { j: "A" }, Ve = { j: "BUTTON" }, $e = { j: "IMG" }, af = { j: "INPUT" };
  function M(a = null) {
    a = a || document.body;
    return (a ? window.getComputedStyle(a, null) : null).direction == "rtl";
  }
  function N(a) { return document.createElement(a.j); }
  function O(a, b) { a = N(a); a.className = b; return a; }
  function P(a, b) { const c = b.length; for (let d = 0; d < c; d++) a.appendChild(b[d]); }
  function pf(a) { for (; a.firstChild;) a.removeChild(a.firstChild); }
  function R(a, b, c) { return Math.max(b, Math.min(c, a)); }
  function T(a) { a.preventDefault(); a.stopPropagation(); }
  function Lf(a, b, c, d, e) { return d + ((R(a, b, c) - b) / (c - b)) * (e - d); }
  function fh(a, b = "") {
    const c = N(K);
    c.innerHTML = a;
    a = c.firstElementChild;
    if (!a || a.tagName.toLowerCase() !== "svg") return null;
    b && a.setAttribute("class", b);
    return a;
  }
  const yf = ["http:", "https:", "ftp:", "file:", "mailto:"];
  function Qf(a) { return yf.some((b) => a.toLowerCase().startsWith(b)); }
  function V(a) {
    const b = O(Ue, a.className || "");
    let c = a.href && Qf(a.href) ? a.href : "#";
    b.href = c;
    // Scholar uses _top because its reader runs in a frame; here links leave the PDF, so open a new tab.
    a.href && ((b.target = "_blank"), (b.rel = "noopener"));
    (c = fh(a.oa || "", "gsr-prefix-svg")) && b.append(c);
    a.label && (typeof a.label === "string" ? ((c = O(L, "gsr-lbl")), (c.textContent = a.label), b.append(c)) : b.append(a.label));
    (a = fh(a.tc || "", "gsr-suffix-svg " + (a.fe || ""))) && b.append(a);
    return b;
  }
  function Fh(a, b) { a = O(Ve, a); a.innerHTML = b; return a; }
  function Gh(a, b) {
    const { cd: c = !1, bd: d = !1, ad: e = !0, ba: f = "" } = b;
    b = O(L, `gsr-btn-tp ${c ? "gsr-btn-tp-start" : "gsr-btn-tp-bottom"} ${d ? "gsr-btn-tp-ld" : "gsr-btn-tp-sd"} ${e ? "gsr-btn-tp-dir-start" : "gsr-btn-tp-dir-end"} ${f}`);
    b.textContent = a;
    return b;
  }
  function Hh(a, b, c = {}) { b && ((c = Gh(b, c)), a.appendChild(c), a.setAttribute("aria-label", b)); }
  function W(a, b, c = {}) {
    const e = c.ba != null ? c.ba : "";
    a = Fh(`gsr-flat-btn ${e}`, a);
    Hh(a, b, c.ke || {});
    return a;
  }
  // Position an element over a PdfBoundingBox [left, right, top, bottom] (pdf units).
  function Af(a, b, c) {
    const [d, e] = a.convertToViewportPoint(E(b, 1), E(b, 3)),
      [f, g] = a.convertToViewportPoint(E(b, 2), E(b, 4));
    a = c.style;
    a.top = Math.floor(Math.min(e, g)) + "px";
    a.left = Math.floor(Math.min(d, f)) + "px";
    a.width = Math.floor(Math.abs(f - d)) + "px";
    a.height = Math.floor(Math.abs(g - e)) + "px";
  }

  // ---------------------------------------------------------------------------
  // Popover stack (reader-compiled.js: Wi, Ti, Ui, Zi, Yi, aj, Vi, Xi)
  // ---------------------------------------------------------------------------
  const Wi = [];
  function Zi(a) { return Wi.findIndex((b) => b.element === a); }
  function Ui(a) { return a && a.closest ? Zi(a.closest(".gsr-popover")) + 1 : 0; }
  function Yi(a) { (a = Ui(a)) && Vi(a - 1, !1); }
  function Xi() {
    const a = Wi.length;
    for (let b = 0; b < a; ++b) Wi[b].element.classList.toggle("gsr-enable-pointer-events", b === a - 1);
    const r = document.querySelector(".gsr-root");
    r && r.classList.toggle("gsr-disable-pointer-events", a > 0);
  }
  function aj(a = !1) { const b = Wi.pop(); b && b.Hd(a); Xi(); }
  function Vi(a, b = !1) { for (; Wi.length > a;) aj(b || Wi.length > a + 1); }
  function Ti(a, b = {}) {
    const c = document.activeElement, d = Ui(c), e = Ui(a);
    (e > 0 && e <= d) ||
      (e === d + 1
        ? Vi(d + 1)
        : (Vi(d, !0),
          a.classList.add("gsr-vis"),
          Wi.push({
            element: a,
            dc: b.dc,
            Pd: !!b.qc,
            Hd: (f) => {
              f || ((f = b.lf || c) && f.focus({ preventScroll: !0 }));
              a.classList.remove("gsr-vis");
              a.classList.remove("gsr-enable-pointer-events");
              (f = b.Ea) && f();
            },
          }),
          (b.Zb) && b.Zb(),
          Xi()),
      (b.Sc || a).focus({ preventScroll: !0 }));
  }
  document.addEventListener("focus", (a) => {
    let b = Wi.length;
    if (b)
      for (a = Ui(a.target); a < b;) {
        b = Wi[b - 1];
        if (b.dc) { b.dc.focus(); break; }
        aj();
        b = Wi.length;
      }
  }, !0);
  document.addEventListener("click", (a) => { const b = Wi.length; b && Ui(a.target) < b && aj(); });
  document.addEventListener("keydown", (a) => { a.key === "Escape" && aj(); });

  // ---------------------------------------------------------------------------
  // Dialog widget (reader-compiled.js: Si, Qi, Ri, lj, rj, cj, dj, fj, gj, hj,
  // ij, jj, kj, ej, oj, nj, mj, qj, pj)
  // ---------------------------------------------------------------------------
  const Qi = function (a) {
      a.B = a.j.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 500, easing: "ease", fill: "forwards" });
      const b = M(),
        c = [
          { transform: `translateX(${b ? "130%" : "-130%"}) scaleX(1)` },
          { transform: `translateX(${b ? "-110%" : "110%"}) scaleX(0.05)` },
        ];
      a.A = a.D.animate(
        [{ transform: `translateX(${b ? "70%" : "-70%"}) scaleX(0.05)` }, { transform: `translateX(${b ? "-120%" : "120%"}) scaleX(1)` }],
        { duration: 2e3, iterations: Infinity },
      );
      a.v = a.C.animate(c, { duration: 2e3, iterations: Infinity, delay: 600 });
    },
    Ri = function (a) {
      a.B && a.B.cancel(); a.A && a.A.cancel(); a.v && a.v.cancel();
      a.B = null; a.A = null; a.v = null;
    },
    Si = class {
      constructor() {
        this.j = O(K, "gsr-dialog-slider");
        this.B = null;
        this.D = O(K, "gsr-dialog-slider-inc");
        this.A = null;
        this.C = O(K, "gsr-dialog-slider-dec");
        this.v = null;
        P(this.j, [this.D, this.C]);
      }
    };
  const cj = function (a, b) {
      if (b) {
        const c = O(K, "gsr-dialog-header-content"),
          d = W(
            '<svg viewBox="0 0 21 21">\n    <path d="M16.6 5.6L15.3 4.3L10.5 9.2L5.6 4.3L4.3 5.6L9.2 10.5L4.3 15.3\n    L5.6 16.6L10.5 11.7L15.3 16.6L16.6 15.3L11.7 10.5L16.6 5.6Z"/></svg>',
            "",
            { ba: "gsr-dialog-close" },
          );
        d.setAttribute("aria-label", a.S.getMessage("1462"));
        c.appendChild(b);
        P(a.K, [c, d]);
        d.addEventListener("click", (e) => { T(e); a.close(); });
      }
      P(a.A, [a.D.j, a.G]);
      a.N && a.C.appendChild(a.N);
      P(a.j, [a.K, a.A, a.C]);
    },
    dj = function (a) { clearTimeout(a.J); a.J = 0; },
    fj = function (a, b) {
      const c = window.innerHeight - a.A.getBoundingClientRect().top,
        d = a.A.offsetHeight,
        e = Math.min(d, c);
      a.G.replaceWith(b);
      a.G = b;
      if (Zi(a.j) >= 0) {
        b = a.A.offsetHeight;
        const c2 = Math.min(b, c);
        const f = Math.abs(c2 - e),
          g = Lf(f, 25, 600, 85, 200);
        c2 > e || (a.A.style.height = e + "px");
        ej(a, b - d, f, g, () => { a.A.style.removeProperty("height"); });
      }
    },
    gj = function (a, b) {
      if (Zi(a.j) >= 0)
        if (b)
          (a.j.classList.add("gsr-loading"),
            dj(a),
            Ri(a.D),
            (a.B = null),
            (a.J = setTimeout(() => {
              dj(a);
              Qi(a.D);
              a.B = new Promise((c) => setTimeout(c, 500));
            }, 200)));
        else if (a.J) (a.j.classList.remove("gsr-loading"), dj(a));
        else if (a.B) {
          const c = a.B;
          c.then(() => {
            c === a.B &&
              (a.j.classList.remove("gsr-loading"),
              Ri(a.D),
              (a.B = null),
              a.H && fj(a, a.H),
              (a.H = null),
              a.F && a.C.replaceChildren(a.F),
              (a.F = null));
          });
        }
    },
    hj = function (a, b) { a.B ? (a.H = b) : fj(a, b); },
    ij = function (a) { a.C.replaceChildren(); a.F = null; },
    jj = function (a, b) { a.I.innerHTML = b; hj(a, a.I); },
    kj = function (a, b) {
      const c = { ...b }, d = b.Ea;
      c.Ea = () => {
        dj(a);
        Ri(a.D);
        a.B = null;
        a.j.classList.remove("gsr-loading");
        a.I.innerHTML = "";
        d && d();
      };
      Ti(a.j, c);
    },
    ej = function (a, b, c, d, e) {
      const f = b > 0, g = f ? -b : 0, h = f ? g + c : -c;
      c = [{ transform: `translateY(${g}px)` }, { transform: `translateY(${h}px)` }];
      const g2 = [{ transform: `translateY(${-g}px)` }, { transform: `translateY(${-h}px)` }];
      a.A.style.overflow = "hidden";
      a.A.animate(c, d).finished.then(() => { a.A.style.removeProperty("overflow"); e && e(); });
      a.G.animate(g2, d);
      a.C.animate(c, d);
      a.O &&
        ((b = Math.abs(b) / 2), a.j.animate([{ transform: `translateY(${f ? b : 0}px)` }, { transform: `translateY(${f ? 0 : b}px)` }], d));
    },
    lj = class {
      constructor(a, b, c = {}) {
        this.S = a;
        this.O = b;
        this.j = O(K, "gsr-dialog gsr-popover " + (c.ba || ""));
        this.j.tabIndex = -1;
        this.K = O(K, "gsr-dialog-header");
        this.A = O(K, "gsr-dialog-body");
        this.I = O(K, "gsr-dialog-ph");
        this.G = c.Ra || this.I;
        this.F = this.H = null;
        this.C = O(K, "gsr-dialog-footer");
        this.N = c.ib || null;
        this.D = new Si();
        this.J = 0;
        this.B = null;
        cj(this, c.Ga);
      }
      close() { Yi(this.j); }
    };
  const oj = function (a, b, c) {
      return {
        dc: a.j,
        qc: b === void 0 ? !0 : b,
        Zb: () => { (a.v !== 0 && a.v !== 3) || mj(!0); nj(a, a.v); },
        Ea: () => { (a.v !== 0 && a.v !== 3) || mj(!1); c && c(); },
      };
    },
    nj = function (a, b) { a.A.style.maxHeight = Zi(a.j) >= 0 && b !== 2 ? pj(a) + "px" : ""; },
    mj = function (a) { const d = document.querySelector(".gsr-dialogs"); d && d.classList.toggle("gsr-vis", a); },
    qj = function (a, b, c) {
      a.v = b;
      a.O = b === 0;
      c.appendChild(a.j);
      b = b === 0 || b === 3;
      Zi(a.j) >= 0 && (mj(b), a.j.contains(document.activeElement) || a.j.focus({ preventScroll: !0 }));
    },
    pj = function (a) {
      let b = window.innerHeight - a.K.offsetHeight - a.C.offsetHeight;
      if (a.v === 0) b -= 32;
      else if (a.v === 3) ((a = a.j.getBoundingClientRect()), (b -= 2 * a.top));
      else if (a.v === 1 || a.v === 4) ((a = a.j.getBoundingClientRect()), (b -= 16 + a.top));
      return b;
    },
    rj = class extends lj {
      constructor(a, b, c = {}) {
        super(a, b === 0, { ba: c.ba, Ga: c.Ga, Ra: c.Ra, ib: c.ib });
        this.v = b;
        this.R = oj(this, c.qc, c.Ea);
        window.addEventListener("resize", () => { nj(this, this.v); });
      }
      open() { kj(this, this.R); }
    };

  // ---------------------------------------------------------------------------
  // Viewer adapters. Scholar's reader object (a.D) exposes a scroll container
  // (.v) and page navigation (Po/Uo); here they map onto pdf.js.
  // ---------------------------------------------------------------------------
  // Doubles as Scholar's reader object for the popup: J i18n, W network client,
  // C account state, A usage counters, ka library features on, ma/lc/yc dialogs.
  const viewer = {
    J: i18n,
    W: null,
    C: { Da: -1, fa: "", ua: "", email: "", jd: "" },
    A: null,
    V: !1,
    ka: !0,
    La: 0,
    ma: null,
    lc: null,
    yc: null,
    Ob: null,
    get v() { return document.getElementById("viewerContainer"); },
  };
  // Po(a, page, x, y, 0, 0, 1): scroll so pdf point (x, y) of page sits at the top-left.
  function Po(a, b, c, d) {
    const app = window.PDFViewerApplication;
    if (!app || !app.pdfViewer) return;
    app.pdfViewer.scrollPageIntoView({ pageNumber: b + 1, destArray: [null, { name: "XYZ" }, c, d, null] });
  }
  // Uo(a, dx, dy, behavior)
  function Uo(a, b, c, d) {
    const s = a.v;
    s && s.scrollBy({ left: b, top: c, behavior: d });
  }

  // ---------------------------------------------------------------------------
  // Scholar network client and account (reader-compiled.js: zg, Ie, Je, Ff, Hf,
  // Gf, Rf, X, Th, ql, S, Pr). Requests carry the browser's Scholar cookies.
  // gsr_login returns the signed-in user id (C.fa) and XSRF token (C.ua) that
  // Save needs; without them Save opens the sign-in flow (Hm).
  // ---------------------------------------------------------------------------
  const zg = class {
    get(a, b) {
      return fetch(a, this.getOptions(b)).then((c) => {
        // Scholar rate-limits by IP: it answers with a redirect to Google's
        // "unusual traffic" verification page. Surface that instead of a JSON error.
        if (/\/sorry\//.test(c.url || "")) { const e = new Error("captcha"); e.captchaUrl = c.url; throw e; }
        return c.json();
      });
    }
    v(a, b) { const c = this.getOptions(void 0); c.method = "POST"; c.body = b; return fetch(a, c).then((d) => d.json()); }
    getOptions(a) { const b = { credentials: "include" }; a && (b.signal = AbortSignal.timeout(a)); return b; }
  };
  const Ie = { en_GB: "en", en_US: "en", es_419: "es", fil: "tl", he: "iw", pt_BR: "pt-BR", pt_PT: "pt-PT", zh_CN: "zh-CN", zh_TW: "zh-TW" };
  function Je(a) { a = a.getMessage("@@ui_locale"); return Ie[a] || a; }
  function Ff(a, b, c = !1) { return `https://scholar.google.com/scholar?oi=${Gf(c)}&q=${encodeURIComponent(a)}&output=gsb${b ? "&" + b : ""}`; }
  function Hf(a, b = !1) { return `https://scholar.google.com/scholar?scilib=1&oi=${Gf(b)}${a ? "&" + a : ""}`; }
  function Gf(a) { return a ? "gsr-r" : "gsr"; }
  function Rf() { const a = new Uint32Array(1); window.crypto.getRandomValues(a); return a[0]; }
  const X = function (a) { let b = a.C.Da; b = b <= 0 ? "" : `authuser=${b}`; return `hl=${encodeURIComponent(Je(a.J))}` + (b ? "&" + b : ""); };
  const Th = function (a, b) { return "https://accounts.google.com/" + a + "?continue=" + encodeURIComponent("https://scholar.google.com?oi=gsr&gsr_login&gsr_key=" + b); };
  const ql = function (a) { a.La = Rf(); return a.La; };
  function S() { let a, b; return { promise: new Promise((c, d) => { a = c; b = d; }), resolve: a, reject: b }; }
  // Pr: look the account up. Scholar's toolbar/account-menu and highlight-sync
  // updates (Lq, Kq, hm, tl) have no counterpart here and are left out.
  const Pr = function (a, b) {
    if (Number.isInteger(b)) {
      const c = a.C.Da, d = a.C.fa;
      a.C.Da = b;
      let e = "gsr_login&gsr_hv=5&" + X(a);
      e = Ff("", e);
      let f = b, g = "", h = "", k = "", m = "", l = !1;
      return a.W.get(e).then((n) => {
        (g = (n.u || "") + "") ? ((h = (n.x || "") + ""), (k = (n.p || "") + ""), (m = (n.e || "") + ""), (l = n.hd === "1"), f < 0 && (f = 0)) : (f = -1);
      }).catch(() => { f = -1; l = !1; }).finally(() => {
        a.C.Da = f; a.C.fa = g; a.C.ua = h; a.C.jd = k; a.C.email = m; a.A.H = a.C.Da; a.V = l;
        if (c !== f || d !== g) { a.ma && a.ma.close(); a.lc && a.lc.close(); }
      });
    }
  };
  // Ok/Qk: authuser comes from ?authuser= or storage, default 0.
  const Ok = function (a, b) { if (b < 0 || !Number.isInteger(b)) b = 0; return Pr(a, b); };
  function Qk(a) {
    const c = new URLSearchParams(window.location.search), d = parseInt(c.get("authuser"), 10);
    if (!isNaN(d)) return Ok(a, d);
    try { chrome.storage.local.get({ authuser: 0 }, (e) => Ok(a, parseInt((e || {}).authuser, 10))); } catch (e) { Ok(a, 0); }
  }
  const Al = class { constructor() { this.j = Array(40).fill(0); this.H = 0; } };   // usage counters (Scholar beacons them; here they only count)
  const Z = function (a, b) { ++a.j[b]; };
  const sl = function () {};                                                      // highlight resync: no highlights here

  // ---------------------------------------------------------------------------
  // Small helpers (reader-compiled.js: Se, Re, wa, Mf, of, yh, zh, Eh, $i, Kh,
  // Lh, Mh, Jh, Sh, bl, al, Dj)
  // ---------------------------------------------------------------------------
  class Se { constructor() { this.A = /&lt;(\/?(b|i|em|br))&gt;/gi; this.v = /&amp;([a-z0-9]+|#[0-9]+);/gi; this.j = document.createElement("div"); } }
  const Re = function (a, b) { a.j.textContent = b; b = a.j.innerHTML; return b.replace(a.A, (c, d) => "<" + d + ">").replace(a.v, (c, d) => "&" + d + ";"); };
  function wa(a) { const b = typeof a; return (b == "object" && a != null) || b == "function"; }
  function Mf(a) { return wa(a) && typeof a.l === "string" && typeof a.u === "string" ? { label: a.l, href: a.u } : null; }
  function of(a) { const b = document.createElement("p"); b.textContent = a; return b.innerHTML; }
  const yh = /^\s*(?!javascript:)(?:[\w+.-]+:|[^:/?#]*(?:[/?#]|$))/i;
  function zh(a) { return yh.test(a) ? a : void 0; }
  function Eh(a) { const b = window; a = zh(a); a !== void 0 && b.open(a, "_blank", void 0); }
  function $i(a) {
    const b = O(K, "gsr-popover-err-msg");
    b.innerHTML = '<svg viewBox="0 0 21 21">\n    <path d="M10.4 14.4C10.6 14.4 10.8 14.3 11 14.2C11 14 11.2 13.8 11.2 13.6\n    C11.2 13.4 11 13.2 11 13C10.8 12.9 10.6 12.8 10.4 12.8\n    C10.2 12.8 10 12.9 9.8 13C9.7 13.2 9.6 13.4 9.6 13.6\n    C9.6 13.8 9.7 14 9.8 14.2C10 14.3 10.2 14.4 10.4 14.4ZM9.6 11.2H11.2V6.4\n    H9.6V11.2ZM10.4 18.4C9.3 18.4 8.3 18.2 7.3 17.8C6.3 17.4 5.5 16.8 4.7 16\n    C4 15.3 3.4 14.5 3 13.5C2.6 12.5 2.4 11.5 2.4 10.4C2.4 9.3 2.6 8.3 3 7.3\n    C3.4 6.3 4 5.5 4.7 4.7C5.5 4 6.3 3.5 7.3 3C8.3 2.6 9.3 2.4 10.4 2.4\n    C11.5 2.4 12.5 2.6 13.5 3C14.5 3.5 15.3 4 16 4.7\n    C16.8 5.5 17.3 6.3 17.8 7.3C18.2 8.3 18.4 9.3 18.4 10.4\n    C18.4 11.5 18.2 12.5 17.8 13.5C17.3 14.5 16.8 15.3 16 16\n    C15.3 16.8 14.5 17.4 13.5 17.8C12.5 18.2 11.5 18.4 10.4 18.4Z\n    M10.4 16.8C12.2 16.8 13.7 16.2 14.9 14.9C16.2 13.7 16.8 12.2 16.8 10.4\n    C16.8 8.6 16.2 7 14.9 5.9C13.7 4.6 12.2 4 10.4 4C8.6 4 7 4.6 5.9 5.9\n    C4.6 7 4 8.6 4 10.4C4 12.2 4.6 13.7 5.9 14.9\n    C7 16.2 8.6 16.8 10.4 16.8Z"/></svg>';
    const c = N(L);
    c.innerHTML = a;
    b.append(c);
    return b;
  }
  function Kh(a, b) { b = O(Ve, b); b.textContent = a; a = O(L, "gsr-btn-bs"); b.appendChild(a); return b; }
  function Lh(a, b = "") { return Kh(a, `gsr-action-btn ${b}`); }
  function Mh(a) { return Kh(a, "gsr-outline-btn "); }
  function Sh(a = {}) {
    const b = V({ className: "gsr-checkbox" }), c = O(L, "gsr-chk");
    c.innerHTML = '<svg viewBox="0 0 13 13">\n    <path d="M10 3L11 4L5 10L2 7L3 6L5 8L10 3Z"/></svg>';
    const d = O(L, "gsr-cbx"), e = O(L, "gsr-lbl");
    e.textContent = a.label;
    P(b, [c, d, e]);
    b.classList.toggle("gsr-select", !!a.isSelected);
    b.addEventListener("click", (f) => { T(f); b.classList.toggle("gsr-select"); });
    return b;
  }
  const bl = class {
    constructor(a) { this.v = N(K); this.j = O(af, "gsr-input-txt"); this.j.type = a; this.A = O(K, "gsr-input-txt-err"); P(this.v, [this.j, this.A]); }
    focus() { this.j.focus(); }
  };
  const al = function (a, b) { a.A.textContent = b; a.v.classList.toggle("gsr-err", !!b); };
  const Dj = class { constructor(a) { this.v = a; } j(a) { const b = window.location; a = zh(a.toString()); a !== void 0 && (b.href = a); } };

  // ---------------------------------------------------------------------------
  // Cite dialog (reader-compiled.js: tj, sj): "Cite" in the popup fetches the
  // formatted citations (MLA/APA/...) and the BibTeX/EndNote/... export links.
  // ---------------------------------------------------------------------------
  const tj = class {
    constructor(a, b, c, d) {
      this.F = a; this.v = b; this.G = new Se(); this.A = O(K, "gsr-cite-links"); this.C = this.B = null; this.D = d === 0;
      a = { ba: "gsr-cite-dialog", ib: this.A, Ea: () => { this.C = this.B = null; this.A.innerHTML = ""; } };
      if (this.D) { const e = O(K, "gsr-cite-header"); e.textContent = this.v.getMessage("59"); a.Ga = e; }
      this.j = new rj(b, d, a);
      c.appendChild(this.j.j);
    }
  };
  const sj = async function (a, b) {
    Zi(a.j.j) >= 0 || (jj(a.j, a.v.getMessage("625")), a.j.open());
    gj(a.j, !0);
    a.C = b;
    let c = await b;
    if (b == a.C)
      if (c === null) jj(a.j, a.v.getMessage("111")), gj(a.j, !1);
      else if (c === "") jj(a.j, a.v.getMessage("1109")), gj(a.j, !1);
      else {
        b = Gf(a.D);
        c = "https://scholar.google.com/scholar?q=info:" + encodeURIComponent(c) + ":scholar.google.com/&oi=" + b + "&output=gsb-cite&" + X(a.F);
        c = a.B = a.F.W.get(c);
        try {
          const g = await c;
          if (c == a.B) {
            const d = g.l, e = g.i || [];
            if (!(d instanceof Array && e instanceof Array)) throw Error();
            const f = O(K, "gsr-cite-cits");
            for (const h of d) {
              if (!wa(h)) continue;
              const k = Re(a.G, (h.l || "") + ""), m = Re(a.G, (h.h || "") + "");
              if (!k || !m) continue;
              const l = O(K, "gsr-cite-row"), n = O(K, "gsr-cite-lbl"), p = O(K, "gsr-cite-txt");
              n.innerHTML = k; p.innerHTML = m;
              P(l, [n, p]);
              f.appendChild(l);
              l.tabIndex = 0;
              l.addEventListener("focus", () => { window.getSelection().selectAllChildren(p); });
            }
            a.A.innerHTML = "";
            for (const h of e) {
              if (!wa(h)) continue;
              const k = V({ href: (h.u || "") + "", label: (h.l || "") + "", className: "gsr-cite-link" });
              k.target = "_blank";
              a.A.appendChild(k);
            }
            f.firstChild ? hj(a.j, f) : jj(a.j, a.v.getMessage("1109"));
            gj(a.j, !1);
          }
        } catch (g) { jj(a.j, a.v.getMessage("111")), gj(a.j, !1); }
      }
  };

  // ---------------------------------------------------------------------------
  // Save to My library dialog (reader-compiled.js: Jm, zm, vm, wm, xm, ym, Am,
  // Bm, Cm, Dm, Em, Fm, Gm, Hm, Im). Needs the account from Pr (C.fa, C.ua).
  // ---------------------------------------------------------------------------
  const ym = function (a, b) {
      a.R.classList.toggle("gsr-vis", b);
      b && Bm(a) ? ((b = a.S), (a = a.v.getMessage("1631", [`<a target='_blank' href='${of(Bm(a))}'>`, "</a>"])), (b.innerHTML = a)) : (a.S.textContent = a.v.getMessage("732"));
    },
    zm = function (a) {
      a.C || a.G.appendChild(a.S);
      const b = O(K, "gsr-libsave-lblas");
      b.textContent = a.v.getMessage("924");
      vm(a);
      P(a.G, [b, a.J, a.T]);
      P(a.R, [a.H, a.O]);
      a.H.addEventListener("click", (c) => { T(c); wm(a); });
      a.O.addEventListener("click", (c) => { T(c); xm(a); });
      ym(a, !1);
    },
    Am = function (a, b, c) { a.j.j.classList.toggle("gsr-updating", c); b.classList.toggle("gsr-loading", c); },
    Bm = function (a) { const { fa: b, ua: c } = a.A.C; if (!c || !b) return ""; const d = a.C; return Hf(X(a.A), d); },
    Cm = function (a) { al(a.D, ""); a.F && a.F.remove(); a.F = null; },
    Dm = function (a, b) {
      a.T.classList.toggle("gsr-libsave-show-new-lbl-in", b);
      a.T.querySelector(".gsr-checkbox").classList.toggle("gsr-select", b);
      b && a.D.focus();
      b || (a.D.j.value = "");
    },
    Em = function (a, b) { const c = O(K, "gsr-libsave-lbl"); c.appendChild(Sh({ label: a, isSelected: b })); return c; },
    vm = function (a) {
      const b = V({ label: a.v.getMessage("1010"), className: "gsr-libsave-new-lbl", oa: '<svg viewBox="0 0 21 21">\n    <path d="M17.5 11.8H11.3V18H9.6V11.8H3.5V10H9.6V4H11.3V10H17.5V11.8Z"/>\n    </svg>' }),
        c = O(K, "gsr-libsave-new-lbl-in"), d = Em("", !1), e = O(K, "gsr-new-lbl-input");
      e.appendChild(a.D.v);
      P(c, [d, e]);
      P(a.T, [b, c]);
      b.addEventListener("click", (f) => { T(f); Dm(a, !0); });
      d.addEventListener("click", (f) => { T(f); Dm(a, !1); }, !0);
    },
    wm = async function (a) {
      let b = a.G.querySelectorAll(".gsr-libsave-lbl"), c = [], d = [], e = null, f;
      for (f of b) {
        let g = f.getAttribute("data-id");
        b = f.querySelector(".gsr-checkbox").classList.contains("gsr-select");
        g ? b !== a.Y.has(g) && (b ? c : d).push(g) : ((g = f.parentElement.classList.contains("gsr-libsave-new-lbl-in")), b && g && (e = a.D.j.value));
      }
      if (c.length || d.length || e !== null) {
        Cm(a);
        const { fa: h, ua: k } = a.A.C;
        if ((f = k && h ? "https://scholar.google.com/citations?update_op=change_labels&citilm=1&json=&oi=" + Gf(a.C) + "&xsrf=" + encodeURIComponent(k) + "&s={userId:citationId}&" + X(a.A) : "")) {
          f = f.replace("{userId:citationId}", a.W);
          b = new URLSearchParams();
          b.append("label_ids_to_add", c.join(","));
          b.append("label_ids_to_remove", d.join(","));
          e !== null && b.append("label_name_add", e);
          Am(a, a.H, !0);
          c = a.I = a.A.W.v(f, b.toString());
          try { const m = await c; c === a.I && Fm(a, m); }
          catch (m) { c === a.I && Gm(a, a.v.getMessage("111")); }
          finally { if (c !== a.I) return; Am(a, a.H, !1); }
        } else a.j.close();
      } else a.j.close();
    },
    xm = async function (a) {
      let b;
      const { fa: c, ua: d } = a.A.C;
      if ((b = d && c ? "https://scholar.google.com/citations?update_op=trash_citations&citilm=1&json=&oi=" + Gf(a.C) + "&xsrf=" + encodeURIComponent(d) + "&s=" + encodeURIComponent(c) + ":{citationId}&" + X(a.A) : "")) {
        b = b.replace("{citationId}", a.B);
        Cm(a);
        Am(a, a.O, !0);
        b = a.N = a.A.W.get(b);
        try { const e = await b; b === a.N && Fm(a, e); }
        catch (e) { b === a.N && Gm(a, a.v.getMessage("111")); }
        finally { if (b !== a.N) return; Am(a, a.O, !1); }
      } else a.j.close();
    },
    Fm = function (a, b) {
      if (wa(b))
        if (b.L)
          try {
            const c = new URL("" + b.L);
            c.origin === "https://accounts.google.com" ? Hm(a) : (a.j.close(), Eh(c.href));
          } catch (d) { Gm(a, a.v.getMessage("111")); }
        else if (b.M) Gm(a, "" + b.M);
        else if (b.U instanceof Array && b.U.length === 1 && wa(b.U[0])) {
          a.W = (b.U[0].c || "") + "";
          a.B = a.W.split(":")[1] || "";
          let c;
          a.Z && ((c = a.Z), c.j && c.j.Sb === a.X && (c.j.ea = a.B));
          c = !!a.B;
          a.V && a.V.classList.toggle("gsr-saved", c);
          if (c)
            if (((b = b.LB), b instanceof Array)) {
              for (const d of b) {
                if (!wa(d)) continue;
                b = (d.i || "") + "";
                c = (d.n || "") + "";
                const e = (d.s || "") + "" === "1";
                e && a.Y.add(b);
                c = Em(c, e);
                c.setAttribute("data-id", b);
                a.J.appendChild(c);
              }
              a.J.classList.toggle("gsr-two-columns", a.J.childElementCount > 5);
              ym(a, !0);
              hj(a.j, a.G);
            } else Gm(a, a.v.getMessage("111"));
          else a.j.close(), sl(a.A, { Fa: !0, log: "t" });
        } else wa(b.E) && b.E["l-n"] ? al(a.D, "" + b.E["l-n"]) : b.P ? a.j.close() : a.B && !b.U ? a.j.close() : Gm(a, a.v.getMessage("111"));
      else Gm(a, a.v.getMessage("111"));
    },
    Gm = function (a, b) { a.B ? ((b = $i(b)), a.F ? a.F.replaceWith(b) : a.G.prepend(b), (a.F = b)) : jj(a.j, b); },
    // Hm: Scholar clicks its toolbar account button (sign-in menu). This viewer has
    // no account button, so the same sign-in URL that menu links to opens instead.
    Hm = function (a) {
      a.j.close();
      let b = document.querySelector(".gsr-account");
      b ? b.click() : Eh(Th("Login", ql(a.A)) + "&" + X(a.A));
    },
    Im = async function (a, b, c) {
      ym(a, !1);
      a.J.innerHTML = "";
      Cm(a);
      Dm(a, !1);
      a.X = b;
      a.V = c;
      c = c.classList.contains("gsr-saved");
      Gm(a, a.v.getMessage(c ? "625" : "1632"));
      Zi(a.j.j) >= 0 || a.j.open();
      const { fa: d, ua: e } = a.A.C;
      if ((c = e && d ? "https://scholar.google.com/citations?update_op=library_add&citilm=1&json=&oi=" + Gf(a.C) + "&xsrf=" + encodeURIComponent(e) + "&info={docid}&user=" + encodeURIComponent(d) + "&" + X(a.A) : "")) {
        b = c.replace("{docid}", b);
        gj(a.j, !0);
        b = a.K = a.A.W.get(b);
        try { const f = await b; b === a.K && Fm(a, f); }
        catch (f) { b === a.K && Gm(a, a.v.getMessage("111")); }
        finally { if (b !== a.K) return; gj(a.j, !1); }
      } else Hm(a);
    },
    Jm = class {
      constructor(a, b, c, d = null) {
        this.A = a; this.v = b; this.C = c === 0; this.Z = d; this.B = this.X = this.W = "";
        this.S = O(K, "gsr-libsave-header");
        this.G = O(K, "gsr-libsave-body");
        this.J = O(K, "gsr-libsave-lbls");
        this.F = null;
        this.T = O(K, "gsr-libsave-new-lbl-wrap");
        this.D = new bl("text");
        this.R = O(K, "gsr-libsave-footer");
        this.H = Lh(this.v.getMessage("644"));
        this.O = Mh(this.v.getMessage("551"));
        this.V = null;
        this.Y = new Set();
        a = { ba: "gsr-libsave-dialog", ib: this.R, Ea: () => { this.B = this.X = this.W = ""; this.V = null; this.Y.clear(); this.N = this.I = this.K = null; Am(this, this.H, !1); Am(this, this.O, !1); this.R.classList.remove("gsr-vis"); } };
        this.C && (a.Ga = this.S);
        this.j = new rj(b, c, a);
        this.N = this.I = this.K = null;
        zm(this);
      }
      close() { this.j.close(); }
    };

  // ---------------------------------------------------------------------------
  // "Expand to save" prompt (reader-compiled.js: Fj, Ej): Scholar shows it in
  // place of the library dialog when the reader runs without account features.
  // ---------------------------------------------------------------------------
  const Ej = function (a) {
      const b = N(K), c = O(K, "gsr-expand-to-save-instr");
      c.textContent = a.v.getMessage("1716");
      const d = O(K, "gsr-expand-to-save-btns"), e = Lh(a.v.getMessage("1717")), f = Mh(a.v.getMessage("1718"));
      e.addEventListener("click", () => { a.j.close(); a.B.j(a.A); });
      f.addEventListener("click", () => { a.j.close(); });
      P(d, [e, f]);
      P(b, [c, d]);
      return b;
    },
    Fj = class {
      constructor(a, b, c, d) {
        this.v = a; this.B = b; this.A = c;
        this.j = new rj(a, 0, { ba: "gsr-expand-to-save-dialog", Ga: N(K), Ra: Ej(this) });
        d.appendChild(this.j.j);
      }
      open() { this.j.open(); }
    };

  // ---------------------------------------------------------------------------
  // Reference popup (reader-compiled.js: dp, ep, fp, gp, hp, ip, jp, kp, lp, mp,
  // np, op, pp, qp, rp, sp, tp, up, vp, wp, xp, yp, zp, Ap, Bp). pp() sends the
  // reference text to Scholar (output=gsb) and op() renders the top result:
  // title, authors line, snippet with Show more/less, Save, Cite, Cited by,
  // Related, Versions and full-text links; the fallbacks are "Search Scholar" /
  // "Search Google" plus the reference text from the PDF.
  // ---------------------------------------------------------------------------
  const dp = /^\/scholar\/images\/qa_favicons\/[a-zA-Z0-9._-]*[.]png$/;
  const ep = function (a) {
    const b = a.v.getBoundingClientRect(), c = b.x - a.A.x, b2 = b.y - a.A.y, d = a.B.getBoundingClientRect();
    return { x: M() ? d.right - a.j.right - c : a.j.left - d.left + c, y: a.j.y - d.y + b2 };
  };
  class fp {
    constructor(a, b) {
      this.B = b;
      this.C = a.style.insetInlineStart.toString();
      this.D = a.style.top;
      this.j = a.getBoundingClientRect();
      this.v = a.parentElement;
      this.A = this.v.getBoundingClientRect();
    }
  }
  const gp = function (a) {
      const b = N(K);
      const c = N(L);
      c.textContent = a.v.getMessage("1621");
      b.appendChild(c);
      return b.innerHTML;
    },
    hp = function (a) { return a.A.querySelector(".gsr-reference-link.gsr-select"); },
    pp = function (a, b) {
      a.C = a.O.get(b);
      ip(a, b);
      a.G.disabled = !b.previousElementSibling;
      a.F.disabled = !b.nextElementSibling;
      const c = a.C ? F(a.C, 2) : "", d = X(a.D);
      b = Ff(c, d + "&rfa=1", !0);
      gj(a.j, !0);
      const e = (a.I = a.D.W.get(b).then((f) => {
        if (e === a.I) {
          gj(a.j, !1);
          let g = f.L;
          if (g && typeof g === "string") (f = jp(c)), (g = kp(`https://scholar.google.com/scholar${g}&oi=${Gf(!0)}`, a.v.getMessage("535"))), lp(a, f, mp(a, [g])), ij(a.j);
          else {
            g = f.r;
            if (!(g instanceof Array)) throw Error();
            if (f.l !== "1" || np(g)) (g = `https://www.google.com/search?q=${encodeURIComponent(c)}${d ? "&" + d : ""}`), (f = jp(c)), (g = kp(g, a.v.getMessage("1617"))), lp(a, f, mp(a, [g])), ij(a.j);
            else {
              g = g.length ? op(a, g[0]) : null;
              if (!g) throw Error();
              f = g.ce;
              lp(a, g.be);
              g = a.j;
              g.B ? (g.F = f) : g.C.replaceChildren(f);
            }
          }
        }
      }).catch((err) => {
        if (e === a.I) {
          gj(a.j, !1);
          const f = jp(c);
          const g = err && err.captchaUrl
            ? $i('Google Scholar is asking you to confirm you are not a robot before it answers more lookups. <a href="' + err.captchaUrl.replace(/"/g, "&quot;") + '" target="_blank" rel="noopener">Open the check</a>, complete it, then click the citation again.')
            : $i(a.v.getMessage("1620"));
          lp(a, f, g);
        }
      }));
    },
    qp = function (a) {
      const b = V({ label: a.v.getMessage("1715"), className: "gsr-reference-access-link gsr-reference-see-in-ref" });
      b.addEventListener("click", (c) => {
        c.preventDefault();
        if (a.C) {
          Z(a.T, 6);
          a.j.close();
          c = A(a.C, 4)[0];
          c && Po(a.D, C(a.C, 1), E(c, 1), E(c, 3), 0, 0, 1);
        }
      });
      return b;
    },
    ip = function (a, b) {
      let c = hp(a);
      c && c.classList.remove("gsr-select");
      b.classList.add("gsr-select");
      a.W.textContent = "" + (Array.prototype.indexOf.call(a.A.children, b) + 1);
      const d = a.B.clientWidth;
      c = d - a.A.scrollWidth;
      let e = b.parentElement;
      e = e ? (M() ? e.offsetWidth - b.offsetLeft - b.offsetWidth : b.offsetLeft) : 0;
      b = Math.min(0, Math.max(c, Math.max(0, d - b.clientWidth) / 2 - e));
      a.A.style.marginInlineStart = `${b}px`;
      a.B.classList.toggle("gsr-reference-fade-start", b < 0);
      a.B.classList.toggle("gsr-reference-fade-end", b > c);
    },
    mp = function (a, b) {
      const c = O(K, "gsr-reference-footer");
      P(c, [...b, qp(a)]);
      return c;
    },
    jp = function (a) {
      const b = O(K, "gsr-reference-original-text");
      b.textContent = a;
      return b;
    },
    kp = function (a, b) {
      return V({ href: a, label: b, className: "gsr-reference-access-link", oa: '<svg viewBox="0 0 21 21">\n    <path d="M12.9 12L17.9 17L16.6 18.4L11.6 13.4C10.6 14 9.5 14.5 8.3 14.5\n    C5 14.5 2.6 11.9 2.6 8.8C2.6 5.6 5 3 8.3 3C11.4 3 14 5.6 14 8.8\n    C14 10 13.5 11 12.9 12ZM8.3 4.8C6 4.8 4.3 6.6 4.3 8.8\n    C4.3 10.9 6 12.7 8.3 12.7C10.4 12.7 12.2 10.9 12.2 8.8\n    C12.2 6.6 10.4 4.8 8.3 4.8Z"/></svg>' });
    },
    lp = function (a, ...b) {
      const c = N(K);
      P(c, [...b]);
      hj(a.j, c);
    },
    np = function (a) { return a.every((b) => wa(b) && !b.u); },
    op = function (a, b) {
      if (!wa(b)) return null;
      let c = Re(a.K, (b.t || "") + ""), d = Re(a.K, (b.x || "") + "");
      const e = (b.u || "") + "";
      let f = Re(a.K, (b.m || "") + "");
      const g = b.o || "", h = (!!(b.i || "").match(dp) && b.i) || "", k = b.s;
      let m = b.l || {};
      if (!c || !wa(m)) return null;
      const l = O(K, "gsr-reference-result");
      let n = O(K, "gsr-reference-result-title");
      if (d) { const t = O(L, "gsr-reference-result-marker"); t.innerHTML = "[" + d + "]"; c = t.outerHTML + " " + c; }
      e ? ((d = V({ href: e })), (d.innerHTML = c), n.appendChild(d)) : (n.innerHTML = c);
      l.appendChild(n);
      f && ((n = O(K, "gsr-reference-result-metadata")), (n.innerHTML = f), l.appendChild(n));
      k && xp(k, h, g, l);
      f = O(K, "gsr-reference-result-links");
      if (m.f) {
        b = (b.c || "") + "";
        const t = V({ label: a.v.getMessage("64"), className: "gsr-reference-result-link gsr-reference-save", oa: '<svg viewBox="0 0 16 16" fill-rule="evenodd">\n    <path d="M9.8 6.2L14.6 6.6L11 9.8L12.1 14.5L8 12L3.8 14.5L4.9 9.8\n    L1.3 6.6L6.1 6.2L8 1.8L9.8 6.2ZM5.5 12.2L5.5 12.2L6.1 9.4L3.9 7.5\n    L6.8 7.2L8 4.5L9.1 7.2L12 7.5L9.8 9.4L10.5 12.2L8 10.7Z"/>\n    </svg>' });
        b && a.N && t.classList.add("gsr-saved");
        f.appendChild(t);
        const u = m.f.u.substring(2);
        t.addEventListener("click", (v) => { T(v); a.j.v === 3 && a.close(); a.N ? Im(a.N, u, t) : a.S && a.S.open(); });
        b = V({ label: a.v.getMessage("59"), className: "gsr-reference-result-link gsr-reference-cite", oa: '<svg viewBox="0 0 16 16">\n    <path d="M2 3H8V9L6 13H2L4 9H2V3ZM3 4V8H5.61803L3.61803 12\n    H5.38197L7 8.76393V4H3Z"/>\n    <path d="M9 3H15V9L13 13H9L11 9H9V3ZM10 4V8H12.618L10.618 12\n    H12.382L14 8.76393V4H10Z"/></svg>' });
        f.appendChild(b);
        b.addEventListener("click", (v) => { T(v); a.j.v === 3 && a.close(); sj(a.Y, Promise.resolve(u)); });
      }
      let p;
      for (p of ["c", "r", "v"]) (b = rp(m[p])) && f.appendChild(b);
      p = [];
      (b = sp(m.g, "gsr-reference-fulltext-link")) && p.push(b);
      (m = sp(m.l)) && p.push(m);
      m = mp(a, p);
      p = N(K);
      k && p.appendChild(yp(a));
      f.firstChild && p.appendChild(f);
      p.appendChild(m);
      return { be: l, ce: p };
    },
    rp = function (a) { return (a = Mf(a)) ? V({ href: "https://scholar.google.com" + a.href, label: a.label, className: "gsr-reference-result-link" }) : null; },
    sp = function (a, b = "") { return (a = Mf(a)) ? V({ href: a.href, label: a.label, className: "gsr-reference-access-link " + b }) : null; },
    tp = function (a) { a.j.j.classList.toggle("gsr-reference-expanded", !0); nj(a.j, 3); },
    up = function (a) { a.j.j.classList.toggle("gsr-reference-expanded", !1); nj(a.j, 2); },
    vp = function (a, b, c, d) {
      const e = a.j.j, f = e.getBoundingClientRect();
      let g = M() ? b.right - f.right : b.left - f.left, h = b.y - f.y;
      const f2 = [{ transform: `translate(${g}px, ${h}px)` }, { transform: "translate(0, 0)" }];
      b = c - b.height;
      c = Math.abs(b);
      g = Lf(Math.max(Math.max(Math.abs(g), Math.abs(h)), c), 50, 600, 100, 300);
      h = e.style.insetInlineStart === "";
      const k = document.querySelector(".gsr-dialogs-background");
      k && k.animate([{ opacity: h ? 0 : 1 }, { opacity: h ? 1 : 0 }], { duration: g });
      ej(a.j, b, c, g);
      e.animate(f2, g).finished.then(() => { d && d(); });
    },
    wp = function (a, b, c) {
      a = a.j.j;
      a.style.insetInlineStart = b;
      a.style.top = c;
    },
    xp = function (a, b, c, d) {
      const e = O(K, "gsr-reference-result-abstract");
      e.innerHTML = a;
      d.appendChild(e);
      a = O(K, "gsr-reference-result-snippet-blur");
      e.appendChild(a);
      if (c || b) {
        a = e.appendChild;
        d = O(K, "gsr-reference-result-publisher");
        if (b) { const f = O($e, "gsr-reference-result-publisher-icon"); f.src = "https://scholar.google.com" + b; d.appendChild(f); }
        c && ((b = O(K, "gsr-reference-result-publisher-name")), (b.textContent = c), d.appendChild(b));
        a.call(e, d);
      }
    },
    yp = function (a) {
      const b = O(K, "gsr-reference-expand-collapse"),
        c = V({ label: a.v.getMessage("1628"), className: "gsr-reference-result-link gsr-reference-show-more", tc: '<svg viewBox="0 0 19 19">\n    <path d="M4.75 14.25V9.5H6.175V12.825H9.5V14.25H4.75Z\n    M12.825 9.5V6.175H9.5V4.75H14.25V9.5H12.825Z"/></svg>' }),
        d = V({ label: a.v.getMessage("1629"), className: "gsr-reference-result-link gsr-reference-show-less", tc: '<svg viewBox="0 0 21 21">\n    <path d="M9.4937 11.506V16.756H7.87V13.12H4.2437V11.506H9.4937ZM13.12\n    4.2437V7.87H16.756V9.4937H11.506V4.2437H13.125Z"/>\n    </svg>' });
      P(b, [c, d]);
      c.addEventListener("click", (e) => {
        T(e);
        let f = a.j.j;
        a.X = new fp(f, a.R);
        e = f.getBoundingClientRect();
        qj(a.j, 3, a.R);
        wp(a, "", "10%");
        const g = pj(a.j) - a.j.A.offsetHeight, h = g < 0;
        h || tp(a);
        f = h ? e.height + g : f.getBoundingClientRect().height;
        vp(a, e, f, () => { h && tp(a); });
        Z(a.T, 16);
      });
      d.addEventListener("click", (e) => {
        T(e);
        e = a.j.j.getBoundingClientRect();
        const f = a.X, g = ep(f);
        wp(a, g.x + "px", g.y + "px");
        const h = f.j.height - e.height < 0;
        h || up(a);
        vp(a, e, f.j.height, () => { qj(a.j, 2, f.v); wp(a, f.C, f.D); h && up(a); });
      });
      return b;
    },
    zp = function (a, b, c, d = !0) {
      b = V({ label: b, className: "gsr-reference-link" });
      a.A.appendChild(b);
      c && a.O.set(b, c);
      d && a.H.push(b);
    },
    Ap = function (a, b, c) {
      a.O.clear();
      a.H = [];
      a.C = null;
      for (const d0 of [a.J, a.B, a.A]) pf(d0);
      a.V = b;
      const d = new Map();
      for (const e0 of c) has(e0, 3) && d.set(C(e0, 3), e0);
      b = A(b, 2);
      const e = b.length;
      for (let f = 0; f < e; ++f) {
        let g = b[f];
        if (has(g, 4) && has(g, 5)) {
          const h = C(g, 4);
          g = C(g, 5);
          for (let k = h; k <= g; ++k)
            zp(a, `${f === 0 && k === h ? "[" : ""}${k}${f === e - 1 && k === g ? "]" : ","}`, d.get(k), k === h);
        } else {
          let h = Md(g, 3)[0];
          h = h < c.length && h >= 0 ? c[h] : void 0;
          zp(a, F(g, 2), h);
        }
      }
      a.B.append(a.A);
      const cc = [];
      cc.push(a.B);
      const dd = a.A.children;
      for (const k of dd)
        k.addEventListener("click", (m) => { pp(a, k); m.preventDefault(); });
      const n = dd.length;
      if (n > 1) {
        const b2 = O(K, "gsr-reference-link-idx");
        b2.dir = "ltr";
        const e2 = N(K);
        e2.textContent = "/";
        const f2 = N(K);
        f2.textContent = "" + n;
        P(b2, [a.W, e2, f2]);
        cc.push(b2, a.G, a.F);
      }
      P(a.J, cc);
    },
    Bp = class {
      // a: reader (viewer), b: i18n, c: .gsr-dialogs container, d: cite dialog (tj),
      // e: usage counters (Al), f: { Eb: library dialog (Jm) | null, yb: Fj | null }
      constructor(a, b, c, d, e, f) {
        this.D = a;
        this.v = b;
        this.R = c;
        this.Y = d;
        this.T = e;
        this.N = f.Eb;
        this.S = f.yb;
        this.K = new Se();
        this.J = O(K, "gsr-reference-header");
        this.W = N(K);
        this.G = W(
          M()
            ? '<svg viewBox="0 0 21 21">\n    <path d="M6.5 16.8L7.9 18L14.9 11L7.9 4L6.6 5.2L12.4 11"/></svg>'
            : '<svg viewBox="0 0 21 21">\n    <path d="M14.4 5.2L13 4L6 11L13 18L14.4 16.8L8.6 11"/></svg>',
          "",
        );
        this.G.setAttribute("aria-label", this.v.getMessage("1441"));
        this.F = W(
          M()
            ? '<svg viewBox="0 0 21 21">\n    <path d="M14.4 5.2L13 4L6 11L13 18L14.4 16.8L8.6 11"/></svg>'
            : '<svg viewBox="0 0 21 21">\n    <path d="M6.5 16.8L7.9 18L14.9 11L7.9 4L6.6 5.2L12.4 11"/></svg>',
          "",
        );
        this.F.setAttribute("aria-label", this.v.getMessage("1442"));
        this.B = O(K, "gsr-reference-links-wrapper");
        this.A = O(K, "gsr-reference-links");
        this.Z = gp(this);
        this.V = null;
        this.O = new Map();
        this.X = null;
        this.H = [];
        this.C = this.I = null;
        this.j = new rj(b, 2, { ba: "gsr-reference", qc: !1, Ea: () => { this.I = null; }, Ga: this.J });
        this.G.addEventListener("click", () => {
          const g = hp(this), h = g == null ? void 0 : g.previousElementSibling;
          h && pp(this, h);
        });
        this.F.addEventListener("click", () => {
          const g = hp(this), h = g == null ? void 0 : g.nextElementSibling;
          h && pp(this, h);
        });
      }
      display(a, b, c, d, e) {
        let f = b.offsetParent;
        if (f)
          if ((this.V !== c && Ap(this, c, e), d < 0 || d >= this.H.length)) this.j.close();
          else if (
            ((c = this.j.j),
            c.remove(),
            f.prepend(c),
            Zi(this.j.j) >= 0 ||
              (qj(this.j, 2, f), this.j.j.classList.toggle("gsr-reference-expanded", !1), jj(this.j, this.Z), ij(this.j), this.j.open()),
            pp(this, this.H[d]),
            (f = b.offsetParent))
          )
            ((d = M()),
              (f = f.getBoundingClientRect()),
              (c = this.j.j),
              (e = d ? a.x + a.width - f.x - f.width : f.x - a.x),
              wp(
                this,
                `${R(d ? f.width - b.offsetLeft - b.offsetWidth : b.offsetLeft, -e + 24, -e + a.width - c.offsetWidth - 24)}px`,
                `${b.offsetTop + b.offsetHeight + 4}px`,
              ),
              (f = c.getBoundingClientRect()),
              (d = a.y + a.height),
              (f = f.y + 364),
              f > d && ((a = Math.min(b.getBoundingClientRect().y - a.y, f - d + 24)), Uo(this.D, 0, a, "smooth")));
      }
      close() { this.j.close(); }
    };

  // ---------------------------------------------------------------------------
  // Loader iframe bridge (reader-compiled.js: class Pi, Ki, Mi, Oi, I()).
  // Scholar's sandboxed pdf.js loader answers the analyzer's page requests.
  // ---------------------------------------------------------------------------
  const PDF_PSEUDO_URL = "file:///document.pdf"; // file: makes the loader pull bytes via its "fetch" port
  class LoaderHost {
    constructor(bytes) {
      this.bytes = bytes;
      this.numPages = 0;
      this.A = new Map();   // pending request id -> callback
      this.Cc = 0;          // next request id
      this.closed = false;
      let resolveReady, rejectReady;
      this.v = new Promise((res, rej) => { resolveReady = res; rejectReady = rej; });
      this.v.catch(() => {});
      this.B = O({ j: "IFRAME" }, "gsr-loader-iframe");
      this.B.src = chrome.runtime.getURL("/pdf_loader_iframe.html");
      this.B.sandbox = "allow-same-origin allow-scripts allow-downloads";
      this.B.setAttribute("aria-hidden", "true");
      Object.assign(this.B.style, { position: "fixed", width: "0", height: "0", border: "0", opacity: "0", pointerEvents: "none" });
      this.onMessage = (g) => {
        if (!this.S || g.source !== this.S || !g.data || typeof g.data !== "object") return;
        if (g.data.type === "fetch" && g.ports[0]) {
          // Loader asks for the PDF body (Scholar contentscript: na()).
          const port = g.ports[0];
          const stream = new Blob([this.bytes]).stream();
          port.postMessage({ type: "pdf", body: stream, length: this.bytes.length, encoding: "", filename: "" }, [stream]);
          return;
        }
        if (!("type" in g.data)) return;
        const h = g.data.val;
        switch (g.data.type) {
          case 0: Ki(this, 4, PDF_PSEUDO_URL); break;
          case 1: break;
          case 2: break;
          case 3: Number.isFinite(h) && ((this.numPages = Math.max(0, Math.floor(h))), resolveReady()); break;
          case 4: rejectReady(new Error("loader failed")); break;
          case 5: rejectReady(new Error("password protected")); break;
          case 6: case 7: case 8: case 9: case 10:
            if (h && typeof h === "object") {
              const k = this.A.get(h.id);
              k && (this.A.delete(h.id), k(h));
            }
        }
      };
      window.addEventListener("message", this.onMessage);
      document.body.appendChild(this.B);
      this.S = this.B.contentWindow;
    }
    cleanup() {
      this.closed = true;
      window.removeEventListener("message", this.onMessage);
      this.B.remove();
      this.A.clear();
    }
    // Register the analyzer worker: forward its LoadRequests, tell it the page count.
    // Register the analyzer worker: forward its LoadRequests, tell it the page
    // count. A window (offset, count) lets one loaded document be analysed one
    // paper at a time: the analyzer sees pages 0..count-1, the loader gets
    // offset..offset+count-1 (journal issues bundle many papers in one PDF).
    I(a, offset = 0, count = 0) {
      const win = { offset, count };
      a.addEventListener("message", (b) => { (b = b.data) && "q" in b && Oi(this, a, b.q, win); });
      this.v.then(() => { a.postMessage({ n: win.count || this.numPages }); }).catch(() => {});
    }
  }
  const Ki = function (a, b, c) { a.S && a.S.postMessage({ type: b, val: c }, "*"); };
  // Oi: analyzer LoadRequest (jspb JSON [id, kind, src, page, params]) -> loader -> analyzer
  const Oi = function (a, b, q, win) {
    let req;
    try { req = JSON.parse(q); } catch (e) { return; }
    if (!Array.isArray(req)) return;
    const workerId = req[0], d = req[1], e = req[3];
    const k = a.Cc++;
    req[0] = k;
    if (win && win.offset && typeof req[3] === "number") req[3] = e + win.offset;   // analyzer page -> document page
    a.A.set(k, (m) => {
      if (a.closed || !m || typeof m !== "object" || !m.result) return;
      const g = m.result, le = [];
      g.c instanceof ImageBitmap && le.push(g.c);
      b.postMessage({ r: { i: workerId, t: d, p: e, r: g } }, le);
    });
    Ki(a, 0, JSON.stringify(req));
  };
  // Xq: boot the analyzer (mode 0 = full analysis incl. citations + references)
  function Xq(b, offset = 0, count = 0) {
    const a = new Worker(chrome.runtime.getURL("/analyzer_worker_bin.js"));
    b.I(a, offset, count);
    a.postMessage({ m: 0 });
    return a;
  }

  // ---------------------------------------------------------------------------
  // Page overlays (reader-compiled.js: bs, No) on top of pdf.js page views.
  // ---------------------------------------------------------------------------
  const state = {
    doc: null, host: null, worker: null,
    B: new Map(),   // pageIndex -> { ha: [groups], ta: [refs], j: overlay div | null }
    Nb: [],         // references (Article field 5) of the last installed paper
    segments: [],   // [{ start, end, Nb }] one per paper when the PDF bundles several
    da: null,       // Bp popup
    R: null,        // .gsr-dialogs layer
    Y: null,        // tj cite dialog
  };
  function pageState(i) {
    let p = state.B.get(i);
    p || state.B.set(i, (p = { ha: [], ta: [], j: null }));
    return p;
  }
  function getPageView(i) {
    const app = window.PDFViewerApplication;
    return app && app.pdfViewer ? app.pdfViewer.getPageView(i) : null;
  }
  // Reader wiring (reader-compiled.js constructor): the .gsr-dialogs layer that
  // hosts modal dialogs and the expanded popup, the Cite dialog (tj), the
  // library dialog (Jm, when account features are on) or the expand-to-save
  // prompt (Fj), then the account lookup (Qk -> Pr).
  function setupReader() {
    if (state.R) return;
    viewer.W = new zg();
    viewer.A = new Al();
    viewer.Ob = new Dj(location.href);
    const a = O(K, "gsr-dialogs");
    a.appendChild(O(K, "gsr-dialogs-background"));
    document.body.appendChild(a);
    state.R = a;
    state.Y = new tj(viewer, i18n, a, 0);
    (viewer.ma = viewer.ka ? new Jm(viewer, i18n, 0) : null) && a.appendChild(viewer.ma.j.j);
    viewer.yc = viewer.ka ? null : new Fj(i18n, viewer.Ob, location.href, a);
  }
  // Privacy: Scholar's reader looks the account up on every load. Here nothing
  // is sent to scholar.google.com until a citation popup is first opened.
  let accountChecked = false;
  function checkAccount() {
    if (accountChecked) return;
    accountChecked = true;
    Qk(viewer);
    // Not in Scholar: it learns about a sign-in from its scholar.google.com
    // content script. Here the account is re-checked when the tab regains focus.
    window.addEventListener("focus", () => { viewer.C.Da < 0 && viewer.W && Pr(viewer, 0); });
  }
  function popup() {
    setupReader();
    checkAccount();
    return state.da || (state.da = new Bp(viewer, i18n, state.R, state.Y, viewer.A, { Eb: viewer.ma, yb: viewer.yc }));
  }
  const No = function (a, b, c) {
    const d = A(b, 2);
    for (let e = 0; e < d.length; e++)
      for (const f of A(d[e], 1)) {
        if (C(f, 1) != c) continue;
        const g = V({ className: "gsr-citation-link" });
        Af(a.A, fld(f, 2) || [], g);
        g.addEventListener("click", (h) => {
          popup().display(viewer.v.getBoundingClientRect(), g, b, e, refsForPage(c));
          h.preventDefault();
          h.stopPropagation();
        });
        a.j.appendChild(g);
      }
  };
  function refsForPage(p) {
    for (const s of state.segments) if (p >= s.start && p < s.end) return s.Nb;
    return state.Nb;
  }
  // Shift every page index in an Article by `off` (groups: field 4 -> pages in
  // field 1 and entries' field 1; references: field 5 -> field 1).
  function offsetArticle(b, off) {
    if (!off) return;
    for (const d of A(b, 4)) {
      const pages = fld(d, 1);
      if (Array.isArray(pages)) for (let i = 0; i < pages.length; i++) pages[i] = Number(pages[i]) + off;
      for (const e of A(d, 2)) for (const f of A(e, 1)) if (fld(f, 1) != null) f[0] = Number(f[0]) + off;
    }
    for (const r of A(b, 5)) if (fld(r, 1) != null) r[0] = Number(r[0]) + off;
  }
  const bs = function (b, seg) {
    for (const d of A(b, 4))
      for (const e of Md(d, 1)) {
        const c = pageState(e);
        c.ha.push(d);
        if (c.j) { const pv = getPageView(e); pv && pv.viewport && No({ A: pv.viewport, j: c.j }, d, e); }
      }
    state.Nb = A(b, 5);
    if (seg) { seg.Nb = state.Nb; state.segments.push(seg); }
    for (const d of state.Nb) pageState(C(d, 1)).ta.push(d);
  };
  function renderPageLinks(pageIndex) {
    const pv = getPageView(pageIndex);
    if (!pv || !pv.div || !pv.viewport) return;
    const p = pageState(pageIndex);
    if (p.j && p.j.parentNode !== pv.div) { p.j.remove(); p.j = null; }
    if (!p.j) {
      p.j = O(K, "gsr-hl-ctn");
      pv.div.appendChild(p.j);
    } else pf(p.j);
    for (const g of p.ha) No({ A: pv.viewport, j: p.j }, g, pageIndex);
  }
  function clearArticles() {
    if (state.da) { try { state.da.close(); } catch (e) {} }
    for (const p of state.B.values()) p.j && p.j.remove();
    state.B.clear();
    state.Nb = [];
    state.segments = [];
  }
  function installArticle(article, seg) {
    const groups = A(article, 4);
    if (!groups.length) return;
    seg && offsetArticle(article, seg.start);
    bs(article, seg);
    // Pages rendered before the analysis finished will not fire pagerendered again.
    for (const [i, p] of state.B) {
      if (!p.ha.length || p.j) continue;
      const pv = getPageView(i);
      pv && pv.renderingState === 3 /* RenderingStates.FINISHED */ && renderPageLinks(i);
    }
  }

  // ---------------------------------------------------------------------------
  // Lifecycle
  // ---------------------------------------------------------------------------
  function reset() {
    if (state.da) { try { state.da.close(); } catch (e) {} }
    if (state.worker) { try { state.worker.terminate(); } catch (e) {} }
    if (state.host) state.host.cleanup();
    for (const p of state.B.values()) p.j && p.j.remove();
    state.B.clear();
    state.Nb = [];
    state.segments = [];
    state.worker = null;
    state.host = null;
    state.doc = null;
  }
  // ---------------------------------------------------------------------------
  // Papers inside one PDF. Scholar's analyzer assumes a single article: given a
  // journal issue it merges every reference list and maps citations for the
  // first paper only. So the document is split into papers first, using the
  // PDF outline when it has one entry per paper, otherwise the page text: a
  // paper starts on a page with an "Abstract" (or "Index Terms"/"Keywords")
  // heading that follows a "References" heading, and ends before the next one.
  // (Bookmarks are deliberately ignored: single papers usually have one per section.)
  // ---------------------------------------------------------------------------
  // The analyzer needs the entire document (doc.getData() resolves once the
  // background download is complete) and its loader holds a second copy, so
  // only absurdly large files are skipped.
  const ANALYZE_MAX_BYTES = 1024 * 1024 * 1024;
  const SEGMENT_MIN_PAGES = 20;   // shorter documents are analysed as one paper
  async function segmentsFromOutline(doc) {
    let outline = null;
    try { outline = await doc.getOutline(); } catch (e) { return null; }
    if (!outline || outline.length < 2) return null;
    const starts = new Set();
    for (const item of outline) {
      try {
        let dest = item.dest;
        if (typeof dest === "string") dest = await doc.getDestination(dest);
        if (!Array.isArray(dest) || !dest[0]) continue;
        starts.add(await doc.getPageIndex(dest[0]));
      } catch (e) {}
    }
    const list = [...starts].sort((a, b) => a - b);
    return list.length >= 2 ? list : null;
  }
  // First-page markers across publishers: "Abstract" / "Abstract—" (IEEE,
  // Springer, arXiv), "a b s t r a c t" (Elsevier), "Index Terms" (IEEE),
  // "Keywords", "CCS Concepts" / "Additional Key Words" (ACM).
  const RE_START = /^\s*(abstract\b|a\s?b\s?s\s?t\s?r\s?a\s?c\s?t\b|index terms|key\s?words|ccs concepts|additional key words|acm reference format)/i;
  const RE_REFS = /^\s*(references|bibliography|literature cited|works cited)\s*$/i;
  function pageLines(tc) {
    const rows = new Map();
    for (const it of tc.items) {
      if (!it.str || !it.str.trim()) continue;
      const y = Math.round(it.transform[5] / 3);
      rows.set(y, (rows.get(y) || "") + it.str + " ");
    }
    return [...rows.entries()].sort((a, b) => b[0] - a[0]).map((r) => r[1].trim());
  }
  const RE_APPENDIX = /^\s*(appendix|appendices|supplement(al|ary)(\s+(material|materials|information|note|notes))?|supporting information)\b/i;
  // One pass over the page text: where papers start, where reference lists
  // are, and where a supplement or appendix begins.
  async function scanPages(doc) {
    const n = doc.numPages, flags = [];
    for (let i = 0; i < n; i++) {
      let lines = [];
      try { lines = pageLines(await (await doc.getPage(i + 1)).getTextContent()); } catch (e) {}
      flags.push({
        isStart: lines.slice(0, 40).some((l) => RE_START.test(l)),
        hasRefs: lines.some((l) => l.length < 40 && RE_REFS.test(l)),
        // a page carrying a numbered reference list, headed or not
        refList: lines.filter((l) => /^\s*\[\d{1,3}\]\s/.test(l)).length >= 5,
        isAppendix: lines.slice(0, 8).some((l) => l.length < 60 && RE_APPENDIX.test(l)),
      });
    }
    return flags;
  }
  function segmentsFromText(flags) {
    const starts = [0];
    let refsSeen = false;
    flags.forEach((f, i) => {
      if (i > 0 && f.isStart && refsSeen && i - starts[starts.length - 1] >= 2) { starts.push(i); refsSeen = false; }
      if (f.hasRefs) refsSeen = true;
    });
    return starts.length >= 2 ? starts : null;
  }
  // Scholar's analyzer looks for the reference list near the end of what it is
  // given. A letter followed by a long supplement (PRL-style: references on
  // page 8 of 19) therefore yields nothing; hand it the paper up to the end of
  // its reference list instead. Citations inside the supplement are not linked.
  function trimAppendix(flags) {
    const n = flags.length, isRefs = (f) => f.hasRefs || f.refList;
    const refs = flags.findIndex(isRefs);
    if (refs < 0) return null;
    for (let i = refs; i < n; i++) {
      if (!flags[i].isAppendix) continue;
      if (flags.slice(i + 1).some(isRefs)) return null;   // the list is after the appendix: nothing to trim
      const end = i === refs ? i + 1 : i;
      return n - end >= 3 && end >= 2 ? { start: 0, end } : null;
    }
    return null;
  }
  async function segmentDocument(doc) {
    const n = doc.numPages;
    const flags = await scanPages(doc);
    // Outlines are not used: most single papers carry one bookmark per section.
    state.flags = flags;
    let starts = n >= SEGMENT_MIN_PAGES ? segmentsFromText(flags) : null;
    if (!starts) return [{ start: 0, end: n }];
    starts = [...new Set([0, ...starts])].sort((a, b) => a - b);
    return starts.map((st, i) => ({ start: st, end: i + 1 < starts.length ? starts[i + 1] : n })).filter((s) => s.end > s.start);
  }

  // Run Scholar's analyzer over one page window of the loaded document.
  // Resolves with the Article proto (jspb JSON) or null.
  function runSegment(host, seg) {
    return new Promise((resolve) => {
      const worker = Xq(host, seg.start, seg.end - seg.start);
      state.worker = worker;
      // Keypoint parameters Scholar fetches from its server; empty = none (dh default).
      worker.postMessage({ k: "", kf: "", l: "", kl: 0 });
      let article = null, quiet = 0, requests = 0;
      const finish = () => {
        clearTimeout(quiet); try { worker.terminate(); } catch (e) {}
        console.log(`scholar-citations: pages ${seg.start + 1}-${seg.end}: ${requests} loader requests, ` + (article ? `${A(article, 4).length} citation groups, ${A(article, 5).length} references` : "no result"));
        resolve(article);
      };
      const arm = (ms) => { clearTimeout(quiet); quiet = setTimeout(finish, ms); };
      worker.addEventListener("message", (t) => {
        if (!(t = t.data)) return;
        if ("q" in t) { requests++; arm(article ? 3000 : 120000); }
        if (typeof t.a === "string") {
          // The worker posts two articles: citations/references first, block
          // elements later. Keep the one carrying citation data.
          let u = null; try { u = JSON.parse(t.a); } catch (e) {}
          if (u && (!article || A(u, 4).length || A(u, 5).length)) article = u;
          // The citations article is all this viewer uses; do not wait for the
          // later block-elements message.
          if (u && (A(u, 4).length || A(u, 5).length)) return finish();
          arm(3000);
        }
      });
      worker.addEventListener("error", (e) => { console.warn("scholar-citations: analyzer error", e.message); finish(); });
      arm(120000);
    });
  }
  async function analyze(app) {
    const doc = app.pdfDocument;
    if (!doc || state.doc === doc) return;
    if (window.__pdfByteLength > ANALYZE_MAX_BYTES) { console.log("scholar-citations: skipped, document larger than 1 GB"); return; }
    reset();
    state.doc = doc;
    // Segmentation only needs page text, so it runs while a ranged load is
    // still finishing its background download.
    const segPromise = segmentDocument(doc).catch(() => [{ start: 0, end: doc.numPages }]);
    let bytes;
    try {
      // Ranged loads (relay or file://) keep downloading after the pages are
      // in; wait for the whole file, then take the bytes.
      if (doc.getDownloadInfo) await doc.getDownloadInfo();
      if (state.doc !== doc) return;
      bytes = await doc.getData();
    } catch (e) { console.warn("scholar-citations: could not read the document bytes", e && e.message); return; }
    if (state.doc !== doc) return;
    const segments = window.__gsrSegments || await segPromise;
    if (state.doc !== doc) return;
    if (segments.length > 1) console.log("scholar-citations: " + segments.length + " papers found, analysing each");
    let host;
    try { host = new LoaderHost(bytes); } catch (e) { console.warn("scholar-citations: loader failed", e); return; }
    state.host = host;
    host.v.catch((e) => { console.warn("scholar-citations:", e.message); });
    for (const seg of segments) {
      if (state.doc !== doc || state.host !== host) return;
      // A single paper whose reference list is followed by a supplement: the
      // analyzer may find nothing on the whole file (it expects the list near
      // the end), and the whole file is slow to analyse. Run the paper up to
      // its list first so popups appear at once, then the whole file, and keep
      // the whole-file result only if it found the list (it also links the
      // supplement's citations).
      const alt = segments.length === 1 ? trimAppendix(state.flags || []) : null;
      if (alt) {
        console.log("scholar-citations: supplement follows the references, analysing pages 1-" + alt.end + " first");
        const quick = await runSegment(host, alt);
        if (state.doc !== doc || state.host !== host) return;
        quick && installArticle(quick, null);
      }
      let article = await runSegment(host, seg);
      if (state.doc !== doc || state.host !== host) return;
      if (alt) { if (article && A(article, 5).length) clearArticles(); else article = null; }
      article && installArticle(article, segments.length > 1 ? seg : null);
    }
    // This viewer renders with its own pdf.js; drop the loader (a second parsed
    // copy of the PDF) now that the analyzer is done.
    if (!host.closed) host.cleanup();
    state.worker = null;
  }
  function hook(app) {
    setupReader();
    const bus = app.eventBus;
    // With ranged loads pagesloaded can precede documentloaded; only reset
    // when a different document replaced the one being analysed.
    bus.on("documentloaded", () => { if (state.doc && state.doc !== app.pdfDocument) reset(); });
    bus.on("pagesloaded", () => {
      const run = () => analyze(app);
      window.requestIdleCallback ? requestIdleCallback(run, { timeout: 500 }) : setTimeout(run, 200);
    });
    bus.on("pagerendered", (e) => {
      const i = e.pageNumber - 1;
      if (state.B.has(i)) renderPageLinks(i);
    });
    // Pages reset on zoom/rotate; pagerendered re-adds. Drop stale containers.
    bus.on("pagesinit", () => { for (const p of state.B.values()) p.j = null; });
    // Scholar closes the reference popup when zooming (reader: this.da.close()).
    const closePopup = () => { state.da && state.da.close(); };
    bus.on("scalechanging", closePopup);
    bus.on("smoothzoomstart", closePopup);
    bus.on("rotationchanging", closePopup);
  }
  function init() {
    const app = window.PDFViewerApplication;
    if (!app) return;
    if (app.initializedPromise) app.initializedPromise.then(() => hook(app));
    else {
      const wait = () => (app.eventBus ? hook(app) : setTimeout(wait, 50));
      wait();
    }
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
  // Debug/testing hook.
  window.__gsrCitations = { analyze, segmentDocument, scanPages, state };
})();
