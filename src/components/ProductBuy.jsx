// Product page buy box: size/flavour picker, live price and availability, quantity, add to cart.
// In WhatsApp mode there is no price; "Order on WhatsApp" sends just this item.
import { useEffect, useRef, useState } from 'preact/hooks';
import { addToCart, feed, liveVariant, loadFeed, selectedVariant, showAddedToast, useSignal } from '../client/store.js';
import { SHOW_PRICES, url } from '../lib/env.js';
import { buildOrderListText, formatINR, formatNetQty, percentOff, unitPrice, whatsappLink } from '../shared/order.js';

// Colours for the flavour tiles: [match, background from, background to, name text colour].
// First match wins, so "Chocolate Mint" is mint and "Chocolate Ice Cream" is ice cream.
const FLAVOUR_COLOURS = [
  [/banana/, '#ffe066', '#fab005', '#0a0a0a'],
  [/mango/, '#ffc078', '#f76707', '#0a0a0a'],
  [/pina|pineapple/, '#ffec99', '#63e6be', '#0a0a0a'],
  [/strawberr/, '#ff8787', '#e03131', '#ffffff'],
  [/rose/, '#fcc2d7', '#e64980', '#0a0a0a'],
  [/falooda/, '#fcc2d7', '#ae3ec9', '#ffffff'],
  [/kesar|saffron|badam/, '#ffd8a8', '#e8590c', '#0a0a0a'],
  [/mint/, '#96f2d7', '#0ca678', '#0a0a0a'],
  [/cookie|oreo/, '#dee2e6', '#495057', '#ffffff'],
  [/latte|cappuccino|coffee|mocha|espresso/, '#e6b981', '#7f4f24', '#ffffff'],
  [/hazelnut/, '#d4a373', '#6f4518', '#ffffff'],
  [/bounty|coconut/, '#f5ebe0', '#8d5524', '#0a0a0a'],
  [/ice ?cream/, '#f1c6a8', '#8c5a3c', '#0a0a0a'],
  [/choc|cocoa|brownie|fudge/, '#b07045', '#4a2511', '#ffffff'],
  [/vanilla|cream/, '#fff9db', '#f2cc8f', '#0a0a0a'],
  [/raw|unflavou?red|natural|plain/, '#f1f3f5', '#adb5bd', '#0a0a0a'],
  [/berry|grape/, '#d0bfff', '#7048e8', '#ffffff'],
  [/orange|lemon|lime/, '#ffe066', '#f08c00', '#0a0a0a'],
];
function flavourColours(name) {
  const k = String(name || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const hit = FLAVOUR_COLOURS.find(([re]) => re.test(k));
  return hit ? hit.slice(1) : ['#e9ff99', '#9fcc00', '#0a0a0a'];
}

export default function ProductBuy({ product, settings, shop, swatches = {} }) {
  const f = useSignal(feed);
  const vs = product.variants;
  // Open on an option that is in stock, when there is one.
  const [id, setId] = useState((vs.find((x) => !x.soldOut) || vs[0]).id);
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
  const live = liveVariant(v, SHOW_PRICES ? f : null);
  const maxQty = s.MaxQtyPerLine || 10;
  const sizes = [...new Set(vs.map((x) => x.size).filter(Boolean))];
  const flavours = [...new Set(vs.filter((x) => x.size === v.size).map((x) => x.flavour).filter(Boolean))];
  const off = SHOW_PRICES ? percentOff(live.price, live.mrp) : 0;
  const per = SHOW_PRICES ? unitPrice(live.price, v.netQty, v.unit) : '';
  const canBuy = live.buyable && live.inStock && s.AcceptingOrders !== 'Closed';
  // No price yet (Price cell "Ask"): no cart, the customer asks on WhatsApp with size, flavour and qty.
  const askMode = Boolean(live.ask);
  const showQty = askMode || canBuy;
  // Flavour picture tiles when the flavours of this size have pictures, plain chips otherwise.
  const sizeVariants = vs.filter((x) => x.size === v.size);
  const tiles = flavours.length > 1 && sizeVariants.some((x) => swatches[x.flavour]);
  const line = { id: v.id, slug: product.slug, brand: product.brand, name: product.name, size: v.size, flavour: v.flavour, image: v.image || product.image };

  useEffect(() => {
    if (qty > maxQty) setQty(Math.max(1, maxQty));
  }, [maxQty]);

  // Lets the product photo show this option's own picture, if it has one.
  useEffect(() => selectedVariant.set(v.id), [v.id]);

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
  const askLink = orderNow;
  // "Mutant Whey" already names its brand; don't say "Mutant Mutant Whey".
  const title = product.name.startsWith(product.brand) ? product.name : `${product.brand} ${product.name}`;
  const ask = `Hi ${shop.name}, is ${title} ${[v.size, v.flavour].filter(Boolean).join(' ')} available?`;
  const backInStock = `Hi ${shop.name}, please tell me when ${title} ${[v.size, v.flavour].filter(Boolean).join(' ')} is back in stock.`;
  const stockLine = !live.buyable ? (
    <span class="text-danger">Not available online right now</span>
  ) : !live.inStock ? (
    <span class="text-danger">Out of stock</span>
  ) : (
    <span class="text-ok">In stock</span>
  );

  return (
    <div class="space-y-5">
      {SHOW_PRICES && !askMode && (
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
      {tiles ? (
        <FlavourDropdown options={sizeVariants} value={v.id} swatches={swatches} onPick={choose} />
      ) : flavours.length > 1 ? (
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

      {showQty && (
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

      {askMode ? (
        <div class="space-y-2">
          <a class="btn btn-wa w-full text-base" href={askLink} target="_blank" rel="noopener">
            <WaIcon /> Ask on WhatsApp
          </a>
          <p class="text-sm text-muted">
            Send us {[v.size, v.flavour].filter(Boolean).join(' · ')} × {qty} on WhatsApp. We reply with today’s price, availability and delivery.
            <span lang="ta" class="ta mt-1 block">
              விலை மற்றும் டெலிவரி விவரங்களை WhatsApp-ல் அனுப்புவோம்.
            </span>
          </p>
        </div>
      ) : (
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
      )}
      {askMode ? null : SHOW_PRICES ? (
        <a class="btn btn-ghost w-full text-sm" href={whatsappLink(shop.whatsappNumber, ask)} target="_blank" rel="noopener">
          Ask about this on WhatsApp
        </a>
      ) : !canBuy ? (
        <a class="btn btn-ghost w-full text-sm" href={whatsappLink(shop.whatsappNumber, backInStock)} target="_blank" rel="noopener">
          Ask on WhatsApp when it’s back
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
              {formatNetQty(v.netQty, v.unit)}
            </dd>
          </>
        )}
        <dt class="text-muted">Product code</dt>
        <dd>{v.id}</dd>
      </dl>

      {askMode && (
        <div class="fixed inset-x-0 bottom-0 z-30 flex items-center gap-3 border-t border-line bg-ink/95 px-4 py-3 backdrop-blur lg:hidden">
          <div class="min-w-0 flex-1">
            <p class="truncate text-xs text-muted">{[v.size, v.flavour, `× ${qty}`].filter(Boolean).join(' · ')}</p>
            <p class="truncate font-black">{title}</p>
          </div>
          <a class="btn btn-wa" href={askLink} target="_blank" rel="noopener">
            <WaIcon /> Ask on WhatsApp
          </a>
        </div>
      )}
      {canBuy && !askMode && (
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

function WaIcon() {
  return (
    <svg viewBox="0 0 24 24" class="size-5 shrink-0" aria-hidden="true" fill="currentColor">
      <path d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91c0 1.75.46 3.45 1.32 4.95L2.05 22l5.25-1.38a9.9 9.9 0 0 0 4.74 1.21h.01c5.46 0 9.91-4.45 9.91-9.91A9.85 9.85 0 0 0 12.04 2Zm5.8 14.05c-.24.68-1.42 1.3-1.95 1.35-.5.05-.97.24-3.27-.68-2.77-1.09-4.52-3.92-4.66-4.1-.13-.18-1.11-1.48-1.11-2.82s.7-2 .95-2.27c.25-.27.54-.34.72-.34h.52c.17 0 .4-.06.62.48.24.55.8 1.92.87 2.06.07.14.11.3.02.48-.09.18-.14.3-.27.46l-.41.48c-.14.14-.28.29-.12.56.16.27.7 1.16 1.51 1.88 1.04.93 1.92 1.21 2.19 1.35.27.14.43.11.59-.07.16-.18.68-.79.86-1.07.18-.27.36-.23.61-.14.25.09 1.59.75 1.86.89.27.14.45.2.52.32.07.11.07.66-.17 1.34Z" />
    </svg>
  );
}

// "Choose your flavour" dropdown (like the brand's own site), with a picture of each flavour.
function FlavourDropdown({ options, value, swatches, onPick }) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const box = useRef();
  const list = useRef();
  const current = options.find((o) => o.id === value) || options[0];

  useEffect(() => {
    if (!open) return;
    const away = (e) => box.current && !box.current.contains(e.target) && setOpen(false);
    document.addEventListener('pointerdown', away);
    const i = Math.max(0, options.findIndex((o) => o.id === value));
    setActive(i);
    requestAnimationFrame(() => list.current?.children[i]?.scrollIntoView({ block: 'nearest' }));
    return () => document.removeEventListener('pointerdown', away);
  }, [open]);

  function pick(o) {
    onPick(o.id);
    setOpen(false);
    box.current?.querySelector('button')?.focus();
  }
  function key(e) {
    if (!open && ['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(e.key)) {
      e.preventDefault();
      setOpen(true);
      return;
    }
    if (!open) return;
    if (e.key === 'Escape') setOpen(false);
    else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      const n = (active + (e.key === 'ArrowDown' ? 1 : -1) + options.length) % options.length;
      setActive(n);
      list.current?.children[n]?.scrollIntoView({ block: 'nearest' });
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      pick(options[active]);
    }
  }

  const Pic = ({ o, cls }) => (
    <span class={`flv-thumb ${cls || ''}`} style={`--flv-a:${flavourColours(o.flavour)[0]};--flv-b:${flavourColours(o.flavour)[1]}`}>
      {swatches[o.flavour] && <img src={swatches[o.flavour]} alt="" width="380" height="200" loading="lazy" decoding="async" />}
    </span>
  );

  return (
    <div class="relative" ref={box}>
      <span class="label" id="flv-label">
        Flavour <span class="font-semibold text-muted">· {options.length} to choose from</span>
      </span>
      <button
        type="button"
        class={`flv-select${open ? ' is-open' : ''}`}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-labelledby="flv-label flv-current"
        onClick={() => setOpen(!open)}
        onKeyDown={key}
      >
        <Pic o={current} cls="is-big" />
        <span class="min-w-0 flex-1 text-left">
          <span class="block text-[11px] font-bold uppercase tracking-wider text-muted">Selected flavour</span>
          <span id="flv-current" class="block truncate text-base font-bold">
            {current.flavour}
            {current.soldOut ? ' – sold out' : ''}
          </span>
        </span>
        <svg viewBox="0 0 20 20" class="flv-caret size-5 shrink-0" aria-hidden="true" fill="currentColor">
          <path d="M5.3 7.3a1 1 0 0 1 1.4 0L10 10.6l3.3-3.3a1 1 0 1 1 1.4 1.4l-4 4a1 1 0 0 1-1.4 0l-4-4a1 1 0 0 1 0-1.4Z" />
        </svg>
      </button>
      {open && (
        <ul class="flv-list no-scrollbar" role="listbox" aria-labelledby="flv-label" ref={list} tabIndex={-1} onKeyDown={key}>
          {options.map((o, i) => (
            <li
              role="option"
              aria-selected={o.id === value}
              class={`flv-opt${i === active ? ' is-active' : ''}${o.soldOut ? ' is-out' : ''}`}
              onClick={() => pick(o)}
              onMouseEnter={() => setActive(i)}
            >
              <Pic o={o} />
              <span class="min-w-0 flex-1 truncate">{o.flavour}</span>
              {o.soldOut && <span class="text-[11px] font-bold text-danger">Sold out</span>}
              {o.id === value && (
                <span class="text-lime" aria-hidden="true">
                  ✓
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
