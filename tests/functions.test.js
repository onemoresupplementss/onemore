// Tests for the API handlers (functions/api/) and the Worker that routes to them, with a fake KV and a fake Apps Script.
import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { onRequestPost as order } from '../functions/api/order.js';
import { onRequestPost as utr } from '../functions/api/utr.js';
import { onRequestGet as live } from '../functions/api/live.js';
import { onRequestPost as refresh } from '../functions/api/refresh.js';
import worker from '../worker/index.js';

const SITE = 'https://shop.test';
let kv;
let env;
let calls;
let gasReply;
const realFetch = globalThis.fetch;

beforeEach(() => {
  kv = new Map();
  calls = [];
  env = {
    LIVE: { get: async (k) => kv.get(k) ?? null, put: async (k, v) => void kv.set(k, v) },
    APPS_SCRIPT_URL: 'https://script.test/exec',
    APPS_SCRIPT_KEY: 'k',
    REFRESH_KEY: 'refresh-secret',
  };
  gasReply = () => ({ ok: true, order: { id: 'ORD-1001' } });
  globalThis.fetch = async (url, init) => {
    const body = JSON.parse(init.body);
    calls.push(body);
    return new Response(JSON.stringify(gasReply(body)));
  };
});
afterEach(() => {
  globalThis.fetch = realFetch;
});

const post = (path, body, headers = { Origin: SITE }) =>
  new Request(SITE + path, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: typeof body === 'string' ? body : JSON.stringify(body) });

const goodOrder = {
  idemKey: '6f1c2d3e-4b5a-4c7d-8e9f-0a1b2c3d4e5f',
  items: [{ id: 'ON-GS100-2KG', qty: 1 }],
  customer: { name: 'Ravi', phone: '9876543210', fulfilment: 'delivery', area: 'Town', pincode: '614713', address: '12 North Street', landmark: 'Temple' },
  payment: 'upi',
  source: 'ig',
};

test('order: forwards a valid order and notifies the owner', async () => {
  const waits = [];
  const res = await order({ request: post('/api/order', goodOrder), env, waitUntil: (p) => waits.push(p) });
  assert.equal(res.status, 200);
  assert.equal((await res.json()).order.id, 'ORD-1001');
  await Promise.all(waits);
  assert.deepEqual(calls.map((c) => c.action), ['createOrder', 'notify']);
  assert.equal(calls[0].key, 'k');
  assert.equal(calls[0].data.source, 'ig');
});

test('order: rejects other websites', async () => {
  const res = await order({ request: post('/api/order', goodOrder, { Origin: 'https://evil.test' }), env });
  assert.equal(res.status, 403);
  assert.equal(calls.length, 0);
});

test('order: validates input before calling Google', async () => {
  for (const bad of [
    { ...goodOrder, idemKey: 'short' },
    { ...goodOrder, items: [] },
    { ...goodOrder, items: [{ id: 'X', qty: 0 }] },
    { ...goodOrder, items: [{ id: 'X', qty: 1.5 }] },
    { ...goodOrder, payment: 'card' },
    { ...goodOrder, customer: { ...goodOrder.customer, phone: '123' } },
  ]) {
    const res = await order({ request: post('/api/order', bad), env });
    assert.equal(res.status, 400, JSON.stringify(bad));
  }
  const res = await order({ request: post('/api/order', '{not json'), env });
  assert.equal(res.status, 400);
  assert.equal(calls.length, 0);
});

test('order: passes business errors through, maps outages to 503', async () => {
  gasReply = () => ({ ok: false, error: 'sold_out', details: [{ id: 'ON-GS100-2KG', available: 0 }] });
  let res = await order({ request: post('/api/order', goodOrder), env });
  assert.equal(res.status, 409);
  assert.equal((await res.json()).details[0].available, 0);

  gasReply = () => ({ ok: false, error: 'busy' });
  res = await order({ request: post('/api/order', goodOrder), env });
  assert.equal(res.status, 503);

  globalThis.fetch = async () => new Response('<html>Google error</html>');
  res = await order({ request: post('/api/order', goodOrder), env });
  assert.equal(res.status, 503);
});

