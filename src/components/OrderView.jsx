// Order page (/order/?id=ORD-1001): how to pay, optional UTR, and the one-tap
// "send on WhatsApp" button. The order is read from this phone's storage, so the
// page survives a reload; the sheet is the real record.
import { useEffect, useState } from 'preact/hooks';
import { getSavedOrder, updateSavedOrder } from '../client/store.js';
import { url } from '../lib/env.js';
import { buildWhatsAppText, formatDateIST, formatINR, lineLabel, PAYMENT_LABELS, upiLink, UTR_PATTERN, whatsappLink } from '../shared/order.js';

async function copy(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const t = document.createElement('textarea');
    t.value = text;
    t.setAttribute('readonly', '');
    t.style.position = 'fixed';
    t.style.opacity = '0';
    document.body.appendChild(t);
    t.select();
    const ok = document.execCommand('copy');
    t.remove();
    return ok;
  }
}

function CopyRow({ label, value, display }) {
  const [done, setDone] = useState(false);
  return (
    <div class="flex items-center justify-between gap-3 rounded-lg border border-line bg-surface-2 px-3 py-2">
      <div class="min-w-0">
        <p class="text-xs text-muted">{label}</p>
        <p class="break-all font-mono text-base font-bold">{display || value}</p>
      </div>
      <button
        type="button"
        class={`btn shrink-0 px-3 text-sm ${done ? 'btn-ghost text-ok' : 'btn-lime'}`}
        onClick={async () => {
          if (await copy(value)) {
            setDone(true);
            setTimeout(() => setDone(false), 2500);
          }
        }}
        aria-label={`Copy ${label}`}
      >
        {done ? 'Copied ✓' : 'Copy'}
      </button>
    </div>
  );
}

function UpiQr({ link }) {
  const [svg, setSvg] = useState(null);
  useEffect(() => {
    let alive = true;
    Promise.all([import('lean-qr'), import('lean-qr/extras/svg')]).then(([{ generate }, { toSvgPath }]) => {
      if (!alive) return;
      const code = generate(link);
      setSvg({ size: code.size, path: toSvgPath(code) });
    });
    return () => {
      alive = false;
    };
  }, [link]);
  if (!svg) return <div class="aspect-square w-56 animate-pulse rounded-lg bg-white/10" />;
  return (
    <svg viewBox={`-3 -3 ${svg.size + 6} ${svg.size + 6}`} class="w-56 rounded-lg bg-white" role="img" aria-label="UPI QR code">
      <path d={svg.path} fill="#000" />
    </svg>
  );
}

