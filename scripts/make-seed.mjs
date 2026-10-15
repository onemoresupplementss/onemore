// Generates the starter catalogue (placeholder prices, stock 5, no photos) from the
// owner's brand list. Writes:
//   data/seed/*.json         - used by the build when Google Sheets is not connected
//   sheets/*.csv             - can be imported into Google Sheets by hand
//   apps-script/SeedData.gs  - used by the setup function in the Apps Script
// Run: npm run seed
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { slugify } from '../src/shared/catalog.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

// [category, brand, name, sizes, flavour (or [flavours]), imported('Yes'|'No'|'Check'), extra]
// extra: { best: true, check: 'note', keywords: '' }
const C = (category, brand, name, sizes, flavour, imported, extra = {}) => ({ category, brand, name, sizes, flavour, imported, ...extra });
const CONFIRM_MT = 'Confirm: which 4 MuscleTech wheys do you stock? Rename/replace this row.';
const CONFIRM_NAME = 'Confirm the exact product name from the label.';
const CONFIRM_BRAND = 'Confirm the brand and product name from the label.';
// Name, brand and pack size taken from the owner's product photo (October 2026).
const FROM_PACK = 'Name from your pack photo – confirm the sizes and flavours you stock.';

const LIST = [
  // Whey
  C('Whey Protein', 'Optimum Nutrition', 'Gold Standard 100% Whey', ['1 kg', '2 kg'], 'Double Rich Chocolate', 'Yes', { best: true, keywords: 'on, gsw, gold standard, optimum' }),
  C('Whey Protein', 'Optimum Nutrition', 'Performance Whey', ['1 kg', '2 kg'], 'Chocolate', 'Yes', { keywords: 'on, optimum' }),
  C('Whey Protein', 'MuscleTech', 'Nitro-Tech Whey Gold', ['2 kg'], 'Chocolate', 'Yes', { best: true, check: CONFIRM_MT, keywords: 'nitrotech, nitro tech' }),
  C('Whey Protein', 'MuscleTech', 'Nitro-Tech Whey Protein', ['2 kg'], 'Milk Chocolate', 'Yes', { check: FROM_PACK, keywords: 'nitrotech, nitro tech' }),
  C('Whey Protein', 'MuscleTech', 'Platinum 100% Whey Isolate', ['2 kg'], 'Milk Chocolate', 'Yes', { check: FROM_PACK, keywords: 'isolate, platinum' }),
  C('Whey Protein', 'MuscleTech', 'Nitro-Tech Ripped', ['2 kg'], 'Chocolate Fudge Brownie', 'Yes', { check: FROM_PACK, keywords: 'nitrotech, nitro tech' }),
  C('Whey Protein', 'GNC', 'Pro Performance 100% Whey', ['2 kg'], 'Double Rich Chocolate', 'Check', { check: FROM_PACK }),
  C('Whey Protein', 'Apex Vitals', 'Whey 2 Pure', ['1 kg', '2 kg'], 'Yoghurt', 'Yes', { check: FROM_PACK, keywords: 'apex vital, whey2pure' }),
  C('Whey Protein', 'Myprotein', 'Impact Whey Protein', ['2 kg'], 'Chocolate Smooth', 'Yes', { keywords: 'my protein, impact' }),
  C('Whey Protein', 'Mutant', 'Mutant Whey', ['2 kg'], 'Chocolate', 'Yes'),
  C('Whey Protein', 'BSN', 'Syntha-6', ['2 kg'], 'Chocolate Milkshake', 'Yes', { keywords: 'syntha 6, syntha6' }),
  C('Whey Protein', 'Kevin Levrone', 'Anabolic Iso Whey', ['2 kg'], 'Chocolate', 'Yes', { check: FROM_PACK, keywords: 'levrone, levro, isolate' }),
  C('Whey Protein', 'Kevin Levrone', 'Levro Whey Supreme', ['2 kg'], 'Chocolate', 'Yes', { check: FROM_PACK, keywords: 'levrone, levro, supreme whey' }),
  C('Whey Protein', 'Ronnie Coleman', 'Pro-Antium', ['1 kg', '2 kg'], 'Cookies & Cream', 'Yes', { check: FROM_PACK, keywords: 'rc, pro antium, proantium' }),
  C('Whey Protein', 'Dignity', 'Whey Protein', ['2 kg'], 'Chocolate', 'Check', { check: FROM_PACK }),
  C('Whey Protein', 'ProSupps', 'Whey', ['2 kg'], 'Cold Coffee', 'Yes', { check: FROM_PACK, keywords: 'pro supps, whey protein' }),
  C('Whey Protein', 'Atom', 'Whey Protein', ['2 kg'], 'Chocolate', 'No', { keywords: 'asitis, as-it-is' }),
  C('Whey Protein', 'Gibbon', 'My Whey', ['1 kg', '2 kg'], 'Swiss Chocolate', 'Check'),
  C('Whey Protein', 'Balkan Pharma', 'Prime Whey Extreme', ['2 kg'], 'Milk Chocolate', 'Yes', { check: FROM_PACK, keywords: 'balkan, prime whey' }),
  C('Whey Protein', 'ELEV', 'Tri Whey', ['2 kg'], 'Triple Chocolate', 'Check', { check: FROM_PACK, keywords: 'triwhey, tri whey' }),
  C('Whey Protein', 'MuscleBlaze', 'Biozyme Performance Whey', ['1 kg', '2 kg'], 'Rich Milk Chocolate', 'No', { best: true, check: FROM_PACK, keywords: 'mb, muscle blaze' }),
  C('Whey Protein', 'One Science', 'Premium Whey Protein', ['1 kg', '2 kg'], 'Chocolate Charge', 'Check', { check: FROM_PACK }),
  C('Whey Protein', 'One Science', 'Nitra Whey', ['2 kg'], 'Chocolate', 'Check', { check: FROM_PACK }),
  // Mass gainer
  C('Mass Gainer', 'Kevin Levrone', 'Legendary Mass', ['3 kg'], 'Chocolate', 'Yes', { check: FROM_PACK, keywords: 'levrone, levro, gainer' }),
  C('Mass Gainer', 'Optimum Nutrition', 'Serious Mass', ['3 kg'], 'Chocolate', 'Yes', { best: true, keywords: 'on, gainer' }),
  C('Mass Gainer', 'MuscleBlaze', 'Super Gainer XXL', ['3 kg'], 'Chocolate', 'No', { check: CONFIRM_NAME, keywords: 'mb, gainer' }),
  C('Mass Gainer', 'Labrada', 'Muscle Mass Gainer', ['3 kg'], 'Chocolate', 'Yes', { keywords: 'gainer' }),
  C('Mass Gainer', 'Gibbon', 'Mass Gainer', ['3 kg'], 'Cookies Cream', 'Check', { check: FROM_PACK }),
  C('Mass Gainer', 'One Science', 'Anabolic Mass', ['5 kg'], 'Mango', 'No', { check: FROM_PACK, keywords: 'gainer, super mass gainer' }),
  C('Mass Gainer', 'MaxN', 'Mass Gainer', ['2.7 kg'], 'Choco Hazelnut', 'Check', { check: FROM_PACK }),
  C('Mass Gainer', 'Dignity', 'Maxxx Gain', ['3 kg'], 'Chocolate', 'Check', { check: FROM_PACK, keywords: 'max gain, gainer' }),
  C('Mass Gainer', 'Bodyholic Nutrition', 'Hulk Mass Gainer', ['2.7 kg'], 'Chocolate', 'Check', { check: FROM_PACK, keywords: 'hulk, gainer' }),
  // Creatine
  C('Creatine', 'Optimum Nutrition', 'Micronized Creatine Powder', ['250 g'], 'Unflavoured', 'Yes', { best: true, keywords: 'on, creatine monohydrate' }),
  C('Creatine', 'MuscleBlaze', 'Creatine Monohydrate', ['250 g'], 'Unflavoured', 'No', { keywords: 'mb' }),
  C('Creatine', 'Wellcore', 'Micronised Creatine Monohydrate', ['250 g'], 'Unflavoured', 'No'),
  C('Creatine', 'MuscleTech', 'Platinum 100% Creatine', ['400 g'], 'Unflavoured', 'Yes', { check: FROM_PACK }),
  // Glutamine, EAA, BCAA
  C('Glutamine', 'MuscleTech', 'Platinum 100% Glutamine', ['300 g'], 'Unflavoured', 'Yes'),
  C('EAA', 'MuscleTech', 'EAA+ Energy', ['396 g'], 'Sour Apple', 'Yes', { check: FROM_PACK, keywords: 'eaa, essential amino acids' }),
  C('BCAA', 'Xtend', 'Original BCAA', ['30 servings'], 'Blue Raspberry Ice', 'Yes', { check: 'Fill NetQty/Unit from the label.', keywords: 'scivation' }),
  C('BCAA', 'Optimum Nutrition', 'Instantized BCAA 5000 Powder', ['250 g'], 'Green Apple', 'Yes', { check: FROM_PACK, keywords: 'on, onn, bcaa' }),
  // Fish oil
  C('Fish Oil', 'YouWeFit', 'Omega-3 Fish Oil', ['30 capsules'], '', 'No', { check: FROM_PACK, keywords: 'wellversed, omega 3' }),
  C('Fish Oil', 'Optimum Nutrition', 'Fish Oil', ['100 softgels'], '', 'Yes', { keywords: 'on, omega 3' }),
  C('Fish Oil', 'MuscleTech', 'Platinum Fish Oil', ['100 softgels'], '', 'Yes', { keywords: 'omega 3' }),
  C('Fish Oil', 'Wellbeing Nutrition', 'Slow Triple Strength Omega-3', ['60 capsules'], '', 'No', { check: FROM_PACK, keywords: 'slow, omega 3' }),
  C('Fish Oil', 'MaxN', 'Fish Oil', ['60 softgels'], '', 'Check', { keywords: 'omega 3' }),
  // Multivitamin, minerals
  C('Multivitamin', 'Optimum Nutrition', 'Opti-Men', ['150 tablets'], '', 'Yes', { keywords: 'on, optimen, multi vitamin' }),
  C('Multivitamin', 'Atom', 'Multivitamin', ['60 capsules'], '', 'No', { keywords: 'asitis, multi vitamin' }),
  C('Multivitamin', 'MuscleTech', 'Platinum Multivitamin', ['90 tablets'], '', 'Yes', { keywords: 'multi vitamin' }),
  C('Multivitamin', 'MaxN', 'Multivitamin', ['60 tablets'], '', 'Check', { keywords: 'multi vitamin' }),
  C('Minerals', 'Wellbeing Nutrition', 'Slow Triple Magnesium Complex', ['60 capsules'], '', 'No', { check: FROM_PACK, keywords: 'slow, magnesium, slow mag' }),
  // Pre-workout
  C('Pre-Workout', 'Cellucor', 'C4 Original', ['30 servings'], 'Fruit Punch', 'Yes', { best: true, check: 'Fill NetQty/Unit from the label.', keywords: 'c4, preworkout' }),
  C('Pre-Workout', 'Wellversed', 'Dynamite Pre-Workout Original', ['420 g'], 'Valencia Orange', 'No', { check: FROM_PACK, keywords: 'dynamite, preworkout' }),
  C('Pre-Workout', 'Wellversed', 'Dynamite Pre-Workout Extreme', ['270 g'], 'Chilli Guava', 'No', { check: FROM_PACK, keywords: 'dynamite, preworkout' }),
  C('Pre-Workout', 'MuscleBlaze', 'Wrath X Pre-Workout', ['540 g'], 'Fruit Fury', 'No', { check: FROM_PACK, keywords: 'wrath, mb, preworkout' }),
  C('Pre-Workout', 'Optimum Nutrition', 'Gold Standard Pre-Workout', ['30 servings'], 'Fruit Punch', 'Yes', { check: 'Fill NetQty/Unit from the label.', keywords: 'on, preworkout' }),
  C('Pre-Workout', 'One Science', 'Psycho Pump', ['330 g'], 'Fruit Punch', 'No', { check: FROM_PACK, keywords: 'psycho, preworkout' }),
  C('Pre-Workout', 'Deja Vu', 'Pre-Workout', ['400 g'], 'Lychee', 'Check', { check: CONFIRM_BRAND, keywords: 'dejavu, preworkout' }),
  C('Pre-Workout', 'Gaspari', 'SuperPump Aggression', ['30 servings'], 'Fruit Punch Fury', 'Yes', { check: FROM_PACK + ' Fill NetQty/Unit.', keywords: 'superpump, super pump, preworkout' }),
  C('Pre-Workout', 'Power Fuel Nutrition', 'Murphy Pre-Workout', ['300 g'], 'Mango', 'No', { check: FROM_PACK, keywords: 'murphy, pfn, preworkout' }),
  C('Pre-Workout', 'ProManiax', 'Blood Lock Stim Loaded', ['315 g'], 'Cola Burst', 'No', { check: FROM_PACK, keywords: 'bloodlock, blood lock, preworkout' }),
  // Protein oats
  C('Protein Oats', 'One Science', 'Daily High Protein Oats', ['900 g'], 'Dark Chocolate', 'No', { check: 'Photo shows the 400 g pack.', keywords: 'oats, breakfast' }),
  C('Protein Oats', "Doctor's Choice", 'Protein Oats', ['750 g', '2 kg'], ['Banana', 'Strawberry', 'Chocolate'], 'No', { check: 'Photo shows the Strawberry 750 g pack.', keywords: 'oats, doctors choice, dr choice, breakfast' }),
  C('Protein Oats', 'Alpino', 'High Protein Super Oats', ['1 kg', '2 kg'], 'Dark Chocolate', 'No', { check: 'Photo shows the Classic Coffee pack.', keywords: 'oats, super oats, breakfast' }),
];

