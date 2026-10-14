// Order rules shared by the checkout page, the order page and the Cloudflare Functions.
// The authoritative prices, stock and totals come from the Apps Script (createOrder);
// these helpers only preview them in the browser and format messages.

const inr = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 });
const inrPaise = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function formatINR(n) {
  const v = Number(n) || 0;
  return Number.isInteger(v) ? inr.format(v) : inrPaise.format(v);
}

export const PAYMENT_LABELS = {
  upi: 'UPI',
  cod: 'Pay on delivery (cash or UPI at the door)',
  shop: 'Pay at the shop',
};

export const UTR_PATTERN = /^\d{12}$/;
export const PHONE_PATTERN = /^[6-9]\d{9}$/;
export const PINCODE_PATTERN = /^6\d{5}$/;

export function cleanPhone(raw) {
  let d = String(raw ?? '').replace(/\D/g, '');
  if (d.length === 12 && d.startsWith('91')) d = d.slice(2);
  if (d.length === 11 && d.startsWith('0')) d = d.slice(1);
  return d;
}

// Puducherry UT: 605xxx (Puducherry) and 6096xx (Karaikal).
export function isPuducherryPincode(pin) {
  return /^605\d{3}$/.test(pin) || /^6096\d{2}$/.test(pin);
}

export function pincodeProblem(pin, settings) {
  if (!PINCODE_PATTERN.test(pin)) return 'Enter a valid 6-digit Tamil Nadu or Puducherry pincode.';
  if (!settings.AllowPuducherry && isPuducherryPincode(pin)) return 'Sorry, we deliver only within Tamil Nadu right now.';
  return '';
}

export function deliveryFeeFor({ subtotal, fulfilment, area, settings, delivery = [] }) {
  if (fulfilment !== 'delivery') return 0;
  if (subtotal >= settings.FreeDeliveryAbove && settings.FreeDeliveryAbove > 0) return 0;
  const zone = delivery.find((d) => d.area === area);
  return zone && zone.fee !== null && zone.fee !== undefined ? zone.fee : settings.DeliveryFee;
}

export function paymentOptions({ fulfilment, total, settings }) {
  const opts = ['upi'];
  if (fulfilment === 'pickup') opts.push('shop');
  else if (total <= settings.CODMax) opts.push('cod');
  return opts;
}

const LIMITS = { name: 60, address: 240, landmark: 120, notes: 300, area: 80 };

export function trimTo(s, n) {
  return String(s ?? '').replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, '').trim().slice(0, n);
}

/** Validate checkout form input. Returns { value, errors } with errors keyed by field. */
export function validateCustomer(input, settings) {
  const c = {
    name: trimTo(input.name, LIMITS.name),
    phone: cleanPhone(input.phone),
    fulfilment: input.fulfilment === 'pickup' ? 'pickup' : 'delivery',
    area: trimTo(input.area, LIMITS.area),
    pincode: String(input.pincode ?? '').replace(/\D/g, ''),
    address: trimTo(input.address, LIMITS.address),
    landmark: trimTo(input.landmark, LIMITS.landmark),
    notes: trimTo(input.notes, LIMITS.notes),
  };
  const errors = {};
  if (c.name.length < 2) errors.name = 'Please enter your name.';
  if (!PHONE_PATTERN.test(c.phone)) errors.phone = 'Enter a 10-digit mobile number.';
  if (c.fulfilment === 'pickup' && !settings.PickupEnabled) errors.fulfilment = 'Store pickup is not available right now.';
  if (c.fulfilment === 'delivery') {
    if (!c.area) errors.area = 'Choose your area.';
    const p = pincodeProblem(c.pincode, settings);
    if (p) errors.pincode = p;
    if (c.address.length < 8) errors.address = 'Please enter your full address (door no., street, village).';
    if (c.landmark.length < 3) errors.landmark = 'A nearby landmark helps us find you.';
  } else {
    c.area = '';
    c.pincode = '';
    c.address = '';
    c.landmark = '';
  }
  return { value: c, errors };
}

