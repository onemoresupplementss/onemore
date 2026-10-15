/**
 * Rules.gs - the shop rules, copied from the website so the website and this script always agree.
 *
 *   src/shared/catalog.js -> settings, which variants can be bought, delivery areas, live feed
 *   src/shared/order.js   -> phone / pincode / address checks, delivery fee, payment options
 *
 * If you change a rule on the website, change it here too (and the other way round).
 * Nothing in this file talks to Google - it is plain JavaScript, so it can be tested on a computer.
 */

const CATEGORIES = [
  { slug: 'whey-protein', name: 'Whey Protein' },
  { slug: 'mass-gainer', name: 'Mass Gainer' },
  { slug: 'creatine', name: 'Creatine' },
  { slug: 'pre-workout', name: 'Pre-Workout' },
  { slug: 'bcaa', name: 'BCAA' },
  { slug: 'eaa', name: 'EAA' },
  { slug: 'glutamine', name: 'Glutamine' },
  { slug: 'fish-oil', name: 'Fish Oil' },
  { slug: 'multivitamin', name: 'Multivitamin' },
  { slug: 'minerals', name: 'Minerals' },
  { slug: 'protein-oats', name: 'Protein Oats' },
];

const UNITS = ['g', 'ml', 'tablets', 'capsules', 'softgels'];

// Column headers the owner may use for each field (matched ignoring case, spaces and symbols),
// so renaming "Price" to "Price (₹)" does not break anything. Same lists as catalog.js.
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
  stock: ['stock', 'qty', 'quantity', 'in stock'],
  image: ['image', 'photo', 'image file', 'picture'],
  description: ['description', 'desc', 'details'],
  netQty: ['netqty', 'net qty', 'net quantity', 'net weight'],
  unit: ['unit', 'net unit'],
  bestBefore: ['bestbefore', 'best before', 'expiry', 'use by'],
  bestseller: ['bestseller', 'best seller'],
  badge: ['badge', 'tag'],
  sort: ['sort', 'order', 'position'],
  keywords: ['keywords', 'search words', 'aliases'],
};

// Only used by this script (not by the website).
const CHECK_COLUMN = ['check', 'problems'];

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

// Settings: key -> [type, default, public]. Public ones are sent to the browser in the live feed.
const SETTINGS = {
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
  ShowLowStockAt: ['int', 3, true],
  MaxQtyPerLine: ['int', 10, true],
  MaxOpenOrdersPerPhone: ['int', 3, false],
  MinDaysLeft: ['int', 45, false],
  RequireVerified: ['bool', true, false],
  AllowPuducherry: ['bool', true, true],
  AlertEmail: ['text', '', false],
  ReviewLink: ['text', '', true],
};

/* ---------- small parsers (same as catalog.js) ---------- */

function normKey(s) {
  return String(s === null || s === undefined ? '' : s).toLowerCase().replace(/[^a-z0-9]/g, '');
}

function text(v) {
  return v === null || v === undefined ? '' : String(v).trim();
}

function parseMoney(v) {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  const s = String(v === null || v === undefined ? '' : v).replace(/₹|rs\.?|inr|,|\s/gi, '');
  if (s === '') return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function parseIntSafe(v, fallback) {
  if (fallback === undefined) fallback = 0;
  const n = parseMoney(v);
  return n === null ? fallback : Math.trunc(n);
}

function parseBool(v) {
  if (typeof v === 'boolean') return v;
  return ['true', 'yes', 'y', '1', 'on', 'open', '✓', '✔'].indexOf(text(v).toLowerCase()) !== -1;
}

// Accepts 2026-12-31, 31/12/2026, 31-12-2026, 12/2026 (end of month) or an ISO timestamp.
// (Dates typed into the sheet are turned into YYYY-MM-DD text before they reach this.)
function parseDate(v) {
  if (v === null || v === undefined || v === '') return null;
  if (v instanceof Date) return isNaN(v) ? null : v.toISOString().slice(0, 10);
  const s = String(v).trim();
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return isoDate_(+m[1], +m[2], +m[3]);
  m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/);
  if (m) return isoDate_(+m[3], +m[2], +m[1]);
  m = s.match(/^(\d{1,2})[/.-](\d{4})$/);
  if (m) return isoDate_(+m[2], +m[1], new Date(Date.UTC(+m[2], +m[1], 0)).getUTCDate());
  return null;
}

