// Site-wide switches used by both the pages and the browser code.
import { orderMode } from '../../shop.config.json';

// "whatsapp" (phase 1): no prices or stock on the site; the cart is sent to the shop as a WhatsApp message.
// "checkout" (phase 2): prices, live stock and the full checkout (needs Cloudflare + Google Sheets).
export const SHOW_PRICES = orderMode === 'checkout';

// GitHub Pages serves a project site from a sub-folder (https://user.github.io/onemore/),
// so every internal link and file path goes through url().
const BASE = import.meta.env.BASE_URL.replace(/\/$/, '');

/** url('/shop/') -> '/onemore/shop/' on GitHub Pages, '/shop/' on a domain of its own. */
export function url(path = '/') {
  return BASE + path;
}

/** A photo from the sheet: full https:// links stay as they are, file paths get the sub-folder. */
export function asset(src) {
  if (!src) return '';
  return /^https?:\/\//i.test(src) ? src : url('/' + String(src).replace(/^\/+/, ''));
}
