// Shop listing: search, brand/size/price filters and sort, all in the browser.
// The full product list is already in the page, so filtering needs no requests.
import { useEffect, useMemo, useState } from 'preact/hooks';
import ProductCard, { cardState } from './ProductCard.jsx';
import { feed, loadFeed, useSignal } from '../client/store.js';
import { SHOW_PRICES } from '../lib/env.js';
import { percentOff } from '../shared/order.js';

const PRICE_BANDS = [
  { key: 'u1000', label: 'Under ₹1,000', test: (p) => p < 1000 },
  { key: '1000-2999', label: '₹1,000 – ₹2,999', test: (p) => p >= 1000 && p < 3000 },
  { key: '3000-4999', label: '₹3,000 – ₹4,999', test: (p) => p >= 3000 && p < 5000 },
  { key: '5000', label: '₹5,000 and above', test: (p) => p >= 5000 },
];

const SORTS = [
  { key: 'featured', label: 'Featured' },
  { key: 'price-asc', label: 'Price: low to high', prices: true },
  { key: 'price-desc', label: 'Price: high to low', prices: true },
  { key: 'discount', label: 'Biggest discount', prices: true },
  { key: 'name', label: 'Name A–Z' },
].filter((o) => SHOW_PRICES || !o.prices);

const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

function searchText(p) {
  return norm([p.brand, p.name, p.categoryName, p.keywords, ...p.variants.map((v) => `${v.size} ${v.flavour}`)].join(' '));
}

function toggle(list, value) {
  return list.includes(value) ? list.filter((x) => x !== value) : [...list, value];
}

function readUrl() {
  if (typeof location === 'undefined') return {};
  const q = new URLSearchParams(location.search);
  const list = (k) => (q.get(k) || '').split(',').filter(Boolean);
  return { q: q.get('q') || '', brands: list('brand'), sizes: list('size'), prices: list('price'), sort: q.get('sort') || 'featured', stock: q.get('stock') === '1' };
}

