import { describe, it, expect, vi } from 'vitest';
import { createInvoiceService, createRateLimiter, clientIp, intEnv, rateKey, InvoiceError } from './invoices.js';

const HASH = 'a'.repeat(64);
const KEY = 'test-invoice-key';
const URL_BASE = 'https://bank.example';

function fakeLnbits({ paid = false, createStatus = 201, badJson = false } = {}) {
  return vi.fn(async (url, init = {}) => {
    const json = badJson ? async () => { throw new SyntaxError('Unexpected token <'); } : null;
    if (init.method === 'POST') {
      return { ok: createStatus < 300, status: createStatus, json: json || (async () => ({ payment_hash: HASH, bolt11: 'lnbc210n1test' })) };
    }
    return { ok: true, status: 200, json: json || (async () => ({ paid })) };
  });
}

function service(opts = {}) {
  return createInvoiceService({ lnbitsUrl: URL_BASE, invoiceKey: KEY, fetchImpl: fakeLnbits(), ...opts });
}

async function expectError(promise, status) {
  const err = await promise.catch((e) => e);
  expect(err).toBeInstanceOf(InvoiceError);
  expect(err.status).toBe(status);
}

describe('createInvoiceService', () => {
  it('creates an invoice with the server-side key and returns invoice, hash and expiry', async () => {
    const fetchImpl = fakeLnbits();
    const svc = createInvoiceService({ lnbitsUrl: `${URL_BASE}/`, invoiceKey: KEY, fetchImpl, now: () => 1000, expirySeconds: 600 });
    const result = await svc.create({ amount: 21 }, '1.2.3.4');
    expect(result).toEqual({ invoice: 'lnbc210n1test', paymentHash: HASH, expiresAt: 1000 + 600 * 1000, expiresIn: 600 });
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe(`${URL_BASE}/api/v1/payments`);
    expect(init.headers['X-Api-Key']).toBe(KEY);
    expect(JSON.parse(init.body)).toEqual({ out: false, amount: 21, memo: 'Space Zappers - 21 sats to play', expiry: 600 });
    expect(JSON.stringify(result)).not.toContain(KEY);
  });

  it('defaults to exactly 21 sats and rejects anything else without calling LNbits', async () => {
    const fetchImpl = fakeLnbits();
    const svc = service({ fetchImpl });
    for (const amount of [20, 22, 0, -5, 2.5, '21', undefined]) {
      await expectError(svc.create({ amount }, 'ip'), 400);
    }
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('honours a configured amount range', async () => {
    const svc = service({ minSats: 1, maxSats: 100 });
    await expect(svc.create({ amount: 100 }, 'ip')).resolves.toBeTruthy();
    await expectError(svc.create({ amount: 101 }, 'ip'), 400);
  });

  it('ignores a client-supplied memo', async () => {
    const fetchImpl = fakeLnbits();
    await service({ fetchImpl }).create({ amount: 21, memo: 'buy my scam coin' }, 'ip');
    expect(JSON.parse(fetchImpl.mock.calls[0][1].body).memo).toBe('Space Zappers - 21 sats to play');
  });

  it('returns 503 when not configured', async () => {
    const svc = createInvoiceService({ lnbitsUrl: '', invoiceKey: '' });
    expect(svc.configured).toBe(false);
    await expectError(svc.create({ amount: 21 }, 'ip'), 503);
    await expectError(svc.status(HASH, 'ip'), 503);
  });

  it('maps LNbits failures, outages and non-JSON bodies to 502', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    await expectError(service({ fetchImpl: fakeLnbits({ createStatus: 401 }) }).create({ amount: 21 }, 'ip'), 502);
    await expectError(service({ fetchImpl: async () => { throw new Error('ECONNREFUSED'); } }).create({ amount: 21 }, 'ip'), 502);
    await expectError(service({ fetchImpl: fakeLnbits({ badJson: true }) }).create({ amount: 21 }, 'ip'), 502);
    for (const call of errorSpy.mock.calls) expect(call.some((a) => a instanceof Error)).toBe(false);
    errorSpy.mockRestore();
  });

  it('maps a non-JSON status response to 502', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const good = fakeLnbits();
    const bad = fakeLnbits({ badJson: true });
    const svc = service({ fetchImpl: (url, init) => (init?.method === 'POST' ? good(url, init) : bad(url, init)) });
    await svc.create({ amount: 21 }, 'ip');
    await expectError(svc.status(HASH, 'ip'), 502);
    errorSpy.mockRestore();
  });

  it('throttles invoice creation per IP, and per /64 for IPv6', async () => {
    const svc = service({ perIpCreatePerMin: 2 });
    await svc.create({ amount: 21 }, 'a');
    await svc.create({ amount: 21 }, 'a');
    await expectError(svc.create({ amount: 21 }, 'a'), 429);
    await expect(svc.create({ amount: 21 }, 'b')).resolves.toBeTruthy();
    await svc.create({ amount: 21 }, '2001:db8:1:2::1');
    await svc.create({ amount: 21 }, '2001:db8:1:2:ffff::9');
    await expectError(svc.create({ amount: 21 }, '2001:db8:1:2:abcd:1:2:3'), 429);
  });

  it('only reports status for invoices it issued, and caches paid', async () => {
    const fetchImpl = fakeLnbits({ paid: true });
    const svc = service({ fetchImpl });
    await expectError(svc.status(HASH, 'ip'), 404);
    await expectError(svc.status('not-a-hash', 'ip'), 400);
    await svc.create({ amount: 21 }, 'ip');
    await expect(svc.status(HASH.toUpperCase(), 'ip')).resolves.toEqual({ paid: true });
    const calls = fetchImpl.mock.calls.length;
    await expect(svc.status(HASH, 'ip')).resolves.toEqual({ paid: true });
    expect(fetchImpl.mock.calls.length).toBe(calls);
    expect(fetchImpl.mock.calls[1][0]).toBe(`${URL_BASE}/api/v1/payments/${HASH}`);
  });

  it('does not spend status budget on unknown hashes', async () => {
    const svc = service({ perIpStatusPerMin: 1 });
    for (let i = 0; i < 5; i++) await expectError(svc.status('b'.repeat(64), 'ip'), 404);
    await svc.create({ amount: 21 }, 'ip');
    await expect(svc.status(HASH, 'ip')).resolves.toEqual({ paid: false });
    await expectError(svc.status(HASH, 'ip'), 429);
  });

  it('forgets invoices after expiry plus grace', async () => {
    let t = 0;
    const svc = service({ now: () => t, expirySeconds: 60 });
    await svc.create({ amount: 21 }, 'ip');
    await expect(svc.status(HASH, 'ip')).resolves.toEqual({ paid: false });
    t = 10 * 60 * 1000;
    await expectError(svc.status(HASH, 'ip'), 404);
  });
});

