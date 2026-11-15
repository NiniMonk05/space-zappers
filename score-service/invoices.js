// Server-side LNbits invoice creation and payment-status lookup; the invoice key never leaves this process.

const HASH_RE = /^[0-9a-f]{64}$/;

export class InvoiceError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

// Fixed-window counter per key; cheap abuse bound for a public endpoint, not a security boundary.
export function createRateLimiter({ limit, windowMs, now = Date.now, maxKeys = 10000 }) {
  const hits = new Map();
  return function allow(key) {
    const t = now();
    let entry = hits.get(key);
    if (!entry || t - entry.start >= windowMs) {
      if (!entry && hits.size >= maxKeys) {
        for (const [k, v] of hits) if (t - v.start >= windowMs) hits.delete(k);
        if (hits.size >= maxKeys) return false;
      }
      entry = { start: t, count: 0 };
      hits.set(key, entry);
    }
    entry.count += 1;
    return entry.count <= limit;
  };
}

// trustedHops = proxies in front of this service (inner nginx + host reverse proxy = 2); entries left of them are client-supplied and ignored.
export function clientIp(forwardedFor, remoteAddress, trustedHops = 2) {
  const chain = (forwardedFor || '').split(',').map((s) => s.trim()).filter(Boolean);
  chain.push(remoteAddress || 'unknown');
  const index = Math.max(0, chain.length - 1 - trustedHops);
  return chain[index];
}

function cleanMemo(memo, fallback) {
  if (memo === undefined || memo === null) return fallback;
  if (typeof memo !== 'string') throw new InvoiceError(400, 'memo must be a string');
  const cleaned = memo.replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, 100);
  return cleaned || fallback;
}

export function createInvoiceService({
  lnbitsUrl,
  invoiceKey,
  fetchImpl = globalThis.fetch,
  now = Date.now,
  minSats = 1,
  maxSats = 1000,
  expirySeconds = 900,
  maxTracked = 5000,
  perIpCreatePerMin = 10,
  globalCreatePerMin = 120,
  perIpStatusPerMin = 120,
  defaultMemo = 'Space Zappers',
  timeoutMs = 10000,
} = {}) {
  const configured = Boolean(lnbitsUrl && invoiceKey);
  const base = (lnbitsUrl || '').replace(/\/+$/, '');
  const trackMs = (expirySeconds + 300) * 1000;
  const issued = new Map();
  const ipCreate = createRateLimiter({ limit: perIpCreatePerMin, windowMs: 60000, now });
  const allCreate = createRateLimiter({ limit: globalCreatePerMin, windowMs: 60000, now });
  const ipStatus = createRateLimiter({ limit: perIpStatusPerMin, windowMs: 60000, now });

  function requireConfigured() {
    if (!configured) throw new InvoiceError(503, 'Invoice service is not configured');
  }

  function pruneIssued() {
    const t = now();
    for (const [hash, entry] of issued) if (entry.expiresAt <= t) issued.delete(hash);
  }

  async function lnbits(path, init = {}) {
    try {
      return await fetchImpl(`${base}${path}`, {
        ...init,
        headers: { 'X-Api-Key': invoiceKey, 'Content-Type': 'application/json' },
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (err) {
      console.error('LNbits request failed:', err.message);
      throw new InvoiceError(502, 'Lightning backend unavailable');
    }
  }

  async function create(body, ip) {
    requireConfigured();
    const amount = body?.amount;
    if (!Number.isInteger(amount) || amount < minSats || amount > maxSats) {
      throw new InvoiceError(400, `amount must be an integer between ${minSats} and ${maxSats} sats`);
    }
    const memo = cleanMemo(body?.memo, defaultMemo);
    if (!ipCreate(ip) || !allCreate('*')) throw new InvoiceError(429, 'Too many invoices, try again shortly');
    pruneIssued();
    if (issued.size >= maxTracked) throw new InvoiceError(503, 'Too many open invoices, try again shortly');

    const res = await lnbits('/api/v1/payments', {
      method: 'POST',
      body: JSON.stringify({ out: false, amount, memo, expiry: expirySeconds }),
    });
    if (!res.ok) {
      console.error('LNbits create invoice failed with status', res.status);
      throw new InvoiceError(502, 'Failed to create invoice');
    }
    const data = await res.json();
    const invoice = data.bolt11 || data.payment_request;
    const paymentHash = typeof data.payment_hash === 'string' ? data.payment_hash.toLowerCase() : '';
    if (!invoice || !HASH_RE.test(paymentHash)) throw new InvoiceError(502, 'Unexpected response from Lightning backend');

    issued.set(paymentHash, { expiresAt: now() + trackMs, paid: false });
    return { invoice, paymentHash };
  }

  async function status(hash, ip) {
    requireConfigured();
    const paymentHash = String(hash || '').toLowerCase();
    if (!HASH_RE.test(paymentHash)) throw new InvoiceError(400, 'Invalid payment hash');
    if (!ipStatus(ip)) throw new InvoiceError(429, 'Too many status checks, slow down');
    const entry = issued.get(paymentHash);
    if (!entry || entry.expiresAt <= now()) throw new InvoiceError(404, 'Unknown or expired invoice');
    if (entry.paid) return { paid: true };

    const res = await lnbits(`/api/v1/payments/${paymentHash}`);
    if (!res.ok) {
      console.error('LNbits status check failed with status', res.status);
      throw new InvoiceError(502, 'Failed to check payment status');
    }
    const data = await res.json();
    const paid = data.paid === true || data.status === 'success';
    if (paid) entry.paid = true;
    return { paid };
  }

  return { configured, create, status };
}
