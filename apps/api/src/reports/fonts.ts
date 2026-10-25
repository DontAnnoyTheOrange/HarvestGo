import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';

const require = createRequire(import.meta.url);
let cached: string | null = null;

/**
 * Fonts packed INSIDE the report (so the PDF looks the same on any computer or server).
 * Tinos looks like Times New Roman and Caladea looks like Cambria, the two fonts used by the ATI form.
 * If the font packages cannot be found, the report still works and uses whatever fonts the computer has.
 */
export function embeddedFontCss(): string {
  if (cached !== null) return cached;
  const faces: string[] = [];
  const add = (pkg: string, family: string, weight: 400 | 700) => {
    try {
      const dir = path.dirname(require.resolve(`${pkg}/package.json`));
      const file = path.join(dir, 'files', `${pkg.split('/')[1]}-latin-${weight}-normal.woff2`);
      const base64 = readFileSync(file).toString('base64');
      faces.push(
        `@font-face{font-family:'${family}';font-style:normal;font-weight:${weight};src:url(data:font/woff2;base64,${base64}) format('woff2');}`,
      );
    } catch {
      /* optional: skip this font */
    }
  };
  add('@fontsource/tinos', 'Tinos', 400);
  add('@fontsource/tinos', 'Tinos', 700);
  add('@fontsource/caladea', 'Caladea', 400);
  add('@fontsource/caladea', 'Caladea', 700);
  cached = faces.join('\n');
  return cached;
}