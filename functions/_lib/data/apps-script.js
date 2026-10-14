// Data module backed by the Google Apps Script web app (see docs/api-contract.md).
// Every call returns the script's JSON: { ok: true, ... } or { ok: false, error, message, details }.

export function createStore(env) {
  async function call(action, data, timeoutMs = 30000) {
    if (!env.APPS_SCRIPT_URL || !env.APPS_SCRIPT_KEY) {
      return { ok: false, error: 'not_configured', message: 'APPS_SCRIPT_URL / APPS_SCRIPT_KEY are not set.' };
    }
    let res;
    try {
      // Apps Script answers a POST with a 302 to the result; fetch follows it as a GET.
      res = await fetch(env.APPS_SCRIPT_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({ key: env.APPS_SCRIPT_KEY, action, data }),
        redirect: 'follow',
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (e) {
      return { ok: false, error: 'upstream_down', message: e.name === 'TimeoutError' ? 'Google did not answer in time.' : 'Could not reach Google.' };
    }
    const text = await res.text();
    try {
      const body = JSON.parse(text);
      if (body && typeof body.ok === 'boolean') return body;
    } catch {
      // fall through
    }
    return { ok: false, error: 'upstream_down', message: `Unexpected answer from Google (HTTP ${res.status}).` };
  }

  return {
    getCatalog: () => call('catalog', {}, 60000),
    createOrder: (input) => call('createOrder', input),
    attachPaymentRef: ({ orderId, token, utr }) => call('attachUtr', { orderId, token, utr }),
    notifyOrder: (orderId) => call('notify', { orderId }),
  };
}
