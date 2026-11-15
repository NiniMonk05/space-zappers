import { describe, it, expect, vi } from 'vitest';
import { createInvoiceService, createRateLimiter, clientIp, InvoiceError } from './invoices.js';

const HASH = 'a'.repeat(64);
const KEY = 'test-invoice-key';

function fakeLnbits({ paid = false, createStatus = 201 } = {}) {
  return vi.fn(async (url, init = {}) => {
    if (init.method === 'POST') {
      return { ok: createStatus < 300, status: createStatus, json: async () => ({ payment_hash: HASH, bolt11: 'lnbc210n1test' }) };
    }
    return { ok: true, status: 200, json: async () => ({ paid }) };
  });
}

async function expectError(promise, status) {
  const err = await promise.catch((e) => e);
  expect(err).toBeInstanceOf(InvoiceError);
  expect(err.status).toBe(status);
}

describe('createInvoiceService', () => {
  it('creates an invoice with the server-side key and returns only invoice + hash', async () => {
    const fetchImpl = fakeLnbits();
    const svc = createInvoiceService({ lnbitsUrl: 'https://bank.example/', invoiceKey: KEY, fetchImpl });
    const result = await svc.create({ amount: 21, memo: 'Space Zappers - 21 sats' }, '1.2.3.4');
    expect(result).toEqual({ invoice: 'lnbc210n1test', paymentHash: HASH });
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe('https://bank.example/api/v1/payments');
    expect(init.headers['X-Api-Key']).toBe(KEY);
    expect(JSON.parse(init.body)).toMatchObject({ out: false, amount: 21, memo: 'Space Zappers - 21 sats' });
    expect(JSON.stringify(result)).not.toContain(KEY);
  });

  it('rejects out-of-range or non-integer amounts without calling LNbits', async () => {
    const fetchImpl = fakeLnbits();
    const svc = createInvoiceService({ lnbitsUrl: 'https://bank.example', invoiceKey: KEY, fetchImpl, maxSats: 1000 });
    for (const amount of [0, -5, 1001, 2.5, '21', undefined]) {
      await expectError(svc.create({ amount }, 'ip'), 400);
    }
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('sanitises and bounds the memo', async () => {
    const fetchImpl = fakeLnbits();
    const svc = createInvoiceService({ lnbitsUrl: 'https://bank.example', invoiceKey: KEY, fetchImpl });
    await svc.create({ amount: 21, memo: `hi\n${'x'.repeat(500)}` }, 'ip');
    const memo = JSON.parse(fetchImpl.mock.calls[0][1].body).memo;
    expect(memo.length).toBe(100);
    expect(memo).not.toMatch(/\n/);
    await expectError(svc.create({ amount: 21, memo: 42 }, 'ip'), 400);
  });

  it('returns 503 when not configured', async () => {
    const svc = createInvoiceService({ lnbitsUrl: '', invoiceKey: '' });
    expect(svc.configured).toBe(false);
    await expectError(svc.create({ amount: 21 }, 'ip'), 503);
    await expectError(svc.status(HASH, 'ip'), 503);
  });

  it('maps LNbits failures to 502', async () => {
    const svc = createInvoiceService({ lnbitsUrl: 'https://bank.example', invoiceKey: KEY, fetchImpl: fakeLnbits({ createStatus: 401 }) });
    await expectError(svc.create({ amount: 21 }, 'ip'), 502);
    const down = createInvoiceService({ lnbitsUrl: 'https://bank.example', invoiceKey: KEY, fetchImpl: async () => { throw new Error('ECONNREFUSED'); } });
    await expectError(down.create({ amount: 21 }, 'ip'), 502);
  });

  it('throttles invoice creation per IP', async () => {
    const svc = createInvoiceService({ lnbitsUrl: 'https://bank.example', invoiceKey: KEY, fetchImpl: fakeLnbits(), perIpCreatePerMin: 2 });
    await svc.create({ amount: 21 }, 'a');
    await svc.create({ amount: 21 }, 'a');
    await expectError(svc.create({ amount: 21 }, 'a'), 429);
    await expect(svc.create({ amount: 21 }, 'b')).resolves.toBeTruthy();
  });

  it('only reports status for invoices it issued, and caches paid', async () => {
    const fetchImpl = fakeLnbits({ paid: true });
    const svc = createInvoiceService({ lnbitsUrl: 'https://bank.example', invoiceKey: KEY, fetchImpl });
    await expectError(svc.status(HASH, 'ip'), 404);
    await expectError(svc.status('not-a-hash', 'ip'), 400);
    await svc.create({ amount: 21 }, 'ip');
    await expect(svc.status(HASH.toUpperCase(), 'ip')).resolves.toEqual({ paid: true });
    const calls = fetchImpl.mock.calls.length;
    await expect(svc.status(HASH, 'ip')).resolves.toEqual({ paid: true });
    expect(fetchImpl.mock.calls.length).toBe(calls);
    expect(fetchImpl.mock.calls[1][0]).toBe(`https://bank.example/api/v1/payments/${HASH}`);
  });

  it('forgets invoices after expiry', async () => {
    let t = 0;
    const svc = createInvoiceService({ lnbitsUrl: 'https://bank.example', invoiceKey: KEY, fetchImpl: fakeLnbits(), now: () => t, expirySeconds: 60 });
    await svc.create({ amount: 21 }, 'ip');
    await expect(svc.status(HASH, 'ip')).resolves.toEqual({ paid: false });
    t = 10 * 60 * 1000;
    await expectError(svc.status(HASH, 'ip'), 404);
  });
});

describe('createRateLimiter', () => {
  it('resets after the window', () => {
    let t = 0;
    const allow = createRateLimiter({ limit: 1, windowMs: 1000, now: () => t });
    expect(allow('k')).toBe(true);
    expect(allow('k')).toBe(false);
    t = 1000;
    expect(allow('k')).toBe(true);
  });
});

describe('clientIp', () => {
  it('takes the address added by the outermost trusted proxy', () => {
    expect(clientIp('203.0.113.7, 172.18.0.5', '127.0.0.1', 2)).toBe('203.0.113.7');
  });
  it('ignores client-spoofed X-Forwarded-For entries', () => {
    expect(clientIp('6.6.6.6, 203.0.113.7, 172.18.0.5', '127.0.0.1', 2)).toBe('203.0.113.7');
  });
  it('falls back to the socket address without proxies', () => {
    expect(clientIp(undefined, '127.0.0.1', 2)).toBe('127.0.0.1');
  });
});
