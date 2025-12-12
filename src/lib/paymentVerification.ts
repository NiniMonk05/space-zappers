/**
 * Payment Verification System
 * Uses Nostr events to verify Lightning payments from LNbits webhooks
 */

import type { NostrEvent } from '@nostrify/nostrify';

// Custom kind for payment confirmations
export const PAYMENT_CONFIRMATION_KIND = 8550;

/**
 * Generate a unique payment ID for tracking
 * This should be included in the invoice comment/memo
 */
export function generatePaymentId(): string {
  return `szap_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`;
}

/**
 * Create payment tracking event
 * Published when user requests an invoice
 */
export function createPaymentTrackingEvent(paymentId: string, invoice: string) {
  return {
    kind: PAYMENT_CONFIRMATION_KIND,
    content: JSON.stringify({
      paymentId,
      invoice,
      status: 'pending',
      timestamp: Date.now(),
    }),
    tags: [
      ['t', 'space-zapper-payment'],
      ['payment-id', paymentId],
      ['status', 'pending'],
      ['alt', `Space Zapper payment tracking: ${paymentId}`],
    ],
  };
}

/**
 * Validate payment confirmation event
 */
export function validatePaymentConfirmation(event: NostrEvent): boolean {
  if (event.kind !== PAYMENT_CONFIRMATION_KIND) return false;

  try {
    const content = JSON.parse(event.content);
    const paymentId = event.tags.find(([name]) => name === 'payment-id')?.[1];
    const status = event.tags.find(([name]) => name === 'status')?.[1];

    return !!(
      content.paymentId &&
      paymentId &&
      status === 'paid' &&
      content.preimage
    );
  } catch {
    return false;
  }
}

/**
 * Extract payment ID from invoice comment
 */
export function extractPaymentIdFromComment(comment: string): string | null {
  const match = comment.match(/szap_\d+_[a-z0-9]+/);
  return match ? match[0] : null;
}