export function formatDateIST(isoString) {
  const d = isoString ? new Date(isoString) : new Date();
  return new Intl.DateTimeFormat('en-IN', {
    timeZone: 'Asia/Kolkata',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(d);
}

export function lineLabel(l) {
  return [l.brand, l.name, l.size, l.flavour].filter(Boolean).join(' – ');
}

/**
 * The WhatsApp message the customer sends to the shop.
 * order: { id, created, lines:[{brand,name,size,flavour,qty,price,lineTotal}], subtotal, deliveryFee, total, method, customer }
 */
export function buildWhatsAppText(order, shop, { utr = '', notSaved = false } = {}) {
  const c = order.customer || {};
  const out = [];
  out.push(notSaved ? `*Order ${order.id} – NOT SAVED, please confirm*` : `*New order ${order.id}*`);
  out.push(`${shop.name} · ${formatDateIST(order.created)}`);
  out.push('');
  out.push('*Items*');
  order.lines.forEach((l, i) => {
    out.push(`${i + 1}. ${lineLabel(l)} × ${l.qty} = ${formatINR(l.lineTotal ?? l.price * l.qty)}`);
  });
  out.push('');
  out.push(`Subtotal: ${formatINR(order.subtotal)}`);
  out.push(c.fulfilment === 'pickup' ? 'Delivery: Store pickup' : `Delivery: ${order.deliveryFee ? formatINR(order.deliveryFee) : 'Free'}`);
  out.push(`*Total: ${formatINR(order.total)}*`);
  out.push('');
  out.push('*Customer*');
  out.push(`Name: ${c.name}`);
  out.push(`Phone: ${c.phone}`);
  if (c.fulfilment === 'pickup') {
    out.push('Pickup from shop');
  } else {
    out.push(`Area: ${c.area}${c.pincode ? ' – ' + c.pincode : ''}`);
    out.push(`Address: ${c.address}`);
    if (c.landmark) out.push(`Landmark: ${c.landmark}`);
  }
  if (c.notes) out.push(`Notes: ${c.notes}`);
  out.push('');
  out.push(`*Payment:* ${PAYMENT_LABELS[order.method] || order.method} – Pending`);
  if (order.method === 'upi') {
    out.push(utr ? `UTR: ${utr}` : 'UTR: (sending payment screenshot)');
  }
  return out.join('\n');
}

/**
 * Phase 1 (no prices on the site): the product list the customer sends on WhatsApp.
 * lines: [{ id, brand, name, size, flavour, qty }]. No customer details - the shop sees them in WhatsApp.
 */
export function buildOrderListText(lines, shop) {
  const out = [`Hi ${shop.name}, I would like to order:`, ''];
  lines.forEach((l, i) => out.push(`${i + 1}. ${lineLabel(l)} × ${l.qty} (${l.id})`));
  out.push('', 'Please confirm the price and availability.');
  return out.join('\n');
}

export function whatsappLink(number, text) {
  const n = String(number).replace(/\D/g, '');
  return `https://wa.me/${n}${text ? '?text=' + encodeURIComponent(text) : ''}`;
}

export function upiLink({ vpa, payee, amount, note }) {
  const p = new URLSearchParams({ pa: vpa, pn: payee, am: Number(amount).toFixed(2), cu: 'INR', tn: note });
  return `upi://pay?${p.toString().replace(/\+/g, '%20')}`;
}

// Legal Metrology unit sale price: per g/ml below 1 kg/1 L, per kg/L at or above; per unit for counts.
export function unitPrice(price, netQty, unit) {
  if (!(price > 0) || !(netQty > 0)) return '';
  const u = String(unit || '').toLowerCase();
  const two = (n) => '₹' + n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (u === 'g' || u === 'ml') {
    if (netQty >= 1000) return `${two((price / netQty) * 1000)}/${u === 'g' ? 'kg' : 'L'}`;
    return `${two(price / netQty)}/${u}`;
  }
  if (u === 'kg' || u === 'l') return `${two(price / netQty)}/${u === 'kg' ? 'kg' : 'L'}`;
  if (u) return `${two(price / netQty)}/${u.replace(/s$/, '')}`;
  return '';
}

export function percentOff(price, mrp) {
  if (!(mrp > price) || !(price > 0)) return 0;
  return Math.round(((mrp - price) / mrp) * 100);
}
