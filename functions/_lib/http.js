// Small helpers shared by the Pages Functions in functions/api/.

export function json(body, status = 200, headers = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers },
  });
}

export function fail(error, message, status = 400, details) {
  return json({ ok: false, error, message, ...(details === undefined ? {} : { details }) }, status);
}

// Browsers always send Origin on a fetch() POST. Reject posts from other sites.
export function sameOrigin(request, env) {
  const origin = request.headers.get('Origin');
  if (!origin) return false;
  const self = new URL(request.url).origin;
  const extra = String(env.ALLOWED_ORIGINS || '').split(',').map((s) => s.trim()).filter(Boolean);
  return origin === self || extra.includes(origin);
}

// Reads a JSON body, refusing anything larger than maxBytes.
export async function readJson(request, maxBytes) {
  const len = Number(request.headers.get('Content-Length') || 0);
  if (len > maxBytes) return { error: 'too_large' };
  const text = await request.text();
  if (text.length > maxBytes) return { error: 'too_large' };
  try {
    return { body: JSON.parse(text) };
  } catch {
    return { error: 'bad_json' };
  }
}

export function safeEqual(a, b) {
  const x = new TextEncoder().encode(String(a ?? ''));
  const y = new TextEncoder().encode(String(b ?? ''));
  let diff = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i++) diff |= (x[i] ?? 0) ^ (y[i] ?? 0);
  return diff === 0 && x.length > 0;
}

// Optional Cloudflare Turnstile check. Skipped when TURNSTILE_SECRET is not set.
export async function turnstileOk(env, token, ip) {
  if (!env.TURNSTILE_SECRET) return true;
  if (!token || typeof token !== 'string') return false;
  const form = new FormData();
  form.append('secret', env.TURNSTILE_SECRET);
  form.append('response', token);
  if (ip) form.append('remoteip', ip);
  try {
    const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', { method: 'POST', body: form });
    const out = await res.json();
    return out.success === true;
  } catch {
    return true; // Turnstile itself is down: let the order through, the sheet rules still apply
  }
}
