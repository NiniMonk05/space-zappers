import { useState, useEffect, useRef } from 'react';
import { useNostr } from '@nostrify/react';
import { validatePaymentConfirmation, PAYMENT_CONFIRMATION_KIND } from '@/lib/paymentVerification';

interface PaymentConfirmationOptions {
  paymentId: string | null;
  onConfirmed?: () => void;
}

/**
 * Hook to listen for payment confirmation events on Nostr
 * Subscribes to payment confirmation events and calls onConfirmed when payment is detected
 */
export function usePaymentConfirmation({ paymentId, onConfirmed }: PaymentConfirmationOptions) {
  const [isConfirmed, setIsConfirmed] = useState(false);
  const [confirmationEvent, setConfirmationEvent] = useState<any>(null);
  const { nostr } = useNostr();
  const abortControllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!paymentId || isConfirmed) {
      return;
    }

    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    const subscribe = async () => {
      try {
        // Subscribe to payment confirmation events using async iteration
        const events = nostr.req(
          [
            {
              kinds: [PAYMENT_CONFIRMATION_KIND],
              '#payment-id': [paymentId],
              '#status': ['paid'],
              since: Math.floor(Date.now() / 1000) - 300, // Last 5 minutes
            },
          ],
          { signal: abortController.signal }
        );

        for await (const msg of events) {
          if (abortController.signal.aborted) break;

          if (msg[0] === 'EVENT') {
            const event = msg[2];
            // Validate the event
            if (validatePaymentConfirmation(event)) {
              console.log('Payment confirmed via Nostr event:', event);
              setIsConfirmed(true);
              setConfirmationEvent(event);

              if (onConfirmed) {
                onConfirmed();
              }
              break;
            }
          }
        }
      } catch (error) {
        if (error instanceof Error && error.name === 'AbortError') {
          // Expected when component unmounts
          return;
        }
        console.error('Error subscribing to payment confirmations:', error);
      }
    };

    subscribe();

    return () => {
      abortController.abort();
    };
  }, [paymentId, isConfirmed, nostr, onConfirmed]);

  return {
    isConfirmed,
    confirmationEvent,
  };
}
