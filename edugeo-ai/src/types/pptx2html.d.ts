/**
 * Typings for pptx2html@0.3.4 loaded as a global script
 * (public/vendor/pptx2html.full.js exposes window.pptx2html).
 */
interface Pptx2HtmlRenderer {
  /**
   * Renders a PPTX ArrayBuffer into the given DOM element.
   * Returns a Promise<number> (processing time in ms).
   */
  (data: ArrayBuffer, resultElement: Element | string, thumbElement?: Element | string): Promise<number>;
}

interface Window {
  pptx2html?: Pptx2HtmlRenderer;
}
