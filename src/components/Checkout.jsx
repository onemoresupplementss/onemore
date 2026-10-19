// Checkout: delivery or pickup, customer details, payment choice, place order.
// The server re-prices everything from the sheet; this page only previews totals.
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { pricedLines, QtyStepper } from './Cart.jsx';
import { url } from '../lib/env.js';
import { cart, clearCart, feed, loadFeed, orderSource, saveOrder, removeFromCart, useSignal } from '../client/store.js';
import { buildWhatsAppText, deliveryFeeFor, formatINR, paymentOptions, PAYMENT_LABELS, pincodeProblem, validateCustomer, whatsappLink } from '../shared/order.js';

const CUSTOMER_KEY = 'om_customer_v1';
const IDEM_KEY = 'om_idem_v1';
const OTHER_AREA = 'Other area – please call me';

function load(key, fallback, store = 'localStorage') {
  try {
    return JSON.parse(window[store].getItem(key)) ?? fallback;
  } catch {
    return fallback;
  }
}
function save(key, value, store = 'localStorage') {
  try {
    window[store].setItem(key, JSON.stringify(value));
  } catch {
    // ignore
  }
}

function uuid() {
  if (crypto.randomUUID) return crypto.randomUUID();
  const b = crypto.getRandomValues(new Uint8Array(16));
  return [...b].map((x) => x.toString(16).padStart(2, '0')).join('').replace(/^(.{8})(.{4})(.{4})(.{4})/, '$1-$2-$3-$4-');
}

// Same order details -> same key, so a retry after a timeout can never create a second order.
const COUPON_KEY = 'om_coupon';
const cleanCoupon = (v) => String(v || '').toUpperCase().replace(/[^A-Z0-9-]/g, '').slice(0, 20);

function idemKeyFor(fingerprint) {
  const saved = load(IDEM_KEY, null, 'sessionStorage');
  if (saved && saved.fp === fingerprint) return saved.key;
  const key = uuid();
  save(IDEM_KEY, { key, fp: fingerprint }, 'sessionStorage');
  return key;
}

function cutoffText(hhmm) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm || '');
  if (!m) return '';
  const h = +m[1];
  return `${h % 12 || 12}:${m[2]} ${h < 12 ? 'am' : 'pm'}`;
}

const PAY_HELP = {
  upi: { en: 'After placing the order you will see our UPI ID and the exact amount to pay.', ta: 'ஆர்டர் செய்த பிறகு UPI மூலம் பணம் செலுத்தலாம்.' },
  cod: { en: 'Pay in cash or by UPI when your order arrives.', ta: 'பொருள் வந்தவுடன் பணம் அல்லது UPI மூலம் செலுத்தலாம்.' },
  shop: { en: 'Pay at the counter when you pick up your order.', ta: 'கடையில் பொருளை வாங்கும்போது பணம் செலுத்தலாம்.' },
};

