// /checkout/ in WhatsApp mode: review the list, then send it to the shop on WhatsApp.
// No customer details are asked for - the shop sees the customer's number in WhatsApp.
import { useState } from 'preact/hooks';
import ProductImage from './ProductImage.jsx';
import { pricedLines, QtyStepper, SendOnWhatsApp } from './Cart.jsx';
import { cart, clearCart, useSignal } from '../client/store.js';
import { url } from '../lib/env.js';

export default function WhatsAppOrder({ settings, shop }) {
  const lines = useSignal(cart);
  const [sent, setSent] = useState(false);
  const items = pricedLines(lines, null, settings);

  if (!items.length) {
    return (
      <div class="card p-8 text-center">
        <p class="text-lg font-bold">Your cart is empty</p>
        <a class="btn btn-lime mt-4" href={url('/shop/')}>
          Shop now
        </a>
      </div>
    );
  }

  return (
    <div class="grid gap-6 lg:grid-cols-[1fr_380px] lg:items-start">
      <ul class="card divide-y divide-line px-4" role="list">
        {items.map((l) => (
          <li key={l.id} class="flex gap-3 py-4">
            <a href={url(`/p/${l.slug}/?v=${encodeURIComponent(l.id)}`)} class="w-20 shrink-0 self-start overflow-hidden rounded-lg bg-surface-2">
              <ProductImage src={l.image} brand={l.brand} name={l.name} size={l.size} />
            </a>
            <div class="min-w-0 flex-1">
              <p class="text-[11px] font-bold uppercase tracking-wider text-muted">{l.brand}</p>
              <p class="font-bold leading-snug">{l.name}</p>
              <p class="text-xs text-muted">{[l.size, l.flavour].filter(Boolean).join(' · ')}</p>
              {l.problem && <p class="mt-1 text-xs font-bold text-danger">{l.problem}</p>}
              <div class="mt-2">
                <QtyStepper line={l} />
              </div>
            </div>
          </li>
        ))}
      </ul>
      <aside class="card overflow-hidden lg:sticky lg:top-20">
        <div class="space-y-2 p-4 pb-0 text-sm text-muted">
          <h2 class="display text-lg text-fg">How it works</h2>
          <ol class="list-decimal space-y-1 pl-5">
            <li>Tap the button – WhatsApp opens with your list.</li>
            <li>Press send.</li>
            <li>We reply with today’s price, delivery charge and how to pay (UPI, cash on delivery or at the shop).</li>
          </ol>
        </div>
        <SendOnWhatsApp
          lines={items}
          shop={shop}
          blocked={items.some((l) => l.problem)}
          sent={sent}
          onSent={() => setSent(true)}
          onClear={() => {
            clearCart();
            setSent(false);
          }}
        />
      </aside>
    </div>
  );
}
