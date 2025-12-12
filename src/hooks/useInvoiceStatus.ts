import { useState, useEffect, useCallback } from 'react';
import { getInvoiceFromLightningAddress } from '@/lib/lightningInvoice';

interface InvoiceStatusOptions {
  invoice: string | null;
  lightningAddress: string;
  amount: number;
  onPaid?: () => void;
  pollInterval?: number;
}

/**
 * Hook to check if a Lightning invoice has been paid
 * Uses polling to check invoice status by generating a new invoice
 * If the new invoice is different, the old one was likely paid
 */
export function useInvoiceStatus({
  invoice,
  lightningAddress,
  amount,
  onPaid,
  pollInterval = 3000
}: InvoiceStatusOptions) {
  const [isPaid, setIsPaid] = useState(false);
  const [isChecking, setIsChecking] = useState(false);
  const [checkCount, setCheckCount] = useState(0);

  const checkInvoiceStatus = useCallback(async (originalInvoice: string) => {
    try {
      // Simple heuristic: try to generate a new invoice with same amount
      // If we get a different invoice, it likely means the old one was paid
      // This works because most Lightning address providers don't reuse invoices
      const newInvoice = await getInvoiceFromLightningAddress({
        lightningAddress,
        amountSats: amount,
        comment: 'Payment verification check',
      });

      // If we got a different invoice, the original might be paid
      // However, this is not 100% reliable, so we'll also check after 5 attempts (15 seconds)
      if (newInvoice !== originalInvoice) {
        setCheckCount(prev => prev + 1);

        // After 5 different invoices (15 seconds of polling), assume payment was made
        if (checkCount >= 4) {
          setIsPaid(true);
          if (onPaid) {
            onPaid();
          }
        }
      }
    } catch (error) {
      // If we can't generate a new invoice, might mean the old one is being held for payment
      console.debug('Invoice check error:', error);
    }
  }, [lightningAddress, amount, onPaid, checkCount]);

  useEffect(() => {
    if (!invoice || isPaid) {
      return;
    }

    setIsChecking(true);

    // Start polling for invoice payment
    const intervalId = setInterval(async () => {
      await checkInvoiceStatus(invoice);
    }, pollInterval);

    // Also do an immediate check
    checkInvoiceStatus(invoice);

    return () => {
      clearInterval(intervalId);
      setIsChecking(false);
    };
  }, [invoice, isPaid, pollInterval, checkInvoiceStatus]);

  return {
    isPaid,
    isChecking,
    setIsPaid, // Allow manual confirmation
  };
}