export default function Checkout({ settings, delivery, shop }) {
  const lines = useSignal(cart);
  const f = useSignal(feed);
  const [ready, setReady] = useState(false);
  const [c, setC] = useState({ name: '', phone: '', fulfilment: 'delivery', area: '', pincode: '', address: '', landmark: '', notes: '' });
  const [payment, setPayment] = useState('upi');
  // Trainer / gym code: no discount, it only tells the shop who sent the customer.
  const [coupon, setCoupon] = useState('');
  const [errors, setErrors] = useState({});
  const [touched, setTouched] = useState(false);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState(null); // { kind, message, details }
  const [turnstile, setTurnstile] = useState('');
  const tsBox = useRef(null);
  const formRef = useRef(null);

  useEffect(() => {
    loadFeed({ fresh: true });
    setC((x) => ({ ...x, ...load(CUSTOMER_KEY, {}) }));
    const q = new URLSearchParams(location.search);
    setCoupon(cleanCoupon(q.get('coupon') || q.get('ref') || load(COUPON_KEY, '')));
    setReady(true);
  }, []);

  useEffect(() => {
    if (ready) save(CUSTOMER_KEY, { ...c, notes: '' });
  }, [c, ready]);

  // Optional "I am human" check (Cloudflare Turnstile, free) when a site key is set.
  useEffect(() => {
    if (!shop.turnstileSiteKey || !tsBox.current) return;
    const render = () => window.turnstile?.render(tsBox.current, { sitekey: shop.turnstileSiteKey, callback: setTurnstile, 'expired-callback': () => setTurnstile('') });
    if (window.turnstile) return void render();
    const s = document.createElement('script');
    s.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
    s.async = true;
    s.onload = render;
    document.head.appendChild(s);
  }, [ready, lines.length > 0]);

  const st = f?.settings ? { ...settings, ...f.settings } : settings;
  const zones = f?.delivery?.length ? f.delivery : delivery;
  const priced = pricedLines(lines, f, st);
  const subtotal = priced.reduce((n, l) => n + l.lineTotal, 0);
  const fee = deliveryFeeFor({ subtotal, fulfilment: c.fulfilment, area: c.area, settings: st, delivery: zones });
  const total = subtotal + fee;
  const options = paymentOptions({ fulfilment: c.fulfilment, total, settings: st });
  const zone = zones.find((z) => z.area === c.area);
  const lineProblems = priced.some((l) => l.problem);

  useEffect(() => {
    if (!options.includes(payment)) setPayment(options[0]);
  }, [options.join(), payment]);

  const set = (patch) => {
    setC((x) => ({ ...x, ...patch }));
    setProblem(null);
  };

  const validation = useMemo(() => {
    const out = validateCustomer(c, st);
    if (c.fulfilment === 'delivery' && !out.errors.pincode && zone?.pincodes?.length && !zone.pincodes.includes(out.value.pincode)) {
      out.errors.pincode = `This pincode is not in ${zone.area}. Choose “${OTHER_AREA}” and we will call you.`;
    }
    return out;
  }, [c, st, zone]);

  useEffect(() => {
    if (touched) setErrors(validation.errors);
  }, [validation, touched]);

  if (!ready) return <p class="text-muted">Loading your cart…</p>;

  if (st.AcceptingOrders === 'Closed') {
    return (
      <div class="card p-6">
        <p class="text-lg font-bold">{st.ClosedMessage}</p>
        <a class="btn btn-lime mt-4" href={whatsappLink(shop.whatsappNumber, 'Hi oneMore, I would like to order:')} target="_blank" rel="noopener">
          Order on WhatsApp
        </a>
      </div>
    );
  }

  if (!lines.length) {
    return (
      <div class="card p-8 text-center">
        <p class="text-lg font-bold">Your cart is empty</p>
        <a class="btn btn-lime mt-4" href={url("/shop/")}>
          Shop now
        </a>
      </div>
    );
  }

  async function placeOrder(e) {
    e.preventDefault();
    setTouched(true);
    const { value, errors: errs } = validation;
    setErrors(errs);
    if (Object.keys(errs).length) {
      setTimeout(() => formRef.current?.querySelector('[aria-invalid="true"]')?.focus(), 0);
      return;
    }
    if (lineProblems) {
      setProblem({ kind: 'cart', message: 'Some items in your cart changed. Please check the items marked in red.' });
      return;
    }
    if (shop.turnstileSiteKey && !turnstile) {
      setProblem({ kind: 'bot', message: 'Please tick the "I am human" box first.' });
      return;
    }
    const items = lines.map((l) => ({ id: l.id, qty: l.qty }));
    const fp = JSON.stringify([items, value, payment, coupon]);
    const idemKey = idemKeyFor(fp);
    setBusy(true);
    setProblem(null);
    let res;
    let body;
    try {
      res = await fetch(url('/api/order'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idemKey, items, customer: value, payment, coupon, source: orderSource(), turnstile }),
      });
      body = await res.json();
    } catch {
      body = { ok: false, error: 'unavailable' };
    }
    setBusy(false);

    if (body.ok) {
      saveOrder(body.order, idemKey);
      clearCart();
      try {
        sessionStorage.removeItem(IDEM_KEY);
      } catch {
        // ignore
      }
      location.href = url(`/order/?id=${encodeURIComponent(body.order.id)}`);
      return;
    }
    window.turnstile?.reset?.();
    setTurnstile('');
    handleError(body, idemKey, value);
  }

  function handleError(body, idemKey, value) {
    const err = body.error;
    if (err === 'sold_out' && Array.isArray(body.details)) {
      // details = IDs now ticked "Out of stock" in the sheet.
      loadFeed({ fresh: true });
      const names = body.details.map((id) => {
        const l = lines.find((x) => x.id === id);
        return l ? `${l.brand} ${l.name} ${l.size}` : id;
      });
      setProblem({ kind: 'stock', message: 'These items just went out of stock. Please remove them to continue.', list: names, remove: body.details });
    } else if (err === 'unavailable' && Array.isArray(body.details)) {
      loadFeed({ fresh: true });
      setProblem({ kind: 'stock', message: 'These items are no longer available online. Please remove them to continue.', list: body.details.map((id) => lines.find((l) => l.id === id)?.name || id), remove: body.details });
    } else if (err === 'closed') {
      loadFeed({ fresh: true });
      setProblem({ kind: 'closed', message: body.message || st.ClosedMessage });
    } else if (err === 'too_many_open') {
      setProblem({ kind: 'limit', message: 'You already have orders waiting for payment. Please call or WhatsApp us and we will help.' });
    } else if (err === 'bad_request' || err === 'bot_check') {
      // Field errors come as details.fields (website check) or details itself (sheet check).
      const d = body.details;
      const fields = d?.fields || (d && typeof d === 'object' && !Array.isArray(d) ? d : null);
      if (fields) setErrors(fields);
      setProblem({ kind: 'input', message: body.message || 'Please check your details.' });
    } else {
      // Google or the network is down: the customer can still send the order by WhatsApp.
      setProblem({ kind: 'down', message: 'Our order system is not answering right now.', fallback: notSavedLink(idemKey, value) });
    }
  }

  function notSavedLink(idemKey, value) {
    const order = {
      id: 'WEB-' + idemKey.replace(/-/g, '').slice(0, 6).toUpperCase(),
      created: new Date().toISOString(),
      lines: priced.map((l) => ({ ...l })),
      subtotal,
      deliveryFee: fee,
      total,
      method: payment,
      customer: value,
    };
    return whatsappLink(shop.whatsappNumber, buildWhatsAppText(order, shop, { notSaved: true }));
  }

  const err = (k) => (touched ? errors[k] : '');
  const pinNote = c.fulfilment === 'delivery' && /^\d{6}$/.test(c.pincode) ? pincodeProblem(c.pincode, st) : '';

  return (
    <form ref={formRef} onSubmit={placeOrder} noValidate class="grid gap-6 lg:grid-cols-[1fr_380px] lg:items-start">
      <div class="space-y-6">
        <Section n="1" title={st.PickupEnabled ? 'Delivery or pickup' : 'Delivery'}>
          <div class="grid gap-2 sm:grid-cols-2" role="radiogroup" aria-label={st.PickupEnabled ? 'Delivery or pickup' : 'Delivery'}>
            <Choice checked={c.fulfilment === 'delivery'} onSelect={() => set({ fulfilment: 'delivery' })} title="Home delivery" sub={`One day, all over Tamil Nadu · ${st.FreeDeliveryAbove > 0 ? `free above ${formatINR(st.FreeDeliveryAbove)}` : 'fee shown below'}`} />
            {st.PickupEnabled && <Choice checked={c.fulfilment === 'pickup'} onSelect={() => set({ fulfilment: 'pickup' })} title="Pick up from shop" sub="Free · we message you when it is ready" />}
          </div>
        </Section>

        <Section n="2" title="Your details">
          <div class="grid gap-4 sm:grid-cols-2">
            <Field label="Full name" ta="உங்கள் பெயர்" error={err('name')}>
              {(p) => <input {...p} class="field" autoComplete="name" value={c.name} onInput={(e) => set({ name: e.currentTarget.value })} maxLength={60} />}
            </Field>
            <Field label="Mobile number (WhatsApp)" ta="WhatsApp உள்ள மொபைல் எண்" error={err('phone')}>
              {(p) => (
                <div class="flex">
                  <span class="flex items-center rounded-l-lg border border-r-0 border-line bg-surface-2 px-3 text-muted">+91</span>
                  <input {...p} class="field rounded-l-none" type="tel" inputMode="numeric" autoComplete="tel-national" value={c.phone} onInput={(e) => set({ phone: e.currentTarget.value })} maxLength={14} />
                </div>
              )}
            </Field>
            {c.fulfilment === 'delivery' && (
              <>
                <Field label="Area" error={err('area')}>
                  {(p) => (
                    <select {...p} class="field" value={c.area} onChange={(e) => set({ area: e.currentTarget.value })}>
                      <option value="">Choose your area</option>
                      {zones.map((z) => (
                        <option value={z.area}>{z.area}</option>
                      ))}
                      <option value={OTHER_AREA}>{OTHER_AREA}</option>
                    </select>
                  )}
                </Field>
                <Field label="Pincode" error={err('pincode') || pinNote}>
                  {(p) => <input {...p} class="field" inputMode="numeric" autoComplete="postal-code" value={c.pincode} onInput={(e) => set({ pincode: e.currentTarget.value.replace(/\D/g, '').slice(0, 6) })} />}
                </Field>
                <div class="sm:col-span-2">
                  <Field label="Address" ta="கதவு எண், தெரு, ஊர்" error={err('address')}>
                    {(p) => <textarea {...p} class="field min-h-20" autoComplete="street-address" rows={2} value={c.address} onInput={(e) => set({ address: e.currentTarget.value })} maxLength={240} placeholder="Door no., street, village/town" />}
                  </Field>
                </div>
                <div class="sm:col-span-2">
                  <Field label="Landmark" ta="அருகிலுள்ள அடையாளம் (கோவில், பள்ளி…)" error={err('landmark')}>
                    {(p) => <input {...p} class="field" value={c.landmark} onInput={(e) => set({ landmark: e.currentTarget.value })} maxLength={120} placeholder="Near temple, school, bus stop…" />}
                  </Field>
                </div>
                {(zone?.eta || st.SameDayCutoff) && (
                  <p class="text-sm text-muted sm:col-span-2">
                    {zone?.eta ? `Delivery: ${zone.eta}. ` : ''}
                    {cutoffText(st.SameDayCutoff) ? `Orders after ${cutoffText(st.SameDayCutoff)} go out the next day.` : ''}
                  </p>
                )}
              </>
            )}
            <div class="sm:col-span-2">
              <Field label="Notes (optional)" error={err('notes')}>
                {(p) => <textarea {...p} class="field min-h-16" rows={2} value={c.notes} onInput={(e) => set({ notes: e.currentTarget.value })} maxLength={300} placeholder="Flavour preference, best time to call…" />}
              </Field>
            </div>
            <div>
              <Field label="Coupon code (optional)">
                {(p) => (
                  <input
                    {...p}
                    class="field uppercase tracking-wider"
                    value={coupon}
                    onInput={(e) => {
                      const v = cleanCoupon(e.currentTarget.value);
                      setCoupon(v);
                      save(COUPON_KEY, v);
                    }}
                    maxLength={20}
                    autocomplete="off"
                    placeholder="e.g. SRGYM01"
                  />
                )}
              </Field>
              <p class="mt-1 text-xs text-muted">Got a code from your trainer or gym? Enter it here.</p>
            </div>
          </div>
        </Section>

        <Section n="3" title="Payment">
          <div class="grid gap-2" role="radiogroup" aria-label="Payment method">
            {options.map((o) => (
              <Choice checked={payment === o} onSelect={() => setPayment(o)} title={o === 'upi' ? 'UPI (GPay, PhonePe, Paytm…)' : PAYMENT_LABELS[o]} sub={PAY_HELP[o].en} ta={PAY_HELP[o].ta} />
            ))}
            {/* CODMax 0 = pay on delivery switched off: say nothing about it. */}
            {c.fulfilment === 'delivery' && st.CODMax > 0 && total > st.CODMax && <p class="text-sm text-muted">Pay on delivery is available for orders up to {formatINR(st.CODMax)}.</p>}
          </div>
        </Section>
      </div>

      <aside class="card space-y-4 p-4 lg:sticky lg:top-20">
        <h2 class="display text-lg">Order summary</h2>
        <ul class="divide-y divide-line" role="list">
          {priced.map((l) => (
            <li key={l.id} class="py-3">
              <div class="flex justify-between gap-3 text-sm">
                <span class="min-w-0">
                  <b>{l.brand}</b> {l.name}
                  <span class="block text-xs text-muted">{[l.size, l.flavour].filter(Boolean).join(' · ')}</span>
                </span>
                <span class="shrink-0 font-bold">{formatINR(l.lineTotal)}</span>
              </div>
              {l.problem && <p class="mt-1 text-xs font-bold text-danger">{l.problem}</p>}
              <div class="mt-2">
                <QtyStepper line={l} />
              </div>
            </li>
          ))}
        </ul>
        <dl class="space-y-1 text-sm">
          <div class="flex justify-between">
            <dt class="text-muted">Subtotal</dt>
            <dd>{formatINR(subtotal)}</dd>
          </div>
          <div class="flex justify-between">
            <dt class="text-muted">{c.fulfilment === 'pickup' ? 'Store pickup' : 'Delivery'}</dt>
            <dd>{fee ? formatINR(fee) : 'Free'}</dd>
          </div>
          <div class="flex justify-between border-t border-line pt-2 text-lg font-black">
            <dt>Total</dt>
            <dd>{formatINR(total)}</dd>
          </div>
        </dl>
        {c.fulfilment === 'delivery' && c.area === OTHER_AREA && <p class="text-xs text-muted">For other areas we will call you to confirm the delivery fee before packing.</p>}

        {problem && (
          <div class={`rounded-lg border p-3 text-sm ${problem.kind === 'down' ? 'border-warn' : 'border-danger'}`} role="alert">
            <p class="font-bold">{problem.message}</p>
            {problem.list && (
              <ul class="mt-1 list-disc pl-5">
                {problem.list.map((x) => (
                  <li>{x}</li>
                ))}
              </ul>
            )}
            {problem.remove && (
              <button
                type="button"
                class="mt-2 text-sm font-semibold text-lime underline"
                onClick={() => {
                  problem.remove.forEach(removeFromCart);
                  setProblem(null);
                }}
              >
                Remove them
              </button>
            )}
            {problem.fallback && (
              <div class="mt-3 space-y-2">
                <button type="submit" class="btn btn-ghost w-full">
                  Try again
                </button>
                <a class="btn btn-lime w-full" href={problem.fallback} target="_blank" rel="noopener">
                  Send order on WhatsApp instead
                </a>
                <p class="text-xs text-muted">The message says “NOT SAVED”. We will confirm your order by phone.</p>
              </div>
            )}
          </div>
        )}

        {shop.turnstileSiteKey && <div ref={tsBox} class="min-h-16" />}

        <button type="submit" class="btn btn-lime w-full text-base" disabled={busy}>
          {busy ? 'Placing order…' : `Place order · ${formatINR(total)}`}
        </button>
        <p class="text-xs text-muted">
          Next you will {payment === 'upi' ? 'see how to pay by UPI and ' : ''}send the order to us on WhatsApp in one tap.
          <span lang="ta" class="mt-1 block">
            ஆர்டர் செய்த பிறகு WhatsApp-ல் அனுப்ப வேண்டும்.
          </span>
        </p>
        <p class="text-xs text-muted">
          By placing the order you agree to our <a class="underline" href={url("/terms/")}>terms</a> and <a class="underline" href={url("/shipping-returns/")}>returns policy</a>.
        </p>
      </aside>
    </form>
  );
}

