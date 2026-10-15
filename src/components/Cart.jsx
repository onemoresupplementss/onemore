// Header cart button + slide-in cart drawer.
import { useEffect, useRef, useState } from 'preact/hooks';
import ProductImage from './ProductImage.jsx';
import Sheet from './Sheet.jsx';
import { cart, cartCount, cartOpen, clearCart, feed, liveVariant, loadFeed, removeFromCart, setQty, useSignal } from '../client/store.js';
import { SHOW_PRICES, url } from '../lib/env.js';
import { buildOrderListText, formatINR, lineLabel, whatsappLink } from '../shared/order.js';

/** Cart lines priced from the live feed, with problems flagged. WhatsApp mode: no prices. */
export function pricedLines(lines, f, settings) {
  const max = settings?.MaxQtyPerLine ?? 10;
  if (!SHOW_PRICES) return lines.map((l) => ({ ...l, max, problem: l.qty > max ? `Max ${max} per order` : '' }));
  return lines.map((l) => {
    const live = liveVariant(l, f);
    let problem = '';
    if (!live.buyable) problem = 'No longer available';
    else if (!live.inStock) problem = 'Out of stock';
    else if (l.qty > max) problem = `Max ${max} per order`;
    return { ...l, price: live.price, lineTotal: live.price * l.qty, max, problem };
  });
}

