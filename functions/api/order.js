// POST /api/order - place an order. The Apps Script re-prices the cart from the
// sheet, refuses items ticked "Out of stock", and gives the order its ORD- number.
import { createStore } from '../_lib/data/index.js';
import { currentSettings } from '../_lib/feed.js';
import { fail, json, readJson, sameOrigin, turnstileOk } from '../_lib/http.js';
import { validateCustomer } from '../../src/shared/order.js';

const IDEM = /^[A-Za-z0-9-]{16,64}$/;
const ITEM_ID = /^[A-Za-z0-9._-]{1,64}$/;
const SOURCES = ['ig', 'gbp', 'shop', 'bag', 'direct'];
const PAYMENTS = ['upi', 'cod', 'shop'];

// Script errors that mean "try again or send on WhatsApp" rather than "fix your order".
const UNAVAILABLE = ['busy', 'server_error', 'upstream_down', 'not_configured', 'unauthorized'];

export async function onRequestPost(context) {
  const { request, env } = context;
  if (!sameOrigin(request, env)) return fail('forbidden', 'Please order from the website.', 403);

  const { body, error } = await readJson(request, 8192);
  if (error) return fail('bad_request', 'The order could not be read. Please try again.');

  if (!IDEM.test(String(body.idemKey || ''))) return fail('bad_request', 'Please reload the page and try again.');
  const items = Array.isArray(body.items) ? body.items : [];
  if (items.length < 1 || items.length > 30) return fail('bad_request', 'Your cart is empty.');
  for (const it of items) {
    if (!it || !ITEM_ID.test(String(it.id)) || !Number.isInteger(it.qty) || it.qty < 1 || it.qty > 99) {
      return fail('bad_request', 'Something in your cart is not valid. Please remove it and add it again.');
    }
  }
  if (!PAYMENTS.includes(body.payment)) return fail('bad_request', 'Choose how you will pay.');

  const settings = await currentSettings(env);
  const { value: customer, errors } = validateCustomer(body.customer || {}, settings);
  if (Object.keys(errors).length) return fail('bad_request', Object.values(errors)[0], 400, { fields: errors });

  const ip = request.headers.get('CF-Connecting-IP');
  if (!(await turnstileOk(env, body.turnstile, ip))) {
    return fail('bot_check', 'Please complete the "I am human" check and try again.', 400);
  }

  const store = createStore(env);
  const out = await store.createOrder({
    idemKey: body.idemKey,
    items: items.map((it) => ({ id: String(it.id), qty: it.qty })),
    customer,
    payment: body.payment,
    coupon: String(body.coupon || '').toUpperCase().replace(/[^A-Z0-9-]/g, '').slice(0, 20),
    source: SOURCES.includes(body.source) ? body.source : 'direct',
  });

  if (out.ok) {
    // Email alert to the owner; runs after the customer already has the answer.
    context.waitUntil?.(store.notifyOrder(out.order.id).catch(() => {}));
    return json({ ok: true, order: out.order });
  }
  if (UNAVAILABLE.includes(out.error)) {
    console.error('createOrder failed', out.error, out.message);
    // Tell the customer it is our side, not their details, and what to do next.
    return fail('unavailable', outageMessage(out), 503, { reason: out.error });
  }
  return json({ ok: false, error: out.error, message: out.message || '', details: out.details }, out.error === 'bad_request' ? 400 : 409);
}

function outageMessage(out) {
  if (out.error === 'busy') return 'Many orders are coming in right now. Please wait a few seconds and tap Try again.';
  if (out.error === 'upstream_down' && /time/i.test(out.message || '')) {
    return 'Our order system is slow right now. Please wait a few seconds and tap Try again.';
  }
  return 'Our order system is not answering right now. Your details are fine – please try again in a minute.';
}
