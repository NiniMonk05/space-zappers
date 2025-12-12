import { useState, useEffect } from 'react';
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

  useEffect(() => {
    if (!paymentId || isConfirmed) {
      return;
    }

    let subscription: any;
    let isActive = true;

    const subscribe = async () => {
      try {
        // Subscribe to payment confirmation events
        subscription = nostr.req(
          [
            {
              kinds: [PAYMENT_CONFIRMATION_KIND],
              '#payment-id': [paymentId],
              '#status': ['paid'],
              since: Math.floor(Date.now() / 1000) - 300, // Last 5 minutes
            },
          ],
          {
            onevent: (event) => {
              if (!isActive) return;

              // Validate the event
              if (validatePaymentConfirmation(event)) {
                console.log('Payment confirmed via Nostr event:', event);
                setIsConfirmed(true);
                setConfirmationEvent(event);
                
                if (onConfirmed) {
                  onConfirmed();
                }
              }
            },
            oneose: () => {
              // End of stored events
            },
          }
        );
      } catch (error) {
        console.error('Error subscribing to payment confirmations:', error);
      }
    };

    subscribe();

    return () => {
      isActive = false;
      if (subscription) {
        subscription.close();
      }
    };
  }, [paymentId, isConfirmed, nostr, onConfirmed]);

  return {
    isConfirmed,
    confirmationEvent,
  };
}