function isoDate_(y, mo, d) {
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  return y + '-' + String(mo).padStart(2, '0') + '-' + String(d).padStart(2, '0');
}

function slugify(s) {
  return String(s === null || s === undefined ? '' : s)
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

function categoryFor(value) {
  const k = normKey(value);
  if (!k) return null;
  for (let i = 0; i < CATEGORIES.length; i++) {
    if (normKey(CATEGORIES[i].name) === k || normKey(CATEGORIES[i].slug) === k) return CATEGORIES[i];
  }
  return null;
}

// Map one sheet row (object keyed by header text) onto our field names.
function mapRow(row, columns) {
  const byKey = new Map(Object.keys(row).map((k) => [normKey(k), row[k]]));
  const out = {};
  Object.keys(columns).forEach((field) => {
    const aliases = columns[field];
    for (let i = 0; i < aliases.length; i++) {
      const k = normKey(aliases[i]);
      if (byKey.has(k)) {
        out[field] = byKey.get(k);
        break;
      }
    }
  });
  return out;
}

// Column number (0-based) for a field in a header row, with the same matching as mapRow. -1 = missing.
function findCol(header, aliases) {
  const idx = new Map();
  header.forEach((h, i) => {
    if (text(h)) idx.set(normKey(h), i); // a later duplicate wins, like mapRow
  });
  for (let i = 0; i < aliases.length; i++) {
    const k = normKey(aliases[i]);
    if (idx.has(k)) return idx.get(k);
  }
  return -1;
}

/* ---------- settings, delivery, visibility (same as catalog.js) ---------- */

function normalizeSettings(raw) {
  raw = raw || {};
  const byKey = new Map(Object.keys(raw).map((k) => [normKey(k), raw[k]]));
  const out = {};
  Object.keys(SETTINGS).forEach((key) => {
    const type = SETTINGS[key][0];
    const def = SETTINGS[key][1];
    const has = byKey.has(normKey(key)) && text(byKey.get(normKey(key))) !== '';
    const v = has ? byKey.get(normKey(key)) : def;
    if (type === 'money') {
      const n = parseMoney(v);
      out[key] = n === null ? def : n;
    } else if (type === 'int') out[key] = parseIntSafe(v, def);
    else if (type === 'bool') out[key] = has ? parseBool(v) : def;
    else if (type === 'choice') out[key] = /^closed$/i.test(text(v)) ? 'Closed' : 'Open';
    else out[key] = text(v);
  });
  return out;
}

function publicSettings(settings) {
  const out = {};
  Object.keys(SETTINGS).forEach((key) => {
    if (SETTINGS[key][2]) out[key] = settings[key];
  });
  return out;
}

function normalizeDelivery(rows) {
  return (rows || [])
    .map((r) => mapRow(r, DELIVERY_COLUMNS))
    .filter((r) => text(r.area) && (r.active === undefined || text(r.active) === '' || parseBool(r.active)))
    .map((r) => ({
      area: text(r.area),
      pincodes: text(r.pincodes).split(/[^0-9]+/).filter((p) => /^\d{6}$/.test(p)),
      fee: parseMoney(r.fee),
      eta: text(r.eta),
    }));
}

function daysUntil(isoDate, today) {
  if (!isoDate) return null;
  const a = Date.parse(isoDate + 'T00:00:00Z');
  const b = Date.parse(today + 'T00:00:00Z');
  return Math.floor((a - b) / 86400000);
}

// The single rule for whether a variant can be bought online.
function variantVisible(v, settings, today) {
  if (!v.active) return false;
  if (settings.RequireVerified && !v.verified) return false;
  if (!(v.price > 0)) return false;
  const left = daysUntil(v.bestBefore, today);
  if (left !== null && left < settings.MinDaysLeft) return false;
  return true;
}

/**
 * Same steps as normalizeCatalog() in catalog.js, keeping only what the live feed and
 * orders need. raw = { products:[rowObject], settings:{Key:value}, delivery:[rowObject] }.
 * Returns { products (groups, sorted like the site), settings, delivery, byId, warnings }.
 * byId: variant ID -> { id, brand, name, size, flavour, price, mrp, stock, visible, row (0 = first data row) }
 */
function buildCatalogModel(raw, today) {
  const settings = normalizeSettings(raw.settings);
  const delivery = normalizeDelivery(raw.delivery);
  const warnings = [];
  const groups = new Map();
  const seenIds = new Set();
  const byId = new Map();
  (raw.products || []).forEach((r, i) => {
    const m = mapRow(r, PRODUCT_COLUMNS);
    const rowNo = i + 2;
    const id = text(m.id);
    if (!id && !text(m.name)) return; // blank row
    if (!id) return warnings.push('Row ' + rowNo + ': missing ID - skipped');
    if (seenIds.has(id)) return warnings.push('Row ' + rowNo + ': duplicate ID ' + id + ' - skipped');
    seenIds.add(id);
    const brand = text(m.brand);
    const name = text(m.name);
    if (!brand || !name) return warnings.push('Row ' + rowNo + ' (' + id + '): brand and name are required - skipped');
    const cat = categoryFor(m.category);
    if (!cat) return warnings.push('Row ' + rowNo + ' (' + id + '): unknown category - skipped');
    const price = parseMoney(m.price);
    const mrp = parseMoney(m.mrp);
    const slug = slugify(m.group) || slugify(brand + ' ' + name);
    const v = {
      id: id,
      size: text(m.size),
      flavour: text(m.flavour),
      price: price === null ? 0 : price,
      mrp: mrp !== null ? mrp : price !== null ? price : 0,
      stock: Math.max(0, parseIntSafe(m.stock, 0)),
      bestBefore: parseDate(m.bestBefore),
      active: m.active === undefined ? true : parseBool(m.active),
      verified: parseBool(m.verified),
    };
    if (price !== null && mrp !== null && price > mrp) v.active = false;
    v.visible = variantVisible(v, settings, today);
    v.brand = brand;
    v.name = name;
    v.row = i;
    let g = groups.get(slug);
    if (!g) {
      g = { slug: slug, brand: brand, name: name, sort: 9999, variants: [] };
      groups.set(slug, g);
    }
    const sort = parseMoney(m.sort);
    if (sort !== null) g.sort = Math.min(g.sort, sort);
    g.variants.push(v);
    byId.set(id, v);
  });
  const products = Array.from(groups.values())
    .filter((g) => g.variants.some((v) => v.active))
    .sort((a, b) => a.sort - b.sort || a.brand.localeCompare(b.brand) || a.name.localeCompare(b.name));
  return { products: products, settings: settings, delivery: delivery, byId: byId, warnings: warnings };
}

// Small, stable string hash (FNV-1a) - the same function as hashString() in catalog.js,
// so the script and the website give the same "v" for the same data.
function hashString(s) {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16);
}