// Placeholder prices [price, mrp] - the owner replaces all of these in the sheet.
function placeholderPrice(category, size) {
  const table = {
    'Whey Protein': { '1 kg': [2999, 3499], '2 kg': [5499, 6499] },
    'Mass Gainer': { '3 kg': [3999, 4699] },
    Creatine: { '250 g': [899, 1199] },
    Glutamine: { '300 g': [1699, 1999] },
    EAA: [1999, 2499],
    BCAA: [1999, 2499],
    'Fish Oil': [999, 1299],
    Multivitamin: [899, 1199],
    Minerals: [699, 899],
    'Pre-Workout': [2499, 2999],
    'Protein Oats': [499, 599],
  };
  const t = table[category];
  return Array.isArray(t) ? t : t[size] || [1999, 2499];
}

function netQty(size) {
  const m = size.match(/^([\d.]+)\s*(kg|g|ml|l|tablets|capsules|softgels)$/i);
  if (!m) return ['', ''];
  const n = Number(m[1]);
  const u = m[2].toLowerCase();
  if (u === 'kg') return [n * 1000, 'g'];
  if (u === 'l') return [n * 1000, 'ml'];
  return [n, u];
}

function abbr(s) {
  // Split "MuscleBlaze" -> Muscle Blaze so it becomes MB (not MUSC, which MuscleTech also gets).
  const words = s.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/[^A-Za-z0-9 ]+/g, ' ').split(/\s+/).filter(Boolean);
  if (words.length === 1) return words[0].slice(0, 4).toUpperCase();
  return words.map((w) => (/^\d+$/.test(w) ? w : w[0])).join('').toUpperCase().slice(0, 5);
}

