import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildFeed, normalizeCatalog, normalizeSettings, variantVisible } from '../src/shared/catalog.js';
import { buildOrderListText, buildWhatsAppText, formatNetQty, deliveryFeeFor, paymentOptions, pincodeProblem, unitPrice, validateCustomer } from '../src/shared/order.js';

const seed = (f) => JSON.parse(readFileSync(new URL(`../data/seed/${f}.json`, import.meta.url)));
const settings = normalizeSettings({});

test('seed catalogue normalises without warnings', () => {
  const c = normalizeCatalog({ products: seed('products'), info: seed('info'), settings: seed('settings'), delivery: seed('delivery') }, { today: '2026-10-14' });
  assert.deepEqual(c.warnings, []);
  assert.equal(c.products.length, new Set(seed('products').map((p) => p.Group)).size);
  const ids = c.products.flatMap((p) => p.variants.map((v) => v.id));
  assert.equal(new Set(ids).size, ids.length);
});

test('header names are matched loosely', () => {
  const c = normalizeCatalog(
    { products: [{ 'Product ID': 'X-1', Brand: 'B', 'Product Name': 'N', Category: 'creatine', 'Price (₹)': '₹1,299', MRP: 1500, 'Sold out': 'yes', Verified: true }] },
    { today: '2026-10-14' },
  );
  assert.equal(c.products[0].variants[0].price, 1299);
  assert.equal(c.products[0].category, 'creatine');
  assert.equal(c.products[0].variants[0].soldOut, true);
});

test('price above MRP hides the variant with a warning', () => {
  const c = normalizeCatalog({ products: [{ ID: 'X', Brand: 'B', Name: 'N', Category: 'BCAA', Price: 900, MRP: 800, Verified: true }] }, { today: '2026-10-14' });
  assert.equal(c.products.length, 0);
  assert.match(c.warnings[0], /above MRP/);
});

test('visibility: active, verified, priced; out of stock stays listed', () => {
  const v = { active: true, verified: true, price: 100 };
  assert.equal(variantVisible(v, settings), true);
  assert.equal(variantVisible({ ...v, soldOut: true }, settings), true);
  assert.equal(variantVisible({ ...v, active: false }, settings), false);
  assert.equal(variantVisible({ ...v, verified: false }, settings), false);
  assert.equal(variantVisible({ ...v, verified: false }, { ...settings, RequireVerified: false }), true);
  assert.equal(variantVisible({ ...v, price: 0 }, settings), false);
});

test('Out of stock tick box: in the feed as 0, product not in stock when every option is out', () => {
  const row = (id, out) => ({ ID: id, Group: 'g', Brand: 'B', Name: 'N', Category: 'Creatine', Size: id, Price: 500, MRP: 600, 'Out of stock': out, Verified: true });
  const c = normalizeCatalog({ products: [row('A', true), row('B', '')] }, { today: '2026-10-14' });
  assert.deepEqual(buildFeed(c, 'x').items, { A: [500, 600, 0, 1], B: [500, 600, 1, 1] });
  assert.equal(c.products[0].inStock, true);
  const all = normalizeCatalog({ products: [row('A', true)] }, { today: '2026-10-14' });
  assert.equal(all.products[0].inStock, false);
});

test('WhatsApp mode: products without a price are still shown', () => {
  const raw = { products: [{ ID: 'X-1', Brand: 'B', Name: 'N', Category: 'Creatine', Price: '', Verified: true }] };
  assert.equal(normalizeCatalog(raw, { today: '2026-10-14' }).products[0].variants[0].visible, false);
  assert.equal(normalizeCatalog(raw, { today: '2026-10-14', requirePrice: false }).products[0].variants[0].visible, true);
});

test('WhatsApp order list: items, sizes, quantities and codes, no customer details', () => {
  const t = buildOrderListText(
    [
      { id: 'ON-GS100-2KG', brand: 'Optimum Nutrition', name: 'Gold Standard 100% Whey', size: '2 kg', flavour: 'Double Rich Chocolate', qty: 2 },
      { id: 'ON-OM-150TB', brand: 'Optimum Nutrition', name: 'Opti-Men', size: '150 tablets', flavour: '', qty: 1 },
    ],
    { name: 'oneMore' },
  );
  assert.equal(
    t,
    [
      'Hi oneMore, I would like to order:',
      '',
      '1. Optimum Nutrition – Gold Standard 100% Whey – 2 kg – Double Rich Chocolate × 2 (ON-GS100-2KG)',
      '2. Optimum Nutrition – Opti-Men – 150 tablets × 1 (ON-OM-150TB)',
      '',
      'Please confirm the price and availability.',
    ].join('\n'),
  );
  assert.doesNotMatch(t, /₹/);
});

