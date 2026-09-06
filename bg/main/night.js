/*
 * Night / day toggle for the rendered pages (see night.css).
 *
 * State lives in chrome.storage.local ({ night, nightTint }) so it follows
 * across tabs and reloads, as DarkPDF keeps its slider and checkbox in
 * chrome.storage. The toolbar button sits next to "Copy PDF Link" and shows
 * the current state: a moon while night mode is on, a sun while it is off.
 * Shortcut: Shift+N.
 */
(() => {
  "use strict";
  const TINTS = [0.75, 0.85, 0.95];   // DarkPDF's three tints, as invert() amounts
  const root = document.documentElement;
  let night = false, button = null;

  function apply(on, tint) {
    night = !!on;
    root.dataset.night = night ? "1" : "0";
    if (Number.isInteger(tint) && TINTS[tint] != null) root.style.setProperty("--night-invert", String(TINTS[tint]));
    if (button) {
      button.classList.toggle("on", night);
      const label = night ? "Night mode on (Shift+N)" : "Night mode off (Shift+N)";
      button.title = label;
      button.setAttribute("aria-pressed", night ? "true" : "false");
      button.firstElementChild && (button.firstElementChild.textContent = label);
    }
  }
  function toggle() {
    apply(!night);
    try { chrome.storage.local.set({ night }); } catch (e) {}
  }

  // State first, so pages never flash in the wrong mode.
  try {
    chrome.storage.local.get({ night: false, nightTint: 1 }, (v) => apply(v.night, Number(v.nightTint)));
    chrome.storage.onChanged.addListener((c) => {
      if (c.night || c.nightTint) chrome.storage.local.get({ night: false, nightTint: 1 }, (v) => apply(v.night, Number(v.nightTint)));
    });
  } catch (e) {}

  document.addEventListener("DOMContentLoaded", () => {
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
