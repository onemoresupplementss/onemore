// Runs before every build. Fetches the catalogue from the Google Apps Script
// (or uses data/seed/ when the sheet is not connected yet) and writes:
//   src/data/catalog.json - products for the pages (public settings only)
//   public/feed.json      - price/stock snapshot, the fallback when /api/live is unavailable
//                           (checkout mode only; WhatsApp mode ships no prices at all)
//
// If the sheet IS connected but cannot be read, the build fails on purpose:
// the host then keeps the last good version of the site online instead of
// publishing placeholder data.
import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildFeed, normalizeCatalog, publicSettings, SETTINGS, todayIST } from '../src/shared/catalog.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
try {
  process.loadEnvFile(join(root, '.env'));
} catch {
  // no .env file - fine
}

const readJson = (rel) => JSON.parse(readFileSync(join(root, rel), 'utf8'));
const shop = readJson('shop.config.json');
// PUBLIC_ORDER_MODE (a build variable) overrides shop.config.json, see src/lib/env.js.
const orderMode = process.env.PUBLIC_ORDER_MODE || shop.orderMode;
if (!['whatsapp', 'checkout'].includes(orderMode)) {
  throw new Error(`orderMode must be "whatsapp" or "checkout", not "${orderMode}"`);
}
const showPrices = orderMode === 'checkout';

async function fetchFromSheet(url, key) {
  let lastError;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({ key, action: 'catalog', data: {} }),
        redirect: 'follow',
        signal: AbortSignal.timeout(45000),
      });
      const body = await res.json();
      if (!body.ok) throw new Error(`${body.error}: ${body.message || ''}`);
      return body;
    } catch (e) {
      lastError = e;
      console.warn(`Catalogue fetch attempt ${attempt} failed: ${e.message}`);
      await new Promise((r) => setTimeout(r, attempt * 3000));
    }
  }
  throw lastError;
}

// Image cells may hold a file name in public/products/ or a full https:// link.
// File names are stored without a leading slash; the pages add the site's sub-folder.
function imageUrl(v) {
  const s = String(v || '').trim();
  if (!s) return '';
  if (/^https:\/\/[^\s"'<>]+$/i.test(s)) return s;
  if (/^[\w.-]+\.(webp|jpe?g|png|avif)$/i.test(s)) return `products/${s}`;
  return '';
}

const url = process.env.APPS_SCRIPT_URL;
const key = process.env.APPS_SCRIPT_KEY;
let raw;
let source;
if (url && key) {
  raw = await fetchFromSheet(url, key);
  source = 'google-sheet';
} else {
  raw = {
    products: readJson('data/seed/products.json'),
    info: readJson('data/seed/info.json'),
    // Every seed product is shown (the owner has not ticked Verified anywhere yet).
    settings: { ...readJson('data/seed/settings.json'), RequireVerified: 'No' },
    delivery: readJson('data/seed/delivery.json'),
  };
  source = 'seed';
  console.warn(
    showPrices
      ? 'APPS_SCRIPT_URL / APPS_SCRIPT_KEY not set - building a PREVIEW from data/seed (placeholder prices).'
      : 'Building the WhatsApp-order catalogue from data/seed (no prices).',
  );
}

const today = todayIST();
const catalog = normalizeCatalog(raw, { today, requirePrice: showPrices });
const generatedAt = new Date().toISOString();

// Only variants that can be bought online get onto the site (unverified,
// unpriced or short-dated rows stay in the sheet). A product with none is left out.
// In WhatsApp mode prices and stock counts are removed, so they are not even in the page source;
// only "soldOut" (Stock 0) is kept, to show "Out of stock".
const products = catalog.products
  .map((p) => {
    const variants = p.variants
      .filter((v) => v.visible)
      .map(({ active, verified, visible, price, mrp, stock, ...v }) => ({
        ...v,
        image: imageUrl(v.image),
        ...(showPrices ? { price, mrp, stock } : stock > 0 ? {} : { soldOut: true }),
      }));
    const { minPrice, minMrp, inStock, ...rest } = p;
    return {
      ...rest,
      ...(showPrices ? { minPrice, minMrp, inStock } : {}),
      image: imageUrl(p.image),
      info: p.info && { ...p.info, labelImages: p.info.labelImages.map(imageUrl).filter(Boolean) },
      variants,
    };
  })
  .filter((p) => p.variants.length);

// WhatsApp mode shows no amounts at all, so money settings (delivery fee etc.) stay out too.
const settings = Object.fromEntries(Object.entries(publicSettings(catalog.settings)).filter(([k]) => showPrices || SETTINGS[k][0] !== 'money'));

const out = {
  source,
  generatedAt,
  today,
  settings,
  delivery: catalog.delivery,
  products,
};

mkdirSync(join(root, 'src/data'), { recursive: true });
writeFileSync(join(root, 'src/data/catalog.json'), JSON.stringify(out));
const feedFile = join(root, 'public/feed.json');
if (showPrices) writeFileSync(feedFile, JSON.stringify(buildFeed(catalog, generatedAt)));
else if (existsSync(feedFile)) unlinkSync(feedFile);

for (const w of catalog.warnings) console.warn('Sheet: ' + w);

// Remind the owner about "[...]" placeholders still in shop.config.json.
const todo = [];
(function walk(v, path) {
  if (typeof v === 'string' && /\[[^\]]*\]/.test(v)) todo.push(path);
  else if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) if (!k.startsWith('_')) walk(x, path ? `${path}.${k}` : k);
})(shop, '');
if (!shop.fssaiNumber) todo.push('fssaiNumber');
if (todo.length) console.warn(`shop.config.json still has placeholders: ${todo.join(', ')}`);

const variants = products.reduce((n, p) => n + p.variants.length, 0);
const hidden = catalog.products.reduce((n, p) => n + p.variants.length, 0) - variants;
console.log(`Catalogue (${source}, ${showPrices ? 'checkout' : 'WhatsApp'} mode): ${products.length} products, ${variants} variants on the site, ${hidden} hidden.`);
