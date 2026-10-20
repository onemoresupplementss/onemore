// Catalogue rules shared by the build, the browser and the Cloudflare Functions.
// The Google Apps Script (apps-script/Code.gs) repeats the visibility and
// settings rules for the live feed - keep the two in step when changing them.

export const CATEGORIES = [
  { slug: 'whey-protein', name: 'Whey Protein', blurb: 'Lean muscle and recovery' },
  { slug: 'mass-gainer', name: 'Mass Gainer', blurb: 'Calories for size' },
  { slug: 'creatine', name: 'Creatine', blurb: 'Strength and power' },
  { slug: 'pre-workout', name: 'Pre-Workout', blurb: 'Energy for the session' },
  { slug: 'bcaa', name: 'BCAA', blurb: 'Intra-workout aminos' },
  { slug: 'eaa', name: 'EAA', blurb: 'All essential aminos' },
  { slug: 'glutamine', name: 'Glutamine', blurb: 'Recovery support' },
  { slug: 'fish-oil', name: 'Fish Oil', blurb: 'Omega-3' },
  { slug: 'multivitamin', name: 'Multivitamin', blurb: 'Daily micronutrients' },
  { slug: 'minerals', name: 'Minerals', blurb: 'Magnesium and more' },
  { slug: 'protein-oats', name: 'Protein Oats', blurb: 'High-protein breakfast' },
];

const CATEGORY_BY_KEY = new Map();
for (const c of CATEGORIES) {
  CATEGORY_BY_KEY.set(normKey(c.name), c);
  CATEGORY_BY_KEY.set(normKey(c.slug), c);
}

// Column headers the owner may use for each field (matched ignoring case,
// spaces and symbols), so renaming "Price" to "Price (₹)" does not break anything.
const PRODUCT_COLUMNS = {
  id: ['id', 'sku', 'code', 'product id'],
  group: ['group', 'group key', 'url'],
  active: ['active', 'show', 'live', 'on site'],
  verified: ['verified', 'sticker ok', 'checked'],
  brand: ['brand'],
  name: ['name', 'product', 'product name'],
  category: ['category'],
  size: ['size', 'weight', 'pack size'],
  flavour: ['flavour', 'flavor', 'variant'],
  price: ['price', 'selling price', 'our price'],
  mrp: ['mrp'],
  outOfStock: ['outofstock', 'out of stock', 'sold out'],
  image: ['image', 'photo', 'image file', 'picture'],
  description: ['description', 'desc', 'details'],
  netQty: ['netqty', 'net qty', 'net quantity', 'net weight'],
  unit: ['unit', 'net unit'],
  bestseller: ['bestseller', 'best seller'],
  badge: ['badge', 'tag'],
  sort: ['sort', 'order', 'position'],
  keywords: ['keywords', 'search words', 'aliases'],
};

const INFO_COLUMNS = {
  group: ['group', 'group key'],
  genericName: ['genericname', 'generic name'],
  vegNonVeg: ['vegnonveg', 'veg/non-veg', 'veg non veg', 'veg'],
  ingredients: ['ingredients'],
  nutrition: ['nutrition', 'nutrition info', 'nutrition facts'],
  warnings: ['warnings', 'warning', 'cautions'],
  manufacturer: ['manufacturer', 'manufactured by', 'marketed by'],
  importer: ['importer', 'imported by'],
  countryOfOrigin: ['countryoforigin', 'country of origin', 'origin'],
  consumerCare: ['consumercare', 'consumer care', 'customer care'],
  labelImages: ['labelimages', 'label images', 'label photos'],
  imported: ['imported'],
};

const DELIVERY_COLUMNS = {
  area: ['area', 'town', 'place'],
  pincodes: ['pincodes', 'pincode', 'pin codes', 'pin'],
  fee: ['fee', 'delivery fee', 'charge'],
  eta: ['eta', 'delivery time', 'when'],
  active: ['active', 'on'],
};

// Settings: key -> [type, default]. Public ones are sent to the browser.
export const SETTINGS = {
  AcceptingOrders: ['choice', 'Open', true],
  ClosedMessage: ['text', 'We are not taking online orders right now. Please call or WhatsApp us.', true],
  Announcement: ['text', '', true],
  PreviewBanner: ['bool', false, true],
  DeliveryFee: ['money', 40, true],
  FreeDeliveryAbove: ['money', 2999, true],
  CODMax: ['money', 10000, true],
  CallFirstCODAbove: ['money', 3000, true],
  PickupEnabled: ['bool', true, true],
  SameDayCutoff: ['text', '18:00', true],
  ShopHours: ['text', '', true],
  ReplyPromise: ['text', 'We reply within 2 hours during shop hours.', true],
  MaxQtyPerLine: ['int', 10, true],
  MaxOpenOrdersPerPhone: ['int', 3, false],
  RequireVerified: ['bool', true, false],
  AllowPuducherry: ['bool', true, true],
  AlertEmail: ['text', '', false],
  AlertWhatsApp: ['text', '', false],
  ReviewLink: ['text', '', true],
};