test('order: Puducherry pincode blocked when the live feed says so', async () => {
  kv.set('feed', JSON.stringify({ v: '1', items: {}, settings: { AllowPuducherry: false }, delivery: [] }));
  const res = await order({ request: post('/api/order', { ...goodOrder, customer: { ...goodOrder.customer, pincode: '605001' } }), env });
  assert.equal(res.status, 400);
  assert.match((await res.json()).message, /Tamil Nadu/);
});

test('utr: checks format and token shape', async () => {
  let res = await utr({ request: post('/api/utr', { orderId: 'ORD-1001', token: goodOrder.idemKey, utr: '123' }), env });
  assert.equal(res.status, 400);
  res = await utr({ request: post('/api/utr', { orderId: 'bad', token: goodOrder.idemKey, utr: '412345678901' }), env });
  assert.equal(res.status, 404);
  gasReply = () => ({ ok: true });
  res = await utr({ request: post('/api/utr', { orderId: 'ORD-1001', token: goodOrder.idemKey, utr: '4123 4567 8901' }), env });
  assert.equal(res.status, 200);
  assert.equal(calls[0].data.utr, '412345678901');
});

const feed = { v: 'abc', at: '2026-10-14T10:00:00Z', items: { 'ON-GS100-2KG': [5499, 6499, 3, 1] }, settings: { DeliveryFee: 40 }, delivery: [{ area: 'Town', pincodes: ['614713', 'x'], fee: null, eta: 'Today' }] };

test('refresh: needs the key, stores only on change, live serves it', async () => {
  let res = await refresh({ request: post('/api/refresh', feed, { 'X-Refresh-Key': 'wrong' }), env });
  assert.equal(res.status, 401);
  res = await refresh({ request: post('/api/refresh', feed, { 'X-Refresh-Key': 'refresh-secret' }), env });
  assert.deepEqual(await res.json(), { ok: true, changed: true });
  res = await refresh({ request: post('/api/refresh', feed, { 'X-Refresh-Key': 'refresh-secret' }), env });
  assert.deepEqual(await res.json(), { ok: true, changed: false });

  res = await live({ request: new Request(SITE + '/api/live'), env });
  assert.equal(res.status, 200);
  const got = await res.json();
  assert.deepEqual(got.items['ON-GS100-2KG'], [5499, 6499, 3, 1]);
  assert.deepEqual(got.delivery[0].pincodes, ['614713']);
});

test('refresh: rejects a malformed feed', async () => {
  const res = await refresh({ request: post('/api/refresh', { ...feed, items: { X: [1, 2] } }, { 'X-Refresh-Key': 'refresh-secret' }), env });
  assert.equal(res.status, 400);
  assert.equal(kv.size, 0);
});

test('live: 404 before the first push', async () => {
  const res = await live({ request: new Request(SITE + '/api/live'), env });
  assert.equal(res.status, 404);
});

test('worker: routes /api/* to the handlers, everything else to the static files', async () => {
  const waited = [];
  const ctx = { waitUntil: (p) => waited.push(p) };
  const assets = [];
  const workerEnv = { ...env, ASSETS: { fetch: async (req) => (assets.push(new URL(req.url).pathname), new Response('page')) } };

  let res = await worker.fetch(post('/api/refresh', feed, { 'X-Refresh-Key': 'refresh-secret' }), workerEnv, ctx);
  assert.deepEqual(await res.json(), { ok: true, changed: true });
  res = await worker.fetch(new Request(SITE + '/api/live/'), workerEnv, ctx);
  assert.equal(res.status, 200);
  res = await worker.fetch(new Request(SITE + '/api/order'), workerEnv, ctx);
  assert.equal(res.status, 405);
  res = await worker.fetch(new Request(SITE + '/api/nope'), workerEnv, ctx);
  assert.equal(res.status, 404);
  res = await worker.fetch(new Request(SITE + '/shop/'), workerEnv, ctx);
  assert.equal(await res.text(), 'page');
  assert.deepEqual(assets, ['/shop/']);
});
