import { useEffect, useRef, useState } from 'preact/hooks';
import ProductImage from './ProductImage.jsx';
import { addToCart, liveVariant, showAddedToast } from '../client/store.js';
import { SHOW_PRICES, url } from '../lib/env.js';
import { formatINR, percentOff } from '../shared/order.js';

/** Live state for a product card: cheapest buyable price, stock, and which variant "Add" would add. */
export function cardState(p, f) {
  const vs = p.variants.map((v) => ({ ...v, live: liveVariant(v, f) }));
  const buyable = vs.filter((v) => v.live.buyable);
  const inStock = buyable.filter((v) => v.live.stock > 0);
  const pool = inStock.length ? inStock : buyable.length ? buyable : vs;
  const cheapest = pool.reduce((a, b) => (b.live.price < a.live.price ? b : a));
  const prices = new Set(pool.map((v) => v.live.price));
  return {
    price: cheapest.live.price,
    mrp: cheapest.live.mrp,
    from: prices.size > 1,
    buyable: buyable.length > 0,
    inStock: inStock.length > 0,
    single: inStock.length === 1 && vs.length === 1 ? inStock[0] : null,
    stockLeft: inStock.length === 1 ? inStock[0].live.stock : null,
  };
}

export default function ProductCard({ p, f, settings, eager = false }) {
  // WhatsApp mode: no prices or stock, every listed product can be added.
  const s = SHOW_PRICES ? cardState(p, f) : { buyable: true, inStock: true, single: p.variants.length === 1 ? p.variants[0] : null, stockLeft: null };
  const off = SHOW_PRICES ? percentOff(s.price, s.mrp) : 0;
  const href = url(`/p/${p.slug}/`);
  const lowAt = settings?.ShowLowStockAt ?? 3;
  const maxQty = settings?.MaxQtyPerLine ?? 10;
  const sizes = [...new Set(p.variants.map((v) => v.size).filter(Boolean))];
  const tag = p.badge || (p.bestseller ? 'Bestseller' : '');
  const [added, setAdded] = useState(false);
  const timer = useRef();
  useEffect(() => () => clearTimeout(timer.current), []);

  function add() {
    const v = s.single;
    addToCart(
      { id: v.id, slug: p.slug, brand: p.brand, name: p.name, size: v.size, flavour: v.flavour, image: v.image || p.image, ...(SHOW_PRICES ? { price: v.live.price } : {}) },
      1,
      SHOW_PRICES ? Math.min(v.live.stock, maxQty) : maxQty,
    );
    // Stay on the page: a short "Added" on the button and a notice with "View cart".
    showAddedToast([p.name, v.size].filter(Boolean).join(' · '));
    setAdded(true);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setAdded(false), 1500);
  }

  return (
    <article class="card group relative flex h-full flex-col overflow-hidden">
      <a href={href} class="relative block bg-surface-2" tabIndex={-1} aria-hidden="true">
        <ProductImage src={p.image} brand={p.brand} name={p.name} size={sizes[0]} eager={eager} class="transition-transform duration-300 group-hover:scale-[1.03]" />
        <div class="absolute left-2 top-2 flex flex-col items-start gap-1">
          {tag && <span class="rounded bg-lime px-2 py-0.5 text-[11px] font-black uppercase tracking-wide text-ink">{tag}</span>}
          {off >= 5 && s.inStock && <span class="rounded bg-ink/80 px-2 py-0.5 text-[11px] font-bold text-lime">{off}% off</span>}
        </div>
      </a>
      <div class="flex flex-1 flex-col gap-1 p-3">
        <p class="text-[11px] font-bold uppercase tracking-wider text-muted">{p.brand}</p>
        <h3 class="text-sm font-bold leading-snug">
          <a href={href} class="after:absolute after:inset-0 after:content-[''] hover:text-lime focus:outline-none">
            {p.name}
          </a>
        </h3>
        {sizes.length > 0 && <p class="text-xs text-muted">{sizes.join(' · ')}</p>}
        {SHOW_PRICES && (
          <div class="mt-auto pt-2">
            <p class="flex flex-wrap items-baseline gap-x-2">
              <span class="text-lg font-black">
                {s.from && <span class="text-xs font-semibold text-muted">from </span>}
                {formatINR(s.price)}
              </span>
              {s.mrp > s.price && (
                <span class="text-xs text-muted line-through" aria-label={`MRP ${formatINR(s.mrp)}`}>
                  {formatINR(s.mrp)}
                </span>
              )}
            </p>
            {s.stockLeft !== null && lowAt > 0 && s.stockLeft <= lowAt && <p class="text-xs font-semibold text-warn">Only {s.stockLeft} left</p>}
          </div>
        )}
        <div class={`relative z-10 pt-2 ${SHOW_PRICES ? '' : 'mt-auto'}`}>
          {!s.buyable ? (
            <button class="btn w-full text-sm" disabled>
              Unavailable
            </button>
          ) : !s.inStock ? (
            <button class="btn w-full text-sm" disabled>
              Out of Stock
            </button>
          ) : s.single ? (
            <button class="btn btn-lime w-full text-sm" onClick={add} aria-label={`Add ${p.brand} ${p.name} to cart`}>
              {added ? 'Added ✓' : 'Add to cart'}
            </button>
          ) : (
            <a class="btn btn-ghost w-full text-sm" href={href} aria-label={`Choose size for ${p.brand} ${p.name}`}>
              Choose size
            </a>
          )}
        </div>
      </div>
    </article>
  );
}
