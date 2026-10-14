// GET /api/live - latest prices, stock and public settings, as pushed by the sheet.
// Pages fall back to /feed.json (built with the site) when this has nothing.
import { readFeedText } from '../_lib/feed.js';
import { json } from '../_lib/http.js';

const MAX_AGE = 30;

export async function onRequestGet({ request, env, waitUntil }) {
  const cache = typeof caches !== 'undefined' ? caches.default : null;
  const cacheKey = new Request(new URL('/api/live', request.url).toString());
  if (cache) {
    const hit = await cache.match(cacheKey);
    if (hit) return hit;
  }
  const text = await readFeedText(env);
  if (!text) return json({ ok: false, error: 'no_feed' }, 404);
  const res = new Response(text, {
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': `public, max-age=${MAX_AGE}` },
  });
  if (cache) waitUntil?.(cache.put(cacheKey, res.clone()));
  return res;
}