// The live feed: same shape and key order as buildFeed() in catalog.js.
function buildFeed(model, at) {
  const items = {};
  model.products.forEach((p) => {
    p.variants.forEach((v) => {
      items[v.id] = [v.price, v.mrp, v.stock, v.visible ? 1 : 0];
    });
  });
  const body = { items: items, settings: publicSettings(model.settings), delivery: model.delivery };
  return { v: hashString(JSON.stringify(body)), at: at, items: body.items, settings: body.settings, delivery: body.delivery };
}

function todayIST(now) {
  now = now || new Date();
  return new Date(now.getTime() + 5.5 * 3600000).toISOString().slice(0, 10);
}

/* ---------- Product checks (the Check column) ---------- */

/**
 * raw = { products:[rowObject], info:[rowObject], settings:{} }.
 * Returns { checks: [text per data row, '' = OK], fills: [{ row, group }] (blank Group cells to fill),
 *           problemRows: number of active rows with a problem }.
 */
function productChecks(raw, today) {
  const settings = normalizeSettings(raw.settings);
  const infoGroups = new Set();
  (raw.info || []).forEach((r) => {
    const g = slugify(mapRow(r, INFO_COLUMNS).group);
    if (g) infoGroups.add(g);
  });
  const firstRow = new Map();
  const checks = [];
  const fills = [];
  let problemRows = 0;
  (raw.products || []).forEach((r, i) => {
    const m = mapRow(r, PRODUCT_COLUMNS);
    const id = text(m.id);
    const brand = text(m.brand);
    const name = text(m.name);
    if (!id && !brand && !name) return checks.push(''); // blank row
    const p = [];
    if (!id) p.push('Missing ID - row ignored');
    else if (firstRow.has(id)) p.push('Duplicate ID (same as row ' + (firstRow.get(id) + 2) + ') - row ignored');
    else firstRow.set(id, i);
    if (!brand || !name) p.push('Brand and Name needed - row ignored');
    if (!categoryFor(m.category)) p.push(text(m.category) ? 'Unknown category "' + text(m.category) + '" - row ignored' : 'Category missing - row ignored');
    const price = parseMoney(m.price);
    const mrp = parseMoney(m.mrp);
    if (price === null || price <= 0) p.push('Price missing - hidden');
    if (mrp === null) p.push('MRP missing');
    else if (price !== null && price > mrp) p.push('Price is above MRP - hidden');
    if (text(m.stock) === '') p.push('Stock blank (counts as 0)');
    else {
      const n = parseMoney(m.stock);
      if (n === null || !Number.isInteger(n) || n < 0) p.push('Stock must be a whole number');
    }
    if (text(m.bestBefore)) {
      const iso = parseDate(m.bestBefore);
      if (!iso) p.push('BestBefore is not a date (type it like 2027-03-31)');
      else {
        const left = daysUntil(iso, today);
        if (left < 0) p.push('Past BestBefore (' + iso + ') - hidden');
        else if (left < settings.MinDaysLeft) p.push('Only ' + left + ' days to BestBefore (MinDaysLeft is ' + settings.MinDaysLeft + ') - hidden');
      }
    }
    if (settings.RequireVerified && !parseBool(m.verified)) p.push('Not Verified - hidden until ticked');
    const nq = parseMoney(m.netQty);
    if (!(nq > 0)) p.push('NetQty missing');
    const unit = text(m.unit).toLowerCase();
    if (!unit) p.push('Unit missing');
    else if (UNITS.indexOf(unit) === -1) p.push('Unit must be one of ' + UNITS.join(', '));
    if (!text(m.image)) p.push('No image');
    const group = slugify(m.group) || slugify(brand + ' ' + name);
    if (group && !infoGroups.has(group)) p.push('No "Product info" row for group ' + group);
    if (m.group !== undefined && !text(m.group) && brand && name) fills.push({ row: i, group: slugify(brand + ' ' + name) });
    const active = m.active === undefined ? true : parseBool(m.active);
    if (p.length && active) problemRows++;
    checks.push(p.join('; '));
  });
  return { checks: checks, fills: fills, problemRows: problemRows };
}

