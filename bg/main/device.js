/*
 * Device profile shared by smooth.js and perf.js.
 *
 * "lite" is a machine with little memory or few cores. On it the viewer keeps
 * pdf.js's own canvas cap (16 MP instead of 48) so page bitmaps stay small,
 * pre-renders one page ahead instead of two, and waits a little longer before
 * building text layers. Nothing else differs: pages render at the same
 * resolution up to about 220% on Retina (440% on 1x) screens.
 */
window.__viewerDevice = (() => {
  const mem = navigator.deviceMemory || 8;                 // GB, capped at 8 by Chrome
  const cores = navigator.hardwareConcurrency || 4;
  const dpr = window.devicePixelRatio || 1;
  const lite = mem <= 4 || cores <= 2;
  return { lite, mem, cores, dpr };
})();
