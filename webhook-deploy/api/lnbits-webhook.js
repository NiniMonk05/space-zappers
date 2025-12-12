/**
 * LNbits Webhook Handler for Space Zapper
 * Deploy this to Vercel as a serverless function
 */

import { finalizeEvent, generateSecretKey, getPublicKey } from 'nostr-tools';
import { SimplePool } from 'nostr-tools/pool';

// Get configuration from environment variables
const WEBHOOK_SECRET_KEY = process.env.WEBHOOK_SECRET_KEY 
  ? Buffer.from(process.env.WEBHOOK_SECRET_KEY, 'hex')
  : generateSecretKey();

const RELAYS = process.env.NOSTR_RELAYS 
  ? process.env.NOSTR_RELAYS.split(',')
  : [
      'wss://relay.ditto.pub',
      'wss://relay.nostr.band',
      'wss://relay.damus.io'
    ];

const PAYMENT_CONFIRMATION_KIND = 8550;

export default async function handler(req, res) {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // Handle OPTIONS request
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // Only accept POST requests
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const payment = req.body;
    
    console.log('[Webhook] Received payment:', {
      paid: payment.paid,
      amount: payment.amount,
      comment: payment.comment,
    });

    // Extract payment details from LNbits webhook
    const { 
      payment_hash,
      payment_request,
      amount,
      comment,
      paid
    } = payment;

    // Only process paid invoices
    if (!paid) {
      console.log('[Webhook] Invoice not paid, ignoring');
      return res.status(200).json({ status: 'pending' });
    }

    // Extract payment ID from comment
    const paymentIdMatch = comment?.match(/szap_\d+_[a-z0-9]+/);
    const paymentId = paymentIdMatch ? paymentIdMatch[0] : null;

    if (!paymentId) {
      console.log('[Webhook] No payment ID in comment:', comment);
      return res.status(200).json({ status: 'no_payment_id' });
    }

    console.log('[Webhook] Payment confirmed:', paymentId);

    // Create Nostr event confirming payment
    const event = {
      kind: PAYMENT_CONFIRMATION_KIND,
      created_at: Math.floor(Date.now() / 1000),
      content: JSON.stringify({
        paymentId,
        invoice: payment_request,
        status: 'paid',
        amount,
        preimage: payment_hash,
        timestamp: Date.now(),
      }),
      tags: [
        ['t', 'space-zapper-payment'],
        ['payment-id', paymentId],
        ['status', 'paid'],
        ['alt', `Space Zapper payment confirmed: ${paymentId}`],
      ],
    };

    // Sign the event
    const signedEvent = finalizeEvent(event, WEBHOOK_SECRET_KEY);
    
    console.log('[Webhook] Publishing to Nostr:', signedEvent.id);

    // Publish to Nostr relays
    const pool = new SimplePool();
    const publishPromises = pool.publish(RELAYS, signedEvent);
    
    // Wait for at least one relay to confirm (with timeout)
    await Promise.race([
      Promise.race(publishPromises),
      new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 5000))
    ]).catch(err => {
      console.error('[Webhook] Publish error:', err);
    });
    
    pool.close(RELAYS);

    console.log('[Webhook] Success!');
    
    return res.status(200).json({ 
      status: 'published',
      paymentId,
      eventId: signedEvent.id,
      relays: RELAYS.length
    });

  } catch (error) {
    console.error('[Webhook] Error:', error);
    return res.status(500).json({ 
      error: 'Internal server error',
      message: error.message 
    });
  }
}