function sizeCode(size) {
  return size
    .replace(/servings?/i, 'SV')
    .replace(/softgels?/i, 'SG')
    .replace(/tablets?/i, 'TB')
    .replace(/capsules?/i, 'CP')
    .replace(/[^0-9a-z]/gi, '')
    .toUpperCase();
}

const products = [];
const info = [];
const usedIds = new Set();
let sort = 10;
for (const item of LIST) {
  const group = slugify(`${item.brand} ${item.name}`);
  const verified = item.imported === 'No';
  // Photos made with scripts/add-photos.mjs are named after the group.
  const image = existsSync(join(root, 'public/products', `${group}.webp`)) ? `${group}.webp` : '';
  // One row per size × flavour. Several flavours add a flavour code to the ID (DC-PO-750G-BANA).
  const flavours = Array.isArray(item.flavour) ? item.flavour : [item.flavour];
  for (const [size, flavour] of item.sizes.flatMap((s) => flavours.map((f) => [s, f]))) {
    const [price, mrp] = placeholderPrice(item.category, size);
    const [nq, unit] = netQty(size);
    let id = `${abbr(item.brand)}-${abbr(item.name)}-${sizeCode(size)}${flavours.length > 1 ? '-' + abbr(flavour) : ''}`;
    let n = 2;
    while (usedIds.has(id)) id = `${id.replace(/-\d+$/, '')}-${n++}`;
    usedIds.add(id);
    const checks = [image ? 'Placeholder price and stock – replace. Photo is from the brand website; swap for your own shelf photo when you can.' : 'Placeholder price, stock and photo – replace.'];
    if (item.check) checks.push(item.check);
    if (!verified) checks.push('Tick Verified after checking the Indian importer sticker and distributor bill.');
    products.push({
      ID: id,
      Group: group,
      Active: true,
      Verified: verified,
      Brand: item.brand,
      Name: item.name,
      Category: item.category,
      Size: size,
      Flavour: flavour,
      Price: price,
      MRP: mrp,
      Stock: 5,
      Image: image,
      Description: '',
      NetQty: nq,
      Unit: unit,
      BestBefore: '',
      Bestseller: Boolean(item.best),
      Badge: '',
      Sort: sort,
      Keywords: item.keywords || '',
      Check: checks.join(' '),
    });
  }
  const isPre = item.category === 'Pre-Workout';
  info.push({
    Group: group,
    GenericName: item.category === 'Protein Oats' ? 'High-protein oats – breakfast cereal' : `${item.category} – Health Supplement`,
    VegNonVeg: '',
    Ingredients: '',
    Nutrition: '',
    Warnings: isPre ? '[Copy the caffeine/stimulant warnings from the label]' : '',
    Manufacturer: '',
    Importer: '',
    CountryOfOrigin: '',
    ConsumerCare: '',
    LabelImages: '',
    Imported: item.imported,
  });
  sort += 10;
}

