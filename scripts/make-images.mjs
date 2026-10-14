// Renders the share image (og.png) and app icons from SVG. Run once, or after
// changing the logo: node scripts/make-images.mjs   (needs the "sharp" package)
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import shop from '../shop.config.json' with { type: 'json' };

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

const og = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630">
  <rect width="1200" height="630" fill="#0a0a0a"/>
  <circle cx="1080" cy="80" r="320" fill="#c6ff00" opacity="0.08"/>
  <rect x="80" y="80" width="14" height="470" fill="#c6ff00"/>
  <text x="130" y="230" font-family="Arial Black, Arial, sans-serif" font-weight="900" font-style="italic" font-size="150" fill="#f4f4f2">one<tspan fill="#c6ff00">MORE</tspan></text>
  <text x="134" y="320" font-family="Arial, sans-serif" font-weight="700" font-size="48" fill="#f4f4f2">${esc(shop.tagline)}</text>
  <text x="134" y="420" font-family="Arial, sans-serif" font-size="34" fill="#a6a6a1">Whey · Gainers · Creatine · Pre-workout</text>
  <text x="134" y="480" font-family="Arial, sans-serif" font-size="34" fill="#a6a6a1">${esc(shop.addressLocality)} · UPI · Pay on delivery · Pickup</text>
</svg>`;

const icon = (size) => `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 64 64">
  <rect width="64" height="64" fill="#0a0a0a"/>
  <text x="32" y="45" text-anchor="middle" font-family="Arial Black, Arial, sans-serif" font-weight="900" font-style="italic" font-size="36" fill="#c6ff00">1+</text>
</svg>`;

writeFileSync(join(root, 'public/og.png'), await sharp(Buffer.from(og)).png({ compressionLevel: 9 }).toBuffer());
for (const s of [192, 512]) writeFileSync(join(root, `public/icon-${s}.png`), await sharp(Buffer.from(icon(s))).png().toBuffer());
writeFileSync(join(root, 'public/apple-touch-icon.png'), await sharp(Buffer.from(icon(180))).png().toBuffer());
console.log('Wrote public/og.png, icon-192.png, icon-512.png, apple-touch-icon.png');