describe('intEnv', () => {
  const quiet = { warn: () => {} };
  it('falls back for unset or empty values (compose passes "" for unset vars)', () => {
    expect(intEnv('X', 21, { env: {} })).toBe(21);
    expect(intEnv('X', 21, { env: { X: '' } })).toBe(21);
    expect(intEnv('X', 21, { env: { X: '  ' } })).toBe(21);
  });
  it('parses valid integers', () => {
    expect(intEnv('X', 21, { env: { X: ' 50 ' } })).toBe(50);
    expect(intEnv('X', 2, { env: { X: '0' } })).toBe(0);
  });
  it('rejects garbage, fractions and values below min with a warning', () => {
    const warn = vi.fn();
    expect(intEnv('X', 21, { env: { X: 'abc' }, warn })).toBe(21);
    expect(intEnv('X', 21, { env: { X: '2.5' }, ...quiet })).toBe(21);
    expect(intEnv('X', 21, { env: { X: '12abc' }, ...quiet })).toBe(21);
    expect(intEnv('X', 21, { env: { X: '0' }, min: 1, ...quiet })).toBe(21);
    expect(warn).toHaveBeenCalledOnce();
  });
  it('accepts plain digits only', () => {
    for (const X of ['+5', '-5', '1e3', '0x10', '5.0', '1_000']) {
      expect(intEnv('X', 21, { env: { X }, ...quiet })).toBe(21);
    }
  });
  it('enforces max (e.g. PORT <= 65535)', () => {
    const warn = vi.fn();
    expect(intEnv('PORT', 3002, { env: { PORT: '65535' }, min: 1, max: 65535, warn })).toBe(65535);
    expect(intEnv('PORT', 3002, { env: { PORT: '65536' }, min: 1, max: 65535, warn })).toBe(3002);
    expect(intEnv('PORT', 3002, { env: { PORT: '99999999999999999999' }, min: 1, max: 65535, warn })).toBe(3002);
    expect(warn).toHaveBeenCalledTimes(2);
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

describe('rateKey', () => {
  it('keys IPv4 and IPv4-mapped addresses by address', () => {
    expect(rateKey('203.0.113.7')).toBe('203.0.113.7');
    expect(rateKey('::ffff:203.0.113.7')).toBe('203.0.113.7');
  });
  it('keys IPv6 by /64', () => {
    expect(rateKey('2001:db8:1:2::1')).toBe('2001:db8:1:2::/64');
    expect(rateKey('2001:0db8:0001:0002:aaaa:bbbb:cccc:dddd')).toBe('2001:db8:1:2::/64');
    expect(rateKey('2001:db8::1')).toBe('2001:db8:0:0::/64');
    expect(rateKey('::1')).toBe('0:0:0:0::/64');
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