const settings = [
  ['AcceptingOrders', 'Open', 'Open or Closed. Closed hides checkout and shows ClosedMessage.'],
  ['ClosedMessage', 'We are not taking online orders right now. Please call or WhatsApp us.', ''],
  ['Announcement', 'Delivery in Thiruthuraipoondi & nearby · Store pickup · Order on WhatsApp', 'Text in the top bar. Leave blank to hide.'],
  ['PreviewBanner', 'Yes', 'Yes shows "Prices are placeholders" on every page. Set No at launch.'],
  ['DeliveryFee', 40, 'Flat delivery charge in ₹ (a Delivery-tab Fee overrides it for that area).'],
  ['FreeDeliveryAbove', 2999, 'Orders at or above this subtotal get free delivery. 0 = never free.'],
  ['CODMax', 10000, 'Highest order total allowed for pay on delivery.'],
  ['CallFirstCODAbove', 3000, 'First-time pay-on-delivery orders above this are marked "call first".'],
  ['PickupEnabled', 'Yes', 'Yes/No – store pickup option at checkout.'],
  ['SameDayCutoff', '18:00', 'Orders after this time are delivered next day (shown at checkout).'],
  ['ShopHours', 'Mon–Sat 9 am – 9 pm', 'Shown on the site.'],
  ['ReplyPromise', 'We reply within 2 hours during shop hours.', 'Shown after an order is placed.'],
  ['ShowLowStockAt', 3, 'Show "Only N left" when stock is at or below this. 0 = never.'],
  ['MaxQtyPerLine', 10, 'Most units of one item in one order.'],
  ['MaxOpenOrdersPerPhone', 3, 'Unpaid New orders allowed per phone number.'],
  ['MinDaysLeft', 45, 'Hide a variant when fewer days than this remain before BestBefore.'],
  ['RequireVerified', 'Yes', 'Yes = only rows with Verified ticked are sold online.'],
  ['AllowPuducherry', 'Yes', 'Yes = accept Puducherry/Karaikal pincodes. Needs GST registration – set No if not registered.'],
  ['AlertEmail', '', 'Email for new-order alerts (leave blank if using Telegram).'],
  ['ReviewLink', '', 'Your Google review link (from your Business Profile).'],
  ['PublishNow', false, 'Tick to rebuild the website now (new products, names, photos). It unticks itself.'],
  ['SiteStatus', '', 'Written by the script: last sync time and any problems.'],
];