export default function Cart({ settings, shop }) {
  const lines = useSignal(cart);
  const open = useSignal(cartOpen);
  const f = useSignal(feed);
  const [sent, setSent] = useState(false);
  // The page is built with an empty cart; show the saved count only after start-up,
  // so the first render matches the built HTML.
  const [started, setStarted] = useState(false);
  useEffect(() => setStarted(true), []);
  const count = started ? cartCount(lines) : 0;
  const s = f?.settings ? { ...settings, ...f.settings } : settings;

  useEffect(() => {
    if (open) loadFeed();
  }, [open]);

  // Bump the badge when something is added (not when the saved count first appears).
  const lastCount = useRef(null);
  const [pops, setPops] = useState(0);
  useEffect(() => {
    if (!started) return;
    if (lastCount.current !== null && count > lastCount.current) setPops((n) => n + 1);
    lastCount.current = count;
  }, [count, started]);

  const priced = pricedLines(lines, f, s);
  const subtotal = SHOW_PRICES ? priced.reduce((n, l) => n + l.lineTotal, 0) : 0;
  const free = SHOW_PRICES ? s.FreeDeliveryAbove : 0;
  const toFree = free > 0 ? Math.max(0, free - subtotal) : 0;
  const blocked = priced.some((l) => l.problem);

  return (
    <>
      <button
        type="button"
        class="relative inline-flex size-11 items-center justify-center rounded-lg hover:bg-surface-2"
        onClick={() => cartOpen.set(true)}
        aria-label={`Cart, ${count} ${count === 1 ? 'item' : 'items'}`}
      >
        <svg class="size-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
          <path d="M6 7h12l-1 13H7L6 7Z" />
          <path d="M9 7a3 3 0 0 1 6 0" />
        </svg>
        {count > 0 && <span key={pops} class={`${pops ? 'cart-pop ' : ''}absolute right-0.5 top-0.5 min-w-5 rounded-full bg-lime px-1 text-center text-[11px] font-black leading-5 text-ink`}>{count}</span>}
      </button>

      <Sheet open={open} onClose={() => cartOpen.set(false)} title="Your cart">
            {priced.length === 0 ? (
              <div class="flex flex-1 flex-col items-center justify-center gap-4 p-8 text-center">
                <p class="text-lg font-bold">Your cart is empty</p>
                <a href={url('/shop/')} class="btn btn-lime" onClick={() => cartOpen.set(false)}>
                  Shop now
                </a>
              </div>
            ) : (
              <>
                {free > 0 && (
                  <div class="border-b border-line px-4 py-3 text-sm">
                    {toFree > 0 ? (
                      <p>
                        Add <b class="text-lime">{formatINR(toFree)}</b> more for free delivery
                      </p>
                    ) : (
                      <p class="font-semibold text-lime">You get free delivery</p>
                    )}
                    <div class="mt-2 h-1.5 overflow-hidden rounded-full bg-surface-2">
                      <div class="h-full bg-lime" style={{ width: `${Math.min(100, (subtotal / free) * 100)}%` }} />
                    </div>
                  </div>
                )}
                <ul class="flex-1 divide-y divide-line overflow-y-auto px-4" role="list">
                  {priced.map((l) => (
                    <li key={l.id} class="flex gap-3 py-4">
                      <a href={url(`/p/${l.slug}/?v=${encodeURIComponent(l.id)}`)} class="w-20 shrink-0 self-start overflow-hidden rounded-lg bg-surface-2" onClick={() => cartOpen.set(false)}>
                        <ProductImage src={l.image} brand={l.brand} name={l.name} size={l.size} />
                      </a>
                      <div class="min-w-0 flex-1">
                        <p class="text-[11px] font-bold uppercase tracking-wider text-muted">{l.brand}</p>
                        <p class="text-sm font-bold leading-snug">{l.name}</p>
                        <p class="text-xs text-muted">{[l.size, l.flavour].filter(Boolean).join(' · ')}</p>
                        {l.problem && <p class="mt-1 text-xs font-bold text-danger">{l.problem}</p>}
                        <div class="mt-2 flex items-center justify-between gap-2">
                          <QtyStepper line={l} />
                          {SHOW_PRICES && <span class="font-black">{formatINR(l.lineTotal)}</span>}
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
                {SHOW_PRICES ? (
                  <div class="space-y-3 border-t border-line p-4">
                    <p class="flex justify-between text-lg font-black">
                      <span>Subtotal</span>
                      <span>{formatINR(subtotal)}</span>
                    </p>
                    <p class="text-xs text-muted">Delivery fee is worked out at checkout. Pay by UPI, on delivery, or at the shop.</p>
                    {blocked ? <p class="text-sm font-semibold text-danger">Please fix the items marked in red to continue.</p> : null}
                    <a href={url('/checkout/')} class={`btn btn-lime w-full text-base ${blocked ? 'pointer-events-none opacity-50' : ''}`} aria-disabled={blocked}>
                      Checkout
                    </a>
                  </div>
                ) : (
                  <SendOnWhatsApp lines={priced} shop={shop} blocked={blocked} sent={sent} onSent={() => setSent(true)} onClear={() => (clearCart(), setSent(false))} />
                )}
              </>
            )}
      </Sheet>
    </>
  );
}

/** WhatsApp mode: sends the product list to the shop. Nothing is saved anywhere else. */
export function SendOnWhatsApp({ lines, shop, blocked, sent, onSent, onClear }) {
  const link = whatsappLink(shop.whatsappNumber, buildOrderListText(lines, shop));
  const items = cartCount(lines);
  return (
    <div class="space-y-3 border-t border-line p-4">
      <p class="flex justify-between text-lg font-black">
        <span>Items</span>
        <span>{items}</span>
      </p>
      {blocked && <p class="text-sm font-semibold text-danger">Please fix the items marked in red to continue.</p>}
      <a
        href={link}
        target="_blank"
        rel="noopener"
        class={`btn btn-lime w-full text-base ${blocked ? 'pointer-events-none opacity-50' : ''}`}
        aria-disabled={blocked}
        onClick={onSent}
      >
        <svg class="size-5" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2Zm5.3 14.1c-.2.6-1.3 1.2-1.8 1.2-.5.1-1 .2-3.3-.7-2.8-1.1-4.5-3.9-4.7-4.1-.1-.2-1.1-1.5-1.1-2.8 0-1.4.7-2 1-2.3.2-.3.6-.3.8-.3h.6c.2 0 .4 0 .6.5l.8 2c.1.2.1.4 0 .5l-.4.6-.4.4c-.1.1-.3.3-.1.6.2.3.8 1.3 1.7 2.1 1.2 1 2.1 1.3 2.4 1.5.3.1.5.1.6-.1l.9-1c.2-.3.4-.2.6-.1l1.9.9c.3.1.5.2.5.3.1.2.1.6-.1 1.2Z" />
        </svg>
        {sent ? 'Send again on WhatsApp' : 'Send order on WhatsApp'}
      </a>
      {sent ? (
        <p class="text-center text-xs text-muted">
          Sent? We will reply with the price and delivery details.{' '}
          <button type="button" class="font-semibold text-lime underline" onClick={onClear}>
            Clear cart
          </button>
        </p>
      ) : (
        <p class="text-center text-xs text-muted">
          Opens WhatsApp with your list typed in. Just press send – we reply with today’s price and delivery details.
          <span lang="ta" class="ta mt-1 block">
            இந்த பொத்தானை அழுத்தி, WhatsApp-ல் Send அழுத்தவும்.
          </span>
        </p>
      )}
    </div>
  );
}

export function QtyStepper({ line }) {
  const max = Math.max(line.max, 0);
  return (
    <div class="flex items-center gap-1">
      <div class="flex items-center rounded-lg border border-line">
        <button type="button" class="size-9 font-bold" onClick={() => setQty(line.id, line.qty - 1)} aria-label={`One less ${lineLabel(line)}`}>
          −
        </button>
        <span class="w-7 text-center text-sm font-bold">{line.qty}</span>
        <button
          type="button"
          class="size-9 font-bold disabled:text-line"
          onClick={() => setQty(line.id, line.qty + 1)}
          disabled={line.qty >= max}
          aria-label={`One more ${lineLabel(line)}`}
        >
          +
        </button>
      </div>
      {line.qty > max && max > 0 && (
        <button type="button" class="text-xs font-semibold text-lime underline" onClick={() => setQty(line.id, max)}>
          Set to {max}
        </button>
      )}
      <button type="button" class="ml-1 text-xs text-muted underline" onClick={() => removeFromCart(line.id)}>
        Remove
      </button>
    </div>
  );
}
