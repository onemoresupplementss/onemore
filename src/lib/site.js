// Shop details (shop.config.json) and the built catalogue, for .astro pages.
import shop from '../../shop.config.json';
import catalog from '../data/catalog.json';
import { CATEGORIES } from '../shared/catalog.js';
import { SHOW_PRICES, asset } from './env.js';

export { shop, catalog };

// "[shop email]" style values are placeholders the owner has not filled in yet.
export function isPlaceholder(v) {
  return !v || /^\[.*\]$/.test(String(v).trim());
}

/** The value with any "[placeholder]" parts removed: "Tamil Nadu – [pincode]" -> "Tamil Nadu". */
export function filled(v) {
  return String(v ?? '')
    .replace(/\s*[–-]?\s*\[[^\]]*\]/g, '')
    .trim();
}

/** Full address of a site path or photo (for canonical links, sharing and search engines). */
export function absUrl(pathOrSrc) {
  return new URL(asset(pathOrSrc), import.meta.env.SITE || shop.siteUrl).toString();
}

export const telHref = `tel:${shop.phoneDial}`;

// What the shop offers right now (Settings tab): store pickup, and pay on delivery (CODMax 0 = off).
// Pages say only what is on; the checkout reads the same settings live. WhatsApp mode has no money
// settings (CODMax) on the site, and payment is agreed on WhatsApp, so pay on delivery stays mentioned.
export const pickupOn = Boolean(catalog.settings.PickupEnabled);
export const codOn = SHOW_PRICES ? catalog.settings.CODMax > 0 : true;
/** "UPI, on delivery or at the shop" – the ways to pay that are switched on. */
export const payWays = ['UPI', codOn && 'on delivery', pickupOn && 'at the shop']
  .filter(Boolean)
  .join(', ')
  .replace(/, ([^,]*)$/, ' or $1');

export function waHref(text = 'Hi oneMore, I would like to know more about your products.') {
  return `https://wa.me/${shop.whatsappNumber}${text ? '?text=' + encodeURIComponent(text) : ''}`;
}

// Only the fields product cards need - keeps the HTML for each page small.
export function cardData(p) {
  return {
    slug: p.slug,
    brand: p.brand,
    name: p.name,
    category: p.category,
    categoryName: p.categoryName,
    image: p.image,
    badge: p.badge,
    bestseller: p.bestseller,
    keywords: p.keywords,
    ...(p.ask ? { ask: true } : {}),
    variants: p.variants.map((v) => ({ id: v.id, size: v.size, flavour: v.flavour, price: v.price, mrp: v.mrp, soldOut: v.soldOut, image: v.image, ...(v.ask ? { ask: true } : {}) })),
  };
}

export const categoriesWithProducts = CATEGORIES.map((c) => ({
  ...c,
  count: catalog.products.filter((p) => p.category === c.slug).length,
})).filter((c) => c.count > 0);