export default function OrderView({ shop, replyPromise, reviewLink, callFirstAbove }) {
  const [rec, setRec] = useState(undefined);
  const [utr, setUtr] = useState('');
  const [utrState, setUtrState] = useState('idle'); // idle | saving | saved | error
  const [utrMsg, setUtrMsg] = useState('');
  const [showQr, setShowQr] = useState(false);

  useEffect(() => {
    const id = new URLSearchParams(location.search).get('id') || '';
    const r = getSavedOrder(id);
    setRec(r);
    if (r?.utr) {
      setUtr(r.utr);
      setUtrState('saved');
    }
    // Big screens are usually not the phone that pays, so show the QR there straight away.
    if (window.matchMedia('(min-width: 1024px) and (pointer: fine)').matches) setShowQr(true);
  }, []);

  if (rec === undefined) return <p class="text-muted">Loading your order…</p>;
  if (!rec) {
    return (
      <div class="card p-6">
        <h1 class="display text-2xl">Order not found on this phone</h1>
        <p class="mt-2 text-muted">If you placed an order, message us on WhatsApp with your order number and we will help.</p>
        <a class="btn btn-lime mt-4" href={whatsappLink(shop.whatsappNumber, 'Hi oneMore, I have a question about my order ')} target="_blank" rel="noopener">
          WhatsApp us
        </a>
      </div>
    );
  }

  const { order, token } = rec;
  const c = order.customer;
  const isUpi = order.method === 'upi';
  const upi = upiLink({ vpa: shop.upiId, payee: shop.upiPayeeName, amount: order.total, note: order.id });
  const wa = whatsappLink(shop.whatsappNumber, buildWhatsAppText(order, shop, { utr: utrState === 'saved' ? utr : '' }));
  const amount = order.total.toFixed(Number.isInteger(order.total) ? 0 : 2);

  async function saveUtr(e) {
    e.preventDefault();
    const clean = utr.replace(/\s/g, '');
    if (!UTR_PATTERN.test(clean)) {
      setUtrState('error');
      setUtrMsg('The UTR is a 12-digit number. Find it in your UPI app under payment details (sometimes called “UPI Ref No.”).');
      return;
    }
    setUtrState('saving');
    try {
      const res = await fetch(url('/api/utr'), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ orderId: order.id, token, utr: clean }) });
      const out = await res.json();
      if (!out.ok) throw new Error(out.message);
      setUtr(clean);
      setUtrState('saved');
      updateSavedOrder(order.id, { utr: clean });
    } catch (err) {
      // Still include it in the WhatsApp message, which is how the owner sees it anyway.
      setUtr(clean);
      setUtrState('saved');
      updateSavedOrder(order.id, { utr: clean });
      setUtrMsg('We could not save it online, but it will be in your WhatsApp message.');
    }
  }

  const sendButton = (
    <div class="space-y-2">
      <a
        class="btn btn-lime w-full text-base"
        href={wa}
        target="_blank"
        rel="noopener"
        onClick={() => {
          updateSavedOrder(order.id, { sentAt: Date.now() });
          setRec({ ...rec, sentAt: Date.now() });
        }}
      >
        <svg class="size-5" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2Zm5.3 14.1c-.2.6-1.3 1.2-1.8 1.2-.5.1-1 .2-3.3-.7-2.8-1.1-4.5-3.9-4.7-4.1-.1-.2-1.1-1.5-1.1-2.8 0-1.4.7-2 1-2.3.2-.3.6-.3.8-.3h.6c.2 0 .4 0 .6.5l.8 2c.1.2.1.4 0 .5l-.4.6-.4.4c-.1.1-.3.3-.1.6.2.3.8 1.3 1.7 2.1 1.2 1 2.1 1.3 2.4 1.5.3.1.5.1.6-.1l.9-1c.2-.3.4-.2.6-.1l1.9.9c.3.1.5.2.5.3.1.2.1.6-.1 1.2Z" />
        </svg>
        {rec.sentAt ? 'Send on WhatsApp again' : 'Send order on WhatsApp'}
      </a>
      <p class="text-center text-xs text-muted">
        {rec.sentAt ? 'Sent? We will reply soon. If WhatsApp did not open, tap again.' : 'Opens WhatsApp with your order typed in. Just press send.'}
      </p>
      <p lang="ta" class="ta text-center">
        இந்த பொத்தானை அழுத்தி, WhatsApp-ல் Send அழுத்தவும்.
      </p>
    </div>
  );

  return (
    <div class="grid gap-6 lg:grid-cols-[1fr_360px] lg:items-start">
      <div class="space-y-6">
        <div class="card border-lime/40 p-5">
          <p class="text-sm font-bold uppercase tracking-wider text-lime">Order placed</p>
          <h1 class="display mt-1 text-3xl sm:text-4xl">{order.id}</h1>
          <p class="mt-2 text-muted">
            {formatDateIST(order.created)} · Total <b class="text-fg">{formatINR(order.total)}</b> · {PAYMENT_LABELS[order.method]}
          </p>
          <p class="mt-3 font-semibold">One more step: send this order to us on WhatsApp so we can start packing.</p>
        </div>

        {isUpi ? (
          <section class="card space-y-4 p-5" aria-labelledby="pay-h">
            <h2 id="pay-h" class="text-xl font-black">
              1. Pay {formatINR(order.total)} by UPI
            </h2>
            <ol class="list-decimal space-y-1 pl-5 text-sm text-muted">
              <li>Open any UPI app (GPay, PhonePe, Paytm, BHIM).</li>
              <li>Choose “Pay to UPI ID” (or “Pay anyone” → UPI ID).</li>
              <li>Paste our UPI ID and the amount. Add the order number as the note.</li>
            </ol>
            <p lang="ta" class="ta">
              UPI ஆப்பைத் திறந்து “UPI ID-க்கு பணம் அனுப்பு” என்பதைத் தேர்வு செய்து, கீழே உள்ள UPI ID மற்றும் தொகையை ஒட்டவும்.
            </p>
            <div class="space-y-2">
              <CopyRow label="Our UPI ID" value={shop.upiId} />
              <CopyRow label="Amount" value={amount} display={formatINR(order.total)} />
              <CopyRow label="Note (order number)" value={order.id} />
            </div>
            {shop.upiNameCustomersSee && <p class="text-sm text-muted">Your UPI app will show the name <b class="text-fg">{shop.upiNameCustomersSee}</b>. Check it before you pay.</p>}
            {shop.upiPayLinkTested && (
              <a class="btn btn-ghost w-full" href={upi}>
                Open UPI app
              </a>
            )}
            <div>
              <button type="button" class="text-sm font-semibold text-lime underline underline-offset-4" onClick={() => setShowQr(!showQr)} aria-expanded={showQr}>
                {showQr ? 'Hide QR code' : 'Show QR code (to scan from another phone)'}
              </button>
              {showQr && (
                <div class="mt-3 flex flex-col items-center gap-2">
                  <UpiQr link={upi} />
                  <p class="max-w-xs text-center text-xs text-muted">Scan with the camera in your UPI app on another phone. On this phone, saving the QR and scanning it from the gallery works only up to ₹2,000.</p>
                </div>
              )}
            </div>
            <form onSubmit={saveUtr} class="space-y-2 border-t border-line pt-4">
              <label for="utr" class="label">
                After paying: UTR / UPI Ref No. (optional)
              </label>
              <p class="text-xs text-muted">The 12-digit number in your UPI app’s payment details. It helps us match your payment faster.</p>
              <div class="flex gap-2">
                <input
                  id="utr"
                  class="field font-mono"
                  inputMode="numeric"
                  autoComplete="off"
                  maxLength={14}
                  value={utr}
                  onInput={(e) => {
                    setUtr(e.currentTarget.value.replace(/[^\d\s]/g, ''));
                    if (utrState !== 'saving') setUtrState('idle');
                    setUtrMsg('');
                  }}
                  aria-invalid={utrState === 'error' ? 'true' : undefined}
                  aria-describedby="utr-msg"
                />
                <button type="submit" class="btn btn-ghost shrink-0" disabled={utrState === 'saving'}>
                  {utrState === 'saving' ? 'Saving…' : utrState === 'saved' ? 'Saved ✓' : 'Save'}
                </button>
              </div>
              <p id="utr-msg" class={`text-sm ${utrState === 'error' ? 'text-danger' : 'text-muted'}`} aria-live="polite">
                {utrMsg}
              </p>
            </form>
            <h2 class="pt-2 text-xl font-black">2. Send the order and your payment screenshot</h2>
            {sendButton}
            <p class="text-xs text-muted">Attach the payment screenshot in the WhatsApp chat. We confirm payment only after it shows in our UPI app.</p>
          </section>
        ) : (
          <section class="card space-y-4 p-5">
            <h2 class="text-xl font-black">Send the order to us</h2>
            <p class="text-muted">
              {order.method === 'cod'
                ? `Pay ${formatINR(order.total)} in cash or by UPI when your order arrives.`
                : `Pay ${formatINR(order.total)} at the shop when you pick up your order. We will message you when it is ready.`}
            </p>
            {order.callFirst && <p class="rounded-lg border border-warn p-3 text-sm">As this is your first pay-on-delivery order above {formatINR(callFirstAbove)}, we will call you to confirm before packing.</p>}
            {sendButton}
          </section>
        )}
        <p class="text-sm text-muted">{replyPromise}</p>
      </div>

      <aside class="card space-y-4 p-4">
        <h2 class="display text-lg">Your order</h2>
        <ul class="divide-y divide-line text-sm" role="list">
          {order.lines.map((l) => (
            <li class="flex justify-between gap-3 py-2">
              <span>
                {lineLabel(l)} × {l.qty}
              </span>
              <span class="shrink-0 font-bold">{formatINR(l.lineTotal)}</span>
            </li>
          ))}
        </ul>
        <dl class="space-y-1 text-sm">
          <div class="flex justify-between">
            <dt class="text-muted">Subtotal</dt>
            <dd>{formatINR(order.subtotal)}</dd>
          </div>
          <div class="flex justify-between">
            <dt class="text-muted">{c.fulfilment === 'pickup' ? 'Store pickup' : 'Delivery'}</dt>
            <dd>{order.deliveryFee ? formatINR(order.deliveryFee) : 'Free'}</dd>
          </div>
          <div class="flex justify-between border-t border-line pt-2 text-base font-black">
            <dt>Total</dt>
            <dd>{formatINR(order.total)}</dd>
          </div>
        </dl>
        <div class="border-t border-line pt-3 text-sm">
          <p class="font-bold">{c.name}</p>
          <p class="text-muted">{c.phone}</p>
          {c.fulfilment === 'pickup' ? (
            <p class="text-muted">Pickup from the shop</p>
          ) : (
            <p class="text-muted">
              {c.address}
              <br />
              {c.landmark && (
                <>
                  Landmark: {c.landmark}
                  <br />
                </>
              )}
              {c.area} {c.pincode}
            </p>
          )}
        </div>
        {reviewLink && (
          <a class="block text-sm text-lime underline" href={reviewLink} target="_blank" rel="noopener">
            Happy with us? Leave a Google review
          </a>
        )}
      </aside>
    </div>
  );
}
