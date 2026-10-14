// Product page buy box: size/flavour picker, live price and stock, quantity, add to cart.
// In WhatsApp mode there is no price or stock; "Order on WhatsApp" sends just this item.
import { useEffect, useRef, useState } from 'preact/hooks';
import { addToCart, feed, liveVariant, loadFeed, showAddedToast, useSignal } from '../client/store.js';
import { SHOW_PRICES, url } from '../lib/env.js';
import { buildOrderListText, formatINR, percentOff, unitPrice, whatsappLink } from '../shared/order.js';

function formatMonth(iso) {
  if (!iso) return '';
  return new Intl.DateTimeFormat('en-IN', { month: 'short', year: 'numeric', timeZone: 'UTC' }).format(new Date(iso + 'T00:00:00Z'));
}

export default function ProductBuy({ product, settings, shop }) {
  const f = useSignal(feed);
  const vs = product.variants;
  const [id, setId] = useState(vs[0].id);
  const [qty, setQty] = useState(1);
  const [added, setAdded] = useState(false);
  const addedTimer = useRef();

  useEffect(() => {
    loadFeed();
    const want = new URLSearchParams(location.search).get('v');
    if (want && vs.some((v) => v.id === want)) setId(want);
    return () => clearTimeout(addedTimer.current);
  }, []);

  const s = f?.settings ? { ...settings, ...f.settings } : settings;
  const v = vs.find((x) => x.id === id) || vs[0];
  const live = SHOW_PRICES ? liveVariant(v, f) : { buyable: true, stock: Infinity };
  const maxQty = Math.max(0, Math.min(live.stock, s.MaxQtyPerLine || 10));
  const sizes = [...new Set(vs.map((x) => x.size).filter(Boolean))];
  const flavours = [...new Set(vs.filter((x) => x.size === v.size).map((x) => x.flavour).filter(Boolean))];
  const off = SHOW_PRICES ? percentOff(live.price, live.mrp) : 0;
  const per = SHOW_PRICES ? unitPrice(live.price, v.netQty, v.unit) : '';
  const lowAt = s.ShowLowStockAt ?? 3;
  const canBuy = live.buyable && live.stock > 0 && s.AcceptingOrders !== 'Closed';
  const line = { id: v.id, slug: product.slug, brand: product.brand, name: product.name, size: v.size, flavour: v.flavour, image: v.image || product.image };

  useEffect(() => {
    if (qty > maxQty) setQty(Math.max(1, maxQty));
  }, [maxQty]);

  function pickSize(size) {
    const same = vs.find((x) => x.size === size && x.flavour === v.flavour) || vs.find((x) => x.size === size);
    if (same) choose(same.id);
  }
  function choose(next) {
    setId(next);
    setAdded(false);
    const u = new URL(location.href);
    u.searchParams.set('v', next);
    history.replaceState(null, '', u);
  }
  function add(go) {
    addToCart(SHOW_PRICES ? { ...line, price: live.price } : line, qty, maxQty);
    if (go) location.href = url('/checkout/');
    else {
      // Stay on the page: a short "Added" on the button and a notice with "View cart".
      showAddedToast([product.name, v.size].filter(Boolean).join(' · '));
      setAdded(true);
      clearTimeout(addedTimer.current);
      addedTimer.current = setTimeout(() => setAdded(false), 1500);
    }
  }

  const orderNow = whatsappLink(shop.whatsappNumber, buildOrderListText([{ ...line, qty }], shop));
  const ask = `Hi ${shop.name}, is ${product.brand} ${product.name} ${[v.size, v.flavour].filter(Boolean).join(' ')} available?`;
  const stockLine = !live.buyable ? (
    <span class="text-danger">Not available online right now</span>
  ) : live.stock <= 0 ? (
    <span class="text-danger">Out of stock</span>
  ) : lowAt > 0 && live.stock <= lowAt ? (
    <span class="text-warn">Only {live.stock} left</span>
  ) : (
    <span class="text-ok">In stock</span>
  );

  return (
    <div class="space-y-5">
      {SHOW_PRICES && (
        <div>
          <p class="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <span class="text-3xl font-black">{formatINR(live.price)}</span>
            {live.mrp > live.price && (
              <>
                <span class="text-muted">
                  MRP <s>{formatINR(live.mrp)}</s>
                </span>
                <span class="rounded bg-lime px-2 py-0.5 text-xs font-black text-ink">{off}% OFF</span>
              </>
            )}
          </p>
          <p class="mt-1 text-xs text-muted">
            {live.mrp > live.price ? '' : `MRP ${formatINR(live.mrp)} · `}Inclusive of all taxes{per ? ` · ${per}` : ''}
          </p>
          <p class="mt-2 text-sm font-bold" aria-live="polite">
            {stockLine}
          </p>
        </div>
      )}

      {sizes.length > 1 && (
        <fieldset>
          <legend class="label">Size</legend>
          <div class="flex flex-wrap gap-2" role="radiogroup">
            {sizes.map((z) => (
              <button type="button" role="radio" class="chip" aria-checked={v.size === z} onClick={() => pickSize(z)}>
                {z}
              </button>
            ))}
          </div>
        </fieldset>
      )}
      {flavours.length > 1 ? (
        <fieldset>
          <legend class="label">Flavour</legend>
          <div class="flex flex-wrap gap-2" role="radiogroup">
            {vs
              .filter((x) => x.size === v.size)
              .map((x) => (
                <button type="button" role="radio" class="chip" aria-checked={x.id === v.id} onClick={() => choose(x.id)}>
                  {x.flavour}
                </button>
              ))}
          </div>
        </fieldset>
      ) : (
        (v.flavour || v.size) && (
          <p class="text-sm text-muted">
            {[sizes.length <= 1 && v.size, v.flavour].filter(Boolean).join(' · ')}
          </p>
        )
      )}

      {canBuy && (
        <div class="flex items-center gap-3">
          <span class="label mb-0">Qty</span>
          <div class="flex items-center rounded-lg border border-line">
            <button type="button" class="size-11 text-xl font-bold disabled:text-line" onClick={() => setQty(qty - 1)} disabled={qty <= 1} aria-label="One less">
              −
            </button>
            <span class="w-10 text-center font-bold" aria-live="polite">
              {qty}
            </span>
            <button type="button" class="size-11 text-xl font-bold disabled:text-line" onClick={() => setQty(qty + 1)} disabled={qty >= maxQty} aria-label="One more">
              +
            </button>
          </div>
        </div>
      )}

      <div class="grid grid-cols-2 gap-2">
        {canBuy ? (
          <>
            <button type="button" class="btn btn-ghost" onClick={() => add(false)}>
              {added ? 'Added ✓' : 'Add to cart'}
            </button>
            {SHOW_PRICES ? (
              <button type="button" class="btn btn-lime" onClick={() => add(true)}>
                Buy now
              </button>
            ) : (
              <a class="btn btn-lime" href={orderNow} target="_blank" rel="noopener">
                Order on WhatsApp
              </a>
            )}
          </>
        ) : (
          <button type="button" class="btn col-span-2" disabled>
            {s.AcceptingOrders === 'Closed' ? 'Online orders paused' : live.buyable ? 'Out of Stock' : 'Unavailable'}
          </button>
        )}
      </div>
      {SHOW_PRICES ? (
        <a class="btn btn-ghost w-full text-sm" href={whatsappLink(shop.whatsappNumber, ask)} target="_blank" rel="noopener">
          Ask about this on WhatsApp
        </a>
      ) : (
        <p class="text-sm text-muted">
          We reply on WhatsApp with today’s price, delivery and payment options.
          <span lang="ta" class="ta mt-1 block">
            விலை மற்றும் டெலிவரி விவரங்களை WhatsApp-ல் அனுப்புவோம்.
          </span>
        </p>
      )}

      <dl class="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
        {v.netQty > 0 && (
          <>
            <dt class="text-muted">Net quantity</dt>
            <dd>
              {v.netQty} {v.unit}
            </dd>
          </>
        )}
        {v.bestBefore && (
          <>
            <dt class="text-muted">Best before</dt>
            <dd>{formatMonth(v.bestBefore)} or later</dd>
          </>
        )}
        <dt class="text-muted">Product code</dt>
        <dd>{v.id}</dd>
      </dl>

      {canBuy && (
        <div class="fixed inset-x-0 bottom-0 z-30 flex items-center gap-3 border-t border-line bg-ink/95 px-4 py-3 backdrop-blur lg:hidden">
          <div class="min-w-0 flex-1">
            <p class="truncate text-xs text-muted">{[v.size, v.flavour].filter(Boolean).join(' · ')}</p>
            <p class="truncate font-black">{SHOW_PRICES ? formatINR(live.price * qty) : `${product.brand} ${product.name}`}</p>
          </div>
          <button type="button" class="btn btn-lime" onClick={() => add(false)}>
            {added ? 'Added ✓' : 'Add to cart'}
          </button>
        </div>
      )}
    </div>
  );
}
