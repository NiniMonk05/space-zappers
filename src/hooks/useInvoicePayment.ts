import { useState, useEffect, useCallback, useRef } from 'react';

interface CreateInvoiceResponse {
  invoice: string;
  paymentHash: string;
}

interface UseInvoicePaymentOptions {
  apiBase?: string;
  onPaid?: () => void;
}

interface UseInvoicePaymentReturn {
  createInvoice: (amountSats: number, memo?: string) => Promise<string>;
  invoice: string | null;
  paymentHash: string | null;
  isPaid: boolean;
  isPolling: boolean;
  error: string | null;
  reset: () => void;
}

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
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onPaidRef = useRef(onPaid);

  useEffect(() => {
    onPaidRef.current = onPaid;
  }, [onPaid]);

  const stopPolling = useCallback(() => {
    if (pollingRef.current) {
      clearInterval(pollingRef.current);
      pollingRef.current = null;
    }
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    setIsPolling(false);
  }, []);

  useEffect(() => stopPolling, [stopPolling]);

  // Returns true when paid, false when unpaid, null when polling should stop (unknown/expired invoice)
  const checkPaymentStatus = useCallback(async (hash: string): Promise<boolean | null> => {
    try {
      const response = await fetch(`${apiBase}/invoice/${hash}`);
      if (response.status === 404) return null;
      if (!response.ok) {
        console.warn('[Payment] Status check failed:', response.status);
        return false;
      }
      const data = await response.json();
      return data.paid === true;
    } catch (err) {
      console.warn('[Payment] Error checking status:', err);
      return false;
    }
  }, [apiBase]);

  const startPolling = useCallback((hash: string) => {
    stopPolling();
    setIsPolling(true);

    pollingRef.current = setInterval(async () => {
      const paid = await checkPaymentStatus(hash);
      if (paid === null) {
        stopPolling();
        return;
      }
      if (paid) {
        stopPolling();
        setIsPaid(true);
        onPaidRef.current?.();
      }
    }, 2000);

    // Stop polling after 10 minutes
    timeoutRef.current = setTimeout(stopPolling, 10 * 60 * 1000);
  }, [checkPaymentStatus, stopPolling]);

  const createInvoice = useCallback(async (amountSats: number, memo?: string): Promise<string> => {
    setError(null);
    setIsPaid(false);

    try {
      const response = await fetch(`${apiBase}/invoice`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount: amountSats, memo }),
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
      startPolling(data.paymentHash);

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
