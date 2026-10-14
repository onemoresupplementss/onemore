// POST /api/utr - the customer adds their 12-digit UPI transaction ID (UTR) to
// their order. The token is the order's secret (its IdemKey), kept only in their browser.
import { createStore } from '../_lib/data/index.js';
import { fail, json, readJson, sameOrigin } from '../_lib/http.js';
import { UTR_PATTERN } from '../../src/shared/order.js';

export async function onRequestPost({ request, env }) {
  if (!sameOrigin(request, env)) return fail('forbidden', 'Please use the website.', 403);
  const { body, error } = await readJson(request, 1024);
  if (error) return fail('bad_request', 'Could not read that. Please try again.');

  const orderId = String(body.orderId || '');
  const token = String(body.token || '');
  const utr = String(body.utr || '').replace(/\s/g, '');
  if (!/^ORD-\d{4,}$/.test(orderId) || !/^[A-Za-z0-9-]{16,64}$/.test(token)) return fail('not_found', 'Order not found.', 404);
  if (!UTR_PATTERN.test(utr)) return fail('bad_request', 'The UTR is the 12-digit number in your UPI app’s payment details.');

  const out = await createStore(env).attachPaymentRef({ orderId, token, utr });
  if (out.ok) return json({ ok: true });
  if (out.error === 'not_found') return fail('not_found', 'Order not found.', 404);
  if (out.error === 'bad_request') return fail('bad_request', out.message || 'Please check the UTR.');
  return fail('unavailable', 'Could not save the UTR right now. Please send it on WhatsApp instead.', 503);
}
