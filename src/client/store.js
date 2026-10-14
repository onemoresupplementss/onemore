// Browser-side state shared by all islands on a page: the cart (kept in
// localStorage), the live price/stock feed, and the cart drawer.
import { useEffect, useState } from 'preact/hooks';
import { SHOW_PRICES, url } from '../lib/env.js';

function signal(initial) {
  let value = initial;
  const subs = new Set();
  return {
    get: () => value,
    set(next) {
      value = next;
      subs.forEach((fn) => fn(value));
    },
    sub(fn) {
      subs.add(fn);
      return () => subs.delete(fn);
    },
  };
}

export function useSignal(s) {
  const [v, setV] = useState(s.get());
  useEffect(() => {
    setV(s.get());
    return s.sub(setV);
  }, [s]);
  return v;
}

const isBrowser = typeof window !== 'undefined';

function storageGet(store, key, fallback) {
  try {
    const raw = store.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function storageSet(store, key, value) {
  try {
    store.setItem(key, JSON.stringify(value));
  } catch {
    // private mode or full - the cart still works for this page
  }
}

/* ---------- Cart ---------- */

const CART_KEY = 'om_cart_v1';
// Line: { id, qty, slug, brand, name, size, flavour, image, price }
export const cart = signal(isBrowser ? storageGet(localStorage, CART_KEY, []) : []);
export const cartOpen = signal(false);

function saveCart(lines) {
  cart.set(lines);
  if (isBrowser) storageSet(localStorage, CART_KEY, lines);
}

if (isBrowser) {
  window.addEventListener('storage', (e) => {
    if (e.key === CART_KEY) cart.set(storageGet(localStorage, CART_KEY, []));
  });
}

export function addToCart(line, qty = 1, max = 99) {
  const lines = cart.get().slice();
  const i = lines.findIndex((l) => l.id === line.id);
  if (i >= 0) lines[i] = { ...lines[i], ...line, qty: Math.min(lines[i].qty + qty, max) };
  else lines.push({ ...line, qty: Math.min(qty, max) });
  saveCart(lines);
}

export function setQty(id, qty) {
  saveCart(cart.get().map((l) => (l.id === id ? { ...l, qty } : l)).filter((l) => l.qty > 0));
}

export function removeFromCart(id) {
  saveCart(cart.get().filter((l) => l.id !== id));
}

export function clearCart() {
  saveCart([]);
}

export function cartCount(lines) {
  return lines.reduce((n, l) => n + l.qty, 0);
}

/* ---------- "Added to cart" notice ---------- */

// { text, id } while showing, else null. The cart drawer opens only when the customer asks.
export const toast = signal(null);
let toastTimer;
export function showAddedToast(text) {
  clearTimeout(toastTimer);
  toast.set({ text, id: Date.now() });
  toastTimer = setTimeout(() => toast.set(null), 3500);
}

/* ---------- Live feed ---------- */

// { items: { id: [price, mrp, stock, visible01] }, settings, delivery, at, live: bool }
export const feed = signal(null);
const FEED_CACHE = 'om_feed_v1';
const FEED_TTL = 60 * 1000;
let loading = null;

async function getJson(url) {
  const res = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error(String(res.status));
  return res.json();
}

/** Loads /api/live (the sheet's latest stock), falling back to the build snapshot. */
export function loadFeed({ fresh = false } = {}) {
  // WhatsApp mode has no prices or stock to load.
  if (!isBrowser || !SHOW_PRICES) return Promise.resolve(null);
  if (!fresh) {
    if (feed.get()) return Promise.resolve(feed.get());
    const cached = storageGet(sessionStorage, FEED_CACHE, null);
    if (cached && Date.now() - cached.t < FEED_TTL) {
      feed.set(cached.f);
      return Promise.resolve(cached.f);
    }
  }
  if (loading && !fresh) return loading;
  loading = getJson(url('/api/live'))
    .then((f) => ({ ...f, live: true }))
    .catch(() => getJson(url('/feed.json')).then((f) => ({ ...f, live: false })))
    .then((f) => {
      feed.set(f);
      storageSet(sessionStorage, FEED_CACHE, { t: Date.now(), f });
      return f;
    })
    .catch(() => null)
    .finally(() => {
      loading = null;
    });
  return loading;
}

/** Current price/stock for a variant: live feed when loaded, else the build-time values. */
export function liveVariant(v, f) {
  if (!f) return { price: v.price, mrp: v.mrp, stock: v.stock, buyable: true };
  const row = f.items?.[v.id];
  if (!row) return { price: v.price, mrp: v.mrp, stock: 0, buyable: false };
  const [price, mrp, stock, visible] = row;
  return { price, mrp, stock, buyable: visible === 1 };
}

/* ---------- Order source (ig / gbp / shop / bag) ---------- */

const SOURCE_KEY = 'om_src';
if (isBrowser) {
  const src = new URLSearchParams(location.search).get('src');
  if (src && /^(ig|gbp|shop|bag)$/.test(src)) storageSet(localStorage, SOURCE_KEY, src);
}
export function orderSource() {
  return isBrowser ? storageGet(localStorage, SOURCE_KEY, 'direct') : 'direct';
}

/* ---------- Saved orders (so the order page survives a reload) ---------- */

const ORDERS_KEY = 'om_orders_v1';
export function saveOrder(order, token, extra = {}) {
  const all = storageGet(localStorage, ORDERS_KEY, {});
  all[order.id] = { ...all[order.id], order, token, savedAt: Date.now(), ...extra };
  // keep the 10 most recent
  const keep = Object.entries(all).sort((a, b) => b[1].savedAt - a[1].savedAt).slice(0, 10);
  storageSet(localStorage, ORDERS_KEY, Object.fromEntries(keep));
}
export function getSavedOrder(id) {
  return storageGet(localStorage, ORDERS_KEY, {})[id] || null;
}
export function updateSavedOrder(id, patch) {
  const all = storageGet(localStorage, ORDERS_KEY, {});
  if (!all[id]) return;
  all[id] = { ...all[id], ...patch };
  storageSet(localStorage, ORDERS_KEY, all);
}
