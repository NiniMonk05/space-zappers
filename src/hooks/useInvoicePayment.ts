import { useState, useEffect, useCallback, useRef } from 'react';

interface CreateInvoiceResponse {
  invoice: string;
  paymentHash: string;
  expiresAt: number;
}

interface UseInvoicePaymentOptions {
  apiBase?: string;
  onPaid?: () => void;
}

interface UseInvoicePaymentReturn {
  createInvoice: (amountSats: number) => Promise<string>;
  invoice: string | null;
  paymentHash: string | null;
  isPaid: boolean;
  isPolling: boolean;
  error: string | null;
  reset: () => void;
}

type StatusResult = 'paid' | 'unpaid' | 'gone' | 'retry';

interface PollSession {
  hash: string;
  deadline: number;
  cancelled: boolean;
  inFlight: boolean;
  delay: number;
  timer: ReturnType<typeof setTimeout> | null;
}

export const POLL_INTERVAL_MS = 2000;
export const MAX_BACKOFF_MS = 30000;
const FALLBACK_WINDOW_MS = 10 * 60 * 1000;

async function readError(response: Response, fallback: string): Promise<string> {
  try {
    const data = await response.json();
    return typeof data?.error === 'string' ? data.error : fallback;
  } catch {
    return fallback;
  }
}

// Creates invoices via the score service (/api/invoice) and polls it for payment; the LNbits key stays server-side.
export function useInvoicePayment({
  apiBase = '/api',
  onPaid,
}: UseInvoicePaymentOptions = {}): UseInvoicePaymentReturn {
  const [invoice, setInvoice] = useState<string | null>(null);
  const [paymentHash, setPaymentHash] = useState<string | null>(null);
  const [isPaid, setIsPaid] = useState(false);
  const [isPolling, setIsPolling] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const sessionRef = useRef<PollSession | null>(null);
  const onPaidRef = useRef(onPaid);

  useEffect(() => {
    onPaidRef.current = onPaid;
  }, [onPaid]);

  const stopPolling = useCallback(() => {
    const session = sessionRef.current;
    if (session) {
      session.cancelled = true;
      if (session.timer) clearTimeout(session.timer);
      sessionRef.current = null;
    }
    setIsPolling(false);
  }, []);

  useEffect(() => stopPolling, [stopPolling]);

  const checkStatus = useCallback(async (hash: string): Promise<StatusResult> => {
    try {
      const response = await fetch(`${apiBase}/invoice/${hash}`);
      if (response.status === 404) return 'gone';
      if (response.status === 429 || response.status >= 500) return 'retry';
      if (!response.ok) return 'gone';
      const data = await response.json();
      return data.paid === true ? 'paid' : 'unpaid';
    } catch (err) {
      console.warn('[Payment] Error checking status:', err);
      return 'retry';
    }
  }, [apiBase]);

  const poll = useCallback(async (session: PollSession) => {
    if (session.cancelled || session.inFlight) return;
    if (Date.now() >= session.deadline) {
      stopPolling();
      return;
    }
    if (session.timer) {
      clearTimeout(session.timer);
      session.timer = null;
    }
    session.inFlight = true;
    const result = await checkStatus(session.hash);
    session.inFlight = false;
    if (session.cancelled) return;

    if (result === 'paid') {
      stopPolling();
      setIsPaid(true);
      onPaidRef.current?.();
      return;
    }
    if (result === 'gone') {
      stopPolling();
      return;
    }
    session.delay = result === 'retry' ? Math.min(session.delay * 2, MAX_BACKOFF_MS) : POLL_INTERVAL_MS;
    session.timer = setTimeout(() => void poll(session), session.delay);
  }, [checkStatus, stopPolling]);

  // Mobile browsers throttle timers while the player is in their wallet app, so check as soon as the tab is visible again
  useEffect(() => {
    const onVisible = () => {
      const session = sessionRef.current;
      if (document.visibilityState === 'visible' && session) void poll(session);
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [poll]);

  const startPolling = useCallback((hash: string, expiresAt: number) => {
    stopPolling();
    const deadline = Number.isFinite(expiresAt) && expiresAt > Date.now() ? expiresAt : Date.now() + FALLBACK_WINDOW_MS;
    const session: PollSession = { hash, deadline, cancelled: false, inFlight: false, delay: POLL_INTERVAL_MS, timer: null };
    sessionRef.current = session;
    setIsPolling(true);
    session.timer = setTimeout(() => void poll(session), POLL_INTERVAL_MS);
  }, [poll, stopPolling]);

  const createInvoice = useCallback(async (amountSats: number): Promise<string> => {
    setError(null);
    setIsPaid(false);

    try {
      const response = await fetch(`${apiBase}/invoice`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount: amountSats }),
      });
      if (!response.ok) {
        throw new Error(await readError(response, 'Failed to create invoice'));
      }
      const data: CreateInvoiceResponse = await response.json();
      if (!data.invoice || !data.paymentHash) {
        throw new Error('No invoice returned');
      }

      setInvoice(data.invoice);
      setPaymentHash(data.paymentHash);
      startPolling(data.paymentHash, data.expiresAt);

      return data.invoice;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to create invoice';
      setError(message);
      throw err;
    }
  }, [apiBase, startPolling]);

  const reset = useCallback(() => {
    stopPolling();
    setInvoice(null);
    setPaymentHash(null);
    setIsPaid(false);
    setError(null);
  }, [stopPolling]);

  return {
    createInvoice,
    invoice,
    paymentHash,
    isPaid,
    isPolling,
    error,
    reset,
  };
}
