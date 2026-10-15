// Downloads the look-alike logo fonts for the home page brand ticker.
//   npm run brand-fonts
// For each brand in shop.config.json "brandStrip" that has a font in src/lib/brand-fonts.js,
// asks Google Fonts for just the letters of that brand's name and saves
// public/fonts/brands/<brand>.woff2 (a few KB each). Run it again after changing either list,
// then commit the new files. Needs an internet connection; the site itself never calls Google.
import { mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { BRAND_FONTS, brandDisplay, brandFontFile } from '../src/lib/brand-fonts.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const { default: shop } = await import('../shop.config.json', { with: { type: 'json' } });
const outDir = join(root, 'public/fonts/brands');
mkdirSync(outDir, { recursive: true });

// Google only sends woff2 to browsers it knows can read it.
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36';

const keep = new Set(['README.txt']);
const credits = [];
let total = 0;

for (const brand of shop.brandStrip) {
  const f = BRAND_FONTS[brand];
  if (!f) {
    console.warn(`${brand}: no font in src/lib/brand-fonts.js - uses the site font`);
    continue;
  }
  const text = [...new Set(brandDisplay(brand))].join('');
  const family = f.family.replace(/ /g, '+') + (f.axes ? `:${f.axes}` : '');
  const cssUrl = `https://fonts.googleapis.com/css2?family=${family}&text=${encodeURIComponent(text)}`;
  const css = await fetch(cssUrl, { headers: { 'User-Agent': UA } }).then((r) => {
    if (!r.ok) throw new Error(`${brand}: Google Fonts said ${r.status} for ${cssUrl}`);
    return r.text();
  });
  const src = css.match(/url\((https:[^)]+)\)\s*format\('woff2'\)/)?.[1];
  if (!src) throw new Error(`${brand}: no woff2 in Google's answer:\n${css}`);
  const font = Buffer.from(await fetch(src).then((r) => r.arrayBuffer()));
  const file = brandFontFile(brand);
  writeFileSync(join(root, 'public', file), font);
  keep.add(file.split('/').pop());
  credits.push(`${file.split('/').pop()}  ${f.family}${f.axes ? ` (${f.axes})` : ''}`);
  total += font.length;
  console.log(`${brand.padEnd(20)} ${f.family.padEnd(18)} ${(font.length / 1024).toFixed(1)} KB`);
}

// Drop fonts of brands no longer in the strip.
for (const name of readdirSync(outDir)) if (!keep.has(name)) rmSync(join(outDir, name));

writeFileSync(
  join(outDir, 'README.txt'),
  `Logo look-alike fonts for the home page brand ticker. Made by scripts/make-brand-fonts.mjs -
do not edit by hand. Each file holds only the letters of one brand name.
All are Google Fonts under the SIL Open Font License 1.1 (https://openfontlicense.org);
the brands' own logos and names belong to their owners.

${credits.join('\n')}
`,
);
console.log(`\n${credits.length} fonts, ${(total / 1024).toFixed(1)} KB in all.`);