const delivery = [
  { Area: 'Thiruthuraipoondi town', Pincodes: '', Fee: '', ETA: 'Same day if ordered by 6 pm', Active: true },
  { Area: 'Villages around Thiruthuraipoondi', Pincodes: '', Fee: '', ETA: 'Same day or next day', Active: true },
  { Area: 'Muthupet', Pincodes: '', Fee: '', ETA: 'Next day', Active: true },
  { Area: 'Mannargudi', Pincodes: '', Fee: '', ETA: 'Next day', Active: true },
  { Area: 'Tiruvarur', Pincodes: '', Fee: '', ETA: 'Next day', Active: true },
  { Area: 'Vedaranyam', Pincodes: '', Fee: '', ETA: 'Next day', Active: true },
  { Area: 'Karaikal (Puducherry)', Pincodes: '', Fee: 80, ETA: '1–2 days', Active: true },
  { Area: 'Puducherry', Pincodes: '', Fee: 120, ETA: '2–3 days', Active: true },
];

const seed = {
  products,
  info,
  settings: Object.fromEntries(settings.map(([k, v]) => [k, v])),
  settingsRows: settings,
  delivery,
};

function write(rel, content) {
  const p = join(root, rel);
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, content);
}

function csv(rows, headers) {
  const esc = (v) => {
    const s = v === true ? 'TRUE' : v === false ? 'FALSE' : String(v ?? '');
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [headers.join(','), ...rows.map((r) => headers.map((h) => esc(r[h])).join(','))].join('\n') + '\n';
}

write('data/seed/products.json', JSON.stringify(products, null, 2) + '\n');
write('data/seed/info.json', JSON.stringify(info, null, 2) + '\n');
write('data/seed/settings.json', JSON.stringify(seed.settings, null, 2) + '\n');
write('data/seed/delivery.json', JSON.stringify(delivery, null, 2) + '\n');
write('sheets/Products.csv', csv(products, Object.keys(products[0])));
write('sheets/Product info.csv', csv(info, Object.keys(info[0])));
write('sheets/Settings.csv', csv(settings.map(([Setting, Value, Notes]) => ({ Setting, Value, Notes })), ['Setting', 'Value', 'Notes']));
write('sheets/Delivery.csv', csv(delivery, Object.keys(delivery[0])));
write(
  'apps-script/SeedData.gs',
  '// Generated by scripts/make-seed.mjs - starter catalogue used by setupProductsFile().\n' +
    '// Do not edit by hand; edit the sheet instead.\n' +
    'var SEED = ' + JSON.stringify({ products, info, settingsRows: settings, delivery }) + ';\n',
);
console.log(`Seed written: ${products.length} variants in ${info.length} products.`);
