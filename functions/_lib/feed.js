// The live price/stock feed that the Apps Script pushes to /api/refresh.
// Stored as one KV value under FEED_KEY (binding name: LIVE).
import { normalizeSettings } from '../../src/shared/catalog.js';

export const FEED_KEY = 'feed';

export async function readFeedText(env) {
  if (!env.LIVE) return null;
  return env.LIVE.get(FEED_KEY);
}

// Public settings from the latest feed, with defaults filled in for the rest.
export async function currentSettings(env) {
  try {
    const text = await readFeedText(env);
    if (text) return normalizeSettings(JSON.parse(text).settings || {});
  } catch {
    // ignore - fall back to defaults
  }
  return normalizeSettings({});
}

const num = (n) => typeof n === 'number' && Number.isFinite(n);

/** Checks and copies a pushed feed. Returns null when the shape is wrong. */
export function cleanFeed(body) {
  if (!body || typeof body !== 'object') return null;
  if (typeof body.v !== 'string' || !body.v || body.v.length > 64) return null;
  if (!body.items || typeof body.items !== 'object' || Array.isArray(body.items)) return null;
  const items = {};
  for (const [id, row] of Object.entries(body.items)) {
    if (id.length > 64 || !Array.isArray(row) || row.length !== 4 || !row.every(num)) return null;
    items[id] = [row[0], row[1], Math.max(0, Math.trunc(row[2])), row[3] ? 1 : 0];
  }
  const settings = body.settings && typeof body.settings === 'object' && !Array.isArray(body.settings) ? body.settings : {};
  const delivery = Array.isArray(body.delivery)
    ? body.delivery
        .filter((d) => d && typeof d.area === 'string')
        .map((d) => ({
          area: d.area.slice(0, 80),
          pincodes: Array.isArray(d.pincodes) ? d.pincodes.filter((p) => /^\d{6}$/.test(p)) : [],
          fee: num(d.fee) ? d.fee : null,
          eta: typeof d.eta === 'string' ? d.eta.slice(0, 80) : '',
        }))
    : [];
  return { v: body.v, at: typeof body.at === 'string' ? body.at : new Date().toISOString(), items, settings, delivery };
}