test('feed hash changes only when data changes', () => {
  const c = normalizeCatalog({ products: seed('products'), settings: { RequireVerified: 'No' } }, { today: '2026-10-14' });
  const a = buildFeed(c, 'x');
  const b = buildFeed(c, 'y');
  assert.equal(a.v, b.v);
  c.products[0].variants[0].soldOut = !c.products[0].variants[0].soldOut;
  assert.notEqual(buildFeed(c, 'x').v, a.v);
});

test('delivery fee: pickup free, threshold free, zone fee, default', () => {
  const delivery = [{ area: 'Far', fee: 80 }, { area: 'Town', fee: null }];
  const s = { ...settings, DeliveryFee: 40, FreeDeliveryAbove: 2999 };
  assert.equal(deliveryFeeFor({ subtotal: 500, fulfilment: 'pickup', area: '', settings: s, delivery }), 0);
  assert.equal(deliveryFeeFor({ subtotal: 2999, fulfilment: 'delivery', area: 'Far', settings: s, delivery }), 0);
  assert.equal(deliveryFeeFor({ subtotal: 500, fulfilment: 'delivery', area: 'Far', settings: s, delivery }), 80);
  assert.equal(deliveryFeeFor({ subtotal: 500, fulfilment: 'delivery', area: 'Town', settings: s, delivery }), 40);
  assert.equal(deliveryFeeFor({ subtotal: 500, fulfilment: 'delivery', area: 'Elsewhere', settings: s, delivery }), 40);
});

test('payment options follow fulfilment and COD limit', () => {
  assert.deepEqual(paymentOptions({ fulfilment: 'pickup', total: 50000, settings }), ['upi', 'shop']);
  assert.deepEqual(paymentOptions({ fulfilment: 'delivery', total: 10000, settings }), ['upi', 'cod']);
  assert.deepEqual(paymentOptions({ fulfilment: 'delivery', total: 10001, settings }), ['upi']);
});

test('Puducherry pincodes follow AllowPuducherry', () => {
  assert.equal(pincodeProblem('605001', { AllowPuducherry: true }), '');
  assert.match(pincodeProblem('609602', { AllowPuducherry: false }), /Tamil Nadu/);
  assert.equal(pincodeProblem('614713', { AllowPuducherry: false }), '');
  assert.notEqual(pincodeProblem('560001', settings), '');
});

test('customer validation cleans phone and requires address for delivery', () => {
  const ok = validateCustomer({ name: 'Ravi', phone: '+91 98765-43210', fulfilment: 'delivery', area: 'Town', pincode: '614713', address: '12 North Street', landmark: 'Temple' }, settings);
  assert.deepEqual(ok.errors, {});
  assert.equal(ok.value.phone, '9876543210');
  const bad = validateCustomer({ name: 'R', phone: '12345', fulfilment: 'delivery' }, settings);
  assert.deepEqual(Object.keys(bad.errors).sort(), ['address', 'area', 'landmark', 'name', 'phone', 'pincode']);
  const pickup = validateCustomer({ name: 'Ravi', phone: '9876543210', fulfilment: 'pickup', address: 'x' }, settings);
  assert.deepEqual(pickup.errors, {});
  assert.equal(pickup.value.address, '');
});

test('unit price per Legal Metrology', () => {
  assert.equal(unitPrice(5499, 2000, 'g'), '₹2,749.50/kg');
  assert.equal(unitPrice(899, 250, 'g'), '₹3.60/g');
  assert.equal(unitPrice(999, 60, 'softgels'), '₹16.65/softgel');
});

test('WhatsApp message carries every field', () => {
  const order = {
    id: 'ORD-1001',
    created: '2026-10-14T06:30:00Z',
    method: 'upi',
    lines: [{ brand: 'ON', name: 'Gold Standard', size: '2 kg', flavour: 'Chocolate', qty: 1, price: 5499, lineTotal: 5499 }],
    subtotal: 5499,
    deliveryFee: 0,
    total: 5499,
    customer: { name: 'Ravi', phone: '9876543210', fulfilment: 'delivery', area: 'Town', pincode: '614713', address: '12 North St', landmark: 'Temple', notes: 'Call first' },
  };
  const t = buildWhatsAppText(order, { name: 'oneMore' }, { utr: '412345678901' });
  for (const s of ['ORD-1001', 'ON – Gold Standard – 2 kg – Chocolate × 1', '₹5,499', 'Ravi', '9876543210', '12 North St', 'Temple', 'Call first', 'UTR: 412345678901', 'Pending']) {
    assert.ok(t.includes(s), `missing ${s}`);
  }
  assert.match(buildWhatsAppText(order, { name: 'oneMore' }, { notSaved: true }), /NOT SAVED/);
});

test('net quantity reads naturally', () => {
  assert.equal(formatNetQty(2000, 'g'), '2 kg');
  assert.equal(formatNetQty(2270, 'g'), '2.27 kg');
  assert.equal(formatNetQty(750, 'g'), '750 g');
  assert.equal(formatNetQty(60, 'capsules'), '60 capsules');
  assert.equal(formatNetQty(0, 'g'), '');
});
