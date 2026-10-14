// Turns product photos into web-ready images.
//   node scripts/add-photos.mjs <folder>
// Each file in <folder> must be named after the product's Group (the part after /p/ in its
// web address), e.g. optimum-nutrition-serious-mass.jpg. The tool trims the empty border,
// centres the product on an 800 x 800 white square and saves public/products/<group>.webp.
// Then: npm run seed (starter catalogue) or type <group>.webp in the sheet's Image column.
import { readdirSync, statSync, mkdirSync } from 'node:fs';
import { basename, dirname, extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = process.argv[2] && resolve(process.argv[2]);
if (!src) {
  console.error('Usage: node scripts/add-photos.mjs <folder with photos>');
  process.exit(1);
}
const outDir = join(root, 'public/products');
mkdirSync(outDir, { recursive: true });

const SIZE = 800;
const PAD = 40;
const MAX_BYTES = 150 * 1024;

for (const name of readdirSync(src)) {
  const file = join(src, name);
  if (!statSync(file).isFile() || !/\.(jpe?g|png|webp|avif)$/i.test(name)) continue;
  const slug = basename(name, extname(name)).toLowerCase();
  if (!/^[a-z0-9-]+$/.test(slug)) {
    console.warn(`skip ${name}: name must be lowercase letters, digits and dashes`);
    continue;
  }
  try {
    // Flatten transparency onto white, trim the plain border, then fit inside the padded square.
    const trimmed = await sharp(file).rotate().flatten({ background: '#ffffff' }).trim({ threshold: 12 }).toBuffer();
    const fitted = await sharp(trimmed)
      .resize(SIZE - PAD * 2, SIZE - PAD * 2, { fit: 'inside', withoutEnlargement: false })
      .extend({ top: PAD, bottom: PAD, left: PAD, right: PAD, background: '#ffffff' })
      .toBuffer();
    const square = sharp(fitted).resize(SIZE, SIZE, { fit: 'contain', background: '#ffffff' });
    let quality = 82;
    let out = await square.clone().webp({ quality }).toBuffer();
    while (out.length > MAX_BYTES && quality > 40) {
      quality -= 8;
      out = await square.clone().webp({ quality }).toBuffer();
    }
    await sharp(out).toFile(join(outDir, `${slug}.webp`));
    console.log(`ok   ${slug}.webp  ${Math.round(out.length / 1024)} KB`);
  } catch (e) {
    console.warn(`skip ${name}: ${e.message}`);
  }
}