export function normKey(s) {
  return String(s ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

export function parseMoney(v) {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  const s = String(v ?? '').replace(/₹|rs\.?|inr|,|\s/gi, '');
  if (s === '') return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

// A Price cell saying "Ask" (or WhatsApp / On request / Enquire): no price yet, customers ask on
// WhatsApp. Typing a number later turns the variant into a normal one with a price.
export function isAskPrice(v) {
  return /^(ask|ask on whatsapp|whatsapp|on request|price on request|enquire|enquiry|tbc)$/i.test(String(v ?? '').trim());
}

export function parseIntSafe(v, fallback = 0) {
  const n = parseMoney(v);
  return n === null ? fallback : Math.trunc(n);
}

export function parseBool(v) {
  if (typeof v === 'boolean') return v;
  return ['true', 'yes', 'y', '1', 'on', 'open', '✓', '✔'].includes(String(v ?? '').trim().toLowerCase());
}

export function slugify(s) {
  return String(s ?? '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

/** "Piña Colada" -> "pina-colada" (accents dropped), used for flavour picture file names. */
export function flavourSlug(s) {
  return slugify(String(s ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, ''));
}

export function categoryFor(value) {
  return CATEGORY_BY_KEY.get(normKey(value)) || null;
}

// Map one sheet row (object keyed by header text) onto our field names.
function mapRow(row, columns) {
  const byKey = new Map(Object.keys(row).map((k) => [normKey(k), row[k]]));
  const out = {};
  for (const [field, aliases] of Object.entries(columns)) {
    for (const a of aliases) {
      const k = normKey(a);
      if (byKey.has(k)) {
        out[field] = byKey.get(k);
        break;
      }
    }
  }
  return out;
}

function text(v) {
  return v === null || v === undefined ? '' : String(v).trim();
}

export function normalizeSettings(raw = {}) {
  const byKey = new Map(Object.entries(raw).map(([k, v]) => [normKey(k), v]));
  const out = {};
  for (const [key, [type, def]] of Object.entries(SETTINGS)) {
    const has = byKey.has(normKey(key)) && text(byKey.get(normKey(key))) !== '';
    const v = has ? byKey.get(normKey(key)) : def;
    if (type === 'money') out[key] = parseMoney(v) ?? def;
    else if (type === 'int') out[key] = parseIntSafe(v, def);
    else if (type === 'bool') out[key] = has ? parseBool(v) : def;
    else if (type === 'choice') out[key] = /^closed$/i.test(text(v)) ? 'Closed' : 'Open';
    else out[key] = text(v);
  }
  return out;
}

export function publicSettings(settings) {
  const out = {};
  for (const [key, [, , isPublic]] of Object.entries(SETTINGS)) if (isPublic) out[key] = settings[key];
  return out;
}

export function normalizeDelivery(rows = []) {
  return rows
    .map((r) => mapRow(r, DELIVERY_COLUMNS))
    .filter((r) => text(r.area) && (r.active === undefined || text(r.active) === '' || parseBool(r.active)))
    .map((r) => ({
      area: text(r.area),
      pincodes: text(r.pincodes).split(/[^0-9]+/).filter((p) => /^\d{6}$/.test(p)),
      fee: parseMoney(r.fee),
      eta: text(r.eta),
    }));
}

// The single rule for whether a variant is on the site. "Out of stock" variants stay listed
// (shown as out of stock, can't be ordered); untick Active to take one off the site.
// requirePrice is false in the WhatsApp-only phase, where the site shows no prices.
// "Ask" variants (Price cell says Ask) are listed without a price and enquired about on WhatsApp.
export function variantVisible(v, settings, { requirePrice = true } = {}) {
  if (!v.active) return false;
  if (settings.RequireVerified && !v.verified) return false;
  if (requirePrice && !v.ask && !(v.price > 0)) return false;
  return true;
}

/**
 * Turn raw sheet rows into grouped products.
 * @param {{products:object[], info?:object[], settings?:object, delivery?:object[]}} raw
 * @param {{today:string, requirePrice?:boolean}} opts today as YYYY-MM-DD (IST)
 */
export function normalizeCatalog(raw, { today, requirePrice = true }) {
  const settings = normalizeSettings(raw.settings);
  const delivery = normalizeDelivery(raw.delivery);
  const warnings = [];
  const infoByGroup = new Map();
  for (const r of raw.info || []) {
    const m = mapRow(r, INFO_COLUMNS);
    const g = slugify(m.group);
    if (!g) continue;
    infoByGroup.set(g, {
      genericName: text(m.genericName),
      vegNonVeg: text(m.vegNonVeg),
      ingredients: text(m.ingredients),
      nutrition: text(m.nutrition),
      warnings: text(m.warnings),
      manufacturer: text(m.manufacturer),
      importer: text(m.importer),
      countryOfOrigin: text(m.countryOfOrigin),
      consumerCare: text(m.consumerCare),
      labelImages: text(m.labelImages).split(/[,\n]+/).map((s) => s.trim()).filter(Boolean),
      imported: text(m.imported),
    });
  }

  const groups = new Map();
  const seenIds = new Set();
  (raw.products || []).forEach((r, i) => {
    const m = mapRow(r, PRODUCT_COLUMNS);
    const rowNo = i + 2;
    const id = text(m.id);
    if (!id && !text(m.name)) return; // blank row
    if (!id) return warnings.push(`Row ${rowNo}: missing ID - skipped`);
    if (seenIds.has(id)) return warnings.push(`Row ${rowNo}: duplicate ID ${id} - skipped`);
    seenIds.add(id);
    const brand = text(m.brand);
    const name = text(m.name);
    if (!brand || !name) return warnings.push(`Row ${rowNo} (${id}): brand and name are required - skipped`);
    const cat = categoryFor(m.category);
    if (!cat) return warnings.push(`Row ${rowNo} (${id}): unknown category "${text(m.category)}" - skipped`);
    const ask = isAskPrice(m.price);
    const price = ask ? null : parseMoney(m.price);
    const mrp = ask ? null : parseMoney(m.mrp);
    if (price !== null && mrp !== null && price > mrp) warnings.push(`Row ${rowNo} (${id}): price is above MRP - hidden`);
    const slug = slugify(m.group) || slugify(`${brand} ${name}`);
    const v = {
      id,
      size: text(m.size),
      flavour: text(m.flavour),
      price: price ?? 0,
      mrp: mrp ?? price ?? 0,
      soldOut: parseBool(m.outOfStock),
      image: text(m.image),
      netQty: parseMoney(m.netQty),
      unit: text(m.unit).toLowerCase(),
      active: m.active === undefined ? true : parseBool(m.active),
      verified: parseBool(m.verified),
    };
    if (ask) v.ask = true;
    if (price !== null && mrp !== null && price > mrp) v.active = false;
    v.visible = variantVisible(v, settings, { requirePrice });
    let g = groups.get(slug);
    if (!g) {
      g = {
        slug,
        brand,
        name,
        category: cat.slug,
        categoryName: cat.name,
        description: '',
        bestseller: false,
        badge: '',
        sort: 9999,
        keywords: '',
        info: infoByGroup.get(slug) || null,
        variants: [],
      };
      groups.set(slug, g);
    }
    g.description ||= text(m.description);
    g.bestseller ||= parseBool(m.bestseller);
    g.badge ||= text(m.badge);
    g.keywords = unique([...g.keywords.split(', '), ...text(m.keywords).split(/\s*,\s*/)]).join(', ');
    const sort = parseMoney(m.sort);
    if (sort !== null) g.sort = Math.min(g.sort, sort);
    g.variants.push(v);
  });

  const products = [...groups.values()]
    .filter((g) => g.variants.some((v) => v.active))
    .map((g) => {
      const visible = g.variants.filter((v) => v.visible);
      const pool = visible.length ? visible : g.variants;
      const cheapest = pool.reduce((a, b) => (b.price < a.price ? b : a));
      return {
        ...g,
        image: (g.variants.find((v) => v.image) || {}).image || '',
        minPrice: cheapest.price,
        minMrp: cheapest.mrp,
        sizes: unique(g.variants.map((v) => v.size)),
        flavours: unique(g.variants.map((v) => v.flavour)),
        inStock: visible.some((v) => !v.soldOut),
        ...(pool.every((v) => v.ask) ? { ask: true } : {}),
      };
    })
    .sort((a, b) => a.sort - b.sort || a.brand.localeCompare(b.brand) || a.name.localeCompare(b.name));

  return { products, settings, delivery, warnings, today };
}

function unique(list) {
  return [...new Set(list.filter(Boolean))];
}

// Small, stable string hash (FNV-1a) used to tell whether the live feed changed.
export function hashString(s) {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16);
}

/**
 * The small "live" feed the site polls: [price, MRP, in stock 1/0, visible 1/0] per variant ID,
 * plus public settings and delivery areas. Same shape as Apps Script's pushLiveFeed().
 */
export function buildFeed(catalog, at) {
  const items = {};
  for (const p of catalog.products) {
    // "Ask" variants have no price, so they can never be ordered through the checkout.
    for (const v of p.variants) items[v.id] = [v.price, v.mrp, v.soldOut ? 0 : 1, v.visible && !v.ask ? 1 : 0];
  }
  const body = { items, settings: publicSettings(catalog.settings), delivery: catalog.delivery };
  return { v: hashString(JSON.stringify(body)), at, ...body };
}

export function todayIST(now = new Date()) {
  return new Date(now.getTime() + 5.5 * 3600000).toISOString().slice(0, 10);
}
