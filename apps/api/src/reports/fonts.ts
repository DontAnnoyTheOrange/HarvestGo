import { FONT_FILES } from './fontData.js';

let cached: string | null = null;

/**
 * Fonts packed INSIDE the report (so the PDF looks the same on any computer or server).
 * Tinos looks like Times New Roman and Caladea looks like Cambria, the two fonts used by the ATI form.
 */
export function embeddedFontCss(): string {
  if (cached !== null) return cached;
  cached = FONT_FILES.map(
    (f) =>
      `@font-face{font-family:'${f.family}';font-style:normal;font-weight:${f.weight};src:url(data:font/woff2;base64,${f.base64}) format('woff2');}`,
  ).join('\n');
  return cached;
}