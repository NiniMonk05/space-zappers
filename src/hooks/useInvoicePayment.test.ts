import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useInvoicePayment, POLL_INTERVAL_MS } from './useInvoicePayment';

const HASH = 'a'.repeat(64);

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

function setVisibility(state: 'visible' | 'hidden') {
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => state });
  document.dispatchEvent(new Event('visibilitychange'));
}

type StatusReply = { status: number; body: unknown } | Promise<Response>;

function mockApi(statusReplies: StatusReply[], expiresInMs = 10 * 60 * 1000) {
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    if (init?.method === 'POST') {
      return jsonResponse(200, { invoice: 'lnbc210n1test', paymentHash: HASH, expiresAt: Date.now() + expiresInMs });
    }
    const next = statusReplies.length > 1 ? statusReplies.shift()! : statusReplies[0];
    return next instanceof Promise ? next : jsonResponse(next.status, next.body);
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

const statusCalls = (fetchMock: ReturnType<typeof vi.fn>) =>
  fetchMock.mock.calls.filter(([url]) => String(url).startsWith('/api/invoice/')).length;

async function advance(ms: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

describe('useInvoicePayment', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    setVisibility('visible');
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('creates the invoice without a memo and polls until paid', async () => {
    const fetchMock = mockApi([{ status: 200, body: { paid: false } }, { status: 200, body: { paid: true } }]);
    const onPaid = vi.fn();
    const { result } = renderHook(() => useInvoicePayment({ onPaid }));

    await act(async () => {
      await result.current.createInvoice(21);
    });
    expect(JSON.parse(fetchMock.mock.calls[0][1]!.body as string)).toEqual({ amount: 21 });
    expect(result.current.isPolling).toBe(true);

    await advance(POLL_INTERVAL_MS);
    expect(onPaid).not.toHaveBeenCalled();
    await advance(POLL_INTERVAL_MS);
    expect(onPaid).toHaveBeenCalledOnce();
    expect(result.current.isPaid).toBe(true);
    expect(result.current.isPolling).toBe(false);
  });

  it('stops polling at the server-provided expiry', async () => {
    const fetchMock = mockApi([{ status: 200, body: { paid: false } }], 5 * POLL_INTERVAL_MS);
    const { result } = renderHook(() => useInvoicePayment());
    await act(async () => {
      await result.current.createInvoice(21);
    });
    await advance(20 * POLL_INTERVAL_MS);
    expect(result.current.isPolling).toBe(false);
    expect(statusCalls(fetchMock)).toBeLessThanOrEqual(5);
  });

  it('checks immediately when the tab becomes visible again', async () => {
    const fetchMock = mockApi([{ status: 200, body: { paid: true } }]);
    const onPaid = vi.fn();
    const { result } = renderHook(() => useInvoicePayment({ onPaid }));
    await act(async () => {
      await result.current.createInvoice(21);
    });
    expect(statusCalls(fetchMock)).toBe(0);

    await act(async () => {
      setVisibility('visible');
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(statusCalls(fetchMock)).toBe(1);
    expect(onPaid).toHaveBeenCalledOnce();
  });

  it('does not start a second request while one is in flight', async () => {
    let release: (r: Response) => void = () => {};
    const pending = new Promise<Response>((resolve) => { release = resolve; });
    const fetchMock = mockApi([pending, { status: 200, body: { paid: false } }]);
    const { result } = renderHook(() => useInvoicePayment());
    await act(async () => {
      await result.current.createInvoice(21);
    });
    await advance(POLL_INTERVAL_MS);
    await act(async () => {
      setVisibility('visible');
      setVisibility('visible');
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(statusCalls(fetchMock)).toBe(1);
    await act(async () => {
      release(jsonResponse(200, { paid: false }));
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(result.current.isPolling).toBe(true);
  });

  it('backs off on 429 and 5xx, and stops on 404', async () => {
    const fetchMock = mockApi([
      { status: 429, body: {} },
      { status: 502, body: {} },
      { status: 404, body: {} },
    ]);
    const { result } = renderHook(() => useInvoicePayment());
    await act(async () => {
      await result.current.createInvoice(21);
    });
    await advance(POLL_INTERVAL_MS);
    expect(statusCalls(fetchMock)).toBe(1);
    await advance(POLL_INTERVAL_MS * 2 - 1);
    expect(statusCalls(fetchMock)).toBe(1);
    await advance(1);
    expect(statusCalls(fetchMock)).toBe(2);
    await advance(POLL_INTERVAL_MS * 4);
    expect(statusCalls(fetchMock)).toBe(3);
    expect(result.current.isPolling).toBe(false);
  });

  it('cancels polling on reset', async () => {
    const fetchMock = mockApi([{ status: 200, body: { paid: false } }]);
    const { result } = renderHook(() => useInvoicePayment());
    await act(async () => {
      await result.current.createInvoice(21);
    });
    act(() => result.current.reset());
    await advance(10 * POLL_INTERVAL_MS);
    expect(statusCalls(fetchMock)).toBe(0);
  });
});
