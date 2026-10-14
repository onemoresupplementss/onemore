// POST /api/refresh - the Apps Script pushes the live feed here (header X-Refresh-Key).
// KV is written only when the feed's version hash changes, to stay inside the free tier.
import { FEED_KEY, cleanFeed, readFeedText } from '../_lib/feed.js';
import { fail, json, readJson, safeEqual } from '../_lib/http.js';

export async function onRequestPost({ request, env, waitUntil }) {
  if (!env.REFRESH_KEY || !safeEqual(request.headers.get('X-Refresh-Key'), env.REFRESH_KEY)) {
    return fail('unauthorized', 'Wrong refresh key.', 401);
  }
  if (!env.LIVE) return fail('not_configured', 'KV binding LIVE is missing.', 500);
  const { body, error } = await readJson(request, 512 * 1024);
  if (error) return fail('bad_request', 'Body is not valid JSON or too large.');
  const feed = cleanFeed(body);
  if (!feed) return fail('bad_request', 'Feed has the wrong shape.');

  const current = await readFeedText(env);
  let currentV = '';
  try {
    currentV = current ? JSON.parse(current).v : '';
  } catch {
    // stored value unreadable - overwrite it
  }
  if (currentV === feed.v) return json({ ok: true, changed: false });

  await env.LIVE.put(FEED_KEY, JSON.stringify(feed));
  if (typeof caches !== 'undefined') {
    waitUntil?.(caches.default.delete(new Request(new URL('/api/live', request.url).toString())));
  }
  return json({ ok: true, changed: true });
}