/* ---------- Order rules (same as order.js) ---------- */

const PHONE_PATTERN = /^[6-9]\d{9}$/;
const PINCODE_PATTERN = /^6\d{5}$/;
const UTR_PATTERN = /^\d{12}$/;
const LIMITS = { name: 60, address: 240, landmark: 120, notes: 300, area: 80 };

function cleanPhone(raw) {
  let d = String(raw === null || raw === undefined ? '' : raw).replace(/\D/g, '');
  if (d.length === 12 && d.indexOf('91') === 0) d = d.slice(2);
  if (d.length === 11 && d.indexOf('0') === 0) d = d.slice(1);
  return d;
}

// Puducherry UT: 605xxx (Puducherry) and 6096xx (Karaikal).
function isPuducherryPincode(pin) {
  return /^605\d{3}$/.test(pin) || /^6096\d{2}$/.test(pin);
}

function pincodeProblem(pin, settings) {
  if (!PINCODE_PATTERN.test(pin)) return 'Enter a valid 6-digit Tamil Nadu or Puducherry pincode.';
  if (!settings.AllowPuducherry && isPuducherryPincode(pin)) return 'Sorry, we deliver only within Tamil Nadu right now.';
  return '';
}

function deliveryFeeFor(o) {
  if (o.fulfilment !== 'delivery') return 0;
  if (o.subtotal >= o.settings.FreeDeliveryAbove && o.settings.FreeDeliveryAbove > 0) return 0;
  const zone = (o.delivery || []).find((d) => d.area === o.area);
  return zone && zone.fee !== null && zone.fee !== undefined ? zone.fee : o.settings.DeliveryFee;
}