function Section({ n, title, children }) {
  return (
    <section class="card p-4 sm:p-5">
      <h2 class="mb-4 flex items-center gap-3 text-lg font-black">
        <span class="flex size-7 items-center justify-center rounded-full bg-lime text-sm text-ink">{n}</span>
        {title}
      </h2>
      {children}
    </section>
  );
}

function Choice({ checked, onSelect, title, sub, ta }) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={checked}
      onClick={onSelect}
      class={`flex w-full items-start gap-3 rounded-lg border p-3 text-left transition-colors ${checked ? 'border-lime bg-lime/10' : 'border-line hover:border-muted'}`}
    >
      <span class={`mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full border-2 ${checked ? 'border-lime' : 'border-muted'}`} aria-hidden="true">
        {checked && <span class="size-2.5 rounded-full bg-lime" />}
      </span>
      <span>
        <span class="block font-bold">{title}</span>
        {sub && <span class="block text-sm text-muted">{sub}</span>}
        {ta && (
          <span lang="ta" class="ta block">
            {ta}
          </span>
        )}
      </span>
    </button>
  );
}

let fieldSeq = 0;
function Field({ label, ta, error, children }) {
  const id = useMemo(() => `f${++fieldSeq}`, []);
  return (
    <div>
      <label class="label" for={id}>
        {label}
        {ta && (
          <span lang="ta" class="ta ml-2 font-normal">
            {ta}
          </span>
        )}
      </label>
      {children({ id, 'aria-invalid': error ? 'true' : undefined, 'aria-describedby': error ? `${id}-e` : undefined })}
      {error && (
        <p id={`${id}-e`} class="mt-1 text-sm text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
