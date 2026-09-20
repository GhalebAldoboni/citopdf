/*
 * macOS Look Up (three-finger tap / force click) on the text layer.
 *
 * Intentionally no code. Findings, so nobody chases the CSS again:
 *
 * Chrome (content/browser/renderer_host/render_widget_host_view_mac.mm,
 * LookUpDictionaryOverlayAtPoint) multiplies the gesture point by the device
 * scale factor and then hands it to
 * RenderWidgetHostInputEventRouter::FindViewAtLocation, which multiplies by
 * the device scale factor again before the viz hit test. On a Retina display
 * the frame lookup therefore happens at (2x, 2y). That is harmless when the
 * tab has a single widget (the router short-circuits), but when the viewer is
 * the cross-process iframe that embed.js creates, any point outside the
 * top-left quarter of the window misses the iframe, the request goes to the
 * top document (whose hit is the <iframe> element, so the word is empty), and
 * OnGotStringForDictionaryOverlay falls back to
 * NSPerformService("Look Up in Dictionary") with the current selection, which
 * opens Dictionary.app (or does nothing when nothing is selected).
 *
 * Nothing inside this frame can change where the browser process hit-tests.
 * Look Up works when viewer.html is the tab's top-level document, and the
 * range-based paths (right-click > Look Up "word", which use the focused
 * frame instead of a hit test) work in the embedded frame too.
 */