export default function ShopBrowser({ products, settings }) {
  const f = useSignal(feed);
  const [state, setState] = useState({ q: '', brands: [], sizes: [], prices: [], sort: 'featured', stock: false });
  const [panel, setPanel] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    loadFeed();
    const fromUrl = readUrl();
    setState((s) => ({ ...s, ...fromUrl }));
    setReady(true);
  }, []);

  // Keep the address bar in step so a filtered list can be shared or reloaded.
  useEffect(() => {
    if (!ready) return;
    const q = new URLSearchParams();
    if (state.q) q.set('q', state.q);
    if (state.brands.length) q.set('brand', state.brands.join(','));
    if (state.sizes.length) q.set('size', state.sizes.join(','));
    if (state.prices.length) q.set('price', state.prices.join(','));
    if (state.sort !== 'featured') q.set('sort', state.sort);
    if (state.stock) q.set('stock', '1');
    const qs = q.toString();
    const url = location.pathname + (qs ? '?' + qs : '');
    if (url !== location.pathname + location.search) history.replaceState(null, '', url);
  }, [state, ready]);

  const s = f?.settings ? { ...settings, ...f.settings } : settings;
  const brands = useMemo(() => [...new Set(products.map((p) => p.brand))].sort(), [products]);
  const sizes = useMemo(() => {
    const all = [...new Set(products.flatMap((p) => p.variants.map((v) => v.size)).filter(Boolean))];
    return all.sort((a, b) => sizeValue(a) - sizeValue(b));
  }, [products]);
  const index = useMemo(() => new Map(products.map((p) => [p.slug, searchText(p)])), [products]);

  const rows = products.map((p) => ({ p, st: SHOW_PRICES ? cardState(p, f) : { inStock: true } }));
  const words = norm(state.q).split(' ').filter(Boolean);
  let shown = rows.filter(({ p, st }) => {
    if (words.length && !words.every((w) => index.get(p.slug).includes(w))) return false;
    if (state.brands.length && !state.brands.includes(p.brand)) return false;
    if (state.sizes.length && !p.variants.some((v) => state.sizes.includes(v.size))) return false;
    if (SHOW_PRICES && state.prices.length && !PRICE_BANDS.some((b) => state.prices.includes(b.key) && b.test(st.price))) return false;
    if (SHOW_PRICES && state.stock && !st.inStock) return false;
    return true;
  });
  const cmp = {
    featured: () => 0,
    'price-asc': (a, b) => a.st.price - b.st.price,
    'price-desc': (a, b) => b.st.price - a.st.price,
    discount: (a, b) => percentOff(b.st.price, b.st.mrp) - percentOff(a.st.price, a.st.mrp),
    name: (a, b) => `${a.p.brand} ${a.p.name}`.localeCompare(`${b.p.brand} ${b.p.name}`),
  }[SORTS.some((o) => o.key === state.sort) ? state.sort : 'featured'];
  // In-stock first, then the chosen order (sort is stable, so "featured" keeps the sheet's order).
  shown = shown.slice().sort((a, b) => Number(b.st.inStock) - Number(a.st.inStock) || cmp(a, b));

  const active = state.brands.length + state.sizes.length + (SHOW_PRICES ? state.prices.length + (state.stock ? 1 : 0) : 0);
  const set = (patch) => setState((x) => ({ ...x, ...patch }));

  const filters = (
    <div class="space-y-6">
      {SHOW_PRICES && (
        <label class="flex items-center gap-3 text-sm font-semibold">
          <input type="checkbox" class="size-5 accent-lime" checked={state.stock} onChange={(e) => set({ stock: e.currentTarget.checked })} />
          In stock only
        </label>
      )}
      <FilterGroup title="Brand">
        {brands.map((b) => (
          <button type="button" class="chip" aria-pressed={state.brands.includes(b)} onClick={() => set({ brands: toggle(state.brands, b) })}>
            {b}
          </button>
        ))}
      </FilterGroup>
      <FilterGroup title="Size">
        {sizes.map((z) => (
          <button type="button" class="chip" aria-pressed={state.sizes.includes(z)} onClick={() => set({ sizes: toggle(state.sizes, z) })}>
            {z}
          </button>
        ))}
      </FilterGroup>
      {SHOW_PRICES && (
        <FilterGroup title="Price">
          {PRICE_BANDS.map((b) => (
            <button type="button" class="chip" aria-pressed={state.prices.includes(b.key)} onClick={() => set({ prices: toggle(state.prices, b.key) })}>
              {b.label}
            </button>
          ))}
        </FilterGroup>
      )}
      {active > 0 && (
        <button type="button" class="text-sm font-semibold text-lime underline underline-offset-4" onClick={() => set({ brands: [], sizes: [], prices: [], stock: false })}>
          Clear all filters
        </button>
      )}
    </div>
  );

  return (
    <div class="lg:grid lg:grid-cols-[240px_1fr] lg:gap-8">
      <aside class="hidden lg:block" aria-label="Filters">
        {filters}
      </aside>
      <div>
        <div class="mb-4 flex flex-wrap items-center gap-2">
          <label class="relative min-w-0 flex-1 basis-full sm:basis-auto">
            <span class="sr-only">Search products</span>
            <input
              type="search"
              class="field pl-10"
              placeholder="Search whey, creatine, ON…"
              value={state.q}
              onInput={(e) => set({ q: e.currentTarget.value })}
              enterKeyHint="search"
            />
            <svg class="pointer-events-none absolute left-3 top-1/2 size-5 -translate-y-1/2 text-muted" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
              <circle cx="11" cy="11" r="7" />
              <path d="m20 20-3.5-3.5" />
            </svg>
          </label>
          <button type="button" class="btn btn-ghost lg:hidden" aria-expanded={panel} aria-controls="filter-panel" onClick={() => setPanel(!panel)}>
            Filters{active > 0 ? ` (${active})` : ''}
          </button>
          <label class="flex items-center gap-2 text-sm">
            <span class="sr-only sm:not-sr-only text-muted">Sort</span>
            <select class="field w-auto py-2" value={state.sort} onChange={(e) => set({ sort: e.currentTarget.value })}>
              {SORTS.map((o) => (
                <option value={o.key}>{o.label}</option>
              ))}
            </select>
          </label>
        </div>
        {panel && (
          <div id="filter-panel" class="card mb-4 p-4 lg:hidden">
            {filters}
          </div>
        )}
        <p class="mb-3 text-sm text-muted" aria-live="polite">
          {shown.length} {shown.length === 1 ? 'product' : 'products'}
        </p>
        {shown.length ? (
          <ul class="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4" role="list">
            {shown.map(({ p }, i) => (
              <li key={p.slug}>
                <ProductCard p={p} f={f} settings={s} eager={i < 2} />
              </li>
            ))}
          </ul>
        ) : (
          <div class="card p-8 text-center">
            <p class="font-bold">No products match.</p>
            <p class="mt-1 text-sm text-muted">Try fewer filters, or ask us on WhatsApp – we may have it in the shop.</p>
          </div>
        )}
      </div>
    </div>
  );
}

function FilterGroup({ title, children }) {
  return (
    <fieldset>
      <legend class="mb-2 text-xs font-black uppercase tracking-wider text-muted">{title}</legend>
      <div class="flex flex-wrap gap-2">{children}</div>
    </fieldset>
  );
}

// Orders sizes sensibly: grams/ml by amount, then counts (servings, tablets).
function sizeValue(s) {
  const m = String(s).match(/^([\d.]+)\s*(kg|g|l|ml)?/i);
  if (!m) return 1e9;
  const n = Number(m[1]);
  const u = (m[2] || '').toLowerCase();
  if (u === 'kg' || u === 'l') return n * 1000;
  if (u === 'g' || u === 'ml') return n;
  return 1e6 + n;
}
