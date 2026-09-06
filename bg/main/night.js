/*
 * Night / day toggle for the rendered pages (see night.css).
 *
 * Three states, cycled by the button or Shift+N: day (sun), night (moon:
 * pages inverted to dark grey, DarkPDF's tint) and AMOLED black (eclipse:
 * full inversion to #000 with a black toolbar and background).
 * State lives in chrome.storage.local ({ night: 0|1|2, nightTint }) so it
 * follows across tabs and reloads, as DarkPDF keeps its settings there.
 */
(() => {
  "use strict";
  const TINTS = [0.75, 0.85, 0.95];   // DarkPDF's three tints, as invert() amounts
  const root = document.documentElement;
  const LABELS = ["Day (Shift+N: night)", "Night (Shift+N: AMOLED black)", "AMOLED black (Shift+N: day)"];
  let night = 0, button = null;

  function apply(mode, tint) {
    night = mode === true ? 1 : (Number(mode) === 1 || Number(mode) === 2 ? Number(mode) : 0);
    root.dataset.night = String(night);
    if (Number.isInteger(tint) && TINTS[tint] != null) root.style.setProperty("--night-invert", String(TINTS[tint]));
    if (button) {
      button.classList.toggle("on", night === 1);
      button.classList.toggle("black", night === 2);
      button.title = LABELS[night];
      button.setAttribute("aria-pressed", night ? "true" : "false");
      button.firstElementChild && (button.firstElementChild.textContent = LABELS[night]);
    }
  }
  function toggle() {
    apply((night + 1) % 3);
    try { chrome.storage.local.set({ night }); } catch (e) {}
  }

  // State first, so pages never flash in the wrong mode.
  try {
    chrome.storage.local.get({ night: 0, nightTint: 1 }, (v) => apply(v.night, Number(v.nightTint)));
    chrome.storage.onChanged.addListener((c) => {
      if (c.night || c.nightTint) chrome.storage.local.get({ night: 0, nightTint: 1 }, (v) => apply(v.night, Number(v.nightTint)));
    });
  } catch (e) {}

  // AMOLED tone curve (see night.css). 11 points over 0..1: the ends go to
  // white/black, the interior is night mode's 0.85 - 0.7v.
  const AMOLED_CURVE = [1, 0.78, 0.71, 0.64, 0.57, 0.5, 0.43, 0.36, 0.29, 0.22, 0].join(" ");
  function installAmoledFilter() {
    if (document.getElementById("gsrAmoled")) return;
    const ns = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(ns, "svg");
    svg.setAttribute("width", "0"); svg.setAttribute("height", "0");
    svg.setAttribute("aria-hidden", "true");
    svg.style.cssText = "position:absolute;width:0;height:0;overflow:hidden";
    const f = document.createElementNS(ns, "filter");
    f.id = "gsrAmoled";
    f.setAttribute("color-interpolation-filters", "sRGB");
    const ct = document.createElementNS(ns, "feComponentTransfer");
    for (const ch of ["R", "G", "B"]) {
      const fn = document.createElementNS(ns, "feFunc" + ch);
      fn.setAttribute("type", "table");
      fn.setAttribute("tableValues", AMOLED_CURVE);
      ct.appendChild(fn);
    }
    f.appendChild(ct); svg.appendChild(f);
    document.body.appendChild(svg);
  }

  document.addEventListener("DOMContentLoaded", () => {
    installAmoledFilter();
    const bar = document.getElementById("toolbarViewerRight");
    if (!bar) return;
    button = document.createElement("button");
    button.className = "toolbarButton nightMode";
    button.type = "button";
    button.appendChild(document.createElement("span"));
    button.addEventListener("click", (e) => { e.preventDefault(); toggle(); });
    const copy = bar.querySelector(".copyLink");
    copy && copy.nextSibling ? bar.insertBefore(button, copy.nextSibling) : bar.appendChild(button);
    apply(night);
  });
  window.addEventListener("keydown", (e) => {
    if (e.key === "N" && e.shiftKey && !e.ctrlKey && !e.metaKey && !e.altKey) {
      const t = e.target, tag = t && t.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || (t && t.isContentEditable)) return;
      e.preventDefault(); toggle();
    }
  });
})();