function paymentOptions(o) {
  const opts = ['upi'];
  if (o.fulfilment === 'pickup') opts.push('shop');
  else if (o.total <= o.settings.CODMax) opts.push('cod');
  return opts;
}

function trimTo(s, n) {
  return String(s === null || s === undefined ? '' : s).replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, '').trim().slice(0, n);
}

/** Validate checkout input. Returns { value, errors } with errors keyed by field (same as order.js). */
function validateCustomer(input, settings) {
  input = input || {};
  const c = {
    name: trimTo(input.name, LIMITS.name),
    phone: cleanPhone(input.phone),
    fulfilment: input.fulfilment === 'pickup' ? 'pickup' : 'delivery',
    area: trimTo(input.area, LIMITS.area),
    pincode: String(input.pincode === null || input.pincode === undefined ? '' : input.pincode).replace(/\D/g, ''),
    address: trimTo(input.address, LIMITS.address),
    landmark: trimTo(input.landmark, LIMITS.landmark),
    notes: trimTo(input.notes, LIMITS.notes),
  };
  const errors = {};
  if (c.name.length < 2) errors.name = 'Please enter your name.';
  if (!PHONE_PATTERN.test(c.phone)) errors.phone = 'Enter a 10-digit mobile number.';
  if (c.fulfilment === 'pickup' && !settings.PickupEnabled) errors.fulfilment = 'Store pickup is not available right now.';
  if (c.fulfilment === 'delivery') {
    if (!c.area) errors.area = 'Choose your area.';
    const p = pincodeProblem(c.pincode, settings);
    if (p) errors.pincode = p;
    if (c.address.length < 8) errors.address = 'Please enter your full address (door no., street, village).';
    if (c.landmark.length < 3) errors.landmark = 'A nearby landmark helps us find you.';
  } else {
    c.area = '';
    c.pincode = '';
    c.address = '';
    c.landmark = '';
  }
  return { value: c, errors: errors };
}

/* ---------- helpers for writing customer text safely into the sheet ---------- */

// Text starting with = + - @ would be run as a formula by Sheets. Put an apostrophe in front.
function guardText(s) {
  s = String(s);
  return /^[=+\-@]/.test(s) ? "'" + s : s;
}

// Undo guardText (Sheets may or may not keep the apostrophe when the cell is read back).
function unguardText(s) {
  s = String(s);
  return /^'[=+\-@]/.test(s) ? s.slice(1) : s;
}

// Customer text never needs to start with an apostrophe; removing it keeps guardText reversible.
function stripLeadingQuotes(s) {
  return String(s === null || s === undefined ? '' : s).replace(/^[\s']+/, '');
}

function round2(n) {
  return Math.round(n * 100) / 100;
}

// ₹5,499 / ₹1,25,000 / ₹99.50 (Indian digit grouping).
function formatRupees(n) {
  const v = round2(Number(n) || 0);
  const parts = Math.abs(v).toFixed(Number.isInteger(v) ? 0 : 2).split('.');
  let int = parts[0];
  if (int.length > 3) int = int.slice(0, -3).replace(/\B(?=(\d{2})+(?!\d))/g, ',') + ',' + int.slice(-3);
  return (v < 0 ? '-' : '') + '₹' + int + (parts[1] ? '.' + parts[1] : '');
}

// Constant-time string compare (for keys and order tokens).
function safeEqual(a, b) {
  a = String(a === null || a === undefined ? '' : a);
  b = String(b === null || b === undefined ? '' : b);
  let diff = a.length ^ b.length;
  const n = Math.max(a.length, b.length);
  for (let i = 0; i < n; i++) diff |= (a.charCodeAt(i) | 0) ^ (b.charCodeAt(i) | 0);
  return diff === 0 && a.length > 0;
}
