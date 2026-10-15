// Cloudflare Worker entry. The built site (dist/) is served as static assets
// without running this code; only /api/* reaches it (see wrangler.jsonc).
// The handlers in functions/api/ keep the Pages Functions shape, so this file
// just routes to them and passes the same { request, env, waitUntil } context.
import { onRequestGet as live } from '../functions/api/live.js';
import { onRequestPost as order } from '../functions/api/order.js';
import { onRequestPost as refresh } from '../functions/api/refresh.js';
import { onRequestPost as utr } from '../functions/api/utr.js';
import { fail } from '../functions/_lib/http.js';

const ROUTES = {
  '/api/live': { GET: live },
  '/api/order': { POST: order },
  '/api/refresh': { POST: refresh },
  '/api/utr': { POST: utr },
};

export default {
  async fetch(request, env, ctx) {
    const path = new URL(request.url).pathname.replace(/\/+$/, '');
    const route = ROUTES[path];
    if (!route) {
      if (path.startsWith('/api/')) return fail('not_found', 'Not found.', 404);
      return env.ASSETS.fetch(request);
    }
    const handler = route[request.method];
    if (!handler) return fail('method_not_allowed', 'Method not allowed.', 405);
    return handler({ request, env, waitUntil: (p) => ctx.waitUntil(p) });
  },
};
